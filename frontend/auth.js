/* ================================================================
   Vaani — auth.js  v1.0
   ----------------------------------------------------------------
   Google Sign-In helper using the Firebase COMPAT SDK.
   The compat scripts are already loaded in index.html:
     firebase-app-compat.js
     firebase-auth-compat.js
     firebase-firestore-compat.js

   This file must be loaded AFTER those three compat scripts and
   BEFORE chat.js.

   Usage (from chat.js or anywhere):
     const user = await window.vaaniAuth.signIn();
     const user = window.vaaniAuth.currentUser();
     window.vaaniAuth.onAuthChange(cb);
================================================================ */

(function () {
  "use strict";

  /* ── Wait for compat SDK ──────────────────────────────────────── */
  function _waitForFirebase(cb, tries) {
    tries = tries || 0;
    if (
      typeof firebase !== "undefined" &&
      typeof firebase.app  === "function" &&
      typeof firebase.auth === "function"
    ) {
      cb();
    } else if (tries < 80) {
      setTimeout(function () { _waitForFirebase(cb, tries + 1); }, 50);
    } else {
      console.error("[Vaani Auth] Firebase compat SDK not found.");
    }
  }

  var _auth     = null;
  var _provider = null;

  function _init() {
    /* Re-use or create the "vaani-auth" compat app instance */
    var app;
    try {
      app = firebase.app("vaani-auth");
    } catch (_) {
      app = firebase.initializeApp(
        {
          apiKey:            "AIzaSyDZrSK8N_Lv_x7YK5xV7S8hc8DPNoc_ImA",
          authDomain:        "vaani-app-ee1a8.firebaseapp.com",
          projectId:         "vaani-app-ee1a8",
          storageBucket:     "vaani-app-ee1a8.firebasestorage.app",
          messagingSenderId: "509015461995",
          appId:             "1:509015461995:web:2dd658cef15d05d851612e",
        },
        "vaani-auth"
      );
    }
    _auth     = app.auth();
    _provider = new firebase.auth.GoogleAuthProvider();
    _provider.setCustomParameters({ prompt: "select_account" });
    console.log("[Vaani Auth] auth.js ready ✓");
  }

  /* ── Public API ──────────────────────────────────────────────── */
  window.vaaniAuth = {

    /**
     * signIn()
     * Opens Google sign-in popup. Returns the Firebase User on success.
     * Returns null if user closes the popup (not treated as an error).
     */
    signIn: async function () {
      if (!_auth) { console.error("[Vaani Auth] Not initialised yet."); return null; }
      try {
        var result = await _auth.signInWithPopup(_provider);
        return result.user;
      } catch (err) {
        /* Closed popup — not an error */
        if (
          err.code === "auth/popup-closed-by-user" ||
          err.code === "auth/cancelled-popup-request"
        ) return null;

        console.error("[Vaani Auth] signIn error:", err.code, err.message);
        if (typeof window.showToast === "function") {
          window.showToast("Sign-in failed: " + (err.code || err.message));
        }
        return null;
      }
    },

    /**
     * signOut()
     * Signs the user out. Returns true on success.
     */
    signOut: async function () {
      if (!_auth) return false;
      try {
        await _auth.signOut();
        return true;
      } catch (err) {
        console.error("[Vaani Auth] signOut error:", err.code);
        return false;
      }
    },

    /**
     * currentUser()
     * Returns the currently-signed-in Firebase User, or null.
     * Also checks window._vaaniCurrentUser set by the ESM firebase.js.
     */
    currentUser: function () {
      /* Prefer the ESM firebase.js user (the main app's auth source) */
      if (window._vaaniCurrentUser) return window._vaaniCurrentUser;
      if (_auth) return _auth.currentUser;
      return null;
    },

    /**
     * onAuthChange(callback)
     * Calls callback(user) immediately and on every auth state change.
     * Hooks into the existing _vaaniOnAuthChange pipeline so we don't
     * duplicate listeners.
     */
    onAuthChange: function (cb) {
      /* Immediately fire with current known state */
      if (window.VAANI_AUTH_READY) {
        cb(window._vaaniCurrentUser || null);
      }

      /* Subscribe to future changes via the existing hook */
      var _prev = window._vaaniOnAuthChange;
      window._vaaniOnAuthChange = function (user) {
        if (typeof _prev === "function") _prev(user);
        cb(user || null);
      };
    },
  };

  _waitForFirebase(_init);
  console.log("[Vaani Auth] auth.js loaded ✓");
})();
