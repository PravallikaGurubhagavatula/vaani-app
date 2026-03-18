/* ================================================================
   Vaani — app.js
   Audio strategy:
     1. Auto-play after translation → backend gTTS (reliable, always works)
     2. User taps Play button → gTTS blob replay OR Web Speech API (human voice)
   Word highlight: requestAnimationFrame at 60fps against audio.currentTime
   Navigation: history.pushState + popstate for back/forward
================================================================ */

const API_URL = "https://vaani-app-ui0z.onrender.com";

// ── USER GENDER PREFERENCE ────────────────────────────
// Determines which voice (male/female) is used for TTS output.
// Stored in localStorage so it persists across sessions.
// Default: "female"
function getVoiceGender() {
  return localStorage.getItem("vaani_voice_gender") || "female";
}
function setVoiceGender(g) {
  localStorage.setItem("vaani_voice_gender", g);
  // Update UI buttons
  document.querySelectorAll(".gender-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.gender === g);
  });
  showToast(`Voice set to ${g === "male" ? "👨 Male" : "👩 Female"}`);
}

let lastSpokenText = "", lastFromLang = "";
let currentConvSpeaker = null, currentCategory = "food";
let travelPhrasesCache = {}, isDarkMode = true;

// ── KEEP-ALIVE PING ───────────────────────────────────
function pingBackend() {
  fetch(`${API_URL}/ping`, { method: "GET", signal: AbortSignal.timeout(10000) })
    .then(() => console.log("Backend pinged ✓")).catch(() => {});
}
pingBackend();
setInterval(pingBackend, 10 * 60 * 1000);

