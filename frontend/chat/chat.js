import { getUserProfile, renderUserProfile } from "./profile.js";
import {
  bindPresence,
  subscribeUserPresence,
  subscribeTyping,
  emitTyping,
  clearTyping,
  formatLastSeenLabel
} from "./userStatus.js";
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { createVaaniTranslationPanel } from "./VaaniTranslationPanel.js";
import { processMessage, translationCache, clearCache, cancelMessageProcessing, getCached, setCached } from "./useTranslation.js";
import { translatePipeline } from "../../backend/translation_engine.js";

/* Owns chat message flow/rendering + translation wiring for this screen only.
   Does not implement provider calls directly (delegates to translation_engine). */

/* ================================================================
   Vaani — chat.js  v4.2
   Fixes applied:
     1. _migrateTopLevelMessages — rules now allow reading top-level
        /messages; migration is idempotent and skips already-copied docs.
     2. _renderChat — await ALL migrations before attaching listeners,
        eliminating the "empty list on first load" race condition.
     3. _createChatListListener — deduplicate chat docs by participant
        pair, preferring the canonical sorted-pair ID doc so the message
        listener always attaches to the correct chatId.
     4. _openChatUI — no longer calls _setSelectedChatUser() before DOM
        is ready; tears down the old listener when switching chats.
     5. listenToMessages — "firstFire" flag ensures the first snapshot
        always renders (even when empty), fixing "Start a conversation"
        not appearing on brand-new chats.
     6. sendMessage — always includes participants[] in the message doc
        so Firestore rules (which check participants) never reject it.
   ================================================================ */

