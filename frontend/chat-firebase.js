/* ================================================================
   Vaani — chat-firebase.js  v3  (FIXED)

   ROOT CAUSE OF BUG:
   ─────────────────────────────────────────────────────────────────
   The previous version created a NAMED Firebase app ("vaani-chat")
   with its own separate Auth instance. This meant Firestore
   security rules saw request.auth == null even though the user was
   signed in — because sign-in happened on the DEFAULT app's auth,
   not the named app's auth.

   FIX:
   ─────────────────────────────────────────────────────────────────
   Use the DEFAULT Firebase app for Firestore. The existing
   firebase.js (ESM) already signed the user in on the default app,
   so Firestore rules will correctly see request.auth != null.
================================================================ */

(function () {
  "use strict";

  if (window.chatFirebase) return;

  var FIREBASE_CONFIG = {
    apiKey:            "AIzaSyDZrSK8N_Lv_x7YK5xV7S8hc8DPNoc_ImA",
    authDomain:        "vaani-app-ee1a8.firebaseapp.com",
    projectId:         "vaani-app-ee1a8",
    storageBucket:     "vaani-app-ee1a8.firebasestorage.app",
    messagingSenderId: "509015461995",
    appId:             "1:509015461995:web:2dd658cef15d05d851612e",
  };

  function _init() {
    try {
      if (typeof firebase === "undefined") {
        console.error("[Vaani Chat] Firebase compat SDK not loaded. Check script tags in index.html.");
        return;
      }

      // ── Use the DEFAULT app so auth state is shared with firebase.js ──
      var defaultApp;
      try {
        defaultApp = firebase.app(); // reuse existing default app
      } catch (e) {
        defaultApp = firebase.initializeApp(FIREBASE_CONFIG); // first init
      }

      var db   = defaultApp.firestore();
      var auth = defaultApp.auth();

      window.chatFirebase = { app: defaultApp, db: db, auth: auth };

      console.log("[Vaani Chat] Firebase initialized ✓ (default app, auth shared)");

    } catch (err) {
      console.error("[Vaani Chat] Firebase init failed:", err.message);
    }
  }

  // Poll until compat SDK is available (loaded via script tag)
  if (typeof firebase !== "undefined") {
    _init();
  } else {
    var _tries = 0;
    var _poll = setInterval(function () {
      _tries++;
      if (typeof firebase !== "undefined") {
        clearInterval(_poll);
        _init();
      } else if (_tries > 30) {
        clearInterval(_poll);
        console.error("[Vaani Chat] Firebase compat SDK never loaded after 6s.");
      }
    }, 200);
  }

})();
