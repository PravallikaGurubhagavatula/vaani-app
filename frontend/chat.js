/* ================================================================
   Vaani — chat.js  v6  FINAL
   ================================================================

   AUTH STRATEGY (matches chat-firebase.js v6):
   ─────────────────────────────────────────────────────────────────
   Does NOT have its own onAuthStateChanged listener.
   Instead, chat-firebase.js calls window._chatOnUserReady(user)
   after successfully mirroring the ESM user to compat auth.

   This guarantees:
   - Chat only starts after compat auth has the real user
   - getCurrentUser() always returns the correct user
   - loadUsers() and Firestore ops work because request.auth is set

   FIRESTORE STRUCTURE:
   ─────────────────────────────────────────────────────────────────
   users/{uid}
     uid, name, email, photoURL, online, updatedAt

   chats/{uid_uid}   (sorted, deterministic)
     chatId, participants[], lastMessage, lastSender,
     updatedAt, createdAt, unread:{uid1:0, uid2:0}

   chats/{chatId}/messages/{auto}
     senderId, text, timestamp, read
================================================================ */

(function () {
  "use strict";

  /* ── State ──────────────────────────────────────────────────── */
  var _db             = null;
  var _me             = null;
  var _activeChatId   = null;
  var _activeOtherUid = null;
  var _msgUnsub       = null;
  var _chatUnsub      = null;
  var _users          = [];

  /* ══════════════════════════════════════════════════════════════
     SMALL UTILITIES
  ══════════════════════════════════════════════════════════════ */

  function _cid(a, b)  { return a < b ? a + "_" + b : b + "_" + a; }
  function _get(id)    { return document.getElementById(id); }
  function _esc(s) {
    var d = document.createElement("div");
    d.appendChild(document.createTextNode(String(s || "")));
    return d.innerHTML;
  }
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
    var d   = ts.toDate ? ts.toDate() : new Date(ts);
    var now = new Date();
    if (d.toDateString() === now.toDateString())
      return d.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"});
    var y = new Date(now); y.setDate(now.getDate()-1);
    if (d.toDateString() === y.toDateString()) return "Yesterday";
    return d.toLocaleDateString([], {day:"numeric",month:"short"});
  }
  function _dateLabel(ts) {
    if (!ts) return "";
    var d   = ts.toDate ? ts.toDate() : new Date(ts);
    var now = new Date();
    if (d.toDateString() === now.toDateString()) return "Today";
    var y = new Date(now); y.setDate(now.getDate()-1);
    if (d.toDateString() === y.toDateString()) return "Yesterday";
    return d.toLocaleDateString([], {weekday:"long",day:"numeric",month:"long"});
  }

  /* ══════════════════════════════════════════════════════════════
     PANEL SHOW / HIDE
  ══════════════════════════════════════════════════════════════ */

  function _showPanel(otherUser) {
    var empty  = _get("vcEmpty");
    var header = _get("vcChatHeader");
    var msgs   = _get("vcMessages");
    var row    = _get("vcInputRow");
    var panel  = _get("vcChatPanel");

    if (empty)  empty.style.display  = "none";
    if (header) { header.style.display = "flex"; _renderHeader(otherUser); }
    if (msgs)   { msgs.style.display  = "flex";  msgs.innerHTML = _loadingHtml(); }
    if (row)    row.style.display     = "flex";
    if (panel)  panel.classList.add("vc-panel-active");

    setTimeout(function () {
      var inp = _get("vcInput");
      if (inp) inp.focus();
    }, 150);
  }

  function _hidePanel() {
    var empty  = _get("vcEmpty");
    var header = _get("vcChatHeader");
    var msgs   = _get("vcMessages");
    var row    = _get("vcInputRow");
    var panel  = _get("vcChatPanel");
    var inp    = _get("vcInput");
    var btn    = _get("vcSendBtn");

    if (empty)  empty.style.display  = "flex";
    if (header) { header.style.display = "none"; header.innerHTML = ""; }
    if (msgs)   { msgs.style.display  = "none";  msgs.innerHTML   = ""; }
    if (row)    row.style.display     = "none";
    if (panel)  panel.classList.remove("vc-panel-active");
    if (inp)    { inp.value = ""; _resizeInput(inp); }
    if (btn)    btn.disabled = true;

    document.querySelectorAll(".vc-user-item")
      .forEach(function(el){ el.classList.remove("vc-active"); });
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
    .then(function() { console.log("[Chat] Profile upserted:", user.uid); })
    .catch(function(e){ console.warn("[Chat] upsertProfile:", e.message); });
  }

  function _setOffline(uid) {
    if (!_db || !uid) return;
    _db.collection("users").doc(uid).update({online:false}).catch(function(){});
  }

  /* ══════════════════════════════════════════════════════════════
     FIRESTORE — LOAD USERS
  ══════════════════════════════════════════════════════════════ */

  function loadUsers() {
    var list = _get("vcUserList");
    if (!list) return;

    if (!_me) {
      list.innerHTML = _emptyHtml("Sign in to chat","Use the Sign In button in the menu.");
      return;
    }
    if (!_db) {
      list.innerHTML = _loadingHtml();
      return;
    }

    list.innerHTML = _loadingHtml();

    _db.collection("users").orderBy("name").get()
      .then(function(snap) {
        _users = snap.docs.map(function(d){return d.data();})
          .filter(function(u){return u.uid !== _me.uid;});

        if (!_users.length) {
          list.innerHTML = _emptyHtml("No other users yet","Sign in with a second account.");
          return;
        }
        list.innerHTML = _users.map(_userItemHtml).join("");
        list.querySelectorAll(".vc-user-item").forEach(function(el){
          el.addEventListener("click", function(){ _openChat(el.dataset.uid); });
        });
        console.log("[Chat] Loaded", _users.length, "user(s)");
      })
      .catch(function(e){
        console.error("[Chat] loadUsers:", e.message);
        list.innerHTML = _emptyHtml("Could not load users", e.message);
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
        return ref.set(data).then(function(){ return id; });
      }
      return id;
    });
  }

  /* ══════════════════════════════════════════════════════════════
     FIRESTORE — SEND MESSAGE
  ══════════════════════════════════════════════════════════════ */

  function _sendMessage(chatId, text) {
    var t = (text||"").trim();
    if (!t || !chatId || !_me || !_db) return;

    var inp = _get("vcInput");
    var btn = _get("vcSendBtn");
    if (inp) { inp.value = ""; _resizeInput(inp); }
    if (btn) btn.disabled = true;

    _db.collection("chats").doc(chatId).collection("messages").add({
      chatId:    chatId,
      senderId:  _me.uid,
      text:      t,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      read:      false,
    })
    .then(function() {
      var upd = {
        lastMessage: t.length > 60 ? t.slice(0,60)+"…" : t,
        lastSender:  _me.uid,
        updatedAt:   firebase.firestore.FieldValue.serverTimestamp(),
      };
      if (_activeOtherUid)
        upd["unread."+_activeOtherUid] = firebase.firestore.FieldValue.increment(1);
      return _db.collection("chats").doc(chatId).update(upd);
    })
    .catch(function(e){
      console.error("[Chat] sendMessage:", e.message);
      _toast("Send failed. Check connection.");
      if (inp) inp.value = t;
    });
  }

  /* ══════════════════════════════════════════════════════════════
     FIRESTORE — LISTEN MESSAGES (real-time)
  ══════════════════════════════════════════════════════════════ */

  function _listenMessages(chatId) {
    if (_msgUnsub) { _msgUnsub(); _msgUnsub = null; }
    if (!_db || !chatId) return;

    console.log("[Chat] Subscribing to messages:", chatId);

    _msgUnsub = _db
      .collection("chats").doc(chatId)
      .collection("messages")
      .orderBy("timestamp","asc")
      .onSnapshot(
        function(snap) {
          var msgs = snap.docs.map(function(d){
            return Object.assign({id:d.id}, d.data());
          });
          console.log("[Chat] onSnapshot:", msgs.length, "messages");
          _renderMessages(msgs);
          _markRead(chatId);
        },
        function(err){
          console.error("[Chat] onSnapshot error:", err.code, err.message);
          var el = _get("vcMessages");
          if (el) el.innerHTML = _emptyHtml("Error loading messages", err.message);
        }
      );
  }

  /* ══════════════════════════════════════════════════════════════
     FIRESTORE — LISTEN CHATS (sidebar badges)
  ══════════════════════════════════════════════════════════════ */

  function _listenChats() {
    if (_chatUnsub) { _chatUnsub(); _chatUnsub = null; }
    if (!_db || !_me) return;

    _chatUnsub = _db
      .collection("chats")
      .where("participants","array-contains",_me.uid)
      .orderBy("updatedAt","desc")
      .onSnapshot(
        function(snap){
          var chats = snap.docs.map(function(d){return d.data();});
          var total = chats.reduce(function(s,c){
            return s + ((c.unread && c.unread[_me.uid])||0);
          },0);
          _updateNavBadge(total);
          _updateUserBadges(chats);
        },
        function(err){ console.warn("[Chat] listenChats:", err.message); }
      );
  }

  function _markRead(chatId) {
    if (!_db || !_me || !chatId) return;
    var u = {}; u["unread."+_me.uid] = 0;
    _db.collection("chats").doc(chatId).update(u).catch(function(){});
  }

  /* ══════════════════════════════════════════════════════════════
     UI — RENDER
  ══════════════════════════════════════════════════════════════ */

  function _renderMessages(messages) {
    var el = _get("vcMessages");
    if (!el || !_me) return;

    if (!messages.length) {
      el.innerHTML = '<div class="vc-no-messages">'
        +'<svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>'
        +'<p>No messages yet — say hi! 👋</p></div>';
      return;
    }

    var html = ""; var lastDate = "";
    messages.forEach(function(msg){
      var isMe    = msg.senderId === _me.uid;
      var ts      = msg.timestamp;
      var dateStr = ts ? (ts.toDate ? ts.toDate().toDateString()
                                    : new Date(ts).toDateString()) : "";
      if (dateStr && dateStr !== lastDate) {
        html += '<div class="vc-date-sep"><span>'+_dateLabel(ts)+'</span></div>';
        lastDate = dateStr;
      }
      html += '<div class="vc-msg '+(isMe?"vc-msg-me":"vc-msg-them")+'">'
            +   '<div class="vc-bubble">'+_esc(msg.text)+'</div>'
            +   '<div class="vc-msg-time">'+_fmtTime(ts)+'</div>'
            + '</div>';
    });

    el.innerHTML = html;
    requestAnimationFrame(function(){ el.scrollTop = el.scrollHeight; });
  }

  function _renderHeader(user) {
    var el = _get("vcChatHeader");
    if (!el || !user) return;
    var col = _color(user.uid);
    var img = user.photoURL
      ? '<img src="'+_esc(user.photoURL)+'" alt="" onerror="this.style.display=\'none\'">'
      : "";
    var dot = user.online ? '<span class="vc-online-dot"></span>' : "";
    el.innerHTML =
      '<button class="vc-back-btn" id="vcBackBtn">'
      +'<svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg></button>'
      +'<div class="vc-avatar vc-avatar-sm" style="background:'+col+'">'
      +img+_initials(user.name)+dot+'</div>'
      +'<div class="vc-header-info">'
      +'<div class="vc-header-name">'+_esc(user.name)+'</div>'
      +'<div class="vc-header-status">'+(user.online?"● Online":"Offline")+'</div>'
      +'</div>';
    var back = _get("vcBackBtn");
    if (back) back.addEventListener("click", function(){
      if (_msgUnsub) { _msgUnsub(); _msgUnsub = null; }
      _activeChatId = null; _activeOtherUid = null;
      _hidePanel();
    });
  }

  function _userItemHtml(u) {
    var col = _color(u.uid);
    var img = u.photoURL
      ? '<img src="'+_esc(u.photoURL)+'" alt="" onerror="this.style.display=\'none\'">' : "";
    var dot = u.online ? '<span class="vc-online-dot"></span>' : "";
    return '<div class="vc-user-item" data-uid="'+_esc(u.uid)+'" id="vc-user-'+_esc(u.uid)+'">'
      +'<div class="vc-avatar" style="background:'+col+'">'+img+_initials(u.name)+dot+'</div>'
      +'<div class="vc-user-info">'
      +'<div class="vc-user-name">'+_esc(u.name)+'</div>'
      +'<div class="vc-user-email">'+_esc(u.email)+'</div>'
      +'</div>'
      +'<div class="vc-badge" id="vc-badge-'+_esc(u.uid)+'" style="display:none">0</div>'
      +'</div>';
  }

  function _loadingHtml() {
    return '<div class="vc-loading"><div class="vc-spinner"></div><span>Loading…</span></div>';
  }
  function _emptyHtml(t, s) {
    return '<div class="vc-empty-list">'
      +'<svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>'
      +'<circle cx="9" cy="7" r="4"/></svg>'
      +'<p>'+_esc(t)+'</p><span>'+_esc(s)+'</span></div>';
  }

  function _updateNavBadge(n) {
    ["chatNavBadge","chatMenuBadge"].forEach(function(id){
      var el = _get(id); if (!el) return;
      if (n > 0) { el.textContent = n>99?"99+":n; el.style.display="flex"; }
      else         el.style.display = "none";
    });
  }

  function _updateUserBadges(chats) {
    if (!_me) return;
    chats.forEach(function(chat){
      var unread   = (chat.unread && chat.unread[_me.uid]) || 0;
      var otherUid = (chat.participants||[]).filter(function(u){return u!==_me.uid;})[0];
      if (!otherUid) return;
      var badge = _get("vc-badge-"+otherUid);
      if (!badge) return;
      var isActive = _activeChatId && _activeChatId === _cid(_me.uid, otherUid);
      if (unread > 0 && !isActive) {
        badge.textContent = unread>99?"99+":unread; badge.style.display="flex";
      } else { badge.style.display="none"; }
    });
  }

  /* ══════════════════════════════════════════════════════════════
     OPEN / CLOSE CHAT
  ══════════════════════════════════════════════════════════════ */

  function _openChat(otherUid) {
    if (!_me || !otherUid || !_db) {
      console.warn("[Chat] Cannot open chat — me:", !!_me, "db:", !!_db);
      if (!_me) _toast("Please sign in first.");
      return;
    }
    var u = _users.filter(function(x){return x.uid===otherUid;})[0];
    if (!u) {
      _db.collection("users").doc(otherUid).get().then(function(snap){
        if (snap.exists) _doOpenChat(snap.data());
        else _toast("User not found.");
      });
      return;
    }
    _doOpenChat(u);
  }

  function _doOpenChat(otherUser) {
    _activeOtherUid = otherUser.uid;
    document.querySelectorAll(".vc-user-item").forEach(function(el){
      el.classList.toggle("vc-active", el.dataset.uid === otherUser.uid);
    });
    _showPanel(otherUser);
    _createOrGetChat(otherUser.uid).then(function(chatId){
      _activeChatId = chatId;
      _listenMessages(chatId);
    }).catch(function(e){
      console.error("[Chat] _doOpenChat:", e.message);
      _toast("Could not open chat.");
    });
  }

  /* ══════════════════════════════════════════════════════════════
     SEND / INPUT
  ══════════════════════════════════════════════════════════════ */

  function _handleSend() {
    var inp  = _get("vcInput");
    var text = inp ? inp.value.trim() : "";
    if (!text) return;
    if (!_activeChatId) { _toast("Select a user first."); return; }
    _sendMessage(_activeChatId, text);
  }

  function _resizeInput(el) {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }

  function _bindEvents() {
    var btn = _get("vcSendBtn");
    var inp = _get("vcInput");
    if (btn) btn.addEventListener("click", _handleSend);
    if (inp) {
      inp.addEventListener("keydown", function(e){
        if (e.key==="Enter" && !e.shiftKey){ e.preventDefault(); _handleSend(); }
      });
      inp.addEventListener("input", function(){
        if (btn) btn.disabled = !inp.value.trim();
        _resizeInput(inp);
      });
    }
  }

  /* ══════════════════════════════════════════════════════════════
     AUTH — called by chat-firebase.js after updateCurrentUser
  ══════════════════════════════════════════════════════════════ */

  // This is the ENTRY POINT called by chat-firebase.js
  // when the ESM user has been successfully mirrored to compat auth.
  window._chatOnUserReady = function (user) {
    if (!user) {
      // Signed out
      _me = null; _activeChatId = null; _activeOtherUid = null;
      if (_msgUnsub)  { _msgUnsub();  _msgUnsub  = null; }
      if (_chatUnsub) { _chatUnsub(); _chatUnsub = null; }
      _hidePanel();
      loadUsers();
      return;
    }

    _me = user;
    console.log("[Chat] User ready:", _me.email);

    // Wait for db to be available (chat-firebase.js sets window.chatFirebase)
    function _waitForDb(tries) {
      if (window.chatFirebase && window.chatFirebase.db) {
        _db = window.chatFirebase.db;
        _upsertProfile(_me);
        loadUsers();
        _listenChats();
        window.addEventListener("beforeunload", function(){ _setOffline(_me.uid); });
        document.addEventListener("visibilitychange", function(){
          if (document.visibilityState==="hidden") _setOffline(_me.uid);
          else _upsertProfile(_me);
        });
      } else if ((tries||0) < 50) {
        setTimeout(function(){ _waitForDb((tries||0)+1); }, 100);
      } else {
        console.error("[Chat] DB never became available.");
      }
    }
    _waitForDb(0);
  };

  /* ══════════════════════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════════════════════ */

  function _init() {
    if (!_get("pageChat")) {
      console.error("[Chat] #pageChat not found — add BLOCK 4 to index.html");
      return;
    }
    _hidePanel();
    _bindEvents();
    console.log("[Chat] Ready. Waiting for auth via _chatOnUserReady.");
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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", _init);
  } else {
    _init();
  }

})();
