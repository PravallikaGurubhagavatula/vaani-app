/**
 * Vaani — llmEnhancer.js
 * ═══════════════════════════════════════════════════════════════════
 * LLM enhancement layer — currently a safe pass-through stub.
 * Drop in a real API call here when ready WITHOUT touching any other file.
 *
 * To activate:   window.USE_LLM = true   (in browser console or config)
 * To deactivate: window.USE_LLM = false  (default)
 *
 * Contract:
 *   - ALWAYS returns a non-empty string
 *   - NEVER throws
 *   - NEVER mutates inputs
 *   - Must resolve in < 30 s or it times out and returns `text` unchanged
 * ═══════════════════════════════════════════════════════════════════
 */

// ── CONFIG ─────────────────────────────────────────────────────────
const LLM_TIMEOUT_MS  = 28000;   // hard ceiling before we give up
const LLM_MODEL       = "claude-sonnet-4-20250514"; // swap model here

// ── SYSTEM PROMPT BUILDER ──────────────────────────────────────────
// Produces a tight, token-efficient system prompt for translation polish.
function buildSystemPrompt(sourceLang, targetLang) {
  return [
    "You are a natural-language polisher for an Indian-language translation app.",
    `Source language: ${sourceLang}. Target language: ${targetLang}.`,
    "You receive text that has already been machine-translated.",
    "Your ONLY job: make it sound natural and colloquial — do NOT change meaning.",
    "Rules:",
    "- Keep slang markers like 'bro', 'dude', 'dear' if already present.",
    "- Preserve tone: angry text stays assertive, respectful text stays polite.",
    "- Output ONLY the polished translation. No explanations. No quotes.",
    "- If already natural, return it unchanged.",
    "- Never add content that wasn't implied by the original.",
  ].join("\n");
}

// ── INTERNAL LLM CALL ──────────────────────────────────────────────
// Replace the body of this function when plugging in a real LLM.
// Currently returns `text` unchanged (safe stub).
async function _callLLM(text, sourceLang, targetLang) {
  /* ── REAL IMPLEMENTATION (uncomment + fill API key when ready) ──
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type":      "application/json",
      "x-api-key":         window.VAANI_LLM_KEY || "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model:      LLM_MODEL,
      max_tokens: 512,
      system:     buildSystemPrompt(sourceLang, targetLang),
      messages:   [{ role: "user", content: text }],
    }),
    signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
  });

  if (!response.ok) {
    console.warn("[Vaani LLM] HTTP", response.status);
    return text;
  }

  const data   = await response.json();
  const result = data?.content?.[0]?.text?.trim();
  return result || text;
  ── END REAL IMPLEMENTATION ── */

  // Stub: return unchanged
  return text;
}

// ── MAIN EXPORT ────────────────────────────────────────────────────

/**
 * Optionally enhance `text` with an LLM call.
 * Safe no-op until window.USE_LLM === true AND a real _callLLM is wired up.
 *
 * @param {string} text        - Already context-enhanced translation
 * @param {string} sourceLang  - Source language code (e.g. "te")
 * @param {string} targetLang  - Target language code (e.g. "en")
 * @returns {Promise<string>}
 */
export async function enhanceWithLLM(text, sourceLang, targetLang) {
  if (!text || typeof text !== "string") return text || "";

  // Gate: only run when explicitly enabled
  if (window.USE_LLM !== true) return text;

  try {
    const result = await Promise.race([
      _callLLM(text, sourceLang, targetLang),
      // Hard timeout fallback
      new Promise(resolve => setTimeout(() => resolve(text), LLM_TIMEOUT_MS)),
    ]);
    return (result && result.trim()) ? result.trim() : text;
  } catch (err) {
    console.warn("[Vaani LLM] enhanceWithLLM failed, returning original:", err?.message);
    return text;
  }
}

/**
 * Warm up the LLM connection (optional — call once on app start).
 * No-op in stub mode.
 */
export async function warmupLLM() {
  if (window.USE_LLM !== true) return;
  try {
    await enhanceWithLLM("hello", "en", "en");
    console.log("[Vaani LLM] Warmup complete");
  } catch (_) {}
}
