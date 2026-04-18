const LANGUAGE_CODES = {
  "Angika":        { google: "hi",  bhashini: "ank" },
  "Assamese":      { google: "as",  bhashini: "as"  },
  "Awadhi":        { google: "hi",  bhashini: "awa" },
  "Bagri":         { google: "hi",  bhashini: "bgq" },
  "Bengali":       { google: "bn",  bhashini: "bn"  },
  "Bhili":         { google: "hi",  bhashini: "bhb" },
  "Bhojpuri":      { google: "hi",  bhashini: "bho" },
  "Bodo":          { google: "hi",  bhashini: "brx" },
  "Braj":          { google: "hi",  bhashini: "bra" },
  "Bundeli":       { google: "hi",  bhashini: "bns" },
  "Chakma":        { google: "hi",  bhashini: "ccp" },
  "Chhattisgarhi": { google: "hi",  bhashini: "hne" },
  "English":       { google: "en",  bhashini: "en"  },
  "Garhwali":      { google: "hi",  bhashini: "gbm" },
  "Garo":          { google: "hi",  bhashini: "grt" },
  "Gondi":         { google: "hi",  bhashini: "gon" },
  "Gujarati":      { google: "gu",  bhashini: "gu"  },
  "Halbi":         { google: "hi",  bhashini: "hlb" },
  "Haryanvi":      { google: "hi",  bhashini: "bgc" },
  "Hindi":         { google: "hi",  bhashini: "hi"  },
  "Ho":            { google: "hi",  bhashini: "hoc" },
  "Jaintia":       { google: "hi",  bhashini: "jut" },
  "Kannada":       { google: "kn",  bhashini: "kn"  },
  "Karbi":         { google: "hi",  bhashini: "mjw" },
  "Khasi":         { google: "hi",  bhashini: "kha" },
  "Kodava":        { google: "hi",  bhashini: "kfa" },
  "Kokborok":      { google: "hi",  bhashini: "trp" },
  "Kolami":        { google: "hi",  bhashini: "kfb" },
  "Konkani":       { google: "kok", bhashini: "kok" },
  "Kui":           { google: "hi",  bhashini: "kxu" },
  "Kumaoni":       { google: "hi",  bhashini: "kfy" },
  "Kurukh":        { google: "hi",  bhashini: "kru" },
  "Kutchi":        { google: "hi",  bhashini: "kfr" },
  "Lai":           { google: "hi",  bhashini: "lai" },
  "Lambadi":       { google: "hi",  bhashini: "lmn" },
  "Lepcha":        { google: "ne",  bhashini: "lep" },
  "Lotha":         { google: "hi",  bhashini: "njh" },
  "Magahi":        { google: "hi",  bhashini: "mag" },
  "Maithili":      { google: "mai", bhashini: "mai" },
  "Malayalam":     { google: "ml",  bhashini: "ml"  },
  "Malvi":         { google: "hi",  bhashini: "mup" },
  "Marathi":       { google: "mr",  bhashini: "mr"  },
  "Marwari":       { google: "hi",  bhashini: "mwr" },
  "Meitei":        { google: "mni", bhashini: "mni" },
  "Mewari":        { google: "hi",  bhashini: "mtr" },
  "Mishing":       { google: "hi",  bhashini: "mxp" },
  "Mizo":          { google: "lus", bhashini: "lus" },
  "Monpa":         { google: "hi",  bhashini: "tcz" },
  "Mundari":       { google: "hi",  bhashini: "unr" },
  "Nepali":        { google: "ne",  bhashini: "ne"  },
  "Nimadi":        { google: "hi",  bhashini: "noe" },
  "Nyishi":        { google: "hi",  bhashini: "njz" },
  "Odia":          { google: "or",  bhashini: "or"  },
  "Pahari":        { google: "hi",  bhashini: "him" },
  "Punjabi":       { google: "pa",  bhashini: "pa"  },
  "Rajasthani":    { google: "hi",  bhashini: "raj" },
  "Santali":       { google: "sat", bhashini: "sat" },
  "Savara":        { google: "hi",  bhashini: "svr" },
  "Sema":          { google: "hi",  bhashini: "nsm" },
  "Tamil":         { google: "ta",  bhashini: "ta"  },
  "Tangkhul":      { google: "hi",  bhashini: "nmf" },
  "Telugu":        { google: "te",  bhashini: "te"  },
  "Thadou":        { google: "hi",  bhashini: "tcz" },
  "Tulu":          { google: "hi",  bhashini: "tcy" },
  "Urdu":          { google: "ur",  bhashini: "ur"  }
};

