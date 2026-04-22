/**
 * Owns transliteration/normalization utility only.
 * Does not do provider fallback, caching, or pipeline orchestration.
 */
export async function transliterateText(text, _sourceLang) {
  return String(text || "");
}
