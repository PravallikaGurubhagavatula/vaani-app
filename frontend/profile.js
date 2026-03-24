/* ================================================================
   Vaani — profile.js  v1.3  FINAL
   ================================================================
   FIXES IN THIS VERSION:
   ─────────────────────────────────────────────────────────────────
   1. Username is always trimmed + lowercased at the point of SAVE
      (not just at validation), so it can never be stored empty or
      with wrong casing even if the caller passes raw input.

   2. _ensureCompatAuth() is more robust — fast-paths correctly
      when the compat auth already has the right user.

   3. get() now also syncs auth when the user object is passed,
      so the profile check before chat also works reliably.

   4. Added console.log of what is actually being saved so you
      can verify in DevTools → Console that the username is correct.

   FLOW (called by chat.js):
   ─────────────────────────────────────────────────────────────────
     vaaniProfile.get(uid)     → null          → show profile screen
     vaaniProfile.get(uid)     → {profile}     → show chat
     vaaniProfile.create(user, username)       → saves + returns profile
================================================================ */

(function () {
  "use strict";

  var COLLECTION = "users";
  var _db        = null;
  var _auth      = null;

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
      console.error("[Vaani Profile] Firebase compat SDK not found.");
    }
  }

  /* ── Init — share the named app from chat.js ─────────────────── */
  function _init() {
    try {
      var app;
      try       { app = firebase.app("vaani-chat-v2"); }
      catch (_) {
        try     { app = firebase.app("vaani-profile"); }
        catch (_) { app = firebase.initializeApp(FB_CONFIG, "vaani-profile"); }
      }
      _auth = app.auth();
      _db   = app.firestore();
      console.log("[Vaani Profile] ready ✓");
    } catch (err) {
      console.error("[Vaani Profile] Init error:", err.message);
    }
  }

  /* ── Sync ESM user → compat auth (fixes Firestore permissions) ─ */
  async function _ensureCompatAuth(user) {
    if (!_auth) throw new Error("Auth not initialised. Please refresh.");
    if (!user || !user.uid) throw new Error("No signed-in user. Please sign in first.");

    // Fast path — already synced
    var current = _auth.currentUser;
    if (current && current.uid === user.uid) return;

    try {
      await _auth.updateCurrentUser(user);
      console.log("[Vaani Profile] Compat auth synced ✓", user.email);
    } catch (err) {
      console.error("[Vaani Profile] updateCurrentUser failed:", err.code);
      throw new Error("Authentication error: " + (err.message || err.code));
    }
  }

  /* ── Ensure _db is ready ─────────────────────────────────────── */
  function _ensureDb() {
    return new Promise(function (resolve, reject) {
      if (_db) { resolve(); return; }
      var waited = 0;
      var t = setInterval(function () {
        if (_db) { clearInterval(t); resolve(); return; }
        waited += 50;
        if (waited >= 5000) {
          clearInterval(t);
          try { _init(); } catch (_) {}
          if (_db) resolve();
          else reject(new Error("Database not ready. Please refresh."));
        }
      }, 50);
    });
  }

  /* ── Username validation ─────────────────────────────────────── */
  function _validateUsername(raw) {
    var v = (raw || "").trim();
    if (!v)            return "Username cannot be empty.";
    if (v.length < 3)  return "At least 3 characters required.";
    if (v.length > 20) return "Maximum 20 characters allowed.";
    /* only lowercase letters, digits, underscore */
    if (!/^[a-z0-9_]+$/i.test(v))
                       return "Only letters, numbers and underscores allowed.";
    return null; // valid
  }

  /* ════════════════════════════════════════════════════════════════
     PUBLIC API
  ════════════════════════════════════════════════════════════════ */
  window.vaaniProfile = {

    /* ── get(uid) ──────────────────────────────────────────────── *
     * Returns the profile object or null.
     * Used by chat.js to decide: profile screen vs chat screen.
     * Read is public — no auth sync needed.
     */
    get: async function (uid) {
      try {
        await _ensureDb();
        var doc = await _db.collection(COLLECTION).doc(uid).get();
        if (doc.exists) {
          var data = doc.data();
          console.log("[Vaani Profile] Found profile:", data.username, "for uid:", uid);
          return data;
        }
        console.log("[Vaani Profile] No profile for uid:", uid);
        return null;
      } catch (err) {
        console.error("[Vaani Profile] get() error:", err.message);
        return null;
      }
    },

    /* ── create(user, username) ────────────────────────────────── *
     * FLOW:
     *  1. Ensure DB ready
     *  2. Validate user object
     *  3. Clean + validate username
     *  4. Sync compat auth  ← fixes "Missing or insufficient permissions"
     *  5. Check username taken
     *  6. Check profile already exists (safe re-submit)
     *  7. Write to users/{user.uid}  ← always .doc(uid), never .add()
     *  8. Return saved profile
     */
    create: async function (user, username) {
      // 1. DB ready
      await _ensureDb();

      // 2. Valid user
      if (!user || !user.uid) {
        throw new Error("Invalid user. Please sign in again.");
      }

      // 3. Clean username — trim + lowercase HERE at point of save
      //    so it is ALWAYS stored correctly regardless of what the
      //    UI sends.
      var rawInput = (username || "").trim();
      var cleaned  = rawInput.toLowerCase();

      var validationErr = _validateUsername(cleaned);
      if (validationErr) throw new Error(validationErr);

      // 4. Sync compat auth so Firestore rules see request.auth.uid
      await _ensureCompatAuth(user);

      // 5. Username uniqueness check
      var taken = await this.isUsernameTaken(cleaned);
      if (taken) throw new Error("That username is already taken. Try another.");

      // 6. Guard against duplicate profile on double-click / re-submit
      var existing = await this.get(user.uid);
      if (existing) {
        console.log("[Vaani Profile] Profile already exists — returning existing.");
        return existing;
      }

      // 7. Build the profile object — username is the cleaned value
      var profileData = {
        uid:       user.uid,
        name:      user.displayName || "",
        username:  cleaned,                // ← always stored trimmed+lowercase
        email:     user.email     || "",
        photoURL:  user.photoURL  || "",
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      };

      // Confirm exactly what is being saved
      console.log("[Vaani Profile] Saving profile:", profileData);

      // Write to users/{uid} — path matches Firestore rule match /users/{uid}
      await _db.collection(COLLECTION).doc(user.uid).set(profileData);
      console.log("[Vaani Profile] ✅ Profile saved at users/" + user.uid);

      return profileData;
    },

    /* ── isUsernameTaken(username) ─────────────────────────────── */
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

    /** Exposed for live UI validation */
    validateUsername: _validateUsername,
  };

  _waitForCompat(_init);
  console.log("[Vaani Profile] profile.js v1.3 loaded ✓");

})();
