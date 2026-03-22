/* ================================================================
   Vaani — humanTranslator.js  v1.0
   Human-Like Translation Pipeline

   ARCHITECTURE — 3-layer pipeline:
   ─────────────────────────────────────────────────────────────────
   Layer 1 → INPUT NORMALIZATION
             Fix ASR errors, romanized typos, partial words
             "em jarigindi" → "emi jarigindi"

   Layer 2 → CONTEXT UNDERSTANDING  (Claude LLM)
             Detect intent, tone, slang presence
             Understand what the speaker MEANS

   Layer 3 → NATURAL EXPRESSION  (Claude LLM)
             Rewrite into natural human conversational output
             NOT word-for-word — meaning-for-meaning

   ACTIVATION:
   ─────────────────────────────────────────────────────────────────
   window.USE_HUMAN_TRANSLATOR = true    (default: false)
   No API key required — routes through Vaani's own Claude proxy.

   FALLBACK:
   ─────────────────────────────────────────────────────────────────
   If any layer fails, the pipeline falls back gracefully to the
   previous layer's output. Never returns empty, never throws.
================================================================ */

(function () {

  // ── CONSTANTS ──────────────────────────────────────────────────
  var _MODEL   = "claude-sonnet-4-20250514";
  var _TIMEOUT = 30000;

  // ── LANGUAGE NAME MAP (for prompts) ────────────────────────────
  var _LANG_NAMES = {
    te: "Telugu",   hi: "Hindi",      ta: "Tamil",
    kn: "Kannada",  ml: "Malayalam",  bn: "Bengali",
    mr: "Marathi",  gu: "Gujarati",   pa: "Punjabi",
    ur: "Urdu",     or: "Odia",       as: "Assamese",
    sa: "Sanskrit", ne: "Nepali",     sd: "Sindhi",
    mai:"Maithili", bho:"Bhojpuri",   kok:"Konkani",
    ks: "Kashmiri", doi:"Dogri",      brx:"Bodo",
    sat:"Santali",  gom:"Goan Konkani", mwr:"Marwari",
    tcy:"Tulu",     lus:"Mizo",        awa:"Awadhi",
    mag:"Magahi",   hne:"Chhattisgarhi",bgc:"Haryanvi",
    raj:"Rajasthani",kha:"Khasi",      bho:"Bhojpuri",
    en: "English",
  };

  function _langName(code) {
    return _LANG_NAMES[code] || code;
  }

  // ══════════════════════════════════════════════════════════════
  // LAYER 1 — INPUT NORMALIZATION
  // Fix ASR errors and romanized typos before anything else.
  // These are language-agnostic pattern rules + per-language tables.
  // ══════════════════════════════════════════════════════════════

  // Telugu ASR correction table
  // Maps common speech-recognition truncations → correct romanization
  var _TE_ASR_CORRECTIONS = {
    "em jarigindi":  "emi jarigindi",
    "em chesaru":    "emi chesaru",
    "em chestav":    "emi chestunnav",
    "em antunnav":   "emi antunnav",
    "em ayindi":     "emi ayindi",
    "ela un":        "ela unnav",
    "ela enna":      "ela unnenu",
    "nuvvu ekka":    "nuvvu ekkada unnav",
    "neeku ista":    "neeku istama",
    "cheppu ra":     "cheppu ra",
    "paduko":        "padukondi",
    "veltava ra":    "veltava ra",
  };

  // Hindi ASR corrections
  var _HI_ASR_CORRECTIONS = {
    "kya kar rhe":   "kya kar rahe ho",
    "kahan h":       "kahan ho",
    "kaise h":       "kaise ho",
    "kya hua":       "kya hua",
    "kyun aise":     "kyun aisa kar rahe ho",
  };

  // Tamil ASR corrections
  var _TA_ASR_CORRECTIONS = {
    "enna panre":    "enna panreey",
    "epdi iruke":    "epdi irukeenga",
    "engu po":       "engu pore",
  };

  var _CORRECTIONS_BY_LANG = {
    te: _TE_ASR_CORRECTIONS,
    hi: _HI_ASR_CORRECTIONS,
    ta: _TA_ASR_CORRECTIONS,
  };

  function normalizeInput(text, fromLang) {
    if (!text) return text;
    var normalized = text.trim().toLowerCase();

    // Apply language-specific correction table (longest match first)
    var corrections = _CORRECTIONS_BY_LANG[fromLang] || {};
    var keys = Object.keys(corrections).sort(function(a,b){ return b.length - a.length; });
    for (var i = 0; i < keys.length; i++) {
      if (normalized.indexOf(keys[i]) === 0) {
        // Prefix match — restore original casing of the suffix if any
        var tail = text.trim().slice(keys[i].length);
        normalized = corrections[keys[i]] + tail;
        break;
      }
    }

    // Generic: fix lone "em" at start of Telugu romanized input
    if (fromLang === "te") {
      normalized = normalized
        .replace(/^em\s+/, "emi ")        // em jarigindi → emi jarigindi
        .replace(/\bela un\b/, "ela unnav");
    }

    // Preserve original casing intent: if original was all-lower, keep normalized
    // If original had some caps, restore first-letter cap
    var wasCapitalized = text.trim().charAt(0) === text.trim().charAt(0).toUpperCase() &&
                         text.trim().charAt(0) !== text.trim().charAt(0).toLowerCase();
    if (wasCapitalized) {
      normalized = normalized.charAt(0).toUpperCase() + normalized.slice(1);
    }

    if (normalized !== text.trim()) {
      console.log("[HumanTranslator] ASR correction: \"" + text.trim() + "\" → \"" + normalized + "\"");
    }
    return normalized;
  }

  // ══════════════════════════════════════════════════════════════
  // LAYER 2 + 3 — CONTEXT + NATURAL EXPRESSION  (single LLM call)
  // We merge layers 2 and 3 into one Claude call for speed.
  // The prompt instructs Claude to:
  //   (a) understand intent, tone, slang
  //   (b) output natural human English — not word-for-word
  // ══════════════════════════════════════════════════════════════

  function _buildHumanTranslationPrompt(normalizedInput, rawMachineTranslation, fromLang, toLang) {
    var srcName = _langName(fromLang);
    var tgtName = _langName(toLang);

    return [
      "You are a human interpreter specialising in Indian languages for an app called Vaani.",
      "Your job is to produce a natural, conversational " + tgtName + " translation.",
      "",
      "SOURCE LANGUAGE: " + srcName,
      "TARGET LANGUAGE: " + tgtName,
      "ORIGINAL INPUT: " + normalizedInput,
      "MACHINE TRANSLATION (reference only, may be wrong): " + (rawMachineTranslation || "(unavailable)"),
      "",
      "TRANSLATION RULES — read every rule carefully:",
      "1. Understand the MEANING and INTENT of the original, not just the words.",
      "2. Detect the TONE: casual / friendly / question / emotional / urgent / respectful.",
      "3. If the input is a QUESTION, output must be a question.",
      "4. If the input is a COMMAND, output must be a command — do not soften it.",
      "5. Preserve natural slang markers when they occur naturally (bro, yaar, dude, da, machan, guru).",
      "   — Do NOT add slang to sentences that don't have it.",
      "   — Do NOT force slang into formal or emotional sentences.",
      "6. NEVER produce a single-word output for a multi-word input.",
      "7. NEVER translate one word at a time (e.g. do not output 'M happened' for 'em jarigindi').",
      "8. Output must sound like a real human speaking — not a dictionary.",
      "9. Keep the output SHORT and NATURAL — the same length as the original intent.",
      "10. Output ONLY the final translation. No explanations, no quotes, no labels.",
      "",
      "EXAMPLES (Telugu → English):",
      "  'emi jarigindi'     → 'What happened?'",
      "  'enti ra?'          → \"What's up bro?\"",
      "  'nuvvu ekkada unnav'→ 'Where are you?'",
      "  'neeku istama?'     → 'Do you like it?'",
      "  'ela unnav?'        → 'How are you?'",
      "  'cheppu ra'         → 'Tell me bro'",
      "  'chala bagundi'     → \"That's really great!\"",
      "  'veltava ra?'       → 'Are you coming bro?'",
      "",
      "Now translate the original input. Output only the translation:",
    ].join("\n");
  }

  async function _callClaudeForTranslation(prompt) {
    try {
      var response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(_TIMEOUT),
        body: JSON.stringify({
          model: _MODEL,
          max_tokens: 1000,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!response.ok) {
        console.warn("[HumanTranslator] Claude API error:", response.status);
        return null;
      }

      var data = await response.json();
      var text = (data.content || [])
        .filter(function(b){ return b.type === "text"; })
        .map(function(b){ return b.text; })
        .join("")
        .trim();

      return text || null;
    } catch (err) {
      console.warn("[HumanTranslator] Claude call failed:", err.message);
      return null;
    }
  }

  // ══════════════════════════════════════════════════════════════
  // QUALITY GUARD
  // Detect bad machine-translation outputs before passing to LLM.
  // If machine translation is obviously wrong, we tell Claude
  // to rely on the original input only.
  // ══════════════════════════════════════════════════════════════

  function _isBadMachineTranslation(original, machineResult) {
    if (!machineResult) return true;
    var orig  = original.trim().toLowerCase();
    var trans = machineResult.trim().toLowerCase();

    // Passthrough — same as input
    if (trans === orig) return true;

    // Single word output for multi-word input
    var origWords  = orig.split(/\s+/).length;
    var transWords = trans.split(/\s+/).length;
    if (origWords >= 2 && transWords === 1) return true;

    // Very short output for long input (lossy translation)
    if (origWords >= 3 && transWords < Math.ceil(origWords * 0.4)) return true;

    // Starts with a single capital letter (hallucination like "M happened")
    if (/^[A-Z]\s/.test(machineResult.trim())) return true;

    return false;
  }

  // ══════════════════════════════════════════════════════════════
  // MAIN ENTRY POINT
  // async function humanTranslate(originalText, fromLang, toLang)
  // ══════════════════════════════════════════════════════════════

  async function humanTranslate(originalText, fromLang, toLang, machineTranslation) {
    if (!originalText || !String(originalText).trim()) return "";

    var start = Date.now();

    // ── Layer 1: Normalize input ──────────────────────────────────
    var normalized = normalizeInput(originalText, fromLang);

    // ── Layer 2 + 3: Context + Natural Expression via Claude ──────
    var refTranslation = machineTranslation || "";

    // If machine translation looks bad, mark it as unavailable so
    // Claude relies on the original input alone
    if (_isBadMachineTranslation(normalized, refTranslation)) {
      console.log("[HumanTranslator] Machine translation flagged as bad — Claude uses original only");
      refTranslation = "(bad machine translation — ignore and translate from original)";
    }

    var prompt = _buildHumanTranslationPrompt(normalized, refTranslation, fromLang, toLang);
    var result = await _callClaudeForTranslation(prompt);

    // ── Validate result ───────────────────────────────────────────
    if (result) {
      // Strip any accidental quotes
      result = result.replace(/^["'"']|["'"']$/g, "").trim();

      // Sanity: reject if output is same as input (passthrough)
      if (result.toLowerCase() === normalized.toLowerCase()) {
        console.warn("[HumanTranslator] Claude returned passthrough — using machine fallback");
        return machineTranslation || normalized;
      }

      // Reject single-word output for multi-word input
      var inputWords  = normalized.split(/\s+/).length;
      var outputWords = result.split(/\s+/).length;
      if (inputWords >= 2 && outputWords === 1) {
        console.warn("[HumanTranslator] Claude returned single word for multi-word input — using machine fallback");
        return machineTranslation || normalized;
      }

      console.log("[HumanTranslator] ✅ " + (Date.now()-start) + "ms | \"" + originalText + "\" → \"" + result + "\"");
      return result;
    }

    // Fallback chain: machine → normalized original
    console.warn("[HumanTranslator] Claude unavailable — falling back");
    return machineTranslation || normalized || originalText;
  }

  // ── EXPOSE TO WINDOW ──────────────────────────────────────────
  window.humanTranslate    = humanTranslate;
  window.normalizeInput    = normalizeInput;

  // Feature flag — off by default, opt-in
  if (window.USE_HUMAN_TRANSLATOR === undefined) {
    window.USE_HUMAN_TRANSLATOR = false;
  }

  console.log("[HumanTranslator] Loaded. USE_HUMAN_TRANSLATOR =", window.USE_HUMAN_TRANSLATOR);

})();
