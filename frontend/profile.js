/* ================================================================
   Vaani — profile.js  v1.0
   ----------------------------------------------------------------
   User profile system using the Firebase COMPAT SDK (Firestore).

   Firestore collection structure:
     users/{uid}  →  {
       uid:       string,
       name:      string,       (from Google display name)
       username:  string,       (chosen by user, lowercase, trimmed)
       email:     string,
       createdAt: Timestamp,
     }

   This file must be loaded AFTER the three Firebase compat scripts
   and BEFORE chat.js.

   Usage:
     await window.vaaniProfile.create(user, username)
     const profile = await window.vaaniProfile.get(uid)
     const taken   = await window.vaaniProfile.isUsernameTaken(username)
================================================================ */

(function () {
  "use strict";

  var COLLECTION = "users";
  var _db = null;

  /* ── Wait for compat SDK ──────────────────────────────────────── */
  function _waitForFirebase(cb, tries) {
    tries = tries || 0;
    if (
      typeof firebase !== "undefined" &&
      typeof firebase.app       === "function" &&
      typeof firebase.firestore === "function"
    ) {
      cb();
    } else if (tries < 80) {
      setTimeout(function () { _waitForFirebase(cb, tries + 1); }, 50);
    } else {
      console.error("[Vaani Profile] Firebase compat SDK not found.");
    }
  }

  function _init() {
  try {
    // ✅ Use default Firebase app (same as auth)
    _db = firebase.firestore();

    console.log("[Vaani Profile] profile.js ready ✓");
  } catch (err) {
    console.error("[Vaani Profile] Init error:", err.message);
  }
}

function _init() {
  try {
    _db = firebase.firestore(); // ✅ use default app
    console.log("[Vaani Profile] profile.js ready ✓");
  } catch (err) {
    console.error("[Vaani Profile] Init error:", err.message);
  }
}

  /* ── Username validation ──────────────────────────────────────── */
  function _validateUsername(username) {
    if (!username || !username.trim()) {
      return "Username cannot be empty.";
    }
    var u = username.trim().toLowerCase();
    if (u.length < 3) {
      return "Username must be at least 3 characters.";
    }
    if (u.length > 20) {
      return "Username must be 20 characters or less.";
    }
    if (!/^[a-z0-9_]+$/.test(u)) {
      return "Only letters, numbers and underscores allowed.";
    }
    return null; /* null = valid */
  }

  /* ── Public API ──────────────────────────────────────────────── */
  window.vaaniProfile = {

    /**
     * get(uid)
     * Returns the profile object for the given uid, or null if not found.
     */
    get: async function (uid) {
      if (!_db) { console.error("[Vaani Profile] DB not ready."); return null; }
      try {
        var doc = await _db.collection(COLLECTION).doc(uid).get();
        return doc.exists ? doc.data() : null;
      } catch (err) {
        console.error("[Vaani Profile] get() error:", err.message);
        return null;
      }
    },

    /**
     * create(user, username)
     * Creates a new profile document. Throws a descriptive Error on failure.
     * Safe to call multiple times — uses set() with merge:false guard.
     */
    create: async function (user, username) {
      if (!_db) {
         await new Promise((resolve) => {
            var check = setInterval(() => {
               if (_db) {
                  clearInterval(check);
                  resolve();
               }
            }, 50);
         });
      }
      if (!user)    throw new Error("User is required.");

      /* Validate */
      var validationError = _validateUsername(username);
      if (validationError) throw new Error(validationError);

      var u = username.trim().toLowerCase();

      /* Check for duplicate username */
      var taken = await this.isUsernameTaken(u);
      if (taken) throw new Error("That username is already taken. Try another.");

      /* Check if profile already exists (prevent duplicate creation on re-submit) */
      var existing = await this.get(user.uid);
      if (existing) {
        console.log("[Vaani Profile] Profile already exists — skipping create.");
        return existing;
      }

      var profileData = {
        uid:       user.uid,
        name:      user.displayName || "",
        username:  u,
        email:     user.email || "",
        photoURL:  user.photoURL  || "",
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      };

      await _db.collection(COLLECTION).doc(user.uid).set(profileData);
      console.log("[Vaani Profile] Profile created for:", user.email);
      return profileData;
    },

    /**
     * isUsernameTaken(username)
     * Returns true if any document in /users has this username.
     */
    isUsernameTaken: async function (username) {
      if (!_db) return false;
      try {
        var u   = (username || "").trim().toLowerCase();
        var snap = await _db
          .collection(COLLECTION)
          .where("username", "==", u)
          .limit(1)
          .get();
        return !snap.empty;
      } catch (err) {
        console.error("[Vaani Profile] isUsernameTaken() error:", err.message);
        return false;
      }
    },

    /**
     * validateUsername(username)
     * Returns an error string or null if valid.
     * Exposed so the UI can give live feedback.
     */
    validateUsername: _validateUsername,
  };

  _waitForFirebase(_init);
  console.log("[Vaani Profile] profile.js loaded ✓");
})();
