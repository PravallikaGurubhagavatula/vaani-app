/* ================================================================
   Vaani — chat-ui.js  v9
   ALL DOM queries are scoped inside #pageChat.
   ZERO global DOM injection. ZERO side-effects on other pages.
================================================================ */

(function () {
  "use strict";

  /* ── Scope helpers — ALWAYS query inside #pageChat ───────────*/
  function _root() { return document.getElementById("pageChat"); }
  function _q(sel) { var r = _root(); return r ? r.querySelector(sel) : null; }
  function _qa(sel) { var r = _root(); return r ? Array.prototype.slice.call(r.querySelectorAll(sel)) : []; }
  function _id(id)  { var r = _root(); return r ? r.querySelector("#" + id) : null; }

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
      preview:"Just sent you the translation \uD83D\uDE0A",
      msgs:[
        { from:"them", text:"Hey! Can you help me translate something?", time:"9:41 AM" },
        { from:"me",   text:"Of course! Which language?",                time:"9:42 AM" },
        { from:"them", text:"Telugu to Hindi please.",                   time:"9:43 AM" },
        { from:"me",   text:"Sure, go ahead and type it!",               time:"9:44 AM" },
        { from:"them", text:"Just sent you the translation \uD83D\uDE0A", time:"9:45 AM" },
      ],
    },
    {
      id:"c02", name:"Arjun Reddy", avatar:"AR", color:"#7c3aed",
      online:true, unread:1, time:"2m",
      preview:"The voice feature is amazing \uD83C\uDFA4",
      msgs:[
        { from:"them", text:"Bro, tried the Vaani app today.",   time:"Yesterday" },
        { from:"me",   text:"How was it?",                       time:"Yesterday" },
        { from:"them", text:"The voice feature is amazing \uD83C\uDFA4", time:"2m ago" },
      ],
    },
    {
      id:"c03", name:"Meena Iyer", avatar:"MI", color:"#db2777",
      online:true, unread:0, time:"1h",
      preview:"You: Thanks! Will check it out.",
      msgs:[
        { from:"them", text:"Have you seen the new Travel Helper?", time:"1h ago" },
        { from:"me",   text:"Thanks! Will check it out.",           time:"1h ago" },
      ],
    },
    {
      id:"c04", name:"Ravi Kumar", avatar:"RK", color:"#059669",
      online:false, unread:0, time:"Yesterday",
      preview:"You: Good night! \uD83C\uDF19",
      msgs:[
        { from:"them", text:"How many languages does Vaani support?", time:"Yesterday" },
        { from:"me",   text:"Over 30 Indian languages!",              time:"Yesterday" },
        { from:"them", text:"Wow, that's impressive!",                time:"Yesterday" },
        { from:"me",   text:"Good night! \uD83C\uDF19",              time:"Yesterday" },
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

  /* ── State ──────────────────────────────────────────────────*/
  var _activeTab   = "people";
  var _activeChat  = null;
  var _searchQuery = "";
  var _connected   = {};
  var _bound       = false;

  PEOPLE.forEach(function (p) { if (p.connected) _connected[p.id] = true; });

  /* ── Utilities ──────────────────────────────────────────────*/
  function _esc(s) {
    var d = document.createElement("div");
    d.appendChild(document.createTextNode(String(s || "")));
    return d.innerHTML;
  }

  function _avatarHtml(initials, color, online) {
    var dot = online ? '<span class="cu-online-dot"></span>' : "";
    return '<div class="cu-avatar" style="background:' + color + '">'
      + '<div class="cu-avatar-ring"></div>'
      + _esc(initials) + dot + '</div>';
  }

  function _resizeTA(el) {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }

  /* ── Render People ──────────────────────────────────────────*/
  function _renderPeople() {
    var list = _id("cuPeopleList");
    if (!list) return;
    var q = _searchQuery.toLowerCase();
    var items = PEOPLE.filter(function (p) {
      return !q || p.name.toLowerCase().indexOf(q) !== -1 || p.handle.toLowerCase().indexOf(q) !== -1;
    });
    if (!items.length) {
      list.innerHTML = '<div class="cu-no-results">'
        + '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>'
        + '<p>No results for "' + _esc(_searchQuery) + '"</p></div>';
      return;
    }
    list.innerHTML = items.map(function (p, i) {
      var conn = !!_connected[p.id];
      return '<div class="cu-people-card" data-uid="' + p.id + '" style="animation-delay:' + (i * 40) + 'ms">'
        + _avatarHtml(p.avatar, p.color, p.online)
        + '<div class="cu-people-info">'
        +   '<div class="cu-people-name">' + _esc(p.name)   + '</div>'
        +   '<div class="cu-people-id">'   + _esc(p.handle) + '</div>'
        + '</div>'
        + '<button class="cu-connect-btn' + (conn ? ' cu-connected' : '') + '" data-uid="' + p.id + '">'
        + (conn ? '✓ Connected' : '+ Connect') + '</button>'
        + '</div>';
    }).join("");

    list.querySelectorAll(".cu-connect-btn").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        var uid = btn.dataset.uid;
        if (_connected[uid]) return;
        _connected[uid] = true;
        btn.textContent = "✓ Connected";
        btn.classList.add("cu-connected");
        btn.style.transform = "scale(1.1)";
        setTimeout(function () { btn.style.transform = ""; }, 200);
      });
    });
  }

  /* ── Render Chats ───────────────────────────────────────────*/
  function _renderChats() {
    var list = _id("cuChatList");
    if (!list) return;
    var q = _searchQuery.toLowerCase();
    var items = CHATS.filter(function (c) {
      return !q || c.name.toLowerCase().indexOf(q) !== -1 || c.preview.toLowerCase().indexOf(q) !== -1;
    });
    if (!items.length) {
      list.innerHTML = '<div class="cu-no-results">'
        + '<svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>'
        + '<p>No chats match "' + _esc(_searchQuery) + '"</p></div>';
      return;
    }
    list.innerHTML = items.map(function (c, i) {
      var isActive  = _activeChat && _activeChat.id === c.id;
      var hasUnread = c.unread > 0;
      return '<div class="cu-chat-item' + (isActive ? ' cu-active' : '') + '" data-cid="' + c.id + '" style="animation-delay:' + (i * 40) + 'ms">'
        + _avatarHtml(c.avatar, c.color, c.online)
        + '<div class="cu-chat-info">'
        +   '<div class="cu-chat-row">'
        +     '<div class="cu-chat-name">' + _esc(c.name) + '</div>'
        +     '<div class="cu-chat-time">' + _esc(c.time) + '</div>'
        +   '</div>'
        +   '<div class="cu-chat-preview-row">'
        +     '<div class="cu-chat-preview' + (hasUnread ? ' cu-unread-preview' : '') + '">' + _esc(c.preview) + '</div>'
        +     (hasUnread ? '<div class="cu-unread-badge">' + c.unread + '</div>' : '')
        +   '</div>'
        + '</div></div>';
    }).join("");

    list.querySelectorAll(".cu-chat-item").forEach(function (el) {
      el.addEventListener("click", function () {
        var chat = CHATS.filter(function (c) { return c.id === el.dataset.cid; })[0];
        if (chat) _openChat(chat);
      });
    });
  }

  /* ── Render Messages ────────────────────────────────────────*/
  function _renderMessages(msgs) {
    var el = _id("cuMessages");
    if (!el) return;
    if (!msgs || !msgs.length) {
      el.innerHTML = '<div class="cu-no-messages">'
        + '<svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>'
        + '<p>No messages yet \u2014 say hi! \uD83D\uDC4B</p></div>';
      return;
    }
    var html = '<div class="cu-date-div"><span>Today</span></div>';
    msgs.forEach(function (msg) {
      var isMe = msg.from === "me";
      var tick = isMe ? '<span class="cu-read-tick">\u2713\u2713</span>' : "";
      html += '<div class="cu-bubble-wrap ' + (isMe ? 'cu-me' : 'cu-them') + '">'
        + '<div class="cu-bubble">' + _esc(msg.text) + '</div>'
        + '<div class="cu-bubble-meta">' + tick + ' ' + _esc(msg.time) + '</div>'
        + '</div>';
    });
    el.innerHTML = html;
    requestAnimationFrame(function () { el.scrollTop = el.scrollHeight; });
  }

  /* ── Open Chat ──────────────────────────────────────────────*/
  function _openChat(chat) {
    _activeChat = chat;
    chat.unread = 0;

    var avatar = _id("cuChatAvatar");
    var name   = _id("cuChatName");
    var status = _id("cuChatStatus");
    if (avatar) { avatar.textContent = chat.avatar; avatar.style.background = chat.color; }
    if (name)   { name.textContent = chat.name; }
    if (status) {
      status.innerHTML = chat.online ? '<span class="cu-status-dot"></span> Online' : 'Last seen recently';
      status.style.color = chat.online ? "#22c55e" : "var(--text3)";
    }

    _renderMessages(chat.msgs);
    _renderChats();   /* refresh to clear unread badge */

    var welcome  = _id("cuWelcome");
    var chatView = _id("cuChatView");
    if (welcome)  welcome.style.display  = "none";
    if (chatView) chatView.style.display = "flex";

    var right = _q(".cu-right");
    if (right) right.classList.add("cu-slide-in");

    setTimeout(function () { var inp = _id("cuMsgInput"); if (inp) inp.focus(); }, 150);
  }

  /* ── Send demo message ──────────────────────────────────────*/
  function _handleSend() {
    var inp  = _id("cuMsgInput");
    var text = inp ? inp.value.trim() : "";
    if (!text || !_activeChat) return;
    var now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    _activeChat.msgs.push({ from: "me", text: text, time: now });
    _activeChat.preview = "You: " + (text.length > 40 ? text.slice(0, 40) + "\u2026" : text);
    _activeChat.time    = "now";
    _renderMessages(_activeChat.msgs);
    _renderChats();
    if (inp) { inp.value = ""; _resizeTA(inp); }
    var btn = _id("cuSendBtn");
    if (btn) btn.disabled = true;

    var replies = ["Got it \uD83D\uDC4D", "That's great! \uD83D\uDE0A", "Sure, let me check.", "Interesting!", "\uD83D\uDE04", "I'll get back to you."];
    setTimeout(function () {
      if (!_activeChat) return;
      var reply = replies[Math.floor(Math.random() * replies.length)];
      var t = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      _activeChat.msgs.push({ from: "them", text: reply, time: t });
      _activeChat.preview = reply;
      _activeChat.time    = "now";
      _renderMessages(_activeChat.msgs);
      _renderChats();
    }, 1400);
  }

  /* ── Switch Tab ─────────────────────────────────────────────*/
  function _switchTab(tab) {
    _activeTab = tab;
    var tP  = _id("cuTabPeople");  var tC  = _id("cuTabChats");
    var pP  = _id("cuPanelPeople"); var pC  = _id("cuPanelChats");
    var ind = _id("cuTabIndicator");
    if (!tP || !tC) return;
    var isPeople = tab === "people";
    tP.classList.toggle("active", isPeople);
    tC.classList.toggle("active", !isPeople);
    tP.setAttribute("aria-selected", isPeople ? "true" : "false");
    tC.setAttribute("aria-selected",  isPeople ? "false" : "true");
    if (pP) pP.classList.toggle("active", isPeople);
    if (pC) pC.classList.toggle("active", !isPeople);
    if (ind) {
      var activeBtn = isPeople ? tP : tC;
      ind.style.left  = activeBtn.offsetLeft  + "px";
      ind.style.width = activeBtn.offsetWidth + "px";
    }
    if (isPeople) _renderPeople();
    else          _renderChats();
  }

  /* ── Search ─────────────────────────────────────────────────*/
  function _handleSearch(val) {
    _searchQuery = val.trim();
    var cb = _id("cuSearchClear");
    if (cb) cb.style.display = _searchQuery ? "flex" : "none";
    if (_activeTab === "people") _renderPeople();
    else                          _renderChats();
  }

  /* ── Bind Events (once, inside #pageChat only) ──────────────*/
  function _bindEvents() {
    if (_bound)   return;
    if (!_root()) return;
    _bound = true;

    var tP = _id("cuTabPeople"); var tC = _id("cuTabChats");
    if (tP) tP.addEventListener("click", function () { _switchTab("people"); });
    if (tC) tC.addEventListener("click", function () { _switchTab("chats");  });

    var si = _id("cuSearch"); var sc = _id("cuSearchClear");
    if (si) si.addEventListener("input", function () { _handleSearch(si.value); });
    if (sc) sc.addEventListener("click", function () {
      if (si) si.value = ""; _handleSearch(""); if (si) si.focus();
    });

    var sb = _id("cuSendBtn"); var inp = _id("cuMsgInput");
    if (sb) sb.addEventListener("click", _handleSend);
    if (inp) {
      inp.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); _handleSend(); }
      });
      inp.addEventListener("input", function () {
        if (sb) sb.disabled = !inp.value.trim();
        _resizeTA(inp);
      });
    }

    var bb = _id("cuBackBtn");
    if (bb) {
      bb.addEventListener("click", function () {
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

    _qa(".cu-chip").forEach(function (chip, i) {
      chip.addEventListener("click", function () { _switchTab(i === 0 ? "people" : "chats"); });
    });
  }

  /* ── Refresh (called by app.js when Chat page activates) ────*/
  function _refresh() {
    if (!_root()) return;
    _bindEvents();

    var pb = _id("cuPeopleBadge");
    if (pb) pb.textContent = PEOPLE.length;

    var cb = _id("cuChatsBadge");
    if (cb) {
      var total = CHATS.reduce(function (s, c) { return s + (c.unread || 0); }, 0);
      cb.textContent = total || "";
      cb.style.display = total ? "inline-flex" : "none";
    }

    setTimeout(function () { _switchTab(_activeTab); }, 50);
  }

  /* ── Init ───────────────────────────────────────────────────*/
  function _init() {
    if (!_root()) {
      console.warn("[Vaani Chat UI] #pageChat not found. Check index.html structure.");
      return;
    }
    _refresh();
    console.log("[Vaani Chat UI] \u2713 Initialized \u2014 scoped to #pageChat");
  }

  /* ── Public API (called by app.js _onPageActivate) ──────────*/
  window.vaaniChatUI = { refresh: _refresh };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", _init);
  } else {
    _init();
  }

})();
