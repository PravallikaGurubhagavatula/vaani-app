/* ================================================================
   Vaani — chat.js  v4.0
   Minimal chat shell with profile sidebar + auth/profile gating.
   ================================================================ */

(function () {
  "use strict";

  var CHAT_ROOT_ID = "vaaniChat";
  var _unsubscribeDB = null;
  var _searchDebounceTimer = null;
  var _searchRequestSeq = 0;
  var _outsideClickHandler = null;
  var _unsubscribeIncomingRequests = null;
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
      '<div class="vc-empty-area" id="vcEmptyArea" aria-hidden="true"></div>' +
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
    _fetchIncomingRequests(user.uid);
  }

  function _stopListening() {
    if (_unsubscribeDB) {
      _unsubscribeDB();
      _unsubscribeDB = null;
    }
    if (_unsubscribeIncomingRequests) {
      _unsubscribeIncomingRequests();
      _unsubscribeIncomingRequests = null;
    }
  }

  function _clearSearchState() {
    if (_searchDebounceTimer) {
      clearTimeout(_searchDebounceTimer);
      _searchDebounceTimer = null;
    }
    _searchRequestSeq += 1;
    if (_outsideClickHandler) {
      document.removeEventListener("mousedown", _outsideClickHandler);
      _outsideClickHandler = null;
    }
  }

  function _isSearchItemDisabled(state, isSelf) {
    if (isSelf) return true;
    return state === "connected" || state === "requested";
  }

  function _renderSearchResults(dropdown, list, stateByUid, currentUid) {
    if (!dropdown) return;


    if (!list || list.length === 0) {
      dropdown.innerHTML = '<div class="vc-search-empty">No users found</div>';
      dropdown.classList.add("vc-open");
      return;
    }

    dropdown.innerHTML = "";

    var visibleCount = 0;
    list.forEach(function (data) {
      var uid = data && data.uid ? data.uid : "";
      if (!uid || (currentUid && uid === currentUid)) return;

      var username = (data && data.username) || "";
      if (!username) return;
      var name = (data && data.name) || username;
      var photo = (data && data.photoURL) || "";
      var initial = (username.charAt(0) || "U").toUpperCase();
      var state = stateByUid && uid ? stateByUid[uid] || "none" : "none";
      var isSelf = false;
      var label = "Connect";
      if (state === "requested") label = "Requested";
      if (state === "connected") label = "Connected";
      var disabled = _isSearchItemDisabled(state, isSelf);

      var itemEl = document.createElement("button");
      itemEl.className = "vc-search-item";
      itemEl.type = "button";
      itemEl.setAttribute("data-uid", uid);
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
        '<span class="vc-search-name">' + _esc(name) + "</span>" +
        "</span>" +
        '<span class="vc-search-action" data-uid="' + _esc(uid) + '" data-state="' + _esc(state) + '">' + _esc(label) + "</span>";

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
    var itemEl = dropdown.querySelector('.vc-search-item[data-uid="' + uid + '"]');
    var actionEl = dropdown.querySelector('.vc-search-action[data-uid="' + uid + '"]');
    if (!actionEl || !itemEl) return;
    var label = "Connect";
    if (state === "requested") label = "Requested";
    if (state === "connected") label = "Connected";
    if (state === "incoming") label = "Respond";
    actionEl.textContent = label;
    actionEl.setAttribute("data-state", state || "none");
    itemEl.setAttribute("data-state", state || "none");
    var isSelf = window._vaaniCurrentUser && window._vaaniCurrentUser.uid
      ? window._vaaniCurrentUser.uid === uid
      : false;
    itemEl.disabled = _isSearchItemDisabled(state, isSelf);
  }

  async function _isConnected(db, currentUid, targetUid) {
    var snap = await db
      .collection(CONNECTIONS_COLLECTION)
      .where("users", "array-contains", currentUid)
      .limit(50)
      .get();

    var found = false;
    snap.forEach(function (doc) {
      var data = doc.data() || {};
      var users = data.users || [];
      if (users.indexOf(targetUid) !== -1) found = true;
    });
    return found;
  }

  async function _getRequestState(db, currentUid, targetUid) {
    if (await _isConnected(db, currentUid, targetUid)) return "connected";

    var outgoing = await db
      .collection(REQUESTS_COLLECTION)
      .where("fromUid", "==", currentUid)
      .where("toUid", "==", targetUid)
      .where("status", "==", "pending")
      .limit(1)
      .get();
    if (!outgoing.empty) return "requested";

    var incoming = await db
      .collection(REQUESTS_COLLECTION)
      .where("fromUid", "==", targetUid)
      .where("toUid", "==", currentUid)
      .where("status", "==", "pending")
      .limit(1)
      .get();
    if (!incoming.empty) return "incoming";

    return "none";
  }

  async function _buildSearchItemStates(db, currentUid, users) {
    var stateByUid = {};
    if (!db || !currentUid || !users || !users.length) return stateByUid;

    var targetUids = users
      .map(function (item) {
        return item.uid || "";
      })
      .filter(Boolean);
    if (!targetUids.length) return stateByUid;

    targetUids.forEach(function (uid) {
      stateByUid[uid] = "none";
    });

    var connectionsSnap = await db
      .collection(CONNECTIONS_COLLECTION)
      .where("users", "array-contains", currentUid)
      .limit(200)
      .get();

    var connectedSet = new Set();
    connectionsSnap.forEach(function (doc) {
      var data = doc.data() || {};
      var usersInConnection = data.users || [];
      usersInConnection.forEach(function (uid) {
        if (uid && uid !== currentUid) connectedSet.add(uid);
      });
    });

    var outgoingSnap = await db
      .collection(REQUESTS_COLLECTION)
      .where("fromUid", "==", currentUid)
      .where("status", "==", "pending")
      .limit(200)
      .get();

    var requestedSet = new Set();
    outgoingSnap.forEach(function (doc) {
      var data = doc.data() || {};
      if (data.toUid) requestedSet.add(data.toUid);
    });

    targetUids.forEach(function (uid) {
      if (connectedSet.has(uid)) {
        stateByUid[uid] = "connected";
        return;
      }
      if (requestedSet.has(uid)) {
        stateByUid[uid] = "requested";
      }
    });

    return stateByUid;
  }

  async function _sendConnectionRequest(db, fromUid, toUid) {
    await db.collection(REQUESTS_COLLECTION).add({
      fromUid: fromUid,
      toUid: toUid,
      status: "pending",
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }

  async function _hasPendingConnectionRequest(db, fromUid, toUid) {
    var existing = await db
      .collection(REQUESTS_COLLECTION)
      .where("fromUid", "==", fromUid)
      .where("toUid", "==", toUid)
      .where("status", "==", "pending")
      .limit(1)
      .get();
    return !existing.empty;
  }

  async function _createConnection(db, uidA, uidB) {
    var alreadyConnected = await _isConnected(db, uidA, uidB);
    if (alreadyConnected) return;
    await db.collection(CONNECTIONS_COLLECTION).add({
      users: [uidA, uidB],
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }

  async function _acceptConnectionRequest(db, requestId, currentUid, fromUid) {
    if (!db || !requestId || !currentUid || !fromUid) return;

    await _createConnection(db, currentUid, fromUid);

    await db.collection(REQUESTS_COLLECTION).doc(requestId).update({
      status: "accepted"
    });

    incomingRequests = incomingRequests.filter(function (request) {
      return request.id !== requestId;
    });
    _renderIncomingRequests(incomingRequests);

    if (typeof window.showToast === "function") {
      window.showToast("Connection accepted");
    }
  }

  async function _rejectConnectionRequest(db, requestId) {
    if (!db || !requestId) return;

    await db.collection(REQUESTS_COLLECTION).doc(requestId).update({
      status: "rejected"
    });

    incomingRequests = incomingRequests.filter(function (request) {
      return request.id !== requestId;
    });
    _renderIncomingRequests(incomingRequests);

    if (typeof window.showToast === "function") {
      window.showToast("Request rejected");
    }
  }

  function _renderIncomingRequests(requests) {
    var listEl = document.getElementById("vcRequestsList");
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
        '<div class="vc-request-copy">' + _esc(request.fromName || "") + "</div>" +
        '<div class="vc-request-actions">' +
        '<button type="button" class="vc-mini-btn vc-accept-btn" data-request-id="' + _esc(request.id) + '" data-from-uid="' + _esc(request.fromUid) + '" data-to-uid="' + _esc(request.toUid) + '">Accept</button>' +
        '<button type="button" class="vc-mini-btn vc-reject-btn" data-request-id="' + _esc(request.id) + '">Reject</button>' +
        "</div>" +
        "</div>"
      );
    }).join("");
  }

  async function _fetchIncomingRequests(currentUid) {
    var db = window.vaaniRouter && typeof window.vaaniRouter.getDb === "function"
      ? window.vaaniRouter.getDb()
      : null;
    if (!db || !currentUid) return;

    try {
      var snapshot = await db
      .collection(REQUESTS_COLLECTION)
      .where("toUid", "==", currentUid)
      .where("status", "==", "pending")
      .orderBy("createdAt", "desc")
      .get();

      var pending = [];
      for (var i = 0; i < snapshot.docs.length; i += 1) {
        var doc = snapshot.docs[i];
        var data = doc.data() || {};
        var fromProfile = await db.collection("users").doc(data.fromUid).get();
        var fromData = fromProfile.exists ? fromProfile.data() : {};
        pending.push({
          id: doc.id,
          fromUid: data.fromUid || "",
          toUid: data.toUid || "",
          fromUsername: fromData.username || "user",
          fromName: fromData.name || ""
        });
      }

      incomingRequests = pending;
      _renderIncomingRequests(incomingRequests);
    } catch (_) {
      incomingRequests = [];
      _renderIncomingRequests(incomingRequests);
    }
  }

  function _bindIncomingRequestActions() {
    var listEl = document.getElementById("vcRequestsList");
    var toggleBtn = document.getElementById("vcRequestsToggle");
    var panel = document.getElementById("vcRequestsPanel");
    if (!listEl || !toggleBtn || !panel) return;

    toggleBtn.addEventListener("click", function () {
      panel.classList.toggle("vc-open");
    });

    listEl.addEventListener("click", async function (event) {
      var acceptBtn = event.target.closest(".vc-accept-btn");
      var rejectBtn = event.target.closest(".vc-reject-btn");
      if (!acceptBtn && !rejectBtn) return;

      var actionBtn = acceptBtn || rejectBtn;
      var requestId = actionBtn.getAttribute("data-request-id") || "";
      var fromUid = actionBtn.getAttribute("data-from-uid") || "";
      var currentUid = window._vaaniCurrentUser && window._vaaniCurrentUser.uid
        ? window._vaaniCurrentUser.uid
        : "";

      var db = window.vaaniRouter && typeof window.vaaniRouter.getDb === "function"
        ? window.vaaniRouter.getDb()
        : null;
      if (!db || !requestId) return;
      if (acceptBtn && (!fromUid || !currentUid)) return;

      actionBtn.disabled = true;
      try {
        if (acceptBtn) {
          await _acceptConnectionRequest(db, requestId, currentUid, fromUid);
        } else {
          await _rejectConnectionRequest(db, requestId);
        }
      } catch (_) {
        actionBtn.disabled = false;
      }
    });
  }

  async function _fetchUsersByPrefix(value, requestId, dropdown) {
    var db = window.vaaniRouter && typeof window.vaaniRouter.getDb === "function"
      ? window.vaaniRouter.getDb()
      : null;

    if (!db || !dropdown) return;

    try {
      var normalizedQuery = (value || "").trim().toLowerCase();

      var snapshot = await db
        .collection("users")
        .orderBy("username")
        .startAt(normalizedQuery)
        .endAt(normalizedQuery + "\uf8ff")
        .limit(10)
        .get();

      if (requestId !== _searchRequestSeq) return;

      var currentUid = window._vaaniCurrentUser && window._vaaniCurrentUser.uid
        ? window._vaaniCurrentUser.uid
        : "";
      var list = [];
      snapshot.forEach(function (doc) {
        var data = doc.data();
        if (!data) return;

        var uid = doc.id;
        if (!uid || uid === currentUid) return;
        if (!data.username) return;

        list.push({
          uid: uid,
          username: data.username,
          name: data.name,
          photoURL: data.photoURL || ""
        });
      });

      console.log("Search results:", list);

      var stateByUid = await _buildSearchItemStates(db, currentUid, list);
      _renderSearchResults(dropdown, list, stateByUid, currentUid);
    } catch (_) {
      if (requestId !== _searchRequestSeq) return;
      dropdown.innerHTML = '<div class="vc-search-empty">No users found</div>';
      dropdown.classList.add("vc-open");
    }
  }

  function _bindUserSearch() {
    var searchWrap = document.getElementById("vcSearchWrap");
    var searchInput = document.getElementById("vcUserSearchInput");
    var searchDropdown = document.getElementById("vcSearchDropdown");

    if (!searchWrap || !searchInput || !searchDropdown) return;

    function closeDropdown() {
      searchDropdown.classList.remove("vc-open");
    }

    function handleInput() {
      var query = (searchInput.value || "").trim().toLowerCase();

      if (_searchDebounceTimer) {
        clearTimeout(_searchDebounceTimer);
      }

      if (!query) {
        _searchRequestSeq += 1;
        searchDropdown.innerHTML = "";
        closeDropdown();
        return;
      }

      _searchDebounceTimer = setTimeout(function () {
        _searchRequestSeq += 1;
        var requestId = _searchRequestSeq;
        _fetchUsersByPrefix(query, requestId, searchDropdown);
      }, 300);
    }

    searchInput.addEventListener("input", handleInput);

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
      if (currentState === "connected" || currentState === "requested") return;

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

  window.vaaniChat = {
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

    _renderLogin: _renderLogin,
    _renderProfile: _renderProfile,
    _renderChat: _renderChat,

    loadUsers: function () {
      this.open();
    }
  };

  console.log("[Vaani] chat.js v4.0 loaded ✓");
})();
