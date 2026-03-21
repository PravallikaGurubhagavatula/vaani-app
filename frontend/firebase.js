/* ================================================================
   Vaani — firebase.js
   Auth fix: global AUTH_READY flag, onAuthStateChanged drives all UI.
   
   CONTRACT with app.js:
     window.VAANI_AUTH_READY   — false until Firebase resolves (even if no user)
     window._vaaniCurrentUser  — null | user object
     window._vaaniOnAuthChange(user) — called by this file; app.js implements it
================================================================ */

import { initializeApp }             from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth,
         GoogleAuthProvider,
         signInWithPopup,
         signOut,
         onAuthStateChanged }        from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// ── Firebase config — replace with your real values ───────────────
const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID",
};

const app      = initializeApp(firebaseConfig);
const auth     = getAuth(app);
const provider = new GoogleAuthProvider();

// ── GLOBAL AUTH STATE ─────────────────────────────────────────────
// These are the single source of truth for auth across the whole app.
window.VAANI_AUTH_READY  = false;   // true once Firebase has resolved (login OR no-login)
window._vaaniCurrentUser = null;    // null = signed out, object = signed in

// ── CORE: onAuthStateChanged ──────────────────────────────────────
// Fires once on page load (even if user is not signed in) and again
// on every sign-in / sign-out event. This is the ONLY place that
// sets auth state — no localStorage hacks, no currentUser snapshots.

onAuthStateChanged(auth, (user) => {
  const wasReady = window.VAANI_AUTH_READY;

  window._vaaniCurrentUser = user || null;
  window.VAANI_AUTH_READY  = true;

  console.log("[Vaani Auth] State resolved →",
    user ? `signed in as ${user.email}` : "signed out",
    "| AUTH_READY:", window.VAANI_AUTH_READY
  );

  // Notify app.js. The callback is defined in app.js; guard in case
  // firebase.js loads before app.js finishes executing.
  if (typeof window._vaaniOnAuthChange === "function") {
    window._vaaniOnAuthChange(user || null);
  } else {
    // app.js not ready yet — queue the call for after DOMContentLoaded
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
    // onAuthStateChanged above handles the rest — no manual UI update needed
  } catch (err) {
    if (err.code !== "auth/popup-closed-by-user" && err.code !== "auth/cancelled-popup-request") {
      console.error("[Vaani Auth] Sign-in error:", err.message);
      if (typeof window.showToast === "function") window.showToast("Sign-in failed. Please try again.");
    }
  }
};

// ── SIGN OUT ──────────────────────────────────────────────────────
window.signOutUser = async function () {
  try {
    await signOut(auth);
    // onAuthStateChanged fires with null → app.js cleans up
  } catch (err) {
    console.error("[Vaani Auth] Sign-out error:", err.message);
  }
};
