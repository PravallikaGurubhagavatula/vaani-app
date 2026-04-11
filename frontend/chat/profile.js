/* ================================================================
   Vaani — profile.js  v3.0
   ================================================================
   First-time profile onboarding data API.
   Uses the same Firebase app instance as auth.js and chat.js.
================================================================ */

export async function getUserProfile(uid) {
  if (window.vaaniProfile && typeof window.vaaniProfile.get === "function") {
    return window.vaaniProfile.get(uid);
  }
  return null;
}

export function renderUserProfile(user) {
  if (window.vaaniProfile && typeof window.vaaniProfile.renderUserProfile === "function") {
    return window.vaaniProfile.renderUserProfile(user);
  }
  return false;
}

export function dispatchProfileAction(action, user) {
  if (window.vaaniProfile && typeof window.vaaniProfile.dispatchAction === "function") {
    return window.vaaniProfile.dispatchAction(action, user);
  }
  return false;
}

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
    if (!v) return "Username is required.";
    if (v.length < 3) return "At least 3 characters required.";
    if (v.length > 20) return "Maximum 20 characters allowed.";
    if (!/^[a-zA-Z0-9_]+$/.test(v)) {
      return "Only letters, numbers and underscores allowed.";
    }

    return null; // valid
  }

  function _toArray(value) {
    if (Array.isArray(value)) {
      return value.map(function (item) { return String(item || "").trim(); }).filter(Boolean);
    }
    if (typeof value === "string") {
      return value
        .split(",")
        .map(function (item) { return item.trim(); })
        .filter(Boolean);
    }
    return [];
  }

  function _toLinksObject(value) {
    if (!value || typeof value !== "object") return {};
    var normalized = {};
    Object.keys(value).forEach(function (key) {
      var safeKey = String(key || "").trim();
      var safeValue = String(value[key] || "").trim();
      if (!safeKey || !safeValue) return;
      normalized[safeKey] = safeValue;
    });
    return normalized;
  }

  function _normalizeProfileData(data) {
    var safeData = data && typeof data === "object" ? data : {};
    return {
      name: String(safeData.name || "").trim(),
      username: String(safeData.username || "").trim().toLowerCase(),
      city: String(safeData.city || "").trim(),
      bio: String(safeData.bio || "").trim(),
      languages: _toArray(safeData.languages),
      fluentLanguages: _toArray(safeData.fluentLanguages),
      localExpertise: _toArray(safeData.localExpertise),
      links: _toLinksObject(safeData.links),
    };
  }

  async function _isUsernameTaken(db, uid, usernameLower) {
    var snap = await db
      .collection(COLLECTION)
      .where("usernameLower", "==", usernameLower)
      .limit(1)
      .get();
    if (snap.empty) return false;
    var doc = snap.docs[0];
    return doc.id !== uid;
  }

  function _validateRequired(data) {
    if (!data.name) return "Name is required.";
    var usernameError = _validateUsername(data.username);
    if (usernameError) return usernameError;
    if (!data.city) return "City is required.";
    return null;
  }

  function _dispatchProfileAction(action, user) {
    var safeAction = String(action || "").trim();
    if (!safeAction) return false;
    document.dispatchEvent(new CustomEvent("vaani:profile-action", {
      detail: {
        action: safeAction,
        user: user || null
      }
    }));
    return true;
  }

  async function saveProfile(uid, data) {
    if (!uid) throw new Error("Missing user id.");

    var db = _getDb();
    if (!db) throw new Error("Database not available. Please refresh.");

    var cleaned = _normalizeProfileData(data);
    var requiredError = _validateRequired(cleaned);
    if (requiredError) throw new Error(requiredError);

    var usernameLower = cleaned.username.toLowerCase();
    if (await _isUsernameTaken(db, uid, usernameLower)) {
      throw new Error("That username is already taken. Try another.");
    }

    var docRef = db.collection(COLLECTION).doc(uid);
    var existing = await docRef.get();
    var payload = {
      uid: uid,
      name: cleaned.name,
      username: cleaned.username,
      usernameLower: usernameLower,
      city: cleaned.city,
      bio: cleaned.bio,
      languages: cleaned.languages,
      fluentLanguages: cleaned.fluentLanguages,
      localExpertise: cleaned.localExpertise,
      links: cleaned.links,
      lastActive: firebase.firestore.FieldValue.serverTimestamp(),
    };

    if (!existing.exists || !existing.data().joinedDate) {
      payload.joinedDate = firebase.firestore.FieldValue.serverTimestamp();
    }

    await docRef.set(payload, { merge: true });
    return Object.assign({}, existing.exists ? existing.data() : {}, payload);
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

    saveProfile: async function (uid, data) {
      return saveProfile(uid, data);
    },

    dispatchAction: function (action, user) {
      return _dispatchProfileAction(action, user);
    },

    messageUser: function (user) {
      return _dispatchProfileAction("message", user);
    },

    renderUserProfile: function (user) {
      var root = document.getElementById("vaaniChat") || document.getElementById("profile-root");
      if (!root) return false;

      // Always replace the main container before rendering profile state.
      root.innerHTML = "";

      if (!user || typeof user !== "object") {
        root.innerHTML = '<div class="vg-screen vg-loading-screen"><p>User profile not available</p></div>';
        return false;
      }

      if (window.vaaniChat && typeof window.vaaniChat._renderChat === "function") {
        var current = (window.vaaniRouter && typeof window.vaaniRouter.getAuth === "function" && window.vaaniRouter.getAuth())
          ? window.vaaniRouter.getAuth().currentUser
          : null;
        if (current) {
          window.vaaniChat._renderChat(current, user);
          return true;
        }
      }

      root.innerHTML = '<div class="vg-screen vg-loading-screen"><p>User profile not available</p></div>';
      return false;
    },

    create: async function (user, username, city) {
      var auth = _getAuth();
      if (!auth) throw new Error("Auth not available. Please refresh.");
      if (!user || !user.uid) throw new Error("Invalid user. Please sign in again.");
      var profile = await saveProfile(user.uid, {
        name: user.displayName || "",
        username: username,
        city: city || "Unknown",
      });
      return profile;
    },

    /** Exposed for live UI validation */
    validateUsername: _validateUsername,
    normalizeProfileData: _normalizeProfileData,
    validateRequired: _validateRequired,
  };

  window.saveProfile = saveProfile;
  window.getUserProfile = getUserProfile;
  window.showProfileOnboarding = function (uid) {
    var auth = _getAuth();
    var user = auth && auth.currentUser ? auth.currentUser : null;
    if (!user || !user.uid || user.uid !== uid) {
      throw new Error("Signed-in user not available for onboarding.");
    }
    if (window.vaaniChat && typeof window.vaaniChat._renderProfile === "function") {
      window.vaaniChat._renderProfile(user);
      return;
    }
    throw new Error("Chat module not ready for onboarding.");
  };

  console.log("[Vaani Profile] profile.js v3.0 loaded ✓");

})();