// ── Romanized Telugu keyword patterns ────────────────────────────────────────
// These are high-confidence Telugu romanized words that don't appear in Hindi/English
const TELUGU_ROMANIZED_MARKERS = [
  /\b(bagunnava|bagunnav|bagunna|bagunnara|bagunnaru)\b/i,
  /\b(emchesthunnavu|emchestunnav|emchestunna|chesthunna)\b/i,
  /\b(ippudu|ipudu|ipdu)\b/i,
  /\b(chala|chaala)\b/i,       // "very" in Telugu
  /\b(undi|undi|untundi)\b/i,
  /\b(chesi|chesanu|chesindi)\b/i,
  /\b(ra\b|raa\b)/i,           // Telugu casual suffix
  /\b(nenu|meeru|mee|memu|okka)\b/i,
  /\b(ayindi|avutundi|aindi)\b/i,
  /\b(ledu|leda|ledaa)\b/i,
  /\b(ante|antav|antaru|antundi)\b/i,
  /\b(kadhu|kadu|kaadu)\b/i,
  /\b(matladatam|matladanu|matladindi)\b/i,
  /\b(vachadu|vachindi|vasthanu)\b/i,
  /\b(pedda|chinna|paina|kinda)\b/i,
  /\b(anni|anni|oka|okka)\b/i,
];

// High-confidence Hindi romanized markers (to avoid misclassifying Hindi as Telugu)
const HINDI_ROMANIZED_MARKERS = [
  /\b(kya|kyun|kyunki|kyuki)\b/i,
  /\b(nahi|nahin|nhi)\b/i,
  /\b(hain|hai|ho|hum|tum|aap)\b/i,
  /\b(karo|karna|karunga|karegi)\b/i,
  /\b(mujhe|tumhe|unhe|usse)\b/i,
  /\b(abhi|phir|toh|aur|par)\b/i,
  /\b(bahut|bohot|thoda|zyada)\b/i,
  /\b(bhai|yaar|dost|bhaiya)\b/i,
  /\b(ghar|kaam|paisa|log|duniya)\b/i,
];

function withTimeout(ms) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);
  return { controller, timeoutId };
}

function preserveTrailingWhitespace(originalText, translatedText) {
  const source = String(originalText || "");
  const result = String(translatedText || "");
  const trailing = source.match(/\s+$/);
  if (!trailing) return result;
  return result.replace(/\s+$/, "") + trailing[0];
}

/**
 * Detect the language/script of a message.
 *
 * Returns:
 *   - An ISO language code string ("te", "hi", "bn", etc.) for non-Latin scripts
 *   - "romanized_te"  — Latin-script text that is likely romanized Telugu
 *   - "romanized_hi"  — Latin-script text that is likely romanized Hindi
 *   - "romanized"     — Latin-script text of unknown Indian language
 *   - "en"            — Confident English (no Indian language markers found)
 */
