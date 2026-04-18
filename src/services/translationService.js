import { LANGUAGE_CODES } from "../constants/languageCodes.js";

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
    const { controller, timeoutId } = withTimeout(10000);
    const response = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (!response.ok) return null;
    const data = await response.json();
    return data && typeof data.result === "string" ? data : null;
  } catch (err) {
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