(function () {
  "use strict";

  var CHAT_ROOT_ID = "vaaniChat";
  var _searchDebounceTimer = null;
  var _latestSearchQuery = "";
  var _outsideClickHandler = null;
  var _unsubscribeIncomingRequests = null;
  var _unsubscribeSentRequests = null;
  var _unsubscribeConnections = null;
  var _unsubscribeRequestState = null;
  var _unsubscribeMessages = null;
  var _activeMessageListenerKey = null;
  var _activeMessagesSignature = "";
  var _optimisticMessages = [];
  var _optimisticCounter = 0;
  var _unsubscribeChatList = null;
  var _replyToMessage = null; // { id, text, senderId }
  var _activeChatListListenerUid = null;
  var _connectedUidSet = new Set();
  var _connectionUsersByDocId = Object.create(null);
  var _userProfileCache = Object.create(null);
  var _renderedChatListSignature = "";
  var _forceRenderChatList = false;
  var _hasLoadedChatListOnce = false;
  var _chatListOpenRequestId = 0;
  var _chatBackfillPromisesByUid = Object.create(null);
  var _activeChatId = null;
  var _visualViewportResizeHandler = null;
  var _selectedChatUser = null;
  var _panelView = "home";
  var _loading = true;
  var _messages = [];
  var _inputMessage = "";
  var _messagesContainerRef = null;
  var _shouldStickToBottom = true;
  var _chatPresenceUnsub = null;
  var _chatTypingUnsub = null;
  var _myPresenceUnbind = null;
  var _headerPresenceState = { showStatus: true, isOnline: false, lastSeen: null };
  var _headerTypingFromUserId = "";
  var _typingHeartbeatTimer = null;
  var _typingClearTimer = null;
  var _voiceRecorder = null;
  var _voiceRecorderStream = null;
  var _voiceRecorderChunks = [];
  var _voiceRecordStartTs = 0;
  var _voiceRecordTimer = null;
  var _voiceRecordingActive = false;
  var _voicePressActive = false;
  var _activeVoicePlayback = null;
  var _searchResultCache = [];
  var _searchDropdownRef = null;
  var _pendingOutgoingUidSet = new Set();
  var _pendingIncomingUidSet = new Set();
  var _voiceUploadInFlight = false;
  var _voiceUploadError = "";
  var _voicePendingDraft = null;
  var _voiceUploadCancelFn = null;
  var _translationPanelController = null;
  var _translationConfig = {
    panelOpen: false,
    translateEnabled: false,
    transliterateEnabled: false,
    targetLanguage: "English",
    showBelowOriginal: true,
    languageQuery: "",
    featureEnabled: true
  };
  var _translationResultsById = new Map();
  var _translationLoadingById = new Map();
  var _translationBatchToken = 0;
  var _translationContextMenuEl = null;
  var _translationContextDismissors = [];
  var _translationNoticeTimeout = null;
  var VOICE_UPLOAD_TIMEOUT_MS = 10000;
  var VOICE_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

  var CHATS_COLLECTION = "chats";
  var MESSAGES_COLLECTION = "messages";
  var LEGACY_MESSAGES_COLLECTION = "vaani_messages";
  var incomingRequests = [];
  var sentRequests = [];

  var REQUESTS_COLLECTION = "connectionRequests";
  var CONNECTIONS_COLLECTION = "connections";
  var NOTIFICATIONS_COLLECTION = "notifications";
  var USER_REQUESTS_SENT_COLLECTION = "requestsSent";
  var USER_REQUESTS_RECEIVED_COLLECTION = "requestsReceived";
  var _incomingRequestsById = Object.create(null);
  var _sentRequestsById = Object.create(null);

  function _root() {
    return document.getElementById(CHAT_ROOT_ID);
  }

  function _esc(value) {
    var el = document.createElement("div");
    el.appendChild(document.createTextNode(String(value || "")));
    return el.innerHTML;
  }

  function _upgradePhotoURL(url) {
  if (!url) return url;
  // Google profile photos: bump s96-c → s400-c for HD
  return url.replace(/=s\d+-c($|\?)/, '=s400-c$1')
             .replace(/(\/photo\.jpg)\?sz=\d+/, '$1?sz=400');
}
   
  function _safeTimestampValue(value) {
    if (!value) return null;
    if (typeof value.toMillis === "function") return value;
    if (value instanceof Date) return firebase.firestore.Timestamp.fromDate(value);
    if (typeof value === "number" && isFinite(value)) {
      return firebase.firestore.Timestamp.fromMillis(value);
    }
    return null;
  }

  function _loadProfileCache(uid) {
    var key = String(uid || "").trim();
    if (!key) return null;
    if (_userProfileCache[key]) return _userProfileCache[key];
    try {
      var raw = sessionStorage.getItem("vaani_profile_cache_" + key);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      _userProfileCache[key] = parsed;
      return parsed;
    } catch (err) {
      return null;
    }
  }

  function _saveProfileCache(uid, profile) {
    var key = String(uid || "").trim();
    if (!key || !profile || typeof profile !== "object") return;
    _userProfileCache[key] = profile;
    try {
      sessionStorage.setItem("vaani_profile_cache_" + key, JSON.stringify(profile));
    } catch (err) {}
  }

  function _extractLegacyMessageUsers(data) {
    if (!data) return null;
    var senderId = data.senderId || data.uid || data.fromUid || data.fromUserId || "";
    var receiverId = data.receiverId || data.toUid || data.toUserId || "";
    var participants = Array.isArray(data.participants) ? data.participants.filter(Boolean) : [];
    if (!senderId && participants.length) senderId = participants[0];
    if (!receiverId && participants.length > 1) {
      receiverId = participants.find(function (uid) { return uid && uid !== senderId; }) || "";
    }
    if (!senderId || !receiverId || senderId === receiverId) return null;
    return [String(senderId), String(receiverId)].sort();
  }

  async function _backfillChatsFromLegacyMessages() {
    var db = window.vaaniRouter && typeof window.vaaniRouter.getDb === "function"
      ? window.vaaniRouter.getDb() : null;
    var currentUid = window._vaaniCurrentUser && window._vaaniCurrentUser.uid
      ? String(window._vaaniCurrentUser.uid) : "";
    if (!db || !currentUid) return;
    if (_chatBackfillPromisesByUid[currentUid]) return _chatBackfillPromisesByUid[currentUid];

    _chatBackfillPromisesByUid[currentUid] = (async function () {
      try {
        var existingChatKeySet = new Set();
        var existingChatSnap = await db.collection(CHATS_COLLECTION)
          .where("participants", "array-contains", currentUid)
          .orderBy("updatedAt", "desc")
          .limit(20)
          .get();
        (existingChatSnap && typeof existingChatSnap.forEach === "function" ? existingChatSnap.docs : []).forEach(function (doc) {
          var data = doc.data() || {};
          var p = Array.isArray(data.participants) ? data.participants.filter(Boolean).map(String).sort() : [];
          if (p.length === 2) existingChatKeySet.add(p.join("|"));
        });

        var groupedByPair = Object.create(null);
        var legacySnapshots = await Promise.all([
          db.collection(LEGACY_MESSAGES_COLLECTION).where("senderId",   "==", currentUid).get(),
          db.collection(LEGACY_MESSAGES_COLLECTION).where("receiverId", "==", currentUid).get(),
          db.collection(LEGACY_MESSAGES_COLLECTION).where("uid",        "==", currentUid).get()
        ]);
        var seenMessageIds = new Set();

        legacySnapshots.forEach(function (snapshot) {
          snapshot.forEach(function (doc) {
            if (seenMessageIds.has(doc.id)) return;
            seenMessageIds.add(doc.id);
            var data = doc.data() || {};
            var participants = _extractLegacyMessageUsers(data);
            if (!participants || participants.indexOf(currentUid) === -1) return;
            var pairKey = participants.join("|");
            var existing = groupedByPair[pairKey];
            var timestamp = _safeTimestampValue(data.timestamp) || _safeTimestampValue(data.createdAt);
            if (!existing) {
              groupedByPair[pairKey] = { participants: participants, latestText: String(data.text || ""), latestTimestamp: timestamp };
              return;
            }
            var prevMillis = existing.latestTimestamp && typeof existing.latestTimestamp.toMillis === "function" ? existing.latestTimestamp.toMillis() : 0;
            var nextMillis = timestamp && typeof timestamp.toMillis === "function" ? timestamp.toMillis() : 0;
            if (nextMillis >= prevMillis) { existing.latestText = String(data.text || ""); existing.latestTimestamp = timestamp; }
          });
        });

        var pairKeys = Object.keys(groupedByPair);
        if (!pairKeys.length) return;
        var batch = db.batch();
        var writes = 0;
        pairKeys.forEach(function (pairKey) {
          if (existingChatKeySet.has(pairKey)) return;
          var group = groupedByPair[pairKey];
          if (!group || !group.participants || group.participants.length !== 2) return;
          var ts = group.latestTimestamp || firebase.firestore.FieldValue.serverTimestamp();
          var sortedPair = group.participants;
          var chatId = sortedPair[0] + "_" + sortedPair[1];
          batch.set(db.collection(CHATS_COLLECTION).doc(chatId), {
            participants: sortedPair, lastMessage: group.latestText || "", updatedAt: ts, createdAt: ts
          }, { merge: true });
          writes += 1;
        });
        if (writes > 0) { await batch.commit(); console.log("[Vaani] Legacy chat backfill created " + writes + " chat doc(s)."); }
      } catch (err) {
        if (err && err.code === "permission-denied") {
          console.log("[Vaani] Legacy chat backfill skipped (no legacy data access).");
        } else {
          console.warn("[Vaani] Legacy chat backfill failed:", err && err.message);
        }
      }
    })();
    return _chatBackfillPromisesByUid[currentUid];
  }

  async function _migrateLegacyMessages() {
    var db = window.vaaniRouter && typeof window.vaaniRouter.getDb === "function"
      ? window.vaaniRouter.getDb() : null;
    var currentUid = window._vaaniCurrentUser && window._vaaniCurrentUser.uid
      ? String(window._vaaniCurrentUser.uid) : "";
    if (!db || !currentUid) { console.warn("[Vaani] _migrateLegacyMessages: missing db/uid — abort."); return; }

    var sessionKey = "vaani_migration_done_" + currentUid;
    if (sessionStorage.getItem(sessionKey)) { console.log("[Vaani] _migrateLegacyMessages: skipping (already ran)."); return; }
    console.log("[Vaani] _migrateLegacyMessages: starting for uid:", currentUid);

    var migrated = 0, skipped = 0, errors = 0;
    try {
      var snapshots = await Promise.all([
        db.collection(LEGACY_MESSAGES_COLLECTION).where("uid",        "==", currentUid).get(),
        db.collection(LEGACY_MESSAGES_COLLECTION).where("senderId",   "==", currentUid).get(),
        db.collection(LEGACY_MESSAGES_COLLECTION).where("receiverId", "==", currentUid).get()
      ]);
      var seenDocIds = new Set(), docsToProcess = [];
      snapshots.forEach(function (snap) {
        snap.forEach(function (doc) {
          if (seenDocIds.has(doc.id)) return;
          seenDocIds.add(doc.id);
          docsToProcess.push(doc);
        });
      });
      console.log("[Vaani] _migrateLegacyMessages: found", docsToProcess.length, "candidate(s).");
      if (!docsToProcess.length) { sessionStorage.setItem(sessionKey, "1"); return; }

      for (var i = 0; i < docsToProcess.length; i++) {
        var doc = docsToProcess[i]; var data = doc.data() || {};
        try {
          if (data.chatId && data.senderId && data.receiverId && data.participants) { skipped++; continue; }
          var text = String(data.text || "").trim();
          if (!text) { skipped++; continue; }
          var senderId = String(data.senderId || data.uid || data.fromUid || data.fromUserId || "").trim();
          if (!senderId) { skipped++; continue; }
          var receiverId = String(data.receiverId || data.toUid || data.toUserId || "").trim();
          if (!receiverId && Array.isArray(data.participants)) {
            receiverId = data.participants.find(function (uid) { return uid && uid !== senderId; }) || "";
          }
          if (!receiverId) { if (senderId !== currentUid) { receiverId = currentUid; } else { skipped++; continue; } }
          if (senderId === receiverId) { skipped++; continue; }
          if (senderId !== currentUid && receiverId !== currentUid) { skipped++; continue; }

          var participants = [senderId, receiverId].sort();
          var chatId = participants[0] + "_" + participants[1];
          var chatRef = db.collection(CHATS_COLLECTION).doc(chatId);
          var chatSnap = await chatRef.get();
          if (!chatSnap.exists) {
            var chatTs = _safeTimestampValue(data.timestamp) || _safeTimestampValue(data.createdAt) || firebase.firestore.FieldValue.serverTimestamp();
            await chatRef.set({ participants: participants, lastMessage: text, createdAt: chatTs, updatedAt: chatTs }, { merge: true });
          }
          var msgTs = _safeTimestampValue(data.timestamp) || _safeTimestampValue(data.createdAt) || firebase.firestore.FieldValue.serverTimestamp();
          await db.collection(CHATS_COLLECTION).doc(chatId).collection(MESSAGES_COLLECTION).add({
            text: text, senderId: senderId, receiverId: receiverId,
            participants: participants, chatId: chatId, timestamp: msgTs, _migratedFrom: doc.id
          });
          await db.collection(LEGACY_MESSAGES_COLLECTION).doc(doc.id).update({
            _migrated: true, _chatId: chatId, _migratedAt: firebase.firestore.FieldValue.serverTimestamp()
          });
          migrated++; console.log("[Vaani] migrated:", doc.id, "→", chatId);
        } catch (docErr) { errors++; console.error("[Vaani] _migrateLegacyMessages: error on", doc.id, ":", docErr); }
      }
    } catch (fatalErr) {
      if (fatalErr && fatalErr.code === "permission-denied") {
        console.log("[Vaani] _migrateLegacyMessages: skipped (no legacy collection access).");
      } else {
        console.warn("[Vaani] _migrateLegacyMessages: fatal:", fatalErr && fatalErr.message);
      }
      return;
    }

    sessionStorage.setItem(sessionKey, "1");
    console.log("[Vaani] _migrateLegacyMessages: done —", migrated, "migrated |", skipped, "skipped |", errors, "errors");
  }

  // ── FIX 1: _migrateTopLevelMessages ─────────────────────────────────────
  // Rules now allow reading /messages where user is senderId or receiverId.
  // Uses canonical sorted-pair chatId and checks _migratedFrom to stay idempotent.
  async function _migrateTopLevelMessages() {
    var db = window.vaaniRouter && typeof window.vaaniRouter.getDb === "function"
      ? window.vaaniRouter.getDb() : null;
    var currentUid = window._vaaniCurrentUser && window._vaaniCurrentUser.uid
      ? String(window._vaaniCurrentUser.uid) : "";
    if (!db || !currentUid) return;

    var sessionKey = "vaani_toplevel_migration_" + currentUid;
    if (sessionStorage.getItem(sessionKey)) { console.log("[Vaani] _migrateTopLevelMessages: skipping (already ran)."); return; }
    console.log("[Vaani] _migrateTopLevelMessages: starting for uid:", currentUid);

    var migrated = 0, skipped = 0, errors = 0;
    try {
      var snaps = await Promise.all([
        db.collection("messages").where("senderId",   "==", currentUid).get(),
        db.collection("messages").where("receiverId", "==", currentUid).get()
      ]);
      var seen = new Set(), docs = [];
      snaps.forEach(function (snap) {
        snap.forEach(function (doc) {
          if (seen.has(doc.id)) return;
          seen.add(doc.id); docs.push(doc);
        });
      });
      console.log("[Vaani] _migrateTopLevelMessages: found", docs.length, "doc(s).");

      for (var i = 0; i < docs.length; i++) {
        var doc = docs[i]; var data = doc.data() || {};
        try {
          if (data._migrated) { skipped++; continue; }
          var senderId   = String(data.senderId   || "").trim();
          var receiverId = String(data.receiverId || "").trim();
          var text       = String(data.text       || "").trim();
          if (!senderId || !receiverId || !text) { skipped++; continue; }
          if (senderId === receiverId) { skipped++; continue; }
          if (senderId !== currentUid && receiverId !== currentUid) { skipped++; continue; }

          var participants = [senderId, receiverId].sort();
          var chatId = participants[0] + "_" + participants[1];

          // Idempotency: skip if already in subcollection
          var existingSnap = await db.collection(CHATS_COLLECTION).doc(chatId)
            .collection(MESSAGES_COLLECTION).where("_migratedFrom", "==", doc.id).limit(1).get();
          if (!existingSnap.empty) { skipped++; continue; }

          // Ensure parent chat doc with canonical ID
          var chatRef = db.collection(CHATS_COLLECTION).doc(chatId);
          var chatSnap = await chatRef.get();
          if (!chatSnap.exists) {
            var ts = _safeTimestampValue(data.timestamp) || firebase.firestore.FieldValue.serverTimestamp();
            await chatRef.set({ participants: participants, lastMessage: text, createdAt: ts, updatedAt: ts }, { merge: true });
            console.log("[Vaani] _migrateTopLevelMessages: created chat doc:", chatId);
          }

          var msgTs = _safeTimestampValue(data.timestamp) || firebase.firestore.FieldValue.serverTimestamp();
          await db.collection(CHATS_COLLECTION).doc(chatId).collection(MESSAGES_COLLECTION).add({
            text: text, senderId: senderId, receiverId: receiverId,
            participants: participants, chatId: chatId, timestamp: msgTs, _migratedFrom: doc.id
          });
          migrated++; console.log("[Vaani] _migrateTopLevelMessages: migrated", doc.id, "→", chatId);
        } catch (docErr) { errors++; console.error("[Vaani] _migrateTopLevelMessages: error on", doc.id, docErr); }
      }
    } catch (fatalErr) {
      if (fatalErr && fatalErr.code === "permission-denied") {
        console.log("[Vaani] _migrateTopLevelMessages: skipped (no /messages collection access).");
      } else {
        console.warn("[Vaani] _migrateTopLevelMessages: fatal:", fatalErr && fatalErr.message);
      }
      return;
    }

    sessionStorage.setItem(sessionKey, "1");
    console.log("[Vaani] _migrateTopLevelMessages: done —", migrated, "migrated |", skipped, "skipped |", errors, "errors");
  }

  function _googleLogoSvg() {
    return '<svg class="vg-g-logo" viewBox="0 0 24 24" fill="none">' +
      '<path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>' +
      '<path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>' +
      '<path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>' +
      '<path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>';
  }

  function _removeMenu() {
    var wrapper = document.getElementById("vmWrapper");
    if (wrapper) wrapper.remove();
    document.body.classList.remove("vm-menu-open");
    window._vaaniOpenProfileMenu = null;
  }

  function _menuItem(icon, label, action) {
    var icons = {
      person: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
      globe: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
      settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
      users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'
    };
    return '<button class="vm-item" data-action="' + action + '">' +
      '<svg viewBox="0 0 24 24">' + (icons[icon] || "") + "</svg>" +
      '<span>' + _esc(label) + "</span>" +
      '<svg class="vm-chevron" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg></button>';
  }

  function _buildMenu(user, profile) {
    var username = profile.username || "user";
    var photo = user.photoURL || "";
    var initial = username.charAt(0).toUpperCase();
    return '<div class="vm-overlay" id="vmOverlay"></div>' +
      '<aside class="vm-panel" id="vmPanel" aria-label="Profile menu">' +
      '<div class="vm-profile"><div class="vm-avatar">' +
      (photo ? '<img class="avatar" src="' + _esc(photo) + '" alt="Profile avatar">' : '<span class="avatar-placeholder">' + _esc(initial) + "</span>") +
      '</div><div class="vm-meta"><div class="vm-username">@' + _esc(username) + "</div>" +
      '<div class="vm-email">' + _esc(user.email || "") + "</div></div></div>" +
      '<nav class="vm-nav">' + _menuItem("person", "My Profile", "profile") +
      _menuItem("globe", "Languages", "languages") + _menuItem("settings", "Settings", "settings") +
      _menuItem("users", "Manage Connections", "connections") + "</nav>" +
      '<button class="vm-signout" id="vmSignOut">' +
      '<svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>' +
      '<polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>Sign out</button></aside>';
  }

  function _injectMenu(user, profile) {
    _removeMenu();
    var wrapper = document.createElement("div");
    wrapper.id = "vmWrapper";
    wrapper.innerHTML = _buildMenu(user, profile);
    document.body.appendChild(wrapper);

    var overlay = document.getElementById("vmOverlay");
    var panel   = document.getElementById("vmPanel");
    var signOutBtn = document.getElementById("vmSignOut");

    function closeMenu() { if (overlay) overlay.classList.remove("vm-open"); if (panel) panel.classList.remove("vm-open"); document.body.classList.remove("vm-menu-open"); }
    function openMenu()  { if (overlay) overlay.classList.add("vm-open");    if (panel) panel.classList.add("vm-open");    document.body.classList.add("vm-menu-open"); }
    window._vaaniOpenProfileMenu = openMenu;
    if (overlay) overlay.addEventListener("click", closeMenu);

    wrapper.querySelectorAll(".vm-item").forEach(function (item) {
      item.addEventListener("click", async function () {
        var action = item.dataset.action; closeMenu();
        if (action === "profile") {
          var currentUid = window._vaaniCurrentUser && window._vaaniCurrentUser.uid
            ? String(window._vaaniCurrentUser.uid)
            : "";
          if (!currentUid) {
            renderUserProfile(null);
            return;
          }
          if (window.vaaniProfile && typeof window.vaaniProfile.openMyProfile === "function") {
            window.vaaniProfile.openMyProfile();
            return;
          }
          var userProfile = await getUserProfile(currentUid);
          renderUserProfile(userProfile || null);
          return;
        }
        if (action === "settings") { _openChatSettings(); return; }
        if (typeof window.showToast === "function") {
          var labelNode = item.querySelector("span");
          window.showToast((labelNode ? labelNode.textContent : "Feature") + " coming soon");
        }
      });
    });

    if (signOutBtn) {
      signOutBtn.addEventListener("click", function () {
        closeMenu();
        if (window.vaaniRouter && typeof window.vaaniRouter.signOut === "function") window.vaaniRouter.signOut();
      });
    }
  }

  function _openChatSettings() {
    var settingsHost = document.getElementById("vcSettingsScreen");
    var currentUid = window._vaaniCurrentUser && window._vaaniCurrentUser.uid ? String(window._vaaniCurrentUser.uid) : "";
    var db = window.vaaniRouter && typeof window.vaaniRouter.getDb === "function" ? window.vaaniRouter.getDb() : null;
    if (!settingsHost || !db || !currentUid) return;

    settingsHost.innerHTML =
  '<div class="vc-settings-panel">' +
    '<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">' +
      '<button id="vcSettingsBackBtn" style="background:none;border:1px solid rgba(255,255,255,0.1);' +
        'color:var(--text,#e8e8f6);border-radius:8px;width:32px;height:32px;cursor:pointer;' +
        'display:flex;align-items:center;justify-content:center;" aria-label="Back">' +
        '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" ' +
          'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
          '<polyline points="15 18 9 12 15 6"/>' +
        '</svg>' +
      '</button>' +
      '<h3 class="vc-settings-title" style="margin:0;">Status privacy</h3>' +
    '</div>' +
        '<p class="vc-settings-note">Show when you are online and last seen.</p>' +
        '<div class="vc-status-toggle-row">' +
          '<span>Show my live status</span>' +
          '<label class="switch"><input type="checkbox" id="vcStatusPrivacyToggle"><span class="slider"></span></label>' +
        '</div>' +
      '</div>';

    var settingsBackBtn = document.getElementById("vcSettingsBackBtn");
if (settingsBackBtn) {
  settingsBackBtn.addEventListener("click", function () {
    // Prefer history.back() if we pushed an entry; fall back to direct state mutation
    if (history.state && history.state.chatView === "settings" &&
        (history.state._depth || 0) > 1) {
      history.back();
    } else {
      _panelView = "home";
      _setSelectedChatUser(null);
      _syncViewWithSelection(false);
      if (typeof _renderChatList === "function") _renderChatList();
    }
  });
}
    var toggle = document.getElementById("vcStatusPrivacyToggle");
    db.collection("users").doc(currentUid).get().then(function (doc) {
      var data = doc && doc.exists ? (doc.data() || {}) : {};
      var showStatus = !(data.status && data.status.showStatus === false);
      if (toggle) toggle.checked = showStatus;
    });

    if (toggle) {
      toggle.addEventListener("change", async function () {
        try {
          await db.collection("users").doc(currentUid).set({
            status: { showStatus: !!toggle.checked }
          }, { merge: true });
        } catch (_) {
          if (typeof window.showToast === "function") window.showToast("Could not update status privacy.");
        }
      });
    }

    // AFTER
_panelView = "settings";
_syncViewWithSelection(false);

// Push a history entry so browser back returns to #chat
var d = (history.state && history.state._depth) || 1;
history.pushState({ page: "Chat", chatView: "settings", _depth: d + 1 }, "", "#chat");
if (window.VaaniNav) window.VaaniNav.sync();
  }

  function _renderLogin() {
    var root = _root(); if (!root) return;
    _stopListening(); _clearSearchState(); _removeMenu();
    root.innerHTML = '<div class="vg-screen vg-login-screen"><div class="vg-card">' +
      '<div class="vg-card-icon"><svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" fill="none" stroke-width="2"/> <circle cx="7.5" cy="10" r="1.2" fill="#8E7BEF"/> <circle cx="12" cy="10" r="1.2" fill="#8E7BEF"/> <circle cx="16.5" cy="10" r="1.2" fill="#8E7BEF"/></svg></div>' +
      '<h2 class="vg-card-title">Start Chatting</h2>' +
      '<p class="vg-card-sub">Sign in to access your Vaani chat workspace.</p>' +
      '<button class="vg-google-btn" id="vgSignInBtn">' + _googleLogoSvg() + "Continue with Google</button>" +
      '<p class="vg-hint">Translation features work without signing in.</p></div></div>';

    var signInBtn = document.getElementById("vgSignInBtn");
    if (!signInBtn) return;
    signInBtn.addEventListener("click", async function () {
      signInBtn.disabled = true; signInBtn.textContent = "Signing in…";
      try { await window.vaaniRouter.signIn(); }
      catch (_) { signInBtn.disabled = false; signInBtn.innerHTML = _googleLogoSvg() + "Continue with Google"; }
    });
  }

  function _renderProfile(user) {
    var root = _root(); if (!root) return;
    _stopListening(); _clearSearchState(); _removeMenu();
    var firstName = (user.displayName || "").split(" ")[0] || "";
    var suggested = firstName.toLowerCase().replace(/[^a-z0-9]/g, "");
    root.innerHTML = '<div class="vg-screen vg-profile-screen"><div class="vg-card">' +
      '<div class="vg-avatar-wrap">' +
      (user.photoURL ? '<img class="vg-profile-avatar avatar" src="' + _esc(user.photoURL) + '" alt="avatar">'
        : '<div class="vg-profile-avatar vg-avatar-fallback avatar-placeholder">' + _esc((firstName[0] || "?").toUpperCase()) + "</div>") +
      '</div><h2 class="vg-card-title">Create Your Profile</h2>' +
      '<p class="vg-card-sub">Hi ' + _esc(firstName || "there") + '! Choose a unique username.</p>' +
      '<div class="vg-field"><label class="vg-label" for="vgUsernameInput">Username</label>' +
      '<div class="vg-input-wrap"><span class="vg-input-prefix">@</span>' +
      '<input id="vgUsernameInput" class="vg-input" type="text" maxlength="20" autocomplete="off" spellcheck="false" placeholder="yourname_01" value="' + _esc(suggested) + '"></div>' +
      '<span class="vg-field-hint" id="vgUsernameHint">Must include letters + numbers. Underscore (_) allowed.</span></div>' +
      '<button class="vg-primary-btn create-profile-btn" id="vgCreateProfileBtn" type="button">Create Profile</button>' +
      '<button class="vg-ghost-btn" id="vgSignOutBtn">Sign out</button></div></div>';

    var input = document.getElementById("vgUsernameInput");
    var hint  = document.getElementById("vgUsernameHint");
    var createBtn = document.getElementById("vgCreateProfileBtn");

    function validate() {
      if (!input || !hint || !createBtn) return;
      var err = window.vaaniProfile && window.vaaniProfile.validateUsername ? window.vaaniProfile.validateUsername(input.value) : null;
      createBtn.dataset.valid = err ? "false" : "true";
      if (err) { hint.textContent = err; hint.className = "vg-field-hint vg-hint-error"; }
      else     { hint.textContent = "✓ Username looks good"; hint.className = "vg-field-hint vg-hint-success"; }
    }
    if (input) { input.addEventListener("input", validate); validate(); }

    if (createBtn) {
      createBtn.addEventListener("click", async function () {
        console.log("[Vaani] Create Profile button clicked");
        var username = input ? input.value.trim() : "";
        var err = window.vaaniProfile && window.vaaniProfile.validateUsername ? window.vaaniProfile.validateUsername(username) : null;
        if (err) { if (hint) { hint.textContent = err; hint.className = "vg-field-hint vg-hint-error"; } return; }
        createBtn.disabled = true; createBtn.textContent = "Creating…";
        try {
          var profile = await window.vaaniProfile.create(user, username);
          window.vaaniRouter.goToChat(user, profile);
        } catch (error) {
          if (hint) { hint.textContent = error.message || "Something went wrong."; hint.className = "vg-field-hint vg-hint-error"; }
          createBtn.disabled = false; createBtn.textContent = "Create Profile";
        }
      });
    }

    var signOutBtn = document.getElementById("vgSignOutBtn");
    if (signOutBtn) signOutBtn.addEventListener("click", function () { window.vaaniRouter.signOut(); });
  }

  // ── FIX 2: await ALL migrations before attaching listeners ───────────────
  async function _renderChat(user, profile) {
    var root = _root(); if (!root) return;
    _clearSearchState(); _injectMenu(user, profile);
    var db = window.vaaniRouter && typeof window.vaaniRouter.getDb === "function" ? window.vaaniRouter.getDb() : null;
    if (_myPresenceUnbind) { _myPresenceUnbind(); _myPresenceUnbind = null; }
    _myPresenceUnbind = bindPresence(db, user && user.uid ? String(user.uid) : "");

    var photo    = user.photoURL || "";
     var photo = _upgradePhotoURL(user.photoURL || '');
    var initials = ((profile.username || "U").charAt(0) || "U").toUpperCase();

    root.innerHTML = '<section class="vc-shell" aria-label="Chat screen">' +
      '<div class="vc-top-bar">' +
      '<button class="vc-avatar-btn" id="vcProfileBtn" aria-label="Open profile menu" title="Profile menu">' +
      (photo ? '<img src="' + _esc(photo) + '" alt="avatar" class="vc-avatar-img avatar">'
             : '<span class="vc-avatar-initials avatar-placeholder">' + _esc(initials) + "</span>") + "</button>" +
      '<div class="vc-search-wrap" id="vcSearchWrap">' +
      '<input id="vcUserSearchInput" class="vc-search-input search-bar" type="text" autocomplete="off" spellcheck="false" placeholder="Search users by username">' +
      '<div class="vc-search-dropdown" id="vcSearchDropdown"></div></div></div>' +
      '<div class="vc-home-view" id="vcHomeScreen">' +
      '<div class="requests">' +
      '<div class="vc-requests-wrap">' +
      '<button class="vc-requests-toggle" id="vcRequestsToggle" type="button">Requests <span class="vc-requests-badge" id="vcRequestsBadge">0</span></button>' +
      '<div class="vc-requests-panel" id="vcRequestsPanel">' +
      '<div class="vc-requests-list" id="vcRequestsList"><div class="vc-requests-empty">No pending requests</div></div></div></div>' +
      '<div class="vc-requests-wrap">' +
      '<button class="vc-requests-toggle" id="vcSentRequestsToggle" type="button">Requests Sent <span class="vc-requests-badge" id="vcSentRequestsBadge">0</span></button>' +
      '<div class="vc-requests-panel" id="vcSentRequestsPanel">' +
      '<div class="vc-requests-list" id="vcSentRequestsList"><div class="vc-requests-empty">No pending requests</div></div></div></div></div>' +
      '<div class="vc-chat-list" id="vcChatList"><div class="vc-chat-list-empty">Loading chats…</div></div></div>' +
      '<div class="vc-chat-view-wrap" id="vcChatScreen" style="display:none;"></div>' +
      '<div class="vc-profile-view-wrap" id="vcProfileScreen" style="display:none;"></div>' +
      '<div class="vc-settings-view-wrap" id="vcSettingsScreen" style="display:none;"></div></section>';

    var profileBtn = document.getElementById("vcProfileBtn");
    if (profileBtn) profileBtn.addEventListener("click", function () {
      if (typeof window._vaaniOpenProfileMenu === "function") window._vaaniOpenProfileMenu();
    });

    _bindUserSearch();
    _bindIncomingRequestActions();
    _bindSentRequestActions();
    _fetchConnections(user.uid);
    _fetchIncomingRequests(user.uid);
    _fetchSentRequests(user.uid);
    _listenToRequestState(user.uid);

    // Attach listener first for fast initial render; run migrations in background.
    _createChatListListener();
    console.log("[Vaani] _renderChat: scheduling background migrations…");
    setTimeout(function () {
      _backfillChatsFromLegacyMessages();
      _migrateLegacyMessages();
      _migrateTopLevelMessages();
    }, 2000);
    _setSelectedChatUser(null);
  }

    var _lastPushedChatView = null;

  function _syncViewWithSelection(fromPopstate) {
    var topBar = document.querySelector(".vc-top-bar");
    if (_panelView === "chat" && _selectedChatUser) {
      _setActivePanel("chat");
      if (topBar) topBar.style.display = "none";
      if (!fromPopstate && _lastPushedChatView !== "chat") {
        _lastPushedChatView = "chat";
        var d = (history.state && history.state._depth) || 1;
        history.pushState({ page: "Chat", chatView: "chat", _depth: d + 1 }, "", "#chat");
        if (window.VaaniNav) window.VaaniNav.sync();
        var el = document.getElementById("vcChatScreen");
        if (el) { el.classList.remove("vn-chat-slide-in","vn-chat-slide-back"); void el.offsetWidth; el.classList.add("vn-chat-slide-in"); }
      }
    } else if (_panelView === "profile") {
      _setActivePanel("profile");
      if (topBar) topBar.style.display = "flex";
      if (!fromPopstate && _lastPushedChatView !== "profile") {
        _lastPushedChatView = "profile";
        var dp = (history.state && history.state._depth) || 2;
        history.pushState({ page: "Chat", chatView: "profile", _depth: dp + 1 }, "", "#chat");
        if (window.VaaniNav) window.VaaniNav.sync();
        var pr = document.getElementById("vcProfileScreen");
        if (pr) { pr.classList.remove("vn-chat-slide-in","vn-chat-slide-back"); void pr.offsetWidth; pr.classList.add("vn-chat-slide-in"); }
      }
    } else if (_panelView === "settings") {
      _setActivePanel("settings");
      if (topBar) topBar.style.display = "flex";
    } else {
      var chat = document.getElementById("vcChatScreen");
      _setActivePanel("home");
      if (chat) chat.innerHTML = "";
      if (window.vaaniProfile && typeof window.vaaniProfile.closeMyProfile === "function")
        window.vaaniProfile.closeMyProfile();
      if (topBar) topBar.style.display = "flex";
      _lastPushedChatView = null;
    }
    if (window.vaaniChat)
      window.vaaniChat._currentView = _panelView === "profile" ? "profile" : (_panelView === "settings" ? "settings" : (_selectedChatUser ? "chat" : "home"));
  }

  function _setSelectedChatUser(user) {
    if (!user) {
      try {
        var cu = window._vaaniCurrentUser;
        if (cu && cu.uid) sessionStorage.removeItem("vaani_active_chat_" + cu.uid);
      } catch (e) {}
    }
    _selectedChatUser = user || null;
    _panelView = _selectedChatUser ? "chat" : (_panelView === "settings" ? "settings" : "home");
    if (!_selectedChatUser) {
      _emitTypingHeartbeat(false);
      _replyToMessage = null; // clear reply on chat close
      _activeChatId = null; _messages = []; _inputMessage = ""; _messagesContainerRef = null;
      _translationResultsById.clear();
      clearCache();
      if (_translationPanelController) { _translationPanelController.destroy(); _translationPanelController = null; }
      _teardownMessageListener();
      _teardownStatusListeners();
      _teardownViewportSync();
    }
    _syncViewWithSelection();
  }

  function _setActivePanel(panel) {
    var home = document.getElementById("vcHomeScreen");
    var chat = document.getElementById("vcChatScreen");
    var profile = document.getElementById("vcProfileScreen");
    var settings = document.getElementById("vcSettingsScreen");
    if (!home || !chat || !profile || !settings) return;
    home.style.display = panel === "home" ? "block" : "none";
    chat.style.display = panel === "chat" ? "flex" : "none";
    profile.style.display = panel === "profile" ? "flex" : "none";
    settings.style.display = panel === "settings" ? "block" : "none";
  }

  function _setMessages(nextMessages)  { _messages      = Array.isArray(nextMessages) ? nextMessages : []; }
  function _setInputMessage(nextValue) { _inputMessage  = String(nextValue || ""); }

  async function processMessages(messages, translateEnabled, targetLang) {
    var safeMessages = Array.isArray(messages) ? messages : [];
    if (translateEnabled !== true) return safeMessages;
    return Promise.all(safeMessages.map(async function (msg) {
      var sourceText = _messagePreviewText(msg);
      var translatedText = await translatePipeline(sourceText, targetLang);
      return Object.assign({}, msg, { translatedText: translatedText });
    }));
  }

  async function onNewMessage(msg) {
    if (!msg) return msg;
    if (_translationConfig.translateEnabled !== true) return msg;
    var translatedText = await translatePipeline(_messagePreviewText(msg), _translationConfig.targetLanguage);
    return Object.assign({}, msg, { translatedText: translatedText });
  }

  function _refreshTranslationsForCurrentMessages() {
    var currentBatch = ++_translationBatchToken;
    processMessages(_messages, _translationConfig.translateEnabled, _translationConfig.targetLanguage)
      .then(function (nextMessages) {
        if (currentBatch !== _translationBatchToken) return;
        _setServerMessages(nextMessages);
        _renderMessages();
      })
      .catch(function () {});
  }
  function _setTranslationConfig(patch) {
    var previous = Object.assign({}, _translationConfig);
    _translationConfig = Object.assign({}, _translationConfig, patch || {});
    var languageChanged = previous.targetLanguage !== _translationConfig.targetLanguage;
    var translateTurnedOn = previous.translateEnabled !== true && _translationConfig.translateEnabled === true;
    var translateTurnedOff = previous.translateEnabled === true && _translationConfig.translateEnabled !== true;
    if (languageChanged) {
      clearCache();
      _translationResultsById.clear();
    }
    if (translateTurnedOff) {
      _translationBatchToken += 1;
      _translationLoadingById.clear();
    }
    if (translateTurnedOn) _showGlobalTranslationIndicator("auto");
    if (_translationPanelController) _translationPanelController.update();
    _refreshTranslationsForCurrentMessages();
  }

  function _showGlobalTranslationIndicator(sourceLang) {
    var notice = document.getElementById("vaaniTranslationNotice");
    if (!notice) return;
    var source = String(sourceLang || "auto").toLowerCase();
    notice.textContent = "(translated from " + source + ")";
    notice.classList.add("is-visible");
    if (_translationNoticeTimeout) clearTimeout(_translationNoticeTimeout);
    _translationNoticeTimeout = setTimeout(function () {
      notice.classList.remove("is-visible");
      _translationNoticeTimeout = null;
    }, 1000);
  }

  function openTranslationPanel() {
    _setTranslationConfig({ panelOpen: true, featureEnabled: true });
  }

  function _isUserNearBottom(container, thresholdPx) {
    var el = container || _messagesContainerRef;
    if (!el) return true;
    var threshold = typeof thresholdPx === "number" ? thresholdPx : 100;
    var remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
    return remaining <= threshold;
  }

  function _scrollMessagesToBottom(force) {
  if (!_messagesContainerRef) return;
  if (!force && !_shouldStickToBottom) return;
  // Use scrollTop directly for optimistic renders — no rAF stutter
  _messagesContainerRef.scrollTop = _messagesContainerRef.scrollHeight;
}

  function _teardownMessageListener() {
    if (_unsubscribeMessages) { _unsubscribeMessages(); _unsubscribeMessages = null; }
    _activeMessageListenerKey = null; _activeMessagesSignature = ""; _optimisticMessages = [];
  }

  function _teardownStatusListeners() {
    if (_chatPresenceUnsub) { _chatPresenceUnsub(); _chatPresenceUnsub = null; }
    if (_chatTypingUnsub) { _chatTypingUnsub(); _chatTypingUnsub = null; }
    if (_typingHeartbeatTimer) { clearTimeout(_typingHeartbeatTimer); _typingHeartbeatTimer = null; }
    if (_typingClearTimer) { clearTimeout(_typingClearTimer); _typingClearTimer = null; }
    _headerTypingFromUserId = "";
    _headerPresenceState = { showStatus: true, isOnline: false, lastSeen: null };
  }

  function _renderHeaderStatus() {
    var statusEl = document.getElementById("vcChatHeaderStatus");
    if (!statusEl || !_selectedChatUser || !_selectedChatUser.uid) return;
    var canShowStatus = _headerPresenceState.showStatus !== false;
    if (!canShowStatus) {
      statusEl.textContent = "";
      statusEl.className = "vc-chat-hsub";
      return;
    }

    var isTyping = _headerTypingFromUserId && String(_headerTypingFromUserId) === String(_selectedChatUser.uid);
    if (isTyping) {
      statusEl.textContent = "Typing...";
      statusEl.className = "vc-chat-hsub vc-chat-hsub-typing";
      return;
    }

    if (_headerPresenceState.isOnline) {
      statusEl.textContent = "Online";
      statusEl.className = "vc-chat-hsub vc-chat-hsub-online";
      return;
    }

    var lastSeenLabel = formatLastSeenLabel(_headerPresenceState.lastSeen);
    statusEl.textContent = lastSeenLabel ? ("Last seen at " + lastSeenLabel) : "";
    statusEl.className = "vc-chat-hsub vc-chat-hsub-offline";
  }

  function _setupChatStatusWatchers(chatId, otherUid) {
    var db = window.vaaniRouter && typeof window.vaaniRouter.getDb === "function" ? window.vaaniRouter.getDb() : null;
    var currentUid = window._vaaniCurrentUser && window._vaaniCurrentUser.uid ? String(window._vaaniCurrentUser.uid) : "";
    _teardownStatusListeners();
    if (!db || !chatId || !otherUid || !currentUid) return;

    _chatPresenceUnsub = subscribeUserPresence(db, String(otherUid), function (nextStatus) {
      _headerPresenceState = nextStatus || { showStatus: true, isOnline: false, lastSeen: null };
      _renderHeaderStatus();
    });

    _chatTypingUnsub = subscribeTyping(db, String(chatId), currentUid, function (typingFromUserId) {
      _headerTypingFromUserId = typingFromUserId ? String(typingFromUserId) : "";
      _renderHeaderStatus();
    });
  }

  function _emitTypingHeartbeat(isTypingNow) {
    var db = window.vaaniRouter && typeof window.vaaniRouter.getDb === "function" ? window.vaaniRouter.getDb() : null;
    var currentUid = window._vaaniCurrentUser && window._vaaniCurrentUser.uid ? String(window._vaaniCurrentUser.uid) : "";
    var otherUid = _selectedChatUser && _selectedChatUser.uid ? String(_selectedChatUser.uid) : "";
    if (!db || !_activeChatId || !currentUid || !otherUid) return;

    if (!isTypingNow) {
      clearTyping(db, _activeChatId, currentUid);
      return;
    }

    emitTyping(db, {
      chatId: _activeChatId,
      fromUserId: currentUid,
      toUserId: otherUid,
      isTyping: true
    });
  }

  function _syncViewportForKeyboard() {
    var root = _root();
    if (!root) return;
    var viewport = window.visualViewport;
    if (!viewport) {
      root.style.setProperty("--vc-keyboard-offset", "0px");
      return;
    }
    var offset = Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop));
    root.style.setProperty("--vc-keyboard-offset", offset + "px");
  }

  function _setupViewportSync() {
    if (!window.visualViewport || _visualViewportResizeHandler) return;
    _visualViewportResizeHandler = function () {
      _syncViewportForKeyboard();
      _scrollMessagesToBottom(false);
    };
    window.visualViewport.addEventListener("resize", _visualViewportResizeHandler, { passive: true });
    window.visualViewport.addEventListener("scroll", _visualViewportResizeHandler, { passive: true });
    _syncViewportForKeyboard();
  }

  function _teardownViewportSync() {
    if (window.visualViewport && _visualViewportResizeHandler) {
      window.visualViewport.removeEventListener("resize", _visualViewportResizeHandler);
      window.visualViewport.removeEventListener("scroll", _visualViewportResizeHandler);
    }
    _visualViewportResizeHandler = null;
    var root = _root();
    if (root) root.style.setProperty("--vc-keyboard-offset", "0px");
  }

  function _shortFluentLanguages(list) {
    var arr = Array.isArray(list) ? list.filter(Boolean) : [];
    if (!arr.length) return "";
    if (arr.length <= 2) return arr.join(", ");
    return arr.slice(0, 2).join(", ") + " +" + (arr.length - 2);
  }

  function _getUserProfileCached(db, uid) {
  if (!uid) {
    return Promise.resolve({
      name: "User", username: "user", photoURL: "",
      fluentLanguages: [], fluentLanguagesShort: ""
    });
  }
  if (_userProfileCache[uid]) return Promise.resolve(_userProfileCache[uid]);
  // Fetch directly from Firestore to get ALL fields (bio, links, etc.)
  return db.collection("users").doc(uid).get()
    .then(function(doc) {
      var safe = doc.exists ? (doc.data() || {}) : {};
      var username = String(safe.username || "").trim();
      var name = String(safe.name || safe.displayName || "").trim();
      var profile = Object.assign({}, safe, {
        name: name || username || "User",
        username: username || "user",
        photoURL: safe.photoURL || safe.avatar || "",
         photoURL: _upgradePhotoURL(safe.photoURL || safe.avatar || ''),
        fluentLanguages: Array.isArray(safe.fluentLanguages) ? safe.fluentLanguages : [],
        fluentLanguagesShort: _shortFluentLanguages(safe.fluentLanguages)
      });
      _userProfileCache[uid] = profile;
      return profile;
    })
    .catch(function() {
      var fallback = { name: "User", username: "user", photoURL: "", fluentLanguages: [], fluentLanguagesShort: "" };
      _userProfileCache[uid] = fallback;
      return fallback;
    });
}

  function _timestampToMillis(ts) { return ts && typeof ts.toMillis === "function" ? ts.toMillis() : 0; }

  function _generateChatId(uidA, uidB) {
    if (!uidA || !uidB) return null;
    var s = [String(uidA), String(uidB)].sort();
    return s[0] + "_" + s[1];
  }

  function _fetchConnections(currentUid) {
    var db = window.vaaniRouter && typeof window.vaaniRouter.getDb === "function" ? window.vaaniRouter.getDb() : null;
    if (!db || !currentUid) return;
    if (_unsubscribeConnections) { _unsubscribeConnections(); _unsubscribeConnections = null; }
    _connectedUidSet.clear();
    _connectionUsersByDocId = Object.create(null);

    _unsubscribeConnections = db.collection(CONNECTIONS_COLLECTION)
      .where("users", "array-contains", currentUid)
      .onSnapshot(async function (snapshot) {
        var changed = false;
        snapshot.docChanges().forEach(function (change) {
          var doc = change.doc;
          var users = (doc.data() && Array.isArray(doc.data().users)) ? doc.data().users : [];
          if (change.type === "removed") {
            delete _connectionUsersByDocId[doc.id];
            changed = true;
            return;
          }
          _connectionUsersByDocId[doc.id] = users.filter(function (uid) { return uid && uid !== currentUid; });
          changed = true;
        });
        if (!changed) return;

        _connectedUidSet.clear();
        Object.keys(_connectionUsersByDocId).forEach(function (docId) {
          (_connectionUsersByDocId[docId] || []).forEach(function (uid) { _connectedUidSet.add(uid); });
        });

        var next = Array.from(_connectedUidSet).sort().join("|");
        var prev = _fetchConnections._lastSignature || "";
        _fetchConnections._lastSignature = next;
        console.log("[Vaani] connections updated —", _connectedUidSet.size, "connected");
        _refreshActiveSearchDropdown();
        if (window.vaaniChat && window.vaaniChat._currentView === "home" && next !== prev) _renderChatList();
      }, function (err) {
        console.error("[Vaani] connections listener error:", err);
        _connectedUidSet.clear();
        _connectionUsersByDocId = Object.create(null);
      });
  }

   function _loadChatListCache(uid) {
  try {
    var key = "vaani_chat_list_" + uid;
    var raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.warn("[Vaani] load cache failed:", e);
    return null;
  }
}

