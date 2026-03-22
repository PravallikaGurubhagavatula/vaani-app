/* ================================================================
   Vaani — chat-firebase.js  v5  DEFINITIVE
   ================================================================

   ROOT CAUSE EXPLAINED:
   ─────────────────────────────────────────────────────────────────
   The existing firebase.js uses the MODULAR ESM SDK (v10):
     import { initializeApp } from "https://...firebase-app.js"

   Our chat needs the COMPAT SDK (v9-compat):
     <script src="firebase-app-compat.js">

   These are TWO COMPLETELY SEPARATE SDK INSTANCES.
   firebase.app() in compat will NEVER see the user signed in
   by the modular ESM firebase.js. They don't share state.

   SOLUTION:
   ─────────────────────────────────────────────────────────────────
   Chat-firebase.js manages its OWN Firebase app ("vaani-chat"),
   its OWN auth instance, and listens for auth state changes
   independently. It does NOT depend on firebase.js at all.

   Both apps (ESM default + compat "vaani-chat") talk to the same
   Firebase project and the same Firestore database — so data is
   shared. Only the SDK instances are separate.
================================================================ */

(function () {
  "use strict";

  if (window.chatFirebase) {
    console.log("[Vaani Chat] Already initialized, skipping.");
    return;
  }

  var CONFIG = {
    apiKey:            "AIzaSyDZrSK8N_Lv_x7YK5xV7S8hc8DPNoc_ImA",
    authDomain:        "vaani-app-ee1a8.firebaseapp.com",
    projectId:         "vaani-app-ee1a8",
    storageBucket:     "vaani-app-ee1a8.firebasestorage.app",
    messagingSenderId: "509015461995",
    appId:             "1:509015461995:web:2dd658cef15d05d851612e",
  };

  function _init() {
    if (typeof firebase === "undefined") {
      console.error("[Vaani Chat] Firebase compat SDK not found. Make sure these 3 scripts are in index.html BEFORE chat-firebase.js:\n  firebase-app-compat.js\n  firebase-auth-compat.js\n  firebase-firestore-compat.js");
      return;
    }

    try {
      // Create a named app so we don't conflict with the ESM default app
      var app;
      try {
        app = firebase.app("vaani-chat");
        console.log("[Vaani Chat] Reusing existing app.");
      } catch (e) {
        app = firebase.initializeApp(CONFIG, "vaani-chat");
        console.log("[Vaani Chat] New app initialized.");
      }

      var auth = app.auth();
      var db   = app.firestore();

      // Enable offline persistence (messages load even with bad connection)
      db.enablePersistence({ synchronizeTabs: true })
        .catch(function(err) {
          if (err.code === "failed-precondition") {
            console.warn("[Vaani Chat] Persistence failed (multiple tabs open) — continuing without it.");
          } else if (err.code === "unimplemented") {
            console.warn("[Vaani Chat] Persistence not supported in this browser.");
          }
        });

      window.chatFirebase = {
        app:  app,
        auth: auth,
        db:   db,
      };

      console.log("[Vaani Chat] ✓ Firebase initialized (named app 'vaani-chat', own auth)");

    } catch (err) {
      console.error("[Vaani Chat] Init failed:", err.message);
    }
  }

  // Poll until compat SDK globals are available
  var _tries = 0;
  var _poll = setInterval(function () {
    _tries++;
    if (typeof firebase !== "undefined") {
      clearInterval(_poll);
      _init();
    } else if (_tries >= 50) {
      clearInterval(_poll);
      console.error("[Vaani Chat] Firebase compat SDK never became available after 5s. Check your script tags.");
    }
  }, 100);

})();
