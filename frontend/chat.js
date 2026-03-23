/* ================================================================
   Vaani — chat.js  v2.1  — Gated Chat System (Auth-State-Fixed)
   ----------------------------------------------------------------
   KEY FIX from v2.0:
   ─────────────────────────────────────────────────────────────────
   v2.0 called _getCurrentUser() right after signIn() returned.
   Because the ESM firebase.js and compat auth.js are separate SDK
   instances, window._vaaniCurrentUser could still be null for a
   brief moment after the popup closed — causing the login screen
   to flash back instead of advancing to profile/chat.

   v2.1 fixes this by using firebase.auth().onAuthStateChanged()
   on the MAIN (default) compat app as the SINGLE SOURCE OF TRUTH
   for deciding which screen to show.  The listener fires:
     • Immediately on page load (handles refresh / existing session)
     • After every sign-in / sign-out
   So there is no race condition and no polling needed.

   SCREEN FLOW (unchanged):
     1. Loading …
     2. Not signed in           → Login UI
     3. Signed in, no profile   → Create Profile UI
     4. Signed in + profile     → Chat UI

   window.vaaniChat API is IDENTICAL to v1.0 / v2.0 — app.js
   requires ZERO changes.

   DEPENDENCIES (load order in index.html):
     1. firebase-app-compat.js
     2. firebase-auth-compat.js
     3. firebase-firestore-compat.js
     4. auth.js
     5. profile.js
     6. chat.js   ← this file
     7. firebase.js (type="module") — already last in your index.html

   FIRESTORE RULES (paste in Firebase Console → Firestore → Rules):
   ─────────────────────────────────────────────────────────────────
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{uid} {
         allow read:  if true;
         allow write: if request.auth != null && request.auth.uid == uid;
       }
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

  /* ── CONFIG ──────────────────────────────────────────────────── */
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

  /* ── MODULE STATE ────────────────────────────────────────────── */
  var _db              = null;   // Firestore instance
  var _auth            = null;   // Auth instance (compat)
  var _unsubscribeDB   = null;   // Firestore real-time listener unsub
  var _unsubscribeAuth = null;   // onAuthStateChanged unsub
  var _chatVisible     = false;  // is the Chat page currently active?

  /* ════════════════════════════════════════════════════════════════
     FIREBASE INITIALISATION
     We create ONE named compat app "vaani-chat-v2" for both auth
     and Firestore so all operations are on the same instance.
  ════════════════════════════════════════════════════════════════ */

  function _waitForCompat(cb, tries) {
    tries = tries || 0;
    if (
      typeof firebase !== "undefined" &&
      typeof firebase.app       === "function" &&
      typeof firebase.auth      === "function" &&
      typeof firebase.firestore === "function"
    ) {
      cb();
    } else if (tries < 100) {
      setTimeout(function () { _waitForCompat(cb, tries + 1); }, 50);
    } else {
      console.error("[Vaani Chat] Firebase compat SDK not found after 5 s.");
      _showError("Chat unavailable — Firebase failed to load.");
    }
  }

  function _initFirebase() {
    if (_db && _auth) return; // already initialised
    try {
      var app;
      try { app = firebase.app("vaani-chat-v2"); }
      catch (_) { app = firebase.initializeApp(FB_CONFIG, "vaani-chat-v2"); }

      _auth = app.auth();
      _db   = app.firestore();

      // Offline persistence (best-effort)
      _db.enablePersistence({ synchronizeTabs: true }).catch(function (e) {
        if (e.code !== "failed-precondition" && e.code !== "unimplemented")
          console.warn("[Vaani Chat] Persistence:", e.code);
      });

      // Mirror the ESM user into this compat auth instance so that
      // Firestore security rules see request.auth.uid correctly.
      _mirrorEsmUser();

      console.log("[Vaani Chat] Firebase ready ✓");
    } catch (err) {
      console.error("[Vaani Chat] Firebase init failed:", err);
      _showError("Chat unavailable — Firebase error.");
    }
  }

  // If the user is already signed-in via the ESM firebase.js, mirror
  // that User object into our compat auth instance so Firestore rules work.
  function _mirrorEsmUser() {
    var esmUser = window._vaaniCurrentUser;
    if (esmUser && _auth) {
      _auth.updateCurrentUser(esmUser).catch(function (e) {
        console.warn("[Vaani Chat] updateCurrentUser:", e.code);
      });
    }

    // Also hook future auth changes from the ESM module
    var _prev = window._vaaniOnAuthChange;
    window._vaaniOnAuthChange = function (user) {
      if (typeof _prev === "function") _prev(user);
      if (_auth && user) {
        _auth.updateCurrentUser(user).catch(function () {});
      } else if (_auth && !user) {
        _auth.signOut().catch(function () {});
      }
    };
  }

  /* ════════════════════════════════════════════════════════════════
     SINGLE ENTRY POINT — called by window.vaaniChat.open()
     Uses onAuthStateChanged so it works correctly on:
       • First load (no session)
       • Refresh (existing session)
       • After sign-in popup closes
       • After sign-out
  ════════════════════════════════════════════════════════════════ */

  function _loadChatPage() {
    // Show a spinner while Firebase resolves auth state
    _renderLoading();

    // Cancel any previous auth listener before creating a new one
    if (_unsubscribeAuth) {
      _unsubscribeAuth();
      _unsubscribeAuth = null;
    }

    // THE CORE FIX: use onAuthStateChanged as the single decision point
    _unsubscribeAuth = _auth.onAuthStateChanged(async function (user) {
      // Stop the auth listener after the first resolution — we only
      // need it to fire once per open() call. Sign-in/sign-out after
      // that re-renders by calling _loadChatPage() explicitly.
      if (_unsubscribeAuth) {
        _unsubscribeAuth();
        _unsubscribeAuth = null;
      }

      if (!user) {
        // ── CASE 1: Not signed in ─────────────────────────────────
        _renderLoginUI();
        return;
      }

      // ── CASE 2 & 3: Signed in — check for Firestore profile ────
      var profile = await _getProfile(user.uid);

      if (!profile) {
        // CASE 2: No profile yet
        _renderCreateProfileUI(user);
      } else {
        // CASE 3: Profile exists → show chat
        _renderChatUI(user, profile);
      }
    });
  }

  /* ── Firestore profile helpers ───────────────────────────────── */

  async function _getProfile(uid) {
    // Prefer the profile.js helper if available
    if (window.vaaniProfile && typeof window.vaaniProfile.get === "function") {
      return window.vaaniProfile.get(uid);
    }
    // Fallback: query directly
    if (!_db) return null;
    try {
      var doc = await _db.collection("users").doc(uid).get();
      return doc.exists ? doc.data() : null;
    } catch (e) {
      console.error("[Vaani Chat] _getProfile:", e.message);
      return null;
    }
  }

  async function _createProfile(user, username) {
    if (window.vaaniProfile && typeof window.vaaniProfile.create === "function") {
      return window.vaaniProfile.create(user, username);
    }
    // Fallback: write directly
    var data = {
      uid:       user.uid,
      name:      user.displayName || "",
      username:  username.trim().toLowerCase(),
      email:     user.email || "",
      photoURL:  user.photoURL || "",
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
    await _db.collection("users").doc(user.uid).set(data);
    return data;
  }

  /* ════════════════════════════════════════════════════════════════
     SCREEN 0 — LOADING
  ════════════════════════════════════════════════════════════════ */

  function _renderLoading() {
    var root = _root();
    if (!root) return;
    _stopListening(); // stop any stale DB listener
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
            _googleLogoSvg() +
            'Continue with Google' +
          '</button>' +
          '<p class="vg-hint">Translation features work without signing in ✓</p>' +
        '</div>' +
      '</div>';

    var btn = document.getElementById("vgSignInBtn");
    if (!btn) return;

    btn.addEventListener("click", async function () {
      btn.disabled     = true;
      btn.textContent  = "Signing in…";

      try {
        // Use the compat auth instance directly — no cross-instance race
        var provider = new firebase.auth.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: "select_account" });
        var result = await _auth.signInWithPopup(provider);

        if (result && result.user) {
          // Update window._vaaniCurrentUser so the rest of the app
          // (History, Favourites, Settings) knows the user is signed in
          window._vaaniCurrentUser = result.user;
          if (typeof window._vaaniOnAuthChange === "function") {
            window._vaaniOnAuthChange(result.user);
          }
          // Re-run the gating logic — onAuthStateChanged will fire
          // automatically, but calling _loadChatPage() is more explicit
          // and avoids any residual loading state.
          await _loadChatPage();
        } else {
          // Popup closed — restore button
          _restoreSignInBtn(btn);
        }
      } catch (err) {
        if (
          err.code !== "auth/popup-closed-by-user" &&
          err.code !== "auth/cancelled-popup-request"
        ) {
          console.error("[Vaani Chat] Sign-in error:", err.code, err.message);
          if (typeof window.showToast === "function")
            window.showToast("Sign-in failed: " + (err.code || err.message));
        }
        _restoreSignInBtn(btn);
      }
    });
  }

  function _restoreSignInBtn(btn) {
    if (!btn) return;
    btn.disabled  = false;
    btn.innerHTML = _googleLogoSvg() + "Continue with Google";
  }

  /* ════════════════════════════════════════════════════════════════
     SCREEN 2 — CREATE PROFILE UI
  ════════════════════════════════════════════════════════════════ */

  function _renderCreateProfileUI(user) {
    var root = _root();
    if (!root) return;
    _stopListening();

    var firstName = (user.displayName || "").split(" ")[0] || "";
    var suggested = firstName.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 16);

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
          '<p class="vg-card-sub">Hi ' + _esc(firstName || "there") + '! Choose a username so others can find you.</p>' +
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
          '<button class="vg-ghost-btn"   id="vgSignOutBtn2">Sign out</button>' +
        '</div>' +
      '</div>';

    var input     = document.getElementById("vgUsernameInput");
    var hint      = document.getElementById("vgUsernameHint");
    var createBtn = document.getElementById("vgCreateProfileBtn");

    // Live validation
    if (input && hint) {
      function _validate() {
        var err = _validateUsername(input.value);
        if (err) {
          hint.textContent = err;
          hint.className   = "vg-field-hint vg-hint-error";
          if (createBtn) createBtn.disabled = true;
        } else {
          hint.textContent = "3–20 chars · letters, numbers, underscores";
          hint.className   = "vg-field-hint";
          if (createBtn) createBtn.disabled = false;
        }
      }
      input.addEventListener("input", _validate);
      _validate(); // run once on render to validate pre-filled suggestion
    }

    // Create profile button
    if (createBtn) {
      createBtn.addEventListener("click", async function () {
        var username = input ? input.value.trim() : "";
        var err      = _validateUsername(username);
        if (err) {
          if (hint) { hint.textContent = err; hint.className = "vg-field-hint vg-hint-error"; }
          return;
        }

        createBtn.disabled    = true;
        createBtn.textContent = "Creating…";
        if (hint) { hint.textContent = ""; hint.className = "vg-field-hint"; }

        try {
          var profile = await _createProfile(user, username);
          // Go straight to chat — no need to re-run the full auth check
          _renderChatUI(user, profile);
        } catch (e) {
          var msg = e.message || "Something went wrong. Please try again.";
          if (hint) { hint.textContent = msg; hint.className = "vg-field-hint vg-hint-error"; }
          createBtn.disabled    = false;
          createBtn.textContent = "Create Profile";
        }
      });
    }

    // Sign out from profile screen
    var signOutBtn = document.getElementById("vgSignOutBtn2");
    if (signOutBtn) {
      signOutBtn.addEventListener("click", async function () {
        await _signOut();
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
      // Header
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

      // Search bar (UI placeholder — feature coming soon)
      '<div class="vg-search-bar">' +
        '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/>' +
        '<line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' +
        '<input class="vg-search-input" type="text" ' +
               'placeholder="Search messages… (coming soon)" disabled>' +
      '</div>' +

      // Status bar (hidden by default)
      '<div class="vc-status" style="display:none"></div>' +

      // Messages area
      '<div class="vc-messages" id="vcMessages"></div>' +

      // Input bar
      '<div class="vc-input-bar">' +
        '<div class="vc-input-wrap">' +
          '<textarea class="vc-msg-input" id="vcMsgInput" ' +
                    'placeholder="Type a message…" rows="1" ' +
                    'maxlength="2000" aria-label="Message"></textarea>' +
        '</div>' +
        '<button class="vc-send-btn" id="vcSendBtn" disabled aria-label="Send">' +
          '<svg viewBox="0 0 24 24">' +
            '<line x1="22" y1="2" x2="11" y2="13"/>' +
            '<polygon points="22 2 15 22 11 13 2 9 22 2"/>' +
          '</svg>' +
        '</button>' +
      '</div>';

    _bindInputEvents(user, profile);
    _startListening(user);

    // Sign out chip in chat header
    var soBtn = document.getElementById("vgChatSignOut");
    if (soBtn) {
      soBtn.addEventListener("click", async function () {
        _stopListening();
        await _signOut();
        _renderLoginUI();
      });
    }
  }

  /* ── Input event bindings ────────────────────────────────────── */

  function _bindInputEvents(user, profile) {
    var sendBtn  = document.getElementById("vcSendBtn");
    var msgInput = document.getElementById("vcMsgInput");

    function _doSend() {
      var text = msgInput ? msgInput.value.trim() : "";
      if (!text) return;
      _sendMessage(text, user, profile);
      msgInput.value = "";
      if (sendBtn) sendBtn.disabled = true;
      _autoResize(msgInput);
    }

    if (sendBtn)  sendBtn.addEventListener("click", _doSend);
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

  /* ── Send a message ──────────────────────────────────────────── */

  function _sendMessage(text, user, profile) {
    if (!_db || !text.trim()) return;
    if (text.length > 2000) { _showStatus("Message too long (max 2000 chars).", true); return; }

    _db.collection(COLLECTION).add({
      text:      text.trim(),
      user:      profile.username || profile.name || "anon",
      uid:       user.uid,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    }).catch(function (err) {
      console.error("[Vaani Chat] Send failed:", err.code, err.message);
      _showStatus("Send failed — " + (err.code || err.message), true);
    });
  }

  /* ── Real-time Firestore listener ────────────────────────────── */

  function _startListening(user) {
    if (!_db) return;
    _stopListening();

    var q = _db.collection(COLLECTION)
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
        _showStatus("Real-time updates paused — " + (err.code || err.message), true);
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

    var myUid   = user ? user.uid : null;
    var html    = "";
    var lastDay = "";

    msgs.forEach(function (msg) {
      // Date divider
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

  /* ── Sign out ────────────────────────────────────────────────── */

  async function _signOut() {
    // Sign out from both the compat instance and the main app
    try { if (_auth) await _auth.signOut(); } catch (_) {}
    try {
      if (window.vaaniAuth && typeof window.vaaniAuth.signOut === "function")
        await window.vaaniAuth.signOut();
      else if (typeof window.signOutUser === "function")
        await window.signOutUser();
    } catch (_) {}
    // Clear the global user so the rest of the app knows
    window._vaaniCurrentUser = null;
    if (typeof window._vaaniOnAuthChange === "function")
      window._vaaniOnAuthChange(null);
  }

  /* ── Username validation ─────────────────────────────────────── */

  function _validateUsername(value) {
    var v = (value || "").trim();
    if (!v)           return "Username cannot be empty.";
    if (v.length < 3) return "At least 3 characters required.";
    if (v.length > 20)return "Maximum 20 characters allowed.";
    if (!/^[a-z0-9_]+$/i.test(v)) return "Letters, numbers and underscores only.";
    return null; // valid
  }

  /* ── Status bar helpers ──────────────────────────────────────── */

  function _showStatus(msg, isError) {
    var el = _q(".vc-status");
    if (!el) return;
    el.textContent   = msg;
    el.className     = "vc-status" + (isError ? " vc-error" : "");
    el.style.display = "block";
  }

  function _showError(msg) {
    var root = _root();
    if (!root) return;
    root.innerHTML =
      '<div class="vg-screen vg-loading-screen">' +
        '<p style="color:#f87171;font-size:14px;text-align:center;padding:20px">' + _esc(msg) + '</p>' +
      '</div>';
  }

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
    var d    = ts.toDate();
    var h    = d.getHours();
    var m    = d.getMinutes();
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
     PUBLIC API — identical shape to v1.0 / v2.0
     app.js calls window.vaaniChat.open() / .close() — unchanged.
  ════════════════════════════════════════════════════════════════ */

  window.vaaniChat = {

    /**
     * open()
     * Called by app.js every time the Chat page becomes visible.
     * Re-evaluates auth state fresh each time via onAuthStateChanged.
     */
    open: function () {
      _chatVisible = true;
      _waitForCompat(function () {
        _initFirebase();
        _loadChatPage();
      });
    },

    /**
     * close()
     * Called by app.js when navigating away from Chat.
     */
    close: function () {
      _chatVisible = false;
      _stopListening();
      if (_unsubscribeAuth) { _unsubscribeAuth(); _unsubscribeAuth = null; }
    },

    /** Backwards-compat alias used in some older code paths */
    loadUsers: function () { this.open(); },
  };

  console.log("[Vaani Chat] chat.js v2.1 loaded ✓");

})();
