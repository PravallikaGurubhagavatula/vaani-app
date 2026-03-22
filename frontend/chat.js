/* ================================================================
   Vaani — chat.js  v5  DEFINITIVE
   ================================================================

   KEY ARCHITECTURAL DECISION:
   ─────────────────────────────────────────────────────────────────
   This file manages its OWN Firebase Auth listener via the compat
   SDK (window.chatFirebase.auth). It does NOT rely on the existing
   app.js auth system (_vaaniOnAuthChange) because that uses the
   ESM modular SDK which is a separate instance.

   The user signs in via the existing firebase.js (ESM) which is
   fine for the translation/UI features. For chat, we listen on
   the compat auth instance which connects to the SAME Firebase
   project, so the same user account is signed in on both.

   FIRESTORE STRUCTURE:
   ─────────────────────────────────────────────────────────────────
   users/{uid}
     uid, name, email, photoURL, online, updatedAt

   chats/{uid1_uid2}   (always smaller uid first)
     chatId, participants[], lastMessage, lastSender,
     updatedAt, createdAt, unread:{uid1:0, uid2:0}

   chats/{chatId}/messages/{auto-id}
     senderId, text, timestamp, read

   ALL BUGS FIXED:
   ─────────────────────────────────────────────────────────────────
   ✓ Auth: own compat auth listener — no ESM/compat mismatch
   ✓ vcInputRow: shown immediately when chat selected
   ✓ vcMessages: display controlled by JS, not CSS
   ✓ onSnapshot: correct .orderBy("timestamp","asc") query
   ✓ Auto-scroll: requestAnimationFrame after render
   ✓ Send button: enabled on input, disabled after send
   ✓ Textarea: auto-resize as user types
   ✓ Mobile: back button + slide panel
   ✓ Badges: unread counts update in real-time
   ✓ Listener cleanup: previous onSnapshot unsubscribed on switch
   ✓ Race condition: waits for both chatFirebase AND auth
================================================================ */

