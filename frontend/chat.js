/* ================================================================
   Vaani — chat.js  v1.0
   Phase 1: Basic 1-to-1 Real-Time Chat

   ARCHITECTURE:
   ─────────────────────────────────────────────────────────────────
   Firestore collections:
     users/{uid}               — profile (name, email, photoURL, online)
     chats/{chatId}            — metadata (participants[], lastMessage, updatedAt)
     chats/{chatId}/messages/  — messages (senderId, text, timestamp, read)

   chatId convention: sorted uid1_uid2 (deterministic, no duplicates)

   FEATURES:
   ─────────────────────────────────────────────────────────────────
   ✔  loadUsers()              — fetch all users except self
   ✔  createOrGetChat()        — idempotent chat creation
   ✔  sendMessage()            — write to Firestore
   ✔  listenMessages()         — real-time onSnapshot listener
   ✔  listenChats()            — sidebar unread badge updates
   ✔  upsertUserProfile()      — create/update user doc on login
   ✔  markMessagesRead()       — clear unread count

   DEPENDENCIES:
   ─────────────────────────────────────────────────────────────────
   - chat-firebase.js must be loaded first (provides window.chatFirebase)
   - Fired after DOMContentLoaded
   - Zero dependencies on app.js internals

   DOES NOT:
   ─────────────────────────────────────────────────────────────────
   ✗  Touch any translation code
   ✗  Modify app.js, normalizer.js, or any existing file
   ✗  Use voice / media
================================================================ */