// ── LANGUAGE CONFIG ───────────────────────────────────
const LANG_CONFIG = {
  as:         { name: "Assamese",             nonLatin: true,  gtCode: "as",       ttsCode: "bn",  speechCode: "bn-IN" },
  bn:         { name: "Bengali",              nonLatin: true,  gtCode: "bn",       ttsCode: "bn",  speechCode: "bn-IN" },
  brx:        { name: "Bodo",                 nonLatin: true,  gtCode: "brx",      ttsCode: "hi",  speechCode: "hi-IN" },
  doi:        { name: "Dogri",                nonLatin: true,  gtCode: "doi",      ttsCode: "hi",  speechCode: "hi-IN" },
  gu:         { name: "Gujarati",             nonLatin: true,  gtCode: "gu",       ttsCode: "gu",  speechCode: "gu-IN" },
  hi:         { name: "Hindi",                nonLatin: true,  gtCode: "hi",       ttsCode: "hi",  speechCode: "hi-IN" },
  kn:         { name: "Kannada",              nonLatin: true,  gtCode: "kn",       ttsCode: "kn",  speechCode: "kn-IN" },
  ks:         { name: "Kashmiri",             nonLatin: true,  gtCode: "ks",       ttsCode: "ur",  speechCode: "ur-IN" },
  kok:        { name: "Konkani",              nonLatin: true,  gtCode: "kok",      ttsCode: "mr",  speechCode: "mr-IN" },
  mai:        { name: "Maithili",             nonLatin: true,  gtCode: "mai",      ttsCode: "hi",  speechCode: "hi-IN" },
  ml:         { name: "Malayalam",            nonLatin: true,  gtCode: "ml",       ttsCode: "ml",  speechCode: "ml-IN" },
  "mni-Mtei": { name: "Manipuri (Meitei)",    nonLatin: true,  gtCode: "mni-Mtei", ttsCode: "bn",  speechCode: "bn-IN" },
  mr:         { name: "Marathi",              nonLatin: true,  gtCode: "mr",       ttsCode: "mr",  speechCode: "mr-IN" },
  ne:         { name: "Nepali",               nonLatin: true,  gtCode: "ne",       ttsCode: "ne",  speechCode: "ne-NP" },
  or:         { name: "Odia (Oriya)",         nonLatin: true,  gtCode: "or",       ttsCode: "hi",  speechCode: "or-IN" },
  pa:         { name: "Punjabi",              nonLatin: true,  gtCode: "pa",       ttsCode: "pa",  speechCode: "pa-IN" },
  sa:         { name: "Sanskrit",             nonLatin: true,  gtCode: "sa",       ttsCode: "hi",  speechCode: "hi-IN" },
  sat:        { name: "Santali",              nonLatin: true,  gtCode: "sat",      ttsCode: "bn",  speechCode: "bn-IN" },
  sd:         { name: "Sindhi",               nonLatin: true,  gtCode: "sd",       ttsCode: "ur",  speechCode: "ur-IN" },
  ta:         { name: "Tamil",                nonLatin: true,  gtCode: "ta",       ttsCode: "ta",  speechCode: "ta-IN" },
  te:         { name: "Telugu",               nonLatin: true,  gtCode: "te",       ttsCode: "te",  speechCode: "te-IN" },
  ur:         { name: "Urdu",                 nonLatin: true,  gtCode: "ur",       ttsCode: "ur",  speechCode: "ur-IN" },
  bho:        { name: "Bhojpuri",             nonLatin: true,  gtCode: "bho",      ttsCode: "hi",  speechCode: "hi-IN" },
  mwr:        { name: "Marwari",              nonLatin: true,  gtCode: "mwr",      ttsCode: "hi",  speechCode: "hi-IN" },
  tcy:        { name: "Tulu",                 nonLatin: true,  gtCode: "tcy",      ttsCode: "kn",  speechCode: "kn-IN" },
  lus:        { name: "Mizo (Lushai)",        nonLatin: false, gtCode: "lus",      ttsCode: "en",  speechCode: "en-IN" },
  awa:        { name: "Awadhi",               nonLatin: true,  gtCode: "hi",       ttsCode: "hi",  speechCode: "hi-IN" },
  mag:        { name: "Magahi",               nonLatin: true,  gtCode: "hi",       ttsCode: "hi",  speechCode: "hi-IN" },
  hne:        { name: "Chhattisgarhi",        nonLatin: true,  gtCode: "hi",       ttsCode: "hi",  speechCode: "hi-IN" },
  bgc:        { name: "Haryanvi",             nonLatin: true,  gtCode: "hi",       ttsCode: "hi",  speechCode: "hi-IN" },
  raj:        { name: "Rajasthani (Marwari)", nonLatin: true,  gtCode: "mwr",      ttsCode: "hi",  speechCode: "hi-IN" },
  gom:        { name: "Goan Konkani",         nonLatin: true,  gtCode: "gom",      ttsCode: "mr",  speechCode: "mr-IN" },
  kha:        { name: "Khasi",                nonLatin: false, gtCode: "kha",      ttsCode: "en",  speechCode: "en-IN" },
  lep:        { name: "Lepcha",               nonLatin: true,  gtCode: "ne",       ttsCode: "ne",  speechCode: "ne-NP" },
  en:         { name: "English",              nonLatin: false, gtCode: "en",       ttsCode: "en",  speechCode: "en-US" },
};

const BACKEND_ONLY_LANGS = new Set([
  "ks","brx","sat","mwr","tcy","mni-Mtei","doi","kok","mai","as","or","sa","bho","lus",
  "awa","mag","hne","bgc","raj","gom","kha","lep"
]);

const LANG_NAMES = Object.fromEntries(Object.entries(LANG_CONFIG).map(([k,v]) => [k, v.name]));

const LANG_GROUPS = [
  { label: "Major Indian Languages", langs: ["te","ta","hi","kn","ml","mr","bn","gu","pa","ur","or","as","ne","sd","mai","bho","sa"] },
  { label: "Scheduled Languages",    langs: ["kok","gom","mwr","tcy","lus","ks","doi","brx","sat","mni-Mtei"] },
  { label: "Regional Languages",     langs: ["awa","mag","hne","bgc","raj","kha","lep"] },
  { label: "English",                langs: ["en"] }
];

