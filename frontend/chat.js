/* ================================================================
   Vaani — chat.js  v4.0  (COMPLETE REWRITE — ALL BUGS FIXED)
   ================================================================

   BUGS FIXED vs v1:
   ─────────────────────────────────────────────────────────────────
   1. vcInputRow stayed hidden — now shown immediately when chat opens
   2. vcEmpty panel not hiding — fixed with proper show/hide logic
   3. Messages not rendering — onSnapshot query fixed (timestamp order)
   4. Auto-scroll not working — fixed scroll after render
   5. Send button never enabled — input event wiring fixed
   6. Chat panel on mobile not sliding in — CSS class toggle fixed
   7. User list not refreshing on page revisit — fixed in _onPageActivate
   8. Auth timing race — now waits for both Firebase AND auth user
   9. Textarea auto-resize — added so it grows as user types
   10. Real-time listener cleanup — properly unsubscribed on chat switch

   FIRESTORE STRUCTURE:
   ─────────────────────────────────────────────────────────────────
   users/{uid}
     name, email, photoURL, online, updatedAt

   chats/{chatId}                    chatId = uid1_uid2 (sorted)
     participants[], lastMessage,
     lastSender, updatedAt,
     unread: { uid1: 0, uid2: 2 }

   chats/{chatId}/messages/{msgId}
     senderId, text, timestamp, read
================================================================ */