function _saveChatListCache(uid, data) {
  try {
    var key = "vaani_chat_list_" + uid;
    localStorage.setItem(key, JSON.stringify(data || []));
  } catch (e) {
    console.warn("[Vaani] save cache failed:", e);
  }
}
   
  // ── FIX 3: _createChatListListener — deduplicate by canonical chatId ──────
  function _createChatListListener() {
  var db = window.vaaniRouter && typeof window.vaaniRouter.getDb === "function" ? window.vaaniRouter.getDb() : null;
  var currentUid = window._vaaniCurrentUser && window._vaaniCurrentUser.uid ? window._vaaniCurrentUser.uid : null;
  if (!db || !currentUid) return;
  if (_activeChatListListenerUid === String(currentUid)) return;
  if (_unsubscribeChatList) {
    _unsubscribeChatList();
    _unsubscribeChatList = null;
  }
  _activeChatListListenerUid = String(currentUid);
  if (!Array.isArray(window.vaaniChat.conversations)) window.vaaniChat.conversations = [];
  if (!Array.isArray(window.vaaniChat._chatList)) window.vaaniChat._chatList = [];

  var cached = _loadChatListCache(currentUid);
  if (cached && cached.length) {
    window.vaaniChat.conversations = cached;
    window.vaaniChat._chatList = cached.map(function (conversation) {
        return {
          chatId: conversation.chatId,
          otherUid: conversation.otherUid,
          username: conversation.user && conversation.user.username ? conversation.user.username : "user",
          name: conversation.user && conversation.user.name ? conversation.user.name : "User",
          photoURL: conversation.user && conversation.user.photoURL ? conversation.user.photoURL : "",
          fluentLanguagesShort: conversation.user && conversation.user.fluentLanguagesShort ? conversation.user.fluentLanguagesShort : "",
          lastMessage: conversation.lastMessage || "",
          updatedAt: conversation.timestamp || null
        };
    });
    _forceRenderChatList = true;
    _renderChatList();
  }
  console.log("[Vaani] _createChatListListener: attaching for uid:", currentUid);
  console.log("[CHAT] Listener attached");

  _unsubscribeChatList = db.collection(CHATS_COLLECTION)
    .where("participants", "array-contains", currentUid)
    .orderBy("updatedAt", "desc")
    .limit(20)
    .onSnapshot(async function (snapshot) {
      console.log("[Vaani] chat list snapshot:", snapshot.docs.length, "doc(s).");

      var byOtherUid = Object.create(null);
      snapshot.forEach(function (doc) {
        var data = doc.data() || {};
        var participants = Array.isArray(data.participants) ? data.participants : [];
        var otherUid = participants.find(function (uid) { return uid && uid !== currentUid; }) || null;
        if (!otherUid) return;

        var canonicalId = [String(currentUid), String(otherUid)].sort().join("_");
        var candidate = {
          id: doc.id, chatId: doc.id, otherUid: otherUid,
          lastMessage: data.lastMessage || "", timestamp: data.updatedAt || data.createdAt || null,
          isCanonical: doc.id === canonicalId
        };

        var prev = byOtherUid[otherUid];
        if (!prev) { byOtherUid[otherUid] = candidate; return; }

        if (candidate.isCanonical && !prev.isCanonical) { byOtherUid[otherUid] = candidate; }
        else if (!candidate.isCanonical && prev.isCanonical) { }
        else if (_timestampToMillis(candidate.timestamp) > _timestampToMillis(prev.timestamp)) { byOtherUid[otherUid] = candidate; }
      });

      var conversations = Object.keys(byOtherUid).map(function (uid) {
        var conv = byOtherUid[uid];
        var cachedProfile = _userProfileCache[conv.otherUid] || null;
        return {
          id: conv.id, chatId: conv.chatId, otherUid: conv.otherUid,
          user: {
            uid: conv.otherUid,
            username: cachedProfile ? (cachedProfile.username || "user") : "...",
            name: cachedProfile ? (cachedProfile.name || cachedProfile.username || "User") : "...",
            photoURL: cachedProfile ? (cachedProfile.photoURL || "") : "",
            fluentLanguagesShort: cachedProfile ? (cachedProfile.fluentLanguagesShort || "") : ""
          },
          lastMessage: conv.lastMessage || "", timestamp: conv.timestamp || null
        };
      });

      conversations.sort(function (a, b) { return _timestampToMillis(b.timestamp) - _timestampToMillis(a.timestamp); });

      window.vaaniChat.conversations = conversations;
       _forceRenderChatList = true;
      window.vaaniChat._chatList = conversations.map(function (c) {
        return {
          chatId: c.chatId, otherUid: c.otherUid,
          username: c.user.username, name: c.user.name, photoURL: c.user.photoURL, fluentLanguagesShort: c.user.fluentLanguagesShort,
          lastMessage: c.lastMessage, updatedAt: c.timestamp || null
        };
      });
       

      _hasLoadedChatListOnce = true;

      console.log("[Vaani] chat list: rendering", conversations.length, "conversation(s).");

      _forceRenderChatList = true;
      _renderChatList();
      _saveChatListCache(currentUid, conversations);

      var missingUids = Object.keys(byOtherUid).filter(function (uid) { return !_userProfileCache[uid]; });
      if (!missingUids.length) return;

      Promise.all(missingUids.map(function (uid) {
        return _getUserProfileCached(db, uid);
      })).then(function () {
        var hydratedConversations = Object.keys(byOtherUid).map(function (uid) {
          var conv = byOtherUid[uid];
          var profile = _userProfileCache[conv.otherUid] || {};
          return {
            id: conv.id,
            chatId: conv.chatId,
            otherUid: conv.otherUid,
            user: {
              uid: conv.otherUid,
              username: profile.username || "user",
              name: profile.name || profile.username || "User",
              photoURL: profile.photoURL || "",
              fluentLanguagesShort: profile.fluentLanguagesShort || ""
            },
            lastMessage: conv.lastMessage || "",
            timestamp: conv.timestamp || null
          };
        });
        hydratedConversations.sort(function (a, b) { return _timestampToMillis(b.timestamp) - _timestampToMillis(a.timestamp); });
        window.vaaniChat.conversations = hydratedConversations;
        window.vaaniChat._chatList = hydratedConversations.map(function (c) {
          return {
            chatId: c.chatId,
            otherUid: c.otherUid,
            username: c.user.username,
            name: c.user.name,
            photoURL: c.user.photoURL,
            fluentLanguagesShort: c.user.fluentLanguagesShort,
            lastMessage: c.lastMessage,
            updatedAt: c.timestamp || null
          };
        });
        _saveChatListCache(currentUid, hydratedConversations);
        _forceRenderChatList = true;
        _renderChatList();
      }).catch(function (err) {
        console.error("[Vaani] chat list profile hydration error:", err);
      });
    }, function (err) {
      console.error("[Vaani] chat list listener error:", err);
      window.vaaniChat._chatList = []; window.vaaniChat.conversations = [];
      _hasLoadedChatListOnce = true;
      _activeChatListListenerUid = null; _renderChatList();
    });
}

  function _renderChatList() {
  var listEl = document.getElementById("vcChatList");
  if (!listEl) return;

  listEl.innerHTML = "";
  var raw = [];

if (window.vaaniChat && Array.isArray(window.vaaniChat.conversations)) {
  raw = window.vaaniChat.conversations;
} else if (window.vaaniChat && Array.isArray(window.vaaniChat._chatList)) {
  raw = window.vaaniChat._chatList.map(function (c) {
    return {
        chatId: c.chatId,
        otherUid: c.otherUid,
        user: {
          username: c.username,
          name: c.name,
          photoURL: c.photoURL,
          fluentLanguagesShort: c.fluentLanguagesShort
        },
      lastMessage: c.lastMessage,
      timestamp: c.updatedAt
    };
  });
}

  function _getTimestampMs(value) {
    if (!value) return 0;
    if (typeof value.toMillis === "function") {
      var millis = value.toMillis();
      return Number.isFinite(millis) ? millis : 0;
    }
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    if (value instanceof Date) {
      var dateMillis = value.getTime();
      return Number.isFinite(dateMillis) ? dateMillis : 0;
    }
    if (typeof value === "string") {
      var parsed = Date.parse(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  }

  function _formatTime(value) {
    if (!value) return "";
    try {
      if (typeof value.toDate === "function") {
        var tsDate = value.toDate();
        return tsDate instanceof Date && !Number.isNaN(tsDate.getTime())
          ? tsDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
          : "";
      }
      if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      }
      if (typeof value === "number" && Number.isFinite(value)) {
        return new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      }
      if (typeof value === "string") {
        var parsedDate = new Date(value);
        return Number.isNaN(parsedDate.getTime())
          ? ""
          : parsedDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      }
    } catch (_err) {
      return "";
    }
    return "";
  }

  var items = raw.reduce(function (acc, conversation) {
    if (!conversation || typeof conversation !== "object") return acc;

    var profile = conversation.user && typeof conversation.user === "object" ? conversation.user : {};
    var username = (profile.username || "").trim();
    var name = (profile.name || "").trim();
    var normalizedLastMessage = typeof conversation.lastMessage === "string" && conversation.lastMessage.trim()
      ? conversation.lastMessage
      : "No messages yet";

    acc.push({
      chatId: conversation.chatId || null,
      otherUid: conversation.otherUid || null,
      username: username || "user",
      name: name || username || "User",
      photoURL: profile.photoURL || "",
      fluentLanguagesShort: profile.fluentLanguagesShort || "",
      lastMessage: normalizedLastMessage,
      updatedAt: conversation.timestamp || conversation.updatedAt || conversation.createdAt || null,
      updatedAtMs: _getTimestampMs(conversation.timestamp || null)
    });
    return acc;
  }, []);

  if (!items.length) {
  if (!_hasLoadedChatListOnce) {
    listEl.innerHTML = '<div class="vc-chat-list-empty">Loading chats…</div>';
  } else {
    listEl.innerHTML = '<div class="vc-chat-list-empty">No chats yet</div>';
  }
  return;
}

  items.sort(function (a, b) { return b.updatedAtMs - a.updatedAtMs; });

  _forceRenderChatList = false;

  var fragment = document.createDocumentFragment();
  items.forEach(function (chat) {
    var item = document.createElement("button");
    item.type = "button";
    item.className = "vc-chat-list-item";

    var timeText = _formatTime(chat.updatedAt);
    var initials = ((chat.name || chat.username || "U").charAt(0) || "U").toUpperCase();
    var avatarHTML = chat.photoURL
      ? '<img class="vc-chat-list-avatar-img avatar" src="' + _esc(chat.photoURL) + '" alt="' + _esc(chat.username || "user") + ' avatar">'
      : '<span class="vc-chat-list-avatar-fallback avatar-placeholder">' + _esc(initials) + "</span>";
    item.innerHTML =
      '<div class="vc-chat-list-row">' +
        '<div class="vc-chat-list-avatar">' + avatarHTML + "</div>" +
        '<div class="vc-chat-list-main">' +
          '<div class="vc-chat-list-top">' +
            '<span class="vc-chat-list-username">' + _esc(chat.name || chat.username || "user") + "</span>" +
            (timeText ? '<span class="vc-chat-list-time">' + _esc(timeText) + "</span>" : "") +
          "</div>" +
          '<div class="vc-chat-list-meta">@' + _esc(chat.username || "user") +
            (chat.fluentLanguagesShort ? ' · ' + _esc(chat.fluentLanguagesShort) : "") +
          "</div>" +
          '<div class="vc-chat-list-last">' + _esc(chat.lastMessage || "No messages yet") + "</div>" +
        "</div>" +
      "</div>" +
      "";

// Add inside the item.innerHTML, make the avatar a separate clickable zone:
var avatarEl = item.querySelector('.vc-chat-list-avatar');
if (avatarEl) {
  avatarEl.style.cursor = 'pointer';
  avatarEl.addEventListener('click', function(e) {
    e.stopPropagation();
    var db = window.vaaniRouter && typeof window.vaaniRouter.getDb === 'function'
      ? window.vaaniRouter.getDb() : null;
    if (!db || !chat.otherUid) return;
    console.log("Opening profile:", chat.otherUid);
    _getUserProfileCached(db, chat.otherUid).then(function(p) {
      if (!p) return;
      console.log("Profile fetched:", p);
      openProfileModal(Object.assign({ uid: chat.otherUid }, p));
    }).catch(function(err) {
      console.error("Profile fetch error:", err);
    });
  });
}
    item.addEventListener("click", function () {
      if (!chat.otherUid) {
        console.error("[Vaani] Chat list click: missing otherUid");
        return;
      }

      var currentUid = window._vaaniCurrentUser && window._vaaniCurrentUser.uid
        ? String(window._vaaniCurrentUser.uid) : null;
      var db = window.vaaniRouter && typeof window.vaaniRouter.getDb === "function"
        ? window.vaaniRouter.getDb() : null;

      if (!currentUid || !db) {
        console.error("[Vaani] Chat list click: missing currentUid or db");
        return;
      }

      var chatId = chat.chatId
        ? String(chat.chatId)
        : [currentUid, String(chat.otherUid)].sort().join("_");

      var selectedUser = {
        uid:         chat.otherUid,
        username:    chat.username    || "user",
        displayName: chat.name || chat.username || "User",
        photoURL:    chat.photoURL    || ""
      };

      if (_activeChatId === chatId && _selectedChatUser && _selectedChatUser.uid === chat.otherUid) {
        return;
      }

      db.collection(CHATS_COLLECTION).doc(chatId)
        .set({ participants: [currentUid, String(chat.otherUid)].sort(), updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true })
        .catch(function (err) {
          console.warn("[Vaani] Chat list click: chat doc upsert failed (non-fatal):", err);
        });

      _openChatUI(chatId, selectedUser);
    });

    fragment.appendChild(item);
  });

  listEl.appendChild(fragment);
}

  function _stopListening() {
    if (_unsubscribeIncomingRequests) { _unsubscribeIncomingRequests(); _unsubscribeIncomingRequests = null; }
    if (_unsubscribeSentRequests) { _unsubscribeSentRequests(); _unsubscribeSentRequests = null; }
    if (_unsubscribeConnections) { _unsubscribeConnections(); _unsubscribeConnections = null; _connectedUidSet.clear(); }
    if (_unsubscribeRequestState) { _unsubscribeRequestState(); _unsubscribeRequestState = null; }
    _pendingOutgoingUidSet.clear();
    _pendingIncomingUidSet.clear();
    _teardownMessageListener();
    _teardownStatusListeners();
    if (_myPresenceUnbind) { _myPresenceUnbind(); _myPresenceUnbind = null; }
    if (_unsubscribeChatList) { _unsubscribeChatList(); _unsubscribeChatList = null; }
    _activeChatListListenerUid = null; _renderedChatListSignature = "";
    _createChatListListener._lastSignature = ""; _fetchConnections._lastSignature = "";
  }

  function _clearSearchState() {
    if (_searchDebounceTimer) { clearTimeout(_searchDebounceTimer); _searchDebounceTimer = null; }
    _latestSearchQuery = "";
    _searchResultCache = [];
    _searchDropdownRef = null;
    if (_outsideClickHandler) { document.removeEventListener("mousedown", _outsideClickHandler); _outsideClickHandler = null; }
  }

  function _renderSearchResults(dropdown, list, stateByUid, currentUid) {
    if (!dropdown) return; dropdown.innerHTML = "";
    if (!list || !list.length) { dropdown.innerHTML = '<div class="vc-search-empty">No users found</div>'; dropdown.classList.add("vc-open"); return; }
    var visibleCount = 0;
    list.forEach(function (data) {
      var uid = data && data.uid ? data.uid : ""; if (!uid) return;
      var username = data.username || ""; if (!username) return;
      var name = data.name || username, photo = data.photoURL || "", initial = (username.charAt(0) || "U").toUpperCase();
      var state = stateByUid && uid ? stateByUid[uid] || "not_connected" : "not_connected", isSelf = uid === currentUid;
      if (isSelf) return;
      var actionHTML = "";
      if (state === "connected") {
        actionHTML = '<button type="button" class="vc-search-btn vc-message-btn" data-action="message" data-uid="' + _esc(uid) + '">Message</button>';
      } else if (state === "request_sent") {
        actionHTML = '<button type="button" class="vc-search-btn vc-requested-btn" data-action="requested" data-uid="' + _esc(uid) + '" disabled>Requested</button>';
      } else if (state === "request_received") {
        actionHTML = '<div class="vc-search-actions-group">' +
          '<button type="button" class="vc-search-btn vc-accept-btn" data-action="accept" data-uid="' + _esc(uid) + '">Accept</button>' +
          '<button type="button" class="vc-search-btn vc-reject-btn" data-action="deny" data-uid="' + _esc(uid) + '">Deny</button>' +
          "</div>";
      } else {
        actionHTML = '<button type="button" class="vc-search-btn vc-connect-btn" data-action="connect" data-uid="' + _esc(uid) + '">Connect</button>';
      }
      var itemEl = document.createElement("div");
      itemEl.className = "vc-search-item";
      itemEl.setAttribute("data-uid", uid); itemEl.setAttribute("data-state", state);
      itemEl.innerHTML = '<span class="vc-search-avatar">' +
        (photo ? '<img class="avatar" src="' + _esc(photo) + '" alt="' + _esc(username) + ' avatar">'
               : '<span class="vc-search-initial avatar-placeholder">' + _esc(initial) + "</span>") + "</span>" +
        '<span class="vc-search-meta"><span class="vc-search-username">@' + _esc(username) + "</span>" +
        '<span class="vc-search-name">' + _esc(name) + "</span></span>" +
        '<span class="vc-search-action" data-uid="' + _esc(uid) + '" data-state="' + _esc(state) + '">' + actionHTML + "</span>";
      dropdown.appendChild(itemEl); visibleCount++;
    });
    if (!visibleCount) dropdown.innerHTML = '<div class="vc-search-empty">No users found</div>';
    dropdown.classList.add("vc-open");
  }

  async function _isConnected(db, currentUid, targetUid) {
    if (_connectedUidSet.has(targetUid)) return true;
    var snap = await db.collection(CONNECTIONS_COLLECTION).where("users", "array-contains", currentUid).limit(50).get();
    var found = false;
    snap.forEach(function (doc) { if ((doc.data().users || []).indexOf(targetUid) !== -1) found = true; });
    return found;
  }

  async function _buildSearchItemStates(db, currentUid, users) {
    var stateByUid = {};
    if (!db || !currentUid || !users || !users.length) return stateByUid;
    var targetUids = users.map(function (i) { return i.uid || ""; }).filter(Boolean);
    if (!targetUids.length) return stateByUid;
    targetUids.forEach(function (uid) { stateByUid[uid] = uid === currentUid ? "self" : "not_connected"; });
    var requestedSet = new Set(_pendingOutgoingUidSet);
    var incomingSet = new Set(_pendingIncomingUidSet);

    if (!requestedSet.size && !incomingSet.size) {
      var results = await Promise.all([
        db.collection(REQUESTS_COLLECTION).where("fromUid", "==", currentUid).where("status", "==", "pending").limit(200).get(),
        db.collection(REQUESTS_COLLECTION).where("toUid", "==", currentUid).where("status", "==", "pending").limit(200).get()
      ]).catch(function (err) { console.error("[Vaani] _buildSearchItemStates error:", err); return [null, null]; });
      if (results[0]) results[0].forEach(function (doc) { if (doc.data().toUid) requestedSet.add(doc.data().toUid); });
      if (results[1]) results[1].forEach(function (doc) { if (doc.data().fromUid) incomingSet.add(doc.data().fromUid); });
    }

    targetUids.forEach(function (uid) {
      if (uid === currentUid)         { stateByUid[uid] = "self";             return; }
      if (_connectedUidSet.has(uid))  { stateByUid[uid] = "connected";        return; }
      if (incomingSet.has(uid))       { stateByUid[uid] = "request_received"; return; }
      if (requestedSet.has(uid))      { stateByUid[uid] = "request_sent";     return; }
      stateByUid[uid] = "not_connected";
    });
    return stateByUid;
  }

  function _buildRequestId(fromUid, toUid) {
    return String(fromUid || "") + "_" + String(toUid || "");
  }

  function _buildConnectionId(uidA, uidB) {
    var pair = [String(uidA || ""), String(uidB || "")].filter(Boolean).sort();
    if (pair.length !== 2) return "";
    return pair[0] + "_" + pair[1];
  }

  async function _upsertUserRequestMirrors(db, requestId, fromUid, toUid, status, createdAt, respondedAt) {
    var senderPayload = { toUid: toUid, status: status, createdAt: createdAt };
    var receiverPayload = { fromUid: fromUid, status: status, createdAt: createdAt };
    if (respondedAt) {
      senderPayload.respondedAt = respondedAt;
      receiverPayload.respondedAt = respondedAt;
    }
    await Promise.all([
      db.collection("users").doc(fromUid).collection(USER_REQUESTS_SENT_COLLECTION).doc(requestId).set(senderPayload, { merge: true }),
      db.collection("users").doc(toUid).collection(USER_REQUESTS_RECEIVED_COLLECTION).doc(requestId).set(receiverPayload, { merge: true })
    ]);
  }

  async function _deleteUserRequestMirrors(db, requestId, fromUid, toUid) {
    if (!db || !requestId || !fromUid || !toUid) return;
    await Promise.all([
      db.collection("users").doc(fromUid).collection(USER_REQUESTS_SENT_COLLECTION).doc(requestId).delete().catch(function () {}),
      db.collection("users").doc(toUid).collection(USER_REQUESTS_RECEIVED_COLLECTION).doc(requestId).delete().catch(function () {})
    ]);
  }

  async function _sendConnectionRequest(db, fromUid, toUid) {
    if (!db || !fromUid || !toUid) return;
    if (fromUid === toUid) return;
    if (await _isConnected(db, fromUid, toUid)) return;
    if (await _hasPendingConnectionRequest(db, fromUid, toUid)) return;
    if (await _hasPendingConnectionRequest(db, toUid, fromUid)) return;

    var requestId = _buildRequestId(fromUid, toUid);
    var createdAt = firebase.firestore.FieldValue.serverTimestamp();
    var senderProfile = _userProfileCache[fromUid] || {};
    await db.collection(REQUESTS_COLLECTION).doc(requestId).set({
      fromUid: fromUid,
      toUid: toUid,
      senderId: fromUid,
      receiverId: toUid,
      senderUsername: senderProfile.username || "",
      status: "pending",
      createdAt: createdAt,
      timestamp: createdAt
    }, { merge: true });
    await _upsertUserRequestMirrors(db, requestId, fromUid, toUid, "pending", createdAt, null);
  }

  async function _hasPendingConnectionRequest(db, fromUid, toUid) {
    var existing = await db.collection(REQUESTS_COLLECTION).where("fromUid", "==", fromUid).where("toUid", "==", toUid).where("status", "==", "pending").limit(1).get();
    return !existing.empty;
  }

  async function _findIncomingRequest(db, currentUid, fromUid) {
    if (!db || !currentUid || !fromUid) return null;
    var snap = await db.collection(REQUESTS_COLLECTION)
      .where("fromUid", "==", fromUid)
      .where("toUid", "==", currentUid)
      .where("status", "==", "pending")
      .limit(1)
      .get();
    if (snap.empty) return null;
    return snap.docs[0];
  }

  async function _createConnection(db, uidA, uidB) {
    var connectionId = _buildConnectionId(uidA, uidB);
    if (!connectionId) return;
    if (await _isConnected(db, uidA, uidB)) return;
    await db.collection(CONNECTIONS_COLLECTION).doc(connectionId).set({
      users: connectionId.split("_"),
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  }

  async function _acceptConnectionRequest(db, requestId, currentUid, fromUid) {
    if (!db || !requestId || !currentUid || !fromUid) { console.error("[Vaani] acceptConnectionRequest: missing params"); return; }
    try {
      var requestRef = db.collection(REQUESTS_COLLECTION).doc(requestId);
      var nowTs = firebase.firestore.FieldValue.serverTimestamp();
      var serverTime = firebase.firestore.Timestamp.now();

      await db.runTransaction(async function (tx) {
        var requestSnap = await tx.get(requestRef);
        if (!requestSnap.exists) {
          throw new Error("REQUEST_NOT_FOUND");
        }
        var requestData = requestSnap.data() || {};
        var fromRequestUid = String(requestData.fromUid || fromUid || "");
        var toRequestUid = String(requestData.toUid || currentUid || "");
        var currentStatus = String(requestData.status || "");
        if (!fromRequestUid || !toRequestUid) throw new Error("REQUEST_INVALID");
        if (toRequestUid !== String(currentUid)) throw new Error("REQUEST_NOT_FOR_USER");

        if (currentStatus === "accepted") {
          console.warn("[Vaani] acceptConnectionRequest: already accepted");
          return;
        }
        if (currentStatus && currentStatus !== "pending") throw new Error("REQUEST_NOT_PENDING");

        var connectionId = _buildConnectionId(fromRequestUid, toRequestUid);
        if (!connectionId) throw new Error("REQUEST_INVALID");
        var sortedUsers = connectionId.split("_");
        var connectionRef = db.collection(CONNECTIONS_COLLECTION).doc(connectionId);
        var connectionSnap = await tx.get(connectionRef);
        if (!connectionSnap.exists) {
          tx.set(connectionRef, { users: sortedUsers, createdAt: nowTs });
        }

        tx.update(requestRef, { status: "accepted", respondedAt: nowTs });
        tx.set(db.collection("users").doc(fromRequestUid).collection(USER_REQUESTS_SENT_COLLECTION).doc(requestId), {
          toUid: toRequestUid, status: "accepted", respondedAt: nowTs
        }, { merge: true });
        tx.set(db.collection("users").doc(toRequestUid).collection(USER_REQUESTS_RECEIVED_COLLECTION).doc(requestId), {
          fromUid: fromRequestUid, status: "accepted", respondedAt: nowTs
        }, { merge: true });

        var chatId = _generateChatId(fromRequestUid, toRequestUid);
        if (chatId) {
          tx.set(db.collection(CHATS_COLLECTION).doc(chatId), {
            participants: sortedUsers,
            updatedAt: nowTs,
            createdAt: nowTs
          }, { merge: true });
        }

        var receiverProfile = _userProfileCache[toRequestUid] || {};
        var receiverName = receiverProfile.username || receiverProfile.displayName || "A user";
        tx.set(db.collection(NOTIFICATIONS_COLLECTION).doc(), {
          type: "connection_accepted",
          toUid: fromRequestUid,
          fromUid: toRequestUid,
          requestId: requestId,
          connectionId: connectionId,
          createdAt: nowTs,
          read: false,
          message: receiverName + " accepted your request. You can start a conversation."
        });
      });

      incomingRequests = incomingRequests.filter(function (request) { return request.id !== requestId; });
      _renderIncomingRequests(incomingRequests);
      _connectedUidSet.add(fromUid);
      _refreshActiveSearchDropdown();
      if (window.vaaniChat && typeof window.vaaniChat.attachChatListListener === "function") {
        window.vaaniChat.attachChatListListener();
      }
      var chatId = _generateChatId(currentUid, fromUid);
      if (chatId && window.vaaniChat && typeof window.vaaniChat.upsertConversationPlaceholder === "function") {
        window.vaaniChat.upsertConversationPlaceholder(chatId, fromUid, "", serverTime);
      }
      if (typeof window.showToast === "function") window.showToast("Connection accepted");
    } catch (err) { console.error("[Vaani] acceptConnectionRequest failed:", err); throw err; }
  }

  async function _rejectConnectionRequest(db, requestId) {
    if (!db || !requestId) { console.error("[Vaani] rejectConnectionRequest: missing params"); return; }
    try {
      var nowTs = firebase.firestore.FieldValue.serverTimestamp();
      var requestRef = db.collection(REQUESTS_COLLECTION).doc(requestId);
      var participantPair = await db.runTransaction(async function (tx) {
        var requestSnap = await tx.get(requestRef);
        if (!requestSnap.exists) throw new Error("REQUEST_ALREADY_HANDLED");
        var requestData = requestSnap.data() || {};
        var status = String(requestData.status || "pending");
        if (status !== "pending") throw new Error("REQUEST_ALREADY_HANDLED");
        var fromUid = String(requestData.fromUid || "");
        var toUid = String(requestData.toUid || "");
        if (!fromUid || !toUid) throw new Error("REQUEST_INVALID");

        tx.update(requestRef, { status: "denied", respondedAt: nowTs });
        tx.set(db.collection("users").doc(fromUid).collection(USER_REQUESTS_SENT_COLLECTION).doc(requestId), {
          toUid: toUid, status: "denied", respondedAt: nowTs
        }, { merge: true });
        tx.set(db.collection("users").doc(toUid).collection(USER_REQUESTS_RECEIVED_COLLECTION).doc(requestId), {
          fromUid: fromUid, status: "denied", respondedAt: nowTs
        }, { merge: true });
        return { fromUid: fromUid, toUid: toUid };
      });

      if (participantPair && participantPair.fromUid && participantPair.toUid) {
        await _deleteUserRequestMirrors(db, requestId, participantPair.fromUid, participantPair.toUid);
      }
    } catch (err) { console.error("[Vaani] rejectConnectionRequest failed:", err); throw err; }
  }

  function _renderIncomingRequests(requests) {
    var listEl = document.getElementById("vcRequestsList"), badgeEl = document.getElementById("vcRequestsBadge");
    if (!listEl || !badgeEl) return;
    var count = requests.length;
    badgeEl.textContent = String(count); badgeEl.classList.toggle("vc-visible", count > 0);
    if (!count) { listEl.innerHTML = '<div class="vc-requests-empty">No pending requests</div>'; return; }
    listEl.innerHTML = requests.map(function (r) {
      return '<div class="vc-request-item"><div class="vc-request-copy">@' + _esc(r.fromUsername || "user") + "</div>" +
        '<div class="vc-request-copy">' + _esc(r.fromName || "") + "</div>" +
        '<div class="vc-request-actions">' +
        '<button type="button" class="vc-mini-btn vc-accept-btn" data-request-id="' + _esc(r.id) + '" data-from-uid="' + _esc(r.fromUid) + '" data-to-uid="' + _esc(r.toUid) + '">Accept</button>' +
        '<button type="button" class="vc-mini-btn vc-reject-btn" data-request-id="' + _esc(r.id) + '">Deny</button></div></div>';
    }).join("");
  }

  function _formatRequestTime(ts) {
    if (!ts) return "";
    try {
      var value = typeof ts.toDate === "function" ? ts.toDate() : (ts instanceof Date ? ts : null);
      if (!value || Number.isNaN(value.getTime())) return "";
      return value.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    } catch (_err) {
      return "";
    }
  }

  function _renderSentRequests(requests) {
    var listEl = document.getElementById("vcSentRequestsList");
    var badgeEl = document.getElementById("vcSentRequestsBadge");
    if (!listEl || !badgeEl) return;
    var count = requests.length;
    badgeEl.textContent = String(count);
    badgeEl.classList.toggle("vc-visible", count > 0);
    if (!count) {
      listEl.innerHTML = '<div class="vc-requests-empty">No pending requests</div>';
      return;
    }
    listEl.innerHTML = requests.map(function (r) {
      var createdAt = _formatRequestTime(r.createdAt);
      return '<div class="vc-request-item vc-request-item-sent" style="cursor:pointer;" data-to-uid="' + _esc(r.toUid || "") + '">' +
        '<div class="vc-request-meta">' +
        '<div class="vc-request-copy">@' + _esc(r.toUsername || "user") + "</div>" +
        '<div class="vc-request-copy">' + _esc(r.statusLabel || "Pending") + (createdAt ? " • " + _esc(createdAt) : "") + "</div>" +
        "</div></div>";
    }).join("");
  }

  function _syncIncomingRequestsUI() {
    incomingRequests = Object.keys(_incomingRequestsById)
      .map(function (requestId) { return _incomingRequestsById[requestId]; })
      .filter(function (request) { return request && String(request.status || "pending").toLowerCase() === "pending"; })
      .sort(function (a, b) {
        return _timestampToMillis(b.createdAt) - _timestampToMillis(a.createdAt);
      });
    _pendingIncomingUidSet.clear();
    incomingRequests.forEach(function (request) {
      var fromUid = String(request && request.fromUid ? request.fromUid : "");
      if (fromUid) _pendingIncomingUidSet.add(fromUid);
    });
    _renderIncomingRequests(incomingRequests);
  }

  function _syncSentRequestsUI() {
    sentRequests = Object.keys(_sentRequestsById)
      .map(function (requestId) { return _sentRequestsById[requestId]; })
      .filter(function (request) { return request && String(request.status || "pending").toLowerCase() === "pending"; })
      .sort(function (a, b) {
        return _timestampToMillis(b.createdAt) - _timestampToMillis(a.createdAt);
      })
      .map(function (request) {
        return {
          id: request.id,
          toUid: request.toUid,
          toUsername: request.toUsername || "user",
          statusLabel: "Pending",
          createdAt: request.createdAt || null
        };
      });
    _pendingOutgoingUidSet.clear();
    sentRequests.forEach(function (request) {
      var toUid = String(request && request.toUid ? request.toUid : "");
      if (toUid) _pendingOutgoingUidSet.add(toUid);
    });
    _renderSentRequests(sentRequests);
  }

  async function _fetchIncomingRequests(currentUid) {
    var db = window.vaaniRouter && typeof window.vaaniRouter.getDb === "function" ? window.vaaniRouter.getDb() : null;
    if (!db || !currentUid) return;
    if (_unsubscribeIncomingRequests) { _unsubscribeIncomingRequests(); _unsubscribeIncomingRequests = null; }
    _incomingRequestsById = Object.create(null);
    incomingRequests = [];
    _renderIncomingRequests([]);

    _unsubscribeIncomingRequests = db.collection(REQUESTS_COLLECTION)
      .where("toUid", "==", currentUid).orderBy("createdAt", "desc")
      .onSnapshot(async function (snapshot) {
        var tasks = snapshot.docChanges().map(async function (change) {
          var doc = change.doc;
          if (change.type === "removed") {
            delete _incomingRequestsById[doc.id];
            return;
          }
          var data = doc.data() || {};
          var requestId = doc.id;
          var status = String(data.status || "pending").toLowerCase();
          var senderUid = String(data.fromUid || data.senderId || "");
          if (!requestId || !senderUid) return;
          if (status !== "pending") {
            delete _incomingRequestsById[requestId];
            return;
          }
          var username = String(data.senderUsername || "").trim();
          var displayName = "";
          try {
            var fromProfile = await _getUserProfileCached(db, senderUid);
            if (!username) username = fromProfile && fromProfile.username ? fromProfile.username : "user";
            displayName = fromProfile && fromProfile.displayName ? fromProfile.displayName : "";
          } catch (err) {
            console.error("[Vaani] Failed to load incoming request profile:", err);
            if (!username) username = "user";
          }
          _incomingRequestsById[requestId] = {
            id: requestId,
            fromUid: senderUid,
            toUid: data.toUid || data.receiverId || "",
            fromUsername: username || "user",
            fromName: displayName || "",
            status: status,
            createdAt: data.createdAt || data.timestamp || null
          };
        });

        try {
          await Promise.all(tasks);
        } finally {
          _syncIncomingRequestsUI();
        }
      }, function (err) {
        console.error("[Vaani] incoming requests listener error:", err);
        _incomingRequestsById = Object.create(null);
        incomingRequests = [];
        _renderIncomingRequests([]);
      });
  }

  async function _fetchSentRequests(currentUid) {
    var db = window.vaaniRouter && typeof window.vaaniRouter.getDb === "function" ? window.vaaniRouter.getDb() : null;
    if (!db || !currentUid) return;
    if (_unsubscribeSentRequests) { _unsubscribeSentRequests(); _unsubscribeSentRequests = null; }
    _sentRequestsById = Object.create(null);
    sentRequests = [];
    _renderSentRequests([]);

    _unsubscribeSentRequests = db.collection(REQUESTS_COLLECTION)
      .where("fromUid", "==", currentUid)
      .orderBy("createdAt", "desc")
      .onSnapshot(async function (snapshot) {
        var tasks = snapshot.docChanges().map(async function (change) {
          var doc = change.doc;
          if (change.type === "removed") {
            delete _sentRequestsById[doc.id];
            return;
          }
          var data = doc.data() || {};
          var requestId = doc.id;
          var status = String(data.status || "").toLowerCase();
          if (!requestId) return;
          if (status !== "pending") {
            delete _sentRequestsById[requestId];
            return;
          }

          var receiverUid = String(data.toUid || data.receiverId || "");
          var receiverUsername = String(data.receiverUsername || "").trim();
          if (!receiverUsername && receiverUid) {
            try {
              var receiverProfile = await _getUserProfileCached(db, receiverUid);
              receiverUsername = receiverProfile && receiverProfile.username ? receiverProfile.username : "user";
            } catch (err) {
              console.error("[Vaani] Failed to load sent-request receiver profile:", err);
              receiverUsername = "user";
            }
          }
          _sentRequestsById[requestId] = {
            id: requestId,
            toUid: receiverUid,
            toUsername: receiverUsername || "user",
            status: "pending",
            createdAt: data.createdAt || data.timestamp || null
          };
        });
        try {
          await Promise.all(tasks);
        } finally {
          _syncSentRequestsUI();
        }
      }, function (err) {
        console.error("[Vaani] sent requests listener error:", err);
        _sentRequestsById = Object.create(null);
        sentRequests = [];
        _renderSentRequests([]);
      });
  }

  function _bindIncomingRequestActions() {
    var listEl = document.getElementById("vcRequestsList"), toggleBtn = document.getElementById("vcRequestsToggle"), panel = document.getElementById("vcRequestsPanel");
    if (!listEl || !toggleBtn || !panel) return;
    toggleBtn.addEventListener("click", function () { panel.classList.toggle("vc-open"); });
    listEl.addEventListener("click", async function (event) {
      var acceptBtn = event.target.closest(".vc-accept-btn"), rejectBtn = event.target.closest(".vc-reject-btn");
      if (!acceptBtn && !rejectBtn) return;
      var actionBtn = acceptBtn || rejectBtn;
      var requestId = actionBtn.getAttribute("data-request-id") || "", fromUid = actionBtn.getAttribute("data-from-uid") || "";
      if (!requestId) { console.error("[Vaani] request click: missing requestId"); return; }
      if (acceptBtn && !fromUid) { console.error("[Vaani] request click: missing fromUid"); return; }
      var currentUid = window._vaaniCurrentUser && window._vaaniCurrentUser.uid ? window._vaaniCurrentUser.uid : "";
      if (!currentUid) { console.error("[Vaani] request click: no current user"); return; }
      var db = window.vaaniRouter && typeof window.vaaniRouter.getDb === "function" ? window.vaaniRouter.getDb() : null;
      if (!db) { console.error("[Vaani] request click: db unavailable"); return; }
      actionBtn.disabled = true;
      incomingRequests = incomingRequests.filter(function (request) { return request.id !== requestId; });
      _renderIncomingRequests(incomingRequests);
      try {
        if (acceptBtn) {
          await _acceptConnectionRequest(db, requestId, currentUid, fromUid);
          // Open chat immediately after accepting
          if (fromUid) {
            panel.classList.remove("vc-open");
            _openChatWithUser({ uid: fromUid }).catch(function (e) {
              console.warn("[Vaani] open chat after accept failed:", e);
            });
          }
        } else {
          await _rejectConnectionRequest(db, requestId);
        }
      } catch (err) {
        console.error("[Vaani] request action failed:", err);
        if (err && err.message === "REQUEST_ALREADY_HANDLED") {
          _fetchIncomingRequests(currentUid);
          return;
        }
        actionBtn.disabled = false;
        if (typeof window.showToast === "function") window.showToast("Action failed — please try again");
      }
    });
  }

  function _bindSentRequestActions() {
    var toggleBtn = document.getElementById("vcSentRequestsToggle");
    var panel = document.getElementById("vcSentRequestsPanel");
    var listEl = document.getElementById("vcSentRequestsList");
    if (!toggleBtn || !panel) return;
    toggleBtn.addEventListener("click", function () { panel.classList.toggle("vc-open"); });
    if (listEl) {
      listEl.addEventListener("click", function (event) {
        var item = event.target.closest(".vc-request-item-sent");
        if (!item) return;
        var toUid = item.getAttribute("data-to-uid");
        if (!toUid) return;
        panel.classList.remove("vc-open");
        _openChatWithUser({ uid: toUid }).catch(function (err) {
          console.warn("[Vaani] open chat from sent request failed:", err);
        });
      });
    }
  }

  async function _fetchUsersByPrefix(query, dropdown) {
    var db = window.vaaniRouter && typeof window.vaaniRouter.getDb === "function" ? window.vaaniRouter.getDb() : null;
    if (!db || !dropdown) return;
    try {
      var snapshot = await db.collection("users").orderBy("username").startAt(query).endAt(query + "\uf8ff").limit(10).get();
      if (query !== _latestSearchQuery) return;
      var currentUid = window._vaaniCurrentUser && window._vaaniCurrentUser.uid ? window._vaaniCurrentUser.uid : "";
      var list = [];
      snapshot.forEach(function (doc) {
        var data = doc.data(); if (!data || !data.username) return;
        if (window._vaaniCurrentUser && window._vaaniCurrentUser.uid && doc.id === window._vaaniCurrentUser.uid) return;
        list.push({ uid: doc.id, username: data.username, name: data.name || "", photoURL: data.photoURL || "" });
      });
      if (query !== _latestSearchQuery) return;
      _searchResultCache = list.slice();
      _searchDropdownRef = dropdown;
      var stateByUid = await _buildSearchItemStates(db, currentUid, list);
      if (query !== _latestSearchQuery) return;
      _renderSearchResults(dropdown, list, stateByUid, currentUid);
    } catch (err) {
      console.error("[Vaani] search error:", err);
      if (query !== _latestSearchQuery) return;
      dropdown.innerHTML = '<div class="vc-search-empty">Search failed. Try again.</div>';
      dropdown.classList.add("vc-open");
    }
  }

  async function _refreshActiveSearchDropdown() {
    var currentUid = window._vaaniCurrentUser && window._vaaniCurrentUser.uid ? window._vaaniCurrentUser.uid : "";
    var db = window.vaaniRouter && typeof window.vaaniRouter.getDb === "function" ? window.vaaniRouter.getDb() : null;
    if (!db || !_searchDropdownRef || !_searchResultCache.length || !currentUid || !_latestSearchQuery) return;
    var stateByUid = await _buildSearchItemStates(db, currentUid, _searchResultCache);
    if (_latestSearchQuery) _renderSearchResults(_searchDropdownRef, _searchResultCache, stateByUid, currentUid);
  }

  function _listenToRequestState(currentUid) {
    var db = window.vaaniRouter && typeof window.vaaniRouter.getDb === "function" ? window.vaaniRouter.getDb() : null;
    if (!db || !currentUid) return;
    if (_unsubscribeRequestState) { _unsubscribeRequestState(); _unsubscribeRequestState = null; }
    var offOutgoing = db.collection(REQUESTS_COLLECTION)
      .where("fromUid", "==", currentUid)
      .where("status", "==", "pending")
      .onSnapshot(function (snapshot) {
        _pendingOutgoingUidSet.clear();
        snapshot.forEach(function (doc) {
          var data = doc.data() || {};
          var toUid = String(data.toUid || data.receiverId || "");
          if (toUid && toUid !== currentUid) _pendingOutgoingUidSet.add(toUid);
        });
        _refreshActiveSearchDropdown();
      }, function (err) {
        console.error("[Vaani] outgoing request-state listener error:", err);
      });
    var offIncoming = db.collection(REQUESTS_COLLECTION)
      .where("toUid", "==", currentUid)
      .where("status", "==", "pending")
      .onSnapshot(function (snapshot) {
        _pendingIncomingUidSet.clear();
        snapshot.forEach(function (doc) {
          var data = doc.data() || {};
          var fromUid = String(data.fromUid || data.senderId || "");
          if (fromUid && fromUid !== currentUid) _pendingIncomingUidSet.add(fromUid);
        });
        _refreshActiveSearchDropdown();
      }, function (err) {
        console.error("[Vaani] incoming request-state listener error:", err);
      });
    _unsubscribeRequestState = function () { offOutgoing(); offIncoming(); };
  }

  async function _openChatWithUser(targetUser) {
    var currentUser = window._vaaniCurrentUser || null;
    var db = window.vaaniRouter && typeof window.vaaniRouter.getDb === "function"
      ? window.vaaniRouter.getDb() : null;
    var uid = targetUser && targetUser.uid ? String(targetUser.uid) : "";
    if (!currentUser || !currentUser.uid || !db || !uid) {
      throw new Error("INVALID_CHAT_TARGET");
    }
    if (String(currentUser.uid) === uid) {
      throw new Error("SELF_CHAT_NOT_ALLOWED");
    }
    var user = targetUser;
    if (!user || typeof user !== "object" || !user.name) {
      user = await _fetchOtherProfile(db, uid);
      user.uid = uid;
    }
    var sortedPair = [String(currentUser.uid), uid].sort();
    var chatId = sortedPair[0] + "_" + sortedPair[1];
    await db.collection(CHATS_COLLECTION).doc(chatId).set({
      participants: sortedPair,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    _activeChatId = chatId;
    _openChatUI(chatId, user);
    return chatId;
  }

  function _bindUserSearch() {
    var searchWrap     = document.getElementById("vcSearchWrap");
    var searchInput    = document.getElementById("vcUserSearchInput");
    var searchDropdown = document.getElementById("vcSearchDropdown");
    if (!searchWrap || !searchInput || !searchDropdown) return;

    function closeDropdown() { searchDropdown.classList.remove("vc-open"); }

    searchInput.addEventListener("input", function () {
      var query = (searchInput.value || "").trim().toLowerCase();
      clearTimeout(_searchDebounceTimer);
      if (!query) { _latestSearchQuery = ""; searchDropdown.innerHTML = ""; closeDropdown(); return; }
      _latestSearchQuery = query;
      _searchDebounceTimer = setTimeout(function () { _fetchUsersByPrefix(query, searchDropdown); }, 300);
    });

    searchDropdown.addEventListener("click", async function (event) {
      var actionBtn = event.target.closest(".vc-search-btn"); if (!actionBtn) return;
      var action = actionBtn.getAttribute("data-action") || "";
      var targetUid = actionBtn.getAttribute("data-uid") || "";
      var currentUid = window._vaaniCurrentUser && window._vaaniCurrentUser.uid ? window._vaaniCurrentUser.uid : "";
      if (!currentUid || !targetUid || currentUid === targetUid) return;
      var db = window.vaaniRouter && typeof window.vaaniRouter.getDb === "function" ? window.vaaniRouter.getDb() : null;
      if (!db) return;
      actionBtn.disabled = true;
      try {
        if (action === "message") {
          var profile = await _fetchOtherProfile(db, targetUid); profile.uid = targetUid;
          closeDropdown(); await _openChatWithUser(profile);
          return;
        }
        if (action === "connect") {
          if (await _isConnected(db, currentUid, targetUid)) return;
          var hasOutgoing = await _hasPendingConnectionRequest(db, currentUid, targetUid);
          var hasIncoming = await _hasPendingConnectionRequest(db, targetUid, currentUid);
          if (!hasOutgoing && !hasIncoming) {
            _pendingOutgoingUidSet.add(targetUid);
            _pendingIncomingUidSet.delete(targetUid);
            await _refreshActiveSearchDropdown();
            await _sendConnectionRequest(db, currentUid, targetUid);
          }
          await _refreshActiveSearchDropdown();
          return;
        }
        if (action === "accept") {
          var incomingDoc = await _findIncomingRequest(db, currentUid, targetUid);
          if (incomingDoc) await _acceptConnectionRequest(db, incomingDoc.id, currentUid, targetUid);
          await _refreshActiveSearchDropdown();
          return;
        }
        if (action === "deny") {
          var rejectDoc = await _findIncomingRequest(db, currentUid, targetUid);
          if (rejectDoc) await _rejectConnectionRequest(db, rejectDoc.id);
          await _refreshActiveSearchDropdown();
        }
      } catch (err) {
        console.error("[Vaani] search action failed:", err);
        if (typeof window.showToast === "function") window.showToast("Action failed — please try again");
      } finally {
        actionBtn.disabled = false;
      }
    });

    _outsideClickHandler = function (event) { if (!searchWrap.contains(event.target)) closeDropdown(); };
    document.addEventListener("mousedown", _outsideClickHandler);
  }

  async function _fetchOtherProfile(db, uid) {
    try { var doc = await db.collection("users").doc(uid).get(); if (doc.exists) return doc.data() || {}; }
    catch (err) { console.error("[Vaani] Failed to load user by uid:", err); }
    return {};
  }

  function _messagePreviewText(msg) {
    if (!msg || typeof msg !== "object") return "";
    var text = String(msg.text || "").trim();
    if (text) return text;
    if (msg.type === "voice") return "\ud83c\udfa4 Voice message";
    return "";
  }

  function _makeOptimisticId() {
    _optimisticCounter += 1;
    return "temp_" + Date.now() + "_" + _optimisticCounter;
  }

  function _findOptimisticIndexById(messageId) {
    var targetId = String(messageId || "").trim();
    if (!targetId) return -1;
    for (var i = 0; i < _optimisticMessages.length; i += 1) {
      if (String(_optimisticMessages[i] && _optimisticMessages[i].id || "") === targetId) return i;
    }
    return -1;
  }

  function _findOptimisticIndexByTempId(tempId) {
    var targetId = String(tempId || "").trim();
    if (!targetId) return -1;
    for (var i = 0; i < _optimisticMessages.length; i += 1) {
      if (String(_optimisticMessages[i] && _optimisticMessages[i]._optimisticId || "") === targetId) return i;
    }
    return -1;
  }

  function _upsertOptimisticMessage(msg) {
    if (!msg || typeof msg !== "object") return;
    var idx = _findOptimisticIndexByTempId(msg._optimisticId || msg.id);
    if (idx >= 0) _optimisticMessages[idx] = Object.assign({}, _optimisticMessages[idx], msg);
    else _optimisticMessages.push(msg);
  }

  function _markOptimisticMessageSent(tempId, firestoreId) {
    var idx = _findOptimisticIndexByTempId(tempId);
    if (idx < 0) return;
    _optimisticMessages[idx] = Object.assign({}, _optimisticMessages[idx], {
      id: String(firestoreId || _optimisticMessages[idx].id || tempId),
      pending: false,
      failed: false
    });
  }

  function _markOptimisticMessageFailed(tempId) {
    var idx = _findOptimisticIndexByTempId(tempId);
    if (idx < 0) return;
    _optimisticMessages[idx] = Object.assign({}, _optimisticMessages[idx], {
      pending: false,
      failed: true
    });
  }

  function _cleanupOptimisticMessages(serverMessages) {
    var serverIds = new Set((serverMessages || []).map(function (msg) { return String(msg && msg.id || ""); }).filter(Boolean));
    var serverNonces = new Set((serverMessages || []).map(function (msg) { return String(msg && msg.clientNonce || ""); }).filter(Boolean));
    _optimisticMessages = _optimisticMessages.filter(function (msg) {
      if (!msg || typeof msg !== "object") return false;
      if (msg.failed) return true;
      var id = String(msg.id || "");
      var nonce = String(msg.clientNonce || msg._optimisticId || "");
      if (id && serverIds.has(id)) return false;
      if (nonce && serverNonces.has(nonce)) return false;
      return true;
    });
  }

  function _messageTimestampMillis(msg) {
    if (!msg || typeof msg !== "object") return 0;
    var ts = msg.timestamp || msg.createdAt || msg.clientCreatedAt || null;
    if (!ts) return 0;
    if (typeof ts.toMillis === "function") return ts.toMillis();
    if (ts instanceof Date) return ts.getTime();
    if (typeof ts === "number" && isFinite(ts)) return ts;
    return 0;
  }

  function _sortMessagesStable(list) {
    return (Array.isArray(list) ? list.slice() : []).sort(function (a, b) {
      var aTs = _messageTimestampMillis(a);
      var bTs = _messageTimestampMillis(b);
      if (aTs !== bTs) return aTs - bTs;
      var aPending = a && a.pending ? 1 : 0;
      var bPending = b && b.pending ? 1 : 0;
      if (aPending !== bPending) return aPending - bPending;
      var aKey = String(a && (a.id || a._optimisticId || a.clientNonce) || "");
      var bKey = String(b && (b.id || b._optimisticId || b.clientNonce) || "");
      return aKey.localeCompare(bKey);
    });
  }

  function _setServerMessages(nextServerMessages) {
    _messages = _sortMessagesStable(Array.isArray(nextServerMessages) ? nextServerMessages : []);
  }

  function _mergeMessagesForRender() {
    var mergedMap = Object.create(null);
    var ordered = [];
    function _append(msg, sourcePriority) {
      if (!msg || typeof msg !== "object") return;
      var id = String(msg.id || msg._optimisticId || "");
      var key = id || ("anon_" + ordered.length + "_" + Date.now());
      var existing = mergedMap[key];
      if (!existing) {
        mergedMap[key] = Object.assign({ _sourcePriority: sourcePriority }, msg);
        ordered.push(mergedMap[key]);
        return;
      }
      if ((existing._sourcePriority || 0) <= sourcePriority) {
        mergedMap[key] = Object.assign({}, existing, msg, { _sourcePriority: sourcePriority });
        for (var i = 0; i < ordered.length; i += 1) {
          var existingKey = String(ordered[i] && (ordered[i].id || ordered[i]._optimisticId) || "");
          if (existingKey === key) {
            ordered[i] = mergedMap[key];
            break;
          }
        }
      }
    }
    (Array.isArray(_optimisticMessages) ? _optimisticMessages : []).forEach(function (msg) { _append(msg, 1); });
    (Array.isArray(_messages) ? _messages : []).forEach(function (msg) { _append(msg, 2); });
    return _sortMessagesStable(ordered);
  }

  // ── FIX 6: sendMessage — always include sorted participants[] ────────────
  async function sendMessage(chatId, text, currentUid, otherUid, replyTo, extraData) {
    var db = window.vaaniRouter && typeof window.vaaniRouter.getDb === "function" ? window.vaaniRouter.getDb() : null;
    if (!db || !chatId || !currentUid || !otherUid) return;
    var hasText = !!String(text || "").trim();
    var hasVoice = !!(extraData && extraData.type === "voice" && (extraData.audioUrl || extraData.audioData));
    if (!hasText && !hasVoice) return;
    var participants = [String(currentUid), String(otherUid)].sort();
    var msgData = {
      text: String(text || ""), senderId: currentUid, receiverId: otherUid,
      participants: participants, chatId: chatId,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (extraData && typeof extraData === "object") {
      if (extraData.type) msgData.type = String(extraData.type);
      if (extraData.audioUrl) msgData.audioUrl = String(extraData.audioUrl);
      if (extraData.audioData) msgData.audioData = String(extraData.audioData);
      if (extraData.audioMimeType) msgData.audioMimeType = String(extraData.audioMimeType);
      if (extraData.clientNonce) msgData.clientNonce = String(extraData.clientNonce);
      if (extraData.durationMs && Number(extraData.durationMs) > 0) {
        msgData.durationMs = Math.max(0, Math.round(Number(extraData.durationMs)));
        msgData.duration = Math.max(0, Math.round(Number(extraData.durationMs) / 1000));
      }
    }
    if (replyTo && replyTo.id) {
      msgData.replyTo = {
        id: String(replyTo.id),
        text: _messagePreviewText(replyTo).slice(0, 200),
        senderId: String(replyTo.senderId || "")
      };
    }
    var previewText = hasVoice ? "\ud83c\udfa4 Voice message" : String(text || "");
    var docRef = await db.collection(CHATS_COLLECTION).doc(chatId).collection(MESSAGES_COLLECTION).add(msgData);
    try {
      await db.collection(CHATS_COLLECTION).doc(chatId).set({
        participants: participants,
        lastMessage: previewText,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    } catch (chatMetaErr) {
      console.warn("[Vaani] sendMessage: message saved but chat preview update failed:", chatMetaErr);
    }
    return docRef && docRef.id ? String(docRef.id) : "";
  }
function _setReplyTo(msg) {
  _replyToMessage = msg ? { id: msg.id || null, text: _messagePreviewText(msg), senderId: String(msg.senderId || "") } : null;
  _renderReplyBanner();
}

function _renderReplyBanner() {
  var bar = document.getElementById("vcReplyBanner");
  if (!bar) return;
  if (!_replyToMessage) {
    bar.style.display = "none";
    bar.innerHTML = "";
    return;
  }
  var currentUid = window._vaaniCurrentUser && window._vaaniCurrentUser.uid ? String(window._vaaniCurrentUser.uid) : "";
  var isOwn = _replyToMessage.senderId === currentUid;
  var senderLabel = isOwn ? "You" : (_selectedChatUser && _selectedChatUser.username ? "@" + _selectedChatUser.username : "@" + _esc(_replyToMessage.senderId));
  bar.style.display = "flex";
  bar.innerHTML =
    '<div class="vc-reply-banner-content">' +
      '<div class="vc-reply-banner-label">' + _esc(senderLabel) + '</div>' +
      '<div class="vc-reply-banner-text">' + _esc(_replyToMessage.text.slice(0, 80) + (_replyToMessage.text.length > 80 ? "\u2026" : "")) + '</div>' +
    '</div>' +
    '<button class="vc-reply-banner-close" id="vcReplyBannerClose" aria-label="Cancel reply">' +
      '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
    '</button>';
  var closeBtn = document.getElementById("vcReplyBannerClose");
  if (closeBtn) closeBtn.addEventListener("click", function () { _setReplyTo(null); });
}

  function _voiceDurationLabel(ms) {
    var totalSeconds = Math.max(0, Math.floor(Number(ms || 0) / 1000));
    var minutes = Math.floor(totalSeconds / 60);
    var seconds = totalSeconds % 60;
    return String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0");
  }

  function _setActiveVoicePlayback(audioEl, syncBtnIcon) {
    if (_activeVoicePlayback && _activeVoicePlayback.audioEl && _activeVoicePlayback.audioEl !== audioEl) {
      try { _activeVoicePlayback.audioEl.pause(); } catch (e) {}
      if (typeof _activeVoicePlayback.syncBtnIcon === "function") _activeVoicePlayback.syncBtnIcon();
    }
    _activeVoicePlayback = { audioEl: audioEl, syncBtnIcon: syncBtnIcon };
  }

  function _destroyActiveVoicePlayback() {
    if (_activeVoicePlayback && _activeVoicePlayback.audioEl) {
      try { _activeVoicePlayback.audioEl.pause(); } catch (e) {}
    }
    _activeVoicePlayback = null;
  }

  function _createVoiceMessageBubble(msg) {
    var voiceWrap = document.createElement("div");
    voiceWrap.className = "vc-msg-voice";
    var audioEl = document.createElement("audio");
    audioEl.className = "vc-msg-voice-player";
    audioEl.preload = "metadata";
    audioEl.src = String(msg.audioUrl || msg.audioData || "");

    var controlsRow = document.createElement("div");
    controlsRow.className = "vc-msg-voice-controls";

    var playPauseBtn = document.createElement("button");
    playPauseBtn.type = "button";
    playPauseBtn.className = "vc-msg-voice-btn";
    playPauseBtn.setAttribute("aria-label", "Play voice message");

    var backBtn = document.createElement("button");
    backBtn.type = "button";
    backBtn.className = "vc-msg-voice-seek";
    backBtn.textContent = "−10s";
    backBtn.setAttribute("aria-label", "Seek backward 10 seconds");

    var fwdBtn = document.createElement("button");
    fwdBtn.type = "button";
    fwdBtn.className = "vc-msg-voice-seek";
    fwdBtn.textContent = "+10s";
    fwdBtn.setAttribute("aria-label", "Seek forward 10 seconds");

    var durationLabel = document.createElement("span");
    durationLabel.className = "vc-msg-voice-duration";
    durationLabel.textContent = _voiceDurationLabel(msg.durationMs || 0);

    function _syncPlayPauseIcon() {
      var isPlaying = !audioEl.paused && !audioEl.ended;
      playPauseBtn.textContent = isPlaying ? "❚❚" : "▶";
      playPauseBtn.setAttribute("aria-label", isPlaying ? "Pause voice message" : "Play voice message");
    }

    playPauseBtn.addEventListener("click", function () {
      if (audioEl.paused || audioEl.ended) {
        _setActiveVoicePlayback(audioEl, _syncPlayPauseIcon);
        audioEl.play().catch(function () {});
      } else {
        audioEl.pause();
      }
    });
    backBtn.addEventListener("click", function () {
      audioEl.currentTime = Math.max(0, (audioEl.currentTime || 0) - 10);
    });
    fwdBtn.addEventListener("click", function () {
      var dur = isFinite(audioEl.duration) ? audioEl.duration : Number.MAX_SAFE_INTEGER;
      audioEl.currentTime = Math.min(dur, (audioEl.currentTime || 0) + 10);
    });

    var progressWrap = document.createElement("div");
    progressWrap.className = "vc-msg-voice-progress-wrap";
    var progress = document.createElement("input");
    progress.type = "range";
    progress.className = "vc-msg-voice-progress";
    progress.min = "0";
    progress.max = "100";
    progress.step = "0.1";
    progress.value = "0";
    progress.setAttribute("aria-label", "Voice playback progress");

    progress.addEventListener("input", function () {
      if (!isFinite(audioEl.duration) || audioEl.duration <= 0) return;
      audioEl.currentTime = (parseFloat(progress.value) / 100) * audioEl.duration;
    });

    audioEl.addEventListener("loadedmetadata", function () {
      if (isFinite(audioEl.duration) && audioEl.duration > 0) {
        durationLabel.textContent = _voiceDurationLabel(audioEl.duration * 1000);
      }
    });
    audioEl.addEventListener("timeupdate", function () {
      if (!isFinite(audioEl.duration) || audioEl.duration <= 0) return;
      progress.value = String((audioEl.currentTime / audioEl.duration) * 100);
    });
    audioEl.addEventListener("play", _syncPlayPauseIcon);
    audioEl.addEventListener("pause", _syncPlayPauseIcon);
    audioEl.addEventListener("ended", function () {
      progress.value = "100";
      _syncPlayPauseIcon();
    });
    _syncPlayPauseIcon();

    controlsRow.appendChild(playPauseBtn);
    controlsRow.appendChild(backBtn);
    controlsRow.appendChild(fwdBtn);
    controlsRow.appendChild(durationLabel);
    progressWrap.appendChild(progress);
    voiceWrap.appendChild(audioEl);
    voiceWrap.appendChild(controlsRow);
    voiceWrap.appendChild(progressWrap);
    return voiceWrap;
  }

  function _renderVoiceRecordingState() {
    var durationEl = document.getElementById("vcRecordingDuration");
    var micBtn = document.getElementById("voiceRecordBtn");
    var retryBtn = document.getElementById("voiceRetryBtn");
    var cancelBtn = document.getElementById("voiceCancelBtn");
    var messageInput = document.getElementById("messageInput");
    var sendBtn = document.getElementById("sendBtn");
    if (durationEl) {
      if (_voiceRecordingActive) {
        var elapsed = Math.max(0, Date.now() - _voiceRecordStartTs);
        durationEl.textContent = _voiceDurationLabel(elapsed);
        durationEl.classList.remove("is-error");
        durationEl.style.display = "inline-flex";
      } else {
        durationEl.textContent = "";
        durationEl.classList.remove("is-error");
        durationEl.style.display = "none";
      }
      if (_voiceUploadInFlight) {
        durationEl.textContent = "Uploading…";
        durationEl.classList.remove("is-error");
        durationEl.style.display = "inline-flex";
      } else if (_voiceUploadError) {
        durationEl.textContent = _voiceUploadError;
        durationEl.classList.add("is-error");
        durationEl.style.display = "inline-flex";
      }
    }
    if (micBtn) {
      micBtn.classList.toggle("is-recording", !!_voiceRecordingActive);
      micBtn.setAttribute("aria-label", _voiceRecordingActive ? "Recording voice message" : "Hold to record voice message");
      micBtn.disabled = !!_voiceUploadInFlight;
    }
    if (retryBtn) {
      retryBtn.style.display = (!_voiceUploadInFlight && !!_voiceUploadError && !!_voicePendingDraft) ? "inline-flex" : "none";
    }
    if (cancelBtn) {
      cancelBtn.style.display = _voiceUploadInFlight ? "inline-flex" : "none";
      cancelBtn.disabled = !_voiceUploadInFlight;
    }
    if (messageInput) messageInput.disabled = !!_voiceUploadInFlight;
    if (sendBtn && _voiceUploadInFlight) sendBtn.disabled = true;
  }

  function _cleanupVoiceStream() {
    if (_voiceRecorderStream && typeof _voiceRecorderStream.getTracks === "function") {
      _voiceRecorderStream.getTracks().forEach(function (track) {
        if (track && typeof track.stop === "function") track.stop();
      });
    }
    _voiceRecorderStream = null;
  }

  async function _startVoiceRecording() {
    if (_voiceRecordingActive) return;
    if (!window.MediaRecorder || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (typeof window.showToast === "function") window.showToast("Voice recording is not supported on this browser.");
      return;
    }
    try {
      _voiceRecorderChunks = [];
      _voiceRecorderStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      var preferredVoiceMimeType = "";
      if (window.MediaRecorder && typeof window.MediaRecorder.isTypeSupported === "function") {
        if (window.MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
          preferredVoiceMimeType = "audio/webm;codecs=opus";
        } else if (window.MediaRecorder.isTypeSupported("audio/webm")) {
          preferredVoiceMimeType = "audio/webm";
        }
      }
      _voiceRecorder = preferredVoiceMimeType
        ? new MediaRecorder(_voiceRecorderStream, { mimeType: preferredVoiceMimeType })
        : new MediaRecorder(_voiceRecorderStream);
      _voiceRecorder.ondataavailable = function (event) {
        if (event && event.data && event.data.size > 0) _voiceRecorderChunks.push(event.data);
      };
      _voiceRecorder.start();
      _voiceRecordingActive = true;
      _voiceRecordStartTs = Date.now();
      if (_voiceRecordTimer) clearInterval(_voiceRecordTimer);
      _voiceRecordTimer = setInterval(_renderVoiceRecordingState, 250);
      _renderVoiceRecordingState();
    } catch (err) {
      console.error("[Vaani] Voice recording start failed:", err);
      _voiceRecordingActive = false;
      _voiceRecorder = null;
      _cleanupVoiceStream();
      _renderVoiceRecordingState();
      if (typeof window.showToast === "function") window.showToast("Microphone permission is required to send voice messages.");
    }
  }

  async function _uploadVoiceBlob(blob, mimeType, durationMs, chatId) {
    if (!blob || !blob.size) throw new Error("Audio blob is empty");
    if (!mimeType || String(mimeType).indexOf("audio/") !== 0) {
      throw new Error("Invalid audio mime type: " + String(mimeType || "unknown"));
    }
    if (blob.size > VOICE_UPLOAD_MAX_BYTES) {
      throw new Error("Voice message is too large. Please keep it under 10 MB.");
    }
    if (Math.max(0, Math.round(Number(durationMs || 0))) <= 0) {
      throw new Error("Voice message is empty.");
    }
    if (!chatId) throw new Error("Missing chat id for voice upload.");

    var objectPath = "voiceMessages/" + String(chatId) + "/" + Date.now() + ".webm";
    console.log("[Vaani][Voice] Upload start", { strategy: "firebase-storage-modular", path: objectPath, size: blob.size, mimeType: mimeType, durationMs: durationMs });

    var storage = getStorage(window.vaaniFirebase.app);
    var objectRef = storageRef(storage, objectPath);
    var metadata = { contentType: mimeType || "audio/webm", customMetadata: { durationMs: String(Math.max(0, Math.round(Number(durationMs || 0)))) } };
    var uploadCanceled = false;

    var timeout = setTimeout(function () {
      if (typeof _voiceUploadCancelFn === "function") _voiceUploadCancelFn();
    }, VOICE_UPLOAD_TIMEOUT_MS);

    _voiceUploadCancelFn = function () {
      uploadCanceled = true;
    };
    try {
      await uploadBytes(objectRef, blob, metadata);
      if (uploadCanceled) throw new Error("Voice upload canceled.");
      var audioUrl = await getDownloadURL(objectRef);
      if (uploadCanceled) throw new Error("Voice upload canceled.");
      if (!audioUrl) throw new Error("Could not get uploaded voice URL");
      console.log("[Vaani][Voice] Upload success", { strategy: "firebase-storage-modular", path: objectPath, audioUrl: audioUrl });
      return { success: true, audioUrl: audioUrl, storagePath: objectPath };
    } catch (err) {
      var message = err && err.message ? err.message : "Voice upload failed";
      var isNetworkFailure = /network|offline|unavailable|failed/i.test(message);
      if (isNetworkFailure) throw new Error("Network failure during upload. Please retry.");
      throw new Error(message);
    } finally {
      clearTimeout(timeout);
      _voiceUploadCancelFn = null;
    }
  }

  async function _sendVoiceMessage(blob, mimeType, durationMs) {
    var db = window.vaaniRouter && typeof window.vaaniRouter.getDb === "function" ? window.vaaniRouter.getDb() : null;
    var currentUser = window._vaaniCurrentUser || null, selectedUser = _selectedChatUser || null;
    if (!db || !currentUser || !currentUser.uid || !selectedUser || !selectedUser.uid) return;
    var currentUid = String(currentUser.uid), otherUid = String(selectedUser.uid);

    if (!_activeChatId) {
      _activeChatId = await _getOrCreateChat(otherUid);
      if (!_activeChatId) return;
      if (!_unsubscribeMessages) _listenToMessages(_activeChatId);
    }
    _voiceUploadInFlight = true;
    _voiceUploadError = "";
    _voicePendingDraft = { blob: blob, mimeType: mimeType, durationMs: durationMs };
    _renderVoiceRecordingState();
    var tempId = _makeOptimisticId();
    try {
      var uploadPayload = await _uploadVoiceBlob(blob, mimeType, durationMs, _activeChatId);
      var audioUrl = String(uploadPayload.audioUrl || "");
      if (!audioUrl) throw new Error("Upload succeeded but audio URL is missing");
      _upsertOptimisticMessage({
        _optimisticId: tempId,
        id: tempId,
        clientNonce: tempId,
        clientCreatedAt: Date.now(),
        type: "voice",
        text: "",
        audioUrl: audioUrl,
        audioData: audioUrl,
        audioMimeType: mimeType || "audio/webm",
        durationMs: Math.max(0, Math.round(Number(durationMs || 0))),
        senderId: currentUid,
        timestamp: new Date(),
        pending: true,
        failed: false
      });
      _renderMessages(true);
      var replySnapshot = _replyToMessage || null;
      var firestoreMessageId = await sendMessage(_activeChatId, "", currentUid, otherUid, replySnapshot, {
        clientNonce: tempId,
        type: "voice",
        audioUrl: audioUrl,
        audioData: audioUrl,
        audioMimeType: mimeType || "audio/webm",
        durationMs: durationMs,
        duration: Math.max(0, Math.round(Number(durationMs || 0) / 1000))
      });
      _markOptimisticMessageSent(tempId, firestoreMessageId);
      _renderMessages(true);
      _voicePendingDraft = null;
      _setReplyTo(null);
      _scrollMessagesToBottom(true);
    } catch (err) {
      console.error("[Vaani] _sendVoiceMessage failed:", err && err.message ? err.message : err);
      _markOptimisticMessageFailed(tempId);
      _renderMessages(true);
      _voiceUploadError = "Upload failed";
      if (typeof window.showToast === "function") window.showToast("Voice message failed to send — please try again");
      throw err;
    } finally {
      _voiceUploadInFlight = false;
      _renderVoiceRecordingState();
    }
  }

  async function _stopVoiceRecordingAndSend() {
    if (!_voiceRecordingActive || !_voiceRecorder) return;
    _voiceRecordingActive = false;
    if (_voiceRecordTimer) { clearInterval(_voiceRecordTimer); _voiceRecordTimer = null; }
    _renderVoiceRecordingState();
    var durationMs = Math.max(0, Date.now() - _voiceRecordStartTs);
    if (durationMs < 300) {
      try { _voiceRecorder.stop(); } catch (e) {}
      _voiceRecorder = null;
      _voiceRecorderChunks = [];
      _cleanupVoiceStream();
      return;
    }
    var recorder = _voiceRecorder;
    _voiceRecorder = null;
    await new Promise(function (resolve) {
      recorder.onstop = function () {
        try {
          var mimeType = recorder.mimeType || "audio/webm";
          var blob = new Blob(_voiceRecorderChunks, { type: mimeType });
          _voiceRecorderChunks = [];
          console.log("[Vaani] Voice blob ready:", { size: blob ? blob.size : 0, type: blob ? blob.type : "unknown" });
          if (!blob || !blob.size) {
            console.error("[Vaani] Voice blob is empty, skipping send.");
            resolve();
            return;
          }
          _sendVoiceMessage(blob, mimeType, durationMs)
            .catch(function (err) {
              console.error("[Vaani] Voice upload/send failed:", err && err.message ? err.message : err);
            })
            .finally(function () { resolve(); });
        } catch (err) {
          console.error("[Vaani] Voice message encoding failed:", err);
          resolve();
        } finally {
          _cleanupVoiceStream();
        }
      };
      try { recorder.stop(); } catch (err) { resolve(); _cleanupVoiceStream(); }
    });
  }
  async function _sendMessage() {
  var db = window.vaaniRouter && typeof window.vaaniRouter.getDb === "function" ? window.vaaniRouter.getDb() : null;
  var currentUser = window._vaaniCurrentUser || null, selectedUser = _selectedChatUser || null;
  var inputEl = document.getElementById("messageInput"), sendBtn = document.getElementById("sendBtn");

  if (!db || !currentUser || !currentUser.uid || !selectedUser || !selectedUser.uid || !inputEl) return;
  if (sendBtn && sendBtn.disabled) return;

  var inputMessage = (inputEl.value || "").trim();
  if (!inputMessage) return;

  var currentUid = String(currentUser.uid), otherUid = String(selectedUser.uid);

  // ── PAINT OPTIMISTIC MESSAGE IMMEDIATELY (before any async) ──────────
  var replySnapshot = _replyToMessage || null;
  var tempId = _makeOptimisticId();
  var optimisticMessage = {
    _optimisticId: tempId,
    id: tempId,
    clientNonce: tempId,
    clientCreatedAt: Date.now(),
    text: inputMessage,
    senderId: currentUid,
    timestamp: new Date(),          // local clock — sorts correctly
    pending: true,
    failed: false,
    replyTo: replySnapshot && replySnapshot.id ? {
      id: String(replySnapshot.id),
      text: _messagePreviewText(replySnapshot).slice(0, 200),
      senderId: String(replySnapshot.senderId || "")
    } : null
  };
  _upsertOptimisticMessage(optimisticMessage);

  // Clear input and reply banner NOW, before async work
  inputEl.value = "";
  _setInputMessage("");
  _setReplyTo(null);
  if (sendBtn) sendBtn.disabled = true;

  // Render immediately — this is the frame the user sees
  _renderMessages(true);
  _emitTypingHeartbeat(false);

  // ── ASYNC: ensure chat exists ─────────────────────────────────────────
  if (!_activeChatId) {
    try {
      _activeChatId = await _getOrCreateChat(otherUid);
    } catch (err) {
      console.error("[Vaani] _sendMessage: _getOrCreateChat threw:", err);
      _markOptimisticMessageFailed(tempId);
      _renderMessages(true);
      return;
    }
    if (!_activeChatId) {
      _markOptimisticMessageFailed(tempId);
      _renderMessages(true);
      return;
    }
    if (!_unsubscribeMessages) _listenToMessages(_activeChatId);
  }

  // ── ASYNC: write to Firestore ─────────────────────────────────────────
  sendMessage(_activeChatId, inputMessage, currentUid, otherUid, replySnapshot, { clientNonce: tempId })
    .then(function (firestoreId) {
      _markOptimisticMessageSent(tempId, firestoreId);
      var resolvedId = String(firestoreId || tempId);
      if (_translationConfig.translateEnabled === true) {
        _translationLoadingById.set(resolvedId, { translate: true, transliterate: false });
        processMessage({ id: resolvedId, text: inputMessage }, _translationConfig, { debounceMs: 0, mode: "translate", force: true })
          .then(function (result) {
            var existing = _translationResultsById.get(resolvedId) || {};
            if (!result) {
              _translationResultsById.set(resolvedId, Object.assign({}, existing, { unavailable: false }));
              return;
            }
            _translationResultsById.set(resolvedId, {
              translated: result.translated || "",
              transliterated: existing.transliterated || "",
              detectedLang: result.detectedLang || existing.detectedLang || "",
              unavailable: false
            });
            _renderMessages(false);
          })
          .finally(function () {
            _translationLoadingById.set(resolvedId, { translate: false, transliterate: false });
          });
      }
      // No re-render needed — onSnapshot will arrive and clean up
    })
    .catch(function (err) {
      _markOptimisticMessageFailed(tempId);
      _renderMessages(true);
      console.error("[Vaani] _sendMessage: write failed:", err);
      if (typeof window.showToast === "function") window.showToast("Message failed — tap Retry.");
    })
    .finally(function () {
      if (sendBtn) {
        sendBtn.disabled = _voiceUploadInFlight || !(inputEl.value || "").trim();
      }
    });
}

  function _retryMessageSend(messageId) {
    var idx = _findOptimisticIndexById(messageId);
    if (idx < 0) return;
    var msg = _optimisticMessages[idx];
    if (!msg || !msg.failed || !msg.senderId) return;
    var currentUid = window._vaaniCurrentUser && window._vaaniCurrentUser.uid ? String(window._vaaniCurrentUser.uid) : "";
    var selectedUser = _selectedChatUser || null;
    var otherUid = selectedUser && selectedUser.uid ? String(selectedUser.uid) : "";
    if (!currentUid || !otherUid || !_activeChatId) return;

    _optimisticMessages[idx] = Object.assign({}, msg, { pending: true, failed: false, timestamp: new Date() });
    _renderMessages(true);

    var retryExtraData = null;
    if (msg.type === "voice" && (msg.audioUrl || msg.audioData)) {
      retryExtraData = {
        type: "voice",
        audioUrl: String(msg.audioUrl || ""),
        audioData: String(msg.audioData || msg.audioUrl || ""),
        audioMimeType: String(msg.audioMimeType || "audio/webm"),
        durationMs: Math.max(0, Math.round(Number(msg.durationMs || 0)))
      };
    }

    if (!retryExtraData) retryExtraData = {};
    retryExtraData.clientNonce = String(msg.clientNonce || msg._optimisticId || msg.id || "");

    sendMessage(_activeChatId, String(msg.text || ""), currentUid, otherUid, msg.replyTo || null, retryExtraData)
      .then(function (firestoreMessageId) {
        _markOptimisticMessageSent(msg._optimisticId || msg.id, firestoreMessageId);
        _renderMessages(true);
      })
      .catch(function () {
        _markOptimisticMessageFailed(msg._optimisticId || msg.id);
        _renderMessages(true);
      });
  }

  function _appendTranslationLayer(bubble, msg) {
    var msgId = String(msg && msg.id || "");
    if (!msgId || !bubble) return;
    var targetLanguage = String(_translationConfig.targetLanguage || "English");
    var cachedTranslate = getCached(msgId, targetLanguage, "translate");
    var cachedTransliterate = getCached(msgId, targetLanguage, "transliterate");
    var translationResult = _translationResultsById.get(msgId) || {};
    var translatedText = translationResult.translated || (cachedTranslate && cachedTranslate.result) || "";
    var transliteratedText = translationResult.transliterated || (cachedTransliterate && cachedTransliterate.result) || "";
    var unavailable = !!translationResult.unavailable;

    var layer = bubble.querySelector(".vaani-tl-layer");
    if (!layer) {
      layer = document.createElement("div");
      layer.className = "vaani-tl-layer";
      bubble.appendChild(layer);
    }
    var loadingState = _translationLoadingById.get(msgId);
    var isHidden = _translationConfig.featureEnabled === false || _translationConfig.translateEnabled === false;
    layer.classList.toggle("vaani-tl-hidden", isHidden);

    var html = "";
    if (loadingState && (loadingState.translate || loadingState.transliterate)) {
      html += '<p class="vaani-tl-text">...</p>';
    }
    if (transliteratedText) html += '<p class="vaani-tl-romanized">' + _esc(transliteratedText) + "</p>";
    if (translatedText) html += '<p class="vaani-tl-text">' + _esc(translatedText) + "</p>";
    if (!translatedText && !transliteratedText && !loadingState) html += '<p class="vaani-tl-text">' + _esc(_messagePreviewText(msg)) + "</p>";
    layer.innerHTML = html;

  }

  function _buildTranslationContextMessages(messages, currentMsg) {
    var currentTs = currentMsg && currentMsg.timestamp && typeof currentMsg.timestamp.toMillis === "function"
      ? currentMsg.timestamp.toMillis()
      : Number(currentMsg && currentMsg._sortTs || 0);
    return (messages || []).filter(function (m) {
      var candidateTs = m && m.timestamp && typeof m.timestamp.toMillis === "function"
        ? m.timestamp.toMillis()
        : Number(m && m._sortTs || 0);
      return String(m && m.senderId || "") === String(currentMsg && currentMsg.senderId || "") && candidateTs <= currentTs;
    }).slice(-3, -1).map(function (m) { return _messagePreviewText(m); });
  }

  async function _translateAllRenderedMessages(options) {
    if (_translationConfig.translateEnabled !== true || _translationConfig.featureEnabled === false) return;
    var mergedMessages = _mergeMessagesForRender().filter(function (msg) {
      return msg && msg.id && String(_messagePreviewText(msg) || "").trim();
    });
    if (!mergedMessages.length) return;
    var opts = options || {};
    var targetLanguage = String(_translationConfig.targetLanguage || "English");
    var token = ++_translationBatchToken;
    var batchConfig = Object.assign({}, _translationConfig, { translateEnabled: true, transliterateEnabled: false });
    var maxConcurrent = 6;
    var cursor = 0;

    async function worker() {
      while (cursor < mergedMessages.length) {
        var index = cursor++;
        var msg = mergedMessages[index];
        var msgId = String(msg.id || "");
        var msgText = _messagePreviewText(msg);
        if (!msgId || !String(msgText || "").trim()) continue;
        if (_translationBatchToken !== token || _translationConfig.translateEnabled !== true) return;

        var cached = getCached(msgId, targetLanguage, "translate");
        if (cached) {
          var priorCached = _translationResultsById.get(msgId) || {};
          _translationResultsById.set(msgId, {
            translated: cached.result || "",
            transliterated: priorCached.transliterated || "",
            detectedLang: cached.detectedLang || priorCached.detectedLang || "",
            unavailable: false
          });
          var cachedBubble = document.querySelector('#messagesContainer .vc-msg-bubble[data-message-id="' + msgId + '"]');
          if (cachedBubble) _appendTranslationLayer(cachedBubble, msg);
          continue;
        }

        _translationLoadingById.set(msgId, { translate: true, transliterate: false });
        var loadingBubble = document.querySelector('#messagesContainer .vc-msg-bubble[data-message-id="' + msgId + '"]');
        if (loadingBubble) _appendTranslationLayer(loadingBubble, msg);

        try {
          var result = await processMessage(
            { id: msgId, text: msgText },
            batchConfig,
            {
              mode: "translate",
              force: !!opts.force,
              debounceMs: typeof opts.debounceMs === "number" ? opts.debounceMs : 0,
              contextMessages: _buildTranslationContextMessages(mergedMessages, msg)
            }
          );
          if (_translationBatchToken !== token || _translationConfig.translateEnabled !== true) return;
          var prior = _translationResultsById.get(msgId) || {};
          if (result) {
            _translationResultsById.set(msgId, {
              translated: result.translated || prior.translated || "",
              transliterated: prior.transliterated || "",
              detectedLang: result.detectedLang || prior.detectedLang || "",
              unavailable: false
            });
          }
        } finally {
          _translationLoadingById.set(msgId, { translate: false, transliterate: false });
          var bubble = document.querySelector('#messagesContainer .vc-msg-bubble[data-message-id="' + msgId + '"]');
          if (bubble) _appendTranslationLayer(bubble, msg);
        }
      }
    }

    var workers = [];
    var count = Math.min(maxConcurrent, mergedMessages.length);
    for (var i = 0; i < count; i++) workers.push(worker());
    await Promise.all(workers);
  }

  function _processAndAppendMessageTranslation(msg, bubble, contextMessages) {
    if (!msg || !msg.id || _translationConfig.translateEnabled !== true) return;
    var msgId = String(msg.id);
    var targetLanguage = String(_translationConfig.targetLanguage || "English");
    var cached = getCached(msgId, targetLanguage, "translate");
    if (cached) {
      _translationResultsById.set(msgId, {
        translated: cached.result || "",
        transliterated: (_translationResultsById.get(msgId) || {}).transliterated || "",
        detectedLang: cached.detectedLang || "",
        unavailable: false
      });
      var cachedBubble = bubble && bubble.isConnected ? bubble : document.querySelector('#messagesContainer .vc-msg-bubble[data-message-id="' + msgId + '"]');
      if (cachedBubble) _appendTranslationLayer(cachedBubble, msg);
      return;
    }

    _translationLoadingById.set(msgId, { translate: true, transliterate: false });
    _appendTranslationLayer(bubble, msg);

    processMessage({ id: msgId, text: _messagePreviewText(msg) }, _translationConfig, { debounceMs: 300, mode: "translate", contextMessages: contextMessages || [] })
      .then(function (result) {
        if (!result) return;
        var prior = _translationResultsById.get(msgId) || {};
        _translationResultsById.set(msgId, {
          translated: result.translated || prior.translated || "",
          transliterated: prior.transliterated || "",
          detectedLang: result.detectedLang || prior.detectedLang || "",
          unavailable: false
        });
        var activeBubble = bubble && bubble.isConnected
          ? bubble
          : document.querySelector('#messagesContainer .vc-msg-bubble[data-message-id="' + msgId + '"]');
        if (activeBubble) _appendTranslationLayer(activeBubble, msg);
      })
      .finally(function () {
        _translationLoadingById.set(msgId, { translate: false, transliterate: false });
        var activeBubble = bubble && bubble.isConnected
          ? bubble
          : document.querySelector('#messagesContainer .vc-msg-bubble[data-message-id="' + msgId + '"]');
        if (activeBubble) _appendTranslationLayer(activeBubble, msg);
      });
  }

  function _dismissTranslationContextMenu() {
    while (_translationContextDismissors.length) {
      var remove = _translationContextDismissors.pop();
      try { remove(); } catch (e) {}
    }
    if (_translationContextMenuEl && _translationContextMenuEl.parentNode) {
      _translationContextMenuEl.parentNode.removeChild(_translationContextMenuEl);
    }
    _translationContextMenuEl = null;
  }

  function _showTranslationContextMenu(event, bubble, msg) {
    _dismissTranslationContextMenu();
    var menu = document.createElement("div");
    menu.className = "vaani-tl-context-menu";
    menu.innerHTML =
      '<button type="button" data-action="translate">Translate</button>' +
      '<button type="button" data-action="transliterate">Transliterate</button>' +
      '<button type="button" data-action="copy">Copy</button>' +
      '<button type="button" data-action="reply">Reply</button>';
    bubble.appendChild(menu);
    _translationContextMenuEl = menu;
    if (event && typeof event.preventDefault === "function") event.preventDefault();
    if (event && typeof event.stopPropagation === "function") event.stopPropagation();

    menu.querySelector('[data-action="translate"]').addEventListener("click", function () {
      _dismissTranslationContextMenu();
      var msgId = String(msg.id);
      var targetLanguage = String(_translationConfig.targetLanguage || "English");
      var cached = getCached(msgId, targetLanguage, "translate");
      if (cached) {
        var existing = _translationResultsById.get(msgId) || {};
        _translationResultsById.set(msgId, {
          translated: cached.result || "",
          transliterated: existing.transliterated || "",
          detectedLang: cached.detectedLang || existing.detectedLang || "",
          unavailable: false
        });
        _appendTranslationLayer(bubble, msg);
        return;
      }
      _translationLoadingById.set(msgId, { translate: true, transliterate: false });
      _appendTranslationLayer(bubble, msg);
      processMessage({ id: msgId, text: _messagePreviewText(msg) }, Object.assign({}, _translationConfig, { translateEnabled: true, transliterateEnabled: false }), { debounceMs: 0, mode: "translate", force: true })
        .then(function (result) {
          var existing = _translationResultsById.get(msgId) || {};
          if (!result) {
            _translationResultsById.set(msgId, Object.assign({}, existing, { unavailable: false }));
            return;
          }
          _translationResultsById.set(msgId, {
            translated: result.translated || "",
            transliterated: existing.transliterated || "",
            detectedLang: result.detectedLang || existing.detectedLang || "",
            unavailable: false
          });
        })
        .finally(function () {
          _translationLoadingById.set(msgId, { translate: false, transliterate: false });
          _appendTranslationLayer(bubble, msg);
        });
    });
    menu.querySelector('[data-action="transliterate"]').addEventListener("click", function () {
      _dismissTranslationContextMenu();
      var msgId = String(msg.id);
      var targetLanguage = String(_translationConfig.targetLanguage || "English");
      var cached = getCached(msgId, targetLanguage, "transliterate");
      if (cached) {
        var prior = _translationResultsById.get(msgId) || {};
        _translationResultsById.set(msgId, {
          translated: prior.translated || "",
          transliterated: cached.result || "",
          detectedLang: prior.detectedLang || cached.detectedLang || "",
          unavailable: !!prior.unavailable
        });
        _appendTranslationLayer(bubble, msg);
        return;
      }
      _translationLoadingById.set(msgId, { translate: false, transliterate: true });
      _appendTranslationLayer(bubble, msg);
      processMessage({ id: msgId, text: _messagePreviewText(msg) }, Object.assign({}, _translationConfig, { translateEnabled: false, transliterateEnabled: true }), { debounceMs: 0, mode: "transliterate", force: true })
        .then(function (result) {
          if (!result) return;
          var prior = _translationResultsById.get(msgId) || {};
          var translitResult = result.transliterated || _messagePreviewText(msg);
          setCached(msgId, targetLanguage, "transliterate", {
            result: translitResult,
            detectedLang: result.detectedLang || prior.detectedLang || "",
            unavailable: false,
            mode: "transliterate"
          });
          _translationResultsById.set(msgId, {
            translated: prior.translated || "",
            transliterated: translitResult,
            detectedLang: prior.detectedLang || result.detectedLang || "",
            unavailable: !!prior.unavailable
          });
        })
        .finally(function () {
          _translationLoadingById.set(msgId, { translate: false, transliterate: false });
          _appendTranslationLayer(bubble, msg);
        });
    });
    menu.querySelector('[data-action="copy"]').addEventListener("click", function () {
      _dismissTranslationContextMenu();
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        navigator.clipboard.writeText(_messagePreviewText(msg)).catch(function () {});
      }
    });
    menu.querySelector('[data-action="reply"]').addEventListener("click", function () {
      _dismissTranslationContextMenu();
      _setReplyTo(msg);
    });

    function outsideHandler(e) { if (!menu.contains(e.target)) _dismissTranslationContextMenu(); }
    function scrollHandler() { _dismissTranslationContextMenu(); }
    document.addEventListener("mousedown", outsideHandler, true);
    if (_messagesContainerRef) _messagesContainerRef.addEventListener("scroll", scrollHandler, { passive: true, once: true });
    _translationContextDismissors.push(function () { document.removeEventListener("mousedown", outsideHandler, true); });
    _translationContextDismissors.push(function () { if (_messagesContainerRef) _messagesContainerRef.removeEventListener("scroll", scrollHandler); });
  }

  function _attachTranslationContextMenuHandlers(bubble, msg) {
    var holdFrame = null;
    var holdStart = 0;
    function clearHold() {
      if (holdFrame) cancelAnimationFrame(holdFrame);
      holdFrame = null;
      holdStart = 0;
    }
    function holdTick(ts) {
      if (!holdStart) holdStart = ts;
      if ((ts - holdStart) >= 500) {
        clearHold();
        _showTranslationContextMenu(null, bubble, msg);
        return;
      }
      holdFrame = requestAnimationFrame(holdTick);
    }

    bubble.addEventListener("pointerdown", function (event) {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      _dismissTranslationContextMenu();
      clearHold();
      holdFrame = requestAnimationFrame(holdTick);
    });
    bubble.addEventListener("pointerup", clearHold);
    bubble.addEventListener("pointercancel", clearHold);
    bubble.addEventListener("pointerleave", clearHold);
    bubble.addEventListener("contextmenu", function (event) {
      _showTranslationContextMenu(event, bubble, msg);
    });
  }

  function _renderMessages(forceBottom) {
    var container = _messagesContainerRef; if (!container) return;
    var _hasVoiceMessages = _mergeMessagesForRender().some(function(m) { return m.type === "voice"; });
if (_hasVoiceMessages) _destroyActiveVoicePlayback();
    var currentUid = window._vaaniCurrentUser && window._vaaniCurrentUser.uid ? String(window._vaaniCurrentUser.uid) : "";
    var stickToBottom = !!forceBottom || _isUserNearBottom(container);
    var distanceFromBottom = container.scrollHeight - container.scrollTop;
    _shouldStickToBottom = stickToBottom;
    container.innerHTML = "";
    var messages = _mergeMessagesForRender();
    if (!messages.length) {
      var emptyState = document.createElement("div");
      emptyState.className = "vc-chat-empty"; emptyState.textContent = "Start a conversation";
      container.appendChild(emptyState); _scrollMessagesToBottom(true); return;
    }
    messages.forEach(function (msg) {
      var senderId = msg && msg.senderId != null ? String(msg.senderId) : "";
      var isOwn = senderId === currentUid;
      var row = document.createElement("div"); row.className = isOwn ? "vc-msg-row vc-msg-own" : "vc-msg-row vc-msg-other";
      var bubble = document.createElement("div"); bubble.className = "vc-msg-bubble";
      bubble.setAttribute("data-message-id", String(msg.id || ""));

      // ── Reply preview ──────────────────────────────────────────
      if (msg.replyTo && msg.replyTo.text) {
        var replyPreview = document.createElement("div");
        replyPreview.className = "vc-msg-reply-preview";
        var replyIsOwn = msg.replyTo.senderId === currentUid;
        var replyLabel = replyIsOwn ? "You" : (_selectedChatUser && _selectedChatUser.username ? "@" + _selectedChatUser.username : "Them");
        replyPreview.innerHTML =
          '<div class="vc-msg-reply-author">' + _esc(replyLabel) + '</div>' +
          '<div class="vc-msg-reply-text">' + _esc(String(msg.replyTo.text).slice(0, 80) + (msg.replyTo.text.length > 80 ? "\u2026" : "")) + '</div>';
        bubble.appendChild(replyPreview);
      }

      if (msg.type === "voice" && msg.audioData) {
        bubble.appendChild(_createVoiceMessageBubble(msg));
      } else {
        var msgText = document.createElement("div");
        msgText.className = "vc-msg-text";
        msgText.textContent = _messagePreviewText(msg);
        bubble.appendChild(msgText);

        var translatedText = String(msg.translatedText || "").trim();
        if (_translationConfig.translateEnabled === true && translatedText) {
          var translatedEl = document.createElement("div");
          translatedEl.className = "vc-msg-text translated";
          translatedEl.textContent = translatedText;
          bubble.appendChild(translatedEl);
        }
      }

      if (msg.pending || msg.failed) {
        var stateRow = document.createElement("div");
        stateRow.className = "vc-msg-state" + (msg.failed ? " is-failed" : "");
        if (msg.pending) {
          stateRow.textContent = "Sending...";
        } else if (msg.failed) {
          stateRow.textContent = "Failed";
          var canRetry = !!String(msg.text || "").trim() || (msg.type === "voice" && !!(msg.audioUrl || msg.audioData));
          if (canRetry) {
            var retryBtn = document.createElement("button");
            retryBtn.type = "button";
            retryBtn.className = "vc-msg-retry";
            retryBtn.textContent = "Retry";
            retryBtn.addEventListener("click", function (retryId) {
              return function () { _retryMessageSend(retryId); };
            }(msg.id || msg._optimisticId));
            stateRow.appendChild(retryBtn);
          }
        }
        bubble.appendChild(stateRow);
      }

      // ── Swipe-to-reply (touch + mouse) ──────────────────────────
      var swipeStartX = 0, swipeStartY = 0, swipeDx = 0;
      var swipeActive = false, swipeThreshold = 80, swipeMaxY = 40;
      var swipeTriggered = false;

      function _onSwipeStart(clientX, clientY) {
        swipeStartX = clientX; swipeStartY = clientY;
        swipeDx = 0; swipeActive = true; swipeTriggered = false;
        bubble.style.transition = "none";
      }

      function _onSwipeMove(clientX, clientY) {
        if (!swipeActive) return;
        var dx = clientX - swipeStartX;
        var dy = Math.abs(clientY - swipeStartY);
        if (dy > swipeMaxY) { _onSwipeEnd(); return; }   // mostly vertical — cancel
        if (dx < 0) { _onSwipeEnd(); return; }           // left swipe — ignore
        swipeDx = Math.min(dx, swipeThreshold);
        bubble.style.transform = "translateX(" + swipeDx + "px)";
        if (swipeDx >= swipeThreshold && !swipeTriggered) {
          swipeTriggered = true;
          _setReplyTo(msg);
          if (window.navigator && typeof window.navigator.vibrate === "function") {
            window.navigator.vibrate(30);
          }
        }
      }

      function _onSwipeEnd() {
        if (!swipeActive) return;
        swipeActive = false;
        bubble.style.transition = "transform 0.22s cubic-bezier(0.25,0.46,0.45,0.94)";
        bubble.style.transform = "translateX(0)";
      }

      // Touch
      bubble.addEventListener("touchstart", function (e) {
        var t = e.touches[0];
        _onSwipeStart(t.clientX, t.clientY);
      }, { passive: true });

      bubble.addEventListener("touchmove", function (e) {
        var t = e.touches[0];
        _onSwipeMove(t.clientX, t.clientY);
      }, { passive: true });

      bubble.addEventListener("touchend",   _onSwipeEnd, { passive: true });
      bubble.addEventListener("touchcancel", _onSwipeEnd, { passive: true });

      // Mouse (desktop)
      bubble.addEventListener("mousedown", function (e) {
        if (e.button !== 0) return;
        _onSwipeStart(e.clientX, e.clientY);
        function onMouseMove(e) { _onSwipeMove(e.clientX, e.clientY); }
        function onMouseUp()   { _onSwipeEnd(); document.removeEventListener("mousemove", onMouseMove); document.removeEventListener("mouseup", onMouseUp); }
        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup",   onMouseUp);
      });
      _attachTranslationContextMenuHandlers(bubble, msg);

      row.appendChild(bubble); container.appendChild(row);
      var contextMessages = _buildTranslationContextMessages(messages, msg);
      void contextMessages;
    });
    if (stickToBottom) {
    _messagesContainerRef.scrollTop = _messagesContainerRef.scrollHeight;
  } else {
    window.requestAnimationFrame(function () {
      if (_messagesContainerRef) {
        _messagesContainerRef.scrollTop = Math.max(0, _messagesContainerRef.scrollHeight - distanceFromBottom);
      }
    });
  }
}

  // ── FIX 4 + 5: listenToMessages — firstFire + chatId guard ──────────────
  function listenToMessages(chatId) {
    var db = window.vaaniRouter && typeof window.vaaniRouter.getDb === "function" ? window.vaaniRouter.getDb() : null;
    if (!db) { console.error("[Vaani] listenToMessages: db unavailable."); _setMessages([]); _renderMessages(); return; }
    if (!chatId) { console.error("[Vaani] listenToMessages: chatId is null."); _setMessages([]); _renderMessages(); return; }
    chatId = String(chatId);

    var listenerKey = "chat::" + chatId;
    if (_activeMessageListenerKey === listenerKey && _unsubscribeMessages) {
      console.log("[Vaani] listenToMessages: already active for", chatId); return;
    }
    if (_unsubscribeMessages) { console.log("[Vaani] listenToMessages: tearing down previous."); _teardownMessageListener(); }
    _activeMessageListenerKey = listenerKey;

    var firstFire = true; // always render on first snapshot to clear loading state
    console.log("[Vaani] listenToMessages: attaching to chats/" + chatId + "/messages");

    _unsubscribeMessages = db.collection(CHATS_COLLECTION).doc(chatId).collection(MESSAGES_COLLECTION)
      .orderBy("timestamp", "asc")
      .onSnapshot(async function (snapshot) {
        if (_activeMessageListenerKey !== listenerKey) {
          console.warn("[Vaani] listenToMessages: stale snapshot discarded for", chatId); return;
        }
        var messages = snapshot.docs.map(function (doc) { return Object.assign({ id: doc.id }, doc.data() || {}); });
        messages = _sortMessagesStable(messages);
        var sigParts = [];
        messages.forEach(function (d) {
          sigParts.push(String(d.id || ""), String(d.text || ""), String(d.senderId || ""),
            String(_messageTimestampMillis(d)), String(d.clientNonce || ""));
        });
        var nextSig = sigParts.join("|");
        var hasPendingOptimistic = _optimisticMessages.some(function(m) { return m && (m.pending || m.failed); });
if (!firstFire && nextSig === _activeMessagesSignature && !hasPendingOptimistic) {
  return;
}
        firstFire = false; _activeMessagesSignature = nextSig;
        _cleanupOptimisticMessages(messages);
        var hydratedMessages = await Promise.all(messages.map(function (msg) { return onNewMessage(msg); }));
        _setServerMessages(hydratedMessages); _renderMessages();
        console.log("[Vaani] listenToMessages: rendered", hydratedMessages.length, "msg(s) for chatId:", chatId);
      }, function (err) {
        console.error("[Vaani] listenToMessages: error for chatId:", chatId, err);
        if (_activeMessageListenerKey === listenerKey) {
          _activeMessagesSignature = ""; _optimisticMessages = []; _setMessages([]); _renderMessages();
        }
      });
  }

  function _listenToMessages(chatId) { return listenToMessages(chatId); }

  async function _getOrCreateChat(otherUid) {
    var db = window.vaaniRouter && typeof window.vaaniRouter.getDb === "function" ? window.vaaniRouter.getDb() : null;
    var currentUid = window._vaaniCurrentUser && window._vaaniCurrentUser.uid ? String(window._vaaniCurrentUser.uid) : null;
    if (!db || !currentUid || !otherUid) { console.error("[Vaani] _getOrCreateChat: missing params."); return null; }
    otherUid = String(otherUid);
    var sortedPair = [currentUid, otherUid].sort();
    var chatId = sortedPair[0] + "_" + sortedPair[1];
    var chatRef = db.collection(CHATS_COLLECTION).doc(chatId);
    try {
      var snap = await chatRef.get();
      if (snap.exists) { console.log("[Vaani] _getOrCreateChat: existing chatId =", chatId); return chatId; }
      await chatRef.set({ participants: sortedPair, lastMessage: "", createdAt: firebase.firestore.FieldValue.serverTimestamp(), updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
      console.log("[Vaani] _getOrCreateChat: created chatId =", chatId); return chatId;
    } catch (err) { console.error("[Vaani] _getOrCreateChat failed:", err); return null; }
  }

  // ── FIX 5: _openChatUI — set state directly, don't call _setSelectedChatUser ──
  // _setSelectedChatUser(non-null) calls _syncViewWithSelection which shows the
  // chat panel BEFORE _renderChatUI has built the DOM. Instead we set state
  // directly and let _renderChatUI manage visibility.
  function _openChatUI(chatId, user) {
  if (!chatId) {
    console.error("[Vaani] _openChatUI: chatId missing");
    return;
  }

  if (_activeChatId && _activeChatId !== chatId) {
    console.log("[Vaani] _openChatUI: switching from", _activeChatId, "to", chatId);
    _emitTypingHeartbeat(false);
    _teardownMessageListener();
  }

  _setSelectedChatUser(user);   // ✅ FIX
  _activeChatId = chatId;

  console.log("[Vaani] _openChatUI: chatId =", chatId);

  _renderChatUI(user || {});
  _listenToMessages(chatId);
}

  function _renderChatUI(otherProfile) {
    var chatScreen = document.getElementById("vcChatScreen");
    if (!chatScreen) { console.error("[Vaani] _renderChatUI: vcChatScreen not found"); return; }
    otherProfile = otherProfile || {};
    var username = otherProfile.username || "user", photo = otherProfile.photoURL || "";
    var initial  = (username.charAt(0) || "U").toUpperCase();
    var avatarHTML = photo ? '<img class="avatar" src="' + _esc(photo) + '" alt="' + _esc(username) + ' avatar">'
                           : '<span class="vc-chat-initial avatar-placeholder">' + _esc(initial) + "</span>";
    var sendIconSVG = '<svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';
    var backIconSVG = '<svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>';
    var menuIconSVG = '<svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>';

    chatScreen.innerHTML =
      '<div class="vc-chat-view chat-wrapper">' +
        '<div class="chat-container">' +
          '<div class="vc-chat-header chat-header">' +
            '<button class="vc-back-btn" id="backBtn">' + backIconSVG + "</button>" +
            '<div class="vc-chat-avatar">' + avatarHTML + "</div>" +
            '<div class="vc-chat-hinfo"><div class="vc-chat-hname">@' + _esc(username) + "</div>" +
            '<div class="vc-chat-hsub" id="vcChatHeaderStatus"></div></div>' +
            '<div class="vc-chat-hactions">' +
              '<button class="vc-header-action-btn vaani-tl-toggle-btn" id="vaaniTlToggleBtn" title="Translation & Transliteration Settings" aria-label="Open translation settings">🌐</button>' +
              '<button class="vc-header-action-btn" id="chatMenuBtn" aria-label="More options">' + menuIconSVG + "</button>" +
              '<div class="vaani-tl-panel-host" id="vaaniTranslationPanelHost"></div>' +
            "</div></div>" +
          '<div class="vc-chat-messages chat-messages" id="messagesContainer"></div>' +
          '<div id="vaaniTranslationNotice" class="vaani-tl-global-notice" aria-live="polite" aria-atomic="true"></div>' +
          '<div class="vc-chat-input-bar chat-input">' +
            '<div id="vcReplyBanner" class="vc-reply-banner" style="display:none;"></div>' +
            '<div class="vc-chat-input-row">' +
              '<input id="messageInput" class="vc-chat-input" type="text" placeholder="Type a message..." autocomplete="off" spellcheck="false">' +
              '<span id="vcRecordingDuration" class="vc-recording-duration" aria-live="polite"></span>' +
              '<button id="voiceRetryBtn" class="vc-chat-voice-retry" type="button" style="display:none;">Retry</button>' +
              '<button id="voiceCancelBtn" class="vc-chat-voice-cancel" type="button" style="display:none;">Cancel</button>' +
              '<button id="voiceRecordBtn" class="vc-chat-voice-btn" aria-label="Hold to record voice message">' +
                '<svg viewBox="0 0 24 24"><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/></svg>' +
              '</button>' +
              '<button id="sendBtn" class="vc-chat-send" disabled aria-label="Send message">' + sendIconSVG + "</button>" +
            '</div>' +
          "</div>" +
        "</div>" +
      "</div>";

    _messagesContainerRef = document.getElementById("messagesContainer");
    _setupViewportSync();
    _setMessages([]); _setInputMessage(""); _shouldStickToBottom = true; _renderMessages(true);

    // Show chat panel only after DOM is ready
    _setActivePanel("chat");
    if (window.vaaniChat) window.vaaniChat._currentView = "chat";
    _scrollMessagesToBottom(true);

    var backBtn = document.getElementById("backBtn");
    if (backBtn) backBtn.onclick = function () {
      // Drive the transition through history.back() so the browser
      // stack stays consistent and popstate fires with chatView="home",
      // which will call handleHistoryState → show the chat list.
      if (window.history.length > 1 &&
          history.state && history.state.chatView === "chat") {
        history.back();
      } else {
        // No matching history entry — fall back to direct state mutation.
        _setSelectedChatUser(null);
      }
    };
    var menuBtn = document.getElementById("chatMenuBtn");
    var tlToggleBtn = document.getElementById("vaaniTlToggleBtn");
    var tlPanelHost = document.getElementById("vaaniTranslationPanelHost");
    if (menuBtn) menuBtn.onclick = function () {
      console.log("[Vaani] Menu action tapped for:", username);
    };
    if (tlToggleBtn) {
      tlToggleBtn.onclick = function () { openTranslationPanel(); };
    }
    if (tlPanelHost) {
      if (_translationPanelController) _translationPanelController.destroy();
      _translationPanelController = createVaaniTranslationPanel({
        getConfig: function () { return _translationConfig; },
        onConfigChange: function (patch) {
          _setTranslationConfig(patch || {});
          if (_translationConfig.featureEnabled === false) {
            Array.from(translationCache.keys()).forEach(function (id) { cancelMessageProcessing(id); });
          }
        },
        onClose: function () { _setTranslationConfig({ panelOpen: false }); }
      });
      _translationPanelController.mount(tlPanelHost);
    }

var chatAvatar = chatScreen.querySelector('.vc-chat-avatar');
if (chatAvatar && _selectedChatUser) {
  chatAvatar.style.cursor = 'pointer';
  chatAvatar.addEventListener('click', function() {
    var db = window.vaaniRouter && typeof window.vaaniRouter.getDb === 'function'
      ? window.vaaniRouter.getDb() : null;
    if (!db || !_selectedChatUser || !_selectedChatUser.uid) return;
    console.log("Opening profile:", _selectedChatUser.uid);
    _getUserProfileCached(db, _selectedChatUser.uid).then(function(p) {
      if (!p) return;
      console.log("Profile fetched:", p);
      openProfileModal(Object.assign({ uid: _selectedChatUser.uid }, p));
    }).catch(function(err) {
      console.error("Chat header profile fetch error:", err);
    });
  });
}
     
    var messageInput = document.getElementById("messageInput"), sendBtn = document.getElementById("sendBtn"), voiceRecordBtn = document.getElementById("voiceRecordBtn");
    var voiceRetryBtn = document.getElementById("voiceRetryBtn"), voiceCancelBtn = document.getElementById("voiceCancelBtn");
    function _toggleSendState() {
      if (!messageInput || !sendBtn) return;
      sendBtn.disabled = _voiceUploadInFlight || !messageInput.value.trim(); _setInputMessage(messageInput.value);
    }
    if (messageInput) {
      messageInput.addEventListener("input", _toggleSendState);
      messageInput.addEventListener("input", function () {
        var hasText = !!String(messageInput.value || "").trim();
        _emitTypingHeartbeat(hasText);
        if (_typingHeartbeatTimer) clearTimeout(_typingHeartbeatTimer);
        if (hasText) {
          _typingHeartbeatTimer = setTimeout(function () {
            _emitTypingHeartbeat(!!String(messageInput.value || "").trim());
          }, 2500);
        }
        if (_typingClearTimer) clearTimeout(_typingClearTimer);
        _typingClearTimer = setTimeout(function () {
          _emitTypingHeartbeat(false);
        }, 3500);
      });
      messageInput.addEventListener("keydown", function (event) {
        if (event.key !== "Enter" || event.shiftKey) return;
        event.preventDefault(); if (messageInput.value.trim()) _sendMessage();
      });
      messageInput.addEventListener("blur", function () {
        _emitTypingHeartbeat(false);
      });
      messageInput.addEventListener("focus", function () {
        _scrollMessagesToBottom(true);
        setTimeout(function () { _scrollMessagesToBottom(true); }, 300);
      });
      messageInput.value = ""; messageInput.focus();
    }
    if (sendBtn) { sendBtn.addEventListener("click", function () { if (messageInput && messageInput.value.trim()) _sendMessage(); }); sendBtn.disabled = true; }
    if (voiceRecordBtn) {
      voiceRecordBtn.addEventListener("contextmenu", function (event) { event.preventDefault(); });
      voiceRecordBtn.addEventListener("pointerdown", function (event) {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        event.preventDefault();
        _voicePressActive = true;
        if (voiceRecordBtn.setPointerCapture) {
          try { voiceRecordBtn.setPointerCapture(event.pointerId); } catch (e) {}
        }
        _startVoiceRecording();
      });
      function _releaseVoiceHold() {
        if (!_voicePressActive) return;
        _voicePressActive = false;
        _stopVoiceRecordingAndSend();
      }
      voiceRecordBtn.addEventListener("pointerup", _releaseVoiceHold);
      voiceRecordBtn.addEventListener("pointercancel", _releaseVoiceHold);
      voiceRecordBtn.addEventListener("pointerleave", function (event) {
        if (event.buttons === 0) _releaseVoiceHold();
      });
    }
    if (voiceRetryBtn) {
      voiceRetryBtn.addEventListener("click", function () {
        if (_voiceUploadInFlight || !_voicePendingDraft) return;
        _voiceUploadError = "";
        _renderVoiceRecordingState();
        _sendVoiceMessage(_voicePendingDraft.blob, _voicePendingDraft.mimeType, _voicePendingDraft.durationMs)
          .catch(function (err) {
            console.error("[Vaani] Voice retry failed:", err && err.message ? err.message : err);
          });
      });
    }
    if (voiceCancelBtn) {
      voiceCancelBtn.addEventListener("click", function () {
        if (typeof _voiceUploadCancelFn === "function") _voiceUploadCancelFn();
      });
    }
    _renderVoiceRecordingState();
    if (_messagesContainerRef) {
      _messagesContainerRef.addEventListener("scroll", function () {
        _shouldStickToBottom = _isUserNearBottom(_messagesContainerRef);
      }, { passive: true });
    }
    _toggleSendState();
    _setupChatStatusWatchers(_activeChatId, otherProfile.uid || (_selectedChatUser && _selectedChatUser.uid));
    _renderHeaderStatus();

    try {
      var cu = window._vaaniCurrentUser;
      if (cu && cu.uid && _activeChatId && _selectedChatUser) {
        sessionStorage.setItem("vaani_active_chat_" + cu.uid, JSON.stringify({ chatId: _activeChatId, otherUid: _selectedChatUser.uid }));
      }
    } catch (e) {}

    console.log("[Vaani] Chat UI ready — chatId:", _activeChatId, "| with:", username);
  }


function _tryLoadSessionProfile(uid) {
  try {
    var key = "vaani_auth_profile_" + String(uid || "");
    var raw = sessionStorage.getItem(key);
    if (raw) {
      var entry = JSON.parse(raw);
      if (entry && entry.profile && (Date.now() - (entry.cachedAt || 0)) < 30 * 60 * 1000) {
        return entry.profile;
      }
    }
  } catch (_) {}

  return _loadProfileCache(uid);
}

function _tryRehydrateActiveChat(db, uid) {
  try {
    var saved = sessionStorage.getItem("vaani_active_chat_" + uid);
    if (!saved) return;
    var state = JSON.parse(saved);
    if (!state || !state.chatId || !state.otherUid) return;

    db.collection("users").doc(state.otherUid).get()
      .then(function (profileDoc) {
        var otherProfile = profileDoc.exists ? profileDoc.data() : {};
        otherProfile.uid = state.otherUid;
        _openChatUI(state.chatId, otherProfile);
      })
      .catch(function (err) {
        console.warn("[Vaani] rehydrate failed:", err);
        sessionStorage.removeItem("vaani_active_chat_" + uid);
      });
  } catch (e) {}
}
    
  // ── Public API ────────────────────────────────────────────────────────────
  window.vaaniChat = {
    ready: true,
    _currentView: "home",
    _chatList: [],
    open: function (chatId) {
  if (chatId) {
    console.log("Opening chat:", chatId);
  }
  var root = _root();
  var auth = window.vaaniRouter && typeof window.vaaniRouter.getAuth === "function"
    ? window.vaaniRouter.getAuth()
    : null;

  if (!auth) return;

  var user = auth.currentUser;
  if (!user || !window._vaaniCurrentUser) {
    _renderLogin();
    return;
  }

  var db = window.vaaniRouter && typeof window.vaaniRouter.getDb === "function"
    ? window.vaaniRouter.getDb()
    : null;

  if (!db) return;

  var shellAlreadyMounted = root && root.querySelector(".vc-shell");
  if (shellAlreadyMounted) {
    if (typeof _createChatListListener === "function" &&
        _activeChatListListenerUid !== String(user.uid)) {
      _createChatListListener();
    }
    _tryRehydrateActiveChat(db, user.uid);
    return;
  }

  var cachedProfile = _tryLoadSessionProfile(user.uid);

  if (cachedProfile) {
    _loading = false;
    _renderChat(user, cachedProfile);
    _tryRehydrateActiveChat(db, user.uid);

    db.collection("users").doc(user.uid).get()
      .then(function (doc) {
        if (!doc.exists || !doc.data().username) return;
        var fresh = doc.data();
        _saveProfileCache(user.uid, fresh);

        if (window.vaaniRouter && typeof window.vaaniRouter.writeProfileCache === "function") {
          window.vaaniRouter.writeProfileCache(user.uid, fresh);
        }
      })
      .catch(function () {});

    return;
  }

  if (root && !root.querySelector(".vc-shell")) {
    _loading = true;
    root.innerHTML =
      '<div class="vg-screen vg-loading-screen">' +
        '<div class="vg-spinner"></div>' +
        '<p>Loading…</p>' +
      '</div>';
  }

  db.collection("users").doc(user.uid).get()
    .then(function (doc) {
      if (!doc.exists || !doc.data().username) {
        _renderProfile(user);
        return;
      }
      var freshProfile = doc.data();
      _saveProfileCache(user.uid, freshProfile);

      if (window.vaaniRouter && typeof window.vaaniRouter.writeProfileCache === "function") {
        window.vaaniRouter.writeProfileCache(user.uid, freshProfile);
      }

      _renderChat(user, freshProfile);
      _tryRehydrateActiveChat(db, user.uid);
    })
    .catch(function () {
      _renderProfile(user);
    })
    .finally(function () {
      _loading = false;
    });
},

    openChatWithUser: async function (uid) {
      var targetUid = String(uid || "").trim();
      if (!targetUid) throw new Error("INVALID_CHAT_TARGET");
      return _openChatWithUser({ uid: targetUid });
    },

    close: function () { _stopListening(); _clearSearchState(); _removeMenu(); _teardownViewportSync(); if (window.vaaniProfile && typeof window.vaaniProfile.closeMyProfile === "function") window.vaaniProfile.closeMyProfile(); },

                setPanelView: function (mode) {
      _panelView = mode === "profile" ? "profile" : (mode === "chat" ? "chat" : (mode === "settings" ? "settings" : "home"));
      if (_panelView !== "chat") _selectedChatUser = null;
      _syncViewWithSelection(false);
    },

        handleHistoryState: function (state) {
      var chatView = (state && state.chatView) || "home";
      var isBack = (state && state._depth || 0) <= ((history.state && history.state._depth) || 0);
      if (chatView === "chat" && _selectedChatUser) {
        _panelView = "chat";
        _syncViewWithSelection(true);
        var el = document.getElementById("vcChatScreen");
        if (el) { el.classList.remove("vn-chat-slide-in","vn-chat-slide-back"); void el.offsetWidth; el.classList.add(isBack ? "vn-chat-slide-back" : "vn-chat-slide-in"); }
      } else if (chatView === "profile") {
        _panelView = "profile";
        _syncViewWithSelection(true);
        var pr = document.getElementById("vcProfileScreen");
        if (pr) { pr.classList.remove("vn-chat-slide-in","vn-chat-slide-back"); void pr.offsetWidth; pr.classList.add(isBack ? "vn-chat-slide-back" : "vn-chat-slide-in"); }
      } else if (chatView === "settings") {
        _panelView = "settings";
        _selectedChatUser = null;
        _syncViewWithSelection(true);
      } else {
        _panelView = "home";
        _selectedChatUser = null;
        _syncViewWithSelection(true);
        // Re-paint the chat list so it is never blank when the user
        // returns to Chat via the hardware/browser back button.
        if (typeof _renderChatList === "function") _renderChatList();
      }
      _lastPushedChatView = chatView === "home" ? null : chatView;
    },

    _renderLogin:  _renderLogin,
    _renderProfile: _renderProfile,
    _renderChat:   _renderChat,
    _createChatListListener: _createChatListListener,
    loadUsers: function () { this.open(); }
  };

  console.log("[Vaani] chat.js v4.2 loaded ✓");
  document.dispatchEvent(new CustomEvent("vaani:chat-ready", {
    detail: { ready: true }
  }));

/* ========================================================= */ 
   // ── Profile Modal ─────────────────────────────────────────────
function _detectSocialPlatform(url) {
  if (!url) return 'website';
  var u = String(url).toLowerCase();
  if (u.includes('instagram.com'))                    return 'instagram';
  if (u.includes('linkedin.com'))                     return 'linkedin';
  if (u.includes('twitter.com') || u.includes('x.com')) return 'twitter';
  if (u.includes('threads.net'))                      return 'threads';
  if (u.includes('snapchat.com'))                     return 'snapchat';
  if (u.includes('github.com'))                       return 'github';
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
  return 'website';
}

function _socialIcon(platform) {
  var icons = {
    instagram: '<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="1.8" fill="none"><rect x="2" y="2" width="20" height="20" rx="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>',
    linkedin:  '<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="1.8" fill="none"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2" fill="currentColor" stroke="none"/></svg>',
    twitter:   '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" stroke="none"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
    threads:   '<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="1.8" fill="none"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10c2.76 0 5.26-1.12 7.07-2.93"/><path d="M8 12c0-2.21 1.79-4 4-4s4 1.79 4 4v1c0 2.21-1.79 4-4 4"/><circle cx="12" cy="13" r="1"/></svg>',
    snapchat:  '<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="1.8" fill="none"><path d="M12 2C8 2 6 5 6 8v1c-1 0-2 .5-2 1.5S5 12 6 12c-.5 2-2 3-3 3.5 1 .5 3 1 4 1 .5 1 1.5 1.5 5 1.5s4.5-.5 5-1.5c1 0 3-.5 4-1-1-.5-2.5-1.5-3-3.5 1 0 2-.5 2-1.5S19 10 18 10V8c0-3-2-6-6-6z"/></svg>',
    github:    '<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="1.8" fill="none"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/></svg>',
    youtube:   '<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="1.8" fill="none"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46A2.78 2.78 0 0 0 1.46 6.42 29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58A2.78 2.78 0 0 0 3.41 19.6C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 0 0 1.95-1.95A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58z"/><polygon points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02" fill="currentColor" stroke="none"/></svg>',
    website:   '<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="1.8" fill="none"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>'
  };
  return icons[platform] || icons.website;
}

// ═══════════════════════════════════════════════════════════════════
//  openProfileModal — Vaani v5.0
//  DROP-IN REPLACEMENT for the openProfileModal function in chat.js
//
//  HOW TO USE:
//    1. In chat.js, find the old openProfileModal function (starts with
//       "function openProfileModal(profile) {")
//    2. Delete the entire old function (from its opening line through
//       its closing "}" brace).
//    3. Paste EVERYTHING between the ═══ markers in its place.
//    4. The _closeProfileModal function below should ALSO replace the
//       existing _closeProfileModal in chat.js.
// ═══════════════════════════════════════════════════════════════════

// ── Platform detection ────────────────────────────────────────────
function _detectSocialPlatform(url) {
  if (!url) return 'website';
  var u = String(url).toLowerCase();
  if (u.includes('instagram.com'))                         return 'instagram';
  if (u.includes('linkedin.com'))                          return 'linkedin';
  if (u.includes('twitter.com') || u.includes('x.com'))   return 'twitter';
  if (u.includes('threads.net'))                           return 'threads';
  if (u.includes('snapchat.com'))                          return 'snapchat';
  if (u.includes('github.com'))                            return 'github';
  if (u.includes('youtube.com') || u.includes('youtu.be'))return 'youtube';
  if (u.includes('facebook.com'))                          return 'facebook';
  return 'website';
}

// ── SVG icon set ──────────────────────────────────────────────────
function _socialIcon(platform) {
  var icons = {
    instagram: '<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>',
    linkedin:  '<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2" fill="currentColor" stroke="none"/></svg>',
    twitter:   '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" stroke="none"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
    threads:   '<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10c2.76 0 5.26-1.12 7.07-2.93"/><path d="M8 12c0-2.21 1.79-4 4-4s4 1.79 4 4v1c0 2.21-1.79 4-4 4"/><circle cx="12" cy="13" r="1"/></svg>',
    snapchat:  '<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C8 2 6 5 6 8v1c-1 0-2 .5-2 1.5S5 12 6 12c-.5 2-2 3-3 3.5 1 .5 3 1 4 1 .5 1 1.5 1.5 5 1.5s4.5-.5 5-1.5c1 0 3-.5 4-1-1-.5-2.5-1.5-3-3.5 1 0 2-.5 2-1.5S19 10 18 10V8c0-3-2-6-6-6z"/></svg>',
    github:    '<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/></svg>',
    youtube:   '<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46A2.78 2.78 0 0 0 1.46 6.42 29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58A2.78 2.78 0 0 0 3.41 19.6C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 0 0 1.95-1.95A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58z"/><polygon points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02" fill="currentColor" stroke="none"/></svg>',
    facebook:  '<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>',
    website:   '<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>'
  };
  return icons[platform] || icons.website;
}

// ── Collect social URLs from both formats ─────────────────────────
function _collectSocialURLs(profile) {
  var urls = [];
  // Format A: socialLinks = [{url, type}, ...]
  if (Array.isArray(profile.socialLinks)) {
    profile.socialLinks.forEach(function (l) {
      if (l && l.url && String(l.url).trim()) urls.push(String(l.url).trim());
    });
  }
  // Format B: links = {key: url, ...}
  if (profile.links && typeof profile.links === 'object' && !Array.isArray(profile.links)) {
    Object.values(profile.links).forEach(function (u) {
      if (u && String(u).trim()) urls.push(String(u).trim());
    });
  }
  // Deduplicate and cap at 4
  return urls.filter(function (u, i, a) { return u && a.indexOf(u) === i; }).slice(0, 4);
}

// ── Main modal renderer ───────────────────────────────────────────
function openProfileModal(profile) {
  if (!profile) return;

  // Remove any existing modal
  var existing = document.getElementById('vaaniProfileModal');
  if (existing) existing.remove();

  var _esc = function (value) {
    var el = document.createElement('div');
    el.appendChild(document.createTextNode(String(value || '')));
    return el.innerHTML;
  };

  var displayName = profile.displayName || profile.name || profile.username || 'User';
  var username    = profile.username || 'user';
  var photoURL    = typeof _upgradePhotoURL === 'function'
    ? _upgradePhotoURL(profile.photoURL || '')
    : (profile.photoURL || '');
  var bio         = profile.bio || '';
  var langs       = Array.isArray(profile.fluentLanguages)
    ? profile.fluentLanguages.filter(Boolean).slice(0, 4)
    : [];
  var initial     = (displayName.charAt(0) || 'U').toUpperCase();
  var socialURLs  = _collectSocialURLs(profile);

  // ── Avatar ──────────────────────────────────────────────────────
  var avatarHTML = photoURL
    ? '<img class="vmp-modal-avatar-img" src="' + _esc(photoURL) + '" alt="' + _esc(displayName) + '"' +
      ' onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\';">' +
      '<div class="vmp-modal-avatar-fallback" style="display:none;">' + _esc(initial) + '</div>'
    : '<div class="vmp-modal-avatar-fallback">' + _esc(initial) + '</div>';

  // ── Language pills ───────────────────────────────────────────────
  var langHTML = langs.length
    ? '<div class="vmp-modal-langs">' +
        langs.map(function (l) {
          return '<span class="vmp-modal-lang">' + _esc(l) + '</span>';
        }).join('') +
      '</div>'
    : '';

  // ── Social icons ─────────────────────────────────────────────────
  var socialHTML = socialURLs.length
    ? '<div class="vmp-modal-divider"></div>' +
      '<div class="vmp-modal-socials">' +
        socialURLs.map(function (url) {
          var platform = _detectSocialPlatform(url);
          return '<a class="vmp-modal-social-btn vmp-social-' + _esc(platform) + '"' +
            ' href="' + _esc(url) + '"' +
            ' target="_blank" rel="noopener noreferrer"' +
            ' title="' + _esc(platform.charAt(0).toUpperCase() + platform.slice(1)) + '">' +
            _socialIcon(platform) +
            '</a>';
        }).join('') +
      '</div>'
    : '';

  // ── Full modal HTML ───────────────────────────────────────────────
  var overlay = document.createElement('div');
  overlay.id        = 'vaaniProfileModal';
  overlay.className = 'vmp-modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', _esc(displayName) + "'s profile");

  overlay.innerHTML =
    '<div class="vmp-modal-card">' +

      // Close button
      '<button class="vmp-modal-close" aria-label="Close">' +
        '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none">' +
          '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>' +
        '</svg>' +
      '</button>' +

      // Avatar
      '<div class="vmp-modal-avatar">' + avatarHTML + '</div>' +

      // Name + username
      '<div class="vmp-modal-name">'     + _esc(displayName) + '</div>' +
      '<div class="vmp-modal-username">@' + _esc(username)   + '</div>' +

      // Bio
      (bio
        ? '<p class="vmp-modal-bio">' + _esc(bio) + '</p>'
        : '') +

      // Language pills
      langHTML +

      // Divider
      '<div class="vmp-modal-divider"></div>' +

      // Message button
      '<button class="vmp-modal-msg-btn" id="vmpModalMsgBtn">' +
        '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>' +
        '</svg>' +
        'Message' +
      '</button>' +

      // Social icons (includes its own divider)
      socialHTML +

    '</div>';

  document.body.appendChild(overlay);

  // ── Animate in ───────────────────────────────────────────────────
  requestAnimationFrame(function () {
    overlay.classList.add('vmp-modal-visible');
  });

  // ── Event bindings ────────────────────────────────────────────────
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) _closeProfileModal();
  });

  var closeBtn = overlay.querySelector('.vmp-modal-close');
  if (closeBtn) closeBtn.addEventListener('click', _closeProfileModal);

  var msgBtn = overlay.querySelector('#vmpModalMsgBtn');
  if (msgBtn) {
    msgBtn.addEventListener('click', function () {
      _closeProfileModal();
      if (profile.uid && typeof _openChatWithUser === 'function') {
        _openChatWithUser(profile);
      }
    });
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      _closeProfileModal();
      document.removeEventListener('keydown', onKeyDown);
    }
  }
  document.addEventListener('keydown', onKeyDown);
}

function _closeProfileModal() {
  var modal = document.getElementById('vaaniProfileModal');
  if (!modal) return;
  modal.classList.remove('vmp-modal-visible');
  modal.classList.add('vmp-modal-closing');
  setTimeout(function () {
    if (modal && modal.parentNode) modal.parentNode.removeChild(modal);
  }, 200);
}


/* ========================================================= */
})();
