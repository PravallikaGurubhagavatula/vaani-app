/* ================================================================
   Vaani — profile.js  v1.1  FIXED
   ----------------------------------------------------------------
   ROOT CAUSE OF "Database initialization failed":
   ─────────────────────────────────────────────────────────────────
   v1.0 called firebase.firestore() which accesses the DEFAULT
   Firebase app.  But the default app is created by the ESM
   firebase.js module (type="module") — which runs AFTER all
   regular scripts have executed.  So when profile.js loaded,
   the default compat app didn't exist yet → _db stayed null.

   THE FIX (one line change):
   Instead of using the default app, we wait for the named app
   "vaani-chat-v2" that chat.js already creates, and share that
   Firestore instance.  Both files use the same app → no conflict,
   no initialization race.

   ALTERNATIVE (also works):
   If chat.js hasn't run yet we create a minimal named app
   "vaani-profile" ourselves — same config, same project.
   Firebase de-duplicates connections automatically.

   NO CHANGES to index.html, firebase.js, or any other file.
================================================================ */

(function () {
  "use strict";

  var COLLECTION = "users";
  var _db        = null;   // set once Firebase compat is ready

  /* ── CONFIG (same as chat.js — same project, no conflict) ────── */
  var FB_CONFIG = {
    apiKey:            "AIzaSyDZrSK8N_Lv_x7YK5xV7S8hc8DPNoc_ImA",
    authDomain:        "vaani-app-ee1a8.firebaseapp.com",
    projectId:         "vaani-app-ee1a8",
    storageBucket:     "vaani-app-ee1a8.firebasestorage.app",
    messagingSenderId: "509015461995",
    appId:             "1:509015461995:web:2dd658cef15d05d851612e",
  };

  /* ── Wait for compat SDK scripts ─────────────────────────────── */
  function _waitForCompat(cb, tries) {
    tries = tries || 0;
    if (
      typeof firebase !== "undefined" &&
      typeof firebase.app       === "function" &&
      typeof firebase.firestore === "function"
    ) {
      cb();
    } else if (tries < 100) {
      setTimeout(function () { _waitForCompat(cb, tries + 1); }, 50);
    } else {
      console.error("[Vaani Profile] Firebase compat SDK not found after 5 s.");
    }
  }

  /* ── THE FIX: use a named app — never the default app ────────── */
  function _init() {
    try {
      // Try to reuse chat.js's named app if it already exists
      var app;
      try {
        app = firebase.app("vaani-chat-v2");
        console.log("[Vaani Profile] Reusing vaani-chat-v2 app ✓");
      } catch (_) {
        // chat.js hasn't run yet (unlikely) — create our own named app
        try {
          app = firebase.app("vaani-profile");
          console.log("[Vaani Profile] Reusing vaani-profile app ✓");
        } catch (_) {
          app = firebase.initializeApp(FB_CONFIG, "vaani-profile");
          console.log("[Vaani Profile] Created vaani-profile app ✓");
        }
      }

      _db = app.firestore();
      console.log("[Vaani Profile] Firestore ready ✓");
    } catch (err) {
      console.error("[Vaani Profile] Init error:", err.message);
    }
  }

  /* ── Username validation (pure function — no Firebase needed) ── */
  function _validateUsername(username) {
    var v = (username || "").trim();
    if (!v)            return "Username cannot be empty.";
    if (v.length < 3)  return "Username must be at least 3 characters.";
    if (v.length > 20) return "Username must be 20 characters or less.";
    if (!/^[a-z0-9_]+$/.test(v.toLowerCase()))
                       return "Only letters, numbers and underscores allowed.";
    return null; // null = valid
  }

  /* ── Ensure _db is ready before any Firestore operation ─────── */
  function _ensureDb() {
    return new Promise(function (resolve, reject) {
      if (_db) { resolve(); return; }

      // _db can still be null if _init() was called but the compat
      // scripts were slow. Retry for up to 5 seconds.
      var waited  = 0;
      var timer   = setInterval(function () {
        if (_db) {
          clearInterval(timer);
          resolve();
          return;
        }
        waited += 50;
        if (waited >= 5000) {
          clearInterval(timer);
          // Last attempt: try to init right now
          try { _init(); } catch (_) {}
          if (_db) { resolve(); }
          else { reject(new Error("Database initialization failed. Please refresh and try again.")); }
        }
      }, 50);
    });
  }

  /* ── Public API ──────────────────────────────────────────────── */
  window.vaaniProfile = {

    /**
     * get(uid)
     * Returns the profile object, or null if not found.
     */
    get: async function (uid) {
      try {
        await _ensureDb();
        var doc = await _db.collection(COLLECTION).doc(uid).get();
        return doc.exists ? doc.data() : null;
      } catch (err) {
        console.error("[Vaani Profile] get() error:", err.message);
        return null;
      }
    },

    /**
     * create(user, username)
     * Validates → checks for duplicates → writes to Firestore.
     * Throws a descriptive Error on any failure.
     */
    create: async function (user, username) {
      // 1. Ensure DB is ready first
      await _ensureDb();

      // 2. Basic guards
      if (!user) throw new Error("User object is required.");

      // 3. Validate username
      var v = (username || "").trim().toLowerCase();
      var validationError = _validateUsername(v);
      if (validationError) throw new Error(validationError);

      // 4. Check for duplicate username
      var taken = await this.isUsernameTaken(v);
      if (taken) throw new Error("That username is already taken. Try another.");

      // 5. Guard against re-creating an existing profile
      var existing = await this.get(user.uid);
      if (existing) {
        console.log("[Vaani Profile] Profile already exists — returning existing.");
        return existing;
      }

      // 6. Write to Firestore
      var profileData = {
        uid:       user.uid,
        name:      user.displayName || "",
        username:  v,
        email:     user.email     || "",
        photoURL:  user.photoURL  || "",
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      };

      await _db.collection(COLLECTION).doc(user.uid).set(profileData);
      console.log("[Vaani Profile] Profile created:", user.email, "→ @" + v);
      return profileData;
    },

    /**
     * isUsernameTaken(username)
     * Returns true if the username already exists in Firestore.
     */
    isUsernameTaken: async function (username) {
      try {
        await _ensureDb();
        var u    = (username || "").trim().toLowerCase();
        var snap = await _db.collection(COLLECTION)
                            .where("username", "==", u)
                            .limit(1)
                            .get();
        return !snap.empty;
      } catch (err) {
        console.error("[Vaani Profile] isUsernameTaken() error:", err.message);
        return false; // fail-open — let Firestore rules be the final guard
      }
    },

    /**
     * validateUsername(username)
     * Returns an error string or null if valid.
     * Exposed for live UI feedback.
     */
    validateUsername: _validateUsername,
  };

  // Kick off initialisation as soon as the compat SDK is ready
  _waitForCompat(_init);
  console.log("[Vaani Profile] profile.js v1.1 loaded ✓");

})();
