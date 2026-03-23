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



/* ================================================================
   Vaani — chat-ui.js  v7
   UI-only interactions: tabs, search, dummy data, demo messages.
   NO Firebase. NO backend. Pure frontend.
   Safe to replace with real backend later.
================================================================ */

/* ================================================================
   Vaani — chat-ui.js  v8
   ALL DOM queries are scoped to #pageChat.
   ZERO global DOM injection. ZERO side effects on other pages.
   Safe to load alongside existing app.js.
================================================================ */

(function () {
  "use strict";

  /* ── Get the chat page root — everything is queried inside it ── */
  function _root() { return document.getElementById("pageChat"); }
  function _q(sel) {
    var r = _root();
    return r ? r.querySelector(sel) : null;
  }
  function _qa(sel) {
    var r = _root();
    return r ? Array.prototype.slice.call(r.querySelectorAll(sel)) : [];
  }
  /* Shortcut for elements with known IDs inside the page */
  function _id(id) {
    var r = _root();
    return r ? r.querySelector("#" + id) : null;
  }

  /* ══════════════════════════════════════════════════════════════
     DUMMY DATA
  ══════════════════════════════════════════════════════════════ */

  var PEOPLE = [
    { id:"u01", name:"Arjun Reddy",   handle:"@arjun.reddy",   online:true,  avatar:"AR", color:"#7c3aed", connected:false },
    { id:"u02", name:"Priya Sharma",  handle:"@priya.sharma",  online:true,  avatar:"PS", color:"#0891b2", connected:false },
    { id:"u03", name:"Ravi Kumar",    handle:"@ravi.kumar",    online:false, avatar:"RK", color:"#059669", connected:true  },
    { id:"u04", name:"Kavitha Nair",  handle:"@kavitha.nair",  online:true,  avatar:"KN", color:"#d97706", connected:false },
    { id:"u05", name:"Siddharth Rao", handle:"@siddharth.rao", online:false, avatar:"SR", color:"#dc2626", connected:false },
    { id:"u06", name:"Meena Iyer",    handle:"@meena.iyer",    online:true,  avatar:"MI", color:"#db2777", connected:true  },
    { id:"u07", name:"Vikram Patel",  handle:"@vikram.patel",  online:false, avatar:"VP", color:"#4f46e5", connected:false },
    { id:"u08", name:"Ananya Desai",  handle:"@ananya.desai",  online:true,  avatar:"AD", color:"#0f766e", connected:false },
    { id:"u09", name:"Rohit Verma",   handle:"@rohit.verma",   online:false, avatar:"RV", color:"#b45309", connected:false },
    { id:"u10", name:"Lakshmi Devi",  handle:"@lakshmi.devi",  online:true,  avatar:"LD", color:"#6d28d9", connected:false },
    { id:"u11", name:"Kiran Babu",    handle:"@kiran.babu",    online:false, avatar:"KB", color:"#0369a1", connected:false },
    { id:"u12", name:"Sunita Mehta",  handle:"@sunita.mehta",  online:true,  avatar:"SM", color:"#065f46", connected:true  },
  ];

  var CHATS = [
    {
      id:"c01", name:"Priya Sharma", avatar:"PS", color:"#0891b2",
      online:true, unread:2, time:"now",
      preview:"Just sent you the translation 😊",
      msgs:[
        { from:"them", text:"Hey! Can you help me translate something?", time:"9:41 AM" },
        { from:"me",   text:"Of course! Which language?",                time:"9:42 AM" },
        { from:"them", text:"Telugu to Hindi please.",                   time:"9:43 AM" },
        { from:"me",   text:"Sure, go ahead and type it!",               time:"9:44 AM" },
        { from:"them", text:"Just sent you the translation 😊",          time:"9:45 AM" },
      ],
    },
    {
      id:"c02", name:"Arjun Reddy", avatar:"AR", color:"#7c3aed",
      online:true, unread:1, time:"2m",
      preview:"The voice feature is amazing 🎙️",
      msgs:[
        { from:"them", text:"Bro, tried the Vaani app today.",  time:"Yesterday" },
        { from:"me",   text:"How was it?",                      time:"Yesterday" },
        { from:"them", text:"The voice feature is amazing 🎙️", time:"2m ago"    },
      ],
    },
    {
      id:"c03", name:"Meena Iyer", avatar:"MI", color:"#db2777",
      online:true, unread:0, time:"1h",
      preview:"You: Thanks! Will check it out.",
      msgs:[
        { from:"them", text:"Have you seen the new Travel Helper?", time:"1h ago" },
        { from:"me",   text:"Thanks! Will check it out.",          time:"1h ago" },
      ],
    },
    {
      id:"c04", name:"Ravi Kumar", avatar:"RK", color:"#059669",
      online:false, unread:0, time:"Yesterday",
      preview:"You: Good night! 🌙",
      msgs:[
        { from:"them", text:"How many languages does Vaani support?", time:"Yesterday" },
        { from:"me",   text:"Over 30 Indian languages!",              time:"Yesterday" },
        { from:"them", text:"Wow, that's impressive!",                time:"Yesterday" },
        { from:"me",   text:"Good night! 🌙",                        time:"Yesterday" },
      ],
    },
    {
      id:"c05", name:"Sunita Mehta", avatar:"SM", color:"#065f46",
      online:true, unread:0, time:"Mon",
      preview:"You: See you tomorrow.",
      msgs:[
        { from:"me",   text:"Are you coming to the language workshop?", time:"Mon" },
        { from:"them", text:"Yes! Really excited.",                     time:"Mon" },
        { from:"me",   text:"See you tomorrow.",                        time:"Mon" },
      ],
    },
  ];

  /* ══════════════════════════════════════════════════════════════
     STATE
  ══════════════════════════════════════════════════════════════ */

  var _activeTab   = "people";
  var _activeChat  = null;
  var _searchQuery = "";
  var _connected   = {};
  var _eventsReady = false;   /* bind events only once */

  PEOPLE.forEach(function(p){ if (p.connected) _connected[p.id] = true; });

  /* ══════════════════════════════════════════════════════════════
     UTILITIES
  ══════════════════════════════════════════════════════════════ */

  function _esc(s) {
    var d = document.createElement("div");
    d.appendChild(document.createTextNode(String(s || "")));
    return d.innerHTML;
  }

  function _avatarHtml(initials, color, online) {
    var dot = online ? '<span class="cu-online-dot"></span>' : "";
    return '<div class="cu-avatar" style="background:' + color + '">'
      + '<div class="cu-avatar-ring"></div>'
      + _esc(initials) + dot
      + '</div>';
  }

  function _resizeTextarea(el) {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }

  /* ══════════════════════════════════════════════════════════════
     RENDER — PEOPLE TAB
  ══════════════════════════════════════════════════════════════ */

  function _renderPeople() {
    var list = _id("cuPeopleList");
    if (!list) return;

    var q = _searchQuery.toLowerCase();
    var items = PEOPLE.filter(function(p) {
      return !q
        || p.name.toLowerCase().indexOf(q) !== -1
        || p.handle.toLowerCase().indexOf(q) !== -1;
    });

    if (!items.length) {
      list.innerHTML = '<div class="cu-no-results">'
        + '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/>'
        + '<line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>'
        + '<p>No results for "' + _esc(_searchQuery) + '"</p></div>';
      return;
    }

    list.innerHTML = items.map(function(p, i) {
      var conn   = !!_connected[p.id];
      var btnCls = "cu-connect-btn" + (conn ? " cu-connected" : "");
      var label  = conn ? "✓ Connected" : "+ Connect";
      return '<div class="cu-people-card" data-uid="' + p.id + '" style="animation-delay:' + (i * 40) + 'ms">'
        + _avatarHtml(p.avatar, p.color, p.online)
        + '<div class="cu-people-info">'
        +   '<div class="cu-people-name">' + _esc(p.name)   + '</div>'
        +   '<div class="cu-people-id">'   + _esc(p.handle) + '</div>'
        + '</div>'
        + '<button class="' + btnCls + '" data-uid="' + p.id + '">' + label + '</button>'
        + '</div>';
    }).join("");

    /* Connect button handlers */
    list.querySelectorAll(".cu-connect-btn").forEach(function(btn) {
      btn.addEventListener("click", function(e) {
        e.stopPropagation();
        var uid = btn.dataset.uid;
        if (_connected[uid]) return;
        _connected[uid] = true;
        btn.textContent = "✓ Connected";
        btn.classList.add("cu-connected");
        btn.style.transform = "scale(1.1)";
        setTimeout(function() { btn.style.transform = ""; }, 200);
      });
    });
  }

  /* ══════════════════════════════════════════════════════════════
     RENDER — CHATS TAB
  ══════════════════════════════════════════════════════════════ */

  function _renderChats() {
    var list = _id("cuChatList");
    if (!list) return;

    var q = _searchQuery.toLowerCase();
    var items = CHATS.filter(function(c) {
      return !q
        || c.name.toLowerCase().indexOf(q)    !== -1
        || c.preview.toLowerCase().indexOf(q) !== -1;
    });

    if (!items.length) {
      list.innerHTML = '<div class="cu-no-results">'
        + '<svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>'
        + '<p>No chats match "' + _esc(_searchQuery) + '"</p></div>';
      return;
    }

    list.innerHTML = items.map(function(c, i) {
      var isActive  = _activeChat && _activeChat.id === c.id;
      var hasUnread = c.unread > 0;
      var pCls      = "cu-chat-preview" + (hasUnread ? " cu-unread-preview" : "");
      return '<div class="cu-chat-item' + (isActive ? " cu-active" : "") + '" data-cid="' + c.id + '" style="animation-delay:' + (i * 40) + 'ms">'
        + _avatarHtml(c.avatar, c.color, c.online)
        + '<div class="cu-chat-info">'
        +   '<div class="cu-chat-row">'
        +     '<div class="cu-chat-name">' + _esc(c.name) + '</div>'
        +     '<div class="cu-chat-time">' + _esc(c.time) + '</div>'
        +   '</div>'
        +   '<div class="cu-chat-preview-row">'
        +     '<div class="' + pCls + '">' + _esc(c.preview) + '</div>'
        +     (hasUnread ? '<div class="cu-unread-badge">' + c.unread + '</div>' : '')
        +   '</div>'
        + '</div>'
        + '</div>';
    }).join("");

    list.querySelectorAll(".cu-chat-item").forEach(function(el) {
      el.addEventListener("click", function() {
        var cid  = el.dataset.cid;
        var chat = CHATS.filter(function(c) { return c.id === cid; })[0];
        if (chat) _openChat(chat);
      });
    });
  }

  /* ══════════════════════════════════════════════════════════════
     RENDER — MESSAGES
  ══════════════════════════════════════════════════════════════ */

  function _renderMessages(msgs) {
    var el = _id("cuMessages");
    if (!el) return;

    if (!msgs || !msgs.length) {
      el.innerHTML = '<div class="cu-empty-state">'
        + '<svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>'
        + '<strong>No messages yet</strong>'
        + '<span>Say hi and start the conversation!</span>'
        + '</div>';
      return;
    }

    var html = '<div class="cu-date-div"><span>Today</span></div>';
    msgs.forEach(function(msg) {
      var isMe = msg.from === "me";
      var tick = isMe ? '<span class="cu-read-tick">✓✓</span>' : "";
      html += '<div class="cu-bubble-wrap ' + (isMe ? "cu-me" : "cu-them") + '">'
        + '<div class="cu-bubble">' + _esc(msg.text) + '</div>'
        + '<div class="cu-bubble-meta">' + tick + ' ' + _esc(msg.time) + '</div>'
        + '</div>';
    });
    el.innerHTML = html;

    requestAnimationFrame(function() { el.scrollTop = el.scrollHeight; });
  }

  /* ══════════════════════════════════════════════════════════════
     OPEN CHAT
  ══════════════════════════════════════════════════════════════ */

  function _openChat(chat) {
    _activeChat = chat;
    chat.unread = 0;

    /* Populate header — all queried inside #pageChat */
    var avatar = _id("cuChatAvatar");
    var name   = _id("cuChatName");
    var status = _id("cuChatStatus");

    if (avatar) { avatar.textContent = chat.avatar; avatar.style.background = chat.color; }
    if (name)   { name.textContent = chat.name; }
    if (status) {
      status.innerHTML = chat.online
        ? '<span class="cu-status-dot"></span> Online'
        : 'Last seen recently';
      status.style.color = chat.online ? "#22c55e" : "var(--text3)";
    }

    _renderMessages(chat.msgs);
    _renderChats();   /* refresh sidebar to clear unread badge */

    /* Show chat view */
    var welcome  = _id("cuWelcome");
    var chatView = _id("cuChatView");
    if (welcome)  welcome.style.display  = "none";
    if (chatView) chatView.style.display = "flex";

    /* Mobile: slide right panel in */
    var right = _q(".cu-right");
    if (right) right.classList.add("cu-slide-in");

    /* Focus input */
    setTimeout(function() {
      var inp = _id("cuMsgInput");
      if (inp) inp.focus();
    }, 150);
  }

  /* ══════════════════════════════════════════════════════════════
     SEND DEMO MESSAGE
  ══════════════════════════════════════════════════════════════ */

  function _handleSend() {
    var inp  = _id("cuMsgInput");
    var text = inp ? inp.value.trim() : "";
    if (!text || !_activeChat) return;

    var now = new Date().toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" });
    _activeChat.msgs.push({ from:"me", text:text, time:now });
    _activeChat.preview = "You: " + (text.length > 40 ? text.slice(0,40)+"…" : text);
    _activeChat.time    = "now";

    _renderMessages(_activeChat.msgs);
    _renderChats();

    if (inp) { inp.value = ""; _resizeTextarea(inp); }
    var btn = _id("cuSendBtn");
    if (btn) btn.disabled = true;

    /* Simulated reply */
    var replies = ["Got it 👍","That's great! 😊","Sure, let me check.",
                   "Interesting! Tell me more.","😄","I'll get back to you."];
    setTimeout(function() {
      if (!_activeChat) return;
      var reply = replies[Math.floor(Math.random() * replies.length)];
      var t     = new Date().toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" });
      _activeChat.msgs.push({ from:"them", text:reply, time:t });
      _activeChat.preview = reply;
      _activeChat.time    = "now";
      _renderMessages(_activeChat.msgs);
      _renderChats();
    }, 1400);
  }

  /* ══════════════════════════════════════════════════════════════
     TAB SWITCHING
  ══════════════════════════════════════════════════════════════ */

  function _switchTab(tab) {
    _activeTab = tab;

    var tabPeople   = _id("cuTabPeople");
    var tabChats    = _id("cuTabChats");
    var panelPeople = _id("cuPanelPeople");
    var panelChats  = _id("cuPanelChats");
    var indicator   = _id("cuTabIndicator");

    if (!tabPeople || !tabChats) return;

    var isPeople = tab === "people";
    tabPeople.classList.toggle("active", isPeople);
    tabChats.classList.toggle("active",  !isPeople);
    tabPeople.setAttribute("aria-selected", isPeople ? "true" : "false");
    tabChats.setAttribute("aria-selected",  isPeople ? "false" : "true");

    if (panelPeople) panelPeople.classList.toggle("active", isPeople);
    if (panelChats)  panelChats.classList.toggle("active",  !isPeople);

    /* Slide the indicator under the active tab */
    if (indicator) {
      var activeBtn = isPeople ? tabPeople : tabChats;
      indicator.style.left  = activeBtn.offsetLeft  + "px";
      indicator.style.width = activeBtn.offsetWidth + "px";
    }

    if (isPeople) _renderPeople();
    else          _renderChats();
  }

  /* ══════════════════════════════════════════════════════════════
     SEARCH
  ══════════════════════════════════════════════════════════════ */

  function _handleSearch(val) {
    _searchQuery = val.trim();
    var clearBtn = _id("cuSearchClear");
    if (clearBtn) clearBtn.style.display = _searchQuery ? "flex" : "none";
    if (_activeTab === "people") _renderPeople();
    else                         _renderChats();
  }

  /* ══════════════════════════════════════════════════════════════
     BIND EVENTS — only once, only inside #pageChat
  ══════════════════════════════════════════════════════════════ */

  function _bindEvents() {
    if (_eventsReady) return;
    if (!_root())     return;
    _eventsReady = true;

    /* Tabs */
    var tPeople = _id("cuTabPeople");
    var tChats  = _id("cuTabChats");
    if (tPeople) tPeople.addEventListener("click", function() { _switchTab("people"); });
    if (tChats)  tChats.addEventListener("click",  function() { _switchTab("chats");  });

    /* Search */
    var searchInp   = _id("cuSearch");
    var searchClear = _id("cuSearchClear");
    if (searchInp) {
      searchInp.addEventListener("input", function() { _handleSearch(searchInp.value); });
    }
    if (searchClear) {
      searchClear.addEventListener("click", function() {
        if (searchInp) searchInp.value = "";
        _handleSearch("");
        if (searchInp) searchInp.focus();
      });
    }

    /* Send */
    var sendBtn = _id("cuSendBtn");
    var inp     = _id("cuMsgInput");
    if (sendBtn) sendBtn.addEventListener("click", _handleSend);
    if (inp) {
      inp.addEventListener("keydown", function(e) {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); _handleSend(); }
      });
      inp.addEventListener("input", function() {
        if (sendBtn) sendBtn.disabled = !inp.value.trim();
        _resizeTextarea(inp);
      });
    }

    /* Back button (mobile) */
    var backBtn = _id("cuBackBtn");
    if (backBtn) {
      backBtn.addEventListener("click", function() {
        var right    = _q(".cu-right");
        var welcome  = _id("cuWelcome");
        var chatView = _id("cuChatView");
        if (right)    right.classList.remove("cu-slide-in");
        if (welcome)  welcome.style.display  = "flex";
        if (chatView) chatView.style.display = "none";
        _activeChat = null;
        _renderChats();
      });
    }

    /* Welcome chips */
    _qa(".cu-chip").forEach(function(chip, i) {
      chip.addEventListener("click", function() {
        _switchTab(i === 0 ? "people" : "chats");
      });
    });
  }

  /* ══════════════════════════════════════════════════════════════
     REFRESH — called by app.js _onPageActivate when Chat opens
  ══════════════════════════════════════════════════════════════ */

  function _refresh() {
    if (!_root()) return;
    _bindEvents();

    /* Update people badge */
    var pb = _id("cuPeopleBadge");
    if (pb) pb.textContent = PEOPLE.length;

    /* Update chats badge */
    var cb = _id("cuChatsBadge");
    if (cb) {
      var total = CHATS.reduce(function(s,c){ return s + (c.unread||0); }, 0);
      cb.textContent = total || "";
      cb.style.display = total ? "inline-flex" : "none";
    }

    /* Render active tab */
    setTimeout(function() { _switchTab(_activeTab); }, 50);
  }

  /* ══════════════════════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════════════════════ */

  function _init() {
    if (!_root()) return;   /* #pageChat not in DOM yet — safe exit */
    _refresh();
    console.log("[Vaani Chat UI] ✓ Initialized — scoped to #pageChat");
  }

  /* PUBLIC — called by app.js */
  window.vaaniChatUI = {
    refresh: _refresh,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", _init);
  } else {
    _init();
  }

})();
