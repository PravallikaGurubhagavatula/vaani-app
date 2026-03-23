/* ================================================================
   Vaani — chat.js  v2.0  — Gated Chat System
   ----------------------------------------------------------------
   WHAT CHANGED FROM v1.0:
   ─────────────────────────────────────────────────────────────────
   • The chat page is now GATED behind login + profile.
   • window.vaaniChat API is IDENTICAL (open / close / loadUsers)
     so app.js needs ZERO changes.
   • Three progressive states are handled:
       1. Not logged in    → Login UI
       2. Logged in, no profile → Create Profile UI
       3. Profile exists   → Chat UI
   • Auth is read from window._vaaniCurrentUser (set by firebase.js)
     with a safe fallback to window.vaaniAuth.currentUser().
   • Handles page reload: user stays logged in automatically.
   • All UI is injected into #vaaniChat — zero global side-effects.

   DEPENDENCIES (must be loaded before this file in index.html):
     1. firebase-app-compat.js
     2. firebase-auth-compat.js
     3. firebase-firestore-compat.js
     4. auth.js        ← new
     5. profile.js     ← new
     6. chat.js        ← this file

   FIRESTORE RULES — paste into Firebase Console → Firestore → Rules:
   ─────────────────────────────────────────────────────────────────
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {

       // Users collection — anyone can read, only owner can write
       match /users/{uid} {
         allow read:  if true;
         allow write: if request.auth != null && request.auth.uid == uid;
       }

       // Messages collection
       match /vaani_messages/{msgId} {
         allow read: if true;
         allow create: if request.auth != null
                       && request.resource.data.keys().hasAll(['text','user','uid','createdAt'])
                       && request.resource.data.text is string
                       && request.resource.data.text.size() > 0
                       && request.resource.data.text.size() <= 2000;
       }
     }
   }
================================================================ */

