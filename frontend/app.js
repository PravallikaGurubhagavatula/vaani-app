/* ================================================================
   Vaani — app.js  (FIXED: gender voice + romanized translation)
   
   FIXES APPLIED:
   1. Every /speak call now sends gender: getVoiceGender() so the
      backend actually uses the male/female preference.
   2. Gender button state is synced from localStorage on page load.
   3. gTTS fallback notice when male is selected but Bhashini unavailable.
   4. Translation: backend now handles romanized→native transliteration
      server-side (main.py fix), so no change needed here — but the
      translateText() call already sends from_lang correctly.
================================================================ */

const API_URL = "https://vaani-app-ui0z.onrender.com";

// ── USER GENDER PREFERENCE ────────────────────────────
function getVoiceGender() {
  return localStorage.getItem("vaani_voice_gender") || "female";
}
function setVoiceGender(g) {
  localStorage.setItem("vaani_voice_gender", g);
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

// Frontend transliteration (used for real-time preview / voice input)
// The BACKEND now also does this for the actual translation call.
async function transliterateWordByWord(text, targetLang) {
  const gtCode = LANG_CONFIG[targetLang]?.gtCode || targetLang;
  const words = text.trim().split(/\s+/);
  const results = [];
  for (const word of words) {
    if (!word) { results.push(word); continue; }
    const itUrl = `https://inputtools.google.com/request?text=${encodeURIComponent(word)}&itc=${gtCode}-t-i0-und&num=1&cp=0&cs=1&ie=utf-8&oe=utf-8&app=demopage`;
    let got = false;
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
    if (/[^\x00-\x7F]/.test(native)) return native;
  } catch(e) {
    console.warn("[Vaani] Transliteration error:", e);
  }
  // Return as-is — backend will handle the transliteration server-side
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

  // Always send the original from_lang to the backend.
  // The backend (main.py) now handles romanized→native transliteration
  // server-side before calling Google Translate, so the correct meaning
  // is always translated (not just phonetically mapped).
  try {
    const resp = await fetch(`${API_URL}/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: q, from_lang: fromLang, to_lang: toLang }),
      signal: AbortSignal.timeout(20000)
    });
    if (resp.ok) {
      const data = await resp.json();
      if (data.translated) {
        _transCache.set(cacheKey, data.translated);
        return data.translated;
      }
    }
  } catch(e) {
    console.warn("[Vaani] Translation error:", e);
  }
  return "";
}

// ── ─────────────────────────────────────────────────────
// CORE TTS HELPER — THE FIX IS HERE
// Every audio playback call goes through this single function.
// It always sends gender: getVoiceGender() to the backend.
// ── ─────────────────────────────────────────────────────
async function speakText(text, lang) {
  if (!text || !text.trim()) return null;
  const gender = getVoiceGender();  // ← always read current preference

  try {
    const resp = await fetch(`${API_URL}/speak`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // FIX: gender is now always included
      body: JSON.stringify({ text: text.trim(), lang, gender }),
      signal: AbortSignal.timeout(25000)
    });
    if (!resp.ok) throw new Error(`TTS HTTP ${resp.status}`);

    // Inform user when gTTS fallback is used (it has no gender support)
    const engine = resp.headers.get("X-TTS-Engine") || "";
    if (engine.startsWith("gtts") && gender === "male") {
      showToast("👨 Male voice needs Bhashini — using default");
    }

    const blob = await resp.blob();
    const url  = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.onended = () => URL.revokeObjectURL(url);
    return audio;
  } catch (e) {
    console.warn("[Vaani] speakText error:", e);
    return null;
  }
}

// ── AUDIO PLAYBACK STATE ─────────────────────────────
let currentAudio = null;
let currentAudioBlob = null;  // cached so replay doesn't re-fetch

function stopCurrentAudio() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
}

// ── SINGLE MODE: Play button ─────────────────────────
async function playAudio() {
  const text = document.getElementById("translatedText")?.textContent;
  const lang = document.getElementById("toLang")?.value;
  if (!text || text === "—") return;

  stopCurrentAudio();
  document.getElementById("playBtn")?.classList.add("loading");

  const audio = await speakText(text, lang);
  if (audio) {
    currentAudio = audio;
    audio.play();
    // Update play button state
    audio.onended = () => {
      document.getElementById("playBtn")?.classList.remove("loading");
    };
  }
  document.getElementById("playBtn")?.classList.remove("loading");
}

// ── CONVERSATION MODE: Person A play ────────────────
async function playAudioA() {
  const text = document.getElementById("translatedTextA")?.textContent;
  const lang = document.getElementById("convLangB")?.value;  // A speaks, B hears
  if (!text || text === "—") return;
  stopCurrentAudio();
  const audio = await speakText(text, lang);
  if (audio) { currentAudio = audio; audio.play(); }
}

// ── CONVERSATION MODE: Person B play ────────────────
async function playAudioB() {
  const text = document.getElementById("translatedTextB")?.textContent;
  const lang = document.getElementById("convLangA")?.value;  // B speaks, A hears
  if (!text || text === "—") return;
  stopCurrentAudio();
  const audio = await speakText(text, lang);
  if (audio) { currentAudio = audio; audio.play(); }
}

// ── IMAGE TRANSLATION: Play button ───────────────────
async function playImgAudio() {
  const text = document.getElementById("imgTranslatedText")?.textContent;
  const lang = document.getElementById("imgToLang")?.value;
  if (!text || text === "—") return;
  stopCurrentAudio();
  const audio = await speakText(text, lang);
  if (audio) { currentAudio = audio; audio.play(); }
}

// ── TRAVEL PHRASES: Per-phrase play ──────────────────
async function playPhrase(text, lang, btn) {
  if (!text) return;
  stopCurrentAudio();
  if (btn) btn.classList.add("loading");
  const audio = await speakText(text, lang);
  if (audio) {
    currentAudio = audio;
    audio.play();
    audio.onended = () => btn && btn.classList.remove("loading");
  }
  if (btn) btn.classList.remove("loading");
}

// ── SPEECH RECOGNITION ───────────────────────────────
let recognition = null;

function startListening() {
  const fromLang = document.getElementById("fromLang")?.value || "en";
  const speechCode = LANG_CONFIG[fromLang]?.speechCode || "en-US";
  const micBtn = document.getElementById("micBtn");
  const micStatus = document.getElementById("micStatus");

  if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
    showToast("Voice not supported in this browser");
    return;
  }

  if (recognition) { recognition.abort(); recognition = null; }

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SR();
  recognition.lang = speechCode;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  micBtn?.classList.add("listening");
  if (micStatus) micStatus.textContent = "Listening…";

  recognition.onresult = async (e) => {
    const transcript = e.results[0][0].transcript;
    micBtn?.classList.remove("listening");
    if (micStatus) micStatus.textContent = "Translating…";

    document.getElementById("resultsSection").style.display = "block";
    document.getElementById("originalText").textContent = transcript;

    const toLang = document.getElementById("toLang")?.value || "en";
    const translated = await translateText(transcript, fromLang, toLang);
    document.getElementById("translatedText").textContent = translated || "—";
    document.getElementById("actionBtns").style.display = translated ? "flex" : "none";

    if (micStatus) micStatus.textContent = "Tap to speak";
    lastSpokenText = translated;
    lastFromLang = fromLang;

    // Auto-play translation
    if (translated) {
      const audio = await speakText(translated, toLang);
      if (audio) { currentAudio = audio; audio.play(); }
    }

    saveToHistory(transcript, translated, fromLang, toLang);
  };

  recognition.onerror = (e) => {
    micBtn?.classList.remove("listening");
    if (micStatus) micStatus.textContent = "Tap to speak";
    if (e.error !== "aborted") showToast("Mic error: " + e.error);
  };

  recognition.onend = () => {
    micBtn?.classList.remove("listening");
    if (micStatus && micStatus.textContent === "Listening…") {
      micStatus.textContent = "Tap to speak";
    }
  };

  recognition.start();
}

// ── CONVERSATION MODE: start listening ───────────────
async function startConvListening(speaker) {
  const langSelect = speaker === "A" ? "convLangA" : "convLangB";
  const otherLang  = speaker === "A" ? "convLangB" : "convLangA";
  const micBtnId   = `micBtn${speaker}`;
  const micStatusId= `micStatus${speaker}`;
  const origId     = `originalText${speaker}`;
  const transId    = `translatedText${speaker}`;
  const playBtnId  = `playBtn${speaker}`;

  const fromLang   = document.getElementById(langSelect)?.value || "en";
  const toLang     = document.getElementById(otherLang)?.value  || "en";
  const speechCode = LANG_CONFIG[fromLang]?.speechCode || "en-US";
  const micBtn     = document.getElementById(micBtnId);
  const micStatus  = document.getElementById(micStatusId);

  if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
    showToast("Voice not supported in this browser");
    return;
  }

  if (recognition) { recognition.abort(); recognition = null; }

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SR();
  recognition.lang = speechCode;
  recognition.interimResults = false;

  micBtn?.classList.add("listening");
  if (micStatus) micStatus.textContent = "Listening…";
  currentConvSpeaker = speaker;

  recognition.onresult = async (e) => {
    const transcript = e.results[0][0].transcript;
    micBtn?.classList.remove("listening");
    if (micStatus) micStatus.textContent = "Translating…";

    if (document.getElementById(origId))
      document.getElementById(origId).textContent = transcript;

    const translated = await translateText(transcript, fromLang, toLang);
    if (document.getElementById(transId))
      document.getElementById(transId).textContent = translated || "—";

    const playBtn = document.getElementById(playBtnId);
    if (playBtn) playBtn.style.display = translated ? "flex" : "none";

    if (micStatus) micStatus.textContent = "Tap to speak";

    if (translated) {
      const audio = await speakText(translated, toLang);
      if (audio) { currentAudio = audio; audio.play(); }
    }
  };

  recognition.onerror = (e) => {
    micBtn?.classList.remove("listening");
    if (micStatus) micStatus.textContent = "Tap to speak";
    if (e.error !== "aborted") showToast("Mic error: " + e.error);
  };

  recognition.onend = () => {
    micBtn?.classList.remove("listening");
    if (micStatus && micStatus.textContent === "Listening…") {
      micStatus.textContent = "Tap to speak";
    }
  };

  recognition.start();
}

// ── TEXT MODE TRANSLATION ────────────────────────────
async function translateTypedText() {
  const textArea = document.getElementById("textInputArea");
  const raw = textArea?.value?.trim();
  if (!raw) { showToast("Please enter some text"); return; }

  const fromLang = document.getElementById("fromLang")?.value || "en";
  const toLang   = document.getElementById("toLang")?.value   || "en";

  document.getElementById("resultsSection").style.display = "block";
  document.getElementById("originalText").textContent = raw;
  document.getElementById("translatedText").textContent = "…";

  const translated = await translateText(raw, fromLang, toLang);
  document.getElementById("translatedText").textContent = translated || "—";
  document.getElementById("actionBtns").style.display = translated ? "flex" : "none";

  lastSpokenText = translated;
  lastFromLang = fromLang;

  if (translated) {
    const audio = await speakText(translated, toLang);
    if (audio) { currentAudio = audio; audio.play(); }
    saveToHistory(raw, translated, fromLang, toLang);
  }
}

// ── LANGUAGE SWAP ────────────────────────────────────
function swapLanguages() {
  const from = document.getElementById("fromLang");
  const to   = document.getElementById("toLang");
  if (from && to) {
    [from.value, to.value] = [to.value, from.value];
  }
}

// ── INPUT MODE TOGGLE ────────────────────────────────
function switchInputMode(mode) {
  const voiceSection = document.getElementById("voiceInput");
  const textSection  = document.getElementById("textInput");
  const voiceBtn     = document.getElementById("voiceModeBtn");
  const textBtn      = document.getElementById("textModeBtn");

  if (mode === "voice") {
    voiceSection.style.display = "block";
    textSection.style.display  = "none";
    voiceBtn?.classList.add("active");
    textBtn?.classList.remove("active");
  } else {
    voiceSection.style.display = "none";
    textSection.style.display  = "block";
    textBtn?.classList.add("active");
    voiceBtn?.classList.remove("active");
  }
}

// ── COPY ─────────────────────────────────────────────
function copyTranslation() {
  const text = document.getElementById("translatedText")?.textContent;
  if (text && text !== "—") {
    navigator.clipboard.writeText(text).then(() => showToast("Copied!")).catch(() => {});
  }
}

function copyText(id) {
  const text = document.getElementById(id)?.textContent;
  if (text && text !== "—") {
    navigator.clipboard.writeText(text).then(() => showToast("Copied!")).catch(() => {});
  }
}

// ── TRAVEL HELPER ────────────────────────────────────
const TRAVEL_PHRASES = {
  food: [
    { en: "Where is a good restaurant?", key: "food_1" },
    { en: "I am vegetarian.", key: "food_2" },
    { en: "The bill please.", key: "food_3" },
    { en: "Is this spicy?", key: "food_4" },
    { en: "No onion, no garlic please.", key: "food_5" },
    { en: "Water please.", key: "food_6" },
  ],
  transport: [
    { en: "Where is the bus stand?", key: "transport_1" },
    { en: "How much to go to the station?", key: "transport_2" },
    { en: "Stop here please.", key: "transport_3" },
    { en: "Is this the right bus?", key: "transport_4" },
    { en: "I am lost, please help.", key: "transport_5" },
    { en: "Call an auto rickshaw please.", key: "transport_6" },
  ],
  hotel: [
    { en: "Do you have a room available?", key: "hotel_1" },
    { en: "What is the price per night?", key: "hotel_2" },
    { en: "Can I see the room?", key: "hotel_3" },
    { en: "Please clean the room.", key: "hotel_4" },
    { en: "The AC is not working.", key: "hotel_5" },
    { en: "What time is checkout?", key: "hotel_6" },
  ],
  emergency: [
    { en: "Please call the police.", key: "emergency_1" },
    { en: "I need a doctor.", key: "emergency_2" },
    { en: "Where is the hospital?", key: "emergency_3" },
    { en: "I have lost my wallet.", key: "emergency_4" },
    { en: "This is an emergency!", key: "emergency_5" },
    { en: "Help me please!", key: "emergency_6" },
  ],
  shopping: [
    { en: "How much does this cost?", key: "shopping_1" },
    { en: "Can you reduce the price?", key: "shopping_2" },
    { en: "I want to buy this.", key: "shopping_3" },
    { en: "Do you have a smaller size?", key: "shopping_4" },
    { en: "Where is the market?", key: "shopping_5" },
    { en: "Give me a discount.", key: "shopping_6" },
  ],
};

function selectCategory(cat, btn) {
  currentCategory = cat;
  document.querySelectorAll(".cat-btn").forEach(b => b.classList.remove("active"));
  btn?.classList.add("active");
  renderTravelPhrases();
}

async function loadTravelPhrases() {
  travelPhrasesCache = {};
  renderTravelPhrases();
}

async function renderTravelPhrases() {
  const fromLang = document.getElementById("travelFromLang")?.value || "en";
  const toLang   = document.getElementById("travelToLang")?.value   || "en";
  const phrases  = TRAVEL_PHRASES[currentCategory] || [];
  const list     = document.getElementById("phrasesList");
  const loading  = document.getElementById("travelLoading");

  if (!list) return;
  list.innerHTML = "";
  if (loading) loading.style.display = "flex";

  for (const phrase of phrases) {
    const cacheKey = `${phrase.key}_${fromLang}_${toLang}`;
    let fromText = phrase.en, toText = "…";

    // Translate English phrase to "from" language first
    if (fromLang !== "en") {
      fromText = travelPhrasesCache[phrase.key + "_en_" + fromLang]
        || await translateText(phrase.en, "en", fromLang);
      travelPhrasesCache[phrase.key + "_en_" + fromLang] = fromText;
    }

    // Translate to target language
    toText = travelPhrasesCache[cacheKey]
      || await translateText(phrase.en, "en", toLang);
    travelPhrasesCache[cacheKey] = toText;

    const card = document.createElement("div");
    card.className = "phrase-card";
    card.innerHTML = `
      <div class="phrase-texts">
        <div class="phrase-orig">${fromText}</div>
        <div class="phrase-trans">${toText}</div>
        <div class="phrase-en">${phrase.en}</div>
      </div>
      <div class="phrase-btns">
        <button class="phrase-btn phrase-play" title="Play" onclick="playPhrase(${JSON.stringify(toText)}, ${JSON.stringify(toLang)}, this)">
          <svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        </button>
        <button class="phrase-btn" title="Copy" onclick="navigator.clipboard.writeText(${JSON.stringify(toText)}).then(()=>showToast('Copied!'))">
          <svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </button>
      </div>
    `;
    list.appendChild(card);
  }

  if (loading) loading.style.display = "none";
}

// ── IMAGE TRANSLATION ────────────────────────────────
function handleDrop(event) {
  event.preventDefault();
  document.getElementById("uploadArea")?.classList.remove("drag-over");
  const file = event.dataTransfer?.files?.[0];
  if (file) processImageFile(file);
}

function handleImageUpload(event) {
  const file = event.target?.files?.[0];
  if (file) processImageFile(file);
}

function processImageFile(file) {
  if (!file.type.startsWith("image/")) { showToast("Please upload an image file"); return; }
  const reader = new FileReader();
  reader.onload = (e) => {
    const preview = document.getElementById("imgPreview");
    const previewBox = document.getElementById("imgPreviewBox");
    const translateBtn = document.getElementById("imgTranslateBtn");
    if (preview) preview.src = e.target.result;
    if (previewBox) previewBox.style.display = "block";
    if (translateBtn) translateBtn.style.display = "flex";
    document.getElementById("uploadArea").style.display = "none";
  };
  reader.readAsDataURL(file);
}

async function translateImage() {
  const fileInput = document.getElementById("imageInput");
  const cameraInput = document.getElementById("cameraInput");
  const file = fileInput?.files?.[0] || cameraInput?.files?.[0];
  if (!file) { showToast("No image selected"); return; }

  const fromLang = document.getElementById("imgFromLang")?.value || "en";
  const toLang   = document.getElementById("imgToLang")?.value   || "en";
  const status   = document.getElementById("imgStatus");

  if (status) status.textContent = "Extracting text…";
  document.getElementById("imgResults").style.display = "none";

  const formData = new FormData();
  formData.append("file", file);
  formData.append("from_lang", fromLang);
  formData.append("to_lang", toLang);

  try {
    const resp = await fetch(`${API_URL}/image-translate`, {
      method: "POST",
      body: formData,
      signal: AbortSignal.timeout(30000)
    });
    if (!resp.ok) throw new Error(`Server error ${resp.status}`);
    const data = await resp.json();

    document.getElementById("imgExtractedText").textContent = data.extracted || "No text found";
    document.getElementById("imgTranslatedText").textContent = data.translated || "—";
    document.getElementById("imgResults").style.display = "block";
    if (status) status.textContent = "";
  } catch(e) {
    if (status) status.textContent = "Error: " + e.message;
  }
}

// ── HISTORY / FAVOURITES ──────────────────────────────
function saveToHistory(original, translated, fromLang, toLang) {
  try {
    const key = "vaani_history";
    const hist = JSON.parse(localStorage.getItem(key) || "[]");
    hist.unshift({ original, translated, fromLang, toLang, ts: Date.now() });
    if (hist.length > 100) hist.splice(100);
    localStorage.setItem(key, JSON.stringify(hist));
    renderHistory();
  } catch(e) {}
}

function renderHistory() {
  const hist = JSON.parse(localStorage.getItem("vaani_history") || "[]");
  const list = document.getElementById("historyList");
  if (!list) return;
  if (!hist.length) {
    list.innerHTML = `<div class="empty-state"><div class="es-icon"><svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div><p class="es-title">No history yet</p><p class="es-sub">Start translating to see your history here</p></div>`;
    return;
  }
  list.innerHTML = hist.map((h, i) => `
    <div class="hist-card">
      <div class="hist-langs">${LANG_NAMES[h.fromLang]||h.fromLang} → ${LANG_NAMES[h.toLang]||h.toLang}</div>
      <div class="hist-orig">${h.original}</div>
      <div class="hist-trans">${h.translated}</div>
      <div class="hist-actions">
        <button class="hist-btn" onclick="speakText(${JSON.stringify(h.translated)}, ${JSON.stringify(h.toLang)}).then(a=>a&&a.play())">
          <svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>Play
        </button>
        <button class="hist-btn" onclick="navigator.clipboard.writeText(${JSON.stringify(h.translated)}).then(()=>showToast('Copied!'))">
          <svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>Copy
        </button>
        <button class="hist-btn del" onclick="deleteHistory(${i})">
          <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>Delete
        </button>
      </div>
    </div>
  `).join("");
}

function deleteHistory(index) {
  const hist = JSON.parse(localStorage.getItem("vaani_history") || "[]");
  hist.splice(index, 1);
  localStorage.setItem("vaani_history", JSON.stringify(hist));
  renderHistory();
}

function saveSingleToFavourites() {
  const original   = document.getElementById("originalText")?.textContent;
  const translated = document.getElementById("translatedText")?.textContent;
  const fromLang   = document.getElementById("fromLang")?.value;
  const toLang     = document.getElementById("toLang")?.value;
  if (!translated || translated === "—") return;
  saveFavourite(original, translated, fromLang, toLang);
}

function saveFavourite(original, translated, fromLang, toLang) {
  try {
    const key = "vaani_favs";
    const favs = JSON.parse(localStorage.getItem(key) || "[]");
    const exists = favs.some(f => f.original === original && f.toLang === toLang);
    if (exists) { showToast("Already saved!"); return; }
    favs.unshift({ original, translated, fromLang, toLang, ts: Date.now() });
    localStorage.setItem(key, JSON.stringify(favs));
    showToast("⭐ Saved to favourites");
    renderFavourites();
  } catch(e) {}
}

function renderFavourites() {
  const favs = JSON.parse(localStorage.getItem("vaani_favs") || "[]");
  const list = document.getElementById("favouritesList");
  if (!list) return;
  if (!favs.length) {
    list.innerHTML = `<div class="empty-state"><div class="es-icon"><svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></div><p class="es-title">No favourites yet</p><p class="es-sub">Tap the star after a translation to save it here</p></div>`;
    return;
  }
  list.innerHTML = favs.map((f, i) => `
    <div class="hist-card fav-card">
      <div class="hist-langs">${LANG_NAMES[f.fromLang]||f.fromLang} → ${LANG_NAMES[f.toLang]||f.toLang}</div>
      <div class="hist-orig">${f.original}</div>
      <div class="hist-trans">${f.translated}</div>
      <div class="hist-actions">
        <button class="hist-btn" onclick="speakText(${JSON.stringify(f.translated)}, ${JSON.stringify(f.toLang)}).then(a=>a&&a.play())">
          <svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>Play
        </button>
        <button class="hist-btn" onclick="navigator.clipboard.writeText(${JSON.stringify(f.translated)}).then(()=>showToast('Copied!'))">
          <svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/></svg>Copy
        </button>
        <button class="hist-btn del" onclick="deleteFavourite(${i})">
          <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>Delete
        </button>
      </div>
    </div>
  `).join("");
}

function deleteFavourite(index) {
  const favs = JSON.parse(localStorage.getItem("vaani_favs") || "[]");
  favs.splice(index, 1);
  localStorage.setItem("vaani_favs", JSON.stringify(favs));
  renderFavourites();
}

// ── NAVIGATION ────────────────────────────────────────
const PAGES = ["Home","Single","Conversation","Travel","Image","History","Favourites"];

function navigateTo(page) {
  PAGES.forEach(p => {
    const el = document.getElementById(`page${p}`);
    if (el) el.classList.toggle("active", p === page);
  });
  PAGES.forEach(p => {
    const item = document.getElementById(`menu${p}`);
    if (item) item.classList.toggle("active", p === page);
  });
  closeMenu();
  history.pushState({ page }, "", `#${page.toLowerCase()}`);

  // Load data when navigating to these pages
  if (page === "Travel") renderTravelPhrases();
  if (page === "History") renderHistory();
  if (page === "Favourites") renderFavourites();
}

window.addEventListener("popstate", (e) => {
  const page = e.state?.page || "Home";
  navigateTo(page);
});

// ── MENU ──────────────────────────────────────────────
function toggleMenu() {
  const menu    = document.getElementById("sideMenu");
  const overlay = document.getElementById("menuOverlay");
  menu?.classList.toggle("open");
  overlay?.classList.toggle("open");
}
function closeMenu() {
  document.getElementById("sideMenu")?.classList.remove("open");
  document.getElementById("menuOverlay")?.classList.remove("open");
}

// ── THEME ─────────────────────────────────────────────
function toggleTheme() {
  const html = document.documentElement;
  const newTheme = html.getAttribute("data-theme") === "dark" ? "light" : "dark";
  html.setAttribute("data-theme", newTheme);
  isDarkMode = newTheme === "dark";
  localStorage.setItem("vaani_theme", newTheme);
}

// ── TOAST ─────────────────────────────────────────────
let toastTimer = null;
function showToast(msg) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2500);
}

// ── FIREBASE (stubs if firebase.js not loaded) ────────
function signInWithGoogle()  { showToast("Sign-in coming soon"); }
function signOutUser()       { showToast("Signed out"); }

// ── INIT ──────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  // Restore theme
  const savedTheme = localStorage.getItem("vaani_theme") || "dark";
  document.documentElement.setAttribute("data-theme", savedTheme);
  isDarkMode = savedTheme === "dark";

  // ── FIX: Sync gender button highlight from localStorage on load ──
  // Without this, the male button would never show as "active" after refresh.
  const savedGender = getVoiceGender();
  document.querySelectorAll(".gender-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.gender === savedGender);
  });

  // Populate all language dropdowns
  initLanguageSelects();

  // Navigate to hash or Home
  const hash = location.hash.replace("#","");
  const startPage = PAGES.find(p => p.toLowerCase() === hash) || "Home";
  navigateTo(startPage);

  // Render stored data
  renderHistory();
  renderFavourites();
});