(function () {
  "use strict";

  /* ── State ─────────────────────────────────────────────────── */
  var _db             = null;
  var _auth           = null;
  var _me             = null;   // current Firebase User object
  var _activeChatId   = null;
  var _activeOtherUid = null;
  var _msgUnsub       = null;
  var _chatUnsub      = null;
  var _users          = [];
  var _authUnsub      = null;

  /* ══════════════════════════════════════════════════════════════
     UTILITIES
  ══════════════════════════════════════════════════════════════ */

  function _cid(a, b) { return a < b ? a + "_" + b : b + "_" + a; }

  function _esc(s) {
    var d = document.createElement("div");
    d.appendChild(document.createTextNode(String(s || "")));
    return d.innerHTML;
  }

  function _get(id) { return document.getElementById(id); }

  function _toast(msg) {
    if (typeof window.showToast === "function") window.showToast(msg);
  }

  function _color(uid) {
    var c = ["#7c3aed","#2563eb","#0891b2","#059669","#d97706",
             "#dc2626","#db2777","#4f46e5","#0f766e","#b45309"];
    var h = 0;
    for (var i = 0; i < (uid||"").length; i++)
      h = uid.charCodeAt(i) + ((h << 5) - h);
    return c[Math.abs(h) % c.length];
  }

  function _initials(name) {
    return (name||"?").split(" ").map(function(w){return w[0]||"";})
      .slice(0,2).join("").toUpperCase() || "?";
  }

  function _fmtTime(ts) {
    if (!ts) return "";
    var d = ts.toDate ? ts.toDate() : new Date(ts);
    var now = new Date();
    if (d.toDateString() === now.toDateString())
      return d.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"});
    var y = new Date(now); y.setDate(now.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return "Yesterday";
    return d.toLocaleDateString([], {day:"numeric", month:"short"});
  }

  function _dateLabel(ts) {
    if (!ts) return "";
    var d = ts.toDate ? ts.toDate() : new Date(ts);
    var now = new Date();
    if (d.toDateString() === now.toDateString()) return "Today";
    var y = new Date(now); y.setDate(now.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return "Yesterday";
    return d.toLocaleDateString([], {weekday:"long", day:"numeric", month:"long"});
  }

  /* ══════════════════════════════════════════════════════════════
     PANEL SHOW / HIDE
  ══════════════════════════════════════════════════════════════ */

  function _showPanel(otherUser) {
    var empty    = _get("vcEmpty");
    var header   = _get("vcChatHeader");
    var messages = _get("vcMessages");
    var inputRow = _get("vcInputRow");
    var panel    = _get("vcChatPanel");

    if (empty)    { empty.style.display    = "none";  }
    if (header)   { header.style.display   = "flex";  _renderHeader(otherUser); }
    if (messages) { messages.style.display = "flex";
                    messages.innerHTML     = _loadingHtml(); }
    if (inputRow) { inputRow.style.display = "flex";  }
    if (panel)    { panel.classList.add("vc-panel-active"); }

    // Focus input
    setTimeout(function() {
      var inp = _get("vcInput");
      if (inp) inp.focus();
    }, 200);
  }

  function _hidePanel() {
    var empty    = _get("vcEmpty");
    var header   = _get("vcChatHeader");
    var messages = _get("vcMessages");
    var inputRow = _get("vcInputRow");
    var panel    = _get("vcChatPanel");
    var input    = _get("vcInput");
    var sendBtn  = _get("vcSendBtn");

    if (empty)    { empty.style.display    = "flex";  }
    if (header)   { header.style.display   = "none";  header.innerHTML = ""; }
    if (messages) { messages.style.display = "none";  messages.innerHTML = ""; }
    if (inputRow) { inputRow.style.display = "none";  }
    if (panel)    { panel.classList.remove("vc-panel-active"); }
    if (input)    { input.value = ""; _resizeInput(input); }
    if (sendBtn)  { sendBtn.disabled = true; }

    document.querySelectorAll(".vc-user-item").forEach(function(el) {
      el.classList.remove("vc-active");
    });
  }

  /* ══════════════════════════════════════════════════════════════
     FIRESTORE — USER PROFILE
  ══════════════════════════════════════════════════════════════ */

  function _upsertProfile(user) {
    if (!_db || !user) return;
    _db.collection("users").doc(user.uid).set({
      uid:       user.uid,
      name:      user.displayName || user.email.split("@")[0],
      email:     user.email || "",
      photoURL:  user.photoURL || "",
      online:    true,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    }, { merge: true })
    .then(function() {
      console.log("[Chat] Profile upserted:", user.uid);
    })
    .catch(function(e) {
      console.warn("[Chat] upsertProfile:", e.message);
    });
  }

  function _setOffline(uid) {
    if (!_db || !uid) return;
    _db.collection("users").doc(uid)
      .update({ online: false }).catch(function(){});
  }

  /* ══════════════════════════════════════════════════════════════
     FIRESTORE — LOAD USERS
  ══════════════════════════════════════════════════════════════ */

  function loadUsers() {
    var list = _get("vcUserList");
    if (!list) return;

    if (!_me) {
      list.innerHTML = _emptyHtml(
        "Sign in to chat",
        "Use the Sign In button in the menu."
      );
      return;
    }

    if (!_db) {
      list.innerHTML = _loadingHtml();
      return;
    }

    list.innerHTML = _loadingHtml();

    _db.collection("users")
      .orderBy("name")
      .get()
      .then(function(snap) {
        _users = snap.docs
          .map(function(d) { return d.data(); })
          .filter(function(u) { return u.uid !== _me.uid; });

        if (!_users.length) {
          list.innerHTML = _emptyHtml(
            "No other users yet",
            "Sign in with a second account to chat."
          );
          return;
        }

        list.innerHTML = _users.map(_userItemHtml).join("");

        list.querySelectorAll(".vc-user-item").forEach(function(el) {
          el.addEventListener("click", function() {
            _openChat(el.dataset.uid);
          });
        });

        console.log("[Chat] Loaded", _users.length, "users");
      })
      .catch(function(e) {
        console.error("[Chat] loadUsers:", e.message);
        list.innerHTML = _emptyHtml("Failed to load users", e.message);
      });
  }

  /* ══════════════════════════════════════════════════════════════
     FIRESTORE — CREATE OR GET CHAT
  ══════════════════════════════════════════════════════════════ */

  function _createOrGetChat(otherUid) {
    var id  = _cid(_me.uid, otherUid);
    var ref = _db.collection("chats").doc(id);

    return ref.get().then(function(snap) {
      if (!snap.exists) {
        var data = {
          chatId:       id,
          participants: [_me.uid, otherUid],
          createdAt:    firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt:    firebase.firestore.FieldValue.serverTimestamp(),
          lastMessage:  "",
          lastSender:   "",
          unread:       {},
        };
        data.unread[_me.uid]  = 0;
        data.unread[otherUid] = 0;
        return ref.set(data).then(function() {
          console.log("[Chat] New chat created:", id);
          return id;
        });
      }
      return id;
    });
  }

  /* ══════════════════════════════════════════════════════════════
     FIRESTORE — SEND MESSAGE
  ══════════════════════════════════════════════════════════════ */

  function _sendMessage(chatId, text) {
    var trimmed = (text || "").trim();
    if (!trimmed || !chatId || !_me || !_db) return;

    // Optimistic clear
    var inp = _get("vcInput");
    var btn = _get("vcSendBtn");
    if (inp) { inp.value = ""; _resizeInput(inp); }
    if (btn) btn.disabled = true;

    // Write message doc
    _db.collection("chats").doc(chatId)
      .collection("messages").add({
        chatId:    chatId,
        senderId:  _me.uid,
        text:      trimmed,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        read:      false,
      })
      .then(function() {
        // Update chat metadata
        var upd = {
          lastMessage: trimmed.length > 60 ? trimmed.slice(0, 60) + "…" : trimmed,
          lastSender:  _me.uid,
          updatedAt:   firebase.firestore.FieldValue.serverTimestamp(),
        };
        if (_activeOtherUid) {
          upd["unread." + _activeOtherUid] =
            firebase.firestore.FieldValue.increment(1);
        }
        return _db.collection("chats").doc(chatId).update(upd);
      })
      .catch(function(e) {
        console.error("[Chat] sendMessage:", e.message);
        _toast("Send failed. Check connection.");
        if (inp) inp.value = trimmed; // restore
      });
  }

  /* ══════════════════════════════════════════════════════════════
     FIRESTORE — LISTEN MESSAGES (real-time onSnapshot)
  ══════════════════════════════════════════════════════════════ */

  function _listenMessages(chatId) {
    // Unsubscribe from previous chat
    if (_msgUnsub) { _msgUnsub(); _msgUnsub = null; }
    if (!_db || !chatId) return;

    console.log("[Chat] Listening to messages in:", chatId);

    _msgUnsub = _db
      .collection("chats").doc(chatId)
      .collection("messages")
      .orderBy("timestamp", "asc")
      .onSnapshot(
        function(snap) {
          var msgs = snap.docs.map(function(d) {
            return Object.assign({ id: d.id }, d.data());
          });
          console.log("[Chat] onSnapshot fired:", msgs.length, "messages");
          _renderMessages(msgs);
          _markRead(chatId);
        },
        function(err) {
          console.error("[Chat] onSnapshot error:", err.code, err.message);
          var el = _get("vcMessages");
          if (el) el.innerHTML = _emptyHtml("Error loading messages", err.message);
        }
      );
  }

  /* ══════════════════════════════════════════════════════════════
     FIRESTORE — LISTEN CHATS (sidebar unread badges)
  ══════════════════════════════════════════════════════════════ */

  function _listenChats() {
    if (_chatUnsub) { _chatUnsub(); _chatUnsub = null; }
    if (!_db || !_me) return;

    _chatUnsub = _db
      .collection("chats")
      .where("participants", "array-contains", _me.uid)
      .orderBy("updatedAt", "desc")
      .onSnapshot(
        function(snap) {
          var chats = snap.docs.map(function(d) { return d.data(); });
          var total = chats.reduce(function(sum, c) {
            return sum + ((c.unread && c.unread[_me.uid]) || 0);
          }, 0);
          _updateNavBadge(total);
          _updateUserBadges(chats);
        },
        function(err) {
          console.warn("[Chat] listenChats:", err.message);
        }
      );
  }

  function _markRead(chatId) {
    if (!_db || !_me || !chatId) return;
    var upd = {};
    upd["unread." + _me.uid] = 0;
    _db.collection("chats").doc(chatId).update(upd).catch(function(){});
  }

  /* ══════════════════════════════════════════════════════════════
     UI — RENDER MESSAGES
  ══════════════════════════════════════════════════════════════ */

  function _renderMessages(messages) {
    var el = _get("vcMessages");
    if (!el || !_me) return;

    if (!messages.length) {
      el.innerHTML = '<div class="vc-no-messages">'
        + '<svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>'
        + '<p>No messages yet — say hi! 👋</p></div>';
      return;
    }

    var html = "";
    var lastDate = "";

    messages.forEach(function(msg) {
      var isMe = msg.senderId === _me.uid;
      var ts   = msg.timestamp;
      var dateStr = ts ? (ts.toDate ? ts.toDate().toDateString()
                                    : new Date(ts).toDateString()) : "";

      if (dateStr && dateStr !== lastDate) {
        html += '<div class="vc-date-sep"><span>' + _dateLabel(ts) + '</span></div>';
        lastDate = dateStr;
      }

      html += '<div class="vc-msg ' + (isMe ? "vc-msg-me" : "vc-msg-them") + '">'
            +   '<div class="vc-bubble">' + _esc(msg.text) + '</div>'
            +   '<div class="vc-msg-time">' + _fmtTime(ts) + '</div>'
            + '</div>';
    });

    el.innerHTML = html;

    // Scroll to bottom
    requestAnimationFrame(function() {
      el.scrollTop = el.scrollHeight;
    });
  }

  /* ══════════════════════════════════════════════════════════════
     UI — RENDER HEADER
  ══════════════════════════════════════════════════════════════ */

  function _renderHeader(user) {
    var el = _get("vcChatHeader");
    if (!el || !user) return;

    var col = _color(user.uid);
    var ini = _initials(user.name);
    var img = user.photoURL
      ? '<img src="' + _esc(user.photoURL) + '" alt="" onerror="this.style.display=\'none\'">'
      : "";
    var dot = user.online ? '<span class="vc-online-dot"></span>' : "";

    el.innerHTML =
      '<button class="vc-back-btn" id="vcBackBtn">'
      + '<svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>'
      + '</button>'
      + '<div class="vc-avatar vc-avatar-sm" style="background:' + col + '">'
      + img + ini + dot
      + '</div>'
      + '<div class="vc-header-info">'
      + '<div class="vc-header-name">' + _esc(user.name) + '</div>'
      + '<div class="vc-header-status">' + (user.online ? "● Online" : "Offline") + '</div>'
      + '</div>';

    var back = _get("vcBackBtn");
    if (back) back.addEventListener("click", function() {
      if (_msgUnsub) { _msgUnsub(); _msgUnsub = null; }
      _activeChatId   = null;
      _activeOtherUid = null;
      _hidePanel();
    });
  }

  /* ══════════════════════════════════════════════════════════════
     UI — RENDER USER LIST
  ══════════════════════════════════════════════════════════════ */

  function _userItemHtml(u) {
    var col = _color(u.uid);
    var ini = _initials(u.name);
    var img = u.photoURL
      ? '<img src="' + _esc(u.photoURL) + '" alt="" onerror="this.style.display=\'none\'">'
      : "";
    var dot = u.online ? '<span class="vc-online-dot"></span>' : "";

    return '<div class="vc-user-item" data-uid="' + _esc(u.uid) + '" id="vc-user-' + _esc(u.uid) + '">'
      + '<div class="vc-avatar" style="background:' + col + '">' + img + ini + dot + '</div>'
      + '<div class="vc-user-info">'
      +   '<div class="vc-user-name">'  + _esc(u.name)  + '</div>'
      +   '<div class="vc-user-email">' + _esc(u.email) + '</div>'
      + '</div>'
      + '<div class="vc-badge" id="vc-badge-' + _esc(u.uid) + '" style="display:none">0</div>'
      + '</div>';
  }

  function _loadingHtml() {
    return '<div class="vc-loading"><div class="vc-spinner"></div><span>Loading…</span></div>';
  }

  function _emptyHtml(title, sub) {
    return '<div class="vc-empty-list">'
      + '<svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>'
      + '<circle cx="9" cy="7" r="4"/></svg>'
      + '<p>' + _esc(title) + '</p>'
      + '<span>' + _esc(sub) + '</span>'
      + '</div>';
  }

  /* ══════════════════════════════════════════════════════════════
     UI — BADGES
  ══════════════════════════════════════════════════════════════ */

  function _updateNavBadge(n) {
    ["chatNavBadge", "chatMenuBadge"].forEach(function(id) {
      var el = _get(id);
      if (!el) return;
      if (n > 0) { el.textContent = n > 99 ? "99+" : n; el.style.display = "flex"; }
      else        { el.style.display = "none"; }
    });
  }

  function _updateUserBadges(chats) {
    if (!_me) return;
    chats.forEach(function(chat) {
      var unread   = (chat.unread && chat.unread[_me.uid]) || 0;
      var otherUid = (chat.participants || []).filter(function(uid) {
        return uid !== _me.uid;
      })[0];
      if (!otherUid) return;
      var badge   = _get("vc-badge-" + otherUid);
      if (!badge) return;
      var isActive = _activeChatId && _activeChatId === _cid(_me.uid, otherUid);
      if (unread > 0 && !isActive) {
        badge.textContent = unread > 99 ? "99+" : unread;
        badge.style.display = "flex";
      } else {
        badge.style.display = "none";
      }
    });
  }

  /* ══════════════════════════════════════════════════════════════
     INTERACTION — OPEN CHAT
  ══════════════════════════════════════════════════════════════ */

  function _openChat(otherUid) {
    if (!_me || !otherUid || !_db) {
      console.warn("[Chat] _openChat blocked:", {me:!!_me, uid:otherUid, db:!!_db});
      return;
    }

    // Find user in cache or fetch from Firestore
    var otherUser = _users.filter(function(u){ return u.uid === otherUid; })[0];

    if (!otherUser) {
      _db.collection("users").doc(otherUid).get()
        .then(function(snap) {
          if (snap.exists) _doOpenChat(snap.data());
          else _toast("User not found.");
        });
      return;
    }

    _doOpenChat(otherUser);
  }

  function _doOpenChat(otherUser) {
    _activeOtherUid = otherUser.uid;

    // Highlight in sidebar
    document.querySelectorAll(".vc-user-item").forEach(function(el) {
      el.classList.toggle("vc-active", el.dataset.uid === otherUser.uid);
    });

    // Show panel with loading state
    _showPanel(otherUser);

    // Create/get chat, then start real-time listener
    _createOrGetChat(otherUser.uid)
      .then(function(chatId) {
        _activeChatId = chatId;
        _listenMessages(chatId);
      })
      .catch(function(e) {
        console.error("[Chat] _doOpenChat:", e.message);
        _toast("Could not open chat: " + e.message);
      });
  }

  /* ══════════════════════════════════════════════════════════════
     INTERACTION — SEND / INPUT
  ══════════════════════════════════════════════════════════════ */

  function _handleSend() {
    var inp  = _get("vcInput");
    var text = inp ? inp.value.trim() : "";
    if (!text)          { return; }
    if (!_activeChatId) { _toast("Select a user to chat with first."); return; }
    if (!_me)           { _toast("Please sign in first."); return; }
    _sendMessage(_activeChatId, text);
  }

  function _resizeInput(el) {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }

  /* ══════════════════════════════════════════════════════════════
     AUTH — OWN LISTENER on compat auth instance
  ══════════════════════════════════════════════════════════════ */

  function _startAuthListener() {
    if (!_auth) return;

    _authUnsub = _auth.onAuthStateChanged(function(user) {
      console.log("[Chat] Auth state:", user ? ("signed in: " + user.email) : "signed out");

      if (!user) {
        // Cleanup
        _me             = null;
        _activeChatId   = null;
        _activeOtherUid = null;
        if (_msgUnsub)  { _msgUnsub();  _msgUnsub  = null; }
        if (_chatUnsub) { _chatUnsub(); _chatUnsub = null; }
        _hidePanel();
        loadUsers();
        return;
      }

      _me = user;
      _upsertProfile(user);
      loadUsers();
      _listenChats();

      // Mark offline on page leave
      window.addEventListener("beforeunload", function() { _setOffline(user.uid); });
      document.addEventListener("visibilitychange", function() {
        if (document.visibilityState === "hidden") _setOffline(user.uid);
        else _upsertProfile(user);
      });
    });
  }

  /* ══════════════════════════════════════════════════════════════
     EVENT BINDING
  ══════════════════════════════════════════════════════════════ */

  function _bindEvents() {
    var sendBtn = _get("vcSendBtn");
    var inp     = _get("vcInput");

    if (sendBtn) {
      sendBtn.addEventListener("click", _handleSend);
    }

    if (inp) {
      inp.addEventListener("keydown", function(e) {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          _handleSend();
        }
      });
      inp.addEventListener("input", function() {
        if (sendBtn) sendBtn.disabled = !inp.value.trim();
        _resizeInput(inp);
      });
    }
  }

  /* ══════════════════════════════════════════════════════════════
     WAIT FOR chatFirebase TO BE READY
  ══════════════════════════════════════════════════════════════ */

  function _waitAndInit(tries) {
    tries = tries || 0;
    if (window.chatFirebase && window.chatFirebase.db && window.chatFirebase.auth) {
      _db   = window.chatFirebase.db;
      _auth = window.chatFirebase.auth;
      _bindEvents();
      _startAuthListener();
      console.log("[Chat] ✓ Initialized and listening for auth.");
    } else if (tries < 100) {
      setTimeout(function() { _waitAndInit(tries + 1); }, 100);
    } else {
      console.error("[Chat] Timed out waiting for chatFirebase. Check chat-firebase.js loaded correctly.");
    }
  }

  /* ══════════════════════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════════════════════ */

  function _init() {
    var page = _get("pageChat");
    if (!page) {
      console.error("[Chat] #pageChat div not found in DOM. Did you add BLOCK 4 to index.html?");
      return;
    }

    // Set initial UI state
    _hidePanel();

    // Wait for chatFirebase then start
    _waitAndInit(0);
  }

  /* ══════════════════════════════════════════════════════════════
     PUBLIC API
  ══════════════════════════════════════════════════════════════ */

  window.vaaniChat = {
    loadUsers:       loadUsers,
    openChatWith:    _openChat,
    sendMessage:     _sendMessage,
    getCurrentUser:  function() { return _me; },
    getActiveChatId: function() { return _activeChatId; },
  };

  // Boot after DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", _init);
  } else {
    _init();
  }

})();
