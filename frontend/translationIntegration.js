/* ================================================================
   Vaani — translationIntegration.js  v3.0
   Human-Like Translation Pipeline Integration

   PIPELINE (in order):
   ─────────────────────────────────────────────────────────────────
   Input
     │
     ▼
   [Layer 1] normalizeInput()         — ASR error correction
     │                                  "em jarigindi" → "emi jarigindi"
     │
     ▼
   [Layer 2] _machineTranslate()      — Bhashini NMT / Vaani backend
     │                                  Basic word-for-word translation
     │
     ▼
   [Layer 3a] humanTranslate()        — Claude LLM (when USE_HUMAN_TRANSLATOR=true)
     │    OR                            Context + tone + natural rewrite
   [Layer 3b] contextEnhance()        — Rule-based enhancer (fallback)
     │
     ▼
   [Layer 4]  enhanceWithLLM()        — LLM polish pass (when USE_LLM=true)
     │
     ▼
   Output

   FEATURE FLAGS (set in index.html <script> block):
   ─────────────────────────────────────────────────────────────────
   window.USE_HUMAN_TRANSLATOR = true   ← enables the Claude pipeline  (recommended)
   window.USE_ENHANCED_TRANSLATION = true  ← enables rule-based context enhancer
   window.USE_LLM = true                ← enables extra LLM polish pass
   window.DEBUG_TRANSLATION = true      ← verbose console logging

   RULES:
   ─────────────────────────────────────────────────────────────────
   - Never modifies window.translateText or any app.js function
   - Only adds / replaces window.finalTranslate
   - Graceful fallback at every step — never throws, never returns ""
================================================================ */

