/* ================================================================
   Vaani — llmEnhancer.js  v2.0  (global build — no import/export)
   All symbols attached to window. Load with plain <script> tag.

   PURPOSE:
   ─────────────────────────────────────────────────────────────────
   Optional final polish step in the translation pipeline.
   Takes the context-enhanced translation and makes it sound
   fully natural in the target language.

   ACTIVATION:
   ─────────────────────────────────────────────────────────────────
   window.USE_LLM = true              (default: false — off)
   window.VAANI_LLM_KEY = "sk-ant-..." (required when USE_LLM=true)

   PIPELINE POSITION:
   ─────────────────────────────────────────────────────────────────
   Voice/Text → Machine Translate → Context Enhance → [LLM Polish]
                                                        ↑ this file

   BEHAVIOUR:
   ─────────────────────────────────────────────────────────────────
   - USE_LLM=false → returns text unchanged (zero overhead)
   - API key missing → returns text unchanged with warning
   - LLM call fails  → returns text unchanged (graceful fallback)
   - Sentence type is passed to prompt so LLM never changes commands
     to suggestions or questions to statements
================================================================ */

var _LLM_TIMEOUT_MS = 28000;
var _LLM_MODEL      = "claude-sonnet-4-20250514";

// ── SENTENCE TYPE LABELS FOR PROMPT ──────────────────────────────
// Human-readable labels injected into the LLM system prompt so it
// understands what kind of sentence it's polishing.
var _LLM_SENTENCE_TYPE_LABELS = {
  question:  "interrogative (question — must end with ? and stay as a question)",
  command:   "imperative (command or instruction — tone must stay direct and assertive)",
  statement: "declarative (statement — natural conversational tone)",
};

// ── SYSTEM PROMPT BUILDER ─────────────────────────────────────────
function _buildSystemPrompt(sourceLang, targetLang, tone, sentenceType) {
  var stypeLabel = _LLM_SENTENCE_TYPE_LABELS[sentenceType] || "declarative (statement)";
  var toneLabel  = tone || "neutral";

  return [
    "You are a natural-language polisher for an Indian-language translation app called Vaani.",
    "",
    "CONTEXT:",
    "  Source language : " + sourceLang,
    "  Target language : " + targetLang,
    "  Detected tone   : " + toneLabel,
    "  Sentence type   : " + stypeLabel,
    "",
    "TASK:",
    "You receive text that has already been machine-translated and lightly enhanced.",
    "Your ONLY job is to make it sound more natural and fluent — do NOT change the meaning.",
    "",
    "STRICT RULES:",
    "1. NEVER change the sentence type. A question must stay a question. A command must stay a command.",
    "2. NEVER soften commands — 'be quiet!' stays assertive, not 'could you please be quiet?'",
    "3. NEVER add formality to casual speech — 'what's up bro?' stays casual.",
    "4. PRESERVE slang markers already present: bro, dude, yaar, da, machan etc.",
    "5. PRESERVE tone: angry text stays assertive, respectful text stays polite.",
    "6. If already perfectly natural → return it UNCHANGED.",
    "7. NEVER add content that wasn't implied by the original.",
    "8. Output ONLY the polished text. No explanations. No quotes. No preamble.",
    "",
    "EXAMPLES:",
    "  Input:  'what are you doing bro?'  →  Output: 'what are you doing bro?'  (already natural)",
    "  Input:  'i am not having understanding'  →  Output: 'I don't understand'",
    "  Input:  'be silent!!'  →  Output: 'be silent!!'  (command, don't soften)",
    "  Input:  'please help me'  →  Output: 'please help me'  (respectful, don't change)",
  ].join("\n");
}

// ── LLM CALL ─────────────────────────────────────────────────────
async function _callLLM(text, sourceLang, targetLang, tone, sentenceType) {
  if (!window.VAANI_LLM_KEY) {
    console.warn("[Vaani LLM] VAANI_LLM_KEY not set — skipping LLM polish");
    return text;
  }

  var response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type":      "application/json",
      "x-api-key":         window.VAANI_LLM_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model:      _LLM_MODEL,
      max_tokens: 256,
      system:     _buildSystemPrompt(sourceLang, targetLang, tone, sentenceType),
      messages:   [{ role: "user", content: text }],
    }),
    signal: AbortSignal.timeout(_LLM_TIMEOUT_MS),
  });

  if (!response.ok) {
    console.warn("[Vaani LLM] HTTP", response.status, response.statusText);
    return text;
  }

  var data   = await response.json();
  var result = data && data.content && data.content[0] && data.content[0].text;
  return (result && result.trim()) ? result.trim() : text;
}

