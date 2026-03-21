/* ================================================================
   Vaani — translationIntegration.js  (global build — no import/export)
   Load AFTER app.js with a plain <script> tag (NOT type="module").

   ⚠️  RULES:
   - Does NOT modify window.translateText or any existing function
   - Only ADDS window.finalTranslate
   - All existing onclick handlers keep working unchanged
   - Safe fallback if any dependency is missing
================================================================ */

(function() {

  // ── Global feature flags ─────────────────────────────────────────
  window.DEBUG_TRANSLATION       = window.DEBUG_TRANSLATION       || false;
  window.USE_LLM                 = window.USE_LLM                 || false;
  window.USE_ENHANCED_TRANSLATION = window.USE_ENHANCED_TRANSLATION !== undefined
    ? window.USE_ENHANCED_TRANSLATION
    : true;

  // ── Debug logger ─────────────────────────────────────────────────
  function _debugLog(original, sourceLang, detail, finalResult) {
    if (!window.DEBUG_TRANSLATION) return;
    try {
      var label = String(original).slice(0, 40);
      console.groupCollapsed("[Vaani ContextTranslator] \"" + label + "\" (" + sourceLang + ")");
      console.log("🎯 Tone detected  :", detail.tone);
      console.log("📖 Slang hits     :", detail.slangHits && detail.slangHits.length
        ? detail.slangHits.map(function(h) { return h.slang + " → " + h.meaning + " (" + h.tone + ")"; }).join(", ")
        : "none");
      console.log("✏️  Rewrite used   :", detail.rewriteUsed, detail.confidence ? "(confidence " + detail.confidence + ")" : "");
      console.log("🔄 Raw machine    :", detail.translated);
      console.log("✅ Context-enhanced:", detail.enhanced);
      if (window.USE_LLM) console.log("🤖 LLM-polished   :", finalResult);
      console.groupEnd();
    } catch (e) {}
  }

  // ── Safe wrapper around existing translateText ────────────────────
  // Reads translateText from window at call-time so it always picks up
  // the real function even if app.js finishes loading after this file.
  async function _machineTranslate(text, fromLang, toLang) {
    // Try window.translateText (defined in app.js global scope)
    if (typeof translateText === "function") {
      return await translateText(text, fromLang, toLang);
    }
    if (typeof window.translateText === "function") {
      return await window.translateText(text, fromLang, toLang);
    }
    // Last-resort direct API call if translateText is not yet available
    try {
      var API = window.API_URL || "https://vaani-app-ui0z.onrender.com";
      var r = await fetch(API + "/translate", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ text: text, from_lang: fromLang, to_lang: toLang }),
        signal:  AbortSignal.timeout(22000),
      });
      if (!r.ok) return text;
      var d = await r.json();
      return (d.translated || "").trim() || text;
    } catch (e) {
      console.warn("[Vaani] _machineTranslate fallback failed:", e && e.message);
      return text;
    }
  }

  // ── finalTranslate — the enhanced pipeline ────────────────────────
  window.finalTranslate = async function(text, fromLang, toLang) {
    if (!text || !String(text).trim()) return "";

    // Step 1: machine translation (existing, untouched)
    var basic = "";
    try {
      basic = await _machineTranslate(text, fromLang, toLang);
    } catch (e) {
      console.warn("[Vaani] finalTranslate: machine translation failed:", e && e.message);
      return text;
    }

    if (!basic || !String(basic).trim()) return text;

    // Short-circuit: if enhanced translation is disabled, return basic
    if (!window.USE_ENHANCED_TRANSLATION) return basic;

    // Step 2: context enhancement
    var enhanced = basic;
    var detail   = null;

    try {
      if (typeof window.enhanceTranslationDetailed === "function") {
        detail   = window.enhanceTranslationDetailed(text, basic, fromLang);
        enhanced = (detail && detail.enhanced) ? detail.enhanced : basic;
      } else if (typeof window.enhanceTranslation === "function") {
        enhanced = window.enhanceTranslation(text, basic, fromLang);
      }
    } catch (e) {
      console.warn("[Vaani] finalTranslate: contextEnhancer failed:", e && e.message);
      enhanced = basic;
    }

    // Step 3: optional LLM polish
    var final = enhanced;
    try {
      if (window.USE_LLM === true && typeof window.enhanceWithLLM === "function") {
        final = await window.enhanceWithLLM(enhanced, fromLang, toLang);
      }
    } catch (e) {
      console.warn("[Vaani] finalTranslate: LLM enhancer failed:", e && e.message);
      final = enhanced;
    }

    // Step 4: debug log
    if (window.DEBUG_TRANSLATION && detail) _debugLog(text, fromLang, detail, final);

    return final || basic || text;
  };

  console.log(
    "[Vaani] translationIntegration ready.",
    "| ENHANCED:", window.USE_ENHANCED_TRANSLATION,
    "| DEBUG:", window.DEBUG_TRANSLATION,
    "| LLM:", window.USE_LLM
  );

  // Optional: warm up LLM (no-op in stub mode)
  if (typeof window.warmupLLM === "function") {
    window.warmupLLM().catch(function() {});
  }

})();
