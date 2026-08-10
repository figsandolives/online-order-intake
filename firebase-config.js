(function initializeOrderingFirebase() {
  const firebaseConfig = {
    apiKey: "AIzaSyA0XQJ9fqlWeYQ5NV4CT6GdxvM_Uztnoio",
    authDomain: "menassafigs.firebaseapp.com",
    databaseURL: "https://menassafigs-default-rtdb.firebaseio.com",
    projectId: "menassafigs",
    storageBucket: "menassafigs.firebasestorage.app",
    messagingSenderId: "260400277192",
    appId: "1:260400277192:web:de209362fdbe86e5d827fd"
  };
  const appName = "online-order-tracker";
  const app = window.firebase.apps.find(candidate => candidate.name === appName) || window.firebase.initializeApp(firebaseConfig, appName);
  window.ORDERING_FIREBASE = Object.freeze({ app, auth: window.firebase.auth(app), database: window.firebase.database(app) });
})();
