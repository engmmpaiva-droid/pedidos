# Controle de Pedidos

## Propósito
App para controlar pedidos de compra (ex.: materiais de obra) — o que foi pedido, quando, prazo de entrega, se já chegou e onde foi usado. Pensado para uso pessoal/pequena equipe, com acesso pelo celular e pelo computador.

## Stack
- HTML + CSS + JavaScript puro, tudo em um único arquivo `index.html` (sem build, sem framework, sem dependências instaladas).
- Persistência local via `localStorage` (chave `pedidos_v1`), funciona offline.
- Sincronização em nuvem via **Firebase** (Auth com e-mail/senha + Firestore), carregado por CDN (`firebase-app-compat`, `firebase-auth-compat`, `firebase-firestore-compat`, `firebase-messaging-compat`, versão 10.12.2). Projeto Firebase: `pedidos-bio-86b47`.
- **Notificações push (FCM)**: `firebase-messaging-sw.js` (service worker na raiz) + tokens salvos em `dados/{uid}/tokens/{token}` no Firestore.
- **Cloud Functions** (`functions/index.js`, Node 20, Functions v2 + Admin SDK) — backend que hoje só existe para as duas funções de notificação abaixo. Deploy via Firebase CLI (`firebase deploy --only functions,firestore:rules`), exige o projeto estar no plano **Blaze**.
- `firestore.rules` restringe cada usuário a ler/escrever só os próprios dados (`dados/{uid}` e subcoleção `tokens`).
- Backup/restauração manual via exportação/importação de arquivo `.json`.

## Estrutura de dados de uma obra
Cada obra é um objeto no array `obras` (chave `localStorage` `obras_v1`, campo `obras` no Firestore):

```js
{
  id: string,      // "geral" para a obra padrão criada na migração; "obra-"+Date.now() para as demais
  nome: string,
  criadoEm: number
}
```

A obra atualmente selecionada (`obraAtualId`) fica em `localStorage["obra_atual_v1"]`, só no aparelho (não sincroniza — cada dispositivo pode estar "olhando" uma obra diferente).

## Estrutura de dados de um pedido
Cada pedido é um objeto no array `pedidos`:

```js
{
  id: number,          // Date.now() no momento da criação
  obraId: string,       // obra à qual o pedido pertence; fixado na criação, não muda ao editar
  descricao: string,   // obrigatório
  quantidade: string,
  unidade: string,
  fornecedor: string,
  valor: string,
  local: string,        // onde foi usado (autocomplete com locais já cadastrados NA MESMA obra)
  dataPedido: string,   // "YYYY-MM-DD", obrigatório
  prazoDias: string,    // dias corridos a partir de dataPedido, obrigatório
  obs: string,
  entregue: boolean,
  dataEntrega: string|null,   // "YYYY-MM-DD", preenchido ao confirmar entrega
  notifHojeEnviada: boolean,   // true depois que a Cloud Function avisou "entrega hoje" (evita reenviar todo dia)
  notifAtrasoEnviada: boolean  // true depois que a Cloud Function avisou "atrasado" (evita reenviar todo dia)
}
```

`notifHojeEnviada`/`notifAtrasoEnviada` são escritos só pela Cloud Function `verificarPrazos`. O cliente os reseta para `false` quando a data/prazo do pedido muda (edição) ou quando um pedido entregue é reaberto — ver `functions/index.js` e os pontos correspondentes em `index.html`.

Compatibilidade retroativa: registros antigos podem ter um campo `previsao` (data direta) em vez de `prazoDias`. As funções `dataEntregaPrev()` e `prazoDe()` tratam os dois formatos. Pedidos que predatam o conceito de obra (sem `obraId`) são migrados automaticamente (função `migrarDados()`) para uma obra "Geral" criada com id fixo `"geral"` — roda no início do app e a cada snapshot do Firestore, cobrindo tanto dados locais quanto contas antigas na nuvem.

