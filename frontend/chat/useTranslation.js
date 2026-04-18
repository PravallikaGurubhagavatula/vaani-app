import { translateMessage, transliterateMessage, detectLanguage } from "../translationService.js";
import cacheStore, { getCached, setCached, clearCached, getCacheKeys } from "../translationCache.js";

const inProgressKeys = new Set();
const inFlightControllers = new Map();
const debounceHandles = new Map();

function clearCache() {
  clearCached();
  inProgressKeys.clear();
  inFlightControllers.forEach(function (controller) {
    if (controller && typeof controller.abort === "function") controller.abort();
  });
  inFlightControllers.clear();
  debounceHandles.forEach(function (handle) {
    if (handle && typeof cancelAnimationFrame === "function") cancelAnimationFrame(handle.rafId);
  });
  debounceHandles.clear();
}

function _debounceByRaf(key, waitMs) {
  return new Promise(function (resolve) {
    var prior = debounceHandles.get(key);
    if (prior && prior.rafId) cancelAnimationFrame(prior.rafId);
    var started = performance.now();
    function tick(now) {
      if ((now - started) >= waitMs) {
        debounceHandles.delete(key);
        resolve();
        return;
      }
      var rafId = requestAnimationFrame(tick);
      debounceHandles.set(key, { rafId: rafId });
    }
    var rafId = requestAnimationFrame(tick);
    debounceHandles.set(key, { rafId: rafId });
  });
}

async function processMessage(message, config, options) {
  var messageId = message && message.id ? String(message.id) : "";
  var text = message && message.text != null ? String(message.text) : "";
  var settings = config || {};
  var opts = options || {};
  var mode = String(opts.mode || "translate");
  var targetLanguage = String(settings.targetLanguage || "English");
  var cacheKey = messageId + "::" + targetLanguage + "::" + mode;

  if (!messageId || !text.trim()) return null;

  var translateEnabled = settings.translateEnabled === true;
  var transliterateEnabled = settings.transliterateEnabled === true;
  if (mode === "translate" && !translateEnabled && !opts.force) return null;
  if (mode === "transliterate" && !transliterateEnabled && !opts.force) return null;

  var cached = getCached(messageId, targetLanguage, mode);
  if (cached) {
    return {
      translated: cached.translated || (mode === "translate" ? cached.result : ""),
      transliterated: cached.transliterated || (mode === "transliterate" ? cached.result : ""),
      detectedLang: cached.detectedLang || "",
      confidence: Number(cached.confidence || 0),
      unavailable: false,
      fromCache: true
    };
  }

  if (inProgressKeys.has(cacheKey)) return null;
  inProgressKeys.add(cacheKey);

  try {
    await _debounceByRaf(cacheKey, typeof opts.debounceMs === "number" ? opts.debounceMs : 220);

    var detectedLang = await detectLanguage(text);
    var result = mode === "translate"
      ? await translateMessage(text, targetLanguage, { messageId: messageId, contextMessages: opts.contextMessages || [] })
      : await transliterateMessage(text, targetLanguage, { messageId: messageId, contextMessages: opts.contextMessages || [] });

    if (!result) {
      return { translated: text, transliterated: "", detectedLang: detectedLang, confidence: 0, unavailable: false };
    }

    const payload = {
      result: mode === "translate" ? (result.translated || text) : (result.transliterated || ""),
      translated: result.translated || text,
      transliterated: result.transliterated || "",
      detectedLang: result.sourceLanguage || detectedLang,
      confidence: Number(result.confidence || 0),
      mode: mode
    };

    setCached(messageId, targetLanguage, mode, payload);

    return {
      translated: result.translated || text,
      transliterated: result.transliterated || "",
      detectedLang: result.sourceLanguage || detectedLang,
      confidence: Number(result.confidence || 0),
      unavailable: false
    };
  } catch (err) {
    return { translated: text, transliterated: "", detectedLang: "auto", confidence: 0, unavailable: false };
  } finally {
    inProgressKeys.delete(cacheKey);
    inFlightControllers.delete(cacheKey);
  }
}

function cancelMessageProcessing(messageKey) {
  var key = String(messageKey || "");
  if (!key) return;
  var controller = inFlightControllers.get(key);
  if (controller && typeof controller.abort === "function") controller.abort();
  inFlightControllers.delete(key);
  inProgressKeys.delete(key);
}

const translationCache = {
  get: function (compositeKey) {
    var parts = String(compositeKey || "").split("::");
    if (parts.length < 3) return null;
    return getCached(parts[0], parts[1], parts[2]);
  },
  keys: function () {
    return getCacheKeys();
  }
};

export { processMessage, translationCache, clearCache, cancelMessageProcessing, getCached, setCached };
export default cacheStore;
