import { getUserProfile, renderUserProfile } from "./profile.js";

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
  var _unsubscribeChatList = null;
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
  var _searchResultCache = [];
  var _searchDropdownRef = null;
  var _pendingOutgoingUidSet = new Set();
  var _pendingIncomingUidSet = new Set();

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

  function _safeTimestampValue(value) {
    if (!value) return null;
    if (typeof value.toMillis === "function") return value;
    if (value instanceof Date) return firebase.firestore.Timestamp.fromDate(value);
    if (typeof value === "number" && isFinite(value)) {
      return firebase.firestore.Timestamp.fromMillis(value);
    }
    return null;
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
        existingChatSnap.forEach(function (doc) {
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
      } catch (err) { console.error("[Vaani] Legacy chat backfill failed:", err); }
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
    } catch (fatalErr) { console.error("[Vaani] _migrateLegacyMessages: fatal:", fatalErr); return; }

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
    } catch (fatalErr) { console.error("[Vaani] _migrateTopLevelMessages: fatal:", fatalErr); return; }

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
        if (action === "settings" && typeof window.navigateTo === "function") { window.navigateTo("Settings"); return; }
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

    var photo    = user.photoURL || "";
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
      '<div class="vc-profile-view-wrap" id="vcProfileScreen" style="display:none;"></div></section>';

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
    console.log("[Vaani] _renderChat: running migrations in background…");
    Promise.allSettled([
      _backfillChatsFromLegacyMessages(),
      _migrateLegacyMessages(),
      _migrateTopLevelMessages()
    ]).then(function () {
      console.log("[Vaani] _renderChat: background migrations finished.");
    });
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
      window.vaaniChat._currentView = _panelView === "profile" ? "profile" : (_selectedChatUser ? "chat" : "home");
  }

  function _setSelectedChatUser(user) {
    if (!user) {
      try {
        var cu = window._vaaniCurrentUser;
        if (cu && cu.uid) sessionStorage.removeItem("vaani_active_chat_" + cu.uid);
      } catch (e) {}
    }
    _selectedChatUser = user || null;
    _panelView = _selectedChatUser ? "chat" : "home";
    if (!_selectedChatUser) {
      _activeChatId = null; _messages = []; _inputMessage = ""; _messagesContainerRef = null;
      _teardownMessageListener();
      _teardownViewportSync();
    }
    _syncViewWithSelection();
  }

  function _setActivePanel(panel) {
    var home = document.getElementById("vcHomeScreen");
    var chat = document.getElementById("vcChatScreen");
    var profile = document.getElementById("vcProfileScreen");
    if (!home || !chat || !profile) return;
    home.style.display = panel === "home" ? "block" : "none";
    chat.style.display = panel === "chat" ? "flex" : "none";
    profile.style.display = panel === "profile" ? "flex" : "none";
  }

  function _setMessages(nextMessages)  { _messages      = Array.isArray(nextMessages) ? nextMessages : []; }
  function _setInputMessage(nextValue) { _inputMessage  = String(nextValue || ""); }

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
    window.requestAnimationFrame(function () {
      if (_messagesContainerRef) _messagesContainerRef.scrollTop = _messagesContainerRef.scrollHeight;
    });
  }

  function _teardownMessageListener() {
    if (_unsubscribeMessages) { _unsubscribeMessages(); _unsubscribeMessages = null; }
    _activeMessageListenerKey = null; _activeMessagesSignature = ""; _optimisticMessages = [];
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
      .onSnapshot(function (snapshot) {
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
    .onSnapshot(function (snapshot) {
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
      return '<div class="vc-request-item vc-request-item-sent">' +
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
        if (acceptBtn) await _acceptConnectionRequest(db, requestId, currentUid, fromUid);
        else           await _rejectConnectionRequest(db, requestId);
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
    if (!toggleBtn || !panel) return;
    toggleBtn.addEventListener("click", function () { panel.classList.toggle("vc-open"); });
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

  // ── FIX 6: sendMessage — always include sorted participants[] ────────────
  async function sendMessage(chatId, text, currentUid, otherUid) {
    var db = window.vaaniRouter && typeof window.vaaniRouter.getDb === "function" ? window.vaaniRouter.getDb() : null;
    if (!db || !chatId || !text || !currentUid || !otherUid) return;
    // participants must be sorted to match the Firestore rule check
    var participants = [String(currentUid), String(otherUid)].sort();
    await db.collection(CHATS_COLLECTION).doc(chatId).collection(MESSAGES_COLLECTION).add({
      text: text, senderId: currentUid, receiverId: otherUid,
      participants: participants, chatId: chatId,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    await db.collection(CHATS_COLLECTION).doc(chatId).update({
      lastMessage: text, updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }

  async function _sendMessage() {
    var db = window.vaaniRouter && typeof window.vaaniRouter.getDb === "function" ? window.vaaniRouter.getDb() : null;
    var currentUser = window._vaaniCurrentUser || null, selectedUser = _selectedChatUser || null;
    var inputEl = document.getElementById("messageInput"), sendBtn = document.getElementById("sendBtn");

    if (!db)                                { console.error("[Vaani] _sendMessage: db unavailable");      return; }
    if (!currentUser || !currentUser.uid)   { console.error("[Vaani] _sendMessage: no current user");    return; }
    if (!selectedUser || !selectedUser.uid) { console.error("[Vaani] _sendMessage: no selected user");   return; }
    if (!inputEl)                           { console.error("[Vaani] _sendMessage: input not found");    return; }
    if (sendBtn && sendBtn.disabled)        return;

    var inputMessage = (inputEl.value || "").trim(); if (!inputMessage) return;
    var currentUid = String(currentUser.uid), otherUid = String(selectedUser.uid);

    if (!_activeChatId) {
      console.log("[Vaani] _sendMessage: no activeChatId — calling _getOrCreateChat");
      try { _activeChatId = await _getOrCreateChat(otherUid); }
      catch (err) { console.error("[Vaani] _sendMessage: _getOrCreateChat threw:", err); return; }
      if (!_activeChatId) { console.error("[Vaani] _sendMessage: chatId still null — abort"); return; }
      if (!_unsubscribeMessages) _listenToMessages(_activeChatId);
    }

    _activeChatId = String(_activeChatId || "");
    if (!_activeChatId) { console.error("[Vaani] _sendMessage: empty chatId — abort"); return; }

    console.log("[Vaani] _sendMessage: chatId =", _activeChatId, "| text =", inputMessage);

    var tempId = "local-" + Date.now() + "-" + Math.random().toString(36).slice(2);
    _optimisticMessages.push({ _optimisticId: tempId, text: inputMessage, senderId: currentUid, timestamp: new Date() });
    _renderMessages(true);

    inputEl.disabled = true; if (sendBtn) sendBtn.disabled = true;
    inputEl.value = ""; _setInputMessage("");

    try {
      await sendMessage(_activeChatId, inputMessage, currentUid, otherUid);
      console.log("[Vaani] _sendMessage: write succeeded");
    } catch (err) {
      _optimisticMessages = _optimisticMessages.filter(function (m) { return m._optimisticId !== tempId; });
      _setInputMessage(inputMessage); inputEl.value = inputMessage; _renderMessages(true);
      console.error("[Vaani] _sendMessage: write failed:", err);
      if (typeof window.showToast === "function") window.showToast("Message failed to send — please try again");
    } finally {
      inputEl.disabled = false; _setInputMessage(inputEl.value || "");
      if (sendBtn) sendBtn.disabled = !_inputMessage.trim(); inputEl.focus();
    }
  }

  function _renderMessages(forceBottom) {
    var container = _messagesContainerRef; if (!container) return;
    var currentUid = window._vaaniCurrentUser && window._vaaniCurrentUser.uid ? String(window._vaaniCurrentUser.uid) : "";
    var stickToBottom = !!forceBottom || _isUserNearBottom(container);
    var distanceFromBottom = container.scrollHeight - container.scrollTop;
    _shouldStickToBottom = stickToBottom;
    container.innerHTML = "";
    var messages = (Array.isArray(_messages) ? _messages : []).concat(Array.isArray(_optimisticMessages) ? _optimisticMessages : []);
    if (!messages.length) {
      var emptyState = document.createElement("div");
      emptyState.className = "vc-chat-empty"; emptyState.textContent = "Start a conversation";
      container.appendChild(emptyState); _scrollMessagesToBottom(true); return;
    }
    messages.forEach(function (msg) {
      var senderId = msg && msg.senderId != null ? String(msg.senderId) : "";
      var isOwn = senderId === currentUid;
      var row = document.createElement("div"); row.className = isOwn ? "vc-msg-row vc-msg-own" : "vc-msg-row vc-msg-other";
      var bubble = document.createElement("div"); bubble.className = "vc-msg-bubble"; bubble.textContent = String(msg.text || "");
      row.appendChild(bubble); container.appendChild(row);
    });
    window.requestAnimationFrame(function () {
      if (!_messagesContainerRef) return;
      if (stickToBottom) {
        _scrollMessagesToBottom(true);
        return;
      }
      _messagesContainerRef.scrollTop = Math.max(0, _messagesContainerRef.scrollHeight - distanceFromBottom);
    });
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
      .onSnapshot(function (snapshot) {
        if (_activeMessageListenerKey !== listenerKey) {
          console.warn("[Vaani] listenToMessages: stale snapshot discarded for", chatId); return;
        }
        var messages = snapshot.docs.map(function (doc) { return Object.assign({ id: doc.id }, doc.data() || {}); });
        var sigParts = [];
        snapshot.docs.forEach(function (doc) {
          var d = doc.data() || {};
          sigParts.push(doc.id, String(d.text || ""), String(d.senderId || ""),
            String(d.timestamp && typeof d.timestamp.toMillis === "function" ? d.timestamp.toMillis() : ""));
        });
        var nextSig = sigParts.join("|");
        if (!firstFire && nextSig === _activeMessagesSignature) {
          console.log("[Vaani] listenToMessages: unchanged, skipping render."); return;
        }
        firstFire = false; _activeMessagesSignature = nextSig; _optimisticMessages = [];
        _setMessages(messages); _renderMessages();
        console.log("[Vaani] listenToMessages: rendered", messages.length, "msg(s) for chatId:", chatId);
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
            '<div class="vc-chat-hsub">Online • Connected</div></div>' +
            '<div class="vc-chat-hactions">' +
              '<button class="vc-header-action-btn" id="chatMenuBtn" aria-label="More options">' + menuIconSVG + "</button>" +
            "</div></div>" +
          '<div class="vc-chat-messages chat-messages" id="messagesContainer"></div>' +
          '<div class="vc-chat-input-bar chat-input">' +
            '<input id="messageInput" class="vc-chat-input" type="text" placeholder="Type a message..." autocomplete="off" spellcheck="false">' +
            '<button id="sendBtn" class="vc-chat-send" disabled aria-label="Send message">' + sendIconSVG + "</button>" +
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
    if (backBtn) backBtn.onclick = function () { _setSelectedChatUser(null); };
    var menuBtn = document.getElementById("chatMenuBtn");
    if (menuBtn) menuBtn.onclick = function () {
      console.log("[Vaani] Menu action tapped for:", username);
    };

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
     
    var messageInput = document.getElementById("messageInput"), sendBtn = document.getElementById("sendBtn");
    function _toggleSendState() {
      if (!messageInput || !sendBtn) return;
      sendBtn.disabled = !messageInput.value.trim(); _setInputMessage(messageInput.value);
    }
    if (messageInput) {
      messageInput.addEventListener("input", _toggleSendState);
      messageInput.addEventListener("keydown", function (event) {
        if (event.key !== "Enter" || event.shiftKey) return;
        event.preventDefault(); if (messageInput.value.trim()) _sendMessage();
      });
      messageInput.addEventListener("focus", function () {
        _scrollMessagesToBottom(true);
        setTimeout(function () { _scrollMessagesToBottom(true); }, 300);
      });
      messageInput.value = ""; messageInput.focus();
    }
    if (sendBtn) { sendBtn.addEventListener("click", function () { if (messageInput && messageInput.value.trim()) _sendMessage(); }); sendBtn.disabled = true; }
    if (_messagesContainerRef) {
      _messagesContainerRef.addEventListener("scroll", function () {
        _shouldStickToBottom = _isUserNearBottom(_messagesContainerRef);
      }, { passive: true });
    }
    _toggleSendState();

    try {
      var cu = window._vaaniCurrentUser;
      if (cu && cu.uid && _activeChatId && _selectedChatUser) {
        sessionStorage.setItem("vaani_active_chat_" + cu.uid, JSON.stringify({ chatId: _activeChatId, otherUid: _selectedChatUser.uid }));
      }
    } catch (e) {}

    console.log("[Vaani] Chat UI ready — chatId:", _activeChatId, "| with:", username);
  }

  // ── Public API ────────────────────────────────────────────────────────────
  window.vaaniChat = {
    _currentView: "home",
    _chatList: [],
    open: function () {
  var root = _root();
  if (window.vaaniRouter && typeof window.vaaniRouter.getAuth === "function") {
    var auth = window.vaaniRouter.getAuth();
    if (auth) {
      var user = auth.currentUser;
      if (!user || !window._vaaniCurrentUser) {
        _renderLogin();
        return;
      }

      var db = window.vaaniRouter.getDb();
      var cachedProfile = _loadProfileCache(user.uid);
      var renderedFromCache = false;
      if (cachedProfile) {
        renderedFromCache = true;
        _renderChat(user, cachedProfile);
      } else if (root && !root.children.length) {
        root.innerHTML = '<div class="vg-screen vg-loading-screen"><div class="vg-spinner"></div><p>Loading profile…</p></div>';
      }

      var profilePromise = db.collection("users").doc(user.uid).get();
      var activeChatPromise = Promise.resolve().then(function () {
        try {
          var saved = sessionStorage.getItem("vaani_active_chat_" + user.uid);
          return saved ? JSON.parse(saved) : null;
        } catch (e) { return null; }
      });

      Promise.all([profilePromise, activeChatPromise]).then(function (results) {
        var doc = results[0];
        var state = results[1];
        if (!doc.exists || !doc.data().username) {
          _renderProfile(user);
          return;
        }

        var freshProfile = doc.data();
        _saveProfileCache(user.uid, freshProfile);

        if (!renderedFromCache) {
          _renderChat(user, freshProfile);
        }

        if (state && state.chatId && state.otherUid) {
          db.collection("users").doc(state.otherUid).get()
            .then(function (profileDoc) {
              var otherProfile = profileDoc.exists ? profileDoc.data() : {};
              otherProfile.uid = state.otherUid;
              _openChatUI(state.chatId, otherProfile);
            })
            .catch(function (err) {
              console.warn("[Vaani] rehydrate: profile fetch failed:", err);
              sessionStorage.removeItem("vaani_active_chat_" + user.uid);
            });
        }
      }).catch(function () {
        if (!renderedFromCache) _renderProfile(user);
      });
    }
  }
},

    openChatWithUser: async function (uid) {
      var targetUid = String(uid || "").trim();
      if (!targetUid) throw new Error("INVALID_CHAT_TARGET");
      return _openChatWithUser({ uid: targetUid });
    },

    close: function () { _stopListening(); _clearSearchState(); _removeMenu(); _teardownViewportSync(); if (window.vaaniProfile && typeof window.vaaniProfile.closeMyProfile === "function") window.vaaniProfile.closeMyProfile(); },

                setPanelView: function (mode) {
      _panelView = mode === "profile" ? "profile" : (mode === "chat" ? "chat" : "home");
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
      } else {
        _panelView = "home";
        _selectedChatUser = null;
        _syncViewWithSelection(true);
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

/* ========================================================= */ 
   // ── Profile Modal ─────────────────────────────────────────────
function _detectSocialPlatform(url) {
  if (!url) return null;
  var u = String(url).toLowerCase();
  if (u.includes('instagram.com'))  return 'instagram';
  if (u.includes('linkedin.com'))   return 'linkedin';
  if (u.includes('twitter.com') || u.includes('x.com')) return 'twitter';
  if (u.includes('threads.net'))    return 'threads';
  if (u.includes('snapchat.com'))   return 'snapchat';
  return 'website';
}

function _socialIcon(platform) {
  var icons = {
    instagram: '<svg viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>',
    linkedin:  '<svg viewBox="0 0 24 24"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>',
    twitter:   '<svg class="pm-social-x" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
    threads:   '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/></svg>',
    website:   '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>'
  };
  return icons[platform] || icons.website;
}

function openProfileModal(profile) {
  if (!profile) return;

  var existing = document.getElementById('vaaniProfileModal');
  if (existing) existing.remove();

  var theme = document.documentElement.getAttribute('data-theme') || 'dark';
  var name      = _esc(profile.displayName || profile.name || profile.username || 'User');
  var username  = _esc(profile.username || 'user');
  var photoURL  = profile.photoURL || '';
  var bio       = _esc(profile.bio || '');
  var langs     = Array.isArray(profile.fluentLanguages) ? profile.fluentLanguages : [];
  var links     = profile.links && typeof profile.links === 'object' ? profile.links : {};
  var initial   = (name.charAt(0) || 'U').toUpperCase();

  // Avatar HTML
  var avatarHTML = photoURL
    ? '<img src="' + _esc(photoURL) + '" alt="' + name + ' avatar" onerror="this.style.display=\'none\';this.nextSibling.style.display=\'flex\';">' +
      '<div class="pm-img-fallback" style="display:none;">' + initial + '</div>'
    : '<div class="pm-img-fallback">' + initial + '</div>';

  // Lang tags
  var langHTML = langs.slice(0, 4).map(function(l) {
    return '<span class="pm-lang">' + _esc(l) + '</span>';
  }).join('');

  // Social links (auto-detect platform)
  var socialHTML = Object.values(links).filter(Boolean).slice(0, 5).map(function(url) {
    var platform = _detectSocialPlatform(url);
    return '<a class="pm-social' + (platform === 'twitter' ? ' pm-social-x' : '') + '" href="' + _esc(url) + '" target="_blank" rel="noopener" title="' + platform + '">' +
      _socialIcon(platform) + '</a>';
  }).join('');

  var overlay = document.createElement('div');
  overlay.id = 'vaaniProfileModal';
  overlay.className = 'pm-overlay';
  if (theme === 'light') overlay.setAttribute('data-theme', 'light');

  overlay.innerHTML =
    '<div class="pm-card" role="dialog" aria-label="' + name + '\'s profile">' +
      '<button class="pm-close" aria-label="Close profile">' +
        '<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
      '</button>' +
      '<div class="pm-img-wrap">' + avatarHTML +
        '<div class="pm-identity">' +
          '<div class="pm-identity-name">' + name + '</div>' +
          '<div class="pm-identity-user">@' + username + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="pm-body">' +
        (bio ? '<div class="pm-bio">' + bio + '</div>' : '') +
        (langHTML ? '<div class="pm-langs">' + langHTML + '</div>' : '') +
        (socialHTML ? '<div class="pm-divider"></div><div class="pm-socials">' + socialHTML + '</div>' : '') +
        '<button class="pm-msg-btn" id="pmMsgBtn">' +
          '<svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' +
          'Message' +
        '</button>' +
      '</div>' +
    '</div>';

  document.body.appendChild(overlay);

  // Close on backdrop click
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) _closeProfileModal();
  });

  // Close button
  overlay.querySelector('.pm-close').addEventListener('click', _closeProfileModal);

  // ESC key
  function onKeyDown(e) {
    if (e.key === 'Escape') { _closeProfileModal(); document.removeEventListener('keydown', onKeyDown); }
  }
  document.addEventListener('keydown', onKeyDown);

  // Message button
  var msgBtn = overlay.querySelector('#pmMsgBtn');
  if (msgBtn) {
    msgBtn.addEventListener('click', function() {
      _closeProfileModal();
      if (profile.uid) {
        var db = window.vaaniRouter && window.vaaniRouter.getDb ? window.vaaniRouter.getDb() : null;
        if (db) _openChatWithUser(profile);
      }
    });
  }
}

function _closeProfileModal() {
  var modal = document.getElementById('vaaniProfileModal');
  if (!modal) return;
  modal.style.opacity = '0';
  modal.style.transition = 'opacity 0.18s ease';
  setTimeout(function() { if (modal.parentNode) modal.parentNode.removeChild(modal); }, 180);
}
 /* ========================================================= */   
})();