function buildLangOptions(selectedVal = "en") {
  let html = "";
  LANG_GROUPS.forEach(g => {
    const opts = g.langs.filter(c => LANG_CONFIG[c])
      .map(c => `<option value="${c}"${c === selectedVal ? " selected" : ""}>${LANG_CONFIG[c].name}</option>`)
      .join("");
    if (opts) html += `<optgroup label="${g.label}">${opts}</optgroup>`;
  });
  return html;
}

function initLanguageSelects() {
  const defaults = {
    fromLang:"te", toLang:"ta",
    travelFromLang:"te", travelToLang:"ta",
    imgFromLang:"te", imgToLang:"en",
    convLangA:"te", convLangB:"ta"
  };
  Object.entries(defaults).forEach(([id, def]) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = buildLangOptions(def);
  });
}

// ── ROMANIZATION ──────────────────────────────────────
function isLikelyRomanized(text, fromLang) {
  if (!LANG_CONFIG[fromLang]?.nonLatin) return false;
  if (/[^\x00-\x7F]/.test(text)) return false;
  return text.trim().length >= 2 && /[a-zA-Z]/.test(text);
}

// Try Google Input Tools word-by-word (direct + proxy fallback)
async function transliterateWordByWord(text, targetLang) {
  const gtCode = LANG_CONFIG[targetLang]?.gtCode || targetLang;
  const words = text.trim().split(/\s+/);
  const results = [];
  for (const word of words) {
    if (!word) { results.push(word); continue; }
    const itUrl = `https://inputtools.google.com/request?text=${encodeURIComponent(word)}&itc=${gtCode}-t-i0-und&num=1&cp=0&cs=1&ie=utf-8&oe=utf-8&app=demopage`;
    let got = false;
    // Try direct (works on desktop Chrome/Edge)
    try {
      const r = await fetch(itUrl, { signal: AbortSignal.timeout(3000) });
      if (r.ok) {
        const d = await r.json();
        if (d[0] === "SUCCESS" && d[1]?.[0]?.[1]?.[0]) {
          results.push(d[1][0][1][0]); got = true;
        }
      }
    } catch(e) {}
    if (got) continue;
    // Proxy fallback (works on mobile where CORS blocks direct)
    try {
      const proxied = "https://api.allorigins.win/get?url=" + encodeURIComponent(itUrl);
      const r2 = await fetch(proxied, { signal: AbortSignal.timeout(5000) });
      if (r2.ok) {
        const w = await r2.json();
        const d = JSON.parse(w.contents || "null");
        if (d?.[0] === "SUCCESS" && d[1]?.[0]?.[1]?.[0]) {
          results.push(d[1][0][1][0]); got = true;
        }
      }
    } catch(e) {}
    if (!got) results.push(word);
  }
  return results.join(" ");
}

async function prepareInputText(text, fromLang) {
  if (!isLikelyRomanized(text, fromLang)) return text;
  showToast(`Converting ${LANG_NAMES[fromLang]}...`);
  try {
    const native = await transliterateWordByWord(text, fromLang);
    // If we got native script (non-ASCII), use it
    if (/[^\x00-\x7F]/.test(native)) return native;
  } catch(e) {
    console.warn("[Vaani] Transliteration error:", e);
  }
  // Fallback: pass as-is — translateText uses auto-detect which
  // correctly handles romanized Indian language input
  return text;
}

// ── TRANSLATION ───────────────────────────────────────
const _transCache = new Map();

async function translateText(text, fromLang, toLang) {
  if (!text?.trim()) return "";
  const q = text.trim();
  if (fromLang === toLang) return q;

  const cacheKey = `${q}|||${fromLang}|||${toLang}`;
  if (_transCache.has(cacheKey)) return _transCache.get(cacheKey);

  const srcGt  = LANG_CONFIG[fromLang]?.gtCode || fromLang;
  const destGt = LANG_CONFIG[toLang]?.gtCode   || toLang;
  const needsBE = BACKEND_ONLY_LANGS.has(fromLang) || BACKEND_ONLY_LANGS.has(toLang);

  // If text is all ASCII but fromLang expects non-Latin script,
  // it means transliteration failed — use "auto" so Google detects it correctly
  const isRomanFallback = LANG_CONFIG[fromLang]?.nonLatin && !/[^
