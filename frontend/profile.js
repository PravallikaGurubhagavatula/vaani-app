/* ================================================================
   Vaani — profile.js  v1.2  PERMISSION FIX
   ----------------------------------------------------------------
   ROOT CAUSE of "Missing or insufficient permissions":
   ─────────────────────────────────────────────────────────────────
   Firestore rule:
     allow write: if request.auth != null && request.auth.uid == uid;

   The rule checks request.auth on the COMPAT SDK's auth instance
   (attached to the "vaani-chat-v2" named app).  But the user
   signed in via the ESM firebase.js module — a DIFFERENT instance.
   The compat auth instance never received the user, so Firestore
   sees request.auth == null → PERMISSION DENIED.

   THE FIX:
   Before every Firestore write, call:
     _auth.updateCurrentUser(esmUser)
   This transfers the signed-in ESM User object into the compat
   auth instance.  Firestore then sees request.auth.uid correctly
   and the write succeeds.

   updateCurrentUser() is the official Firebase API for exactly
   this cross-instance user transfer:
   https://firebase.google.com/docs/reference/js/v8/firebase.auth.Auth#updatecurrentuser

   NO Firestore rule changes needed.
   NO new architecture.
   NO changes to any other file.
================================================================ */

(function () {
  "use strict";

  var COLLECTION = "users";
  var _db        = null;
  var _auth      = null;  // compat auth — needs updateCurrentUser() before writes

  /* ── Firebase config ─────────────────────────────────────────── */
  var FB_CONFIG = {
    apiKey:            "AIzaSyDZrSK8N_Lv_x7YK5xV7S8hc8DPNoc_ImA",
    authDomain:        "vaani-app-ee1a8.firebaseapp.com",
    projectId:         "vaani-app-ee1a8",
    storageBucket:     "vaani-app-ee1a8.firebasestorage.app",
    messagingSenderId: "509015461995",
    appId:             "1:509015461995:web:2dd658cef15d05d851612e",
  };

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
      console.error("[Vaani Profile] Firebase compat SDK not found after 5 s.");
    }
  }

  /* ── Init: share the named app that chat.js creates ─────────── */
  function _init() {
    try {
      var app;

      // Prefer reusing chat.js's named app (same Firestore connection)
      try {
        app = firebase.app("vaani-chat-v2");
      } catch (_) {
        // chat.js hasn't run yet — create our own named app
        try {
          app = firebase.app("vaani-profile");
        } catch (_) {
          app = firebase.initializeApp(FB_CONFIG, "vaani-profile");
        }
      }

      _auth = app.auth();
      _db   = app.firestore();
      console.log("[Vaani Profile] Firestore + Auth ready ✓");
    } catch (err) {
      console.error("[Vaani Profile] Init error:", err.message);
    }
  }

  /* ════════════════════════════════════════════════════════════════
     CRITICAL FIX — sync the ESM user into compat auth
     ─────────────────────────────────────────────────────────────
     Firestore security rules evaluate request.auth using the COMPAT
     auth instance bound to our named app.  The user authenticated
     via the ESM firebase.js (a separate SDK instance), so our compat
     auth has no knowledge of that session.

     updateCurrentUser(user) is the official Firebase solution for
     copying a User object from one app instance to another within
     the same project.  After this call, Firestore sees a valid
     request.auth.uid and the write is permitted.
  ════════════════════════════════════════════════════════════════ */
  async function _ensureCompatAuth(user) {
    if (!_auth) throw new Error("Auth not initialised. Please refresh.");
    if (!user || !user.uid) throw new Error("No signed-in user. Please sign in first.");

    // Fast path: compat auth already has this user
    var current = _auth.currentUser;
    if (current && current.uid === user.uid) {
      return; // already synced — nothing to do
    }

    // Transfer the ESM User into compat auth
    try {
      await _auth.updateCurrentUser(user);
      console.log("[Vaani Profile] ✅ Compat auth synced for:", user.email);
    } catch (err) {
      console.error("[Vaani Profile] updateCurrentUser failed:", err.code, err.message);
      throw new Error("Could not authenticate for database write: " + (err.message || err.code));
    }
  }

  /* ── Ensure _db is ready ─────────────────────────────────────── */
  function _ensureDb() {
    return new Promise(function (resolve, reject) {
      if (_db) { resolve(); return; }
      var waited = 0;
      var timer  = setInterval(function () {
        if (_db) { clearInterval(timer); resolve(); return; }
        waited += 50;
        if (waited >= 5000) {
          clearInterval(timer);
          try { _init(); } catch (_) {}
          if (_db) resolve();
          else reject(new Error("Database not ready. Please refresh and try again."));
        }
      }, 50);
    });
  }

  /* ── Username validation ─────────────────────────────────────── */
  function _validateUsername(username) {
    var v = (username || "").trim();
    if (!v)            return "Username cannot be empty.";
    if (v.length < 3)  return "Username must be at least 3 characters.";
    if (v.length > 20) return "Username must be 20 characters or less.";
    if (!/^[a-z0-9_]+$/.test(v.toLowerCase()))
                       return "Only letters, numbers and underscores allowed.";
    return null;
  }

  /* ── Public API ──────────────────────────────────────────────── */
  window.vaaniProfile = {

    /**
     * get(uid)
     * Read is public (allow read: if true) — no auth sync needed.
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
     *
     * THE CORRECT WRITE FLOW:
     *   1. Validate username
     *   2. Sync user into compat auth  ← FIXES "Missing or insufficient permissions"
     *   3. Check username availability
     *   4. Guard against duplicate profile
     *   5. Write to users/{user.uid}   ← always .doc(uid).set(), never .add()
     */
    create: async function (user, username) {
      await _ensureDb();

      if (!user || !user.uid) throw new Error("Invalid user. Please sign in again.");

      // Step 1: validate
      var v = (username || "").trim().toLowerCase();
      var validationErr = _validateUsername(v);
      if (validationErr) throw new Error(validationErr);

      // Step 2: ✅ sync compat auth — this is the permission fix
      await _ensureCompatAuth(user);

      // Step 3: check username uniqueness
      var taken = await this.isUsernameTaken(v);
      if (taken) throw new Error("That username is already taken. Try another.");

      // Step 4: guard against re-submit creating a duplicate
      var existing = await this.get(user.uid);
      if (existing) {
        console.log("[Vaani Profile] Profile already exists — returning it.");
        return existing;
      }

      // Step 5: write to users/{uid} — path matches Firestore rule {uid}
      var profileData = {
        uid:       user.uid,
        name:      user.displayName || "",
        username:  v,
        email:     user.email       || "",
        photoURL:  user.photoURL    || "",
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      };

      await _db.collection(COLLECTION).doc(user.uid).set(profileData);
      console.log("[Vaani Profile] ✅ Profile created at users/" + user.uid);
      return profileData;
    },

    /**
     * isUsernameTaken(username)
     * Read — no auth sync needed.
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
        return false;
      }
    },

    /** Exposed for live UI validation in chat.js */
    validateUsername: _validateUsername,
  };

  _waitForCompat(_init);
  console.log("[Vaani Profile] profile.js v1.2 loaded ✓");

})();
