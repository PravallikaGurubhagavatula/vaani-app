/**
 * Owns translation post-processing only.
 * Does not do provider calls, detection, transliteration, or orchestration.
 */
export function postProcessTranslatedText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}
