/* ================================================================
   Vaani — llmEnhancer.js  (global build — no import/export)
   All symbols attached to window. Load with plain <script> tag.

   To activate:   window.USE_LLM = true
   To deactivate: window.USE_LLM = false  (default)
================================================================ */

var _LLM_TIMEOUT_MS = 28000;
var _LLM_MODEL      = "claude-sonnet-4-20250514";

function _buildLLMSystemPrompt(sourceLang, targetLang) {
  return [
    "You are a natural-language polisher for an Indian-language translation app.",
    "Source language: " + sourceLang + ". Target language: " + targetLang + ".",
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

async function _callLLM(text, sourceLang, targetLang) {
  /* ── REAL IMPLEMENTATION (uncomment + set window.VAANI_LLM_KEY when ready) ──
  var response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type":      "application/json",
      "x-api-key":         window.VAANI_LLM_KEY || "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model:      _LLM_MODEL,
      max_tokens: 512,
      system:     _buildLLMSystemPrompt(sourceLang, targetLang),
      messages:   [{ role: "user", content: text }],
    }),
    signal: AbortSignal.timeout(_LLM_TIMEOUT_MS),
  });

  if (!response.ok) {
    console.warn("[Vaani LLM] HTTP", response.status);
    return text;
  }

  var data   = await response.json();
  var result = data && data.content && data.content[0] && data.content[0].text;
  return (result && result.trim()) ? result.trim() : text;
  ── END REAL IMPLEMENTATION ── */

  // Stub: return unchanged
  return text;
}

window.enhanceWithLLM = async function(text, sourceLang, targetLang) {
  if (!text || typeof text !== "string") return text || "";
  if (window.USE_LLM !== true) return text;

  try {
    var timeout = new Promise(function(resolve) {
      setTimeout(function() { resolve(text); }, _LLM_TIMEOUT_MS);
    });
    var result = await Promise.race([_callLLM(text, sourceLang, targetLang), timeout]);
    return (result && result.trim()) ? result.trim() : text;
  } catch (err) {
    console.warn("[Vaani LLM] enhanceWithLLM failed:", err && err.message);
    return text;
  }
};

window.warmupLLM = async function() {
  if (window.USE_LLM !== true) return;
  try {
    await window.enhanceWithLLM("hello", "en", "en");
    console.log("[Vaani LLM] Warmup complete");
  } catch (e) {}
};
