/* ================================================================
   Vaani — chat.js  v1.0  CLEAN REWRITE
   ----------------------------------------------------------------
   ARCHITECTURE (simple and safe):
   ─────────────────────────────────────────────────────────────────
   1. We use the Firebase COMPAT SDK already loaded by index.html
      (firebase-app-compat, firebase-auth-compat, firebase-firestore-compat)

   2. We use the SAME Firebase project (vaani-app-ee1a8)
      No new project needed.

   3. Collection: "vaani_messages"
      Fields per document:
        text      : string
        user      : string   (display name)
        uid       : string   (Firebase auth uid, or "anon" if not signed in)
        createdAt : Timestamp

   4. This file only runs when the Chat page is visible.
      It is completely isolated — touches ONLY #vaaniChat element.

   FIRESTORE RULES (paste these in Firebase Console → Firestore → Rules):
   ─────────────────────────────────────────────────────────────────
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /vaani_messages/{msgId} {
         allow read: if true;
         allow create: if request.resource.data.keys().hasAll(['text','user','uid','createdAt'])
                       && request.resource.data.text is string
                       && request.resource.data.text.size() > 0
                       && request.resource.data.text.size() <= 2000;
       }
     }
   }
================================================================ */

(function () {
  "use strict";

  /* ── CONFIG ─────────────────────────────────────────────────────
     Same Firebase project as the rest of Vaani.
     We create a named app instance "vaani-chat-v2" to avoid
     conflicts with the ESM firebase.js instance.
  ─────────────────────────────────────────────────────────────────*/
  var FB_CONFIG = {
    apiKey:            "AIzaSyDZrSK8N_Lv_x7YK5xV7S8hc8DPNoc_ImA",
    authDomain:        "vaani-app-ee1a8.firebaseapp.com",
    projectId:         "vaani-app-ee1a8",
    storageBucket:     "vaani-app-ee1a8.firebasestorage.app",
    messagingSenderId: "509015461995",
    appId:             "1:509015461995:web:2dd658cef15d05d851612e",
  };

  var COLLECTION    = "vaani_messages";
  var MAX_MESSAGES  = 100;   // only show the last 100 messages
  var CHAT_ROOT_ID  = "vaaniChat";

  /* ── STATE ──────────────────────────────────────────────────────*/
  var _db           = null;
  var _unsubscribe  = null;
  var _userName     = localStorage.getItem("vaani_chat_name") || "";
  var _userUid      = null;    // filled from window._vaaniCurrentUser if signed in
  var _initialized  = false;
  var _chatVisible  = false;

  /* ── WAIT FOR COMPAT SDK ────────────────────────────────────────
     The compat SDK scripts load before this file.
     We still guard with a retry loop in case of slow CDN.
  ─────────────────────────────────────────────────────────────────*/
  function _waitForFirebase(cb, tries) {
    tries = tries || 0;
    if (
      typeof firebase !== "undefined" &&
      typeof firebase.app          === "function" &&
      typeof firebase.firestore    === "function"
    ) {
      cb();
    } else if (tries < 80) {
      setTimeout(function () { _waitForFirebase(cb, tries + 1); }, 50);
    } else {
      console.error("[Vaani Chat] Firebase compat SDK not found. Check script load order.");
      _showStatus("Chat unavailable — Firebase failed to load.", true);
    }
  }

  /* ── INIT FIREBASE (called once) ────────────────────────────────*/
  function _initFirebase() {
    if (_db) return;
    try {
      var app;
      try {
        app = firebase.app("vaani-chat-v2");
      } catch (_) {
        app = firebase.initializeApp(FB_CONFIG, "vaani-chat-v2");
      }
      _db = app.firestore();

      /* Optional: enable offline persistence (best-effort, non-fatal) */
      _db.enablePersistence({ synchronizeTabs: true }).catch(function (e) {
        if (e.code !== "failed-precondition" && e.code !== "unimplemented") {
          console.warn("[Vaani Chat] Persistence:", e.code);
        }
      });

      console.log("[Vaani Chat] Firestore ready ✓");
    } catch (err) {
      console.error("[Vaani Chat] Firebase init failed:", err);
      _showStatus("Chat unavailable — Firebase error.", true);
    }
  }

  /* ── SEND MESSAGE ───────────────────────────────────────────────*/
  function _sendMessage(text) {
    if (!_db)       { _showStatus("Not connected to Firebase.", true); return; }
    if (!text.trim()) return;
    if (text.length > 2000) {
      _showStatus("Message too long (max 2000 chars).", true);
      return;
    }

    var name = _userName || "Anonymous";
    var uid  = _userUid  || "anon";

    _db.collection(COLLECTION).add({
      text:      text.trim(),
      user:      name,
      uid:       uid,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    }).then(function () {
      _clearStatus();
    }).catch(function (err) {
      console.error("[Vaani Chat] Send failed:", err);
      _showStatus("Send failed. Check Firestore rules.", true);
    });
  }

  /* ── LISTEN FOR MESSAGES ────────────────────────────────────────*/
  function _startListening() {
    if (!_db) return;

    /* Stop any previous listener before starting a new one */
    if (_unsubscribe) { _unsubscribe(); _unsubscribe = null; }

    var q = _db.collection(COLLECTION)
               .orderBy("createdAt", "asc")
               .limitToLast(MAX_MESSAGES);

    _unsubscribe = q.onSnapshot(function (snapshot) {
      var msgs = [];
      snapshot.forEach(function (doc) {
        msgs.push(doc.data());
      });
      _renderMessages(msgs);
    }, function (err) {
      console.error("[Vaani Chat] Snapshot error:", err);
      _showStatus("Real-time updates paused — " + (err.code || err.message), true);
    });
  }

  function _stopListening() {
    if (_unsubscribe) { _unsubscribe(); _unsubscribe = null; }
  }

  /* ── DOM HELPERS ────────────────────────────────────────────────*/
  function _root()  { return document.getElementById(CHAT_ROOT_ID); }
  function _q(sel)  { var r = _root(); return r ? r.querySelector(sel)  : null; }
  function _qa(sel) { var r = _root(); return r ? Array.prototype.slice.call(r.querySelectorAll(sel)) : []; }

  function _esc(s) {
    var d = document.createElement("div");
    d.appendChild(document.createTextNode(String(s || "")));
    return d.innerHTML;
  }

  function _fmtTime(ts) {
    if (!ts || !ts.toDate) return "";
    var d   = ts.toDate();
    var h   = d.getHours();
    var m   = d.getMinutes();
    var ampm= h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return h + ":" + (m < 10 ? "0" + m : m) + " " + ampm;
  }

  function _showStatus(msg, isError) {
    var el = _q(".vc-status");
    if (!el) return;
    el.textContent = msg;
    el.className = "vc-status" + (isError ? " vc-error" : "");
    el.style.display = "block";
  }

  function _clearStatus() {
    var el = _q(".vc-status");
    if (!el) return;
    el.textContent = "";
    el.style.display = "none";
  }

  /* ── RENDER MESSAGES ────────────────────────────────────────────*/
  function _renderMessages(msgs) {
    var container = _q(".vc-messages");
    if (!container) return;

    if (!msgs || msgs.length === 0) {
      container.innerHTML =
        '<div class="vc-empty">' +
        '<svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' +
        "<p>No messages yet — say hello! 👋</p>" +
        "</div>";
      return;
    }

    var myUid   = _userUid  || "anon";
    var myName  = _userName || "Anonymous";
    var html    = "";
    var lastDay = "";

    msgs.forEach(function (msg) {
      /* Date divider */
      var dayLabel = "";
      if (msg.createdAt && msg.createdAt.toDate) {
        var d = msg.createdAt.toDate();
        dayLabel = d.toLocaleDateString([], { month: "short", day: "numeric" });
      }
      if (dayLabel && dayLabel !== lastDay) {
        html += '<div class="vc-date-div"><span>' + _esc(dayLabel) + "</span></div>";
        lastDay = dayLabel;
      }

      /* Is this "me"? Match by uid (if signed in) or by name (if anon) */
      var isMe = (myUid !== "anon" && msg.uid === myUid) ||
                 (myUid === "anon" && msg.user === myName && msg.uid === "anon");

      html +=
        '<div class="vc-bubble-wrap ' + (isMe ? "vc-me" : "vc-them") + '">' +
        (!isMe ? '<div class="vc-sender">' + _esc(msg.user || "?") + "</div>" : "") +
        '<div class="vc-bubble">' + _esc(msg.text) + "</div>" +
        '<div class="vc-time">' + _esc(_fmtTime(msg.createdAt)) + "</div>" +
        "</div>";
    });

    container.innerHTML = html;

    /* Scroll to bottom */
    requestAnimationFrame(function () {
      container.scrollTop = container.scrollHeight;
    });
  }

  /* ── BUILD HTML ─────────────────────────────────────────────────
     Called once when the Chat page first activates.
     We insert the complete UI into #vaaniChat.
  ─────────────────────────────────────────────────────────────────*/
  function _buildUI() {
    var root = _root();
    if (!root) { console.warn("[Vaani Chat] #vaaniChat not found."); return; }

    root.innerHTML =
      /* Header */
      '<div class="vc-header">' +
        '<div>' +
          '<h3>Group Chat</h3>' +
          '<p class="vc-header-sub">Real-time · all Vaani users</p>' +
        '</div>' +
      '</div>' +

      /* Name bar (shown only if not yet set) */
      '<div class="vc-name-bar" id="vcNameBar" style="display:' + (_userName ? "none" : "flex") + '">' +
        '<label>Your name:</label>' +
        '<input class="vc-name-input" id="vcNameInput" maxlength="30" ' +
               'placeholder="Enter your name…" value="' + _esc(_userName) + '">' +
        '<button class="vc-name-save" id="vcNameSave">Save</button>' +
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

    _bindEvents();
  }

  /* ── BIND EVENTS ────────────────────────────────────────────────*/
  function _bindEvents() {
    /* Send button */
    var sendBtn = document.getElementById("vcSendBtn");
    var msgInput= document.getElementById("vcMsgInput");

    if (sendBtn) {
      sendBtn.addEventListener("click", function () {
        var text = msgInput ? msgInput.value.trim() : "";
        if (!text) return;
        _sendMessage(text);
        msgInput.value = "";
        sendBtn.disabled = true;
        _resizeTA(msgInput);
      });
    }

    if (msgInput) {
      msgInput.addEventListener("input", function () {
        if (sendBtn) sendBtn.disabled = !msgInput.value.trim();
        _resizeTA(msgInput);
      });
      msgInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          if (sendBtn) sendBtn.click();
        }
      });
    }

    /* Name save */
    var nameSave  = document.getElementById("vcNameSave");
    var nameInput = document.getElementById("vcNameInput");
    var nameBar   = document.getElementById("vcNameBar");

    if (nameSave && nameInput && nameBar) {
      function _saveName() {
        var v = nameInput.value.trim();
        if (!v) { nameInput.focus(); return; }
        _userName = v;
        localStorage.setItem("vaani_chat_name", v);
        nameBar.style.display = "none";
        _clearStatus();
      }
      nameSave.addEventListener("click", _saveName);
      nameInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") _saveName();
      });
    }
  }

  function _resizeTA(el) {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }

  /* ── SYNC SIGNED-IN USER ────────────────────────────────────────
     If the user is already signed in via the main app, use their
     Firebase uid and display name automatically.
  ─────────────────────────────────────────────────────────────────*/
  function _syncUser() {
    var user = window._vaaniCurrentUser;
    if (!user) { _userUid = null; return; }

    _userUid = user.uid;

    /* If user has a display name from Google, pre-fill (but don't override manual entry) */
    if (!_userName && user.displayName) {
      _userName = user.displayName.split(" ")[0]; /* first name only */
      localStorage.setItem("vaani_chat_name", _userName);
    }

    /* Hide name bar if we now have a name */
    var nameBar = document.getElementById("vcNameBar");
    if (nameBar && _userName) nameBar.style.display = "none";
  }

  /* ── PUBLIC API ─────────────────────────────────────────────────
     Called by app.js inside _onPageActivate("Chat")
  ─────────────────────────────────────────────────────────────────*/
  window.vaaniChat = {

    /**
     * open() — called every time the Chat page becomes visible.
     * Safe to call multiple times.
     */
    open: function () {
      _chatVisible = true;

      /* Build UI on first open only */
      if (!_initialized) {
        _waitForFirebase(function () {
          _initFirebase();
          _buildUI();
          _syncUser();
          _startListening();
          _initialized = true;
        });
      } else {
        /* Already built — just sync user and restart listener if needed */
        _syncUser();
        if (!_unsubscribe) _startListening();
      }
    },

    /**
     * close() — called when Chat page is navigated away from.
     * Stops the Firestore listener to save bandwidth.
     */
    close: function () {
      _chatVisible = false;
      _stopListening();
    },

    /**
     * loadUsers() — kept for compatibility with old app.js call.
     * Now just calls open().
     */
    loadUsers: function () {
      this.open();
    },
  };

  console.log("[Vaani Chat] chat.js v1.0 loaded ✓");

})();
