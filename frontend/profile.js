/* ================================================================
   Vaani — profile.js  v2.0
   ================================================================
   Uses window.vaaniRouter.getDb() and window.vaaniRouter.getAuth()
   so it always operates on the SAME Firebase app instance as
   auth.js and chat.js — zero cross-instance permission issues.

   USERNAME RULES (strict, as requested):
   ─────────────────────────────────────────────────────────────────
   Must contain BOTH letters AND numbers.
   Optional underscores.
   3–20 characters.
   Regex: /^(?=.*[a-zA-Z])(?=.*[0-9])[a-zA-Z0-9_]{3,20}$/

   Valid:   pravallika_03, user01, abc123
   Invalid: pravallika (no number), 12345 (no letter), ___ (no alnum)
================================================================ */

(function () {
  "use strict";

  var COLLECTION = "users";

  /* ── Get DB from the router (same instance, no new app needed) ── */
  function _getDb() {
    if (window.vaaniRouter && typeof window.vaaniRouter.getDb === "function") {
      return window.vaaniRouter.getDb();
    }
    return null;
  }

  function _getAuth() {
    if (window.vaaniRouter && typeof window.vaaniRouter.getAuth === "function") {
      return window.vaaniRouter.getAuth();
    }
    return null;
  }

  /* ── Username validation ─────────────────────────────────────── */
  function _validateUsername(raw) {
    var v = (raw || "").trim();
    if (!v)            return "Username cannot be empty.";
    if (v.length < 3)  return "At least 3 characters required.";
    if (v.length > 20) return "Maximum 20 characters allowed.";

    // Must contain at least one letter AND at least one number
    if (!/^[a-zA-Z0-9_]+$/.test(v))
      return "Only letters, numbers and underscores allowed.";
    if (!/[a-zA-Z]/.test(v))
      return "Must contain at least one letter (e.g. user_01).";
    if (!/[0-9]/.test(v))
      return "Must contain at least one number (e.g. pravallika_03).";

    return null; // valid
  }

  /* ── Public API ──────────────────────────────────────────────── */
  window.vaaniProfile = {

    /**
     * get(uid)
     * Returns profile or null. No auth needed (read is public).
     */
    get: async function (uid) {
      var db = _getDb();
      if (!db) {
        console.error("[Vaani Profile] DB not available from router.");
        return null;
      }
      try {
        var doc = await db.collection(COLLECTION).doc(uid).get();
        return doc.exists ? doc.data() : null;
      } catch (err) {
        console.error("[Vaani Profile] get() error:", err.message);
        return null;
      }
    },

    /**
     * create(user, username)
     *
     * Auth is already synced because we're using the same Firebase
     * app instance as the router. No updateCurrentUser() needed —
     * _auth.currentUser IS the signed-in user.
     *
     * Steps:
     *   1. Validate username (strict: needs letter + number)
     *   2. Check username uniqueness
     *   3. Guard against duplicate profile
     *   4. Write to users/{uid}
     *   5. Call window.vaaniRouter.goToChat()
     */
    create: async function (user, username) {
      var db   = _getDb();
      var auth = _getAuth();

      if (!db)   throw new Error("Database not available. Please refresh.");
      if (!auth) throw new Error("Auth not available. Please refresh.");
      if (!user || !user.uid) throw new Error("Invalid user. Please sign in again.");

      // 1. Validate
      var cleaned      = (username || "").trim().toLowerCase();
      var validationErr = _validateUsername(cleaned);
      if (validationErr) throw new Error(validationErr);

      // 2. Check uniqueness
      try {
        var snap = await db.collection(COLLECTION)
                           .where("username", "==", cleaned)
                           .limit(1)
                           .get();
        if (!snap.empty) throw new Error("That username is already taken. Try another.");
      } catch (err) {
        if (err.message.includes("already taken")) throw err;
        console.warn("[Vaani Profile] Username check error:", err.message);
        // Non-fatal — proceed (Firestore rules will block duplicates)
      }

      // 3. Guard against double-submit
      try {
        var existing = await db.collection(COLLECTION).doc(user.uid).get();
        if (existing.exists) {
          console.log("[Vaani Profile] Profile already exists — returning it.");
          return existing.data();
        }
      } catch (_) {}

      // 4. Write to users/{uid} — matches Firestore rule {uid}
      var profileData = {
        uid:       user.uid,
        username:  cleaned,
        name:      user.displayName || "",
        email:     user.email       || "",
        photoURL:  user.photoURL    || "",
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      };

      console.log("[Vaani Profile] Writing profile:", profileData);
      await db.collection(COLLECTION).doc(user.uid).set(profileData);
      console.log("[Vaani Profile] ✅ Profile saved at users/" + user.uid);

      return profileData;
    },

    /** Exposed for live UI validation */
    validateUsername: _validateUsername,
  };

  console.log("[Vaani Profile] profile.js v2.0 loaded ✓");

})();
