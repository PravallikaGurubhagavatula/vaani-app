const translationCache = new Map();
const inProgressMessageIds = new Set();
const inFlightControllers = new Map();
const debounceHandles = new Map();

function clearCache() {
  translationCache.clear();
  inProgressMessageIds.clear();
  inFlightControllers.forEach(function (controller) {
    if (controller && typeof controller.abort === "function") controller.abort();
  });
  inFlightControllers.clear();
  debounceHandles.forEach(function (handle) {
    if (handle && typeof cancelAnimationFrame === "function") cancelAnimationFrame(handle.rafId);
  });
  debounceHandles.clear();
}

function _unicodeRangeDetectedLanguage(text) {
  var input = String(text || "");
  if (!input.trim()) return "English";
  var tests = [
    { name: "Hindi", regex: /[\u0900-\u097F]/ },
    { name: "Bengali", regex: /[\u0980-\u09FF]/ },
    { name: "Punjabi", regex: /[\u0A00-\u0A7F]/ },
    { name: "Gujarati", regex: /[\u0A80-\u0AFF]/ },
    { name: "Odia", regex: /[\u0B00-\u0B7F]/ },
    { name: "Tamil", regex: /[\u0B80-\u0BFF]/ },
    { name: "Telugu", regex: /[\u0C00-\u0C7F]/ },
    { name: "Kannada", regex: /[\u0C80-\u0CFF]/ },
    { name: "Malayalam", regex: /[\u0D00-\u0D7F]/ },
    { name: "Urdu", regex: /[\u0600-\u06FF]/ }
  ];
  for (var i = 0; i < tests.length; i += 1) {
    if (tests[i].regex.test(input)) return tests[i].name;
  }
  return "English";
}

async function _translateText(text, fromLang, toLang, signal) {
  var input = String(text || "");
  if (!input.trim()) return "";
  if (typeof window.finalTranslate === "function") {
    return String(await window.finalTranslate(input, fromLang, toLang, { signal }) || "").trim();
  }
  if (typeof window.translateText === "function") {
    return String(await window.translateText(input, fromLang, toLang, { signal }) || "").trim();
  }
  return input;
}

async function _transliterateText(text, signal) {
  var input = String(text || "");
  if (!input.trim()) return "";
  if (/^[\u0000-\u007F\s]+$/.test(input)) return input;
  if (typeof window.transliterateToLatin === "function") {
    return String(await window.transliterateToLatin(input, { signal }) || "").trim();
  }
  return input;
}

function _debounceByRaf(messageId, waitMs) {
  return new Promise(function (resolve) {
    var prior = debounceHandles.get(messageId);
    if (prior && prior.rafId) cancelAnimationFrame(prior.rafId);
    var started = performance.now();
    function tick(now) {
      if ((now - started) >= waitMs) {
        debounceHandles.delete(messageId);
        resolve();
        return;
      }
      var rafId = requestAnimationFrame(tick);
      debounceHandles.set(messageId, { rafId: rafId });
    }
    var rafId = requestAnimationFrame(tick);
    debounceHandles.set(messageId, { rafId: rafId });
  });
}

async function processMessage(message, config, options) {
  var messageId = message && message.id ? String(message.id) : "";
  var text = message && message.text != null ? String(message.text) : "";
  var settings = config || {};
  var opts = options || {};
  if (!messageId || !text.trim()) return null;

  if (translationCache.has(messageId)) return translationCache.get(messageId);

  var translateEnabled = settings.translateEnabled === true;
  var transliterateEnabled = settings.transliterateEnabled === true;
  if (!translateEnabled && !transliterateEnabled) return null;

  if (inProgressMessageIds.has(messageId)) return null;
  inProgressMessageIds.add(messageId);

  try {
    await _debounceByRaf(messageId, typeof opts.debounceMs === "number" ? opts.debounceMs : 300);
    if ((settings.translateEnabled !== true) && (settings.transliterateEnabled !== true)) {
      return null;
    }

    var controller = new AbortController();
    inFlightControllers.set(messageId, controller);
    if (settings.panelOpen === false && settings.featureEnabled === false) {
      controller.abort();
      return null;
    }

    var detectedLang = _unicodeRangeDetectedLanguage(text);
    var translated = "";
    var transliterated = "";
    var targetLanguage = String(settings.targetLanguage || "English");

    if (translateEnabled) {
      translated = await _translateText(text, detectedLang, targetLanguage, controller.signal);
    }
    if (transliterateEnabled) {
      var translitSource = translateEnabled ? translated : text;
      transliterated = await _transliterateText(translitSource, controller.signal);
    }

    var result = {
      translated: translated || "",
      transliterated: transliterated || "",
      detectedLang: detectedLang
    };
    translationCache.set(messageId, result);
    return result;
  } catch (err) {
    if (!(err && err.name === "AbortError")) console.warn("[Vaani] translation processing failed:", err);
    return null;
  } finally {
    inProgressMessageIds.delete(messageId);
    inFlightControllers.delete(messageId);
  }
}

function cancelMessageProcessing(messageId) {
  var key = String(messageId || "");
  if (!key) return;
  var controller = inFlightControllers.get(key);
  if (controller && typeof controller.abort === "function") controller.abort();
  inFlightControllers.delete(key);
  inProgressMessageIds.delete(key);
}

export { processMessage, translationCache, clearCache, cancelMessageProcessing };