(function () {
  "use strict";

  /* ── CONFIG ─────────────────────────────────────────────────────*/
  var FB_CONFIG = {
    apiKey:            "AIzaSyDZrSK8N_Lv_x7YK5xV7S8hc8DPNoc_ImA",
    authDomain:        "vaani-app-ee1a8.firebaseapp.com",
    projectId:         "vaani-app-ee1a8",
    storageBucket:     "vaani-app-ee1a8.firebasestorage.app",
    messagingSenderId: "509015461995",
    appId:             "1:509015461995:web:2dd658cef15d05d851612e",
  };

  var COLLECTION   = "vaani_messages";
  var MAX_MESSAGES = 100;
  var CHAT_ROOT_ID = "vaaniChat";

  /* ── STATE ──────────────────────────────────────────────────────*/
  var _db          = null;
  var _unsubscribe = null;
  var _initialized = false;
  var _chatVisible = false;

  /* ── FIREBASE INIT ──────────────────────────────────────────────*/
  function _waitForFirebase(cb, tries) {
    tries = tries || 0;
    if (
      typeof firebase !== "undefined" &&
      typeof firebase.app       === "function" &&
      typeof firebase.firestore === "function"
    ) { cb(); }
    else if (tries < 80) { setTimeout(function () { _waitForFirebase(cb, tries + 1); }, 50); }
    else { console.error("[Vaani Chat] Firebase compat SDK not found."); }
  }

  function _initFirebase() {
    if (_db) return;
    try {
      var app;
      try { app = firebase.app("vaani-chat-v2"); }
      catch (_) { app = firebase.initializeApp(FB_CONFIG, "vaani-chat-v2"); }
      _db = app.firestore();
      _db.enablePersistence({ synchronizeTabs: true }).catch(function (e) {
        if (e.code !== "failed-precondition" && e.code !== "unimplemented")
          console.warn("[Vaani Chat] Persistence:", e.code);
      });
      console.log("[Vaani Chat] Firestore ready ✓");
    } catch (err) {
      console.error("[Vaani Chat] Firebase init failed:", err);
    }
  }

  /* ── DOM HELPERS ─────────────────────────────────────────────────*/
  function _root()  { return document.getElementById(CHAT_ROOT_ID); }
  function _q(sel)  { var r = _root(); return r ? r.querySelector(sel)  : null; }

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

  /* ── GET CURRENT USER ────────────────────────────────────────────
     Primary source: window._vaaniCurrentUser (set by firebase.js ESM)
     Fallback: window.vaaniAuth helper
  ─────────────────────────────────────────────────────────────────*/
  function _getCurrentUser() {
    if (window._vaaniCurrentUser) return window._vaaniCurrentUser;
    if (window.vaaniAuth && typeof window.vaaniAuth.currentUser === "function")
      return window.vaaniAuth.currentUser();
    return null;
  }

  /* ════════════════════════════════════════════════════════════════
     STEP 1 — GATING LOGIC
     Decides which screen to show when Chat page opens.
  ════════════════════════════════════════════════════════════════ */
  async function _loadChatPage() {
    var root = _root();
    if (!root) { console.warn("[Vaani Chat] #vaaniChat not found."); return; }

    /* Show a loading state while we check auth */
    _renderLoading();

    /* Wait for auth to settle (VAANI_AUTH_READY is set by app.js / firebase.js) */
    await _waitForAuthReady();

    var user = _getCurrentUser();

    /* ── Case 1: Not logged in ── */
    if (!user) {
      _renderLoginUI();
      return;
    }

    /* ── Case 2: Logged in, check for profile ── */
    var profile = null;
    if (window.vaaniProfile && typeof window.vaaniProfile.get === "function") {
      profile = await window.vaaniProfile.get(user.uid);
    }

    if (!profile) {
      _renderCreateProfileUI(user);
      return;
    }

    /* ── Case 3: Profile exists → show chat ── */
    _renderChatUI(user, profile);
  }

  /* Wait up to 4 seconds for auth to be ready */
  function _waitForAuthReady() {
    return new Promise(function (resolve) {
      if (window.VAANI_AUTH_READY) { resolve(); return; }
      var waited = 0;
      var timer = setInterval(function () {
        waited += 100;
        if (window.VAANI_AUTH_READY || waited >= 4000) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
    });
  }

  /* ════════════════════════════════════════════════════════════════
     SCREEN 0 — LOADING
  ════════════════════════════════════════════════════════════════ */
  function _renderLoading() {
    var root = _root();
    if (!root) return;
    root.innerHTML =
      '<div class="vg-screen vg-loading-screen">' +
        '<div class="vg-spinner"></div>' +
        '<p>Loading…</p>' +
      '</div>';
  }

  /* ════════════════════════════════════════════════════════════════
     SCREEN 1 — LOGIN UI
  ════════════════════════════════════════════════════════════════ */
  function _renderLoginUI() {
    var root = _root();
    if (!root) return;

    root.innerHTML =
      '<div class="vg-screen vg-login-screen">' +
        '<div class="vg-card">' +
          '<div class="vg-card-icon">' +
            '<svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' +
          '</div>' +
          '<h2 class="vg-card-title">Join the Conversation</h2>' +
          '<p class="vg-card-sub">Sign in to connect with other Vaani users in real time — across languages.</p>' +
          '<button class="vg-google-btn" id="vgSignInBtn">' +
            '<svg class="vg-g-logo" viewBox="0 0 24 24" fill="none">' +
              '<path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>' +
              '<path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>' +
              '<path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>' +
              '<path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>' +
            '</svg>' +
            'Continue with Google' +
          '</button>' +
          '<p class="vg-hint">Translation features work without signing in ✓</p>' +
        '</div>' +
      '</div>';

    var btn = document.getElementById("vgSignInBtn");
    if (btn) {
      btn.addEventListener("click", async function () {
        btn.disabled    = true;
        btn.textContent = "Signing in…";
        var user = null;
        if (window.vaaniAuth && typeof window.vaaniAuth.signIn === "function") {
          user = await window.vaaniAuth.signIn();
        } else {
          /* Fallback: use main app signInWithGoogle */
          if (typeof window.signInWithGoogle === "function") {
            await window.signInWithGoogle();
            user = _getCurrentUser();
          }
        }
        if (user) {
          /* Re-run the page load logic with the signed-in user */
          await _loadChatPage();
        } else {
          btn.disabled    = false;
          btn.innerHTML   =
            '<svg class="vg-g-logo" viewBox="0 0 24 24" fill="none">' +
            '<path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>' +
            '<path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>' +
            '<path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>' +
            '<path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>' +
            '</svg>Continue with Google';
        }
      });
    }
  }

  /* ════════════════════════════════════════════════════════════════
     SCREEN 2 — CREATE PROFILE UI
  ════════════════════════════════════════════════════════════════ */
  function _renderCreateProfileUI(user) {
    var root = _root();
    if (!root) return;

    var displayName = (user.displayName || "").split(" ")[0] || "";
    /* Suggest a username from display name: lowercase, no spaces */
    var suggested = displayName.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 16);

    root.innerHTML =
      '<div class="vg-screen vg-profile-screen">' +
        '<div class="vg-card">' +
          '<div class="vg-avatar-wrap">' +
            (user.photoURL
              ? '<img class="vg-profile-avatar" src="' + _esc(user.photoURL) + '" alt="">'
              : '<div class="vg-profile-avatar vg-avatar-fallback">' + _esc(displayName[0] || "?") + '</div>'
            ) +
          '</div>' +
          '<h2 class="vg-card-title">Create Your Profile</h2>' +
          '<p class="vg-card-sub">Hi ' + _esc(displayName || "there") + '! Choose a username so others can find you.</p>' +
          '<div class="vg-field">' +
            '<label class="vg-label" for="vgUsernameInput">Username</label>' +
            '<div class="vg-input-wrap">' +
              '<span class="vg-input-prefix">@</span>' +
              '<input id="vgUsernameInput" class="vg-input" type="text" ' +
                     'maxlength="20" autocomplete="off" spellcheck="false" ' +
                     'placeholder="your_username" value="' + _esc(suggested) + '">' +
            '</div>' +
            '<span class="vg-field-hint" id="vgUsernameHint">3–20 chars · letters, numbers, underscores</span>' +
          '</div>' +
          '<button class="vg-primary-btn" id="vgCreateProfileBtn">Create Profile</button>' +
          '<button class="vg-ghost-btn" id="vgSignOutBtn">Sign out</button>' +
        '</div>' +
      '</div>';

    /* Live validation */
    var input    = document.getElementById("vgUsernameInput");
    var hint     = document.getElementById("vgUsernameHint");
    var createBtn= document.getElementById("vgCreateProfileBtn");

    if (input && hint) {
      input.addEventListener("input", function () {
        var err = (window.vaaniProfile && typeof window.vaaniProfile.validateUsername === "function")
          ? window.vaaniProfile.validateUsername(input.value)
          : null;
        if (err) {
          hint.textContent   = err;
          hint.className     = "vg-field-hint vg-hint-error";
          if (createBtn) createBtn.disabled = true;
        } else {
          hint.textContent   = "3–20 chars · letters, numbers, underscores";
          hint.className     = "vg-field-hint";
          if (createBtn) createBtn.disabled = false;
        }
      });
      /* Trigger validation on load for the suggested value */
      input.dispatchEvent(new Event("input"));
    }

    /* Create profile */
    if (createBtn) {
      createBtn.addEventListener("click", async function () {
        var username = input ? input.value.trim() : "";
        if (!username) { if (hint) { hint.textContent = "Please enter a username."; hint.className = "vg-field-hint vg-hint-error"; } return; }

        createBtn.disabled    = true;
        createBtn.textContent = "Creating…";
        if (hint) { hint.textContent = ""; hint.className = "vg-field-hint"; }

        try {
          var profile = await window.vaaniProfile.create(user, username);
          /* Success → go to chat */
          _renderChatUI(user, profile);
        } catch (err) {
          if (hint) { hint.textContent = err.message || "Something went wrong."; hint.className = "vg-field-hint vg-hint-error"; }
          createBtn.disabled    = false;
          createBtn.textContent = "Create Profile";
        }
      });
    }

    /* Sign out */
    var signOutBtn = document.getElementById("vgSignOutBtn");
    if (signOutBtn) {
      signOutBtn.addEventListener("click", async function () {
        if (window.vaaniAuth && typeof window.vaaniAuth.signOut === "function") {
          await window.vaaniAuth.signOut();
        } else if (typeof window.signOutUser === "function") {
          await window.signOutUser();
        }
        _renderLoginUI();
      });
    }
  }

  /* ════════════════════════════════════════════════════════════════
     SCREEN 3 — CHAT UI
  ════════════════════════════════════════════════════════════════ */
  function _renderChatUI(user, profile) {
    var root = _root();
    if (!root) return;

    var firstLetter = (profile.username || profile.name || "?")[0].toUpperCase();

    root.innerHTML =
      /* Header */
      '<div class="vc-header">' +
        '<div class="vg-chat-user">' +
          '<div class="vg-mini-avatar" title="' + _esc(profile.username) + '">' +
            (user.photoURL
              ? '<img src="' + _esc(user.photoURL) + '" alt="">'
              : firstLetter
            ) +
          '</div>' +
          '<div>' +
            '<h3>Group Chat</h3>' +
            '<p class="vc-header-sub">@' + _esc(profile.username) + ' · all Vaani users</p>' +
          '</div>' +
        '</div>' +
        '<button class="vg-signout-chip" id="vgChatSignOut" title="Sign out">Sign out</button>' +
      '</div>' +

      /* Search bar (UI only — search feature coming soon) */
      '<div class="vg-search-bar">' +
        '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' +
        '<input class="vg-search-input" type="text" placeholder="Search messages… (coming soon)" disabled>' +
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
          '<svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>' +
        '</button>' +
      '</div>';

    _bindChatEvents(user, profile);
    _startListening(user);

    /* Sign out button in chat header */
    var signOutBtn = document.getElementById("vgChatSignOut");
    if (signOutBtn) {
      signOutBtn.addEventListener("click", async function () {
        _stopListening();
        if (window.vaaniAuth && typeof window.vaaniAuth.signOut === "function") {
          await window.vaaniAuth.signOut();
        } else if (typeof window.signOutUser === "function") {
          await window.signOutUser();
        }
        _renderLoginUI();
      });
    }
  }

  /* ── Chat event bindings ─────────────────────────────────────── */
  function _bindChatEvents(user, profile) {
    var sendBtn  = document.getElementById("vcSendBtn");
    var msgInput = document.getElementById("vcMsgInput");

    function _doSend() {
      var text = msgInput ? msgInput.value.trim() : "";
      if (!text) return;
      _sendMessage(text, user, profile);
      msgInput.value       = "";
      if (sendBtn) sendBtn.disabled = true;
      _resizeTA(msgInput);
    }

    if (sendBtn) {
      sendBtn.addEventListener("click", _doSend);
    }

    if (msgInput) {
      msgInput.addEventListener("input", function () {
        if (sendBtn) sendBtn.disabled = !msgInput.value.trim();
        _resizeTA(msgInput);
      });
      msgInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); _doSend(); }
      });
    }
  }

  function _resizeTA(el) {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }

  /* ── Send message ────────────────────────────────────────────── */
  function _sendMessage(text, user, profile) {
    if (!_db || !text.trim()) return;
    if (text.length > 2000) { _showStatus("Message too long (max 2000 chars).", true); return; }

    _db.collection(COLLECTION).add({
      text:      text.trim(),
      user:      profile.username || profile.name || "anon",
      uid:       user.uid,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    }).then(function () {
      _clearStatus();
    }).catch(function (err) {
      console.error("[Vaani Chat] Send failed:", err);
      _showStatus("Send failed. Check Firestore rules.", true);
    });
  }

  /* ── Firestore listener ──────────────────────────────────────── */
  function _startListening(user) {
    if (!_db) return;
    _stopListening();

    var q = _db.collection(COLLECTION)
               .orderBy("createdAt", "asc")
               .limitToLast(MAX_MESSAGES);

    _unsubscribe = q.onSnapshot(function (snapshot) {
      var msgs = [];
      snapshot.forEach(function (doc) { msgs.push(doc.data()); });
      _renderMessages(msgs, user);
    }, function (err) {
      console.error("[Vaani Chat] Snapshot error:", err);
      _showStatus("Real-time updates paused — " + (err.code || err.message), true);
    });
  }

  function _stopListening() {
    if (_unsubscribe) { _unsubscribe(); _unsubscribe = null; }
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

    var myUid  = user ? user.uid : null;
    var html   = "";
    var lastDay= "";

    msgs.forEach(function (msg) {
      var dayLabel = "";
      if (msg.createdAt && msg.createdAt.toDate) {
        var d = msg.createdAt.toDate();
        dayLabel = d.toLocaleDateString([], { month: "short", day: "numeric" });
      }
      if (dayLabel && dayLabel !== lastDay) {
        html += '<div class="vc-date-div"><span>' + _esc(dayLabel) + "</span></div>";
        lastDay = dayLabel;
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

  /* ── Status helpers ──────────────────────────────────────────── */
  function _showStatus(msg, isError) {
    var el = _q(".vc-status");
    if (!el) return;
    el.textContent = msg;
    el.className   = "vc-status" + (isError ? " vc-error" : "");
    el.style.display = "block";
  }
  function _clearStatus() {
    var el = _q(".vc-status");
    if (!el) return;
    el.textContent   = "";
    el.style.display = "none";
  }

  /* ════════════════════════════════════════════════════════════════
     PUBLIC API  — same shape as v1.0 so app.js needs ZERO changes
  ════════════════════════════════════════════════════════════════ */
  window.vaaniChat = {

    /**
     * open() — called by app.js every time Chat page becomes visible.
     * Re-evaluates auth state every time (handles login/logout/reload).
     */
    open: function () {
      _chatVisible = true;
      _waitForFirebase(function () {
        _initFirebase();
        _loadChatPage();
        _initialized = true;
      });
    },

    /**
     * close() — called by app.js when leaving Chat page.
     */
    close: function () {
      _chatVisible = false;
      _stopListening();
    },

    /** Backwards compat alias */
    loadUsers: function () { this.open(); },
  };

  console.log("[Vaani Chat] chat.js v2.0 loaded ✓");
})();
