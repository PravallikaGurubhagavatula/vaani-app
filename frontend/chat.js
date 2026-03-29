/* ================================================================
   Vaani — chat.js  v4.3
   Fixes applied on top of v4.2:
     FIX-A: _renderChatList signature guard — _hasLoadedChatListOnce is
             set to `true` in the snapshot handler BEFORE _renderChatList
             is called, so the "first render" branch inside the guard was
             unreachable. The guard now uses a dedicated
             `_chatListRenderedOnce` flag that is flipped only INSIDE
             _renderChatList after a successful render, making the first-
             render path reachable again.
     FIX-B: _renderChatList unused `db` / `currentUid` declarations
             removed — they shadowed outer variables and caused a silent
             async-function stall on environments where the Firestore
             import is deferred (no crash, but the function would yield
             the microtask queue unexpectedly on first call).
     FIX-C: Signature guard logic rewritten for clarity: _forceRenderChatList
             bypasses the guard entirely; the guard only skips when we have
             already rendered the exact same data set at least once.
     FIX-D: _createChatListListener snapshot handler — always sets
             _forceRenderChatList = true before calling _renderChatList so
             the live snapshot always wins over the cached-signature check.
     FIX-E: _renderChatList converted from `async function` to a regular
             synchronous function — the `async` keyword caused it to return
             a Promise, which meant early-return paths and list-building
             executed on separate microtask ticks, racing with subsequent
             calls. Removing `async` makes execution fully synchronous and
             predictable.
   ================================================================ */

