/* ================================================================
   Vaani — chat.js  v4.1
   Minimal chat shell with profile sidebar + auth/profile gating.
   ================================================================ */

(function () {
  "use strict";

  var CHAT_ROOT_ID = "vaaniChat";
  var _searchDebounceTimer = null;
  var _latestSearchQuery = "";          // replaces _searchRequestSeq — stale-check by query string
  var _outsideClickHandler = null;
  var _unsubscribeIncomingRequests = null;
  var _unsubscribeConnections = null;   // realtime connections listener handle
  var _unsubscribeMessages = null;      // realtime messages listener handle
  var _activeMessageListenerKey = null; // guard against duplicate listeners
  var _activeMessagesSignature = "";    // avoids duplicate message renders
  var _optimisticMessages = [];         // local pending messages for instant UI feedback
  var _unsubscribeChatList = null;      // realtime chat list listener handle
  var _connectedUidSet = new Set();     // fast O(1) lookup: is uid connected?
  var _userProfileCache = Object.create(null); // uid -> lightweight profile cache
  var _renderedChatListSignature = "";  // prevents duplicate chat-list paints
  var _activeChatId = null;          // chatId currently open
  var _selectedChatUser = null;      // null => home view, object => chat view
  var _messages = [];                // active chat messages
  var _inputMessage = "";            // active chat input value
  var _messagesContainerRef = null;  // active chat messages container element

  var CHATS_COLLECTION = "chats";
  var MESSAGES_COLLECTION = "messages";
  var incomingRequests = [];

  var REQUESTS_COLLECTION = "connectionRequests";
  var CONNECTIONS_COLLECTION = "connections";

  function _root() {
    return document.getElementById(CHAT_ROOT_ID);
  }

  function _esc(value) {
    var el = document.createElement("div");
    el.appendChild(document.createTextNode(String(value || "")));
    return el.innerHTML;
  }

  function _googleLogoSvg() {
    return (
      '<svg class="vg-g-logo" viewBox="0 0 24 24" fill="none">' +
      '<path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>' +
      '<path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>' +
      '<path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>' +
      '<path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>' +
      "</svg>"
    );
  }

  function _removeMenu() {
    var wrapper = document.getElementById("vmWrapper");
    if (wrapper) wrapper.remove();
    document.body.classList.remove("vm-menu-open");
    window._vaaniOpenProfileMenu = null;
  }

  function _menuItem(icon, label, action) {
    var icons = {
      person: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
      globe: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
      settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
      users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'
    };

    return (
      '<button class="vm-item" data-action="' + action + '">' +
      '<svg viewBox="0 0 24 24">' + (icons[icon] || "") + "</svg>" +
      '<span>' + _esc(label) + "</span>" +
      '<svg class="vm-chevron" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>' +
      "</button>"
    );
  }

  function _buildMenu(user, profile) {
    var username = profile.username || "user";
    var photo = user.photoURL || "";
    var initial = username.charAt(0).toUpperCase();

    return (
      '<div class="vm-overlay" id="vmOverlay"></div>' +
      '<aside class="vm-panel" id="vmPanel" aria-label="Profile menu">' +
      '<div class="vm-profile">' +
      '<div class="vm-avatar">' +
      (photo
        ? '<img src="' + _esc(photo) + '" alt="Profile avatar">'
        : '<span>' + _esc(initial) + "</span>") +
      "</div>" +
      '<div class="vm-meta">' +
      '<div class="vm-username">@' + _esc(username) + "</div>" +
      '<div class="vm-email">' + _esc(user.email || "") + "</div>" +
      "</div>" +
      "</div>" +
      '<nav class="vm-nav">' +
      _menuItem("person", "My Profile", "profile") +
      _menuItem("globe", "Languages", "languages") +
      _menuItem("settings", "Settings", "settings") +
      _menuItem("users", "Manage Connections", "connections") +
      "</nav>" +
      '<button class="vm-signout" id="vmSignOut">' +
      '<svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>' +
      "Sign out" +
      "</button>" +
      "</aside>"
    );
  }

  function _injectMenu(user, profile) {
    _removeMenu();

    var wrapper = document.createElement("div");
    wrapper.id = "vmWrapper";
    wrapper.innerHTML = _buildMenu(user, profile);
    document.body.appendChild(wrapper);

    var overlay = document.getElementById("vmOverlay");
    var panel = document.getElementById("vmPanel");
    var signOutBtn = document.getElementById("vmSignOut");

    function closeMenu() {
      if (!overlay || !panel) return;
      overlay.classList.remove("vm-open");
      panel.classList.remove("vm-open");
      document.body.classList.remove("vm-menu-open");
    }

    function openMenu() {
      if (!overlay || !panel) return;
      overlay.classList.add("vm-open");
      panel.classList.add("vm-open");
      document.body.classList.add("vm-menu-open");
    }

    window._vaaniOpenProfileMenu = openMenu;

    if (overlay) overlay.addEventListener("click", closeMenu);

    var items = wrapper.querySelectorAll(".vm-item");
    items.forEach(function (item) {
      item.addEventListener("click", function () {
        var action = item.dataset.action;
        closeMenu();

        if (action === "settings" && typeof window.navigateTo === "function") {
          window.navigateTo("Settings");
          return;
        }

        if (typeof window.showToast === "function") {
          var labelNode = item.querySelector("span");
          var label = labelNode ? labelNode.textContent : "Feature";
          window.showToast(label + " coming soon");
        }
      });
    });

    if (signOutBtn) {
      signOutBtn.addEventListener("click", function () {
        closeMenu();
        if (window.vaaniRouter && typeof window.vaaniRouter.signOut === "function") {
          window.vaaniRouter.signOut();
        }
      });
    }
  }

  function _renderLogin() {
    var root = _root();
    if (!root) return;

    _stopListening();
    _clearSearchState();
    _removeMenu();

    root.innerHTML =
      '<div class="vg-screen vg-login-screen">' +
      '<div class="vg-card">' +
      '<div class="vg-card-icon">' +
      '<svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' +
      "</div>" +
      '<h2 class="vg-card-title">Join the Conversation</h2>' +
      '<p class="vg-card-sub">Sign in to access your Vaani chat workspace.</p>' +
      '<button class="vg-google-btn" id="vgSignInBtn">' + _googleLogoSvg() + "Continue with Google</button>" +
      '<p class="vg-hint">Translation features work without signing in ✓</p>' +
      "</div>" +
      "</div>";

    var signInBtn = document.getElementById("vgSignInBtn");
    if (!signInBtn) return;

    signInBtn.addEventListener("click", async function () {
      signInBtn.disabled = true;
      signInBtn.textContent = "Signing in…";
      try {
        await window.vaaniRouter.signIn();
      } catch (_) {
        signInBtn.disabled = false;
        signInBtn.innerHTML = _googleLogoSvg() + "Continue with Google";
      }
    });
  }

  function _renderProfile(user) {
    var root = _root();
    if (!root) return;

    _stopListening();
    _clearSearchState();
    _removeMenu();

    var firstName = (user.displayName || "").split(" ")[0] || "";
    var suggested = firstName.toLowerCase().replace(/[^a-z0-9]/g, "");

    root.innerHTML =
      '<div class="vg-screen vg-profile-screen">' +
      '<div class="vg-card">' +
      '<div class="vg-avatar-wrap">' +
      (user.photoURL
        ? '<img class="vg-profile-avatar" src="' + _esc(user.photoURL) + '" alt="avatar">'
        : '<div class="vg-profile-avatar vg-avatar-fallback">' + _esc((firstName[0] || "?").toUpperCase()) + "</div>") +
      "</div>" +
      '<h2 class="vg-card-title">Create Your Profile</h2>' +
      '<p class="vg-card-sub">Hi ' + _esc(firstName || "there") + '! Choose a unique username.</p>' +
      '<div class="vg-field">' +
      '<label class="vg-label" for="vgUsernameInput">Username</label>' +
      '<div class="vg-input-wrap">' +
      '<span class="vg-input-prefix">@</span>' +
      '<input id="vgUsernameInput" class="vg-input" type="text" maxlength="20" autocomplete="off" spellcheck="false" placeholder="yourname_01" value="' + _esc(suggested) + '">' +
      "</div>" +
      '<span class="vg-field-hint" id="vgUsernameHint">Must include letters + numbers. Underscore (_) allowed.</span>' +
      "</div>" +
      '<button class="vg-primary-btn" id="vgCreateProfileBtn" disabled>Create Profile</button>' +
      '<button class="vg-ghost-btn" id="vgSignOutBtn">Sign out</button>' +
      "</div>" +
      "</div>";

    var input = document.getElementById("vgUsernameInput");
    var hint = document.getElementById("vgUsernameHint");
    var createBtn = document.getElementById("vgCreateProfileBtn");

    function validate() {
      if (!input || !hint || !createBtn) return;
      var err = window.vaaniProfile && window.vaaniProfile.validateUsername
        ? window.vaaniProfile.validateUsername(input.value)
        : null;

      if (err) {
        hint.textContent = err;
        hint.className = "vg-field-hint vg-hint-error";
        createBtn.disabled = true;
      } else {
        hint.textContent = "✓ Username looks good";
        hint.className = "vg-field-hint vg-hint-success";
        createBtn.disabled = false;
      }
    }

    if (input) {
      input.addEventListener("input", validate);
      validate();
    }

    if (createBtn) {
      createBtn.addEventListener("click", async function () {
        var username = input ? input.value.trim() : "";
        var err = window.vaaniProfile && window.vaaniProfile.validateUsername
          ? window.vaaniProfile.validateUsername(username)
          : null;

        if (err) {
          if (hint) {
            hint.textContent = err;
            hint.className = "vg-field-hint vg-hint-error";
          }
          return;
        }

        createBtn.disabled = true;
        createBtn.textContent = "Creating…";

        try {
          var profile = await window.vaaniProfile.create(user, username);
          window.vaaniRouter.goToChat(user, profile);
        } catch (error) {
          if (hint) {
            hint.textContent = error.message || "Something went wrong.";
            hint.className = "vg-field-hint vg-hint-error";
          }
          createBtn.disabled = false;
          createBtn.textContent = "Create Profile";
        }
      });
    }

    var signOutBtn = document.getElementById("vgSignOutBtn");
    if (signOutBtn) {
      signOutBtn.addEventListener("click", function () {
        window.vaaniRouter.signOut();
      });
    }
  }

  function _renderChat(user, profile) {
    var root = _root();
    if (!root) return;

    _clearSearchState();
    _injectMenu(user, profile);

    var photo = user.photoURL || "";
    var initials = ((profile.username || "U").charAt(0) || "U").toUpperCase();

    root.innerHTML =
      '<section class="vc-shell" aria-label="Chat screen">' +
      '<button class="vc-avatar-btn" id="vcProfileBtn" aria-label="Open profile menu" title="Profile menu">' +
      (photo
        ? '<img src="' + _esc(photo) + '" alt="avatar" class="vc-avatar-img">'
        : '<span class="vc-avatar-initials">' + _esc(initials) + "</span>") +
      "</button>" +
      '<div class="vc-home-view" id="vcHomeScreen">' +
      '<div class="vc-search-wrap" id="vcSearchWrap">' +
      '<input id="vcUserSearchInput" class="vc-search-input" type="text" autocomplete="off" spellcheck="false" placeholder="Search users by username">' +
      '<div class="vc-search-dropdown" id="vcSearchDropdown"></div>' +
      "</div>" +
      '<div class="vc-requests-wrap">' +
      '<button class="vc-requests-toggle" id="vcRequestsToggle" type="button">Requests <span class="vc-requests-badge" id="vcRequestsBadge">0</span></button>' +
      '<div class="vc-requests-panel" id="vcRequestsPanel">' +
      '<div class="vc-requests-list" id="vcRequestsList"><div class="vc-requests-empty">No pending requests</div></div>' +
      "</div>" +
      "</div>" +
      '<div class="vc-chat-list" id="vcChatList"></div>' +
      "</div>" +
      '<div class="vc-chat-view-wrap" id="vcChatScreen" style="display:none;"></div>' +
      "</section>";

    var profileBtn = document.getElementById("vcProfileBtn");
    if (profileBtn) {
      profileBtn.addEventListener("click", function () {
        if (typeof window._vaaniOpenProfileMenu === "function") {
          window._vaaniOpenProfileMenu();
        }
      });
    }

    _bindUserSearch();
    _bindIncomingRequestActions();
    _fetchConnections(user.uid);       // start realtime connections Set
    _fetchIncomingRequests(user.uid);  // start realtime requests listener
    _createChatListListener();         // start realtime chat list listener
    _renderChatList();
    _setSelectedChatUser(null);
  }

  function _syncViewWithSelection() {
    var home = document.getElementById("vcHomeScreen");
    var chat = document.getElementById("vcChatScreen");
    if (!home || !chat) return;

    if (_selectedChatUser) {
      home.style.display = "none";
      chat.style.display = "block";
    } else {
      _activeChatId = null;
      _messages = [];
      _inputMessage = "";
      _messagesContainerRef = null;
      _teardownMessageListener();
      home.style.display = "block";
      chat.style.display = "none";
    }

    if (window.vaaniChat) {
      window.vaaniChat._currentView = _selectedChatUser ? "chat" : "home";
    }
  }

  function _setSelectedChatUser(user) {
    _selectedChatUser = user || null;

    var currentUid = window._vaaniCurrentUser && window._vaaniCurrentUser.uid
      ? String(window._vaaniCurrentUser.uid)
      : "";
    var otherUid = _selectedChatUser && _selectedChatUser.uid
      ? String(_selectedChatUser.uid)
      : "";

    if (_selectedChatUser && currentUid && otherUid) {
      _listenToMessages(currentUid, otherUid, _activeChatId);
    } else {
      _teardownMessageListener();
    }

    _syncViewWithSelection();
  }

  function _setMessages(nextMessages) {
    _messages = Array.isArray(nextMessages) ? nextMessages : [];
  }

  function _setInputMessage(nextValue) {
    _inputMessage = String(nextValue || "");
  }

  function _scrollMessagesToBottom() {
    if (!_messagesContainerRef) return;
    window.requestAnimationFrame(function () {
      if (!_messagesContainerRef) return;
      _messagesContainerRef.scrollTop = _messagesContainerRef.scrollHeight;
    });
  }

  function _teardownMessageListener() {
    if (_unsubscribeMessages) {
      _unsubscribeMessages();
      _unsubscribeMessages = null;
    }
    _activeMessageListenerKey = null;
    _activeMessagesSignature = "";
    _optimisticMessages = [];
  }

  function _getUserProfileCached(db, uid) {
    if (!db || !uid) return Promise.resolve({ username: "user", photoURL: "" });
    if (_userProfileCache[uid]) return Promise.resolve(_userProfileCache[uid]);

    return db.collection("users").doc(uid).get()
      .then(function (doc) {
        var data = doc.exists ? (doc.data() || {}) : {};
        var profile = {
          username: data.username || "user",
          photoURL: data.photoURL || ""
        };
        _userProfileCache[uid] = profile;
        return profile;
      })
      .catch(function () {
        var fallback = { username: "user", photoURL: "" };
        _userProfileCache[uid] = fallback;
        return fallback;
      });
  }

  // ── Realtime connections listener ─────────────────────────────────────────
  // Attaches once from _renderChat. Keeps _connectedUidSet in sync with
  // the "connections" collection so search results never need an extra
  // Firestore read to determine connected state.
  function _fetchConnections(currentUid) {
    var db = window.vaaniRouter && typeof window.vaaniRouter.getDb === "function"
      ? window.vaaniRouter.getDb()
      : null;
    if (!db || !currentUid) return;

    // Tear down any stale listener first
    if (_unsubscribeConnections) {
      _unsubscribeConnections();
      _unsubscribeConnections = null;
    }
    _connectedUidSet.clear();

    _unsubscribeConnections = db
      .collection(CONNECTIONS_COLLECTION)
      .where("users", "array-contains", currentUid)
      .onSnapshot(
        function (snapshot) {
          // Rebuild the Set from scratch on every snapshot — avoids stale entries
          _connectedUidSet.clear();
          snapshot.forEach(function (doc) {
            var data = doc.data() || {};
            (data.users || []).forEach(function (uid) {
              if (uid && uid !== currentUid) {
                _connectedUidSet.add(uid);
              }
            });
          });
          var nextSignature = Array.from(_connectedUidSet).sort().join("|");
          var prevSignature = _fetchConnections._lastSignature || "";
          _fetchConnections._lastSignature = nextSignature;
          console.log("[Vaani] connections updated — " + _connectedUidSet.size + " connected");
          if (window.vaaniChat && window.vaaniChat._currentView === "home") {
            if (nextSignature === prevSignature) return;
            _renderChatList();
          }
        },
        function (err) {
          console.error("[Vaani] connections listener error:", err);
          _connectedUidSet.clear();
        }
      );
  }

  function _createChatListListener() {
    var db = window.vaaniRouter && typeof window.vaaniRouter.getDb === "function"
      ? window.vaaniRouter.getDb()
      : null;
    var currentUid = window._vaaniCurrentUser && window._vaaniCurrentUser.uid
      ? window._vaaniCurrentUser.uid
      : null;

    if (!db || !currentUid) return;

    if (_unsubscribeChatList) {
      _unsubscribeChatList();
      _unsubscribeChatList = null;
    }

    window.vaaniChat._chatList = [];

    _unsubscribeChatList = db
      .collection(CHATS_COLLECTION)
      .where("participants", "array-contains", currentUid)
      .orderBy("updatedAt", "desc")
      .onSnapshot(
        async function (snapshot) {
          var baseList = [];
          snapshot.forEach(function (doc) {
            var data = doc.data() || {};
            var participants = Array.isArray(data.participants) ? data.participants : [];
            var otherUid = participants.find(function (uid) { return uid && uid !== currentUid; }) || null;

            baseList.push({
              chatId: doc.id,
              otherUid: otherUid,
              lastMessage: data.lastMessage || "",
              updatedAt: data.updatedAt || null
            });
          });

          var nextList = await Promise.all(baseList.map(async function (chat) {
            if (!chat.otherUid) {
              return Object.assign({}, chat, { username: "user", displayName: null });
            }

            try {
              var userDoc = await db.collection("users").doc(chat.otherUid).get();
              var userData = userDoc.exists ? (userDoc.data() || {}) : {};
              return Object.assign({}, chat, {
                username: userData.username || "user",
                displayName: userData.displayName || null
              });
            } catch (e) {
              return Object.assign({}, chat, { username: "user", displayName: null });
            }
          }));

          var signature = nextList.map(function (chat) {
            return [
              chat.chatId || "",
              chat.otherUid || "",
              chat.lastMessage || "",
              chat.updatedAt && typeof chat.updatedAt.toMillis === "function"
                ? chat.updatedAt.toMillis()
                : ""
            ].join(":");
          }).join("|");

          var prev = _createChatListListener._lastSignature || "";
          _createChatListListener._lastSignature = signature;
          window.vaaniChat._chatList = nextList;
          if (signature !== prev) _renderChatList();
        },
        function (err) {
          console.error("[Vaani] chat list listener error:", err);
          window.vaaniChat._chatList = [];
          _renderChatList();
        }
      );
  }

  async function _renderChatList() {
    var listEl = document.getElementById("vcChatList");
    var db = window.vaaniRouter && typeof window.vaaniRouter.getDb === "function"
      ? window.vaaniRouter.getDb()
      : null;
    var currentUid = window._vaaniCurrentUser && window._vaaniCurrentUser.uid
      ? window._vaaniCurrentUser.uid
      : null;
    if (!listEl || !db || !currentUid) return;

    var chatMapByUid = Object.create(null);
    (window.vaaniChat._chatList || []).forEach(function (chat) {
      if (chat && chat.otherUid) chatMapByUid[chat.otherUid] = chat;
    });

    var connectedUsers = Array.from(_connectedUidSet);
    if (!connectedUsers.length) {
      listEl.innerHTML = '<div class="vc-chat-list-empty">Start a conversation</div>';
      _renderedChatListSignature = "empty";
      return;
    }

    var items = await Promise.all(connectedUsers.map(async function (otherUid) {
      var chat = chatMapByUid[otherUid] || null;
      var profile = chat
        ? { username: chat.username || "user", photoURL: chat.photoURL || "" }
        : await _getUserProfileCached(db, otherUid);

      return {
        chatId: chat && chat.chatId ? chat.chatId : null,
        otherUid: otherUid,
        username: profile.username || "user",
        photoURL: profile.photoURL || "",
        lastMessage: chat && chat.lastMessage ? chat.lastMessage : "No messages yet",
        updatedAt: chat ? chat.updatedAt || null : null
      };
    }));

    items.sort(function (a, b) {
      var aTime = a.updatedAt && typeof a.updatedAt.toMillis === "function" ? a.updatedAt.toMillis() : 0;
      var bTime = b.updatedAt && typeof b.updatedAt.toMillis === "function" ? b.updatedAt.toMillis() : 0;
      return bTime - aTime;
    });

    var nextSignature = items.map(function (chat) {
      return [
        chat.chatId || "",
        chat.otherUid || "",
        chat.lastMessage || "",
        chat.updatedAt && typeof chat.updatedAt.toMillis === "function"
          ? chat.updatedAt.toMillis()
          : ""
      ].join(":");
    }).join("|");
    if (nextSignature === _renderedChatListSignature) return;
    _renderedChatListSignature = nextSignature;

    listEl.innerHTML = "";
    items.forEach(function (chat) {
      var item = document.createElement("button");
      item.type = "button";
      item.className = "vc-chat-list-item";

      var timeText = "";
      if (chat.updatedAt && typeof chat.updatedAt.toDate === "function") {
        timeText = chat.updatedAt.toDate().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      }

      item.innerHTML =
        '<div class="vc-chat-list-top">' +
        '<span class="vc-chat-list-username">@' + _esc(chat.username || "user") + "</span>" +
        (timeText ? '<span class="vc-chat-list-time">' + _esc(timeText) + "</span>" : "") +
        "</div>" +
        '<div class="vc-chat-list-last">' + _esc(chat.lastMessage || "No messages yet") + "</div>";

      item.addEventListener("click", async function () {
        if (!chat.otherUid) {
          console.error("[Vaani] Missing otherUid for chat list item:", chat);
          return;
        }

        var existingChatId = chat.chatId;
        if (!existingChatId) {
          existingChatId = await _getOrCreateChat(chat.otherUid);
        }
        if (!existingChatId) {
          console.error("[Vaani] Invalid chatId for chat list item:", chat);
          return;
        }

        _openChatUI(existingChatId, {
          uid: chat.otherUid,
          username: chat.username || "user",
          photoURL: chat.photoURL || ""
        });
      });

      listEl.appendChild(item);
    });
  }

  function _stopListening() {
    if (_unsubscribeIncomingRequests) {
      _unsubscribeIncomingRequests();
      _unsubscribeIncomingRequests = null;
    }
    if (_unsubscribeConnections) {
      _unsubscribeConnections();
      _unsubscribeConnections = null;
      _connectedUidSet.clear();
    }
    _teardownMessageListener();
    if (_unsubscribeChatList) {
      _unsubscribeChatList();
      _unsubscribeChatList = null;
    }
    _renderedChatListSignature = "";
    _createChatListListener._lastSignature = "";
    _fetchConnections._lastSignature = "";
  }

  // Clears debounce timer, resets the latest query string, and removes the
  // outside-click listener. Safe to call from any screen transition.
  function _clearSearchState() {
    if (_searchDebounceTimer) {
      clearTimeout(_searchDebounceTimer);
      _searchDebounceTimer = null;
    }
    _latestSearchQuery = "";
    if (_outsideClickHandler) {
      document.removeEventListener("mousedown", _outsideClickHandler);
      _outsideClickHandler = null;
    }
  }

  function _isSearchItemDisabled(state, isSelf) {
    if (isSelf) return true;
    // "requested" and "self" are disabled; connected/incoming/none are actionable
    return state === "requested" || state === "self";
  }

  // ── Render search results into the dropdown ──────────────────────────────
  function _renderSearchResults(dropdown, list, stateByUid, currentUid) {
    if (!dropdown) return;

    dropdown.innerHTML = "";

    if (!list || list.length === 0) {
      dropdown.innerHTML = '<div class="vc-search-empty">No users found</div>';
      dropdown.classList.add("vc-open");
      return;
    }

    var visibleCount = 0;

    list.forEach(function (data) {
      var uid = data && data.uid ? data.uid : "";
      if (!uid) return;

      var username = (data && data.username) || "";
      if (!username) return;

      var name    = (data && data.name)     || username;
      var photo   = (data && data.photoURL) || "";
      var initial = (username.charAt(0) || "U").toUpperCase();
      var state   = stateByUid && uid ? stateByUid[uid] || "none" : "none";
      var isSelf  = uid === currentUid;

      // Map state → button label + disabled flag
      var label;
      var disabled;
      switch (state) {
        case "self":      label = "(You)";      disabled = true;  break;
        case "connected": label = "Message";    disabled = false; break;
        case "requested": label = "Requested";  disabled = true;  break;
        case "incoming":  label = "Accept";     disabled = false; break;
        default:          label = "Connect";    disabled = false; break;
      }

      var itemEl = document.createElement("button");
      itemEl.className = "vc-search-item";
      itemEl.type      = "button";
      itemEl.setAttribute("data-uid",   uid);
      itemEl.setAttribute("data-state", state);
      if (disabled) itemEl.disabled = true;

      itemEl.innerHTML =
        '<span class="vc-search-avatar">' +
        (photo
          ? '<img src="' + _esc(photo) + '" alt="' + _esc(username) + ' avatar">'
          : '<span class="vc-search-initial">' + _esc(initial) + "</span>") +
        "</span>" +
        '<span class="vc-search-meta">' +
        '<span class="vc-search-username">@' + _esc(username) + "</span>" +
        '<span class="vc-search-name">'     + _esc(name)     + "</span>" +
        "</span>" +
        '<span class="vc-search-action" data-uid="' + _esc(uid) + '" data-state="' + _esc(state) + '">' +
        _esc(label) +
        "</span>";

      dropdown.appendChild(itemEl);
      visibleCount += 1;
    });

    if (visibleCount === 0) {
      dropdown.innerHTML = '<div class="vc-search-empty">No users found</div>';
    }

    dropdown.classList.add("vc-open");
  }

  function _setSearchItemState(dropdown, uid, state) {
    if (!dropdown || !uid) return;
    var itemEl   = dropdown.querySelector('.vc-search-item[data-uid="'   + uid + '"]');
    var actionEl = dropdown.querySelector('.vc-search-action[data-uid="' + uid + '"]');
    if (!actionEl || !itemEl) return;

    var labelMap = {
      "self":      "(You)",
      "connected": "Message",
      "requested": "Requested",
      "incoming":  "Accept",
      "none":      "Connect"
    };
    var label = labelMap[state] || "Connect";

    actionEl.textContent = label;
    actionEl.setAttribute("data-state", state || "none");
    itemEl.setAttribute("data-state",   state || "none");

    var isSelf = window._vaaniCurrentUser && window._vaaniCurrentUser.uid
      ? window._vaaniCurrentUser.uid === uid
      : false;
    itemEl.disabled = _isSearchItemDisabled(state, isSelf);
  }

  async function _isConnected(db, currentUid, targetUid) {
    // Fast path: check in-memory Set maintained by _fetchConnections listener
    if (_connectedUidSet.has(targetUid)) return true;

    // Slow path: fall back to Firestore if listener hasn't fired yet
    // (e.g. called very early on page load before onSnapshot completes)
    var snap = await db
      .collection(CONNECTIONS_COLLECTION)
      .where("users", "array-contains", currentUid)
      .limit(50)
      .get();

    var found = false;
    snap.forEach(function (doc) {
      var data  = doc.data() || {};
      var users = data.users || [];
      if (users.indexOf(targetUid) !== -1) found = true;
    });
    return found;
  }

  // ── Build button state for every user in search results ─────────────────
  // Runs 3 parallel Firestore reads (connections, outgoing requests, incoming
  // requests) then assigns one of five states to each uid:
  //   "self"      → current user's own result     → "(You)"      disabled
  //   "connected" → already in connections         → "Message"    enabled
  //   "requested" → current user sent a request    → "Requested"  disabled
  //   "incoming"  → other user sent a request      → "Accept"     enabled
  //   "none"      → no relationship                → "Connect"    enabled
  async function _buildSearchItemStates(db, currentUid, users) {
    var stateByUid = {};
    if (!db || !currentUid || !users || !users.length) return stateByUid;

    var targetUids = users
      .map(function (item) { return item.uid || ""; })
      .filter(Boolean);
    if (!targetUids.length) return stateByUid;

    // Default every uid to "none" so the map is always fully populated
    targetUids.forEach(function (uid) {
      stateByUid[uid] = uid === currentUid ? "self" : "none";
    });

    // ── connections: use in-memory Set (no Firestore read needed) ───────────
    // _connectedUidSet is maintained by _fetchConnections onSnapshot listener.
    // Outgoing + incoming requests still need live Firestore reads because
    // they change independently and are not cached separately.

    var results = await Promise.all([

      // Outgoing pending requests sent by current user
      db.collection(REQUESTS_COLLECTION)
        .where("fromUid", "==", currentUid)
        .where("status",  "==", "pending")
        .limit(200)
        .get(),

      // Incoming pending requests sent TO current user
      db.collection(REQUESTS_COLLECTION)
        .where("toUid",  "==", currentUid)
        .where("status", "==", "pending")
        .limit(200)
        .get()

    ]).catch(function (err) {
      console.error("[Vaani] _buildSearchItemStates fetch error:", err);
      return [null, null];
    });

    var outgoingSnap = results[0];
    var incomingSnap = results[1];

    var requestedSet = new Set();   // current user sent request to these uids
    if (outgoingSnap) {
      outgoingSnap.forEach(function (doc) {
        var data = doc.data() || {};
        if (data.toUid) requestedSet.add(data.toUid);
      });
    }

    var incomingSet = new Set();    // these uids sent a request to current user
    if (incomingSnap) {
      incomingSnap.forEach(function (doc) {
        var data = doc.data() || {};
        if (data.fromUid) incomingSet.add(data.fromUid);
      });
    }

    // ── Assign final state — priority: self > connected > requested > incoming > none
    targetUids.forEach(function (uid) {
      if (uid === currentUid)            { stateByUid[uid] = "self";      return; }
      if (_connectedUidSet.has(uid))     { stateByUid[uid] = "connected"; return; }
      if (requestedSet.has(uid))         { stateByUid[uid] = "requested"; return; }
      if (incomingSet.has(uid))          { stateByUid[uid] = "incoming";  return; }
      stateByUid[uid] = "none";
    });

    return stateByUid;
  }

  async function _sendConnectionRequest(db, fromUid, toUid) {
    await db.collection(REQUESTS_COLLECTION).add({
      fromUid:   fromUid,
      toUid:     toUid,
      status:    "pending",
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }

  async function _hasPendingConnectionRequest(db, fromUid, toUid) {
    var existing = await db
      .collection(REQUESTS_COLLECTION)
      .where("fromUid", "==", fromUid)
      .where("toUid",   "==", toUid)
      .where("status",  "==", "pending")
      .limit(1)
      .get();
    return !existing.empty;
  }

  async function _createConnection(db, uidA, uidB) {
    var alreadyConnected = await _isConnected(db, uidA, uidB);
    if (alreadyConnected) return;
    await db.collection(CONNECTIONS_COLLECTION).add({
      users:     [uidA, uidB],
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }

  async function _acceptConnectionRequest(db, requestId, currentUid, fromUid) {
    if (!db || !requestId || !currentUid || !fromUid) {
      console.error("[Vaani] acceptConnectionRequest: missing required params");
      return;
    }

    try {
      // ── Guard: skip if already connected ──────────────────────────────
      var alreadyConnected = await _isConnected(db, currentUid, fromUid);
      if (alreadyConnected) {
        console.warn("[Vaani] acceptConnectionRequest: already connected, skipping");
        // Still delete the stale request so it doesn't linger in UI
        await db.collection(REQUESTS_COLLECTION).doc(requestId).delete();
        return;
      }

      // ── Step 1: create the connection document ─────────────────────────
      await db.collection(CONNECTIONS_COLLECTION).add({
        users:     [currentUid, fromUid],
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      // ── Step 2: delete the request document ───────────────────────────
      // Deletion (not status update) triggers onSnapshot to remove the item
      await db.collection(REQUESTS_COLLECTION).doc(requestId).delete();

      if (typeof window.showToast === "function") window.showToast("Connection accepted");

    } catch (err) {
      console.error("[Vaani] acceptConnectionRequest failed:", err);
      throw err; // re-throw so the button re-enables in _bindIncomingRequestActions
    }
  }

  async function _rejectConnectionRequest(db, requestId) {
    if (!db || !requestId) {
      console.error("[Vaani] rejectConnectionRequest: missing required params");
      return;
    }

    try {
      // ── Delete the request document outright ──────────────────────────
      await db.collection(REQUESTS_COLLECTION).doc(requestId).delete();

      if (typeof window.showToast === "function") window.showToast("Request rejected");

    } catch (err) {
      console.error("[Vaani] rejectConnectionRequest failed:", err);
      throw err; // re-throw so the button re-enables in _bindIncomingRequestActions
    }
  }

  function _renderIncomingRequests(requests) {
    var listEl  = document.getElementById("vcRequestsList");
    var badgeEl = document.getElementById("vcRequestsBadge");
    if (!listEl || !badgeEl) return;

    var count = requests.length;
    badgeEl.textContent = String(count);
    badgeEl.classList.toggle("vc-visible", count > 0);

    if (!count) {
      listEl.innerHTML = '<div class="vc-requests-empty">No pending requests</div>';
      return;
    }

    listEl.innerHTML = requests.map(function (request) {
      return (
        '<div class="vc-request-item">' +
        '<div class="vc-request-copy">@' + _esc(request.fromUsername || "user") + "</div>" +
        '<div class="vc-request-copy">'  + _esc(request.fromName     || "")     + "</div>" +
        '<div class="vc-request-actions">' +
        '<button type="button" class="vc-mini-btn vc-accept-btn" data-request-id="' + _esc(request.id)      + '" data-from-uid="' + _esc(request.fromUid) + '" data-to-uid="' + _esc(request.toUid) + '">Accept</button>' +
        '<button type="button" class="vc-mini-btn vc-reject-btn" data-request-id="' + _esc(request.id)      + '">Reject</button>' +
        "</div>" +
        "</div>"
      );
    }).join("");
  }

  // ── Realtime incoming-requests listener ──────────────────────────────────
  // onSnapshot is the ONLY place that writes incomingRequests and repaints.
  // _acceptConnectionRequest / _rejectConnectionRequest only write to Firestore;
  // the snapshot fires automatically and updates the UI — no manual filter needed.
  async function _fetchIncomingRequests(currentUid) {
    var db = window.vaaniRouter && typeof window.vaaniRouter.getDb === "function"
      ? window.vaaniRouter.getDb()
      : null;
    if (!db || !currentUid) return;

    // Always tear down before re-attaching — prevents duplicate listeners
    if (_unsubscribeIncomingRequests) {
      _unsubscribeIncomingRequests();
      _unsubscribeIncomingRequests = null;
    }

    var query = db
      .collection(REQUESTS_COLLECTION)
      .where("toUid",  "==", currentUid)
      .where("status", "==", "pending")
      .orderBy("createdAt", "desc");

    _unsubscribeIncomingRequests = query.onSnapshot(
      async function (snapshot) {
        var pending = [];

        for (var i = 0; i < snapshot.docs.length; i++) {
          var doc  = snapshot.docs[i];
          var data = doc.data() || {};
          if (!data.fromUid) continue;

          try {
            var fromProfile = await db.collection("users").doc(data.fromUid).get();
            var fromData    = fromProfile.exists ? fromProfile.data() : {};
            pending.push({
              id:           doc.id,
              fromUid:      data.fromUid      || "",
              toUid:        data.toUid        || "",
              fromUsername: fromData.username || "user",
              fromName:     fromData.name     || ""
            });
          } catch (err) {
            console.error("[Vaani] Failed to load incoming request profile from Firestore:", err);
            // Profile fetch failed — show request with fallback display values
            pending.push({
              id:           doc.id,
              fromUid:      data.fromUid || "",
              toUid:        data.toUid   || "",
              fromUsername: "user",
              fromName:     ""
            });
          }
        }

        // Single source of truth: snapshot owns the array and the render
        incomingRequests = pending;
        _renderIncomingRequests(incomingRequests);
      },
      function (err) {
        console.error("[Vaani] incoming requests listener error:", err);
        incomingRequests = [];
        _renderIncomingRequests(incomingRequests);
      }
    );
  }

  function _bindIncomingRequestActions() {
    var listEl    = document.getElementById("vcRequestsList");
    var toggleBtn = document.getElementById("vcRequestsToggle");
    var panel     = document.getElementById("vcRequestsPanel");
    if (!listEl || !toggleBtn || !panel) return;

    toggleBtn.addEventListener("click", function () {
      panel.classList.toggle("vc-open");
    });

    listEl.addEventListener("click", async function (event) {
       var acceptBtn = event.target.closest(".vc-accept-btn");
       var rejectBtn = event.target.closest(".vc-reject-btn");
       if (!acceptBtn && !rejectBtn) return;
       var actionBtn  = acceptBtn || rejectBtn;
       var requestId  = actionBtn.getAttribute("data-request-id") || "";
       var fromUid    = actionBtn.getAttribute("data-from-uid")   || "";
       
       // ── Validate early — log and bail before touching Firestore ─────────
       if (!requestId) {
          console.error("[Vaani] request click: missing requestId");
          return;
       }
       if (acceptBtn && !fromUid) {
          console.error("[Vaani] request click: missing fromUid for accept");
          return;
       }
       
       var currentUid = window._vaaniCurrentUser && window._vaaniCurrentUser.uid
          ? window._vaaniCurrentUser.uid
          : "";
       if (!currentUid) {
          console.error("[Vaani] request click: no current user");
          return;
       }
       
       var db = window.vaaniRouter && typeof window.vaaniRouter.getDb === "function"
          ? window.vaaniRouter.getDb()
          : null;
       if (!db) {
          console.error("[Vaani] request click: db unavailable");
          return;
       }

  // ── Disable button for the duration of the async operation ──────────
  // onSnapshot owns the repaint — we never manually remove DOM nodes.
  actionBtn.disabled = true;

  try {
    if (acceptBtn) {
      await _acceptConnectionRequest(db, requestId, currentUid, fromUid);
    } else {
      await _rejectConnectionRequest(db, requestId);
    }
    // Success: do NOT touch the DOM here.
    // onSnapshot will fire and _renderIncomingRequests will repaint.
  } catch (err) {
    // Firestore failure — re-enable so user can retry
    console.error("[Vaani] request action failed:", err);
    actionBtn.disabled = false;
    if (typeof window.showToast === "function") {
      window.showToast("Action failed — please try again");
    }
  }
});
  }

  // ── Core search fetch ────────────────────────────────────────────────────
  // Stores the query string it was called with, then after the await checks
  // whether a newer keystroke has already replaced it.  No integer counter
  // needed — the query string itself is the identity token.
  async function _fetchUsersByPrefix(query, dropdown) {
    var db = window.vaaniRouter && typeof window.vaaniRouter.getDb === "function"
      ? window.vaaniRouter.getDb()
      : null;
    if (!db || !dropdown) return;

    try {
      var snapshot = await db
        .collection("users")
        .orderBy("username")
        .startAt(query)
        .endAt(query + "\uf8ff")
        .limit(10)
        .get();

      // Discard if the user has already typed something different
      if (query !== _latestSearchQuery) return;

      var currentUid = window._vaaniCurrentUser && window._vaaniCurrentUser.uid
        ? window._vaaniCurrentUser.uid
        : "";

      var list = [];
      snapshot.forEach(function (doc) {
        var data = doc.data();
        if (!data || !data.username) return;
        list.push({
          uid:      doc.id,
          username: data.username,
          name:     data.name     || "",
          photoURL: data.photoURL || ""
        });
      });

      // Second stale-check: _buildSearchItemStates is also async
      if (query !== _latestSearchQuery) return;

      var stateByUid = await _buildSearchItemStates(db, currentUid, list);

      // Final stale-check before touching the DOM
      if (query !== _latestSearchQuery) return;

      _renderSearchResults(dropdown, list, stateByUid, currentUid);

    } catch (err) {
      console.error("[Vaani] search error:", err);
      if (query !== _latestSearchQuery) return;
      dropdown.innerHTML = '<div class="vc-search-empty">Search failed. Try again.</div>';
      dropdown.classList.add("vc-open");
    }
  }

  // ── Bind search input + dropdown ─────────────────────────────────────────
  function _bindUserSearch() {
    var searchWrap     = document.getElementById("vcSearchWrap");
    var searchInput    = document.getElementById("vcUserSearchInput");
    var searchDropdown = document.getElementById("vcSearchDropdown");
    if (!searchWrap || !searchInput || !searchDropdown) return;

    function closeDropdown() {
      searchDropdown.classList.remove("vc-open");
    }

    searchInput.addEventListener("input", function () {
      var query = (searchInput.value || "").trim().toLowerCase();

      clearTimeout(_searchDebounceTimer);

      if (!query) {
        _latestSearchQuery = "";
        searchDropdown.innerHTML = "";
        closeDropdown();
        return;
      }

      // Update the "current" query immediately so any in-flight fetch knows
      // it is now stale.
      _latestSearchQuery = query;

      _searchDebounceTimer = setTimeout(function () {
        _fetchUsersByPrefix(query, searchDropdown);
      }, 300);
    });

    searchDropdown.addEventListener("click", async function (event) {
      var btn = event.target.closest(".vc-search-item");
      if (!btn) return;

      closeDropdown();

      var currentUid = window._vaaniCurrentUser && window._vaaniCurrentUser.uid
        ? window._vaaniCurrentUser.uid
        : "";
      var targetUid = btn.getAttribute("data-uid") || "";
      if (!currentUid || !targetUid || currentUid === targetUid) return;

      var db = window.vaaniRouter && typeof window.vaaniRouter.getDb === "function"
        ? window.vaaniRouter.getDb()
        : null;
      if (!db) return;

      var currentState = btn.getAttribute("data-state") || "none";

      // ── Route click by current state ────────────────────────────────────
      if (currentState === "self" || currentState === "requested") {
        // Non-actionable states — do nothing
        return;
      }
      // AFTER — opens real chat
      if (currentState === "connected") {
         btn.disabled = true;
         _getOrCreateChat(targetUid)
            .then(function (chatId) {
               return _fetchOtherProfile(db, targetUid).then(function (profile) {
                  profile.uid = targetUid;
                  closeDropdown();
                  _openChatUI(chatId, profile);
               });
            })
            .catch(function (err) {
               console.error("[Vaani] Open chat error:", err);
               btn.disabled = false;
               if (typeof window.showToast === "function") {
                  window.showToast("Could not open chat. Try again.");
               }
            });
         return;
      }

      if (currentState === "incoming") {
        // "Accept" button — find and accept the incoming request
        var incomingReq = incomingRequests.find(function (r) {
          return r.fromUid === targetUid;
        });
        if (incomingReq) {
          btn.disabled = true;
          try {
            await _acceptConnectionRequest(db, incomingReq.id, currentUid, targetUid);
            _setSearchItemState(searchDropdown, targetUid, "connected");
          } catch (_) {
            btn.disabled = false;
          }
        }
        return;
      }

      // ── "none" state: send a new connection request ───────────────────
      var alreadyRequested = await _hasPendingConnectionRequest(db, currentUid, targetUid);
      if (alreadyRequested) {
        _setSearchItemState(searchDropdown, targetUid, "requested");
        if (typeof window.showToast === "function") window.showToast("Request already sent");
        return;
      }

      var alreadyConnected = await _isConnected(db, currentUid, targetUid);
      if (alreadyConnected) {
        _setSearchItemState(searchDropdown, targetUid, "connected");
        return;
      }

      await _sendConnectionRequest(db, currentUid, targetUid);
      _setSearchItemState(searchDropdown, targetUid, "requested");
      if (typeof window.showToast === "function") window.showToast("Connection request sent");
    });

    _outsideClickHandler = function (event) {
      if (!searchWrap.contains(event.target)) {
        closeDropdown();
      }
    };
    document.addEventListener("mousedown", _outsideClickHandler);
  }


// ── Fetch other user's profile (username, photoURL) ──────────────────────
async function _fetchOtherProfile(db, uid) {
  try {
    var doc = await db.collection("users").doc(uid).get();
    if (doc.exists) return doc.data() || {};
  } catch (err) {
    console.error("[Vaani] Failed to load user by uid from Firestore:", err);
  }
  return {};
}

async function _sendMessage() {
  var db = window.vaaniRouter && typeof window.vaaniRouter.getDb === "function"
    ? window.vaaniRouter.getDb()
    : null;
  var currentUser = window._vaaniCurrentUser || null;
  var selectedChatUser = _selectedChatUser || null;
  var inputEl = document.getElementById("messageInput") || document.getElementById("vcChatInput");

  if (!db || !currentUser || !currentUser.uid || !selectedChatUser || !selectedChatUser.uid || !inputEl) {
    console.error("[Vaani] Unable to send message: missing db/current user/selected user/input element.");
    return;
  }

  _setInputMessage(inputEl.value || "");
  var message = _inputMessage.trim();
  if (!message) {
    console.error("[Vaani] Empty message blocked.");
    return;
  }

  var sendBtn = document.getElementById("sendBtn") || document.getElementById("vcChatSend");
  if (sendBtn && sendBtn.disabled) return;

  var tempId = "local-" + Date.now() + "-" + Math.random().toString(36).slice(2);
  _optimisticMessages.push({
    _optimisticId: tempId,
    text: message,
    senderId: currentUser.uid,
    timestamp: new Date()
  });
  _renderMessages();

  try {
    inputEl.disabled = true;
    if (sendBtn) sendBtn.disabled = true;

    if (!_activeChatId) {
      _activeChatId = await _getOrCreateChat(selectedChatUser.uid);
    }

    await db
      .collection(MESSAGES_COLLECTION)
      .add({
        chatId: _activeChatId || null,
        text: message,
        senderId: currentUser.uid,
        receiverId: selectedChatUser.uid,
        participants: [currentUser.uid, selectedChatUser.uid],
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });

    if (_activeChatId) {
      await db.collection(CHATS_COLLECTION).doc(_activeChatId).update({
        lastMessage: message,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }

    _setInputMessage("");
    inputEl.value = _inputMessage;
  } catch (err) {
    _optimisticMessages = _optimisticMessages.filter(function (m) {
      return m._optimisticId !== tempId;
    });
    _renderMessages();
    console.error("[Vaani] Failed to send message:", err);
  } finally {
    inputEl.disabled = false;
    _setInputMessage(inputEl.value || "");
    if (sendBtn) sendBtn.disabled = !_inputMessage.trim();
    inputEl.focus();
  }
}

function _renderMessages() {
  var container = _messagesContainerRef;
  if (!container) return;

  var currentUid = window._vaaniCurrentUser && window._vaaniCurrentUser.uid
    ? String(window._vaaniCurrentUser.uid)
    : "";

  container.innerHTML = "";

  var safeMessages = (Array.isArray(_messages) ? _messages : []).concat(
    Array.isArray(_optimisticMessages) ? _optimisticMessages : []
  );
  if (safeMessages.length === 0) {
    var emptyState = document.createElement("div");
    emptyState.className = "vc-chat-empty";
    emptyState.textContent = "Start a conversation";
    container.appendChild(emptyState);
    _scrollMessagesToBottom();
    return;
  }

  safeMessages.forEach(function (msg) {
    var senderId = msg && msg.senderId != null ? String(msg.senderId) : "";
    var isOwn = senderId === currentUid;
    var row = document.createElement("div");
    row.className = isOwn
      ? "vc-msg-row vc-msg-own"
      : "vc-msg-row vc-msg-other";

    var bubble = document.createElement("div");
    bubble.className = "vc-msg-bubble";
    bubble.textContent = String(msg.text || "");

    row.appendChild(bubble);
    container.appendChild(row);
  });

  _scrollMessagesToBottom();
}

function _listenToMessages(currentUid, otherUid, chatId) {
  var db = window.vaaniRouter && typeof window.vaaniRouter.getDb === "function"
    ? window.vaaniRouter.getDb()
    : null;
  if (!db || !currentUid || !otherUid) {
    console.error("[Vaani] Cannot listen to messages: missing db/currentUid/otherUid.");
    _setMessages([]);
    _renderMessages();
    return;
  }

  var listenerUsers = [String(currentUid), String(otherUid)].sort();
  var listenerKey = chatId ? ("chat::" + String(chatId)) : listenerUsers.join("::");
  if (_activeMessageListenerKey === listenerKey && _unsubscribeMessages) return;

  _teardownMessageListener();
  _activeMessageListenerKey = listenerKey;

  var baseQuery = db.collection(MESSAGES_COLLECTION);
  if (chatId) {
    baseQuery = baseQuery.where("chatId", "==", chatId);
  } else {
    baseQuery = baseQuery.where("participants", "array-contains", currentUid);
  }

  _unsubscribeMessages = baseQuery.orderBy("timestamp", "asc").onSnapshot(
      function (snapshot) {
        if (_activeMessageListenerKey !== listenerKey) return;
        var messages = [];
        var messageSignatureParts = [];
        var seenIds = {};
        snapshot.forEach(function (doc) {
          if (seenIds[doc.id]) return;
          var data = doc.data() || {};
          if (!chatId) {
            var participants = Array.isArray(data.participants) ? data.participants : [];
            if (participants.indexOf(otherUid) === -1) return;
          }
          seenIds[doc.id] = true;
          messages.push(data);
          messageSignatureParts.push(doc.id);
          messageSignatureParts.push(String(data.text || ""));
          messageSignatureParts.push(String(data.senderId || ""));
          messageSignatureParts.push(String(
            data.timestamp && typeof data.timestamp.toMillis === "function"
              ? data.timestamp.toMillis()
              : ""
          ));
        });
        var nextSignature = messageSignatureParts.join("|");
        if (nextSignature === _activeMessagesSignature) return;
        _activeMessagesSignature = nextSignature;
        _optimisticMessages = [];
        _setMessages(messages);
        _renderMessages();
      },
      function (err) {
        console.error("[Vaani] messages listener error:", err);
      }
    );
}

// ── Get or create a chat document between current user and otherUid ───────
async function _getOrCreateChat(otherUid) {
  var db = window.vaaniRouter && typeof window.vaaniRouter.getDb === "function"
    ? window.vaaniRouter.getDb()
    : null;
  var currentUid = window._vaaniCurrentUser && window._vaaniCurrentUser.uid
    ? window._vaaniCurrentUser.uid
    : null;

  if (!db || !currentUid || !otherUid) {
    console.error("[Vaani] _getOrCreateChat: missing db/current user/other user.");
    return null;
  }

  // ── Step 1: query all chats the current user participates in ─────────
  var snapshot = await db
    .collection(CHATS_COLLECTION)
    .where("participants", "array-contains", currentUid)
    .get();

  // ── Step 2: find a chat that also contains the other user ────────────
  var existingId = null;
  snapshot.forEach(function (doc) {
    var data = doc.data() || {};
    var parts = data.participants || [];
    if (parts.indexOf(otherUid) !== -1) {
      existingId = doc.id;
    }
  });

  if (existingId) {
    console.log("[Vaani] Existing chat found:", existingId);
    return existingId;
  }

  // ── Step 3: create a new chat document ───────────────────────────────
  var newChatRef = await db.collection(CHATS_COLLECTION).add({
    participants: [currentUid, otherUid],
    createdAt:   firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt:   firebase.firestore.FieldValue.serverTimestamp(),
    lastMessage: ""
  });

  console.log("[Vaani] New chat created:", newChatRef.id);
  return newChatRef.id;
}

// ── Render a basic chat UI (messages come in Step 2) ─────────────────────
function _openChatUI(chatId, otherProfile) {
  console.log("Opening chat UI with chatId:", chatId);
  var chatScreen = document.getElementById("vcChatScreen");
  if (!chatScreen) {
    console.error("Chat screen not found");
    return;
  }

  _activeChatId  = chatId;
  otherProfile   = otherProfile || {};
  _setMessages([]);
  _setInputMessage("");
  _setSelectedChatUser(otherProfile);

  var username = otherProfile.username || "user";
  var photo    = otherProfile.photoURL || "";
  var initial  = (username.charAt(0) || "U").toUpperCase();

  // ── Avatar: image or initial ──────────────────────────────────────────
  var avatarHTML = photo
    ? '<img src="' + _esc(photo) + '" alt="' + _esc(username) + ' avatar">'
    : '<span class="vc-chat-initial">' + _esc(initial) + '</span>';

  // ── Send icon SVG (matches .vc-chat-send svg in CSS) ─────────────────
  var sendIconSVG =
    '<svg viewBox="0 0 24 24">' +
      '<line x1="22" y1="2" x2="11" y2="13"/>' +
      '<polygon points="22 2 15 22 11 13 2 9 22 2"/>' +
    '</svg>';

  // ── Back arrow SVG (matches .vc-back-btn svg in CSS) ─────────────────
  var backIconSVG =
    '<svg viewBox="0 0 24 24">' +
      '<polyline points="15 18 9 12 15 6"/>' +
    '</svg>';

  // ── Inject EXACT structure expected by chat-isolated.css ─────────────
  var messagesContainerMarkup = '<div class="vc-chat-messages" id="messagesContainer"></div>';
  var chatMarkup =
    '<div class="vc-chat-view">' +
      '<div class="vc-chat-header">' +
        '<button class="vc-back-btn" id="backBtn">' + backIconSVG + '</button>' +
        '<div class="vc-chat-avatar">' + avatarHTML + '</div>' +
        '<div class="vc-chat-hinfo">' +
          '<div class="vc-chat-hname">@' + _esc(username) + '</div>' +
          '<div class="vc-chat-hsub">Connected</div>' +
        '</div>' +
      '</div>' +
      messagesContainerMarkup +
      '<div class="vc-chat-input-bar">' +
        '<input' +
          ' id="messageInput"' +
          ' class="vc-chat-input"' +
          ' type="text"' +
          ' placeholder="Type a message..."' +
          ' autocomplete="off"' +
          ' spellcheck="false"' +
        '>' +
        '<button id="sendBtn" class="vc-chat-send" disabled aria-label="Send message">' +
          sendIconSVG +
        '</button>' +
      '</div>' +
    '</div>';
  chatScreen.innerHTML = chatMarkup;
  _messagesContainerRef = document.getElementById("messagesContainer");
  _renderMessages();
  _syncViewWithSelection();
  _scrollMessagesToBottom();

  // ── Wire up back button ───────────────────────────────────────────────
  document.getElementById("backBtn").onclick = () => {
    _setSelectedChatUser(null);
  };

  // ── Wire up input + send ──────────────────────────────────────────────
  var messageInput = document.getElementById("messageInput");
  var sendBtn      = document.getElementById("sendBtn");

  function _toggleSendState() {
    if (!messageInput || !sendBtn) return;
    _setInputMessage(messageInput.value || "");
    sendBtn.disabled = !_inputMessage.trim();
  }

  if (messageInput) {
    messageInput.value = _inputMessage;
    messageInput.addEventListener("input", _toggleSendState);
    messageInput.addEventListener("keydown", function (event) {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        _sendMessage();
      }
    });
    // Auto-focus so keyboard opens on mobile
    messageInput.focus();
  }

  if (sendBtn) {
    sendBtn.addEventListener("click", _sendMessage);
  }

  _toggleSendState();

  console.log("[Vaani] Chat UI opened — chatId:", chatId, "| with:", username);
}

   
  // ── Public API ────────────────────────────────────────────────────────────
  window.vaaniChat = {
    _currentView: "home",
    _chatList: [],
    open: function () {
      var root = _root();
      if (root && !root.children.length) {
        root.innerHTML =
          '<div class="vg-screen vg-loading-screen">' +
          '<div class="vg-spinner"></div>' +
          "<p>Loading…</p>" +
          "</div>";
      }

      if (window.vaaniRouter && typeof window.vaaniRouter.getAuth === "function") {
        var auth = window.vaaniRouter.getAuth();
        if (auth) {
          var user = auth.currentUser;
          if (user && window._vaaniCurrentUser) {
            window.vaaniRouter
              .getDb()
              .collection("users")
              .doc(user.uid)
              .get()
              .then(function (doc) {
                if (doc.exists && doc.data().username) {
                  _renderChat(user, doc.data());
                } else {
                  _renderProfile(user);
                }
              })
              .catch(function () {
                _renderProfile(user);
              });
          }
        }
      }
    },

    close: function () {
      _stopListening();
      _clearSearchState();
      _removeMenu();
    },

    _renderLogin:  _renderLogin,
    _renderProfile: _renderProfile,
    _renderChat:   _renderChat,
    _createChatListListener: _createChatListListener,

    loadUsers: function () {
      this.open();
    }
  };

  console.log("[Vaani] chat.js v4.1 loaded ✓");
})();