## Funcionalidades já implementadas
- **Obras**: pedidos são separados por obra (estilo Sieng). Seletor fixo no topo (dropdown no header) mostra a obra atual; resumo, lista, filtros, busca e autocomplete de "local" consideram só a obra selecionada. Botões para criar (➕), renomear (✏️) e excluir (🗑️) a obra atual. Excluir uma obra sem pedidos usa confirmação simples; excluir uma obra COM pedidos faz exclusão em cascata (obra + todos os pedidos dela) mas exige reautenticação com a senha da conta (`firebase.auth.EmailAuthProvider` + `reauthenticateWithCredential`) — se o app estiver em modo local/offline sem login, pede para digitar o nome exato da obra como confirmação alternativa.
- **Cadastro/edição** de pedidos com formulário completo (descrição, quantidade+unidade, fornecedor, valor, local de uso, data do pedido, prazo em dias, observações).
- **Status calculado automaticamente**: Entregue / Atrasado (com nº de dias) / Entrega hoje / Faltam N dias.
- **Resumo** no topo: Total, Pendentes, Atrasados, Entregues.
- **Filtros** por chip: Todos / Pendentes / Atrasados / Entregues.
- **Busca** por texto (descrição, fornecedor, local, observações).
- **Ordenação** configurável: padrão (atrasados primeiro), previsão mais próxima, data do pedido (asc/desc), nome (A-Z/Z-A), local de uso.
- **Marcar como entregue** via modal que pede a data real da entrega (valida que não seja anterior à data do pedido) e calcula quantos dias o pedido levou.
- **Reabrir**, **editar** e **excluir** pedidos.
- **Backup manual**: exporta todos os pedidos como `.json`; **Restaurar** a partir de um arquivo de backup (com confirmação antes de substituir dados existentes).
- **Login e cadastro (Firebase Auth)**: entrar por e-mail/senha, ou criar conta nova pelo próprio app (link "Criar uma conta" na tela de login — fica público, qualquer pessoa com a URL pode se cadastrar).
- **Sincronização em nuvem (Firebase)**: sincronização em tempo real entre dispositivos via Firestore (`onSnapshot`), persistência offline do Firestore, migração automática dos dados locais para a nuvem no primeiro login, indicador de status de sincronização (☁️ Sincronizado / ⚠️ Offline / 📴 Local / ⚠️ Erro de sync), botão de logout.
- **Notificações push reais** (funcionam com o app fechado): ao cadastrar um pedido novo, os outros aparelhos logados na mesma conta recebem um aviso (Cloud Function `onNovoPedido`); todo dia às 08:00 (horário de Brasília) a Cloud Function `verificarPrazos` avisa sobre pedidos que vencem hoje ou estão atrasados, sem repetir o aviso todo dia para o mesmo pedido.
- Layout responsivo (mobile-friendly).

## Notificações: status do deploy
Tudo concluído — as duas Cloud Functions estão ativas em produção:
1. ✅ Projeto `pedidos-bio-86b47` no plano **Blaze**.
2. ✅ Firebase CLI instalada/logada, projeto vinculado via `.firebaserc`.
3. ✅ Chave **VAPID** gerada e colada em `index.html` (constante `VAPID_KEY`).
4. ✅ `onNovoPedido` (região `southamerica-east1`) e `verificarPrazos` (região `us-central1`) implantadas via `firebase deploy --only functions,firestore:rules`. Política de limpeza de imagens de container configurada nas duas regiões (`firebase functions:artifacts:setpolicy`).

### Atenção: `npm install`/deploy não funciona direto na pasta do Drive
A pasta do projeto fica dentro de um drive virtual do Google Drive Desktop (`G:\Meu Drive\...`), que não é um disco NTFS de verdade — `npm install` dentro de `functions/` falha ali (erros `EPERM`/`EBADF`/`ENOTEMPTY` do `tar`, e nem symlink/junction funciona nesse drive). Para reinstalar dependências ou rodar `firebase deploy` no futuro (ex.: depois de editar `functions/index.js` ou `functions/package.json`), use uma pasta de staging em disco local:

```
xcopy /E /I /Y "G:\Meu Drive\Engenharia\Claude\pedidos\functions" "%LOCALAPPDATA%\pedidos-deploy-stage\functions"
copy /Y "G:\Meu Drive\Engenharia\Claude\pedidos\firebase.json" "%LOCALAPPDATA%\pedidos-deploy-stage\"
copy /Y "G:\Meu Drive\Engenharia\Claude\pedidos\.firebaserc" "%LOCALAPPDATA%\pedidos-deploy-stage\"
copy /Y "G:\Meu Drive\Engenharia\Claude\pedidos\firestore.rules" "%LOCALAPPDATA%\pedidos-deploy-stage\"
cd "%LOCALAPPDATA%\pedidos-deploy-stage\functions" && npm install
cd "%LOCALAPPDATA%\pedidos-deploy-stage" && firebase deploy --only functions,firestore:rules
```

A pasta `G:\...\pedidos` continua sendo a fonte da verdade do código (é o que fica versionado no git); `%LOCALAPPDATA%\pedidos-deploy-stage` é só uma área de trabalho temporária para instalar/implantar.

## Próximos passos
- (em aberto — anotar aqui as próximas ideias/tarefas)
