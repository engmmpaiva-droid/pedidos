// Service worker que recebe notificações push (FCM) quando o app está fechado ou em segundo plano.
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyDDDLcfA6PqucWR9oZ-_EdD6DAWJsAjvzM",
  authDomain: "pedidos-bio-86b47.firebaseapp.com",
  projectId: "pedidos-bio-86b47",
  storageBucket: "pedidos-bio-86b47.firebasestorage.app",
  messagingSenderId: "231262798809",
  appId: "1:231262798809:web:d0dd4b433ba7a8a8fb0fc8"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload){
  const titulo = (payload.notification && payload.notification.title) || "Controle de Pedidos";
  const opts = {
    body: (payload.notification && payload.notification.body) || "",
    data: payload.data || {}
  };
  self.registration.showNotification(titulo, opts);
});

self.addEventListener("notificationclick", function(event){
  event.notification.close();
  event.waitUntil(clients.openWindow("/"));
});
