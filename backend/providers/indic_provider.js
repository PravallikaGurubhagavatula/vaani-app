/**
 * Owns Indic provider integration only.
 * Does not perform orchestration, caching, language detection, or fallback ordering.
 */
export async function translateWithIndic(text, targetLang) {
  const input = String(text || "").trim();
  if (!input) return null;
  try {
    const response = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: input, targetLang, provider: "indic" })
    });
    if (!response.ok) return null;
    const data = await response.json();
    return typeof data?.result === "string" && data.result.trim() ? data.result : null;
  } catch (_err) {
    return null;
  }
}
