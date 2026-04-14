/* ================================================================
   Vaani — firebase.js

   HOW TO FILL IN YOUR CONFIG:
   1. Go to https://console.firebase.google.com
   2. Select your project (or create one if you haven't)
   3. Click the gear icon ⚙️  → Project Settings
   4. Scroll down to "Your apps" → click your web app (</>)
      (If no web app exists, click "Add app" → Web)
   5. Copy the firebaseConfig object shown there
   6. Paste the 6 values below, replacing "PASTE_YOUR_..." text

   ALSO REQUIRED IN FIREBASE CONSOLE (one-time setup):
   ✅ Authentication → Sign-in method → Google → Enable → Save
   ✅ Authentication → Settings → Authorized domains → Add your domain
      e.g.  vaani-app-ui0z.onrender.com  and  localhost
================================================================ */

import { initializeApp }      from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth,
         GoogleAuthProvider,
         signInWithPopup,
         signOut,
         onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

// ── STEP 1: PASTE YOUR FIREBASE CONFIG VALUES HERE ────────────────

const firebaseConfig = {
  apiKey:            "AIzaSyDZrSK8N_Lv_x7YK5xV7S8hc8DPNoc_ImA",
  authDomain:        "vaani-app-ee1a8.firebaseapp.com",
  projectId:         "vaani-app-ee1a8",
  storageBucket:     "vaani-app-ee1a8.firebasestorage.app",
  messagingSenderId: "509015461995",
  appId:             "1:509015461995:web:2dd658cef15d05d851612e",
};

// ── DO NOT EDIT BELOW THIS LINE ───────────────────────────────────

const app      = initializeApp(firebaseConfig);
const auth     = getAuth(app);
const db       = getFirestore(app);
const storage  = getStorage(app);
const provider = new GoogleAuthProvider();
window.vaaniFirebase = { app, auth, db, storage, config: firebaseConfig };

// Always show account picker so switching accounts is easy
provider.setCustomParameters({ prompt: "select_account" });

// ── onAuthStateChanged — the single source of truth for auth ──────
// Fires automatically on every page load (even if signed out) and on
// every sign-in / sign-out. This is what drives History & Favourites.

onAuthStateChanged(auth, (user) => {
  window._vaaniCurrentUser = user || null;
  window.VAANI_AUTH_READY  = true;

  console.log(
    "[Vaani Auth]",
    user ? `Signed in: ${user.email}` : "Signed out",
    "| AUTH_READY: true"
  );

  // Call app.js handler — guard in case this fires before DOMContentLoaded
  if (typeof window._vaaniOnAuthChange === "function") {
    window._vaaniOnAuthChange(user || null);
  } else {
    window.addEventListener("DOMContentLoaded", () => {
      if (typeof window._vaaniOnAuthChange === "function") {
        window._vaaniOnAuthChange(user || null);
      }
    }, { once: true });
  }
});

// ── SIGN IN ───────────────────────────────────────────────────────

window.signInWithGoogle = async function () {
  try {
    await signInWithPopup(auth, provider);
    // onAuthStateChanged above automatically updates all UI
  } catch (err) {
    // Ignore user closing the popup — not an error
    if (
      err.code === "auth/popup-closed-by-user" ||
      err.code === "auth/cancelled-popup-request"
    ) return;

    // Log full error so you can debug from browser console
    console.error("[Vaani Auth] Sign-in error →", err.code, ":", err.message);

    // Show specific toast message based on error type
    if (typeof window.showToast === "function") {
      if (err.code === "auth/unauthorized-domain") {
        window.showToast("Add this domain to Firebase Console → Auth → Authorized Domains.");
      } else if (err.code === "auth/operation-not-allowed") {
        window.showToast("Enable Google sign-in in Firebase Console → Auth → Sign-in method.");
      } else if (err.code === "auth/configuration-not-found" || err.code === "auth/invalid-api-key") {
        window.showToast("Firebase config error — check your API key in firebase.js.");
      } else if (err.code === "auth/popup-blocked") {
        window.showToast("Popup blocked by browser. Please allow popups for this site.");
      } else {
        window.showToast("Sign-in failed (" + (err.code || "unknown") + "). Check console.");
      }
    }
  }
};

// ── SIGN OUT ──────────────────────────────────────────────────────

window.signOutUser = async function () {
  if (window.__vaaniSignOutPromise) return window.__vaaniSignOutPromise;
  if (typeof window._vaaniPrepareForSignOut === "function") {
    window._vaaniPrepareForSignOut();
  }

  const op = signOut(auth);
  window.__vaaniSignOutPromise = op;

  try {
    await op;
    // onAuthStateChanged fires with null → app.js handles all cleanup
  } catch (err) {
    console.error("[Vaani Auth] Sign-out error →", err.code, ":", err.message);
    if (typeof window.showToast === "function") {
      window.showToast("Sign-out failed. Please try again.");
    }
  } finally {
    window.__vaaniSignOutPromise = null;
  }
};