(function () {
  "use strict";

  // ── State ─────────────────────────────────────────────────────
  let _db              = null;
  let _currentUser     = null;
  let _activeChatId    = null;
  let _msgUnsubscribe  = null;   // cleanup fn for message listener
  let _chatUnsubscribe = null;   // cleanup fn for chat list listener
  let _users           = [];     // cached user list

  // ── DOM refs (resolved after DOMContentLoaded) ────────────────
  let $chatPage, $userList, $chatMessages, $chatInput,
      $chatSendBtn, $chatHeader, $chatEmpty, $chatPanel,
      $chatBadge, $chatNavBtn;

  // ══════════════════════════════════════════════════════════════
  // UTILS
  // ══════════════════════════════════════════════════════════════

  /** Deterministic chat ID: smaller uid always first */
  function _chatId(uid1, uid2) {
    return uid1 < uid2 ? `${uid1}_${uid2}` : `${uid2}_${uid1}`;
  }

  function _escapeHtml(str) {
    const d = document.createElement("div");
    d.appendChild(document.createTextNode(str));
    return d.innerHTML;
  }

  function _formatTime(ts) {
    if (!ts) return "";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    const isYesterday = new Date(now - 86400000).toDateString() === d.toDateString();
    if (isYesterday) return "Yesterday";
    return d.toLocaleDateString([], { day: "numeric", month: "short" });
  }

  function _timeAgo(ts) {
    if (!ts) return "";
    const d   = ts.toDate ? ts.toDate() : new Date(ts);
    const now = new Date();
    const diff = Math.floor((now - d) / 1000);
    if (diff < 60)  return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return d.toLocaleDateString([], { day: "numeric", month: "short" });
  }

  function _showToast(msg) {
    if (typeof window.showToast === "function") window.showToast(msg);
    else console.log("[Chat]", msg);
  }

  // ══════════════════════════════════════════════════════════════
  // FIRESTORE OPERATIONS
  // ══════════════════════════════════════════════════════════════

  /**
   * upsertUserProfile — create or update user doc in /users/{uid}
   * Called once after the user is authenticated.
   */
  async function upsertUserProfile(user) {
    if (!_db || !user) return;
    try {
      await _db.collection("users").doc(user.uid).set({
        uid:       user.uid,
        name:      user.displayName || user.email.split("@")[0],
        email:     user.email,
        photoURL:  user.photoURL   || "",
        online:    true,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      console.log("[Chat] User profile upserted:", user.uid);
    } catch (e) {
      console.warn("[Chat] upsertUserProfile:", e.message);
    }
  }

  /**
   * setOffline — mark user offline on sign-out / page unload
   */
  async function setOffline(uid) {
    if (!_db || !uid) return;
    try {
      await _db.collection("users").doc(uid).update({ online: false });
    } catch (_) {}
  }

  /**
   * loadUsers — fetch all users except the current user
   * Returns array and updates the sidebar.
   */
  async function loadUsers() {
    if (!_db || !_currentUser) return [];
    try {
      const snap = await _db.collection("users")
        .orderBy("name")
        .get();

      _users = snap.docs
        .map(d => d.data())
        .filter(u => u.uid !== _currentUser.uid);

      _renderUserList(_users);
      return _users;
    } catch (e) {
      console.warn("[Chat] loadUsers:", e.message);
      return [];
    }
  }

  /**
   * createOrGetChat — idempotent; returns chatId
   */
  async function createOrGetChat(otherUid) {
    if (!_db || !_currentUser) return null;
    const chatId = _chatId(_currentUser.uid, otherUid);
    const ref    = _db.collection("chats").doc(chatId);
    try {
      const snap = await ref.get();
      if (!snap.exists) {
        await ref.set({
          chatId,
          participants: [_currentUser.uid, otherUid],
          createdAt:    firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt:    firebase.firestore.FieldValue.serverTimestamp(),
          lastMessage:  "",
          lastSender:   "",
          unread:       { [_currentUser.uid]: 0, [otherUid]: 0 },
        });
        console.log("[Chat] New chat created:", chatId);
      }
      return chatId;
    } catch (e) {
      console.error("[Chat] createOrGetChat:", e.message);
      return null;
    }
  }

  /**
   * sendMessage — write message to Firestore
   */
  async function sendMessage(chatId, text) {
    if (!_db || !_currentUser || !chatId || !text.trim()) return;
    const trimmed = text.trim();

    // Optimistic UI clear
    if ($chatInput) $chatInput.value = "";
    _setSendBtnState(false);

    try {
      const batch = _db.batch();

      // 1. Write message
      const msgRef = _db
        .collection("chats").doc(chatId)
        .collection("messages").doc();

      batch.set(msgRef, {
        chatId,
        senderId:  _currentUser.uid,
        text:      trimmed,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        read:      false,
      });

      // 2. Update chat metadata (last message + bump unread for other user)
      const chatRef = _db.collection("chats").doc(chatId);
      const chatSnap = await chatRef.get();
      const participants = chatSnap.exists
        ? chatSnap.data().participants
        : [_currentUser.uid];
      const otherUid = participants.find(uid => uid !== _currentUser.uid);

      const unreadIncrement = firebase.firestore.FieldValue.increment(1);
      const unreadUpdate = otherUid
        ? { [`unread.${otherUid}`]: unreadIncrement }
        : {};

      batch.update(chatRef, {
        lastMessage: trimmed.length > 60 ? trimmed.slice(0, 60) + "…" : trimmed,
        lastSender:  _currentUser.uid,
        updatedAt:   firebase.firestore.FieldValue.serverTimestamp(),
        ...unreadUpdate,
      });

      await batch.commit();
    } catch (e) {
      console.error("[Chat] sendMessage:", e.message);
      _showToast("Failed to send message. Check your connection.");
      if ($chatInput) $chatInput.value = text; // restore
    }
  }

  /**
   * listenMessages — real-time message stream for a chat
   * Unsubscribes from any previous chat automatically.
   */
  function listenMessages(chatId) {
    if (_msgUnsubscribe) {
      _msgUnsubscribe();
      _msgUnsubscribe = null;
    }

    if (!_db || !chatId) return;

    _setMessagesLoading(true);

    _msgUnsubscribe = _db
      .collection("chats").doc(chatId)
      .collection("messages")
      .orderBy("timestamp", "asc")
      .onSnapshot(
        (snap) => {
          _setMessagesLoading(false);
          _renderMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
          markMessagesRead(chatId);
        },
        (err) => {
          _setMessagesLoading(false);
          console.error("[Chat] listenMessages:", err.message);
        }
      );
  }

  /**
   * listenChats — watch chat list for sidebar badge updates
   */
  function listenChats() {
    if (_chatUnsubscribe) {
      _chatUnsubscribe();
      _chatUnsubscribe = null;
    }
    if (!_db || !_currentUser) return;

    _chatUnsubscribe = _db
      .collection("chats")
      .where("participants", "array-contains", _currentUser.uid)
      .orderBy("updatedAt", "desc")
      .onSnapshot(
        (snap) => {
          const totalUnread = snap.docs.reduce((sum, d) => {
            const data = d.data();
            return sum + ((data.unread && data.unread[_currentUser.uid]) || 0);
          }, 0);
          _updateNavBadge(totalUnread);
          _updateUserListBadges(snap.docs.map(d => d.data()));
        },
        (err) => console.warn("[Chat] listenChats:", err.message)
      );
  }

  /**
   * markMessagesRead — reset unread counter for current user
   */
  async function markMessagesRead(chatId) {
    if (!_db || !_currentUser || !chatId) return;
    try {
      await _db.collection("chats").doc(chatId).update({
        [`unread.${_currentUser.uid}`]: 0,
      });
    } catch (_) {}
  }

  // ══════════════════════════════════════════════════════════════
  // UI RENDERING
  // ══════════════════════════════════════════════════════════════

  function _renderUserList(users) {
    if (!$userList) return;
    if (!users.length) {
      $userList.innerHTML = `
        <div class="vc-empty-list">
          <svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          <p>No other users yet.</p>
          <span>Sign in with another account to start chatting.</span>
        </div>`;
      return;
    }
    $userList.innerHTML = users.map(u => _userItemHtml(u)).join("");
    // Attach click handlers
    $userList.querySelectorAll(".vc-user-item").forEach(el => {
      el.addEventListener("click", () => _openChatWith(el.dataset.uid));
    });
  }

  function _userItemHtml(u) {
    const initials = _getInitials(u.name);
    const onlineDot = u.online
      ? `<span class="vc-online-dot" title="Online"></span>`
      : "";
    return `
      <div class="vc-user-item" data-uid="${u.uid}" id="vc-user-${u.uid}">
        <div class="vc-avatar" style="background:${_colorForUid(u.uid)}">
          ${u.photoURL
            ? `<img src="${_escapeHtml(u.photoURL)}" alt="" onerror="this.style.display='none'">`
            : initials}
          ${onlineDot}
        </div>
        <div class="vc-user-info">
          <div class="vc-user-name">${_escapeHtml(u.name)}</div>
          <div class="vc-user-email">${_escapeHtml(u.email)}</div>
        </div>
        <div class="vc-badge" id="vc-badge-${u.uid}" style="display:none">0</div>
      </div>`;
  }

  function _renderMessages(messages) {
    if (!$chatMessages) return;
    if (!messages.length) {
      $chatMessages.innerHTML = `
        <div class="vc-no-messages">
          <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <p>No messages yet. Say hi!</p>
        </div>`;
      return;
    }

    let html = "";
    let lastDate = "";

    messages.forEach(msg => {
      const isMe = msg.senderId === _currentUser.uid;
      const ts   = msg.timestamp;
      const date = ts ? (ts.toDate ? ts.toDate().toDateString() : new Date(ts).toDateString()) : "";

      if (date && date !== lastDate) {
        const label = _formatDateLabel(ts);
        html += `<div class="vc-date-sep"><span>${label}</span></div>`;
        lastDate = date;
      }

      html += `
        <div class="vc-msg ${isMe ? "vc-msg-me" : "vc-msg-them"}">
          <div class="vc-bubble">${_escapeHtml(msg.text)}</div>
          <div class="vc-msg-time">${_formatTime(ts)}</div>
        </div>`;
    });

    $chatMessages.innerHTML = html;
    $chatMessages.scrollTop = $chatMessages.scrollHeight;
  }

  function _updateNavBadge(count) {
    if (!$chatBadge) return;
    if (count > 0) {
      $chatBadge.textContent = count > 99 ? "99+" : count;
      $chatBadge.style.display = "flex";
    } else {
      $chatBadge.style.display = "none";
    }
  }

  function _updateUserListBadges(chats) {
    if (!_currentUser) return;
    chats.forEach(chat => {
      const unread = (chat.unread && chat.unread[_currentUser.uid]) || 0;
      const otherUid = (chat.participants || []).find(uid => uid !== _currentUser.uid);
      if (!otherUid) return;
      const badgeEl = document.getElementById(`vc-badge-${otherUid}`);
      if (!badgeEl) return;
      if (unread > 0 && _activeChatId !== _chatId(_currentUser.uid, otherUid)) {
        badgeEl.textContent = unread > 99 ? "99+" : unread;
        badgeEl.style.display = "flex";
      } else {
        badgeEl.style.display = "none";
      }
    });
  }

  function _setMessagesLoading(on) {
    if (!$chatMessages) return;
    if (on) {
      $chatMessages.innerHTML = `
        <div class="vc-loading">
          <div class="vc-spinner"></div>
          <span>Loading messages…</span>
        </div>`;
    }
  }

  function _setSendBtnState(enabled) {
    if (!$chatSendBtn) return;
    $chatSendBtn.disabled = !enabled;
  }

  function _updateChatHeader(otherUser) {
    if (!$chatHeader || !otherUser) return;
    const initials = _getInitials(otherUser.name);
    $chatHeader.innerHTML = `
      <button class="vc-back-btn" id="vcBackBtn" title="Back to list">
        <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <div class="vc-avatar vc-avatar-sm" style="background:${_colorForUid(otherUser.uid)}">
        ${otherUser.photoURL
          ? `<img src="${_escapeHtml(otherUser.photoURL)}" alt="" onerror="this.style.display='none'">`
          : initials}
        ${otherUser.online ? `<span class="vc-online-dot"></span>` : ""}
      </div>
      <div class="vc-header-info">
        <div class="vc-header-name">${_escapeHtml(otherUser.name)}</div>
        <div class="vc-header-status">${otherUser.online ? "Online" : "Offline"}</div>
      </div>`;

    document.getElementById("vcBackBtn")?.addEventListener("click", _closeActiveChat);
  }

  // ── Helpers ───────────────────────────────────────────────────

  function _getInitials(name) {
    if (!name) return "?";
    return name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
  }

  /** Deterministic pastel-ish color from uid */
  function _colorForUid(uid) {
    const colors = [
      "#7c3aed","#2563eb","#0891b2","#059669","#d97706",
      "#dc2626","#db2777","#7c3aed","#4f46e5","#0f766e",
    ];
    let hash = 0;
    for (let i = 0; i < uid.length; i++) hash = uid.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  }

  function _formatDateLabel(ts) {
    if (!ts) return "";
    const d   = ts.toDate ? ts.toDate() : new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return "Today";
    const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
    return d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
  }

  // ══════════════════════════════════════════════════════════════
  // INTERACTION HANDLERS
  // ══════════════════════════════════════════════════════════════

  async function _openChatWith(otherUid) {
    if (!_currentUser || !otherUid) return;

    const otherUser = _users.find(u => u.uid === otherUid);
    if (!otherUser) return;

    // Highlight selected user
    document.querySelectorAll(".vc-user-item").forEach(el =>
      el.classList.toggle("vc-active", el.dataset.uid === otherUid)
    );

    _updateChatHeader(otherUser);

    const chatId = await createOrGetChat(otherUid);
    if (!chatId) {
      _showToast("Couldn't open chat. Try again.");
      return;
    }

    _activeChatId = chatId;

    // Show chat panel (mobile: hide user list)
    if ($chatPanel) $chatPanel.classList.add("vc-panel-active");
    if ($chatEmpty) $chatEmpty.style.display = "none";

    listenMessages(chatId);

    // Focus input
    setTimeout(() => $chatInput?.focus(), 100);
  }

  function _closeActiveChat() {
    if (_msgUnsubscribe) { _msgUnsubscribe(); _msgUnsubscribe = null; }
    _activeChatId = null;
    if ($chatPanel) $chatPanel.classList.remove("vc-panel-active");
    document.querySelectorAll(".vc-user-item").forEach(el =>
      el.classList.remove("vc-active")
    );
  }

  function _handleSend() {
    const text = $chatInput?.value?.trim();
    if (!text || !_activeChatId) return;
    sendMessage(_activeChatId, text);
  }

  // ══════════════════════════════════════════════════════════════
  // NAVIGATION INTEGRATION (no-break with existing navigateTo)
  // ══════════════════════════════════════════════════════════════

  function _showChatPage() {
    // Use Vaani's existing page system if available
    if (typeof navigateTo === "function") {
      navigateTo("Chat");
    } else {
      document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
      const pg = document.getElementById("pageChat");
      if (pg) pg.classList.add("active");
    }
    // Refresh user list every time the page opens
    loadUsers();
  }

  // ══════════════════════════════════════════════════════════════
  // INIT
  // ══════════════════════════════════════════════════════════════

  function _resolveDOM() {
    $chatPage      = document.getElementById("pageChat");
    $userList      = document.getElementById("vcUserList");
    $chatMessages  = document.getElementById("vcMessages");
    $chatInput     = document.getElementById("vcInput");
    $chatSendBtn   = document.getElementById("vcSendBtn");
    $chatHeader    = document.getElementById("vcChatHeader");
    $chatEmpty     = document.getElementById("vcEmpty");
    $chatPanel     = document.getElementById("vcChatPanel");
    $chatBadge     = document.getElementById("chatNavBadge");
    $chatNavBtn    = document.getElementById("menuChat");
  }

  function _bindEvents() {
    // Send on button click
    $chatSendBtn?.addEventListener("click", _handleSend);

    // Send on Enter (Shift+Enter = newline in textarea)
    $chatInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        _handleSend();
      }
    });

    // Enable/disable send button based on input
    $chatInput?.addEventListener("input", () => {
      _setSendBtnState(!!$chatInput.value.trim() && !!_activeChatId);
    });

    // Nav button
    $chatNavBtn?.addEventListener("click", _showChatPage);
    document.getElementById("vcNavBtn")?.addEventListener("click", _showChatPage);
  }

  function _onAuthReady(user) {
    _currentUser = user;

    if (!user) {
      // Signed out: cleanup listeners
      if (_msgUnsubscribe)  { _msgUnsubscribe();  _msgUnsubscribe  = null; }
      if (_chatUnsubscribe) { _chatUnsubscribe(); _chatUnsubscribe = null; }
      _activeChatId = null;
      if ($userList) {
        $userList.innerHTML = `
          <div class="vc-empty-list">
            <svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            <p>Sign in to chat</p>
            <span>Use the Sign In button in the menu.</span>
          </div>`;
      }
      return;
    }

    // Signed in
    upsertUserProfile(user).then(() => {
      loadUsers();
      listenChats();
    });

    // Mark offline on page hide / unload
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") setOffline(user.uid);
      if (document.visibilityState === "visible") upsertUserProfile(user);
    });
    window.addEventListener("beforeunload", () => setOffline(user.uid));
  }

  function _waitForFirebase(cb, tries = 0) {
    if (window.chatFirebase && window.chatFirebase.db) {
      cb();
    } else if (tries < 30) {
      setTimeout(() => _waitForFirebase(cb, tries + 1), 200);
    } else {
      console.error("[Chat] Timed out waiting for chatFirebase.");
    }
  }

  function _init() {
    _resolveDOM();
    if (!$chatPage) {
      console.warn("[Chat] #pageChat not found in DOM. Was chat.html.snippet injected?");
      return;
    }

    _waitForFirebase(() => {
      _db = window.chatFirebase.db;
      _bindEvents();

      // Hook into Vaani's auth system
      // window._vaaniOnAuthChange is called by firebase.js (existing) on every auth state change
      const _origAuthChange = window._vaaniOnAuthChange;
      window._vaaniOnAuthChange = function (user) {
        if (typeof _origAuthChange === "function") _origAuthChange(user);
        _onAuthReady(user);
      };

      // If auth already resolved before chat.js loaded
      if (window.VAANI_AUTH_READY) {
        _onAuthReady(window._vaaniCurrentUser || null);
      }

      console.log("[Chat] Initialized ✓");
    });
  }

  // ── Public API (for debugging / Phase 2 use) ──────────────────
  window.vaaniChat = {
    sendMessage,
    createOrGetChat,
    loadUsers,
    listenMessages,
    markMessagesRead,
    openChatWith: _openChatWith,
    getCurrentUser: () => _currentUser,
    getActiveChatId: () => _activeChatId,
  };

  // ── Boot ──────────────────────────────────────────────────────
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", _init);
  } else {
    _init();
  }

})();