// ══════════════════════════════════════════════════════════════════
// PUBLIC EXPORTS
// ══════════════════════════════════════════════════════════════════

/**
 * enhanceWithLLM(text, sourceLang, targetLang, tone?, sentenceType?)
 *
 * Polishes a translated string using Claude.
 * Returns text unchanged if:
 *   - window.USE_LLM !== true
 *   - window.VAANI_LLM_KEY is not set
 *   - LLM call fails or times out
 *
 * tone and sentenceType are optional — detected automatically
 * if window.detectTone and window.detectSentenceType are available.
 *
 * @param {string}  text          already-enhanced translation
 * @param {string}  sourceLang    Vaani lang code e.g. "te"
 * @param {string}  targetLang    Vaani lang code e.g. "en"
 * @param {string=} tone          optional — friendly/angry/neutral/etc.
 * @param {string=} sentenceType  optional — question/command/statement
 * @returns {Promise<string>}
 */
window.enhanceWithLLM = async function(text, sourceLang, targetLang, tone, sentenceType) {
  if (!text || typeof text !== "string") return text || "";

  // ── Gate: only run when explicitly enabled ─────────────────────
  if (window.USE_LLM !== true) return text;

  // ── Detect tone/type if not provided ──────────────────────────
  var resolvedTone = tone || "neutral";
  var resolvedType = sentenceType || "statement";

  // Try to get them from the detectors if available
  if (!tone && typeof window.detectTone === "function") {
    try { resolvedTone = window.detectTone(text, sourceLang) || "neutral"; } catch(_) {}
  }
  if (!sentenceType && typeof window.detectSentenceType === "function") {
    try { resolvedType = window.detectSentenceType(text) || "statement"; } catch(_) {}
  }

  // ── Skip LLM for commands with angry tone ─────────────────────
  // "chup!!" is already perfect — LLM would just return it unchanged anyway
  // but this saves the API round-trip.
  if (resolvedTone === "angry" && resolvedType === "command") {
    return text;
  }

  // ── Skip LLM for very short (1-2 word) results ────────────────
  // LLM adds no value to "bro", "what?", "okay" etc.
  if (text.trim().split(/\s+/).length <= 2) return text;

  try {
    var timeout = new Promise(function(resolve) {
      setTimeout(function() {
        console.warn("[Vaani LLM] Timeout after", _LLM_TIMEOUT_MS, "ms — using enhanced text");
        resolve(text);
      }, _LLM_TIMEOUT_MS);
    });

    var result = await Promise.race([
      _callLLM(text, sourceLang, targetLang, resolvedTone, resolvedType),
      timeout,
    ]);

    var polished = (result && result.trim()) ? result.trim() : text;

    // Sanity: reject if LLM response is wildly longer than input
    if (polished.length > text.length * 2.5) {
      console.warn("[Vaani LLM] Response too long — using enhanced text");
      return text;
    }

    console.log("[Vaani LLM] Polished:", text, "→", polished);
    return polished;
  } catch (err) {
    console.warn("[Vaani LLM] enhanceWithLLM failed:", err && err.message, "— using enhanced text");
    return text;
  }
};

/**
 * warmupLLM()
 * Optional call at app startup to warm up the API connection.
 * No-op if USE_LLM=false.
 */
window.warmupLLM = async function() {
  if (window.USE_LLM !== true) return;
  if (!window.VAANI_LLM_KEY) {
    console.warn("[Vaani LLM] warmupLLM: VAANI_LLM_KEY not set");
    return;
  }
  try {
    await window.enhanceWithLLM("hello", "en", "en", "neutral", "statement");
    console.log("[Vaani LLM] Warmup complete");
  } catch (e) {
    console.warn("[Vaani LLM] Warmup failed:", e && e.message);
  }
};

console.log(
  "[Vaani LLM] llmEnhancer v2 loaded |",
  "USE_LLM:", window.USE_LLM,
  "| Key set:", !!(window.VAANI_LLM_KEY)
);
