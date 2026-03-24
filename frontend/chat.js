/* ================================================================
   Vaani — chat.js  v3.0  PURE UI RENDERER
   ================================================================
   ARCHITECTURE CHANGE from v2.x:
   ─────────────────────────────────────────────────────────────────
   v2.x: chat.js called _loadChatPage() which ran its own
         onAuthStateChanged listener → race conditions possible.

   v3.0: chat.js is a PURE UI RENDERER.
         It never checks auth. It never runs on load.
         It only renders what auth.js router tells it to render.

   auth.js calls these functions directly:
     window.vaaniChat._renderLogin(auth)
     window.vaaniChat._renderProfile(user)
     window.vaaniChat._renderChat(user, profile)

   window.vaaniChat.open() / close() are kept for app.js compat.
   open() now just re-triggers the router instead of running its
   own auth check.
================================================================ */

(function () {
  "use strict";

  var COLLECTION   = "vaani_messages";
  var MAX_MESSAGES = 100;
  var CHAT_ROOT_ID = "vaaniChat";

  var _unsubscribeDB = null;
  var _currentUser   = null;
  var _currentProfile= null;

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
     SCREEN 1 — LOGIN
     Called by auth.js when user is not signed in.
  ════════════════════════════════════════════════════════════════ */

  function _renderLogin() {
    var root = _root();
    if (!root) return;
    _stopListening();

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
        // onAuthStateChanged in auth.js handles what happens next
      } catch (_) {
        btn.disabled  = false;
        btn.innerHTML = _googleLogoSvg() + "Continue with Google";
      }
    });
  }

  /* ════════════════════════════════════════════════════════════════
     SCREEN 2 — CREATE PROFILE
     Called by auth.js when user is signed in but has no profile.
  ════════════════════════════════════════════════════════════════ */

  function _renderProfile(user) {
    var root = _root();
    if (!root) return;
    _stopListening();

    var firstName = (user.displayName || "").split(" ")[0] || "";
    // Start with first name suggestion — user must add a number to pass validation
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

    // Live validation
    function _validate() {
      if (!input || !hint || !createBtn) return;
      var err = (window.vaaniProfile && window.vaaniProfile.validateUsername)
        ? window.vaaniProfile.validateUsername(input.value)
        : null;
      if (err) {
        hint.textContent = err;
        hint.className   = "vg-field-hint vg-hint-error";
        createBtn.disabled = true;
      } else {
        hint.textContent = "✓ Username looks good!";
        hint.className   = "vg-field-hint";
        hint.style.color = "#22c55e";
        createBtn.disabled = false;
      }
    }

    if (input) {
      input.addEventListener("input", _validate);
      _validate(); // validate pre-filled value on render
    }

    // Create profile button
    if (createBtn) {
      createBtn.addEventListener("click", async function () {
        var username = input ? input.value.trim() : "";
        var err = (window.vaaniProfile && window.vaaniProfile.validateUsername)
          ? window.vaaniProfile.validateUsername(username)
          : null;
        if (err) {
          if (hint) { hint.textContent = err; hint.className = "vg-field-hint vg-hint-error"; }
          return;
        }

        createBtn.disabled    = true;
        createBtn.textContent = "Creating…";
        if (hint) { hint.textContent = "Saving your profile…"; hint.className = "vg-field-hint"; hint.style.color = ""; }

        try {
          var profile = await window.vaaniProfile.create(user, username);
          // ✅ Go straight to chat — no auth re-check needed
          window.vaaniRouter.goToChat(user, profile);
        } catch (e) {
          var msg = e.message || "Something went wrong. Please try again.";
          if (hint) { hint.textContent = msg; hint.className = "vg-field-hint vg-hint-error"; hint.style.color = ""; }
          createBtn.disabled    = false;
          createBtn.textContent = "Create Profile";
        }
      });
    }

    // Sign out
    var signOutBtn = document.getElementById("vgSignOutBtn");
    if (signOutBtn) {
      signOutBtn.addEventListener("click", function () {
        window.vaaniRouter.signOut();
        // onAuthStateChanged fires → shows login screen
      });
    }
  }

  /* ════════════════════════════════════════════════════════════════
     SCREEN 3 — CHAT UI
     Called by auth.js router after confirming profile exists.
  ════════════════════════════════════════════════════════════════ */

  function _renderChat(user, profile) {
    var root = _root();
    if (!root) return;

    _currentUser    = user;
    _currentProfile = profile;

    var firstLetter = (profile.username || profile.name || "?")[0].toUpperCase();
    var db = window.vaaniRouter ? window.vaaniRouter.getDb() : null;

    root.innerHTML =
      '<div class="vc-header">' +
        '<div class="vg-chat-user">' +
          '<div class="vg-mini-avatar" title="@' + _esc(profile.username) + '">' +
            (user.photoURL
              ? '<img src="' + _esc(user.photoURL) + '" alt="">'
              : _esc(firstLetter)
            ) +
          '</div>' +
          '<div>' +
            '<h3>Group Chat</h3>' +
            '<p class="vc-header-sub">@' + _esc(profile.username) + ' · all Vaani users</p>' +
          '</div>' +
        '</div>' +
        '<button class="vg-signout-chip" id="vgChatSignOut">Sign out</button>' +
      '</div>' +

      '<div class="vg-search-bar">' +
        '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/>' +
        '<line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' +
        '<input class="vg-search-input" type="text" placeholder="Search messages… (coming soon)" disabled>' +
      '</div>' +

      '<div class="vc-status" style="display:none"></div>' +
      '<div class="vc-messages" id="vcMessages"></div>' +

      '<div class="vc-input-bar">' +
        '<div class="vc-input-wrap">' +
          '<textarea class="vc-msg-input" id="vcMsgInput" ' +
                    'placeholder="Type a message…" rows="1" maxlength="2000"></textarea>' +
        '</div>' +
        '<button class="vc-send-btn" id="vcSendBtn" disabled>' +
          '<svg viewBox="0 0 24 24">' +
            '<line x1="22" y1="2" x2="11" y2="13"/>' +
            '<polygon points="22 2 15 22 11 13 2 9 22 2"/>' +
          '</svg>' +
        '</button>' +
      '</div>';

    _bindInputEvents(user, profile, db);
    _startListening(user, db);

    var soBtn = document.getElementById("vgChatSignOut");
    if (soBtn) {
      soBtn.addEventListener("click", function () {
        _stopListening();
        window.vaaniRouter.signOut();
      });
    }
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
      user:      profile.username || profile.name || "anon",
      uid:       user.uid,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    }).catch(function (err) {
      console.error("[Vaani Chat] Send failed:", err.code, err.message);
      var el = _q(".vc-status");
      if (el) { el.textContent = "Send failed: " + (err.code || err.message); el.className = "vc-status vc-error"; el.style.display = "block"; }
    });
  }

  /* ── Firestore real-time listener ────────────────────────────── */
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
        if (el) { el.textContent = "Updates paused — " + (err.code || err.message); el.className = "vc-status vc-error"; el.style.display = "block"; }
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
          '<svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' +
          '<p>No messages yet — say hello! 👋</p>' +
        '</div>';
      return;
    }

    var myUid = user ? user.uid : null;
    var html  = "";
    var lastDay = "";

    msgs.forEach(function (msg) {
      if (msg.createdAt && msg.createdAt.toDate) {
        var d = msg.createdAt.toDate();
        var dayLabel = d.toLocaleDateString([], { month: "short", day: "numeric" });
        if (dayLabel !== lastDay) {
          html += '<div class="vc-date-div"><span>' + _esc(dayLabel) + "</span></div>";
          lastDay = dayLabel;
        }
      }
      var isMe = myUid && msg.uid === myUid;
      html +=
        '<div class="vc-bubble-wrap ' + (isMe ? "vc-me" : "vc-them") + '">' +
          (!isMe ? '<div class="vc-sender">@' + _esc(msg.user || "?") + "</div>" : "") +
          '<div class="vc-bubble">' + _esc(msg.text) + "</div>" +
          '<div class="vc-time">' + _esc(_fmtTime(msg.createdAt)) + "</div>" +
        "</div>";
    });

    container.innerHTML = html;
    requestAnimationFrame(function () { container.scrollTop = container.scrollHeight; });
  }

  /* ════════════════════════════════════════════════════════════════
     PUBLIC API
     open() / close() kept for app.js compatibility.
     open() re-triggers the router instead of doing its own auth check.
  ════════════════════════════════════════════════════════════════ */
  window.vaaniChat = {

    // Called by app.js when Chat page becomes visible
    open: function () {
      // The router's onAuthStateChanged already handles routing.
      // If the router hasn't fired yet (e.g. cold load), show loading.
      var root = _root();
      if (root && !root.children.length) {
        root.innerHTML =
          '<div class="vg-screen vg-loading-screen">' +
            '<div class="vg-spinner"></div>' +
            '<p>Loading…</p>' +
          '</div>';
      }
      // If router is ready, manually trigger a re-check
      // by calling the router's auth instance if available
      if (window.vaaniRouter && typeof window.vaaniRouter.getAuth === "function") {
        var auth = window.vaaniRouter.getAuth();
        if (auth) {
          var user = auth.currentUser;
          if (user && window._vaaniCurrentUser) {
            // User known — re-run profile check immediately
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
          // If user is null, onAuthStateChanged will fire with null → login screen
        }
      }
    },

    // Called by app.js when navigating away from Chat
    close: function () {
      _stopListening();
    },

    // Called by auth.js router
    _renderLogin:   _renderLogin,
    _renderProfile: _renderProfile,
    _renderChat:    _renderChat,

    // Backward compat
    loadUsers: function () { this.open(); },
  };

  console.log("[Vaani Chat] chat.js v3.0 loaded ✓");

})();
