/* ================================================================
   Vaani — auth.js  v2.0  ROUTING CONTROLLER
   ================================================================
   THIS IS THE SINGLE SOURCE OF TRUTH FOR ALL ROUTING.

   One listener. Three possible screens. No race conditions.

   FLOW:
   ─────────────────────────────────────────────────────────────────
     onAuthStateChanged fires
       │
       ├─ user == null  ──────────────────────► Login screen
       │
       └─ user exists
             │
             ├─ Firestore users/{uid} exists ─► Chat screen
             │
             └─ Firestore users/{uid} missing ► Profile screen

   KEY DECISIONS:
   ─────────────────────────────────────────────────────────────────
   • Uses the "vaani-chat-v2" named compat app (same as chat.js/
     profile.js) so auth and Firestore are on the SAME instance.
     No cross-instance mirroring needed for routing.

   • onAuthStateChanged is the ONLY trigger for routing. Nothing
     else calls showLoginUI / showProfileUI / showChatUI.

   • window.vaaniRouter is exposed so profile.js can call
     window.vaaniRouter.goToChat(profile) after creation.

   • window.vaaniAuth is kept for backward compat (chat.js uses it
     for the sign-in popup inside _renderLoginUI).
================================================================ */

(function () {
  "use strict";

  /* ── Firebase config ─────────────────────────────────────────── */
  var FB_CONFIG = {
    apiKey:            "AIzaSyDZrSK8N_Lv_x7YK5xV7S8hc8DPNoc_ImA",
    authDomain:        "vaani-app-ee1a8.firebaseapp.com",
    projectId:         "vaani-app-ee1a8",
    storageBucket:     "vaani-app-ee1a8.firebasestorage.app",
    messagingSenderId: "509015461995",
    appId:             "1:509015461995:web:2dd658cef15d05d851612e",
  };

  var _auth = null;
  var _db   = null;
  var _modularFirestore = null;

  /* ── Wait for compat SDK ─────────────────────────────────────── */
  function _waitForCompat(cb, tries) {
    tries = tries || 0;
    if (
      typeof firebase !== "undefined" &&
      typeof firebase.app       === "function" &&
      typeof firebase.auth      === "function" &&
      typeof firebase.firestore === "function"
    ) {
      cb();
    } else if (tries < 100) {
      setTimeout(function () { _waitForCompat(cb, tries + 1); }, 50);
    } else {
      console.error("[Vaani Router] Firebase compat SDK not found.");
    }
  }

  /* ── Init — get the shared named app ────────────────────────── */
  function _init() {
    try {
      var app;
      try       { app = firebase.app("vaani-chat-v2"); }
      catch (_) { app = firebase.initializeApp(FB_CONFIG, "vaani-chat-v2"); }

      _auth = app.auth();
      _db   = app.firestore();

      console.log("[Vaani Router] Firebase ready ✓");
      _startRouter();
    } catch (err) {
      console.error("[Vaani Router] Init error:", err.message);
    }
  }

  /* ════════════════════════════════════════════════════════════════
     THE ROUTER — onAuthStateChanged is the ONLY entry point
  ════════════════════════════════════════════════════════════════ */

  function _startRouter() {
    _auth.onAuthStateChanged(async function (user) {
      console.log("[Vaani Router] Auth state:", user ? user.email : "signed out");

      if (!user) {
        _showLoginScreen();
        return;
      }

      // Sync this user into window globals so app.js (History/Favs) works
      window._vaaniCurrentUser = user;
      window.VAANI_AUTH_READY  = true;
      if (typeof window._vaaniOnAuthChange === "function") {
        window._vaaniOnAuthChange(user);
      }

      await handlePostLogin(user);
    });
  }

  async function _getModularFirestore() {
    if (_modularFirestore) return _modularFirestore;

    var appMod = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
    var fsMod = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");

    var apps = appMod.getApps();
    var modularApp = null;
    for (var i = 0; i < apps.length; i++) {
      if (apps[i].name === "vaani-chat-v2-modular") {
        modularApp = apps[i];
        break;
      }
    }
    if (!modularApp) {
      modularApp = appMod.initializeApp(FB_CONFIG, "vaani-chat-v2-modular");
    }

    _modularFirestore = {
      db: fsMod.getFirestore(modularApp),
      doc: fsMod.doc,
      getDoc: fsMod.getDoc,
    };

    return _modularFirestore;
  }

  /**
   * Required post-login gate:
   *  - users/{uid} exists  -> chat home
   *  - users/{uid} missing -> profile onboarding
   */
  async function handlePostLogin(user) {
    _showLoadingScreen();

    if (!user || !user.uid) {
      _showLoginScreen();
      return;
    }

    try {
      var modular = await _getModularFirestore();
      var userRef = modular.doc(modular.db, "users", user.uid);
      var userSnap = await modular.getDoc(userRef);

      if (!userSnap.exists()) {
        console.log("[Vaani Router] Profile check → none");
        _showProfileScreen(user);
        return;
      }

      var profile = userSnap.data() || {};
      console.log("[Vaani Router] Profile check →", profile.username ? "@" + profile.username : "exists");
      _showChatScreen(user, profile);
    } catch (err) {
      console.error("[Vaani Router] Profile read error:", err.message);
      if (typeof window.showToast === "function") {
        window.showToast("Could not verify profile. Please try again.");
      }
      // Fail closed: onboarding screen blocks chat access on error.
      _showProfileScreen(user);
    }
  }

  /* ════════════════════════════════════════════════════════════════
     SCREEN CONTROLLERS
     Each function:
       1. Tells chat.js to stop/start
       2. Delegates rendering to the relevant module
  ════════════════════════════════════════════════════════════════ */

  function _showLoadingScreen() {
    // Show spinner in the chat area while profile check runs
    var root = document.getElementById("vaaniChat");
    if (root) {
      root.innerHTML =
        '<div class="vg-screen vg-loading-screen">' +
          '<div class="vg-spinner"></div>' +
          '<p>Checking your profile…</p>' +
        '</div>';
    }
    // Stop any stale Firestore listener
    if (window.vaaniChat && typeof window.vaaniChat.close === "function") {
      window.vaaniChat.close();
    }
  }

  function _showLoginScreen() {
    // Clear window globals
    window._vaaniCurrentUser = null;
    window.VAANI_AUTH_READY  = true;
    if (typeof window._vaaniOnAuthChange === "function") {
      window._vaaniOnAuthChange(null);
    }
    // Stop chat listener
    if (window.vaaniChat && typeof window.vaaniChat.close === "function") {
      window.vaaniChat.close();
    }
    // Render login UI
    if (window.vaaniChat && typeof window.vaaniChat._renderLogin === "function") {
      window.vaaniChat._renderLogin(_auth);
    } else {
      _renderLoginFallback();
    }
  }

  function _showProfileScreen(user) {
    // Stop chat listener
    if (window.vaaniChat && typeof window.vaaniChat.close === "function") {
      window.vaaniChat.close();
    }
    // Render profile creation UI
    if (window.vaaniChat && typeof window.vaaniChat._renderProfile === "function") {
      window.vaaniChat._renderProfile(user);
    } else {
      _renderProfileFallback(user);
    }
  }

  function _showChatScreen(user, profile) {
    // Render full chat UI
    if (window.vaaniChat && typeof window.vaaniChat._renderChat === "function") {
      window.vaaniChat._renderChat(user, profile);
    }
  }

  /* ── Fallback renderers (used if chat.js hasn't loaded yet) ─── */
  function _renderLoginFallback() {
    var root = document.getElementById("vaaniChat");
    if (!root) return;
    root.innerHTML =
      '<div class="vg-screen vg-login-screen">' +
        '<div class="vg-card">' +
          '<h2 class="vg-card-title">Join the Conversation</h2>' +
          '<button class="vg-google-btn" onclick="window.vaaniRouter.signIn()">Sign in with Google</button>' +
        '</div>' +
      '</div>';
  }

  function _renderProfileFallback(user) {
    var root = document.getElementById("vaaniChat");
    if (!root) return;
    root.innerHTML =
      '<div class="vg-screen vg-profile-screen">' +
        '<div class="vg-card">' +
          '<h2 class="vg-card-title">Create Your Profile</h2>' +
          '<p class="vg-card-sub">Choose a username to continue.</p>' +
          '<input id="vgUsernameFallback" class="vg-input" placeholder="username_01">' +
          '<button class="vg-primary-btn" onclick="window.vaaniRouter.createProfile()">Create Profile</button>' +
        '</div>' +
      '</div>';
  }

  /* ════════════════════════════════════════════════════════════════
     PUBLIC API — window.vaaniRouter
  ════════════════════════════════════════════════════════════════ */

  window.vaaniRouter = {

    /** Called by chat.js sign-in button */
    signIn: async function () {
      if (!_auth) return;
      try {
        var provider = new firebase.auth.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: "select_account" });
        await _auth.signInWithPopup(provider);
        // onAuthStateChanged fires automatically → router handles the rest
      } catch (err) {
        if (
          err.code !== "auth/popup-closed-by-user" &&
          err.code !== "auth/cancelled-popup-request"
        ) {
          console.error("[Vaani Router] Sign-in error:", err.code);
          if (typeof window.showToast === "function")
            window.showToast("Sign-in failed: " + (err.code || err.message));
        }
      }
    },

    /** Called by profile.js after successful profile creation */
    goToChat: function (user, profile) {
      _showChatScreen(user, profile);
    },

    /** Called by chat.js sign-out button */
    signOut: async function () {
      try {
        if (_auth) await _auth.signOut();
        // Sync sign-out to the ESM firebase.js instance as well
        if (typeof window.signOutUser === "function") {
          window.signOutUser().catch(function () {});
        }
      } catch (err) {
        console.warn("[Vaani Router] Sign-out error:", err.message);
      }
      // onAuthStateChanged fires → shows login screen automatically
    },

    /** Expose auth/db for profile.js to use */
    getAuth: function () { return _auth; },
    getDb:   function () { return _db;   },
    handlePostLogin: handlePostLogin,
  };

  // Expose explicitly as requested for direct usage in login flows.
  window.handlePostLogin = handlePostLogin;

  /* Keep window.vaaniAuth for backward compat */
  window.vaaniAuth = {
    signIn:      function () { return window.vaaniRouter.signIn(); },
    signOut:     function () { return window.vaaniRouter.signOut(); },
    currentUser: function () { return _auth ? _auth.currentUser : null; },
  };

  _waitForCompat(_init);
  console.log("[Vaani Router] auth.js v2.0 loaded ✓");

})();