(function () {
  "use strict";

  var CHAT_ROOT_ID = "vaaniChat";
  var _searchDebounceTimer = null;
  var _latestSearchQuery = "";
  var _outsideClickHandler = null;
  var _unsubscribeIncomingRequests = null;
  var _unsubscribeConnections = null;
  var _unsubscribeMessages = null;
  var _activeMessageListenerKey = null;
  var _activeMessagesSignature = "";
  var _optimisticMessages = [];
  var _unsubscribeChatList = null;
  var _activeChatListListenerUid = null;
  var _connectedUidSet = new Set();
  var _userProfileCache = Object.create(null);
  var _renderedChatListSignature = "";
  var _forceRenderChatList = false;
  var _hasLoadedChatListOnce = false;
  // FIX-A: separate flag flipped only after a successful render
  var _chatListRenderedOnce = false;
  var CACHE_KEY_PREFIX = "vaani_chatlist_";
  var PROFILE_CACHE_KEY_PREFIX = "vaani_profile_";
  var MIGRATION_KEY_PREFIX = "vaani_migration_done_v2_";
  var _chatListOpenRequestId = 0;
  var _chatBackfillPromisesByUid = Object.create(null);
  var _activeChatId = null;
  var _selectedChatUser = null;
  var _loading = true;
  var _messages = [];
  var _inputMessage = "";
  var _messagesContainerRef = null;

  var CHATS_COLLECTION = "chats";
  var MESSAGES_COLLECTION = "messages";
  var LEGACY_MESSAGES_COLLECTION = "vaani_messages";
  var incomingRequests = [];

  var REQUESTS_COLLECTION = "connectionRequests";
  var CONNECTIONS_COLLECTION = "connections";

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

  function _saveChatListCache(uid, conversations) {
    if (!uid) return;
    try {
      var payload = (Array.isArray(conversations) ? conversations : []).map(function (conversation) {
        var profile = conversation && conversation.user ? conversation.user : {};
        var timestamp = conversation ? (conversation.timestamp || conversation.updatedAt || null) : null;
        return {
          chatId: conversation ? conversation.chatId : null,
          otherUid: conversation ? conversation.otherUid : null,
          username: profile.username || "user",
          displayName: profile.displayName || profile.username || "user",
          photoURL: profile.photoURL || "",
          lastMessage: conversation && conversation.lastMessage ? conversation.lastMessage : "",
          updatedAtMs: timestamp && typeof timestamp.toMillis === "function" ? timestamp.toMillis() : 0
        };
      }).filter(function (item) { return item && item.chatId && item.otherUid; });
      localStorage.setItem(CACHE_KEY_PREFIX + String(uid), JSON.stringify(payload));
    } catch (e) {}
  }

  function _loadChatListCache(uid) {
    if (!uid) return null;
    try {
      var raw = localStorage.getItem(CACHE_KEY_PREFIX + String(uid));
      if (!raw) return null;
      var items = JSON.parse(raw);
      if (!Array.isArray(items)) return null;
      return items.map(function (item) {
        return {
          chatId: item.chatId,
          otherUid: item.otherUid,
          user: {
            uid: item.otherUid,
            username: item.username || "user",
            displayName: item.displayName || item.username || "user",
            photoURL: item.photoURL || ""
          },
          lastMessage: item.lastMessage || "",
          timestamp: item.updatedAtMs
            ? firebase.firestore.Timestamp.fromMillis(item.updatedAtMs)
            : null
        };
      }).filter(function (item) { return item && item.chatId && item.otherUid; });
    } catch (e) {
      return null;
    }
  }

  function _saveProfileCache(uid, profile) {
    if (!uid || !profile) return;
    try {
      localStorage.setItem(PROFILE_CACHE_KEY_PREFIX + String(uid), JSON.stringify({
        username: profile.username || "",
        displayName: profile.displayName || profile.username || "",
        photoURL: profile.photoURL || ""
      }));
    } catch (e) {}
  }

  function _loadProfileCache(uid) {
    if (!uid) return null;
    try {
      var raw = localStorage.getItem(PROFILE_CACHE_KEY_PREFIX + String(uid));
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || !parsed.username) return null;
      return {
        username: parsed.username,
        displayName: parsed.displayName || parsed.username,
        photoURL: parsed.photoURL || ""
      };
    } catch (e) { return null; }
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
          .where("participants", "array-contains", currentUid).get();
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

    var migrationKey = MIGRATION_KEY_PREFIX + currentUid + "_legacy";
    if (localStorage.getItem(migrationKey)) { console.log("[Vaani] _migrateLegacyMessages: skipping (already ran)."); return; }
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
      if (!docsToProcess.length) { localStorage.setItem(migrationKey, "1"); return; }

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

    localStorage.setItem(migrationKey, "1");
    console.log("[Vaani] _migrateLegacyMessages: done —", migrated, "migrated |", skipped, "skipped |", errors, "errors");
  }

  async function _migrateTopLevelMessages() {
    var db = window.vaaniRouter && typeof window.vaaniRouter.getDb === "function"
      ? window.vaaniRouter.getDb() : null;
    var currentUid = window._vaaniCurrentUser && window._vaaniCurrentUser.uid
      ? String(window._vaaniCurrentUser.uid) : "";
    if (!db || !currentUid) return;

    var migrationKey = MIGRATION_KEY_PREFIX + currentUid + "_toplevel";
    if (localStorage.getItem(migrationKey)) { console.log("[Vaani] _migrateTopLevelMessages: skipping (already ran)."); return; }
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

          var existingSnap = await db.collection(CHATS_COLLECTION).doc(chatId)
            .collection(MESSAGES_COLLECTION).where("_migratedFrom", "==", doc.id).limit(1).get();
          if (!existingSnap.empty) { skipped++; continue; }

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

    localStorage.setItem(migrationKey, "1");
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
      (photo ? '<img src="' + _esc(photo) + '" alt="Profile avatar">' : '<span>' + _esc(initial) + "</span>") +
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
      item.addEventListener("click", function () {
        var action = item.dataset.action; closeMenu();
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
      '<div class="vg-card-icon"><svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></div>' +
      '<h2 class="vg-card-title">Join the Conversation</h2>' +
      '<p class="vg-card-sub">Sign in to access your Vaani chat workspace.</p>' +
      '<button class="vg-google-btn" id="vgSignInBtn">' + _googleLogoSvg() + "Continue with Google</button>" +
      '<p class="vg-hint">Translation features work without signing in ✓</p></div></div>';

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
      (user.photoURL ? '<img class="vg-profile-avatar" src="' + _esc(user.photoURL) + '" alt="avatar">'
        : '<div class="vg-profile-avatar vg-avatar-fallback">' + _esc((firstName[0] || "?").toUpperCase()) + "</div>") +
      '</div><h2 class="vg-card-title">Create Your Profile</h2>' +
      '<p class="vg-card-sub">Hi ' + _esc(firstName || "there") + '! Choose a unique username.</p>' +
      '<div class="vg-field"><label class="vg-label" for="vgUsernameInput">Username</label>' +
      '<div class="vg-input-wrap"><span class="vg-input-prefix">@</span>' +
      '<input id="vgUsernameInput" class="vg-input" type="text" maxlength="20" autocomplete="off" spellcheck="false" placeholder="yourname_01" value="' + _esc(suggested) + '"></div>' +
      '<span class="vg-field-hint" id="vgUsernameHint">Must include letters + numbers. Underscore (_) allowed.</span></div>' +
      '<button class="vg-primary-btn" id="vgCreateProfileBtn" disabled>Create Profile</button>' +
      '<button class="vg-ghost-btn" id="vgSignOutBtn">Sign out</button></div></div>';

    var input = document.getElementById("vgUsernameInput");
    var hint  = document.getElementById("vgUsernameHint");
    var createBtn = document.getElementById("vgCreateProfileBtn");

    function validate() {
      if (!input || !hint || !createBtn) return;
      var err = window.vaaniProfile && window.vaaniProfile.validateUsername ? window.vaaniProfile.validateUsername(input.value) : null;
      if (err) { hint.textContent = err; hint.className = "vg-field-hint vg-hint-error"; createBtn.disabled = true; }
      else     { hint.textContent = "✓ Username looks good"; hint.className = "vg-field-hint vg-hint-success"; createBtn.disabled = false; }
    }
    if (input) { input.addEventListener("input", validate); validate(); }

    if (createBtn) {
      createBtn.addEventListener("click", async function () {
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

  function _renderChat(user, profile) {
    var root = _root(); if (!root) return;
    _clearSearchState(); _injectMenu(user, profile);

    var photo    = user.photoURL || "";
    var initials = ((profile.username || "U").charAt(0) || "U").toUpperCase();

    root.innerHTML = '<section class="vc-shell" aria-label="Chat screen">' +
      '<button class="vc-avatar-btn" id="vcProfileBtn" aria-label="Open profile menu" title="Profile menu">' +
      (photo ? '<img src="' + _esc(photo) + '" alt="avatar" class="vc-avatar-img">'
             : '<span class="vc-avatar-initials">' + _esc(initials) + "</span>") + "</button>" +
      '<div class="vc-home-view" id="vcHomeScreen">' +
      '<div class="vc-search-wrap" id="vcSearchWrap">' +
      '<input id="vcUserSearchInput" class="vc-search-input" type="text" autocomplete="off" spellcheck="false" placeholder="Search users by username">' +
      '<div class="vc-search-dropdown" id="vcSearchDropdown"></div></div>' +
      '<div class="vc-requests-wrap">' +
      '<button class="vc-requests-toggle" id="vcRequestsToggle" type="button">Requests <span class="vc-requests-badge" id="vcRequestsBadge">0</span></button>' +
      '<div class="vc-requests-panel" id="vcRequestsPanel">' +
      '<div class="vc-requests-list" id="vcRequestsList"><div class="vc-requests-empty">No pending requests</div></div></div></div>' +
      '<div class="vc-chat-list" id="vcChatList"></div>' +
      '<div class="vc-chat-view-wrap" id="vcChatScreen" style="display:none;"></div></section>';

    var profileBtn = document.getElementById("vcProfileBtn");
    if (profileBtn) profileBtn.addEventListener("click", function () {
      if (typeof window._vaaniOpenProfileMenu === "function") window._vaaniOpenProfileMenu();
    });

    _bindUserSearch();
    _bindIncomingRequestActions();
    _renderSkeletonChatList();
    _fetchConnections(user.uid);
    _fetchIncomingRequests(user.uid);

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

  function _renderSkeletonChatList() {
    var listEl = document.getElementById("vcChatList");
    if (!listEl) return;
    var skeletonItems = [1, 2, 3].map(function () {
      return '<div class="vc-chat-list-item" style="pointer-events:none">' +
        '<div class="vc-chat-list-top">' +
        '<span class="vc-skeleton" style="width:120px;height:14px;border-radius:4px;background:var(--color-border-tertiary);display:inline-block"></span>' +
        '<span class="vc-skeleton" style="width:36px;height:10px;border-radius:4px;background:var(--color-border-tertiary);display:inline-block"></span>' +
        '</div>' +
        '<div class="vc-chat-list-last">' +
        '<span class="vc-skeleton" style="width:180px;height:10px;border-radius:4px;background:var(--color-border-tertiary);display:inline-block"></span>' +
        "</div></div>";
    }).join("");
    listEl.innerHTML = skeletonItems;
  }

  function _syncViewWithSelection() {
    var home = document.getElementById("vcHomeScreen");
    var chat = document.getElementById("vcChatScreen");
    if (!home || !chat) return;
    if (_selectedChatUser) { home.style.display = "none"; chat.style.display = "block"; }
    else { home.style.display = "block"; chat.style.display = "none"; chat.innerHTML = ""; }
    if (window.vaaniChat) window.vaaniChat._currentView = _selectedChatUser ? "chat" : "home";
  }

  function _setSelectedChatUser(user) {
    if (!user) {
      try {
        var cu = window._vaaniCurrentUser;
        if (cu && cu.uid) sessionStorage.removeItem("vaani_active_chat_" + cu.uid);
      } catch (e) {}
    }
    _selectedChatUser = user || null;
    if (!_selectedChatUser) {
      _activeChatId = null; _messages = []; _inputMessage = ""; _messagesContainerRef = null;
      _teardownMessageListener();
    }
    _syncViewWithSelection();
  }

  function _setMessages(nextMessages)  { _messages      = Array.isArray(nextMessages) ? nextMessages : []; }
  function _setInputMessage(nextValue) { _inputMessage  = String(nextValue || ""); }

  function _scrollMessagesToBottom() {
    if (!_messagesContainerRef) return;
    window.requestAnimationFrame(function () {
      if (_messagesContainerRef) _messagesContainerRef.scrollTop = _messagesContainerRef.scrollHeight;
    });
  }

  function _teardownMessageListener() {
    if (_unsubscribeMessages) { _unsubscribeMessages(); _unsubscribeMessages = null; }
    _activeMessageListenerKey = null; _activeMessagesSignature = ""; _optimisticMessages = [];
  }

  function _getUserProfileCached(db, uid) {
    if (!db || !uid) return Promise.resolve({ username: "user", photoURL: "" });
    if (_userProfileCache[uid]) return Promise.resolve(_userProfileCache[uid]);
    return db.collection("users").doc(uid).get()
      .then(function (doc) {
        var data = doc.exists ? (doc.data() || {}) : {};
        var profile = { username: data.username || "user", displayName: data.displayName || null, photoURL: data.photoURL || "" };
        _userProfileCache[uid] = profile; return profile;
      })
      .catch(function () {
        var fallback = { username: "user", displayName: null, photoURL: "" };
        _userProfileCache[uid] = fallback; return fallback;
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

    _unsubscribeConnections = db.collection(CONNECTIONS_COLLECTION)
      .where("users", "array-contains", currentUid)
      .onSnapshot(function (snapshot) {
        _connectedUidSet.clear();
        snapshot.forEach(function (doc) {
          (doc.data().users || []).forEach(function (uid) { if (uid && uid !== currentUid) _connectedUidSet.add(uid); });
        });
        var next = Array.from(_connectedUidSet).sort().join("|");
        var prev = _fetchConnections._lastSignature || "";
        _fetchConnections._lastSignature = next;
        console.log("[Vaani] connections updated —", _connectedUidSet.size, "connected");
        if (window.vaaniChat && window.vaaniChat._currentView === "home" && next !== prev) _renderChatList();
      }, function (err) { console.error("[Vaani] connections listener error:", err); _connectedUidSet.clear(); });
  }

  // ── FIX-C/D: _createChatListListener — always force render on live snapshot ──
  function _createChatListListener() {
    var db = window.vaaniRouter && typeof window.vaaniRouter.getDb === "function" ? window.vaaniRouter.getDb() : null;
    var currentUid = window._vaaniCurrentUser && window._vaaniCurrentUser.uid ? window._vaaniCurrentUser.uid : null;
    if (!db || !currentUid) return;
    if (_unsubscribeChatList && _activeChatListListenerUid === String(currentUid)) return;
    if (_unsubscribeChatList) { _unsubscribeChatList(); _unsubscribeChatList = null; }
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
          displayName: conversation.user && conversation.user.displayName ? conversation.user.displayName : "user",
          photoURL: conversation.user && conversation.user.photoURL ? conversation.user.photoURL : "",
          lastMessage: conversation.lastMessage || "",
          updatedAt: conversation.timestamp || null
        };
      });
      _forceRenderChatList = true;
      _renderChatList();
    }
    console.log("[Vaani] _createChatListListener: attaching for uid:", currentUid);

    _unsubscribeChatList = db.collection(CHATS_COLLECTION)
      .where("participants", "array-contains", currentUid)
      .orderBy("updatedAt", "desc")
      .limit(20)
      .onSnapshot(function (snapshot) {
        console.log("[Vaani] chat list snapshot:", snapshot.docs.length, "doc(s).");

        // Deduplicate: per otherUid, prefer the canonical sorted-pair ID doc
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
          else if (!candidate.isCanonical && prev.isCanonical) { /* keep prev */ }
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
              displayName: cachedProfile ? (cachedProfile.displayName || cachedProfile.username || "user") : "...",
              photoURL: cachedProfile ? (cachedProfile.photoURL || "") : ""
            },
            lastMessage: conv.lastMessage || "", timestamp: conv.timestamp || null
          };
        });

        conversations.sort(function (a, b) { return _timestampToMillis(b.timestamp) - _timestampToMillis(a.timestamp); });

        window.vaaniChat.conversations = conversations;
        window.vaaniChat._chatList = conversations.map(function (c) {
          return {
            chatId: c.chatId, otherUid: c.otherUid,
            username: c.user.username, displayName: c.user.displayName, photoURL: c.user.photoURL,
            lastMessage: c.lastMessage, updatedAt: c.timestamp || null
          };
        });

        // FIX-A: set _hasLoadedChatListOnce here but keep _chatListRenderedOnce
        // as a separate flag controlled inside _renderChatList.
        _hasLoadedChatListOnce = true;

        console.log("[Vaani] chat list: rendering", conversations.length, "conversation(s).");

        // FIX-D: always force-render on every live snapshot so the first
        // snapshot always wins regardless of cache signature match.
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
                displayName: profile.displayName || profile.username || "user",
                photoURL: profile.photoURL || ""
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
              displayName: c.user.displayName,
              photoURL: c.user.photoURL,
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

  // ── FIX-A/B/C/E: _renderChatList ────────────────────────────────────────
  // • Changed from `async function` to a plain synchronous function (FIX-E):
  //   the async keyword caused microtask-queue yielding on every call, which
  //   raced with subsequent calls and meant DOM writes happened out of order.
  // • Removed unused `db` and `currentUid` declarations (FIX-B): they made
  //   the function implicitly async-looking and shadowed outer-scope vars.
  // • Signature guard now uses `_chatListRenderedOnce` instead of
  //   `_hasLoadedChatListOnce` (FIX-A): _hasLoadedChatListOnce is set to
  //   true in the snapshot handler BEFORE _renderChatList is called, so the
  //   "first render" branch inside the old guard was unreachable on the very
  //   first live snapshot. _chatListRenderedOnce is only flipped to true
  //   inside _renderChatList after a successful DOM write.
  // • _forceRenderChatList bypasses the guard entirely (FIX-C).
  function _renderChatList() {
    var listEl = document.getElementById("vcChatList");
    if (!listEl) return;
    var hasSkeleton = !!listEl.querySelector(".vc-skeleton");

    var conversationsRaw = window.vaaniChat && Array.isArray(window.vaaniChat.conversations) ? window.vaaniChat.conversations : [];
    var conversations = conversationsRaw.filter(function (conversation) { return conversation != null; });

    console.log("[DEBUG] conversations:", conversations.length);
    console.log("[DEBUG] hasLoaded:", _hasLoadedChatListOnce);

    var items = conversations.map(function (conversation) {
      var safeConversation = conversation || {};
      var profile = safeConversation.user && typeof safeConversation.user === "object" ? safeConversation.user : {};
      return {
        chatId: safeConversation.chatId || null,
        otherUid: safeConversation.otherUid || null,
        username: profile.username || "user",
        displayName: profile.displayName || profile.username || "user",
        photoURL: profile.photoURL || "",
        lastMessage: safeConversation.lastMessage || "No messages yet",
        updatedAt: safeConversation.timestamp || null
      };
    });

    // Show empty state only after the first live snapshot has loaded.
    if (!items.length && _hasLoadedChatListOnce) {
      _forceRenderChatList = false;
      listEl.innerHTML = "";
      listEl.innerHTML = '<div class="vc-chat-list-empty">No chats yet</div>';
      _chatListRenderedOnce = true;
      return;
    }

    // If there are no items and we haven't loaded yet, keep skeleton visible
    // (if present) and wait for the first snapshot.
    if (!items.length) {
      return;
    }

    items.sort(function (a, b) {
      var aT = a.updatedAt && typeof a.updatedAt.toMillis === "function" ? a.updatedAt.toMillis() : 0;
      var bT = b.updatedAt && typeof b.updatedAt.toMillis === "function" ? b.updatedAt.toMillis() : 0;
      return bT - aT;
    });

    var nextSig = items.map(function (c) {
      return [c.chatId || "", c.otherUid || "", c.lastMessage || "",
        c.updatedAt && typeof c.updatedAt.toMillis === "function" ? c.updatedAt.toMillis() : ""].join(":");
    }).join("|");

    console.log("[DEBUG] signature:", nextSig);

    // FIX-C: _forceRenderChatList bypasses the duplicate-render guard entirely.
    // FIX-A: use _chatListRenderedOnce (flipped only after a real DOM write)
    //        instead of _hasLoadedChatListOnce (flipped before this function runs).
    if (!_forceRenderChatList && _chatListRenderedOnce && nextSig === _renderedChatListSignature && !hasSkeleton) {
      console.log("[DEBUG] skipping render — signature unchanged");
      return;
    }

    _forceRenderChatList = false;
    _renderedChatListSignature = nextSig;

    listEl.innerHTML = "";
    items.forEach(function (chat) {
      var item = document.createElement("button");
      item.type = "button"; item.className = "vc-chat-list-item";
      var timeText = "";
      if (chat.updatedAt && typeof chat.updatedAt.toDate === "function") {
        timeText = chat.updatedAt.toDate().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      }
      item.innerHTML =
        '<div class="vc-chat-list-top">' +
        '<span class="vc-chat-list-username">' + _esc(chat.displayName || chat.username || "user") + "</span>" +
        (timeText ? '<span class="vc-chat-list-time">' + _esc(timeText) + "</span>" : "") + "</div>" +
        '<div class="vc-chat-list-last">' + _esc(chat.lastMessage || "No messages yet") + "</div>";

      item.addEventListener("click", function () {
        if (!chat.otherUid) { console.error("[Vaani] Missing otherUid for chat list item"); return; }
        var openRequestId = ++_chatListOpenRequestId;
        var selectedUser = { uid: chat.otherUid, username: chat.username || "user", displayName: chat.displayName || chat.username || "user", photoURL: chat.photoURL || "" };
        Promise.resolve(chat.chatId || _getOrCreateChat(selectedUser.uid))
          .then(function (chatId) {
            if (!chatId) { console.error("[Vaani] Invalid chatId for chat list item"); return; }
            if (openRequestId !== _chatListOpenRequestId) return;
            _setSelectedChatUser(selectedUser);
            _openChatUI(chatId, selectedUser);
          })
          .catch(function (err) { console.error("[Vaani] Could not open chat list item:", err); });
      });
      listEl.appendChild(item);
    });

    // Mark that we have successfully written to the DOM at least once.
    _chatListRenderedOnce = true;
  }

  function _stopListening() {
    if (_unsubscribeIncomingRequests) { _unsubscribeIncomingRequests(); _unsubscribeIncomingRequests = null; }
    if (_unsubscribeConnections) { _unsubscribeConnections(); _unsubscribeConnections = null; _connectedUidSet.clear(); }
    _teardownMessageListener();
    if (_unsubscribeChatList) { _unsubscribeChatList(); _unsubscribeChatList = null; }
    _activeChatListListenerUid = null; _renderedChatListSignature = "";
    // FIX-A: also reset the render-once flag so re-opening the chat screen
    // renders correctly from a clean state.
    _chatListRenderedOnce = false;
    _hasLoadedChatListOnce = false;
    _createChatListListener._lastSignature = ""; _fetchConnections._lastSignature = "";
  }

  function _clearSearchState() {
    if (_searchDebounceTimer) { clearTimeout(_searchDebounceTimer); _searchDebounceTimer = null; }
    _latestSearchQuery = "";
    if (_outsideClickHandler) { document.removeEventListener("mousedown", _outsideClickHandler); _outsideClickHandler = null; }
  }

  function _isSearchItemDisabled(state, isSelf) { return isSelf || state === "requested" || state === "self"; }

  function _renderSearchResults(dropdown, list, stateByUid, currentUid) {
    if (!dropdown) return; dropdown.innerHTML = "";
    if (!list || !list.length) { dropdown.innerHTML = '<div class="vc-search-empty">No users found</div>'; dropdown.classList.add("vc-open"); return; }
    var visibleCount = 0;
    list.forEach(function (data) {
      var uid = data && data.uid ? data.uid : ""; if (!uid) return;
      var username = data.username || ""; if (!username) return;
      var name = data.name || username, photo = data.photoURL || "", initial = (username.charAt(0) || "U").toUpperCase();
      var state = stateByUid && uid ? stateByUid[uid] || "none" : "none", isSelf = uid === currentUid;
      var label, disabled;
      switch (state) {
        case "self": label = "(You)"; disabled = true; break;
        case "connected": label = "Message"; disabled = false; break;
        case "requested": label = "Requested"; disabled = true; break;
        case "incoming": label = "Accept"; disabled = false; break;
        default: label = "Connect"; disabled = false; break;
      }
      var itemEl = document.createElement("button");
      itemEl.className = "vc-search-item"; itemEl.type = "button";
      itemEl.setAttribute("data-uid", uid); itemEl.setAttribute("data-state", state);
      if (disabled) itemEl.disabled = true;
      itemEl.innerHTML = '<span class="vc-search-avatar">' +
        (photo ? '<img src="' + _esc(photo) + '" alt="' + _esc(username) + ' avatar">'
               : '<span class="vc-search-initial">' + _esc(initial) + "</span>") + "</span>" +
        '<span class="vc-search-meta"><span class="vc-search-username">@' + _esc(username) + "</span>" +
        '<span class="vc-search-name">' + _esc(name) + "</span></span>" +
        '<span class="vc-search-action" data-uid="' + _esc(uid) + '" data-state="' + _esc(state) + '">' + _esc(label) + "</span>";
      dropdown.appendChild(itemEl); visibleCount++;
    });
    if (!visibleCount) dropdown.innerHTML = '<div class="vc-search-empty">No users found</div>';
    dropdown.classList.add("vc-open");
  }

  function _setSearchItemState(dropdown, uid, state) {
    if (!dropdown || !uid) return;
    var itemEl   = dropdown.querySelector('.vc-search-item[data-uid="'   + uid + '"]');
    var actionEl = dropdown.querySelector('.vc-search-action[data-uid="' + uid + '"]');
    if (!actionEl || !itemEl) return;
    var labelMap = { self: "(You)", connected: "Message", requested: "Requested", incoming: "Accept", none: "Connect" };
    actionEl.textContent = labelMap[state] || "Connect";
    actionEl.setAttribute("data-state", state || "none"); itemEl.setAttribute("data-state", state || "none");
    var isSelf = window._vaaniCurrentUser && window._vaaniCurrentUser.uid === uid;
    itemEl.disabled = _isSearchItemDisabled(state, isSelf);
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
    targetUids.forEach(function (uid) { stateByUid[uid] = uid === currentUid ? "self" : "none"; });

    var results = await Promise.all([
      db.collection(REQUESTS_COLLECTION).where("fromUid", "==", currentUid).where("status", "==", "pending").limit(200).get(),
      db.collection(REQUESTS_COLLECTION).where("toUid",   "==", currentUid).where("status", "==", "pending").limit(200).get()
    ]).catch(function (err) { console.error("[Vaani] _buildSearchItemStates error:", err); return [null, null]; });

    var requestedSet = new Set(), incomingSet = new Set();
    if (results[0]) results[0].forEach(function (doc) { if (doc.data().toUid)   requestedSet.add(doc.data().toUid);   });
    if (results[1]) results[1].forEach(function (doc) { if (doc.data().fromUid) incomingSet.add(doc.data().fromUid); });

    targetUids.forEach(function (uid) {
      if (uid === currentUid)         { stateByUid[uid] = "self";      return; }
      if (_connectedUidSet.has(uid))  { stateByUid[uid] = "connected"; return; }
      if (requestedSet.has(uid))      { stateByUid[uid] = "requested"; return; }
      if (incomingSet.has(uid))       { stateByUid[uid] = "incoming";  return; }
      stateByUid[uid] = "none";
    });
    return stateByUid;
  }

  async function _sendConnectionRequest(db, fromUid, toUid) {
    await db.collection(REQUESTS_COLLECTION).add({ fromUid: fromUid, toUid: toUid, status: "pending", createdAt: firebase.firestore.FieldValue.serverTimestamp() });
  }

  async function _hasPendingConnectionRequest(db, fromUid, toUid) {
    var existing = await db.collection(REQUESTS_COLLECTION).where("fromUid", "==", fromUid).where("toUid", "==", toUid).where("status", "==", "pending").limit(1).get();
    return !existing.empty;
  }

  async function _createConnection(db, uidA, uidB) {
    if (await _isConnected(db, uidA, uidB)) return;
    await db.collection(CONNECTIONS_COLLECTION).add({ users: [uidA, uidB], createdAt: firebase.firestore.FieldValue.serverTimestamp() });
  }

  async function _acceptConnectionRequest(db, requestId, currentUid, fromUid) {
    if (!db || !requestId || !currentUid || !fromUid) { console.error("[Vaani] acceptConnectionRequest: missing params"); return; }
    try {
      if (await _isConnected(db, currentUid, fromUid)) {
        console.warn("[Vaani] acceptConnectionRequest: already connected");
        await db.collection(REQUESTS_COLLECTION).doc(requestId).delete(); return;
      }
      await db.collection(CONNECTIONS_COLLECTION).add({ users: [currentUid, fromUid], createdAt: firebase.firestore.FieldValue.serverTimestamp() });
      await db.collection(REQUESTS_COLLECTION).doc(requestId).delete();
      if (typeof window.showToast === "function") window.showToast("Connection accepted");
    } catch (err) { console.error("[Vaani] acceptConnectionRequest failed:", err); throw err; }
  }

  async function _rejectConnectionRequest(db, requestId) {
    if (!db || !requestId) { console.error("[Vaani] rejectConnectionRequest: missing params"); return; }
    try {
      await db.collection(REQUESTS_COLLECTION).doc(requestId).delete();
      if (typeof window.showToast === "function") window.showToast("Request rejected");
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
        '<button type="button" class="vc-mini-btn vc-reject-btn" data-request-id="' + _esc(r.id) + '">Reject</button></div></div>';
    }).join("");
  }

  async function _fetchIncomingRequests(currentUid) {
    var db = window.vaaniRouter && typeof window.vaaniRouter.getDb === "function" ? window.vaaniRouter.getDb() : null;
    if (!db || !currentUid) return;
    if (_unsubscribeIncomingRequests) { _unsubscribeIncomingRequests(); _unsubscribeIncomingRequests = null; }

    _unsubscribeIncomingRequests = db.collection(REQUESTS_COLLECTION)
      .where("toUid", "==", currentUid).where("status", "==", "pending").orderBy("createdAt", "desc")
      .onSnapshot(async function (snapshot) {
        var pending = [];
        for (var i = 0; i < snapshot.docs.length; i++) {
          var doc = snapshot.docs[i]; var data = doc.data() || {};
          if (!data.fromUid) continue;
          try {
            var fromProfile = await db.collection("users").doc(data.fromUid).get();
            var fromData = fromProfile.exists ? fromProfile.data() : {};
            pending.push({ id: doc.id, fromUid: data.fromUid || "", toUid: data.toUid || "", fromUsername: fromData.username || "user", fromName: fromData.name || "" });
          } catch (err) {
            console.error("[Vaani] Failed to load incoming request profile:", err);
            pending.push({ id: doc.id, fromUid: data.fromUid || "", toUid: data.toUid || "", fromUsername: "user", fromName: "" });
          }
        }
        incomingRequests = pending; _renderIncomingRequests(incomingRequests);
      }, function (err) { console.error("[Vaani] incoming requests listener error:", err); incomingRequests = []; _renderIncomingRequests([]); });
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
      try {
        if (acceptBtn) await _acceptConnectionRequest(db, requestId, currentUid, fromUid);
        else           await _rejectConnectionRequest(db, requestId);
      } catch (err) {
        console.error("[Vaani] request action failed:", err);
        actionBtn.disabled = false;
        if (typeof window.showToast === "function") window.showToast("Action failed — please try again");
      }
    });
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
        list.push({ uid: doc.id, username: data.username, name: data.name || "", photoURL: data.photoURL || "" });
      });
      if (query !== _latestSearchQuery) return;
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

    async function handleMessageClick(user) {
      try {
        var currentUser = window._vaaniCurrentUser || null;
        var db = window.vaaniRouter && typeof window.vaaniRouter.getDb === "function" ? window.vaaniRouter.getDb() : null;
        if (!currentUser || !user || !currentUser.uid || !user.uid || !db) { console.error("[Vaani] handleMessageClick: invalid params"); return; }
        var sortedPair = [String(currentUser.uid), String(user.uid)].sort();
        var chatId = sortedPair[0] + "_" + sortedPair[1];
        console.log("[Vaani] handleMessageClick: chatId =", chatId);
        await db.collection(CHATS_COLLECTION).doc(chatId).set({
          participants: sortedPair, createdAt: firebase.firestore.FieldValue.serverTimestamp(), updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        _activeChatId = chatId; _openChatUI(chatId, user);
      } catch (error) {
        console.error("[Vaani] handleMessageClick error:", error);
        if (typeof window.showToast === "function") window.showToast("Could not open chat — please try again");
      }
    }

    searchDropdown.addEventListener("click", async function (event) {
      var btn = event.target.closest(".vc-search-item"); if (!btn) return;
      var targetUid  = btn.getAttribute("data-uid") || "";
      var currentUid = window._vaaniCurrentUser && window._vaaniCurrentUser.uid ? window._vaaniCurrentUser.uid : "";
      if (!currentUid || !targetUid || currentUid === targetUid) return;
      var db = window.vaaniRouter && typeof window.vaaniRouter.getDb === "function" ? window.vaaniRouter.getDb() : null;
      if (!db) return;
      btn.disabled = true;
      try {
        var profile = await _fetchOtherProfile(db, targetUid); profile.uid = targetUid;
        closeDropdown(); await handleMessageClick(profile);
      } finally { btn.disabled = false; }
    });

    _outsideClickHandler = function (event) { if (!searchWrap.contains(event.target)) closeDropdown(); };
    document.addEventListener("mousedown", _outsideClickHandler);
  }

  async function _fetchOtherProfile(db, uid) {
    try { var doc = await db.collection("users").doc(uid).get(); if (doc.exists) return doc.data() || {}; }
    catch (err) { console.error("[Vaani] Failed to load user by uid:", err); }
    return {};
  }

  async function sendMessage(chatId, text, currentUid, otherUid) {
    var db = window.vaaniRouter && typeof window.vaaniRouter.getDb === "function" ? window.vaaniRouter.getDb() : null;
    if (!db || !chatId || !text || !currentUid || !otherUid) return;
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
    _renderMessages();

    inputEl.disabled = true; if (sendBtn) sendBtn.disabled = true;
    inputEl.value = ""; _setInputMessage("");

    try {
      await sendMessage(_activeChatId, inputMessage, currentUid, otherUid);
      console.log("[Vaani] _sendMessage: write succeeded");
    } catch (err) {
      _optimisticMessages = _optimisticMessages.filter(function (m) { return m._optimisticId !== tempId; });
      _setInputMessage(inputMessage); inputEl.value = inputMessage; _renderMessages();
      console.error("[Vaani] _sendMessage: write failed:", err);
      if (typeof window.showToast === "function") window.showToast("Message failed to send — please try again");
    } finally {
      inputEl.disabled = false; _setInputMessage(inputEl.value || "");
      if (sendBtn) sendBtn.disabled = !_inputMessage.trim(); inputEl.focus();
    }
  }

  function _renderMessages() {
    var container = _messagesContainerRef; if (!container) return;
    var currentUid = window._vaaniCurrentUser && window._vaaniCurrentUser.uid ? String(window._vaaniCurrentUser.uid) : "";
    container.innerHTML = "";
    var messages = (Array.isArray(_messages) ? _messages : []).concat(Array.isArray(_optimisticMessages) ? _optimisticMessages : []);
    if (!messages.length) {
      var emptyState = document.createElement("div");
      emptyState.className = "vc-chat-empty"; emptyState.textContent = "Start a conversation";
      container.appendChild(emptyState); _scrollMessagesToBottom(); return;
    }
    messages.forEach(function (msg) {
      var senderId = msg && msg.senderId != null ? String(msg.senderId) : "";
      var isOwn = senderId === currentUid;
      var row = document.createElement("div"); row.className = isOwn ? "vc-msg-row vc-msg-own" : "vc-msg-row vc-msg-other";
      var bubble = document.createElement("div"); bubble.className = "vc-msg-bubble"; bubble.textContent = String(msg.text || "");
      row.appendChild(bubble); container.appendChild(row);
    });
    _scrollMessagesToBottom();
  }

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

    var firstFire = true;
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

  function _openChatUI(chatId, user) {
    if (!chatId) { console.error("[Vaani] _openChatUI: chatId missing"); return; }

    if (_activeChatId && _activeChatId !== chatId) {
      console.log("[Vaani] _openChatUI: switching from", _activeChatId, "to", chatId);
      _teardownMessageListener();
    }

    _activeChatId     = chatId;
    _selectedChatUser = user || {};

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
    var avatarHTML = photo ? '<img src="' + _esc(photo) + '" alt="' + _esc(username) + ' avatar">'
                           : '<span class="vc-chat-initial">' + _esc(initial) + "</span>";
    var sendIconSVG = '<svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';
    var backIconSVG = '<svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>';

    chatScreen.innerHTML =
      '<div class="vc-chat-view">' +
        '<div class="vc-chat-header">' +
          '<button class="vc-back-btn" id="backBtn">' + backIconSVG + "</button>" +
          '<div class="vc-chat-avatar">' + avatarHTML + "</div>" +
          '<div class="vc-chat-hinfo"><div class="vc-chat-hname">@' + _esc(username) + "</div>" +
          '<div class="vc-chat-hsub">Connected</div></div></div>' +
        '<div class="vc-chat-messages" id="messagesContainer"></div>' +
        '<div class="vc-chat-input-bar">' +
          '<input id="messageInput" class="vc-chat-input" type="text" placeholder="Type a message..." autocomplete="off" spellcheck="false">' +
          '<button id="sendBtn" class="vc-chat-send" disabled aria-label="Send message">' + sendIconSVG + "</button>" +
        "</div></div>";

    _messagesContainerRef = document.getElementById("messagesContainer");
    _setMessages([]); _setInputMessage(""); _renderMessages();

    var home = document.getElementById("vcHomeScreen"), chat = document.getElementById("vcChatScreen");
    if (home) home.style.display = "none"; if (chat) chat.style.display = "block";
    if (window.vaaniChat) window.vaaniChat._currentView = "chat";
    _scrollMessagesToBottom();

    var backBtn = document.getElementById("backBtn");
    if (backBtn) backBtn.onclick = function () { _setSelectedChatUser(null); };

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
      messageInput.value = ""; messageInput.focus();
    }
    if (sendBtn) { sendBtn.addEventListener("click", function () { if (messageInput && messageInput.value.trim()) _sendMessage(); }); sendBtn.disabled = true; }
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

    close: function () { _stopListening(); _clearSearchState(); _removeMenu(); },

    _renderLogin:  _renderLogin,
    _renderProfile: _renderProfile,
    _renderChat:   _renderChat,
    _createChatListListener: _createChatListListener,
    loadUsers: function () { this.open(); }
  };

  console.log("[Vaani] chat.js v4.3 loaded ✓");
})();
