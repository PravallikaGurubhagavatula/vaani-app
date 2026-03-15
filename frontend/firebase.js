import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, query, where }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDZrSK8N_Lv_x7YK5xV7S8hc8DPNoc_ImA",
  authDomain: "vaani-app-ee1a8.firebaseapp.com",
  projectId: "vaani-app-ee1a8",
  storageBucket: "vaani-app-ee1a8.firebasestorage.app",
  messagingSenderId: "509015461995",
  appId: "1:509015461995:web:2dd658cef15d05d851612e"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();
let currentUser = null;

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  if (user) {
    // Show user in menu
    document.getElementById('menuUser').style.display = 'flex';
    document.getElementById('menuAvatar').src = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName)}&background=7c3aed&color=fff`;
    document.getElementById('menuUserName').textContent = user.displayName;
    // Hide sign in card, show sign out
    document.getElementById('menuSigninCard').style.display = 'none';
    document.getElementById('menuSignout').style.display = 'block';
    // Refresh pages if open
    if (document.getElementById('pageHistory').classList.contains('active')) loadHistory();
    if (document.getElementById('pageFavourites').classList.contains('active')) loadFavourites();
  } else {
    document.getElementById('menuUser').style.display = 'none';
    document.getElementById('menuSigninCard').style.display = 'block';
    document.getElementById('menuSignout').style.display = 'none';
  }
});

window.signInWithGoogle = async function () {
  try { await signInWithPopup(auth, provider); }
  catch (err) { console.error(err); alert("Login failed. Please try again."); }
};

window.signOutUser = async function () {
  try { await signOut(auth); }
  catch (err) { console.error(err); }
};

window.saveToHistory = async function (original, translated, fromLang, toLang) {
  if (!currentUser) return;
  try { await addDoc(collection(db, "history"), { uid: currentUser.uid, original, translated, fromLang, toLang, timestamp: Date.now() }); }
  catch (err) { console.error(err); }
};

window.saveToFavourites = async function (original, translated, fromLang, toLang) {
  if (!currentUser) { alert("Please sign in to save favourites!"); return; }
  try {
    await addDoc(collection(db, "favourites"), { uid: currentUser.uid, original, translated, fromLang, toLang, timestamp: Date.now() });
    showToast("Saved to Favourites");
  } catch (err) { console.error(err); }
};

window.loadHistory = async function () {
  const list = document.getElementById('historyList');
  if (!currentUser) {
    list.innerHTML = `<div class="empty-state"><div class="es-icon"><svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div><p class="es-title">Not signed in</p><p class="es-sub">Open the menu and sign in with Google to see your history</p></div>`;
    return;
  }
  list.innerHTML = `<div class="empty-state"><div class="spinner" style="margin:0 auto"></div></div>`;
  try {
    const snapshot = await getDocs(query(collection(db, "history"), where("uid", "==", currentUser.uid)));
    if (snapshot.empty) { list.innerHTML = `<div class="empty-state"><div class="es-icon"><svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div><p class="es-title">No history yet</p><p class="es-sub">Start translating to see your history here</p></div>`; return; }
    const items = [];
    snapshot.forEach(d => items.push({ id: d.id, ...d.data() }));
    items.sort((a, b) => b.timestamp - a.timestamp);
    list.innerHTML = '';
    items.forEach(d => {
      const orig = (d.original||'').replace(/'/g,"&#39;"), trans = (d.translated||'').replace(/'/g,"&#39;");
      list.innerHTML += `<div class="hist-card"><div class="hist-langs">${d.fromLang} → ${d.toLang}</div><div class="hist-orig">${d.original}</div><div class="hist-trans">${d.translated}</div><div class="hist-actions"><button class="hist-btn" onclick="saveToFavourites('${orig}','${trans}','${d.fromLang}','${d.toLang}')"><svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>Save</button><button class="hist-btn del" onclick="deleteHistoryItem('${d.id}')"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>Delete</button></div></div>`;
    });
  } catch (err) { console.error(err); list.innerHTML = `<div class="empty-state"><p class="es-sub">Error loading. Try again.</p></div>`; }
};

window.loadFavourites = async function () {
  const list = document.getElementById('favouritesList');
  if (!currentUser) {
    list.innerHTML = `<div class="empty-state"><div class="es-icon"><svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></div><p class="es-title">Not signed in</p><p class="es-sub">Open the menu and sign in with Google to see your favourites</p></div>`;
    return;
  }
  list.innerHTML = `<div class="empty-state"><div class="spinner" style="margin:0 auto"></div></div>`;
  try {
    const snapshot = await getDocs(query(collection(db, "favourites"), where("uid", "==", currentUser.uid)));
    if (snapshot.empty) { list.innerHTML = `<div class="empty-state"><div class="es-icon"><svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></div><p class="es-title">No favourites yet</p><p class="es-sub">Tap the star after a translation to save it here</p></div>`; return; }
    const items = [];
    snapshot.forEach(d => items.push({ id: d.id, ...d.data() }));
    items.sort((a, b) => b.timestamp - a.timestamp);
    list.innerHTML = '';
    items.forEach(d => {
      list.innerHTML += `<div class="hist-card fav-card"><div class="hist-langs">${d.fromLang} → ${d.toLang}</div><div class="hist-orig">${d.original}</div><div class="hist-trans">${d.translated}</div><div class="hist-actions"><button class="hist-btn del" onclick="deleteFavouriteItem('${d.id}')"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>Remove</button></div></div>`;
    });
  } catch (err) { console.error(err); list.innerHTML = `<div class="empty-state"><p class="es-sub">Error loading. Try again.</p></div>`; }
};

window.deleteHistoryItem = async function (id) {
  try { await deleteDoc(doc(db, "history", id)); loadHistory(); } catch (err) { console.error(err); }
};
window.deleteFavouriteItem = async function (id) {
  try { await deleteDoc(doc(db, "favourites", id)); loadFavourites(); } catch (err) { console.error(err); }
};
window.getCurrentUser = function () { return currentUser; };
