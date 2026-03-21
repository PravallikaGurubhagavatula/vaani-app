/**
 * Vaani — translationIntegration.js
 * ═══════════════════════════════════════════════════════════════════
 * Drop this file in the same directory as app.js.
 * It monkey-patches the translation pipeline non-destructively.
 *
 * HOW TO ACTIVATE  (add ONE line anywhere after app.js loads):
 *
 *     <script type="module" src="translationIntegration.js?v=1"></script>
 *
 * Add it in index.html AFTER the existing app.js <script> tag:
 *
 *     <script src="app.js?v=20250325a"></script>
 *     <script type="module" src="translationIntegration.js?v=1"></script>   ← ADD THIS
 *
 * That is the ONLY change needed to index.html.
 * ═══════════════════════════════════════════════════════════════════
 */

import { enhanceTranslation,
         enhanceTranslationDetailed } from "./contextTranslator.js";
import { enhanceWithLLM,
         warmupLLM }                  from "./llmEnhancer.js";

// ── GLOBAL FLAGS ───────────────────────────────────────────────────

/**
 * Set window.DEBUG_TRANSLATION = true in the browser console to enable
 * per-translation logging: tone, slang hits, rewrite used, final output.
 */
window.DEBUG_TRANSLATION = window.DEBUG_TRANSLATION ?? false;

/**
 * Set window.USE_LLM = true to route final translations through the LLM
 * polisher defined in llmEnhancer.js.
 * Default: false (stub pass-through, zero latency).
 */
window.USE_LLM = window.USE_LLM ?? false;

// ── DEBUG LOGGER ───────────────────────────────────────────────────

function _debugLog(label, original, sourceLang, detail, llmResult) {
  if (!window.DEBUG_TRANSLATION) return;
  console.groupCollapsed(`[Vaani ContextTranslator] "${original.slice(0, 40)}" (${sourceLang})`);
  console.log("🎯 Tone detected :", detail.tone);
  console.log("📖 Slang hits    :", detail.slangHits.length
    ? detail.slangHits.map(h => `${h.slang} → ${h.meaning} (${h.tone})`).join(", ")
    : "none");
  console.log("✏️  Rewrite used  :", detail.rewriteUsed, detail.confidence ? `(confidence ${detail.confidence})` : "");
  console.log("🔄 Raw machine   :", detail.translated);
  console.log("✅ Context-enhanced:", detail.enhanced);
  if (window.USE_LLM) {
    console.log("🤖 LLM-polished  :", llmResult);
  }
  console.groupEnd();
}

// ── CORE WRAPPER ───────────────────────────────────────────────────

/**
 * finalTranslate — wraps the existing translateText() from app.js.
 *
 * Pipeline:
 *   translateText()  →  enhanceTranslation()  →  enhanceWithLLM() [optional]
 *
 * Replaces window.finalTranslate if already defined.
 * app.js internal functions are NOT touched.
 *
 * @param {string} text        - Source text
 * @param {string} sourceLang  - Source language code
 * @param {string} targetLang  - Target language code
 * @returns {Promise<string>}
 */
async function finalTranslate(text, sourceLang, targetLang) {
  if (!text || !text.trim()) return "";

  // ── Step 1: Existing machine translation (untouched) ────────────
  let basic = "";
  try {
    // translateText is defined in app.js and available on the same scope
    // because this module is loaded after app.js in the same page.
    basic = await window._vaaniTranslate(text, sourceLang, targetLang);
  } catch (err) {
    console.warn("[Vaani] finalTranslate: machine translation failed:", err?.message);
    return text;
  }

  if (!basic || !basic.trim()) return text;

  // ── Step 2: Context enhancement ─────────────────────────────────
  let enhanced = basic;
  let detail   = null;

  try {
    detail   = enhanceTranslationDetailed(text, basic, sourceLang);
    enhanced = detail.enhanced || basic;
  } catch (err) {
    console.warn("[Vaani] finalTranslate: contextEnhancer failed:", err?.message);
    enhanced = basic;
  }

  // ── Step 3: Optional LLM polish ─────────────────────────────────
  let final = enhanced;
  try {
    if (window.USE_LLM === true) {
      final = await enhanceWithLLM(enhanced, sourceLang, targetLang);
    }
  } catch (err) {
    console.warn("[Vaani] finalTranslate: LLM enhancer failed:", err?.message);
    final = enhanced;
  }

  // ── Step 4: Debug log ────────────────────────────────────────────
  if (window.DEBUG_TRANSLATION && detail) {
    _debugLog("finalTranslate", text, sourceLang, detail, final);
  }

  return final || basic || text;
}

// ── BRIDGE: expose finalTranslate + proxy _vaaniTranslate ──────────
//
// We expose translateText from app.js under a private key so finalTranslate
// can call it without any modification to app.js.
// This runs AFTER app.js has fully loaded (module scripts are deferred).

(function installBridge() {
  // Point _vaaniTranslate at the existing translateText from app.js.
  // translateText is a module-scoped function in app.js but because app.js
  // is loaded as a classic script it lands on the global closure —
  // we expose it through the window bridge used in app.js call sites.
  if (typeof translateText === "function") {
    window._vaaniTranslate = translateText;
  } else {
    // Fallback: wrap fetch call directly in case of scope isolation
    window._vaaniTranslate = async function(text, fromLang, toLang) {
      const API = window.API_URL || "https://vaani-app-ui0z.onrender.com";
      try {
        const r = await fetch(`${API}/translate`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ text, from_lang: fromLang, to_lang: toLang }),
          signal:  AbortSignal.timeout(22000),
        });
        if (!r.ok) return text;
        const d = await r.json();
        return (d.translated || "").trim() || text;
      } catch (_) {
        return text;
      }
    };
  }

  // Expose finalTranslate globally so future modules / console can use it
  window.finalTranslate = finalTranslate;

  console.log(
    "[Vaani] translationIntegration loaded.",
    "| DEBUG:", window.DEBUG_TRANSLATION,
    "| LLM:", window.USE_LLM
  );
})();

// ── OPTIONAL: warm up LLM connection on load ──────────────────────
// No-op unless window.USE_LLM === true
warmupLLM().catch(() => {});
