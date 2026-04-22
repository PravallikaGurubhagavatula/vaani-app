/**
 * Owns the end-to-end translation pipeline orchestration and in-memory cache.
 * Does not inline provider implementations.
 */
import { detectLanguage } from "./utils/language_detection.js";
import { transliterateText } from "./utils/transliteration.js";
import { postProcessTranslatedText } from "./utils/post_processing.js";
import { translateWithSarvam } from "./providers/sarvam_provider.js";
import { translateWithIndic } from "./providers/indic_provider.js";
import { translateWithGoogle } from "./providers/google_provider.js";

const translationCache = new Map();

async function tryProviders(normalizedText, targetLang) {
  try {
    const sarvam = await translateWithSarvam(normalizedText, targetLang);
    if (sarvam) return sarvam;
  } catch (err) {
    console.error("[translation_engine] Sarvam provider failed:", err);
  }

  try {
    const indic = await translateWithIndic(normalizedText, targetLang);
    if (indic) return indic;
  } catch (err) {
    console.error("[translation_engine] Indic provider failed:", err);
  }

  try {
    const google = await translateWithGoogle(normalizedText, targetLang);
    if (google) return google;
  } catch (err) {
    console.error("[translation_engine] Google provider failed:", err);
  }

  return null;
}

export async function translatePipeline(text, targetLang) {
  try {
    const rawText = String(text || "");
    const normalizedTarget = String(targetLang || "").trim();
    const cacheKey = `${rawText}__${normalizedTarget}`;

    if (translationCache.has(cacheKey)) {
      return translationCache.get(cacheKey);
    }

    const detectedLang = await detectLanguage(rawText);
    if (detectedLang === normalizedTarget) {
      translationCache.set(cacheKey, rawText);
      return rawText;
    }

    const normalizedText = await transliterateText(rawText, detectedLang);
    const providerOutput = await tryProviders(normalizedText, normalizedTarget);

    const translated = providerOutput == null ? rawText : postProcessTranslatedText(providerOutput);
    translationCache.set(cacheKey, translated);
    return translated;
  } catch (error) {
    console.error("[translation_engine] translatePipeline failed:", error);
    return String(text || "");
  }
}