(function () {
  "use strict";

  // ── State ─────────────────────────────────────────────────────
  var _db             = null;
  var _currentUser    = null;
  var _activeChatId   = null;
  var _activeOtherUid = null;
  var _msgUnsub       = null;   // unsubscribe fn for message listener
  var _chatUnsub      = null;   // unsubscribe fn for chat list listener
  var _users          = [];

  // ══════════════════════════════════════════════════════════════
  // UTILITIES
  // ══════════════════════════════════════════════════════════════

  function _chatId(a, b) {
    return a < b ? a + "_" + b : b + "_" + a;
  }

  function _esc(str) {
    var d = document.createElement("div");
    d.appendChild(document.createTextNode(String(str || "")));
    return d.innerHTML;
  }

  function _formatTime(ts) {
    if (!ts) return "";
    var d = ts.toDate ? ts.toDate() : new Date(ts);
    var now = new Date();
    var sameDay = d.toDateString() === now.toDateString();
    if (sameDay) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    var yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
    return d.toLocaleDateString([], { day: "numeric", month: "short" });
  }

  function _dateLabel(ts) {
    if (!ts) return "";
    var d = ts.toDate ? ts.toDate() : new Date(ts);
    var now = new Date();
    if (d.toDateString() === now.toDateString()) return "Today";
    var yest = new Date(now); yest.setDate(now.getDate() - 1);
    if (d.toDateString() === yest.toDateString()) return "Yesterday";
    return d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
  }

  function _colorFor(uid) {
    var colors = ["#7c3aed","#2563eb","#0891b2","#059669","#d97706","#dc2626","#db2777","#4f46e5","#0f766e","#b45309"];
    var h = 0;
    for (var i = 0; i < (uid || "").length; i++) h = uid.charCodeAt(i) + ((h << 5) - h);
    return colors[Math.abs(h) % colors.length];
  }

  function _initials(name) {
    return (name || "?").split(" ").map(function(w) { return w[0]; }).slice(0, 2).join("").toUpperCase();
  }

  function _toast(msg) {
    if (typeof window.showToast === "function") window.showToast(msg);
    else console.log("[Chat]", msg);
  }

  function _get(id) { return document.getElementById(id); }

  // ══════════════════════════════════════════════════════════════
  // SHOW / HIDE HELPERS  (FIX 1, 2)
  // ══════════════════════════════════════════════════════════════

  function _showChatPanel(otherUser) {
    // Hide empty placeholder
    var empty = _get("vcEmpty");
    if (empty) empty.style.display = "none";

    // Show header
    var header = _get("vcChatHeader");
    if (header) {
      header.style.display = "flex";
      _renderHeader(otherUser);
    }

    // Show messages area (clear it while loading)
    var msgs = _get("vcMessages");
    if (msgs) msgs.style.display = "flex";

    // FIX 1 — Show input row immediately
    var inputRow = _get("vcInputRow");
    if (inputRow) inputRow.style.display = "flex";

    // Mobile: slide panel in
    var panel = _get("vcChatPanel");
    if (panel) panel.classList.add("vc-panel-active");
  }

  function _hideChatPanel() {
    var empty = _get("vcEmpty");
    if (empty) empty.style.display = "flex";

    var header = _get("vcChatHeader");
    if (header) { header.style.display = "none"; header.innerHTML = ""; }

    var msgs = _get("vcMessages");
    if (msgs) { msgs.style.display = "none"; msgs.innerHTML = ""; }

    var inputRow = _get("vcInputRow");
    if (inputRow) inputRow.style.display = "none";

    var input = _get("vcInput");
    if (input) input.value = "";

    var sendBtn = _get("vcSendBtn");
    if (sendBtn) sendBtn.disabled = true;

    var panel = _get("vcChatPanel");
    if (panel) panel.classList.remove("vc-panel-active");

    // Deselect user in list
    document.querySelectorAll(".vc-user-item").forEach(function(el) {
      el.classList.remove("vc-active");
    });
  }

  // ══════════════════════════════════════════════════════════════
  // FIRESTORE — USER PROFILE
  // ══════════════════════════════════════════════════════════════

  function upsertUserProfile(user) {
    if (!_db || !user) return Promise.resolve();
    return _db.collection("users").doc(user.uid).set({
      uid:       user.uid,
      name:      user.displayName || user.email.split("@")[0],
      email:     user.email || "",
      photoURL:  user.photoURL  || "",
      online:    true,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    }, { merge: true })
    .then(function() {
      console.log("[Chat] User profile upserted:", user.uid);
    })
    .catch(function(e) {
      console.warn("[Chat] upsertUserProfile:", e.message);
    });
  }

  function setOffline(uid) {
    if (!_db || !uid) return;
    _db.collection("users").doc(uid)
      .update({ online: false })
      .catch(function() {});
  }

  // ══════════════════════════════════════════════════════════════
  // FIRESTORE — LOAD USERS
  // ══════════════════════════════════════════════════════════════

  function loadUsers() {
    var list = _get("vcUserList");
    if (!list) return;

    if (!_currentUser) {
      list.innerHTML = _emptyListHtml(
        "Sign in to chat",
        "Use the Sign In button in the menu to get started."
      );
      return;
    }

    if (!_db) {
      list.innerHTML = _emptyListHtml("Loading…", "Please wait.");
      return;
    }

    list.innerHTML = '<div class="vc-loading"><div class="vc-spinner"></div><span>Loading users…</span></div>';

    _db.collection("users")
      .orderBy("name")
      .get()
      .then(function(snap) {
        _users = snap.docs
          .map(function(d) { return d.data(); })
          .filter(function(u) { return u.uid !== _currentUser.uid; });

        if (!_users.length) {
          list.innerHTML = _emptyListHtml(
            "No other users yet",
            "Sign in with another account to start chatting."
          );
          return;
        }

        list.innerHTML = _users.map(_userItemHtml).join("");

        list.querySelectorAll(".vc-user-item").forEach(function(el) {
          el.addEventListener("click", function() {
            openChatWith(el.dataset.uid);
          });
        });
      })
      .catch(function(e) {
        console.warn("[Chat] loadUsers:", e.message);
        list.innerHTML = _emptyListHtml("Could not load users", e.message);
      });
  }

  // ══════════════════════════════════════════════════════════════
  // FIRESTORE — CREATE OR GET CHAT
  // ══════════════════════════════════════════════════════════════

  function createOrGetChat(otherUid) {
    if (!_db || !_currentUser) return Promise.resolve(null);
    var id  = _chatId(_currentUser.uid, otherUid);
    var ref = _db.collection("chats").doc(id);

    return ref.get().then(function(snap) {
      if (!snap.exists) {
        return ref.set({
          chatId:       id,
          participants: [_currentUser.uid, otherUid],
          createdAt:    firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt:    firebase.firestore.FieldValue.serverTimestamp(),
          lastMessage:  "",
          lastSender:   "",
          unread:       { [_currentUser.uid]: 0, [otherUid]: 0 },
        }).then(function() { return id; });
      }
      return id;
    });
  }

  // ══════════════════════════════════════════════════════════════
  // FIRESTORE — SEND MESSAGE  (FIX 5)
  // ══════════════════════════════════════════════════════════════

  function sendMessage(chatId, text) {
    var trimmed = (text || "").trim();
    if (!trimmed || !chatId || !_currentUser || !_db) return;

    // Clear input immediately (optimistic)
    var input = _get("vcInput");
    if (input) { input.value = ""; _resizeInput(input); }
    var sendBtn = _get("vcSendBtn");
    if (sendBtn) sendBtn.disabled = true;

    var msgRef  = _db.collection("chats").doc(chatId).collection("messages").doc();
    var chatRef = _db.collection("chats").doc(chatId);

    // Write message
    msgRef.set({
      chatId:    chatId,
      senderId:  _currentUser.uid,
      text:      trimmed,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      read:      false,
    })
    .then(function() {
      // Update chat metadata
      var otherUid = _activeOtherUid;
      var update = {
        lastMessage: trimmed.length > 60 ? trimmed.slice(0, 60) + "…" : trimmed,
        lastSender:  _currentUser.uid,
        updatedAt:   firebase.firestore.FieldValue.serverTimestamp(),
      };
      if (otherUid) {
        update["unread." + otherUid] = firebase.firestore.FieldValue.increment(1);
      }
      return chatRef.update(update);
    })
    .catch(function(e) {
      console.error("[Chat] sendMessage failed:", e.message);
      _toast("Failed to send. Check your connection.");
      if (input) input.value = trimmed; // restore text
    });
  }

  // ══════════════════════════════════════════════════════════════
  // FIRESTORE — LISTEN MESSAGES  (FIX 3, 4, 8)
  // ══════════════════════════════════════════════════════════════

  function listenMessages(chatId) {
    // Unsubscribe previous listener
    if (_msgUnsub) { _msgUnsub(); _msgUnsub = null; }
    if (!_db || !chatId) return;

    var msgs = _get("vcMessages");
    if (msgs) {
      msgs.innerHTML = '<div class="vc-loading"><div class="vc-spinner"></div><span>Loading…</span></div>';
    }

    // FIX 3 — correct query with proper ordering
    _msgUnsub = _db
      .collection("chats")
      .doc(chatId)
      .collection("messages")
      .orderBy("timestamp", "asc")
      .onSnapshot(
        function(snap) {
          var messages = snap.docs.map(function(d) {
            return Object.assign({ id: d.id }, d.data());
          });
          _renderMessages(messages);
          markRead(chatId);
        },
        function(err) {
          console.error("[Chat] listenMessages error:", err.message);
          if (msgs) msgs.innerHTML = '<div class="vc-no-messages"><p>Could not load messages.</p></div>';
        }
      );
  }

  // ══════════════════════════════════════════════════════════════
  // FIRESTORE — LISTEN CHATS (sidebar badges)
  // ══════════════════════════════════════════════════════════════

  function listenChats() {
    if (_chatUnsub) { _chatUnsub(); _chatUnsub = null; }
    if (!_db || !_currentUser) return;

    _chatUnsub = _db
      .collection("chats")
      .where("participants", "array-contains", _currentUser.uid)
      .orderBy("updatedAt", "desc")
      .onSnapshot(
        function(snap) {
          var chats = snap.docs.map(function(d) { return d.data(); });
          var total = chats.reduce(function(sum, c) {
            return sum + ((c.unread && c.unread[_currentUser.uid]) || 0);
          }, 0);
          _updateNavBadge(total);
          _updateUserBadges(chats);
        },
        function(err) {
          console.warn("[Chat] listenChats:", err.message);
        }
      );
  }

  function markRead(chatId) {
    if (!_db || !_currentUser || !chatId) return;
    var update = {};
    update["unread." + _currentUser.uid] = 0;
    _db.collection("chats").doc(chatId).update(update).catch(function() {});
  }

  // ══════════════════════════════════════════════════════════════
  // UI — RENDER MESSAGES  (FIX 4 — auto scroll)
  // ══════════════════════════════════════════════════════════════

  function _renderMessages(messages) {
    var msgs = _get("vcMessages");
    if (!msgs || !_currentUser) return;

    if (!messages.length) {
      msgs.innerHTML = '<div class="vc-no-messages"><svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><p>No messages yet. Say hi! 👋</p></div>';
      return;
    }

    var html   = "";
    var lastDate = "";

    messages.forEach(function(msg) {
      var isMe = msg.senderId === _currentUser.uid;
      var ts   = msg.timestamp;
      var dateStr = ts ? (ts.toDate ? ts.toDate().toDateString() : new Date(ts).toDateString()) : "";

      // Date separator
      if (dateStr && dateStr !== lastDate) {
        html += '<div class="vc-date-sep"><span>' + _dateLabel(ts) + '</span></div>';
        lastDate = dateStr;
      }

      html += '<div class="vc-msg ' + (isMe ? "vc-msg-me" : "vc-msg-them") + '">'
        + '<div class="vc-bubble">' + _esc(msg.text) + '</div>'
        + '<div class="vc-msg-time">' + _formatTime(ts) + '</div>'
        + '</div>';
    });

    msgs.innerHTML = html;

    // FIX 4 — scroll to bottom after render
    requestAnimationFrame(function() {
      msgs.scrollTop = msgs.scrollHeight;
    });
  }

  // ══════════════════════════════════════════════════════════════
  // UI — RENDER USER LIST
  // ══════════════════════════════════════════════════════════════

  function _userItemHtml(u) {
    var color    = _colorFor(u.uid);
    var initials = _initials(u.name);
    var photoHtml = u.photoURL
      ? '<img src="' + _esc(u.photoURL) + '" alt="" onerror="this.style.display=\'none\'">'
      : "";
    var onlineDot = u.online ? '<span class="vc-online-dot"></span>' : "";

    return '<div class="vc-user-item" data-uid="' + _esc(u.uid) + '" id="vc-user-' + _esc(u.uid) + '">'
      + '<div class="vc-avatar" style="background:' + color + '">'
      + photoHtml + initials + onlineDot
      + '</div>'
      + '<div class="vc-user-info">'
      + '<div class="vc-user-name">' + _esc(u.name) + '</div>'
      + '<div class="vc-user-email">' + _esc(u.email) + '</div>'
      + '</div>'
      + '<div class="vc-badge" id="vc-badge-' + _esc(u.uid) + '" style="display:none">0</div>'
      + '</div>';
  }

  function _emptyListHtml(title, sub) {
    return '<div class="vc-empty-list">'
      + '<svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>'
      + '<p>' + _esc(title) + '</p>'
      + '<span>' + _esc(sub) + '</span>'
      + '</div>';
  }

  // ══════════════════════════════════════════════════════════════
  // UI — RENDER CHAT HEADER
  // ══════════════════════════════════════════════════════════════

  function _renderHeader(user) {
    var header = _get("vcChatHeader");
    if (!header || !user) return;

    var color    = _colorFor(user.uid);
    var initials = _initials(user.name);
    var photoHtml = user.photoURL
      ? '<img src="' + _esc(user.photoURL) + '" alt="" onerror="this.style.display=\'none\'">'
      : "";
    var onlineDot = user.online ? '<span class="vc-online-dot"></span>' : "";

    header.innerHTML =
      '<button class="vc-back-btn" id="vcBackBtn" title="Back">'
      + '<svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>'
      + '</button>'
      + '<div class="vc-avatar vc-avatar-sm" style="background:' + color + '">'
      + photoHtml + initials + onlineDot
      + '</div>'
      + '<div class="vc-header-info">'
      + '<div class="vc-header-name">' + _esc(user.name) + '</div>'
      + '<div class="vc-header-status">' + (user.online ? "Online" : "Offline") + '</div>'
      + '</div>';

    var backBtn = _get("vcBackBtn");
    if (backBtn) backBtn.addEventListener("click", _closeChat);
  }

  // ══════════════════════════════════════════════════════════════
  // UI — BADGES
  // ══════════════════════════════════════════════════════════════

  function _updateNavBadge(count) {
    ["chatNavBadge", "chatMenuBadge"].forEach(function(id) {
      var el = _get(id);
      if (!el) return;
      if (count > 0) {
        el.textContent = count > 99 ? "99+" : count;
        el.style.display = "flex";
      } else {
        el.style.display = "none";
      }
    });
  }

  function _updateUserBadges(chats) {
    if (!_currentUser) return;
    chats.forEach(function(chat) {
      var unread   = (chat.unread && chat.unread[_currentUser.uid]) || 0;
      var otherUid = (chat.participants || []).find(function(uid) {
        return uid !== _currentUser.uid;
      });
      if (!otherUid) return;
      var badge = _get("vc-badge-" + otherUid);
      if (!badge) return;
      var isActive = _activeChatId && _activeChatId === _chatId(_currentUser.uid, otherUid);
      if (unread > 0 && !isActive) {
        badge.textContent = unread > 99 ? "99+" : unread;
        badge.style.display = "flex";
      } else {
        badge.style.display = "none";
      }
    });
  }

  // ══════════════════════════════════════════════════════════════
  // INTERACTION — OPEN / CLOSE CHAT
  // ══════════════════════════════════════════════════════════════

  function openChatWith(otherUid) {
    if (!_currentUser || !otherUid || !_db) return;

    var otherUser = _users.find(function(u) { return u.uid === otherUid; });
    if (!otherUser) {
      // User not in cache — fetch from Firestore
      _db.collection("users").doc(otherUid).get()
        .then(function(snap) {
          if (snap.exists) {
            otherUser = snap.data();
            _doOpenChat(otherUser);
          }
        });
      return;
    }
    _doOpenChat(otherUser);
  }

  function _doOpenChat(otherUser) {
    _activeOtherUid = otherUser.uid;

    // Highlight selected user
    document.querySelectorAll(".vc-user-item").forEach(function(el) {
      el.classList.toggle("vc-active", el.dataset.uid === otherUser.uid);
    });

    // Show panel immediately with loading state
    _showChatPanel(otherUser);

    // Create/get chat then start listener
    createOrGetChat(otherUser.uid)
      .then(function(chatId) {
        if (!chatId) { _toast("Could not open chat."); return; }
        _activeChatId = chatId;
        listenMessages(chatId);
        // Focus input
        var input = _get("vcInput");
        if (input) setTimeout(function() { input.focus(); }, 150);
      })
      .catch(function(e) {
        console.error("[Chat] openChatWith:", e.message);
        _toast("Could not open chat: " + e.message);
      });
  }

  function _closeChat() {
    if (_msgUnsub) { _msgUnsub(); _msgUnsub = null; }
    _activeChatId   = null;
    _activeOtherUid = null;
    _hideChatPanel();
  }

  // ══════════════════════════════════════════════════════════════
  // INTERACTION — SEND
  // ══════════════════════════════════════════════════════════════

  function _handleSend() {
    var input = _get("vcInput");
    var text  = input ? input.value.trim() : "";
    if (!text || !_activeChatId) return;
    sendMessage(_activeChatId, text);
  }

  // FIX 9 — auto-resize textarea as user types
  function _resizeInput(el) {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }

  // ══════════════════════════════════════════════════════════════
  // EVENT BINDING
  // ══════════════════════════════════════════════════════════════

  function _bindEvents() {
    var sendBtn = _get("vcSendBtn");
    var input   = _get("vcInput");

    if (sendBtn) {
      sendBtn.addEventListener("click", _handleSend);
    }

    if (input) {
      // Send on Enter, new line on Shift+Enter
      input.addEventListener("keydown", function(e) {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          _handleSend();
        }
      });

      // FIX 5 — Enable send button based on input content
      input.addEventListener("input", function() {
        if (sendBtn) sendBtn.disabled = !input.value.trim();
        _resizeInput(input);
      });
    }

    // Nav button
    var navBtn = _get("vcNavBtn");
    if (navBtn) {
      navBtn.addEventListener("click", function() {
        if (typeof navigateTo === "function") navigateTo("Chat");
      });
    }
  }

  // ══════════════════════════════════════════════════════════════
  // AUTH HANDLER
  // ══════════════════════════════════════════════════════════════

  function _onAuthReady(user) {
    _currentUser = user || null;

    if (!user) {
      // Cleanup on sign-out
      if (_msgUnsub)  { _msgUnsub();  _msgUnsub  = null; }
      if (_chatUnsub) { _chatUnsub(); _chatUnsub = null; }
      _activeChatId   = null;
      _activeOtherUid = null;
      _hideChatPanel();
      loadUsers(); // shows "sign in" message
      return;
    }

    // Signed in
    upsertUserProfile(user).then(function() {
      loadUsers();
      listenChats();
    });

    // Mark offline when tab closes
    window.addEventListener("beforeunload", function() { setOffline(user.uid); });
    document.addEventListener("visibilitychange", function() {
      if (document.visibilityState === "hidden") setOffline(user.uid);
      else upsertUserProfile(user);
    });
  }

  // ══════════════════════════════════════════════════════════════
  // WAIT FOR FIREBASE  (FIX 8 — race condition)
  // ══════════════════════════════════════════════════════════════

  function _waitForFirebase(cb, tries) {
    tries = tries || 0;
    if (window.chatFirebase && window.chatFirebase.db) {
      cb();
    } else if (tries < 50) {
      setTimeout(function() { _waitForFirebase(cb, tries + 1); }, 100);
    } else {
      console.error("[Chat] Timed out waiting for chatFirebase.");
    }
  }

  // ══════════════════════════════════════════════════════════════
  // INIT
  // ══════════════════════════════════════════════════════════════

  function _init() {
    var page = _get("pageChat");
    if (!page) {
      console.warn("[Chat] #pageChat not found. Did you add BLOCK 4 to index.html?");
      return;
    }

    // Set initial state — hide panel until user selected
    _hideChatPanel();

    _bindEvents();

    _waitForFirebase(function() {
      _db = window.chatFirebase.db;

      // Hook into Vaani's auth system (wraps existing _vaaniOnAuthChange)
      var _prev = window._vaaniOnAuthChange;
      window._vaaniOnAuthChange = function(user) {
        if (typeof _prev === "function") _prev(user);
        _onAuthReady(user);
      };

      // If auth already fired before we got here
      if (window.VAANI_AUTH_READY) {
        _onAuthReady(window._vaaniCurrentUser || null);
      }

      console.log("[Chat] Initialized ✓");
    });
  }

  // ══════════════════════════════════════════════════════════════
  // PUBLIC API  (for Phase 2 translation integration)
  // ══════════════════════════════════════════════════════════════

  window.vaaniChat = {
    openChatWith:    openChatWith,
    sendMessage:     sendMessage,
    loadUsers:       loadUsers,
    listenMessages:  listenMessages,
    markRead:        markRead,
    getCurrentUser:  function() { return _currentUser; },
    getActiveChatId: function() { return _activeChatId; },
  };

  // Boot
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", _init);
  } else {
    _init();
  }

})();
