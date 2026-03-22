/* ================================================================
   Vaani — chat-firebase.js
   Firebase initialization specifically for the Chat module.

   WHY A SEPARATE FILE?
   ─────────────────────────────────────────────────────────────────
   The existing firebase.js uses ESM (type="module") and handles
   only Authentication for the translation app. This file adds
   Firestore support for the chat system WITHOUT touching the
   existing firebase.js or app.js.

   LOAD ORDER in index.html:
     <script type="module" src="firebase.js">        ← existing (auth only)
     <script src="chat-firebase.js">                 ← NEW (compat SDK for chat)
     <script src="chat.js">                          ← NEW (chat logic)

   We use the Firebase Compat (v8-style) SDK via CDN so chat.js
   can access window.chatFirebase without ESM complexity.
================================================================ */

(function () {
  // Guard: only init once
  if (window.chatFirebase) return;

  // ── Firebase CDN URLs (compat/v8-style API) ───────────────────
  // These are loaded via <script> tags added to index.html.
  // We do NOT re-init if the compat app already exists.

  function _initChatFirebase() {
    try {
      // Use the SAME config as the existing firebase.js
      const firebaseConfig = {
        apiKey:            "AIzaSyDZrSK8N_Lv_x7YK5xV7S8hc8DPNoc_ImA",
        authDomain:        "vaani-app-ee1a8.firebaseapp.com",
        projectId:         "vaani-app-ee1a8",
        storageBucket:     "vaani-app-ee1a8.firebasestorage.app",
        messagingSenderId: "509015461995",
        appId:             "1:509015461995:web:2dd658cef15d05d851612e",
      };

      // Initialize a named app called "vaani-chat" to avoid conflict
      // with the default app initialized by the existing firebase.js
      let chatApp;
      try {
        chatApp = firebase.app("vaani-chat");
      } catch (e) {
        chatApp = firebase.initializeApp(firebaseConfig, "vaani-chat");
      }

      const db   = chatApp.firestore();
      const auth = chatApp.auth();

      // Expose globally for chat.js
      window.chatFirebase = { app: chatApp, db, auth };

      console.log("[Vaani Chat] Firebase initialized ✓");
    } catch (err) {
      console.error("[Vaani Chat] Firebase init failed:", err.message);
    }
  }

  // Wait for the Firebase compat SDK scripts to load
  if (typeof firebase !== "undefined") {
    _initChatFirebase();
  } else {
    window.addEventListener("load", function () {
      if (typeof firebase !== "undefined") {
        _initChatFirebase();
      } else {
        console.error("[Vaani Chat] Firebase compat SDK not found. Check script tags.");
      }
    });
  }
})();