export async function detectLanguage(text) {
  try {
    // ── Mixed Telugu+English: check for Telugu words in otherwise Latin text ──
const TELUGU_SINGLE_WORD_MARKERS = [
  /\bni\b/i,        // "your" in Telugu
  /\bnee\b/i,       // "you" in Telugu  
  /\bmee\b/i,       // "your" (formal)
  /\badi\b/i,       // "that"
  /\bidi\b/i,       // "this"
  /\bemi\b/i,       // "what"
  /\bela\b/i,       // "how"
  /\bekkada\b/i,    // "where"
  /\beppudu\b/i,    // "when"
  /\bevaru\b/i,     // "who"
];

const mixedTeluguScore = TELUGU_SINGLE_WORD_MARKERS.filter(rx => rx.test(input)).length;
if (mixedTeluguScore >= 1 && teScore === 0 && hiScore === 0) {
  return "romanized_te"; // Mixed Telugu-English sentence
}
    
    const input = String(text || "");
    if (!input.trim()) return "hi";

    // ── Script-based detection (high confidence) ─────────────────────────────
    if (/[\u0C00-\u0C7F]/.test(input)) return "te";  // Telugu script
    if (/[\u0B80-\u0BFF]/.test(input)) return "ta";  // Tamil script
    if (/[\u0C80-\u0CFF]/.test(input)) return "kn";  // Kannada script
    if (/[\u0D00-\u0D7F]/.test(input)) return "ml";  // Malayalam script
    if (/[\u0A80-\u0AFF]/.test(input)) return "gu";  // Gujarati script
    if (/[\u0A00-\u0A7F]/.test(input)) return "pa";  // Gurmukhi (Punjabi) script
    if (/[\u0B00-\u0B7F]/.test(input)) return "or";  // Odia script
    if (/[\u0980-\u09FF]/.test(input)) return "bn";  // Bengali script
    if (/[\u0900-\u097F]/.test(input)) return "hi";  // Devanagari script
    if (/[\u0600-\u06FF]/.test(input)) return "ur";  // Arabic/Urdu script

    // ── Latin-script heuristic detection ─────────────────────────────────────
    // Count keyword matches for each language
    const teScore = TELUGU_ROMANIZED_MARKERS.filter(rx => rx.test(input)).length;
    const hiScore = HINDI_ROMANIZED_MARKERS.filter(rx => rx.test(input)).length;

    // Telugu wins if it has ≥1 strong marker and outscores Hindi
    if (teScore > 0 && teScore >= hiScore) {
      return "romanized_te";
    }
    // Hindi wins if it has ≥2 markers and outscores Telugu
    if (hiScore >= 2 && hiScore > teScore) {
      return "romanized_hi";
    }
    // Single Hindi marker with no Telugu — likely Hindi
    if (hiScore === 1 && teScore === 0) {
      return "romanized_hi";
    }

    // If neither language is detected, it's either English or unknown Indian
    // language. We pass "romanized" (auto-detect on backend).
    return "romanized";
  } catch (err) {
    return "hi";
  }
}

async function callProxy(payload) {
  const rawSrc = payload.sourceLanguage || "hi";

  // ── Map detected language sentinel to concrete codes ─────────────────────
  let srcForBackend;
  let srcForPipeline;

  if (rawSrc === "romanized_te") {
    // Romanized Telugu → send as Telugu to backend
    srcForBackend = "te";
    srcForPipeline = "te";
  } else if (rawSrc === "romanized_hi") {
    // Romanized Hindi → send as Hindi to backend
    srcForBackend = "hi";
    srcForPipeline = "hi";
  } else if (rawSrc === "romanized") {
    // Unknown romanized → let backend auto-detect
    srcForBackend = "auto";
    srcForPipeline = "hi"; // safe fallback for finalTranslate pipeline
  } else {
    srcForBackend = rawSrc;
    srcForPipeline = rawSrc;
  }

  const targetCode = payload.targetGoogleCode || "en";

  // If source and target are the same language, skip translation
  if (srcForBackend !== "auto" && srcForBackend === targetCode) {
    return null;
  }

  try {
    // ── LAYER 1: window.finalTranslate (translationIntegration.js pipeline) ──
    if (payload.mode === "translate" && typeof window.finalTranslate === "function") {
      try {
        const result = await window.finalTranslate(
          payload.text,
          srcForPipeline,
          targetCode
        );
        if (
          result &&
          typeof result === "string" &&
          result.trim().length > 0
        ) {
          // ── Quality check: reject if output is suspiciously similar to input ──
          // This catches cases where the backend echoes the romanized input back
          const inputNorm = payload.text.trim().toLowerCase().replace(/\s+/g, " ");
          const resultNorm = result.trim().toLowerCase().replace(/\s+/g, " ");

          // Allow short outputs that differ at all — they may be valid 1-word translations
          const isTooSimilar = inputNorm === resultNorm ||
            (inputNorm.length > 10 && _similarityRatio(inputNorm, resultNorm) > 0.85);

          if (!isTooSimilar) {
            return { result: result.trim() };
          }
          console.warn("[translationService] finalTranslate returned too-similar output — falling through to backend");
        }
      } catch (e) {
        console.warn("[translationService] finalTranslate threw:", e && e.message);
      }
    }

    // ── LAYER 2: Direct call to Vaani backend ─────────────────────────────────
    const API = window.API_URL || "https://vaani-app-ui0z.onrender.com";
    const { controller, timeoutId } = withTimeout(12000);

    const endpoint = payload.mode === "transliterate"
      ? API + "/transliterate"
      : API + "/translate";

    const body = payload.mode === "transliterate"
      ? JSON.stringify({ text: payload.text, lang: srcForBackend })
      : JSON.stringify({ text: payload.text, from_lang: srcForBackend, to_lang: targetCode });

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body,
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn("[translationService] backend returned", response.status);
      return null;
    }

    const data = await response.json();
    const translated = (
      data.translated ||
      data.result ||
      data.output ||
      data.text ||
      ""
    ).trim();

    if (!translated) {
      console.warn("[translationService] backend returned empty result");
      return null;
    }

    // Reject passthroughs
    const inputNorm = payload.text.trim().toLowerCase().replace(/\s+/g, " ");
    const translatedNorm = translated.toLowerCase().replace(/\s+/g, " ");
    if (inputNorm === translatedNorm) {
      console.warn("[translationService] backend returned passthrough");
      return null;
    }

    return { result: translated };

  } catch (err) {
    console.warn("[translationService] callProxy error:", err && err.message);
    return null;
  }
}

