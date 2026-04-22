/**
 * Owns language detection utility only.
 * Does not do transliteration, translation-provider calls, or pipeline orchestration.
 */
export async function detectLanguage(text) {
  const input = String(text || "");
  if (!input.trim()) return "auto";
  if (/[\u0C00-\u0C7F]/.test(input)) return "te";
  if (/[\u0B80-\u0BFF]/.test(input)) return "ta";
  if (/[\u0C80-\u0CFF]/.test(input)) return "kn";
  if (/[\u0D00-\u0D7F]/.test(input)) return "ml";
  if (/[\u0980-\u09FF]/.test(input)) return "bn";
  if (/[\u0900-\u097F]/.test(input)) return "hi";
  if (/[A-Za-z]/.test(input)) return "en";
  return "auto";
}
