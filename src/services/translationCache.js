const cache = new Map();

function key(messageId, targetLang, mode) {
  return `${String(messageId || "")}::${String(targetLang || "")}::${String(mode || "translate")}`;
}

export function getCached(messageId, targetLang, mode) {
  return cache.get(key(messageId, targetLang, mode)) ?? null;
}

export function setCached(messageId, targetLang, mode, result) {
  cache.set(key(messageId, targetLang, mode), result);
}

export function clearCached() {
  cache.clear();
}

export function getCacheKeys() {
  return Array.from(cache.keys());
}

export default cache;
