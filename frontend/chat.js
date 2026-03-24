/* ================================================================
   Vaani — chat.js  v3.1  CLEAN UI + PROFILE SIDE MENU
   ================================================================
   CHANGES FROM v3.0:
   ─────────────────────────────────────────────────────────────────
   • "Group Chat" header replaced with a minimal top bar containing
     only the profile avatar (clickable) and a compose icon.
   • Left-side profile menu slides in when avatar is clicked.
     Shows: avatar, @username, email, and menu options.
   • Message input bar kept (it was needed for chat to work).
   • "No messages yet" empty state kept but styled more minimally.
   • All Firebase/auth/router logic untouched.
================================================================ */

(function () {
  "use strict";

  var COLLECTION   = "vaani_messages";
  var MAX_MESSAGES = 100;
  var CHAT_ROOT_ID = "vaaniChat";

  var _unsubscribeDB  = null;
  var _currentUser    = null;
  var _currentProfile = null;
  var _menuOpen       = false;

  /* ── DOM helpers ─────────────────────────────────────────────── */
  function _root()  { return document.getElementById(CHAT_ROOT_ID); }
  function _q(sel)  { var r = _root(); return r ? r.querySelector(sel) : null; }

  function _esc(s) {
    var d = document.createElement("div");
    d.appendChild(document.createTextNode(String(s || "")));
    return d.innerHTML;
  }

  function _fmtTime(ts) {
    if (!ts || !ts.toDate) return "";
    var d = ts.toDate(), h = d.getHours(), m = d.getMinutes();
    var ampm = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return h + ":" + (m < 10 ? "0" + m : m) + " " + ampm;
  }

  function _googleLogoSvg() {
    return (
      '<svg class="vg-g-logo" viewBox="0 0 24 24" fill="none">' +
        '<path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>' +
        '<path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>' +
        '<path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>' +
        '<path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>' +
      '</svg>'
    );
  }

  /* ════════════════════════════════════════════════════════════════
     PROFILE SIDE MENU
  ════════════════════════════════════════════════════════════════ */

  function _buildMenuHtml(user, profile) {
    var username  = profile.username || "user";
    var email     = user.email || "";
    var photoURL  = user.photoURL || "";
    var initials  = username[0].toUpperCase();

    return (
      /* Overlay */
      '<div class="vm-overlay" id="vmOverlay"></div>' +

      /* Side panel */
      '<div class="vm-panel" id="vmPanel">' +

        /* Header */
        '<div class="vm-header">' +
          '<div class="vm-header-avatar">' +
            (photoURL
              ? '<img src="' + _esc(photoURL) + '" alt="avatar">'
              : '<span>' + _esc(initials) + '</span>'
            ) +
          '</div>' +
          '<div class="vm-header-info">' +
            '<div class="vm-username">@' + _esc(username) + '</div>' +
            (email ? '<div class="vm-email">' + _esc(email) + '</div>' : '') +
          '</div>' +
          '<button class="vm-close" id="vmClose" aria-label="Close menu">' +
            '<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
          '</button>' +
        '</div>' +

        /* Menu items */
        '<nav class="vm-nav">' +
          _menuItem("person", "My Profile",          "profile") +
          _menuItem("globe",  "Languages",           "languages") +
          _menuItem("settings", "Settings",          "settings") +
          _menuItem("users",  "Manage Connections",  "connections") +
        '</nav>' +

        /* Footer */
        '<div class="vm-footer">' +
          '<button class="vm-signout" id="vmSignOut">' +
            '<svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>' +
            '<polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>' +
            'Sign out' +
          '</button>' +
        '</div>' +

      '</div>'
    );
  }

  function _menuItem(icon, label, action) {
    var icons = {
      person:   '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
      globe:    '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
      settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
      users:    '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    };
    return (
      '<button class="vm-item" data-action="' + action + '">' +
        '<svg viewBox="0 0 24 24">' + (icons[icon] || '') + '</svg>' +
        '<span>' + _esc(label) + '</span>' +
        '<svg class="vm-chevron" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>' +
      '</button>'
    );
  }

  function _injectMenu(user, profile) {
    /* Remove any existing menu */
    var existing = document.getElementById("vmOverlay");
    if (existing) existing.remove();
    var existingPanel = document.getElementById("vmPanel");
    if (existingPanel) existingPanel.remove();

    /* Inject into body (not into #vaaniChat — so it overlays everything) */
    var wrapper = document.createElement("div");
    wrapper.id  = "vmWrapper";
    wrapper.innerHTML = _buildMenuHtml(user, profile);
    document.body.appendChild(wrapper);

    /* Bind events */
    var overlay = document.getElementById("vmOverlay");
    var panel   = document.getElementById("vmPanel");
    var closeBtn= document.getElementById("vmClose");
    var signOut = document.getElementById("vmSignOut");

    function _openMenu() {
      if (!panel || !overlay) return;
      _menuOpen = true;
      panel.classList.add("vm-open");
      overlay.classList.add("vm-open");
    }

    function _closeMenu() {
      if (!panel || !overlay) return;
      _menuOpen = false;
      panel.classList.remove("vm-open");
      overlay.classList.remove("vm-open");
    }

    /* Expose open so the avatar button can call it */
    window._vaaniOpenProfileMenu = _openMenu;

    overlay.addEventListener("click",   _closeMenu);
    if (closeBtn) closeBtn.addEventListener("click", _closeMenu);

    /* Menu item actions */
    var items = document.querySelectorAll(".vm-item");
    items.forEach(function (item) {
      item.addEventListener("click", function () {
        var action = this.dataset.action;
        _closeMenu();

        if (action === "settings") {
          /* Navigate to Settings page if navigateTo is available */
          if (typeof window.navigateTo === "function") {
            window.navigateTo("Settings");
          }
        } else {
          /* Placeholder for future features */
          if (typeof window.showToast === "function") {
            window.showToast("Coming soon: " + this.querySelector("span").textContent);
          }
        }
      });
    });

    if (signOut) {
      signOut.addEventListener("click", function () {
        _closeMenu();
        _stopListening();
        if (window.vaaniRouter && typeof window.vaaniRouter.signOut === "function") {
          window.vaaniRouter.signOut();
        }
      });
    }
  }

  /* ════════════════════════════════════════════════════════════════
     SCREEN 1 — LOGIN
  ════════════════════════════════════════════════════════════════ */

  function _renderLogin() {
    var root = _root();
    if (!root) return;
    _stopListening();
    _removeMenu();

    root.innerHTML =
      '<div class="vg-screen vg-login-screen">' +
        '<div class="vg-card">' +
          '<div class="vg-card-icon">' +
            '<svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' +
          '</div>' +
          '<h2 class="vg-card-title">Join the Conversation</h2>' +
          '<p class="vg-card-sub">Sign in to connect with other Vaani users in real time — across languages.</p>' +
          '<button class="vg-google-btn" id="vgSignInBtn">' +
            _googleLogoSvg() + 'Continue with Google' +
          '</button>' +
          '<p class="vg-hint">Translation features work without signing in ✓</p>' +
        '</div>' +
      '</div>';

    var btn = document.getElementById("vgSignInBtn");
    if (!btn) return;
    btn.addEventListener("click", async function () {
      btn.disabled    = true;
      btn.textContent = "Signing in…";
      try {
        await window.vaaniRouter.signIn();
      } catch (_) {
        btn.disabled  = false;
        btn.innerHTML = _googleLogoSvg() + "Continue with Google";
      }
    });
  }

  /* ════════════════════════════════════════════════════════════════
     SCREEN 2 — CREATE PROFILE
  ════════════════════════════════════════════════════════════════ */

  function _renderProfile(user) {
    var root = _root();
    if (!root) return;
    _stopListening();
    _removeMenu();

    var firstName = (user.displayName || "").split(" ")[0] || "";
    var suggested = firstName.toLowerCase().replace(/[^a-z0-9]/g, "");

    root.innerHTML =
      '<div class="vg-screen vg-profile-screen">' +
        '<div class="vg-card">' +
          '<div class="vg-avatar-wrap">' +
            (user.photoURL
              ? '<img class="vg-profile-avatar" src="' + _esc(user.photoURL) + '" alt="avatar">'
              : '<div class="vg-profile-avatar vg-avatar-fallback">' + _esc((firstName[0] || "?").toUpperCase()) + '</div>'
            ) +
          '</div>' +
          '<h2 class="vg-card-title">Create Your Profile</h2>' +
          '<p class="vg-card-sub">Hi ' + _esc(firstName || "there") + '! Choose a unique username.</p>' +
          '<div class="vg-field">' +
            '<label class="vg-label" for="vgUsernameInput">Username</label>' +
            '<div class="vg-input-wrap">' +
              '<span class="vg-input-prefix">@</span>' +
              '<input id="vgUsernameInput" class="vg-input" type="text" ' +
                     'maxlength="20" autocomplete="off" spellcheck="false" ' +
                     'placeholder="yourname_01" value="' + _esc(suggested) + '">' +
            '</div>' +
            '<span class="vg-field-hint" id="vgUsernameHint">' +
              'Must have letters + numbers · 3–20 chars · e.g. pravallika_03' +
            '</span>' +
          '</div>' +
          '<button class="vg-primary-btn" id="vgCreateProfileBtn" disabled>Create Profile</button>' +
          '<button class="vg-ghost-btn" id="vgSignOutBtn">Sign out</button>' +
        '</div>' +
      '</div>';

    var input     = document.getElementById("vgUsernameInput");
    var hint      = document.getElementById("vgUsernameHint");
    var createBtn = document.getElementById("vgCreateProfileBtn");

    function _validate() {
      if (!input || !hint || !createBtn) return;
      var err = (window.vaaniProfile && window.vaaniProfile.validateUsername)
        ? window.vaaniProfile.validateUsername(input.value) : null;
      if (err) {
        hint.textContent   = err;
        hint.className     = "vg-field-hint vg-hint-error";
        createBtn.disabled = true;
      } else {
        hint.textContent   = "✓ Username looks good!";
        hint.className     = "vg-field-hint vg-hint-success";
        createBtn.disabled = false;
      }
    }

    if (input) { input.addEventListener("input", _validate); _validate(); }

    if (createBtn) {
      createBtn.addEventListener("click", async function () {
        var username = input ? input.value.trim() : "";
        var err = (window.vaaniProfile && window.vaaniProfile.validateUsername)
          ? window.vaaniProfile.validateUsername(username) : null;
        if (err) {
          if (hint) { hint.textContent = err; hint.className = "vg-field-hint vg-hint-error"; }
          return;
        }
        createBtn.disabled    = true;
        createBtn.textContent = "Creating…";
        if (hint) { hint.textContent = "Saving…"; hint.className = "vg-field-hint"; hint.style.color = ""; }
        try {
          var profile = await window.vaaniProfile.create(user, username);
          window.vaaniRouter.goToChat(user, profile);
        } catch (e) {
          var msg = e.message || "Something went wrong.";
          if (hint) { hint.textContent = msg; hint.className = "vg-field-hint vg-hint-error"; }
          createBtn.disabled    = false;
          createBtn.textContent = "Create Profile";
        }
      });
    }

    var signOutBtn = document.getElementById("vgSignOutBtn");
    if (signOutBtn) {
      signOutBtn.addEventListener("click", function () { window.vaaniRouter.signOut(); });
    }
  }

  /* ════════════════════════════════════════════════════════════════
     SCREEN 3 — CHAT UI  (CLEAN, NO HEADER CLUTTER)
  ════════════════════════════════════════════════════════════════ */

  function _renderChat(user, profile) {
    var root = _root();
    if (!root) return;

    _currentUser    = user;
    _currentProfile = profile;

    var db          = window.vaaniRouter ? window.vaaniRouter.getDb() : null;
    var photoURL    = user.photoURL || "";
    var initials    = (profile.username || "U")[0].toUpperCase();

    /* ── Inject the side menu into <body> ── */
    _injectMenu(user, profile);

    /* ── Clean chat layout ── */
    root.innerHTML =

      /* Minimal top bar — avatar only (no title text) */
      '<div class="vc-topbar">' +
        '<button class="vc-avatar-btn" id="vcProfileBtn" title="Profile menu" aria-label="Open profile menu">' +
          (photoURL
            ? '<img src="' + _esc(photoURL) + '" alt="avatar" class="vc-avatar-img">'
            : '<span class="vc-avatar-initials">' + _esc(initials) + '</span>'
          ) +
          '<span class="vc-online-ring"></span>' +
        '</button>' +
        '<div class="vc-topbar-center">' +
          '<span class="vc-room-name">Vaani Chat</span>' +
        '</div>' +
        '<div class="vc-topbar-right">' +
          /* Placeholder for future actions (search, etc.) */
        '</div>' +
      '</div>' +

      /* Status bar */
      '<div class="vc-status" style="display:none"></div>' +

      /* Messages */
      '<div class="vc-messages" id="vcMessages"></div>' +

      /* Input bar */
      '<div class="vc-input-bar">' +
        '<div class="vc-input-wrap">' +
          '<textarea class="vc-msg-input" id="vcMsgInput" ' +
                    'placeholder="Type a message…" rows="1" maxlength="2000" ' +
                    'aria-label="Message"></textarea>' +
        '</div>' +
        '<button class="vc-send-btn" id="vcSendBtn" disabled aria-label="Send">' +
          '<svg viewBox="0 0 24 24">' +
            '<line x1="22" y1="2" x2="11" y2="13"/>' +
            '<polygon points="22 2 15 22 11 13 2 9 22 2"/>' +
          '</svg>' +
        '</button>' +
      '</div>';

    /* Bind avatar → open menu */
    var profileBtn = document.getElementById("vcProfileBtn");
    if (profileBtn) {
      profileBtn.addEventListener("click", function () {
        if (typeof window._vaaniOpenProfileMenu === "function") {
          window._vaaniOpenProfileMenu();
        }
      });
    }

    _bindInputEvents(user, profile, db);
    _startListening(user, db);
  }

  /* ── Remove menu from DOM (called on login/profile screens) ─── */
  function _removeMenu() {
    var w = document.getElementById("vmWrapper");
    if (w) w.remove();
    window._vaaniOpenProfileMenu = null;
  }

  /* ── Input bindings ──────────────────────────────────────────── */
  function _bindInputEvents(user, profile, db) {
    var sendBtn  = document.getElementById("vcSendBtn");
    var msgInput = document.getElementById("vcMsgInput");

    function _doSend() {
      var text = msgInput ? msgInput.value.trim() : "";
      if (!text || !db) return;
      _sendMessage(text, user, profile, db);
      msgInput.value = "";
      if (sendBtn) sendBtn.disabled = true;
      _autoResize(msgInput);
    }

    if (sendBtn) sendBtn.addEventListener("click", _doSend);
    if (msgInput) {
      msgInput.addEventListener("input", function () {
        if (sendBtn) sendBtn.disabled = !msgInput.value.trim();
        _autoResize(msgInput);
      });
      msgInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); _doSend(); }
      });
    }
  }

  function _autoResize(el) {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }

  /* ── Send message ────────────────────────────────────────────── */
  function _sendMessage(text, user, profile, db) {
    if (!db || !text.trim()) return;
    db.collection(COLLECTION).add({
      text:      text.trim(),
      user:      profile.username || "anon",
      uid:       user.uid,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    }).catch(function (err) {
      console.error("[Vaani Chat] Send failed:", err.code, err.message);
      var el = _q(".vc-status");
      if (el) {
        el.textContent   = "Send failed: " + (err.code || err.message);
        el.className     = "vc-status vc-error";
        el.style.display = "block";
      }
    });
  }

  /* ── Real-time listener ──────────────────────────────────────── */
  function _startListening(user, db) {
    if (!db) return;
    _stopListening();

    var q = db.collection(COLLECTION)
              .orderBy("createdAt", "asc")
              .limitToLast(MAX_MESSAGES);

    _unsubscribeDB = q.onSnapshot(
      function (snap) {
        var msgs = [];
        snap.forEach(function (doc) { msgs.push(doc.data()); });
        _renderMessages(msgs, user);
      },
      function (err) {
        console.error("[Vaani Chat] Snapshot error:", err);
        var el = _q(".vc-status");
        if (el) {
          el.textContent   = "Real-time updates paused.";
          el.className     = "vc-status vc-error";
          el.style.display = "block";
        }
      }
    );
  }

  function _stopListening() {
    if (_unsubscribeDB) { _unsubscribeDB(); _unsubscribeDB = null; }
  }

  /* ── Render messages ─────────────────────────────────────────── */
  function _renderMessages(msgs, user) {
    var container = document.getElementById("vcMessages");
    if (!container) return;

    if (!msgs || msgs.length === 0) {
      container.innerHTML =
        '<div class="vc-empty">' +
          '<div class="vc-empty-icon">' +
            '<svg viewBox="0 0 24 24">' +
              '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>' +
            '</svg>' +
          '</div>' +
          '<p class="vc-empty-title">Start the conversation</p>' +
          '<p class="vc-empty-sub">Be the first to say hello 👋</p>' +
        '</div>';
      return;
    }

    var myUid   = user ? user.uid : null;
    var html    = "";
    var lastDay = "";

    msgs.forEach(function (msg) {
      if (msg.createdAt && msg.createdAt.toDate) {
        var d        = msg.createdAt.toDate();
        var dayLabel = d.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
        if (dayLabel !== lastDay) {
          html += '<div class="vc-date-div"><span>' + _esc(dayLabel) + "</span></div>";
          lastDay = dayLabel;
        }
      }

      var isMe = myUid && msg.uid === myUid;
      html +=
        '<div class="vc-bubble-wrap ' + (isMe ? "vc-me" : "vc-them") + '">' +
          (!isMe
            ? '<div class="vc-sender-row">' +
                '<div class="vc-sender-dot"></div>' +
                '<span class="vc-sender">@' + _esc(msg.user || "?") + '</span>' +
              '</div>'
            : ''
          ) +
          '<div class="vc-bubble">' + _esc(msg.text) + '</div>' +
          '<div class="vc-time">' + _esc(_fmtTime(msg.createdAt)) + '</div>' +
        '</div>';
    });

    container.innerHTML = html;
    requestAnimationFrame(function () { container.scrollTop = container.scrollHeight; });
  }

  /* ════════════════════════════════════════════════════════════════
     PUBLIC API — identical to v3.0
  ════════════════════════════════════════════════════════════════ */
  window.vaaniChat = {

    open: function () {
      var root = _root();
      if (root && !root.children.length) {
        root.innerHTML =
          '<div class="vg-screen vg-loading-screen">' +
            '<div class="vg-spinner"></div>' +
            '<p>Loading…</p>' +
          '</div>';
      }
      if (window.vaaniRouter && typeof window.vaaniRouter.getAuth === "function") {
        var auth = window.vaaniRouter.getAuth();
        if (auth) {
          var user = auth.currentUser;
          if (user && window._vaaniCurrentUser) {
            window.vaaniRouter.getDb()
              .collection("users").doc(user.uid).get()
              .then(function (doc) {
                if (doc.exists && doc.data().username) {
                  _renderChat(user, doc.data());
                } else {
                  _renderProfile(user);
                }
              })
              .catch(function () { _renderProfile(user); });
          }
        }
      }
    },

    close: function () {
      _stopListening();
    },

    _renderLogin:   _renderLogin,
    _renderProfile: _renderProfile,
    _renderChat:    _renderChat,

    loadUsers: function () { this.open(); },
  };

  console.log("[Vaani Chat] chat.js v3.1 loaded ✓");

})();
