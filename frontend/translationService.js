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
    if (/[\u0C00-\u0C7F]/.test(input)) return "te";
    if (/[\u0B80-\u0BFF]/.test(input)) return "ta";
    if (/[\u0C80-\u0CFF]/.test(input)) return "kn";
    if (/[\u0D00-\u0D7F]/.test(input)) return "ml";
    if (/[\u0A80-\u0AFF]/.test(input)) return "gu";
    if (/[\u0A00-\u0A7F]/.test(input)) return "pa";
    if (/[\u0B00-\u0B7F]/.test(input)) return "or";
    if (/[\u0980-\u09FF]/.test(input)) return "bn";
    if (/[\u0900-\u097F]/.test(input)) return "hi";
    if (/[A-Za-z]/.test(input)) return "en";
    return "hi";
  } catch (err) {
    return "hi";
  }
}

async function callProxy(payload) {
  try {
    const API = window.API_URL || "https://vaani-app-ui0z.onrender.com";

    if (payload.mode === "translate") {
      if (typeof window.finalTranslate === "function") {
        const result = await window.finalTranslate(
          payload.text,
          payload.sourceLanguage || "hi",
          payload.targetGoogleCode || "en"
        );
        if (result && result.trim() && result.trim() !== payload.text.trim()) {
          return { result: result.trim() };
        }
      }

      const { controller, timeoutId } = withTimeout(10000);
      const response = await fetch(API + "/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: payload.text,
          from_lang: payload.sourceLanguage || "hi",
          to_lang: payload.targetGoogleCode || "en"
        }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!response.ok) return null;
      const data = await response.json();
      const translated = (data.translated || data.result || "").trim();
      return translated ? { result: translated } : null;
    }

    if (payload.mode === "transliterate") {
      const { controller, timeoutId } = withTimeout(10000);
      const response = await fetch(API + "/transliterate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: payload.text,
          lang: payload.sourceLanguage
        }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!response.ok) return { result: payload.text };
      const data = await response.json();
      const transliterated = (data.transliterated || data.result || "").trim();
      return transliterated ? { result: transliterated } : { result: payload.text };
    }

    return null;
  } catch (err) {
    return payload.mode === "transliterate" ? { result: payload.text } : null;
  }
}

export async function translateMessage(text, targetLanguageName, options = {}) {
  try {
    const input = String(text || "");
    if (!input) return null;
    const targetCodes = LANGUAGE_CODES[targetLanguageName];
    if (!targetCodes) return null;
    const sourceCode = await detectLanguage(input);
    if (sourceCode === targetCodes.google) return input;

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
