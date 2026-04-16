/* ================================================================
   Vaani — auth.js  v2.1  ROUTING CONTROLLER  (perf-optimised)
   ================================================================
   WHAT CHANGED FROM v2.0
   ─────────────────────────────────────────────────────────────────
   PERF FIX 1 — Profile cache in sessionStorage
     handlePostLogin() checks sessionStorage before making any
     Firestore read. On repeat sign-ins (tab refresh, token refresh)
     the "Checking your profile…" screen is skipped entirely and
     the chat UI renders in the same microtask as onAuthStateChanged.

   PERF FIX 2 — Eliminated redundant Firestore read in chat.js open()
     The profile fetched here is passed directly to _renderChat()
     via goToChat(), so chat.js never needs to re-fetch it.
     (See companion patch for chat.js open().)

   PERF FIX 3 — Optimistic render for cached users
     If a valid session profile exists in cache, we call
     loadChatHome() immediately (no spinner) and then validate
     the Firestore doc silently in the background. If the doc has
     been deleted we redirect to onboarding; otherwise we do nothing.

   PERF FIX 4 — _showLoadingScreen() guarded behind cache miss
     The loading spinner is only shown when there is genuinely no
     cached profile to show — i.e. first-ever sign-in.

   PERF FIX 5 — Single onAuthStateChanged listener; no race conditions
     Architecture unchanged. All routing still flows through the
     single onAuthStateChanged entry point.
   ─────────────────────────────────────────────────────────────────
   FLOW (updated):
     onAuthStateChanged fires
       │
       ├─ user == null  ──────────────────────────────► Login screen
       │
       └─ user exists
             │
             ├─ sessionStorage cache hit ────────────► Chat screen IMMEDIATELY
             │     └─ background validate → onboarding if doc deleted
             │
             └─ cache miss (first sign-in or cleared)
                   │
                   ├─ show spinner (first time only)
                   ├─ fetch Firestore profile
                   ├─ profile exists ──────────────► Chat screen
                   └─ profile missing ─────────────► Profile onboarding
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

  /* ─────────────────────────────────────────────────────────────────
     PERF FIX 1 — Thin profile cache backed by sessionStorage
     Key:   "vaani_auth_profile_<uid>"
     TTL:   30 minutes (sufficient for a browser session; avoids
            serving stale data after a long idle tab)
     This is separate from the localStorage session-user cache in
     app.js — that one stores auth identity; this one stores the
     Firestore profile document.
  ───────────────────────────────────────────────────────────────── */
  var PROFILE_CACHE_TTL_MS = 30 * 60 * 1000; // 30 min

  function _profileCacheKey(uid) {
    return "vaani_auth_profile_" + String(uid || "");
  }

  function _readProfileCache(uid) {
    if (!uid) return null;
    try {
      var raw = sessionStorage.getItem(_profileCacheKey(uid));
      if (!raw) return null;
      var entry = JSON.parse(raw);
      if (!entry || typeof entry !== "object") return null;
      if (Date.now() - (entry.cachedAt || 0) > PROFILE_CACHE_TTL_MS) {
        sessionStorage.removeItem(_profileCacheKey(uid));
        return null;
      }
      return entry.profile || null;
    } catch (_) {
      return null;
    }
  }

  function _writeProfileCache(uid, profile) {
    if (!uid || !profile) return;
    try {
      sessionStorage.setItem(_profileCacheKey(uid), JSON.stringify({
        profile: profile,
        cachedAt: Date.now(),
      }));
    } catch (_) {
      // sessionStorage full or unavailable — non-fatal
    }
  }

  function _clearProfileCache(uid) {
    if (!uid) return;
    try { sessionStorage.removeItem(_profileCacheKey(uid)); } catch (_) {}
  }

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

  function loadChatHome(user, profile) {
    _showChatScreen(user, profile || {});
  }

  /**
   * PERF FIX 2 & 3 — handlePostLogin with optimistic cache path
   *
   * Fast path (cache hit):
   *   1. Render chat UI immediately from cache — zero Firestore reads
   *   2. Kick off a background Firestore read to validate the doc
   *   3. If doc is gone → redirect to onboarding; otherwise no-op
   *
   * Slow path (cache miss — first sign-in):
   *   1. Show loading spinner
   *   2. Fetch Firestore profile
   *   3. Cache the result
   *   4. Render chat UI or onboarding
   */
  async function handlePostLogin(user) {
    if (!user || !user.uid) {
      _showLoginScreen();
      return;
    }

    var uid = user.uid;

    /* ── FAST PATH: profile is already cached ─────────────────── */
    var cachedProfile = _readProfileCache(uid);
    if (cachedProfile) {
      console.log("[Vaani Router] Cache hit — rendering chat immediately for @" + (cachedProfile.username || uid));

      // Render NOW, before any async work
      loadChatHome(user, cachedProfile);

      // Background validation — don't block the UI
      _validateProfileInBackground(user, cachedProfile);
      return;
    }

    /* ── SLOW PATH: first sign-in or cache expired ────────────── */
    // Only show spinner when we have nothing to render yet
    _showLoadingScreen();

    try {
      var getUserProfile =
        (typeof window.getUserProfile === "function")
          ? window.getUserProfile
          : (window.vaaniProfile && typeof window.vaaniProfile.get === "function"
            ? window.vaaniProfile.get.bind(window.vaaniProfile)
            : null);

      var showProfileOnboarding =
        (typeof window.showProfileOnboarding === "function")
          ? window.showProfileOnboarding
          : function () { _showProfileScreen(user); };

      if (!getUserProfile) {
        throw new Error("Profile module not ready.");
      }

      var profile = await getUserProfile(uid);

      if (!profile) {
        console.log("[Vaani Router] No profile found — showing onboarding");
        await showProfileOnboarding(uid);
        return;
      }

      // Cache the fetched profile so next auth event is instant
      _writeProfileCache(uid, profile);

      console.log("[Vaani Router] Profile fetched → @" + (profile.username || uid));
      loadChatHome(user, profile);

    } catch (err) {
      console.error("[Vaani Router] Profile read error:", err.message);
      if (typeof window.showToast === "function") {
        window.showToast("Could not verify profile. Please try again.");
      }
      _showProfileScreen(user);
    }
  }

  /**
   * PERF FIX 3 — Background profile validation after optimistic render
   * Runs silently; only acts if the profile document has been deleted.
   */
  async function _validateProfileInBackground(user, cachedProfile) {
    try {
      if (!_db || !user || !user.uid) return;

      // Use a direct Firestore read (not getUserProfile) to minimise
      // the call stack depth — we just need to know if the doc exists.
      var doc = await _db.collection("users").doc(user.uid).get();

      if (!doc.exists) {
        // Profile was deleted — clear cache and send to onboarding
        console.warn("[Vaani Router] Background check: profile doc missing — redirecting to onboarding");
        _clearProfileCache(user.uid);
        var showProfileOnboarding =
          (typeof window.showProfileOnboarding === "function")
            ? window.showProfileOnboarding
            : function () { _showProfileScreen(user); };
        await showProfileOnboarding(user.uid);
        return;
      }

      // Profile exists — refresh the cache with the latest data
      var freshProfile = doc.data();
      if (freshProfile) {
        _writeProfileCache(user.uid, freshProfile);
      }

      console.log("[Vaani Router] Background check: profile valid ✓");
    } catch (err) {
      // Non-fatal — user is already in chat; log and move on
      console.warn("[Vaani Router] Background profile validation failed (non-fatal):", err.message);
    }
  }

  /* ════════════════════════════════════════════════════════════════
     SCREEN CONTROLLERS
  ════════════════════════════════════════════════════════════════ */

  function _showLoadingScreen() {
    // PERF FIX 4 — only called on genuine cache miss (first sign-in)
    var root = document.getElementById("vaaniChat");
    if (root) {
      root.innerHTML =
        '<div class="vg-screen vg-loading-screen">' +
          '<div class="vg-spinner"></div>' +
          '<p>Checking your profile…</p>' +
        '</div>';
    }
    if (window.vaaniChat && typeof window.vaaniChat.close === "function") {
      window.vaaniChat.close();
    }
  }

  function _showLoginScreen() {
    _clearProfileCache(window._vaaniCurrentUser && window._vaaniCurrentUser.uid);
    window._vaaniCurrentUser = null;
    window.VAANI_AUTH_READY  = true;
    if (typeof window._vaaniOnAuthChange === "function") {
      window._vaaniOnAuthChange(null);
    }
    if (window.vaaniChat && typeof window.vaaniChat.close === "function") {
      window.vaaniChat.close();
    }
    if (window.vaaniChat && typeof window.vaaniChat._renderLogin === "function") {
      window.vaaniChat._renderLogin(_auth);
    } else {
      _renderLoginFallback();
    }
  }

  function _showProfileScreen(user) {
    if (window.vaaniChat && typeof window.vaaniChat.close === "function") {
      window.vaaniChat.close();
    }
    if (window.vaaniChat && typeof window.vaaniChat._renderProfile === "function") {
      window.vaaniChat._renderProfile(user);
    } else {
      _renderProfileFallback(user);
    }
  }

  function _showChatScreen(user, profile) {
    if (window.vaaniChat && typeof window.vaaniChat._renderChat === "function") {
      window.vaaniChat._renderChat(user, profile);
    }
  }

  /* ── Fallback renderers ──────────────────────────────────────── */
  function _renderLoginFallback() {
    var root = document.getElementById("vaaniChat");
    if (!root) return;
    root.innerHTML =
      '<div class="vg-screen vg-login-screen">' +
        '<div class="vg-card">' +
          '<h2 class="vg-card-title">Start Chatting</h2>' +
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
      // Also cache the newly created profile so next load is instant
      if (user && user.uid && profile) {
        _writeProfileCache(user.uid, profile);
      }
      _showChatScreen(user, profile);
    },

    /** Called by chat.js sign-out button */
    signOut: async function () {
      // Clear profile cache on sign-out so next user gets a fresh fetch
      var uid = _auth && _auth.currentUser && _auth.currentUser.uid;
      if (uid) _clearProfileCache(uid);
      try {
        if (typeof window.signOutUser === "function") {
          await window.signOutUser();
        } else if (_auth) {
          await _auth.signOut();
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

    /** Expose cache helpers so profile.js can bust/update the cache */
    writeProfileCache: _writeProfileCache,
    clearProfileCache: _clearProfileCache,
  };

  window.handlePostLogin = handlePostLogin;

  /* Keep window.vaaniAuth for backward compat */
  window.vaaniAuth = {
    signIn:      function () { return window.vaaniRouter.signIn(); },
    signOut:     function () { return window.vaaniRouter.signOut(); },
    currentUser: function () { return _auth ? _auth.currentUser : null; },
  };

  _waitForCompat(_init);
  console.log("[Vaani Router] auth.js v2.1 loaded ✓");

})();
