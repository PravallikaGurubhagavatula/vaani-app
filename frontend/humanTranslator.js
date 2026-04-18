/* ================================================================
   Vaani — humanTranslator.js  v2.0
   Human-Like Translation via Backend Proxy

   ARCHITECTURE:
   ─────────────────────────────────────────────────────────────────
   Browser → Vaani Backend (/claude-translate) → Anthropic Claude
                          ↘ Fallback: machine translation

   The Claude API is called server-side to avoid CORS errors.
   No API key needed in the browser.
================================================================ */

(function () {

  var _TIMEOUT = 30000;

  // ── Backend URL (same as existing API_URL) ────────────────────
  function _getApiBase() {
    return window.API_URL || "https://vaani-app-ui0z.onrender.com";
  }

  // ── Language name map (for prompts & logging) ─────────────────
  var _LANG_NAMES = {
    te:"Telugu", hi:"Hindi", ta:"Tamil", kn:"Kannada", ml:"Malayalam",
    bn:"Bengali", mr:"Marathi", gu:"Gujarati", pa:"Punjabi", ur:"Urdu",
    or:"Odia", as:"Assamese", sa:"Sanskrit", ne:"Nepali", sd:"Sindhi",
    mai:"Maithili", bho:"Bhojpuri", kok:"Konkani", ks:"Kashmiri",
    doi:"Dogri", brx:"Bodo", sat:"Santali", mwr:"Marwari", tcy:"Tulu",
    lus:"Mizo", awa:"Awadhi", mag:"Magahi", hne:"Chhattisgarhi",
    bgc:"Haryanvi", raj:"Rajasthani", kha:"Khasi", lep:"Lepcha",
    mni:"Meitei", en:"English",
  };

  function _langName(code) {
    return _LANG_NAMES[code] || code;
  }

  // ══════════════════════════════════════════════════════════════
  // LAYER 1 — INPUT NORMALIZATION (unchanged from v1.0)
  // ══════════════════════════════════════════════════════════════

  var _TE_ASR_CORRECTIONS = {
    "em jarigindi": "emi jarigindi",
    "em chesaru":   "emi chesaru",
    "em chestav":   "emi chestunnav",
    "em antunnav":  "emi antunnav",
    "em ayindi":    "emi ayindi",
    "ela un":       "ela unnav",
  };
  var _HI_ASR_CORRECTIONS = {
    "kya kar rhe":  "kya kar rahe ho",
    "kahan h":      "kahan ho",
    "kaise h":      "kaise ho",
  };
  var _TA_ASR_CORRECTIONS = {
    "enna panre":   "enna panreey",
    "epdi iruke":   "epdi irukeenga",
  };
  var _CORRECTIONS_BY_LANG = {
    te: _TE_ASR_CORRECTIONS,
    hi: _HI_ASR_CORRECTIONS,
    ta: _TA_ASR_CORRECTIONS,
  };

  function normalizeInput(text, fromLang) {
    if (!text) return text;
    var normalized = text.trim().toLowerCase();
    var corrections = _CORRECTIONS_BY_LANG[fromLang] || {};
    var keys = Object.keys(corrections).sort(function(a, b) { return b.length - a.length; });
    for (var i = 0; i < keys.length; i++) {
      if (normalized.indexOf(keys[i]) === 0) {
        var tail = text.trim().slice(keys[i].length);
        normalized = corrections[keys[i]] + tail;
        break;
      }
    }
    if (fromLang === "te") {
      normalized = normalized
        .replace(/^em\s+/, "emi ")
        .replace(/\bela un\b/, "ela unnav");
    }
    var wasCapitalized = text.trim().charAt(0) !== text.trim().charAt(0).toLowerCase();
    if (wasCapitalized && normalized.length > 0) {
      normalized = normalized.charAt(0).toUpperCase() + normalized.slice(1);
    }
    if (normalized !== text.trim()) {
      console.log("[HumanTranslator] ASR correction:", text.trim(), "→", normalized);
    }
    return normalized;
  }

  // ══════════════════════════════════════════════════════════════
  // QUALITY GUARD (unchanged from v1.0)
  // ══════════════════════════════════════════════════════════════

  function _isBadMachineTranslation(original, machineResult) {
    if (!machineResult) return true;
    var orig  = original.trim().toLowerCase();
    var trans = machineResult.trim().toLowerCase();
    if (trans === orig) return true;
    var origWords  = orig.split(/\s+/).length;
    var transWords = trans.split(/\s+/).length;
    if (origWords >= 2 && transWords === 1) return true;
    if (origWords >= 3 && transWords < Math.ceil(origWords * 0.4)) return true;
    if (/^[A-Z]\s/.test(machineResult.trim())) return true;
    return false;
  }

  // ══════════════════════════════════════════════════════════════
  // LAYER 2 — CALL BACKEND CLAUDE PROXY
  // No direct Anthropic API call — goes through your backend.
  // This completely eliminates the CORS error.
  // ══════════════════════════════════════════════════════════════

  async function _callBackendClaudeProxy(text, fromLang, toLang, machineTranslation) {
    var apiBase = _getApiBase();
    var controller = new AbortController();
    var timeoutId = setTimeout(function() { controller.abort(); }, _TIMEOUT);

    try {
      var response = await fetch(apiBase + "/claude-translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          text:                text,
          from_lang:           fromLang,
          to_lang:             toLang,
          machine_translation: machineTranslation || ""
        })
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        var errorData = await response.json().catch(function() { return {}; });
        console.warn("[HumanTranslator] Backend proxy error:", response.status, errorData);
        // Return machine translation fallback from error response if available
        return errorData.translated || null;
      }

      var data = await response.json();
      var result = (data.translated || "").trim();

      if (!result) {
        console.warn("[HumanTranslator] Backend proxy returned empty result");
        return null;
      }

      console.log("[HumanTranslator] Backend proxy (" + (data.engine || "claude") + "):",
        '"' + text.slice(0, 40) + '"', "→", '"' + result.slice(0, 40) + '"');
      return result;

    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === "AbortError") {
        console.warn("[HumanTranslator] Backend proxy timed out after", _TIMEOUT + "ms");
      } else {
        console.warn("[HumanTranslator] Backend proxy call failed:", err.message);
      }
      return null;
    }
  }

  
  async function _pipelineFallback(text, fromLang, toLang) {
    try {
      var apiBase = _getApiBase();
      var resp = await fetch(apiBase + "/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text, from_lang: fromLang || "auto", target_language: toLang || "en", options: { transliterate: true } }),
        signal: AbortSignal.timeout(15000)
      });
      if (!resp.ok) return null;
      var data = await resp.json();
      return (data.translated || "").trim() || null;
    } catch (e) {
      return null;
    }
  }

  // ══════════════════════════════════════════════════════════════
  // MAIN ENTRY POINT
  // ══════════════════════════════════════════════════════════════

  async function humanTranslate(originalText, fromLang, toLang, machineTranslation) {
    if (!originalText || !String(originalText).trim()) return "";

    var start = Date.now();

    // Layer 1: Normalize input
    var normalized = normalizeInput(originalText, fromLang);

    // Prepare machine translation reference
    var refTranslation = machineTranslation || "";
    if (_isBadMachineTranslation(normalized, refTranslation)) {
      console.log("[HumanTranslator] Machine translation flagged as bad — Claude uses original only");
      refTranslation = "";
    }

    // Layer 2: Call backend Claude proxy (no CORS)
    var result = await _callBackendClaudeProxy(normalized, fromLang, toLang, refTranslation);

    // Validate result
    if (result) {
      result = result.replace(/^["'"']|["'"']$/g, "").trim();

      // Reject if output is same as input
      if (result.toLowerCase() === normalized.toLowerCase()) {
        console.warn("[HumanTranslator] Proxy returned passthrough — using machine fallback");
        return machineTranslation || normalized;
      }

      // Reject single-word output for multi-word input
      var inputWords  = normalized.split(/\s+/).length;
      var outputWords = result.split(/\s+/).length;
      if (inputWords >= 3 && outputWords === 1) {
        console.warn("[HumanTranslator] Proxy returned single word for multi-word input — using machine fallback");
        return machineTranslation || normalized;
      }

      console.log("[HumanTranslator] ✅", (Date.now() - start) + "ms |",
        '"' + originalText + '"', "→", '"' + result + '"');
      return result;
    }

    // Final fallback: translation pipeline -> machine -> original
    var pipelineResult = await _pipelineFallback(normalized, fromLang, toLang);
    if (pipelineResult) return pipelineResult;
    console.warn("[HumanTranslator] All layers failed — falling back to machine translation");
    return machineTranslation || normalized || originalText;
  }

  // ── EXPOSE TO WINDOW ──────────────────────────────────────────
  window.humanTranslate = humanTranslate;
  window.normalizeInput = normalizeInput;

  if (window.USE_HUMAN_TRANSLATOR === undefined) {
    window.USE_HUMAN_TRANSLATOR = true; // Enable by default now that CORS is fixed
  }

  console.log("[HumanTranslator] Loaded. USE_HUMAN_TRANSLATOR =", window.USE_HUMAN_TRANSLATOR);

})();
