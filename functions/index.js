const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();
const db = getFirestore();
const messaging = getMessaging();

// Envia uma notificação para todos os aparelhos (tokens) do usuário.
// Apaga do Firestore os tokens que o FCM reportar como inválidos/expirados.
async function enviarParaUsuario(uid, notification, data) {
  const tokensSnap = await db.collection("dados").doc(uid).collection("tokens").get();
  if (tokensSnap.empty) return;
  const tokens = tokensSnap.docs.map((d) => d.id);

  const resp = await messaging.sendEachForMulticast({ tokens, notification, data: data || {} });

  const apagar = [];
  resp.responses.forEach((r, i) => {
    if (!r.success) {
      const code = r.error && r.error.code;
      if (
        code === "messaging/registration-token-not-registered" ||
        code === "messaging/invalid-registration-token"
      ) {
        apagar.push(tokensSnap.docs[i].ref.delete());
      }
    }
  });
  if (apagar.length) await Promise.all(apagar);
}

// Data prevista de entrega = dataPedido + prazoDias (dias corridos), em UTC.
function calcDataEntrega(p) {
  if (!p.dataPedido) return null;
  const [y, m, d] = p.dataPedido.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  const dias = parseInt(p.prazoDias, 10);
  if (isNaN(dias)) return null;
  base.setUTCDate(base.getUTCDate() + dias);
  return base;
}
function hojeUTC() {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}

// Notifica quando um pedido novo é cadastrado (avisa os outros aparelhos da mesma conta).
exports.onNovoPedido = onDocumentWritten("dados/{uid}", async (event) => {
  if (!event.data.before.exists) return; // primeira sincronização: não notificar o histórico inteiro

  const uid = event.params.uid;
  const before = event.data.before.data().pedidos || [];
  const after = event.data.after.exists ? event.data.after.data().pedidos || [] : [];

  const idsAntes = new Set(before.map((p) => p.id));
  const novos = after.filter((p) => !idsAntes.has(p.id));
  if (!novos.length) return;

  for (const p of novos) {
    await enviarParaUsuario(
      uid,
      {
        title: "📦 Novo pedido registrado",
        body: p.descricao + (p.fornecedor ? " — " + p.fornecedor : ""),
      },
      { tipo: "novo_pedido", pedidoId: String(p.id) }
    );
  }
});

// Roda 1x por dia e avisa sobre pedidos que vencem hoje ou já estão atrasados.
exports.verificarPrazos = onSchedule(
  { schedule: "every day 08:00", timeZone: "America/Sao_Paulo" },
  async () => {
    const snap = await db.collection("dados").get();
    const hoje = hojeUTC();

    for (const doc of snap.docs) {
      const uid = doc.id;
      const data = doc.data();
      const pedidos = Array.isArray(data.pedidos) ? data.pedidos : [];
      let alterado = false;

      for (const p of pedidos) {
        if (p.entregue) continue;
        const prev = calcDataEntrega(p);
        if (!prev) continue;
        const diffDias = Math.round((prev - hoje) / 86400000);

        if (diffDias === 0 && !p.notifHojeEnviada) {
          await enviarParaUsuario(
            uid,
            { title: "📍 Entrega hoje", body: p.descricao + " está previsto para chegar hoje." },
            { tipo: "entrega_hoje", pedidoId: String(p.id) }
          );
          p.notifHojeEnviada = true;
          alterado = true;
        } else if (diffDias < 0 && !p.notifAtrasoEnviada) {
          await enviarParaUsuario(
            uid,
            {
              title: "⚠️ Pedido atrasado",
              body: p.descricao + " está atrasado (" + -diffDias + (diffDias === -1 ? " dia" : " dias") + ").",
            },
            { tipo: "atrasado", pedidoId: String(p.id) }
          );
          p.notifAtrasoEnviada = true;
          alterado = true;
        }
      }

      if (alterado) {
        await doc.ref.set({ pedidos, atualizadoEm: Date.now() }, { merge: true });
      }
    }
  }
);
