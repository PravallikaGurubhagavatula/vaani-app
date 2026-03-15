// ── FIREBASE CONFIG ──
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, query, where, orderBy }
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

// ── CURRENT USER ──
let currentUser = null;

// ── AUTH STATE LISTENER ──
onAuthStateChanged(auth, (user) => {
  currentUser = user;
  if (user) {
    document.getElementById('loginBtn').style.display = 'none';
    document.getElementById('userProfile').style.display = 'flex';
    document.getElementById('userAvatar').src = user.photoURL || 'https://ui-avatars.com/api/?name=' + user.displayName;
    document.getElementById('userName').textContent = user.displayName;
  } else {
    document.getElementById('loginBtn').style.display = 'block';
    document.getElementById('userProfile').style.display = 'none';
  }
});

// ── GOOGLE SIGN IN ──
window.signInWithGoogle = async function () {
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    console.error("Login error:", err);
    alert("Login failed. Please try again.");
  }
};

// ── SIGN OUT ──
window.signOutUser = async function () {
  try {
    await signOut(auth);
    closeProfileMenu();
  } catch (err) {
    console.error("Logout error:", err);
  }
};

// ── SAVE TRANSLATION TO HISTORY ──
window.saveToHistory = async function (original, translated, fromLang, toLang) {
  if (!currentUser) return; // only save if logged in
  try {
    await addDoc(collection(db, "history"), {
      uid: currentUser.uid,
      original,
      translated,
      fromLang,
      toLang,
      timestamp: new Date()
    });
  } catch (err) {
    console.error("Error saving history:", err);
  }
};

// ── SAVE TO FAVOURITES ──
window.saveToFavourites = async function (original, translated, fromLang, toLang) {
  if (!currentUser) {
    alert("Please sign in to save favourites!");
    return;
  }
  try {
    await addDoc(collection(db, "favourites"), {
      uid: currentUser.uid,
      original,
      translated,
      fromLang,
      toLang,
      timestamp: new Date()
    });
    showToast("⭐ Saved to Favourites!");
  } catch (err) {
    console.error("Error saving favourite:", err);
  }
};

// ── LOAD HISTORY ──
window.loadHistory = async function () {
  if (!currentUser) {
    document.getElementById('historyList').innerHTML = '<p class="empty-msg">Sign in to see your history</p>';
    return;
  }
  try {
    const q = query(
      collection(db, "history"),
      where("uid", "==", currentUser.uid),
      orderBy("timestamp", "desc")
    );
    const snapshot = await getDocs(q);
    const list = document.getElementById('historyList');
    if (snapshot.empty) {
      list.innerHTML = '<p class="empty-msg">No history yet. Start translating!</p>';
      return;
    }
    list.innerHTML = '';
    snapshot.forEach(docSnap => {
      const d = docSnap.data();
      list.innerHTML += `
        <div class="history-item">
          <div class="history-langs">${d.fromLang} → ${d.toLang}</div>
          <div class="history-original">${d.original}</div>
          <div class="history-translated">${d.translated}</div>
          <div class="history-actions">
            <button onclick="saveToFavourites('${d.original}','${d.translated}','${d.fromLang}','${d.toLang}')">⭐ Favourite</button>
            <button onclick="deleteHistoryItem('${docSnap.id}')">🗑 Delete</button>
          </div>
        </div>`;
    });
  } catch (err) {
    console.error("Error loading history:", err);
  }
};

// ── LOAD FAVOURITES ──
window.loadFavourites = async function () {
  if (!currentUser) {
    document.getElementById('favouritesList').innerHTML = '<p class="empty-msg">Sign in to see your favourites</p>';
    return;
  }
  try {
    const q = query(
      collection(db, "favourites"),
      where("uid", "==", currentUser.uid),
      orderBy("timestamp", "desc")
    );
    const snapshot = await getDocs(q);
    const list = document.getElementById('favouritesList');
    if (snapshot.empty) {
      list.innerHTML = '<p class="empty-msg">No favourites yet. Star a translation!</p>';
      return;
    }
    list.innerHTML = '';
    snapshot.forEach(docSnap => {
      const d = docSnap.data();
      list.innerHTML += `
        <div class="history-item favourite-item">
          <div class="history-langs">⭐ ${d.fromLang} → ${d.toLang}</div>
          <div class="history-original">${d.original}</div>
          <div class="history-translated">${d.translated}</div>
          <div class="history-actions">
            <button onclick="deleteFavouriteItem('${docSnap.id}')">🗑 Remove</button>
          </div>
        </div>`;
    });
  } catch (err) {
    console.error("Error loading favourites:", err);
  }
};

// ── DELETE HISTORY ITEM ──
window.deleteHistoryItem = async function (id) {
  try {
    await deleteDoc(doc(db, "history", id));
    loadHistory();
  } catch (err) {
    console.error("Error deleting:", err);
  }
};

// ── DELETE FAVOURITE ITEM ──
window.deleteFavouriteItem = async function (id) {
  try {
    await deleteDoc(doc(db, "favourites", id));
    loadFavourites();
  } catch (err) {
    console.error("Error deleting:", err);
  }
};

// ── PROFILE MENU TOGGLE ──
window.toggleProfileMenu = function () {
  const menu = document.getElementById('profileMenu');
  menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
};

window.closeProfileMenu = function () {
  const menu = document.getElementById('profileMenu');
  if (menu) menu.style.display = 'none';
};

// ── EXPOSE currentUser for app.js ──
window.getCurrentUser = function () { return currentUser; };