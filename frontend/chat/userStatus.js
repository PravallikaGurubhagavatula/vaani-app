const USERS_COLLECTION = "users";
const CHAT_TYPING_COLLECTION = "typing";
const TYPING_STALE_MS = 6000;

function _dispatchSocketEvent(name, detail) {
  try {
    document.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
  } catch (_) {}
}

export function formatLastSeenLabel(rawTimestamp) {
  if (!rawTimestamp) return "";
  try {
    const d = typeof rawTimestamp.toDate === "function" ? rawTimestamp.toDate() : new Date(rawTimestamp);
    if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "";
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch (_) {
    return "";
  }
}

export function bindPresence(db, uid) {
  if (!db || !uid || !firebase || !firebase.firestore || !firebase.firestore.FieldValue) {
    return function noop() {};
  }

  const userRef = db.collection(USERS_COLLECTION).doc(String(uid));
  let isBound = true;
  let currentOnline = null;
  let inactivityTimer = null;

  async function setPresence(nextOnline) {
    const online = !!nextOnline;
    if (!isBound || currentOnline === online) return;
    currentOnline = online;

    const payload = {
      status: {
        isOnline: online,
      }
    };
    if (!online) {
      payload.status.lastSeen = firebase.firestore.FieldValue.serverTimestamp();
      _dispatchSocketEvent("last_seen_update", { userId: String(uid) });
      _dispatchSocketEvent("user_offline", { userId: String(uid) });
    } else {
      _dispatchSocketEvent("user_online", { userId: String(uid) });
    }

    try {
      await userRef.set(payload, { merge: true });
    } catch (_) {
      currentOnline = null;
    }
  }

  function scheduleInactivity() {
    if (inactivityTimer) clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(function () {
      setPresence(false);
    }, 5 * 60 * 1000);
  }

  const onActivity = function () {
    setPresence(true);
    scheduleInactivity();
  };

  setPresence(true);
  scheduleInactivity();

  ["mousemove", "keydown", "touchstart", "scroll", "click"].forEach(function (eventName) {
    window.addEventListener(eventName, onActivity, { passive: true });
  });

  const onVisibilityChange = function () {
    if (document.visibilityState === "hidden") {
      setPresence(false);
      return;
    }
    onActivity();
  };

  const onBeforeUnload = function () { setPresence(false); };

  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("beforeunload", onBeforeUnload);

  return function unbindPresence() {
    isBound = false;
    if (inactivityTimer) clearTimeout(inactivityTimer);
    ["mousemove", "keydown", "touchstart", "scroll", "click"].forEach(function (eventName) {
      window.removeEventListener(eventName, onActivity);
    });
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("beforeunload", onBeforeUnload);
    setPresence(false);
  };
}

export function subscribeUserPresence(db, userId, onChange) {
  if (!db || !userId || typeof onChange !== "function") return function noop() {};
  return db.collection(USERS_COLLECTION).doc(String(userId)).onSnapshot(function (doc) {
    const data = doc && doc.exists ? (doc.data() || {}) : {};
    const status = data.status || {};
    onChange({
      showStatus: status.showStatus !== false,
      isOnline: !!status.isOnline,
      lastSeen: status.lastSeen || null,
    });
  });
}

export function emitTyping(db, payload) {
  if (!db || !payload || !payload.chatId || !payload.fromUserId || !payload.toUserId) return Promise.resolve();
  if (!firebase || !firebase.firestore || !firebase.firestore.FieldValue) return Promise.resolve();
  _dispatchSocketEvent("typing", {
    fromUserId: String(payload.fromUserId),
    toUserId: String(payload.toUserId)
  });
  return db.collection("chats").doc(String(payload.chatId))
    .collection(CHAT_TYPING_COLLECTION)
    .doc(String(payload.fromUserId))
    .set({
      fromUserId: String(payload.fromUserId),
      toUserId: String(payload.toUserId),
      isTyping: !!payload.isTyping,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
}

export function clearTyping(db, chatId, fromUserId) {
  if (!db || !chatId || !fromUserId) return Promise.resolve();
  return db.collection("chats").doc(String(chatId))
    .collection(CHAT_TYPING_COLLECTION)
    .doc(String(fromUserId))
    .delete()
    .catch(function () { return null; });
}

export function subscribeTyping(db, chatId, receiverUserId, onChange) {
  if (!db || !chatId || !receiverUserId || typeof onChange !== "function") return function noop() {};
  return db.collection("chats").doc(String(chatId)).collection(CHAT_TYPING_COLLECTION)
    .onSnapshot(function (snap) {
      const now = Date.now();
      let activeFromUserId = "";
      snap.forEach(function (doc) {
        const data = doc.data() || {};
        const isForReceiver = String(data.toUserId || "") === String(receiverUserId);
        const ts = data.updatedAt && typeof data.updatedAt.toMillis === "function" ? data.updatedAt.toMillis() : 0;
        const fresh = ts > 0 && (now - ts) <= TYPING_STALE_MS;
        if (isForReceiver && data.isTyping && fresh && !activeFromUserId) {
          activeFromUserId = String(data.fromUserId || doc.id || "");
        }
      });
      onChange(activeFromUserId);
    });
}