(function () {

  // ── Default feature flags ────────────────────────────────────
  window.USE_HUMAN_TRANSLATOR      = window.USE_HUMAN_TRANSLATOR      !== undefined ? window.USE_HUMAN_TRANSLATOR      : true;
  window.USE_ENHANCED_TRANSLATION  = window.USE_ENHANCED_TRANSLATION  !== undefined ? window.USE_ENHANCED_TRANSLATION  : true;
  window.USE_LLM                   = window.USE_LLM                   !== undefined ? window.USE_LLM                   : false;
  window.DEBUG_TRANSLATION         = window.DEBUG_TRANSLATION         !== undefined ? window.DEBUG_TRANSLATION         : false;

  // ── Debug logger ─────────────────────────────────────────────
  function _log() {
    if (!window.DEBUG_TRANSLATION) return;
    console.log.apply(console, ["[Vaani Pipeline]"].concat(Array.prototype.slice.call(arguments)));
  }

  // ── Safe machine translation wrapper ─────────────────────────
  async function _machineTranslate(text, fromLang, toLang) {
    // Bhashini NMT
    if (window.USE_API && typeof window.translateWithAPI === "function") {
      try {
        var apiResult = await window.translateWithAPI(text, fromLang, toLang);
        if (apiResult && apiResult.trim() && apiResult.toLowerCase() !== text.toLowerCase()) {
          _log("Bhashini NMT:", apiResult);
          return apiResult.trim();
        }
      } catch (e) { _log("Bhashini failed:", e && e.message); }
    }

    // Vaani backend
    if (typeof translateText === "function") {
      try {
        var r = await translateText(text, fromLang, toLang);
        if (r && r.trim()) return r.trim();
      } catch (e) { _log("translateText failed:", e && e.message); }
    }
    if (typeof window.translateText === "function") {
      try {
        var r2 = await window.translateText(text, fromLang, toLang);
        if (r2 && r2.trim()) return r2.trim();
      } catch (e) { _log("window.translateText failed:", e && e.message); }
    }

    // Direct API fallback
    try {
      var API = window.API_URL || "https://vaani-app-ui0z.onrender.com";
      var resp = await fetch(API + "/translate", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ text: text, from_lang: fromLang, to_lang: toLang }),
        signal:  AbortSignal.timeout(22000),
      });
      if (resp.ok) {
        var d = await resp.json();
        var t = (d.translated || "").trim();
        if (t) return t;
      }
    } catch (e) { _log("Direct API failed:", e && e.message); }

    return text;
  }

  // ── Context enhancer (rule-based) ────────────────────────────
  function _contextEnhance(original, machineResult, fromLang) {
    if (!window.USE_ENHANCED_TRANSLATION) return { enhanced: machineResult, detail: null };
    try {
      if (typeof window.enhanceTranslationDetailed === "function") {
        var detail = window.enhanceTranslationDetailed(original, machineResult, fromLang);
        return { enhanced: (detail && detail.enhanced) ? detail.enhanced : machineResult, detail: detail };
      }
      if (typeof window.enhanceTranslation === "function") {
        return { enhanced: window.enhanceTranslation(original, machineResult, fromLang), detail: null };
      }
    } catch (e) { _log("Context enhancer failed:", e && e.message); }
    return { enhanced: machineResult, detail: null };
  }

  // ── LLM polish pass ───────────────────────────────────────────
  async function _llmPolish(text, fromLang, toLang, detail) {
    if (!window.USE_LLM || typeof window.enhanceWithLLM !== "function") return text;
    try {
      var tone  = (detail && detail.tone)         ? detail.tone         : "neutral";
      var stype = (detail && detail.sentenceType) ? detail.sentenceType : "statement";
      return (await window.enhanceWithLLM(text, fromLang, toLang, tone, stype)) || text;
    } catch (e) { _log("LLM polish failed:", e && e.message); return text; }
  }

  // ══════════════════════════════════════════════════════════════
  // window.finalTranslate — THE MAIN PIPELINE
  // ══════════════════════════════════════════════════════════════

  window.finalTranslate = async function (text, fromLang, toLang) {
    if (!text || !String(text).trim()) return "";
    var original = String(text).trim();
    var start    = Date.now();

    _log("START | from=" + fromLang + " to=" + toLang + " | \"" + original + "\"");

    // ── Layer 1: ASR normalization ────────────────────────────────
    var normalized = original;
    try {
      if (typeof window.normalizeInput === "function") {
        normalized = window.normalizeInput(original, fromLang) || original;
      }
    } catch (e) { _log("normalizeInput failed:", e && e.message); }

    // ── Layer 2: Machine translation ──────────────────────────────
    var machineResult = "";
    try {
      machineResult = await _machineTranslate(normalized, fromLang, toLang);
    } catch (e) { _log("Machine translate threw:", e && e.message); }

    // ── Layer 3a: Human Translator (Claude) ───────────────────────
    if (window.USE_HUMAN_TRANSLATOR && typeof window.humanTranslate === "function") {
      try {
        var humanResult = await window.humanTranslate(original, fromLang, toLang, machineResult);
        if (humanResult && humanResult.trim() && humanResult.toLowerCase() !== original.toLowerCase()) {
          _log("Human result:", humanResult, "in", (Date.now()-start) + "ms");
          return humanResult.trim();
        }
      } catch (e) { _log("humanTranslate threw:", e && e.message); }
    }

    // ── Layer 3b: Rule-based context enhancer ─────────────────────
    if (!machineResult) return normalized || original;

    var enhanced = machineResult;
    var detail   = null;
    try {
      var ce = _contextEnhance(original, machineResult, fromLang);
      enhanced = ce.enhanced || machineResult;
      detail   = ce.detail;
    } catch (e) { _log("contextEnhance failed:", e && e.message); }

    // ── Layer 4: Optional LLM polish ─────────────────────────────
    var final = enhanced;
    try { final = await _llmPolish(enhanced, fromLang, toLang, detail); }
    catch (e) { _log("llmPolish failed:", e && e.message); }

    _log("Final:", final, "in", (Date.now()-start) + "ms");
    return final || machineResult || normalized || original;
  };

  if (typeof window.warmupLLM === "function") {
    window.warmupLLM().catch(function () {});
  }

  console.log(
    "[Vaani] translationIntegration v3.0 ready.",
    "| HUMAN_TRANSLATOR:", window.USE_HUMAN_TRANSLATOR,
    "| ENHANCED:", window.USE_ENHANCED_TRANSLATION,
    "| LLM_POLISH:", window.USE_LLM,
    "| DEBUG:", window.DEBUG_TRANSLATION
  );

})();
