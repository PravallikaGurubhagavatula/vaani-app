const LANGUAGE_CODES = {
  Adi: "en",
  Angami: "en",
  Angika: "hi",
  Ao: "en",
  Apatani: "en",
  Assamese: "as",
  Awadhi: "awa",
  Bagri: "hi",
  Balti: "ur",
  Bengali: "bn",
  Bhili: "hi",
  Bhojpuri: "bho",
  Bhutia: "ne",
  Bodo: "brx",
  Braj: "hi",
  Bundeli: "hi",
  Chakma: "bn",
  Chhattisgarhi: "hne",
  Dogri: "doi",
  French: "fr",
  Garo: "en",
  Garhwali: "hi",
  Gondi: "hi",
  Gujarati: "gu",
  Halbi: "hi",
  Haryanvi: "hi",
  Hindi: "hi",
  Ho: "hi",
  Jaintia: "en",
  Kangri: "hi",
  Kannada: "kn",
  Karbi: "en",
  Kashmiri: "ks",
  Khasi: "kha",
  Kinnauri: "hi",
  Kodava: "kn",
  Kokborok: "en",
  Konkani: "kok",
  Kui: "or",
  Kumaoni: "hi",
  Kurukh: "hi",
  Kutchi: "gu",
  Ladakhi: "ne",
  Lai: "lus",
  Lambadi: "hi",
  Lepcha: "ne",
  Lotha: "en",
  Magahi: "hi",
  Maithili: "mai",
  Malayalam: "ml",
  Malvi: "hi",
  Manipuri: "mni",
  Marathi: "mr",
  Marwari: "mwr",
  Meitei: "mni",
  Mewari: "hi",
  Mishing: "as",
  Mishmi: "en",
  Mizo: "lus",
  Monpa: "ne",
  Mundari: "sat",
  Nepali: "ne",
  Nicobarese: "en",
  Nimadi: "hi",
  Nyishi: "en",
  Odia: "or",
  Pahari: "hi",
  Punjabi: "pa",
  Santali: "sat",
  Savara: "en",
  Sema: "en",
  Tangkhul: "en",
  Tamil: "ta",
  Telugu: "te",
  Thadou: "en",
  Tulu: "tcy",
  Urdu: "ur",
  English: "en"
};

const API_BASE = () => window.API_URL || "https://vaani-app-ui0z.onrender.com";

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
  const input = String(text || "").trim();
  if (!input) return "en";
  if (/[\u0C00-\u0C7F]/.test(input)) return "te";
  if (/[\u0B80-\u0BFF]/.test(input)) return "ta";
  if (/[\u0C80-\u0CFF]/.test(input)) return "kn";
  if (/[\u0D00-\u0D7F]/.test(input)) return "ml";
  if (/[\u0900-\u097F]/.test(input)) return "hi";
  if (/[\u0980-\u09FF]/.test(input)) return "bn";
  if (/[\u0600-\u06FF]/.test(input)) return "ur";
  return "auto";
}

async function callPipeline(text, targetCode, options = {}) {
  const sourceLanguage = options.sourceLanguage || "auto";
  const { controller, timeoutId } = withTimeout(12000);
  try {
    const response = await fetch(`${API_BASE()}/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        text,
        target_language: targetCode,
        from_lang: sourceLanguage,
        options: {
          transliterate: options.transliterate !== false
        }
      })
    });
    clearTimeout(timeoutId);
    if (!response.ok) return null;
    return await response.json();
  } catch (err) {
    clearTimeout(timeoutId);
    return null;
  }
}

export async function translateMessage(text, targetLanguageName, options = {}) {
  const input = String(text || "");
  if (!input.trim()) return null;
  const targetCode = LANGUAGE_CODES[targetLanguageName] || "en";
  const sourceCode = await detectLanguage(input);
  const data = await callPipeline(input, targetCode, {
    sourceLanguage: sourceCode,
    transliterate: true
  });
  if (!data) return null;

  return {
    original: data.original || input,
    transliterated: data.transliterated || "",
    translated: preserveTrailingWhitespace(input, data.translated || input),
    confidence: Number(data.confidence || 0),
    sourceLanguage: data.source_language || sourceCode,
    targetLanguage: data.target_language || targetCode,
    cached: !!data.cached
  };
}

export async function transliterateMessage(text, _targetLanguageName, options = {}) {
  const input = String(text || "");
  if (!input.trim()) return null;
  const sourceCode = await detectLanguage(input);

  const data = await callPipeline(input, options.targetCode || "en", {
    sourceLanguage: sourceCode,
    transliterate: true
  });

  if (!data) {
    return {
      original: input,
      transliterated: "",
      translated: input,
      confidence: 0,
      sourceLanguage: sourceCode,
      targetLanguage: options.targetCode || "en"
    };
  }

  return {
    original: data.original || input,
    transliterated: data.transliterated || "",
    translated: data.translated || input,
    confidence: Number(data.confidence || 0),
    sourceLanguage: data.source_language || sourceCode,
    targetLanguage: data.target_language || (options.targetCode || "en"),
    cached: !!data.cached
  };
}
