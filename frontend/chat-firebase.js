/* ================================================================
   Vaani — chat-firebase.js  v6  FINAL
   ================================================================

   THE CORRECT FIX:
   ─────────────────────────────────────────────────────────────────
   firebase.js (ESM) and chat-firebase.js (compat) are separate
   SDK instances that cannot share auth state automatically.

   The official Firebase solution is:
     compatAuth.updateCurrentUser(esmUser)

   This method is designed exactly for transferring a User object
   from one Firebase app instance to another within the same project.
   After calling it, the compat auth instance is fully authenticated
   and Firestore security rules see request.auth.uid correctly.

   Docs: firebase.google.com/docs/reference/js/v8/firebase.auth.Auth
         #updatecurrentuser

   HOW WE HOOK IN:
   ─────────────────────────────────────────────────────────────────
   window._vaaniOnAuthChange(user) is called by the existing
   firebase.js every time auth state changes. We wrap it here to
   also call updateCurrentUser on the compat auth instance.

   NO server needed. NO re-login. NO second popup.
   The user signs in once via the existing flow, and we mirror
   that User object into the compat SDK automatically.
================================================================ */

(function () {
  "use strict";

  if (window.chatFirebase) return;

  var CONFIG = {
    apiKey:            "AIzaSyDZrSK8N_Lv_x7YK5xV7S8hc8DPNoc_ImA",
    authDomain:        "vaani-app-ee1a8.firebaseapp.com",
    projectId:         "vaani-app-ee1a8",
    storageBucket:     "vaani-app-ee1a8.firebasestorage.app",
    messagingSenderId: "509015461995",
    appId:             "1:509015461995:web:2dd658cef15d05d851612e",
  };

  // Wait for compat SDK to be available on window.firebase
  function _waitForCompat(cb, tries) {
    tries = tries || 0;
    if (typeof firebase !== "undefined"
        && typeof firebase.app          === "function"
        && typeof firebase.firestore    === "function"
        && typeof firebase.auth         === "function") {
      cb();
    } else if (tries < 100) {
      setTimeout(function () { _waitForCompat(cb, tries + 1); }, 50);
    } else {
      console.error("[Vaani Chat] compat SDK not found after 5s — check script tags.");
    }
  }

  function _init() {
    // ── 1. Get or create compat app ──────────────────────────────
    var compatApp;
    try {
      compatApp = firebase.app("vaani-chat");
    } catch (_) {
      compatApp = firebase.initializeApp(CONFIG, "vaani-chat");
    }

    var db         = compatApp.firestore();
    var compatAuth = compatApp.auth();

    // ── 2. Enable offline persistence ────────────────────────────
    db.enablePersistence({ synchronizeTabs: true }).catch(function (e) {
      if (e.code !== "failed-precondition" && e.code !== "unimplemented") {
        console.warn("[Vaani Chat] Persistence:", e.code);
      }
    });

    // ── 3. THE FIX: mirror ESM user → compat auth ─────────────
    // updateCurrentUser() is the official Firebase API for transferring
    // a User object between app instances in the same project.
    function _mirrorUser(esmUser) {
      if (!esmUser) {
        compatAuth.signOut().catch(function () {});
        console.log("[Vaani Chat] Auth: signed out (mirrored)");
        return;
      }

      compatAuth.updateCurrentUser(esmUser)
        .then(function () {
          console.log("[Vaani Chat] ✓ Auth mirrored to compat:", esmUser.email);
          // Notify chat.js that user is ready
          if (typeof window._chatOnUserReady === "function") {
            window._chatOnUserReady(esmUser);
          }
        })
        .catch(function (e) {
          console.error("[Vaani Chat] updateCurrentUser failed:", e.code, e.message);
          // Fallback: pass user directly even without compat auth
          // (works if Firestore rules allow all authenticated users)
          if (typeof window._chatOnUserReady === "function") {
            window._chatOnUserReady(esmUser);
          }
        });
    }

    // ── 4. Hook into existing Vaani auth ─────────────────────────
    // window._vaaniOnAuthChange is called by firebase.js (ESM) on
    // every auth state change. We wrap it — original still runs first.
    var _prev = window._vaaniOnAuthChange;
    window._vaaniOnAuthChange = function (user) {
      // Always call original handler first (keeps translation/UI working)
      if (typeof _prev === "function") _prev(user);
      // Mirror to compat
      _mirrorUser(user);
    };

    // ── 5. Handle case where user is already signed in ───────────
    // firebase.js may have already fired _vaaniOnAuthChange before
    // this script loaded. If so, mirror immediately.
    if (window.VAANI_AUTH_READY && window._vaaniCurrentUser) {
      console.log("[Vaani Chat] User already signed in — mirroring now.");
      _mirrorUser(window._vaaniCurrentUser);
    }

    // ── 6. Also listen on compat auth for completeness ───────────
    // This catches any future auth changes via the compat SDK itself
    compatAuth.onAuthStateChanged(function (user) {
      console.log("[Vaani Chat] Compat auth state:", user ? user.email : "signed out");
    });

    // ── 7. Expose to window ───────────────────────────────────────
    window.chatFirebase = {
      db:   db,
      auth: compatAuth,
    };

    console.log("[Vaani Chat] ✓ Ready. Waiting for auth mirror.");
  }

  _waitForCompat(_init);

})();
