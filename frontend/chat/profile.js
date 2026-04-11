/* ================================================================
   Vaani — profile.js  v4.0
================================================================ */

import { profilePageTemplate, profilePageSkeleton } from "./components/ProfilePage.js";

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
  var _myProfileState = {
    isEditing: false,
    profile: null,
    status: null,
    originalProfile: null,
    unsub: null,
    host: null,
  };
  var _presenceBoundUid = "";
  var _presenceActivityTimer = null;
  var _presenceActivityEventsBound = false;
  var _presenceOnlineState = null;

  function _formatLastSeen(ts) {
    if (!ts) return "—";
    try {
      var date = typeof ts.toDate === "function" ? ts.toDate() : new Date(ts);
      if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "—";
      return date.toLocaleString();
    } catch (_) {
      return "—";
    }
  }

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

  function _validateUsername(raw) {
    var v = (raw || "").trim();
    if (!v) return "Username is required.";
    if (v.length < 3) return "At least 3 characters required.";
    if (v.length > 20) return "Maximum 20 characters allowed.";
    if (!/^[a-zA-Z0-9_]+$/.test(v)) {
      return "Only letters, numbers and underscores allowed.";
    }

    return null;
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
    var showStatus = safeData.status && typeof safeData.status.showStatus === "boolean"
      ? safeData.status.showStatus
      : !(safeData.status && safeData.status.visibility === false);
    return {
      name: String(safeData.name || "").trim(),
      username: String(safeData.username || "").trim().toLowerCase(),
      city: String(safeData.city || "").trim(),
      bio: String(safeData.bio || "").trim(),
      location: String(safeData.location || safeData.city || "").trim(),
      interests: _toArray(safeData.interests),
      photoURL: String(safeData.photoURL || "").trim(),
      languages: _toArray(safeData.languages),
      fluentLanguages: _toArray(safeData.fluentLanguages),
      localExpertise: _toArray(safeData.localExpertise),
      links: _toLinksObject(safeData.links),
      status: {
        isOnline: !!(safeData.status && safeData.status.isOnline),
        isTyping: !!(safeData.status && safeData.status.isTyping),
        showStatus: showStatus,
        lastSeen: safeData.status ? safeData.status.lastSeen : null,
      },
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
    return null;
  }

  function _profileEditSnapshot(data) {
    var safe = data && typeof data === "object" ? data : {};
    var links = _toLinksObject(safe.links);
    var linkKeys = Object.keys(links).sort();
    var orderedLinks = {};
    linkKeys.forEach(function (key) { orderedLinks[key] = links[key]; });

    return JSON.stringify({
      name: String(safe.name || "").trim(),
      username: String(safe.username || "").trim().toLowerCase(),
      bio: String(safe.bio || "").trim(),
      location: String(safe.location || safe.city || "").trim(),
      interests: _toArray(safe.interests),
      photoURL: String(safe.photoURL || "").trim(),
      links: orderedLinks,
      languages: _toArray(safe.languages),
      fluentLanguages: _toArray(safe.fluentLanguages),
      localExpertise: _toArray(safe.localExpertise),
    });
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
      city: cleaned.location || cleaned.city || "",
      location: cleaned.location || cleaned.city || "",
      bio: cleaned.bio,
      interests: cleaned.interests,
      photoURL: cleaned.photoURL,
      languages: cleaned.languages,
      fluentLanguages: cleaned.fluentLanguages,
      localExpertise: cleaned.localExpertise,
      links: cleaned.links,
      lastActive: firebase.firestore.FieldValue.serverTimestamp(),
      status: {
        isOnline: !!(cleaned.status && cleaned.status.isOnline),
        isTyping: !!(cleaned.status && cleaned.status.isTyping),
        showStatus: cleaned.status && typeof cleaned.status.showStatus === "boolean" ? cleaned.status.showStatus : true,
        lastSeen: cleaned.status && cleaned.status.lastSeen ? cleaned.status.lastSeen : firebase.firestore.FieldValue.serverTimestamp(),
      },
    };

    if (!existing.exists || !existing.data().joinedDate) {
      payload.joinedDate = firebase.firestore.FieldValue.serverTimestamp();
    }

    await docRef.set(payload, { merge: true });
    return Object.assign({}, existing.exists ? existing.data() : {}, payload);
  }

  function _readFormState() {
    var next = Object.assign({}, _myProfileState.profile || {});
    var name = document.getElementById("vmpName");
    var username = document.getElementById("vmpUsername");
    var bio = document.getElementById("vmpBio");
    var interests = document.getElementById("vmpInterests");
    var location = document.getElementById("vmpLocation");

    next.name = name ? name.value.trim() : next.name;
    next.username = username ? username.value.trim().toLowerCase() : next.username;
    next.bio = bio ? bio.value.trim() : next.bio;
    next.interests = interests ? _toArray(interests.value) : next.interests;
    next.location = location ? location.value.trim() : next.location;
    return next;
  }

  function _setProfileViewMode(mode) {
    if (window.vaaniChat && typeof window.vaaniChat.setPanelView === "function") {
      window.vaaniChat.setPanelView(mode);
    }
  }

  async function _uploadPhoto(uid, file) {
    if (!file) return;
    if (!firebase || typeof firebase.storage !== "function") {
      throw new Error("Firebase Storage is not available.");
    }
    var storage = firebase.storage();
    var ref = storage.ref("profilePics/" + uid);
    await ref.put(file);
    var url = await ref.getDownloadURL();
    await _getDb().collection(COLLECTION).doc(uid).set({ photoURL: url }, { merge: true });
    return url;
  }

  function _bindMyProfileEvents(uid) {
    var editBtn = document.getElementById("vmpEditBtn");
    var saveBtn = document.getElementById("vmpSaveBtn");
    var cancelBtn = document.getElementById("vmpCancelBtn");
    var toggle = document.getElementById("statusVisibility");
    var photoBtn = document.getElementById("vmpPhotoBtn");
    var changePhotoBtn = document.getElementById("vmpChangePhotoBtn");
    var photoInput = document.getElementById("vmpPhotoInput");

    if (editBtn) {
      editBtn.addEventListener("click", function () {
        _myProfileState.isEditing = true;
        _renderMyProfile();
      });
    }
    if (saveBtn) {
      saveBtn.addEventListener("click", async function () {
        var next = _readFormState();
        try {
          await saveProfile(uid, Object.assign({}, next, { status: _myProfileState.status || {} }));
          _myProfileState.isEditing = false;
          if (typeof window.showToast === "function") window.showToast("Profile saved");
        } catch (err) {
          if (typeof window.showToast === "function") window.showToast(err.message || "Could not save profile.");
        }
      });
    }
    if (cancelBtn) {
      cancelBtn.addEventListener("click", function () {
        _myProfileState.isEditing = false;
        _myProfileState.profile = Object.assign({}, _myProfileState.originalProfile || _myProfileState.profile || {});
        _renderMyProfile();
      });
    }
    if (toggle) {
      toggle.addEventListener("change", async function () {
        try {
          await _getDb().collection(COLLECTION).doc(uid).set({
            status: {
              showStatus: !!toggle.checked,
              lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
            }
          }, { merge: true });
        } catch (_) {
          if (typeof window.showToast === "function") window.showToast("Could not update status visibility.");
        }
      });
    }

    function openPicker() {
      if (photoInput) photoInput.click();
    }

    function openPhotoIfAvailable() {
      var url = (_myProfileState.profile && _myProfileState.profile.photoURL) || "";
      if (!url) {
        if (typeof window.showToast === "function") window.showToast("No profile photo available.");
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
    }

    if (photoBtn) {
      photoBtn.addEventListener("click", function () {
        if (_myProfileState.isEditing) {
          openPhotoIfAvailable();
          return;
        }
        openPicker();
      });
    }
    if (changePhotoBtn) changePhotoBtn.addEventListener("click", openPicker);

    if (photoInput) {
      photoInput.addEventListener("change", async function (event) {
        var file = event && event.target && event.target.files && event.target.files[0];
        if (!file) return;
        try {
          await _uploadPhoto(uid, file);
          if (typeof window.showToast === "function") window.showToast("Photo updated");
        } catch (err) {
          if (typeof window.showToast === "function") window.showToast(err.message || "Photo upload failed.");
        } finally {
          photoInput.value = "";
        }
      });
    }
  }

  function _renderMyProfile() {
    if (!_myProfileState.host || !_myProfileState.profile) return;
    var status = _myProfileState.status || {};
    _myProfileState.host.innerHTML = profilePageTemplate({
      isEditing: _myProfileState.isEditing,
      profile: _myProfileState.profile,
      status: {
        isOnline: !!status.isOnline,
        isTyping: !!status.isTyping,
        showStatus: typeof status.showStatus === "boolean" ? status.showStatus : true,
        lastSeen: _formatLastSeen(status.lastSeen),
      }
    });
    _bindMyProfileEvents(_myProfileState.profile.uid);
  }

  function _cleanupMyProfileWatcher() {
    if (_myProfileState.unsub) {
      _myProfileState.unsub();
      _myProfileState.unsub = null;
    }
  }

  function openMyProfile() {
    var currentUid = window._vaaniCurrentUser && window._vaaniCurrentUser.uid ? String(window._vaaniCurrentUser.uid) : "";
    var host = document.getElementById("vcProfileScreen");
    var db = _getDb();
    if (!currentUid || !host || !db) return false;
    _bindPresence(currentUid);

    _setProfileViewMode("profile");
    _myProfileState.host = host;
    _myProfileState.isEditing = false;
    host.innerHTML = profilePageSkeleton();

    _cleanupMyProfileWatcher();
    _myProfileState.unsub = db.collection(COLLECTION).doc(currentUid).onSnapshot(function (doc) {
      var data = doc.exists ? doc.data() : {};
      var normalized = _normalizeProfileData(data);
      normalized.uid = currentUid;

      var hasEditableChange = _profileEditSnapshot(normalized) !== _profileEditSnapshot(_myProfileState.profile || {});
      _myProfileState.status = normalized.status || {};

      if (_myProfileState.isEditing && !hasEditableChange) {
        return;
      }

      _myProfileState.profile = normalized;
      _myProfileState.originalProfile = Object.assign({}, normalized);
      _renderMyProfile();
    }, function () {
      host.innerHTML = '<div class="vg-screen vg-loading-screen"><p>Could not load profile.</p></div>';
    });

    return true;
  }

  function closeMyProfile() {
    _cleanupMyProfileWatcher();
    _myProfileState.host = null;
    _myProfileState.profile = null;
    _myProfileState.originalProfile = null;
    _myProfileState.isEditing = false;
    _presenceOnlineState = null;
  }

  window.vaaniProfile = {
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

    openMyProfile: openMyProfile,
    closeMyProfile: closeMyProfile,

    renderUserProfile: function (user) {
      var root = document.getElementById("vaaniChat") || document.getElementById("profile-root");
      if (!root) return false;

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
        status: {
          isOnline: true,
          isTyping: false,
          showStatus: true,
          lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
        }
      });
      return profile;
    },

    validateUsername: _validateUsername,
    normalizeProfileData: _normalizeProfileData,
    validateRequired: _validateRequired,
  };

  window.saveProfile = saveProfile;
  window.getUserProfile = getUserProfile;

  async function _setPresence(uid, isOnline) {
    if (!uid) return;
    var nextOnline = !!isOnline;
    if (_presenceOnlineState === nextOnline) return;

    var db = _getDb();
    if (!db || !firebase || !firebase.firestore || !firebase.firestore.FieldValue) return;
    _presenceOnlineState = nextOnline;

    var statusPayload = { isOnline: nextOnline };
    if (!nextOnline) {
      statusPayload.lastSeen = firebase.firestore.FieldValue.serverTimestamp();
    }

    try {
      await db.collection(COLLECTION).doc(uid).set({ status: statusPayload }, { merge: true });
    } catch (_) {
      _presenceOnlineState = null;
    }
  }

  function _scheduleInactivity(uid) {
    if (!uid) return;
    if (_presenceActivityTimer) clearTimeout(_presenceActivityTimer);
    _presenceActivityTimer = setTimeout(function () {
      _setPresence(uid, false);
    }, 5 * 60 * 1000);
  }

  function _bindPresence(uid) {
    if (!uid || _presenceBoundUid === uid) return;
    _presenceBoundUid = uid;
    _setPresence(uid, true);
    _scheduleInactivity(uid);

    if (_presenceActivityEventsBound) return;
    _presenceActivityEventsBound = true;
    ["mousemove", "keydown", "touchstart", "scroll", "click"].forEach(function (eventName) {
      window.addEventListener(eventName, function () {
        _setPresence(_presenceBoundUid, true);
        _scheduleInactivity(_presenceBoundUid);
      }, { passive: true });
    });
    window.addEventListener("beforeunload", function () {
      _setPresence(_presenceBoundUid, false);
    });
    window.addEventListener("load", function () {
      _setPresence(_presenceBoundUid, true);
    });
  }

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

  console.log("[Vaani Profile] profile.js v4.0 loaded ✓");

  if (window.vaaniRouter && typeof window.vaaniRouter.getAuth === "function") {
    var auth = window.vaaniRouter.getAuth();
    if (auth && typeof auth.onAuthStateChanged === "function") {
      auth.onAuthStateChanged(function (user) {
        if (user && user.uid) _bindPresence(String(user.uid));
      });
    }
  }

})();
