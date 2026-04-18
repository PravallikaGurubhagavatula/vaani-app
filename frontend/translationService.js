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

export async function detectLanguage(text) {
  try {
    const input = String(text || "");
    if (!input.trim()) return "hi";

    // Script-based detection (high confidence for non-Latin scripts)
    if (/[\u0C00-\u0C7F]/.test(input)) return "te";  // Telugu script
    if (/[\u0B80-\u0BFF]/.test(input)) return "ta";  // Tamil script
    if (/[\u0C80-\u0CFF]/.test(input)) return "kn";  // Kannada script
    if (/[\u0D00-\u0D7F]/.test(input)) return "ml";  // Malayalam script
    if (/[\u0A80-\u0AFF]/.test(input)) return "gu";  // Gujarati script
    if (/[\u0A00-\u0A7F]/.test(input)) return "pa";  // Gurmukhi script
    if (/[\u0B00-\u0B7F]/.test(input)) return "or";  // Odia script
    if (/[\u0980-\u09FF]/.test(input)) return "bn";  // Bengali script
    if (/[\u0900-\u097F]/.test(input)) return "hi";  // Devanagari script
    if (/[\u0600-\u06FF]/.test(input)) return "ur";  // Arabic/Urdu script

    // Latin script — could be English OR romanized Indian language.
    // For this app, most Latin-script chat messages are romanized Indian
    // language (Telugu, Hindi, Tamil etc written in English letters).
    // We MUST NOT skip translation for Latin-script text.
    // Return a sentinel value "romanized" so the same-language skip is
    // never triggered when target is English.
    // The backend will auto-detect the actual source language.
    return "romanized";
  } catch (err) {
    return "hi";
  }
}

async function callProxy(payload) {
  // Resolve the actual source language code.
  // "romanized" means Latin-script text whose actual language is unknown —
  // pass "auto" to tell the backend to detect it, and pass "hi" to finalTranslate
  // as a safe default (Devanagari-family languages are most common in this app).
  const rawSrc = payload.sourceLanguage || "hi";
  const srcForBackend = (rawSrc === "romanized") ? "auto" : rawSrc;
  const srcForPipeline = (rawSrc === "romanized") ? "hi" : rawSrc;
  const targetCode = payload.targetGoogleCode || "en";

  try {
    // ── LAYER 1: window.finalTranslate (translationIntegration.js pipeline)
    // This is the existing working engine: Bhashini → Vaani backend → contextEnhancer.
    // Only use for translate mode (not transliterate).
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
          result.trim() &&
          result.trim().toLowerCase() !== payload.text.trim().toLowerCase()
        ) {
          return { result: result.trim() };
        }
        // If result === input, fall through — don't return a passthrough
        console.warn("[translationService] finalTranslate returned passthrough — trying backend directly");
      } catch (e) {
        console.warn("[translationService] finalTranslate threw:", e && e.message);
      }
    }

    // ── LAYER 2: Direct call to Vaani backend (translate endpoint)
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

    if (!translated || translated.toLowerCase() === payload.text.trim().toLowerCase()) {
      console.warn("[translationService] backend returned passthrough or empty");
      return null;
    }

    return { result: translated };

  } catch (err) {
    console.warn("[translationService] callProxy error:", err && err.message);
    return null;
  }
}

export async function translateMessage(text, targetLanguageName, options = {}) {
  try {
    const input = String(text || "");
    if (!input) return null;
    const targetCodes = LANGUAGE_CODES[targetLanguageName];
    if (!targetCodes) return null;
    const sourceCode = await detectLanguage(input);
    if (sourceCode !== "romanized" && sourceCode === targetCodes.google) return input;

    const data = await callProxy({
      text: input,
      targetLanguage: targetLanguageName,
      mode: "translate",
      messageId: options.messageId || "",
      sourceLanguage: sourceCode,
      targetGoogleCode: targetCodes.google,
      targetBhashiniCode: targetCodes.bhashini,
      contextMessages: Array.isArray(options.contextMessages) ? options.contextMessages.slice(-2) : []
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
      contextMessages: Array.isArray(options.contextMessages) ? options.contextMessages.slice(-2) : []
    });

    if (!data || !data.result) return null;
    return preserveTrailingWhitespace(input, data.result);
  } catch (err) {
    return null;
  }
}