/**
 * Simple character-level similarity ratio between two strings.
 * Returns a value between 0 (completely different) and 1 (identical).
 * Used to detect when a "translation" is just a superficially modified echo.
 */
function _similarityRatio(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  // Count characters in shorter that appear in longer (rough overlap)
  let matches = 0;
  const longerArr = longer.split("");
  shorter.split("").forEach(function(ch) {
    const idx = longerArr.indexOf(ch);
    if (idx !== -1) {
      matches++;
      longerArr.splice(idx, 1);
    }
  });
  return (matches * 2) / (a.length + b.length);
}

export async function translateMessage(text, targetLanguageName, options = {}) {
  try {
    const input = String(text || "");
    if (!input) return null;

    const targetCodes = LANGUAGE_CODES[targetLanguageName];
    if (!targetCodes) return null;

    const sourceCode = await detectLanguage(input);

    // ── Skip translation if source matches target (for non-romanized scripts) ──
    if (
      sourceCode !== "romanized" &&
      sourceCode !== "romanized_te" &&
      sourceCode !== "romanized_hi" &&
      sourceCode === targetCodes.google
    ) {
      return input;
    }

    // ── Skip translation for likely proper names / repeated-char exclamations ──
function _isUntranslatable(text) {
  const t = text.trim();
  // Single word, all same repeated chars (e.g. "Pikaaaaaaa", "heyyyy")
  if (/^(.)\1{3,}$/i.test(t)) return true;
  // Very short (1-2 chars) — likely initials or noise
  if (t.length <= 2) return true;
  // Looks like a proper name (single capitalized word, no spaces)
  if (/^[A-Z][a-z]{1,12}$/.test(t)) return true;
  return false;
}
    
    // Don't attempt to translate names/exclamations — return as-is
if (_isUntranslatable(input)) return input;
    
    const data = await callProxy({
      text: input,
      targetLanguage: targetLanguageName,
      mode: "translate",
      messageId: options.messageId || "",
      sourceLanguage: sourceCode,
      targetGoogleCode: targetCodes.google,
      targetBhashiniCode: targetCodes.bhashini,
      contextMessages: Array.isArray(options.contextMessages)
        ? options.contextMessages.slice(-2)
        : []
    });

    if (!data || !data.result) return null;
    return preserveTrailingWhitespace(input, data.result);
  } catch (err) {
    return null;
  }
}

export async function transliterateMessage(text, targetLanguageName, options = {}) {
  try {
    const input = String(text || "");
    if (!input) return null;

    const targetCodes = LANGUAGE_CODES[targetLanguageName];
    if (!targetCodes) return null;

    const data = await callProxy({
      text: input,
      targetLanguage: targetLanguageName,
      mode: "transliterate",
      messageId: options.messageId || "",
      sourceLanguage: await detectLanguage(input),
      targetGoogleCode: targetCodes.google,
      targetBhashiniCode: targetCodes.bhashini,
      contextMessages: Array.isArray(options.contextMessages)
        ? options.contextMessages.slice(-2)
        : []
    });

    if (!data || !data.result) return null;
    return preserveTrailingWhitespace(input, data.result);
  } catch (err) {
    return null;
  }
}
