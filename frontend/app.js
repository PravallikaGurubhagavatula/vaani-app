const API_URL = "https://vaani-app-ui0z.onrender.com";

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

// ── COMPREHENSIVE LANGUAGE CONFIG ─────────────────────
// All Indian languages + English, covering all states/UTs
const LANG_CONFIG = {
  // Major scheduled languages
  as:         { name: "Assamese",              nonLatin: true,  gtCode: "as",    ttsCode: "bn",   speechCode: "bn-IN"  },
  bn:         { name: "Bengali",               nonLatin: true,  gtCode: "bn",    ttsCode: "bn",   speechCode: "bn-IN"  },
  brx:        { name: "Bodo",                  nonLatin: true,  gtCode: "brx",   ttsCode: "hi",   speechCode: "hi-IN"  },
  doi:        { name: "Dogri",                 nonLatin: true,  gtCode: "doi",   ttsCode: "hi",   speechCode: "hi-IN"  },
  gu:         { name: "Gujarati",              nonLatin: true,  gtCode: "gu",    ttsCode: "gu",   speechCode: "gu-IN"  },
  hi:         { name: "Hindi",                 nonLatin: true,  gtCode: "hi",    ttsCode: "hi",   speechCode: "hi-IN"  },
  kn:         { name: "Kannada",               nonLatin: true,  gtCode: "kn",    ttsCode: "kn",   speechCode: "kn-IN"  },
  ks:         { name: "Kashmiri",              nonLatin: true,  gtCode: "ks",    ttsCode: "ur",   speechCode: "ur-IN"  },
  kok:        { name: "Konkani",               nonLatin: true,  gtCode: "kok",   ttsCode: "mr",   speechCode: "mr-IN"  },
  mai:        { name: "Maithili",              nonLatin: true,  gtCode: "mai",   ttsCode: "hi",   speechCode: "hi-IN"  },
  ml:         { name: "Malayalam",             nonLatin: true,  gtCode: "ml",    ttsCode: "ml",   speechCode: "ml-IN"  },
  "mni-Mtei": { name: "Manipuri (Meitei)",     nonLatin: true,  gtCode: "mni-Mtei", ttsCode: "bn", speechCode: "bn-IN" },
  mr:         { name: "Marathi",               nonLatin: true,  gtCode: "mr",    ttsCode: "mr",   speechCode: "mr-IN"  },
  ne:         { name: "Nepali",                nonLatin: true,  gtCode: "ne",    ttsCode: "ne",   speechCode: "ne-NP"  },
  or:         { name: "Odia (Oriya)",          nonLatin: true,  gtCode: "or",    ttsCode: "hi",   speechCode: "or-IN"  },
  pa:         { name: "Punjabi",               nonLatin: true,  gtCode: "pa",    ttsCode: "pa",   speechCode: "pa-IN"  },
  sa:         { name: "Sanskrit",              nonLatin: true,  gtCode: "sa",    ttsCode: "hi",   speechCode: "hi-IN"  },
  sat:        { name: "Santali",               nonLatin: true,  gtCode: "sat",   ttsCode: "bn",   speechCode: "bn-IN"  },
  sd:         { name: "Sindhi",                nonLatin: true,  gtCode: "sd",    ttsCode: "ur",   speechCode: "ur-IN"  },
  ta:         { name: "Tamil",                 nonLatin: true,  gtCode: "ta",    ttsCode: "ta",   speechCode: "ta-IN"  },
  te:         { name: "Telugu",                nonLatin: true,  gtCode: "te",    ttsCode: "te",   speechCode: "te-IN"  },
  ur:         { name: "Urdu",                  nonLatin: true,  gtCode: "ur",    ttsCode: "ur",   speechCode: "ur-IN"  },
  // Additional regional languages
  bho:        { name: "Bhojpuri",              nonLatin: true,  gtCode: "bho",   ttsCode: "hi",   speechCode: "hi-IN"  },
  mwr:        { name: "Marwari",               nonLatin: true,  gtCode: "mwr",   ttsCode: "hi",   speechCode: "hi-IN"  },
  tcy:        { name: "Tulu",                  nonLatin: true,  gtCode: "tcy",   ttsCode: "kn",   speechCode: "kn-IN"  },
  lus:        { name: "Mizo (Lushai)",         nonLatin: false, gtCode: "lus",   ttsCode: "en",   speechCode: "en-IN"  },
  // State languages with Google Translate support
  awa:        { name: "Awadhi",                nonLatin: true,  gtCode: "hi",    ttsCode: "hi",   speechCode: "hi-IN"  },
  mag:        { name: "Magahi",                nonLatin: true,  gtCode: "hi",    ttsCode: "hi",   speechCode: "hi-IN"  },
  hne:        { name: "Chhattisgarhi",         nonLatin: true,  gtCode: "hi",    ttsCode: "hi",   speechCode: "hi-IN"  },
  bgc:        { name: "Haryanvi",              nonLatin: true,  gtCode: "hi",    ttsCode: "hi",   speechCode: "hi-IN"  },
  raj:        { name: "Rajasthani (Marwari)",  nonLatin: true,  gtCode: "mwr",   ttsCode: "hi",   speechCode: "hi-IN"  },
  gom:        { name: "Goan Konkani",          nonLatin: true,  gtCode: "gom",   ttsCode: "mr",   speechCode: "mr-IN"  },
  // Tribal / smaller languages
  kha:        { name: "Khasi",                 nonLatin: false, gtCode: "kha",   ttsCode: "en",   speechCode: "en-IN"  },
  lep:        { name: "Lepcha",                nonLatin: true,  gtCode: "ne",    ttsCode: "ne",   speechCode: "ne-NP"  },
  // English
  en:         { name: "English",               nonLatin: false, gtCode: "en",    ttsCode: "en",   speechCode: "en-IN"  },
};

// Languages that MUST go to backend (not directly supported by browser gtx)
const BACKEND_ONLY_LANGS = new Set([
  "ks", "brx", "sat", "mwr", "tcy", "mni-Mtei",
  "doi", "kok", "mai", "as", "or", "sa", "bho", "lus",
  "awa", "mag", "hne", "bgc", "raj", "gom", "kha", "lep"
]);

// Language display names
const LANG_NAMES = Object.fromEntries(Object.entries(LANG_CONFIG).map(([k, v]) => [k, v.name]));

// ── LANGUAGE GROUPS FOR SELECT ────────────────────────
const LANG_GROUPS = [
  {
    label: "Major Indian Languages",
    langs: ["te","ta","hi","kn","ml","mr","bn","gu","pa","ur","or","as","ne","sd","mai","bho","sa"]
  },
  {
    label: "Scheduled Languages",
    langs: ["kok","gom","mwr","tcy","lus","ks","doi","brx","sat","mni-Mtei"]
  },
  {
    label: "Regional Languages",
    langs: ["awa","mag","hne","bgc","raj","kha","lep"]
  },
  {
    label: "English",
    langs: ["en"]
  }
];

function buildLangOptions(selectedVal = "en") {
  let html = "";
  LANG_GROUPS.forEach(group => {
    const opts = group.langs
      .filter(code => LANG_CONFIG[code])
      .map(code => `<option value="${code}"${code === selectedVal ? " selected" : ""}>${LANG_CONFIG[code].name}</option>`)
      .join("");
    if (opts) html += `<optgroup label="${group.label}">${opts}</optgroup>`;
  });
  return html;
}

function initLanguageSelects() {
  const defaults = {
    fromLang: "te", toLang: "ta",
    travelFromLang: "te", travelToLang: "ta",
    imgFromLang: "te", imgToLang: "en",
    convLangA: "te", convLangB: "ta"
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

async function transliterateToNative(text, targetLang) {
  const gtCode = LANG_CONFIG[targetLang]?.gtCode || targetLang;
  const url = `https://inputtools.google.com/request?text=${encodeURIComponent(text)}&itc=${gtCode}-t-i0-und&num=1&cp=0&cs=1&ie=utf-8&oe=utf-8&app=demopage`;
  try {
    const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(6000) });
    if (res.ok) {
      const w = await res.json();
      if (w.contents) {
        const data = JSON.parse(w.contents);
        if (data[0] === "SUCCESS" && data[1])
          return data[1].map(w => (w[1] && w[1][0]) ? w[1][0] : w[0]).join(" ");
      }
    }
  } catch (e) {}
  return text;
}

async function prepareInputText(text, fromLang) {
  if (!isLikelyRomanized(text, fromLang)) return text;
  showToast(`Detecting romanized ${LANG_NAMES[fromLang]}...`);
  return await transliterateToNative(text, fromLang);
}

// ── TRANSLATION ───────────────────────────────────────
async function translateText(text, fromLang, toLang) {
  if (!text || !text.trim()) return "";
  const q = text.trim();
  if (fromLang === toLang) return q;

  // Use the Google Translate codes
  const srcGt = LANG_CONFIG[fromLang]?.gtCode || fromLang;
  const destGt = LANG_CONFIG[toLang]?.gtCode || toLang;

  const needsBackend = BACKEND_ONLY_LANGS.has(fromLang) || BACKEND_ONLY_LANGS.has(toLang);

  if (!needsBackend) {
    // Try direct Google Translate (gtx)
    const gtUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${srcGt}&tl=${destGt}&dt=t&q=${encodeURIComponent(q)}`;
    try {
      const res = await fetch(gtUrl, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const d = await res.json();
        if (d && d[0]) {
          const t = d[0].filter(s => s && s[0]).map(s => s[0]).join("");
          if (t) return t;
        }
      }
    } catch (e) {}
    // Try via allorigins proxy
    try {
      const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(gtUrl)}`, { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const w = await res.json();
        if (w.contents) {
          const d = JSON.parse(w.contents);
          if (d && d[0]) {
            const t = d[0].filter(s => s && s[0]).map(s => s[0]).join("");
            if (t) return t;
          }
        }
      }
    } catch (e) {}
  }

  // Backend — handles ALL languages
  try {
    const res = await fetch(`${API_URL}/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: q, from_lang: srcGt, to_lang: destGt }),
      signal: AbortSignal.timeout(30000)
    });
    if (res.ok) {
      const d = await res.json();
      if (d.translated && d.translated.trim()) return d.translated;
      if (d.error) throw new Error(d.error);
    } else {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || `Backend returned ${res.status}`);
    }
  } catch (e) {
    console.warn(`Backend translate failed (${fromLang}→${toLang}):`, e.message);
  }

  // Last resort: try auto-detect source via backend
  try {
    const res = await fetch(`${API_URL}/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: q, from_lang: "auto", to_lang: destGt }),
      signal: AbortSignal.timeout(30000)
    });
    if (res.ok) {
      const d = await res.json();
      if (d.translated && d.translated.trim()) return d.translated;
    }
  } catch (e) {}

  throw new Error(`Translation failed for ${LANG_NAMES[fromLang] || fromLang} → ${LANG_NAMES[toLang] || toLang}. Please check your connection.`);
}

// ── AUDIO ─────────────────────────────────────────────
async function fetchAudio(text, lang) {
  const ttsLang = LANG_CONFIG[lang]?.ttsCode || lang;
  try {
    const res = await fetch(`${API_URL}/speak`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, lang: ttsLang }),
      signal: AbortSignal.timeout(25000)
    });
    if (!res.ok) { console.warn(`Audio fetch failed for lang=${lang}: HTTP ${res.status}`); return null; }
    const blob = await res.blob();
    if (blob.size < 100) { console.warn(`Audio blob too small for lang=${lang}`); return null; }
    return blob;
  } catch (e) {
    console.warn(`Audio fetch error for lang=${lang}:`, e.message);
    return null;
  }
}

// ── GLOBAL AUDIO PLAYER ───────────────────────────────
let currentAudio = null, currentAudioBlob = null, currentPlayBtn = null, currentTimelineId = null;
let audioBlobA = null, audioBlobB = null, imgAudioBlob = null;

function stopAllAudio() {
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
  document.querySelectorAll('.ac-btn.ac-primary').forEach(btn => {
    if (btn.dataset.playing === 'true') {
      btn.dataset.playing = 'false';
      btn.innerHTML = `<svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>Play`;
    }
  });
  document.querySelectorAll('.audio-timeline-wrap').forEach(el => el.remove());
  document.querySelectorAll('.rc-text.rc-accent').forEach(el => {
    if (el.dataset.originalText) { el.textContent = el.dataset.originalText; delete el.dataset.originalText; }
  });
}

function wrapTextIntoWords(textEl, containerId) {
  const text = textEl.dataset.originalText || textEl.textContent.trim();
  textEl.dataset.originalText = text;
  const words = text.split(/\s+/);
  textEl.innerHTML = words.map((w, i) =>
    `<span class="audio-word" data-idx="${i}" onclick="seekToWord(${i},${words.length},'${containerId}')">${w}</span>`
  ).join(' ');
  return words;
}

function createAudioPlayer(blob, btnEl, translatedText, containerId, textElId) {
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
  document.querySelectorAll('.ac-btn.ac-primary').forEach(btn => {
    if (btn !== btnEl && btn.dataset.playing === 'true') {
      btn.dataset.playing = 'false';
      btn.innerHTML = `<svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>Play`;
    }
  });
  document.querySelectorAll('.audio-timeline-wrap').forEach(el => { if (el.id !== 'timeline_' + containerId) el.remove(); });
  document.querySelectorAll('.rc-text.rc-accent').forEach(el => {
    if (el.id !== textElId && el.dataset.originalText) { el.textContent = el.dataset.originalText; delete el.dataset.originalText; }
  });
  if (!blob) return;

  const audio = new Audio(URL.createObjectURL(blob));
  currentAudio = audio; currentAudioBlob = blob; currentPlayBtn = btnEl; currentTimelineId = containerId;
  btnEl.dataset.playing = 'true';
  btnEl.innerHTML = `<svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>Pause`;

  const textEl = document.getElementById(textElId);
  if (textEl && !textEl.dataset.originalText) textEl.textContent = translatedText;
  const words = textEl ? wrapTextIntoWords(textEl, containerId) : translatedText.trim().split(/\s+/);

  let tw = document.getElementById('timeline_' + containerId);
  if (!tw) {
    tw = document.createElement('div');
    tw.id = 'timeline_' + containerId;
    tw.className = 'audio-timeline-wrap';
    tw.innerHTML = `<div class="audio-timeline-bar"><div class="audio-progress" id="progress_${containerId}"></div><input type="range" class="audio-scrubber" id="scrubber_${containerId}" min="0" max="100" value="0" step="0.1"></div><div class="audio-time-row"><span class="audio-time" id="curTime_${containerId}">0:00</span><span class="audio-time" id="durTime_${containerId}">0:00</span></div>`;
    btnEl.closest('.result-card,.result-translated').appendChild(tw);
  }
  const scrubber = document.getElementById('scrubber_' + containerId);
  if (scrubber) scrubber.addEventListener('input', () => { if (audio.duration) audio.currentTime = (scrubber.value / 100) * audio.duration; });
  audio.addEventListener('timeupdate', () => {
    if (!audio.duration) return;
    const pct = (audio.currentTime / audio.duration) * 100;
    const prog = document.getElementById('progress_' + containerId);
    const scr = document.getElementById('scrubber_' + containerId);
    const cur = document.getElementById('curTime_' + containerId);
    if (prog) prog.style.width = pct + '%';
    if (scr) scr.value = pct;
    if (cur) cur.textContent = formatTime(audio.currentTime);
    const wIdx = Math.floor((audio.currentTime / audio.duration) * words.length);
    if (textEl) textEl.querySelectorAll('.audio-word').forEach((w, i) => w.classList.toggle('active-word', i === wIdx));
  });
  audio.addEventListener('loadedmetadata', () => {
    const dur = document.getElementById('durTime_' + containerId);
    if (dur) dur.textContent = formatTime(audio.duration);
  });
  audio.addEventListener('ended', () => {
    btnEl.dataset.playing = 'false';
    btnEl.innerHTML = `<svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>Play`;
    const prog = document.getElementById('progress_' + containerId);
    const scr = document.getElementById('scrubber_' + containerId);
    if (prog) prog.style.width = '0%';
    if (scr) scr.value = 0;
    if (textEl) textEl.querySelectorAll('.audio-word').forEach(w => w.classList.remove('active-word'));
    currentAudio = null;
  });
  audio.play().catch(err => console.warn("Audio play error:", err));
}

window.seekToWord = function (idx, total, containerId) {
  if (currentAudio && currentAudio.duration) {
    currentAudio.currentTime = (idx / total) * currentAudio.duration;
    if (currentAudio.paused) currentAudio.play();
  }
};

function toggleAudio(blob, btnEl, translatedText, containerId, textElId) {
  if (currentAudio && currentPlayBtn === btnEl) {
    if (currentAudio.paused) {
      currentAudio.play();
      btnEl.dataset.playing = 'true';
      btnEl.innerHTML = `<svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>Pause`;
    } else {
      currentAudio.pause();
      btnEl.dataset.playing = 'false';
      btnEl.innerHTML = `<svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>Play`;
    }
  } else {
    createAudioPlayer(blob, btnEl, translatedText, containerId, textElId);
  }
}

function formatTime(s) {
  if (isNaN(s)) return '0:00';
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

// ── THEME ─────────────────────────────────────────────
function toggleTheme() {
  isDarkMode = !isDarkMode;
  document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
  const icon = document.getElementById('themeIcon');
  if (isDarkMode) {
    icon.innerHTML = '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
  } else {
    icon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
  }
  // Persist theme
  localStorage.setItem('vaani_theme', isDarkMode ? 'dark' : 'light');
}

// ── INPUT MODE ────────────────────────────────────────
function switchInputMode(mode) {
  document.getElementById('voiceModeBtn').classList.toggle('active', mode === 'voice');
  document.getElementById('textModeBtn').classList.toggle('active', mode === 'text');
  document.getElementById('voiceInput').style.display = mode === 'voice' ? 'block' : 'none';
  document.getElementById('textInput').style.display = mode === 'text' ? 'block' : 'none';
}

// ── TEXT TRANSLATE ────────────────────────────────────
async function translateTypedText() {
  const rawText = document.getElementById('textInputArea').value.trim();
  if (!rawText) return;
  const fromLang = document.getElementById("fromLang").value;
  const text = await prepareInputText(rawText, fromLang);
  lastSpokenText = text;
  lastFromLang = fromLang;
  document.getElementById("originalText").textContent = text;
  document.getElementById("resultsSection").style.display = "block";
  document.getElementById("translatedText").textContent = "Translating...";
  await translateAndSpeak(text, fromLang);
}

// ── COPY ─────────────────────────────────────────────
function copyTranslation() {
  const text = window._singleTranslatedText
    || document.getElementById("translatedText").dataset.originalText
    || document.getElementById("translatedText").textContent;
  if (text && text !== "—" && !text.startsWith("Translat") && !text.startsWith("error"))
    navigator.clipboard.writeText(text).then(() => showToast("Copied to clipboard"));
}

function copyText(id) {
  const el = document.getElementById(id);
  const text = el.dataset.originalText || el.textContent;
  if (text && text !== "—") navigator.clipboard.writeText(text).then(() => showToast("Copied to clipboard"));
}

function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2500);
}

// ── MENU ─────────────────────────────────────────────
function toggleMenu() {
  document.getElementById("sideMenu").classList.toggle("open");
  document.getElementById("menuOverlay").classList.toggle("open");
  document.body.style.overflow = document.getElementById("sideMenu").classList.contains("open") ? "hidden" : "";
}

function closeMenu() {
  document.getElementById("sideMenu").classList.remove("open");
  document.getElementById("menuOverlay").classList.remove("open");
  document.body.style.overflow = "";
}

// ── PAGE NAVIGATION WITH HASH PERSISTENCE ────────────
const VALID_PAGES = ['Home', 'Single', 'Conversation', 'Travel', 'Image', 'History', 'Favourites'];

function navigateTo(page) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".menu-item").forEach(m => m.classList.remove("active"));
  const pageEl = document.getElementById("page" + page);
  if (pageEl) pageEl.classList.add("active");
  const menuEl = document.getElementById("menu" + page);
  if (menuEl) menuEl.classList.add("active");
  closeMenu();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (page === "Travel") loadTravelPhrases();
  if (page === "History") loadHistory();
  if (page === "Favourites") loadFavourites();
  // Persist page in URL hash
  history.replaceState(null, '', '#' + page);
}

function restorePageFromHash() {
  const hash = window.location.hash.replace('#', '');
  if (hash && VALID_PAGES.includes(hash)) {
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    document.querySelectorAll(".menu-item").forEach(m => m.classList.remove("active"));
    const pageEl = document.getElementById("page" + hash);
    if (pageEl) pageEl.classList.add("active");
    const menuEl = document.getElementById("menu" + hash);
    if (menuEl) menuEl.classList.add("active");
    if (hash === "Travel") loadTravelPhrases();
    if (hash === "History") loadHistory();
    if (hash === "Favourites") loadFavourites();
  } else {
    // Default to Home if no hash
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    document.querySelectorAll(".menu-item").forEach(m => m.classList.remove("active"));
    const homeEl = document.getElementById("pageHome");
    if (homeEl) homeEl.classList.add("active");
    const homeMenu = document.getElementById("menuHome");
    if (homeMenu) homeMenu.classList.add("active");
    history.replaceState(null, '', '#Home');
  }
}

// Handle browser back/forward navigation
window.addEventListener('popstate', () => {
  restorePageFromHash();
});

// ── SPEECH RECOGNITION ───────────────────────────────
function getSpeechLang(langCode) {
  return LANG_CONFIG[langCode]?.speechCode || (langCode + '-IN');
}

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition;
let recognitionActive = false;
let silenceTimer = null;
let finalTranscript = '';
let interimTranscript = '';

const SILENCE_TIMEOUT_MS = 2500;

function resetSilenceTimer() {
  if (silenceTimer) clearTimeout(silenceTimer);
  silenceTimer = setTimeout(() => {
    if (recognition && recognitionActive) recognition.stop();
  }, SILENCE_TIMEOUT_MS);
}

try {
  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 3;
} catch (e) {
  console.warn("SpeechRecognition not supported:", e);
}

// ── LANGUAGE CHANGE HANDLERS ──────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const toLangEl = document.getElementById("toLang");
  const fromLangEl = document.getElementById("fromLang");
  if (toLangEl) {
    toLangEl.addEventListener("change", async () => {
      if (lastSpokenText) {
        stopAllAudio();
        window._singleAudioBlob = null;
        window._singleTranslatedText = null;
        document.getElementById("translatedText").textContent = "Translating...";
        document.getElementById("actionBtns").style.display = "none";
        await translateAndSpeak(lastSpokenText, lastFromLang);
      }
    });
  }
  if (fromLangEl) {
    fromLangEl.addEventListener("change", () => {
      stopAllAudio();
      window._singleAudioBlob = null;
      window._singleTranslatedText = null;
      lastSpokenText = "";
      lastFromLang = "";
      document.getElementById("originalText").textContent = "—";
      document.getElementById("translatedText").textContent = "—";
      document.getElementById("resultsSection").style.display = "none";
      document.getElementById("micStatus").textContent = "Tap to speak";
      const old = document.getElementById('timeline_single');
      if (old) old.remove();
    });
  }
  const imgToLangEl = document.getElementById("imgToLang");
  if (imgToLangEl) {
    imgToLangEl.addEventListener("change", async () => {
      const el = document.getElementById('imgExtractedText');
      const extracted = el.dataset.originalText || el.textContent;
      if (extracted && extracted !== "—" && document.getElementById('imgResults').style.display !== 'none') {
        stopAllAudio();
        imgAudioBlob = null;
        document.getElementById('imgTranslatedText').textContent = "Translating...";
        const fromLang = document.getElementById('imgFromLang').value;
        const toLang = document.getElementById('imgToLang').value;
        try {
          const translated = await translateText(extracted, fromLang, toLang);
          const tEl = document.getElementById('imgTranslatedText');
          tEl.textContent = translated;
          delete tEl.dataset.originalText;
          window._imgTranslatedText = translated;
          imgAudioBlob = await fetchAudio(translated, toLang);
          const playBtn = document.querySelector('#imgActionBtns .ac-btn.ac-primary');
          if (playBtn && imgAudioBlob) {
            const old = document.getElementById('timeline_img');
            if (old) old.remove();
            createAudioPlayer(imgAudioBlob, playBtn, translated, 'img', 'imgTranslatedText');
          }
        } catch (e) {
          document.getElementById('imgTranslatedText').textContent = "Translation error: " + e.message;
        }
      }
    });
  }
});

// ── START LISTENING ───────────────────────────────────
function startListening() {
  if (!recognition) { showToast("Speech recognition not supported in this browser"); return; }
  if (recognitionActive) { recognition.stop(); return; }

  currentConvSpeaker = null;
  finalTranscript = '';
  interimTranscript = '';

  const fromLang = document.getElementById("fromLang").value;
  recognition.lang = getSpeechLang(fromLang);

  document.getElementById("micBtn").classList.add("listening");
  document.getElementById("micStatus").textContent = "Listening… (tap mic to stop early)";
  document.getElementById("originalText").textContent = "—";
  document.getElementById("translatedText").textContent = "—";
  document.getElementById("resultsSection").style.display = "none";
  stopAllAudio();

  try {
    recognition.start();
    recognitionActive = true;
    resetSilenceTimer();
  } catch (e) {
    console.warn("Recognition start error:", e);
    recognitionActive = false;
    document.getElementById("micStatus").textContent = "Tap to speak";
    document.getElementById("micBtn").classList.remove("listening");
  }
}

function startConvListening(person) {
  if (!recognition) return;
  if (recognitionActive) { recognition.stop(); return; }

  currentConvSpeaker = person;
  finalTranscript = '';
  interimTranscript = '';

  const langCode = document.getElementById(`convLang${person}`).value;
  recognition.lang = getSpeechLang(langCode);

  document.getElementById(`micBtn${person}`).classList.add("listening");
  document.getElementById(`micStatus${person}`).textContent = "Listening…";
  document.getElementById(`originalText${person}`).textContent = "—";
  document.getElementById(`translatedText${person}`).textContent = "—";
  document.getElementById(`playBtn${person}`).style.display = "none";

  try {
    recognition.start();
    recognitionActive = true;
    resetSilenceTimer();
  } catch (e) {
    console.warn("Recognition start error:", e);
    recognitionActive = false;
  }
}

if (recognition) {
  recognition.onresult = (event) => {
    resetSilenceTimer();
    let newFinal = '';
    let newInterim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) {
        let bestAlt = result[0];
        for (let j = 1; j < result.length; j++) {
          if (result[j].confidence > bestAlt.confidence) bestAlt = result[j];
        }
        newFinal += bestAlt.transcript;
      } else {
        newInterim += result[0].transcript;
      }
    }
    if (newFinal) finalTranscript += newFinal;
    interimTranscript = newInterim;

    const displayText = (finalTranscript + (interimTranscript ? ' ' + interimTranscript : '')).trim();
    if (displayText) {
      if (currentConvSpeaker) {
        document.getElementById(`originalText${currentConvSpeaker}`).textContent = displayText;
      } else {
        document.getElementById("originalText").textContent = displayText;
        document.getElementById("resultsSection").style.display = "block";
      }
    }
  };

  recognition.onend = async () => {
    if (silenceTimer) clearTimeout(silenceTimer);
    recognitionActive = false;
    const spokenText = (finalTranscript || interimTranscript).trim();

    if (!spokenText) {
      const errMsg = "No speech detected. Tap to try again.";
      if (currentConvSpeaker) {
        document.getElementById(`micStatus${currentConvSpeaker}`).textContent = errMsg;
        document.getElementById(`micBtn${currentConvSpeaker}`).classList.remove("listening");
      } else {
        document.getElementById("micStatus").textContent = errMsg;
        document.getElementById("micBtn").classList.remove("listening");
      }
      return;
    }

    if (currentConvSpeaker) {
      const person = currentConvSpeaker;
      const other = person === 'A' ? 'B' : 'A';
      const fromLang = document.getElementById(`convLang${person}`).value;
      const toLang = document.getElementById(`convLang${other}`).value;
      document.getElementById(`originalText${person}`).textContent = spokenText;
      document.getElementById(`micStatus${person}`).textContent = "Translating...";
      document.getElementById(`micBtn${person}`).classList.remove("listening");
      await translateAndSpeakConv(spokenText, fromLang, toLang, person);
    } else {
      const fromLang = document.getElementById("fromLang").value;
      const text = await prepareInputText(spokenText, fromLang);
      lastSpokenText = text;
      lastFromLang = fromLang;
      document.getElementById("originalText").textContent = text;
      document.getElementById("micStatus").textContent = "Translating...";
      document.getElementById("micBtn").classList.remove("listening");
      document.getElementById("resultsSection").style.display = "block";
      document.getElementById("translatedText").textContent = "Translating...";
      await translateAndSpeak(text, fromLang);
    }
  };

  recognition.onerror = (event) => {
    if (silenceTimer) clearTimeout(silenceTimer);
    recognitionActive = false;
    console.warn("Speech recognition error:", event.error);
    let errMsg = "Error. Tap to try again.";
    if (event.error === 'no-speech') errMsg = "No speech heard. Tap to try again.";
    else if (event.error === 'network') errMsg = "Network error. Check connection.";
    else if (event.error === 'not-allowed') errMsg = "Microphone access denied. Please allow mic.";
    else if (event.error === 'aborted') errMsg = "Tap to speak";

    if (currentConvSpeaker) {
      document.getElementById(`micStatus${currentConvSpeaker}`).textContent = errMsg;
      document.getElementById(`micBtn${currentConvSpeaker}`).classList.remove("listening");
    } else {
      document.getElementById("micStatus").textContent = errMsg;
      document.getElementById("micBtn").classList.remove("listening");
    }
  };
}

// ── TRANSLATE + SPEAK ─────────────────────────────────
async function translateAndSpeak(text, fromLang) {
  const toLang = document.getElementById("toLang").value;
  let translated = null;
  try {
    translated = await translateText(text, fromLang, toLang);
    window._singleTranslatedText = translated;
    const textEl = document.getElementById("translatedText");
    textEl.textContent = translated;
    delete textEl.dataset.originalText;
    document.getElementById("actionBtns").style.display = "flex";

    const ttsLang = LANG_CONFIG[toLang]?.ttsCode || toLang;
    const fallbackNeeded = ttsLang !== toLang;
    document.getElementById("micStatus").textContent = fallbackNeeded
      ? `Loading audio (voice for ${LANG_NAMES[toLang]})...`
      : "Loading audio...";

    const blob = await fetchAudio(translated, toLang);
    window._singleAudioBlob = blob;

    if (!blob) {
      document.getElementById("micStatus").textContent = `Audio unavailable for ${LANG_NAMES[toLang] || toLang}. Translation shown above.`;
    } else {
      document.getElementById("micStatus").textContent = "Tap to speak";
      const old = document.getElementById('timeline_single');
      if (old) old.remove();
      const btn = document.getElementById('playBtn');
      if (btn) createAudioPlayer(blob, btn, translated, 'single', 'translatedText');
    }

    if (window.getCurrentUser && window.getCurrentUser()) saveToHistory(text, translated, fromLang, toLang);
  } catch (err) {
    if (!translated) {
      document.getElementById("translatedText").textContent = "Translation error — " + (err.message || "try again.");
      document.getElementById("micStatus").textContent = "Error. Tap to try again.";
    }
  }
}

function playAudio() {
  const blob = window._singleAudioBlob;
  const text = window._singleTranslatedText;
  const btn = document.getElementById('playBtn');
  if (!btn) return;
  if (!blob) {
    const toLang = document.getElementById("toLang").value;
    if (text && toLang) {
      showToast("Generating audio...");
      fetchAudio(text, toLang).then(b => {
        if (b) { window._singleAudioBlob = b; createAudioPlayer(b, btn, text, 'single', 'translatedText'); }
        else showToast(`Audio not available for ${LANG_NAMES[toLang] || toLang}`);
      });
    }
    return;
  }
  toggleAudio(blob, btn, text, 'single', 'translatedText');
}

async function translateAndSpeakConv(text, fromLang, toLang, person) {
  let translated = null;
  try {
    translated = await translateText(text, fromLang, toLang);
    const textEl = document.getElementById(`translatedText${person}`);
    textEl.textContent = translated;
    delete textEl.dataset.originalText;
    document.getElementById(`playBtn${person}`).style.display = "flex";
    document.getElementById(`micStatus${person}`).textContent = "Loading audio...";

    const blob = await fetchAudio(translated, toLang);
    if (person === 'A') audioBlobA = blob; else audioBlobB = blob;
    window[`_convText${person}`] = translated;

    if (!blob) {
      document.getElementById(`micStatus${person}`).textContent = `Audio unavailable for ${LANG_NAMES[toLang] || toLang}`;
    } else {
      document.getElementById(`micStatus${person}`).textContent = "Tap to speak";
      const btn = document.getElementById(`playBtn${person}`);
      const old = document.getElementById(`timeline_conv${person}`);
      if (old) old.remove();
      if (btn) createAudioPlayer(blob, btn, translated, `conv${person}`, `translatedText${person}`);
    }
  } catch (err) {
    if (!translated) document.getElementById(`micStatus${person}`).textContent = "Translation error. Try again.";
  }
}

function playAudioA() {
  const el = document.getElementById("translatedTextA");
  const text = window._convTextA || el.dataset.originalText || el.textContent;
  const btn = document.getElementById('playBtnA');
  if (!audioBlobA) return;
  toggleAudio(audioBlobA, btn, text, 'convA', 'translatedTextA');
}

function playAudioB() {
  const el = document.getElementById("translatedTextB");
  const text = window._convTextB || el.dataset.originalText || el.textContent;
  const btn = document.getElementById('playBtnB');
  if (!audioBlobB) return;
  toggleAudio(audioBlobB, btn, text, 'convB', 'translatedTextB');
}

// ── SWAP ─────────────────────────────────────────────
function swapLanguages() {
  const f = document.getElementById("fromLang"), t = document.getElementById("toLang");
  [f.value, t.value] = [t.value, f.value];
  lastSpokenText = "";
  lastFromLang = "";
  stopAllAudio();
  window._singleAudioBlob = null;
  window._singleTranslatedText = null;
  document.getElementById("originalText").textContent = "—";
  document.getElementById("translatedText").textContent = "—";
  document.getElementById("resultsSection").style.display = "none";
  document.getElementById("micStatus").textContent = "Tap to speak";
  const old = document.getElementById('timeline_single');
  if (old) old.remove();
  showToast("Languages swapped");
}

// ── TRAVEL ────────────────────────────────────────────
const PHRASES = {
  food:      [{en:"I am hungry"},{en:"Give me a menu please"},{en:"How much does this cost?"},{en:"This is delicious!"},{en:"I am vegetarian"},{en:"Water please"},{en:"The bill please"},{en:"No spicy food please"}],
  transport: [{en:"Where is the bus stop?"},{en:"How much is the ticket?"},{en:"Take me to this address"},{en:"Stop here please"},{en:"Is this the right train?"},{en:"Where is the airport?"},{en:"How far is it?"},{en:"Call a taxi please"}],
  hotel:     [{en:"I have a reservation"},{en:"What time is checkout?"},{en:"Can I get extra towels?"},{en:"The AC is not working"},{en:"Is breakfast included?"},{en:"I need a wake up call"},{en:"Where is the lift?"},{en:"Can I extend my stay?"}],
  emergency: [{en:"Help me please!"},{en:"Call the police"},{en:"I need a doctor"},{en:"I am lost"},{en:"Call an ambulance"},{en:"I have been robbed"},{en:"Where is the hospital?"},{en:"I am allergic to this"}],
  shopping:  [{en:"How much does this cost?"},{en:"Can you give a discount?"},{en:"Do you have a smaller size?"},{en:"I am just looking"},{en:"I will take this one"},{en:"Do you accept cards?"},{en:"Can I return this?"},{en:"Where is the trial room?"}]
};

function selectCategory(cat, btn) {
  currentCategory = cat;
  document.querySelectorAll(".cat-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  loadTravelPhrases();
}

async function loadTravelPhrases() {
  const fromLang = document.getElementById("travelFromLang").value;
  const toLang = document.getElementById("travelToLang").value;
  const key = `${currentCategory}_${fromLang}_${toLang}`;
  document.getElementById("phrasesList").innerHTML = "";
  document.getElementById("travelLoading").style.display = "flex";
  if (travelPhrasesCache[key]) {
    document.getElementById("travelLoading").style.display = "none";
    renderPhrases(travelPhrasesCache[key], fromLang, toLang);
    return;
  }
  try {
    const results = [];
    for (const phrase of PHRASES[currentCategory]) {
      const [frT, toT] = await Promise.all([
        translateText(phrase.en, "en", fromLang),
        translateText(phrase.en, "en", toLang)
      ]);
      results.push({ en: phrase.en, from: frT, to: toT, toLang });
    }
    travelPhrasesCache[key] = results;
    document.getElementById("travelLoading").style.display = "none";
    renderPhrases(results, fromLang, toLang);
  } catch {
    document.getElementById("travelLoading").style.display = "none";
    document.getElementById("phrasesList").innerHTML = `<div class="empty-state"><p class="es-sub">Could not load phrases. Check connection.</p></div>`;
  }
}

function renderPhrases(results, fromLang, toLang) {
  const list = document.getElementById("phrasesList");
  list.innerHTML = "";
  results.forEach((r, i) => {
    const card = document.createElement("div");
    card.className = "phrase-card";
    card.innerHTML = `<div class="phrase-texts"><div class="phrase-orig">${LANG_NAMES[fromLang]}: ${r.from}</div><div class="phrase-trans">${LANG_NAMES[toLang]}: ${r.to}</div><div class="phrase-en">${r.en}</div></div><div class="phrase-btns"><button class="phrase-btn" onclick="copyPhraseText(${i})" title="Copy"><svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button><button class="phrase-btn phrase-play" onclick="playPhrase(${i})" title="Play"><svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg></button></div>`;
    list.appendChild(card);
  });
  window._phraseResults = results;
}

function copyPhraseText(i) {
  const p = window._phraseResults[i];
  if (p) navigator.clipboard.writeText(p.to).then(() => showToast("Copied"));
}

async function playPhrase(i) {
  const p = window._phraseResults[i];
  if (!p) return;
  const blob = await fetchAudio(p.to, p.toLang);
  if (blob) { stopAllAudio(); new Audio(URL.createObjectURL(blob)).play(); }
  else showToast(`Audio unavailable for ${LANG_NAMES[p.toLang] || p.toLang}`);
}

// ── IMAGE TRANSLATION ─────────────────────────────────
let currentImageFile = null;

function handleDrop(e) {
  e.preventDefault();
  document.getElementById('uploadArea').classList.remove('drag-over');
  const f = e.dataTransfer.files[0];
  if (f && f.type.startsWith('image/')) processImageFile(f);
}

function handleImageUpload(e) {
  const f = e.target.files[0];
  if (f) processImageFile(f);
}

function processImageFile(file) {
  currentImageFile = file;
  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById('imgPreview').src = e.target.result;
    document.getElementById('uploadArea').style.display = 'none';
    document.getElementById('imgPreviewBox').style.display = 'block';
    document.getElementById('imgTranslateBtn').style.display = 'flex';
    document.getElementById('imgResults').style.display = 'none';
    document.getElementById('imgStatus').textContent = '';
    imgAudioBlob = null;
    stopAllAudio();
    const old = document.getElementById('timeline_img');
    if (old) old.remove();
  };
  reader.readAsDataURL(file);
}

const BTN_READY_HTML = `<svg viewBox="0 0 24 24" style="width:16px;height:16px;stroke:white;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>Extract & Translate`;

async function translateImage() {
  if (!currentImageFile) { showToast("Please upload an image first"); return; }
  const fromLang = document.getElementById('imgFromLang').value;
  const toLang = document.getElementById('imgToLang').value;
  const btn = document.getElementById('imgTranslateBtn');
  const statusEl = document.getElementById('imgStatus');
  btn.disabled = true;
  btn.textContent = 'Reading image...';
  statusEl.textContent = 'Extracting text from image...';
  document.getElementById('imgResults').style.display = 'none';
  stopAllAudio();
  const old = document.getElementById('timeline_img');
  if (old) old.remove();
  imgAudioBlob = null;
  let translated = null;
  try {
    const tessLangs = {
      en:'eng', hi:'hin', te:'tel', ta:'tam', kn:'kan', ml:'mal', bn:'ben',
      mr:'mar', gu:'guj', pa:'pan', ur:'urd', or:'ori', as:'asm', ne:'nep',
      sa:'san', sd:'snd', mai:'hin', doi:'hin', kok:'mar', bho:'hin',
      mwr:'hin', tcy:'kan', ks:'urd', sat:'ben', "mni-Mtei":'ben',
      lus:'eng', brx:'hin', awa:'hin', mag:'hin', hne:'hin'
    };
    const ocrLang = tessLangs[fromLang] || 'eng';
    statusEl.textContent = 'Loading OCR engine...';
    btn.textContent = 'Loading OCR...';
    const { createWorker } = Tesseract;
    const worker = await createWorker(ocrLang, 1, {
      logger: m => {
        if (m.status === 'recognizing text') statusEl.textContent = `Reading text... ${Math.round((m.progress || 0) * 100)}%`;
        else if (m.status) statusEl.textContent = m.status.charAt(0).toUpperCase() + m.status.slice(1) + '...';
      }
    });
    const { data: { text } } = await worker.recognize(currentImageFile);
    await worker.terminate();
    const extracted = text.trim();
    if (!extracted || extracted.length < 2) {
      statusEl.textContent = 'No text found. Try a clearer image.';
      btn.disabled = false;
      btn.innerHTML = BTN_READY_HTML;
      return;
    }
    document.getElementById('imgExtractedText').textContent = extracted;
    delete document.getElementById('imgExtractedText').dataset.originalText;
    statusEl.textContent = 'Translating...';
    btn.textContent = 'Translating...';
    translated = await translateText(extracted, fromLang, toLang);
    const tEl = document.getElementById('imgTranslatedText');
    tEl.textContent = translated;
    delete tEl.dataset.originalText;
    window._imgTranslatedText = translated;
    document.getElementById('imgResults').style.display = 'block';
    statusEl.textContent = 'Loading audio...';
    imgAudioBlob = await fetchAudio(translated, toLang);
    if (imgAudioBlob) {
      statusEl.textContent = 'Done ✓';
      const playBtn = document.querySelector('#imgActionBtns .ac-btn.ac-primary');
      if (playBtn) createAudioPlayer(imgAudioBlob, playBtn, translated, 'img', 'imgTranslatedText');
    } else {
      statusEl.textContent = `Done ✓ (Audio unavailable for ${LANG_NAMES[toLang] || toLang})`;
    }
  } catch (err) {
    if (!translated) {
      statusEl.textContent = 'Error: ' + (err.message || 'Something went wrong.');
    } else {
      document.getElementById('imgResults').style.display = 'block';
      statusEl.textContent = 'Done ✓';
    }
  }
  btn.disabled = false;
  btn.innerHTML = BTN_READY_HTML;
}

function playImgAudio() {
  const blob = imgAudioBlob;
  const el = document.getElementById('imgTranslatedText');
  const text = window._imgTranslatedText || el.dataset.originalText || el.textContent;
  const btn = document.querySelector('#imgActionBtns .ac-btn.ac-primary');
  if (!blob || !btn) {
    if (window._imgTranslatedText) {
      const toLang = document.getElementById('imgToLang').value;
      showToast("Generating audio...");
      fetchAudio(window._imgTranslatedText, toLang).then(b => {
        if (b) { imgAudioBlob = b; if (btn) toggleAudio(b, btn, window._imgTranslatedText, 'img', 'imgTranslatedText'); }
        else showToast(`Audio unavailable for ${LANG_NAMES[toLang] || toLang}`);
      });
    }
    return;
  }
  toggleAudio(blob, btn, text, 'img', 'imgTranslatedText');
}

// ── SAVE TO FAVOURITES ────────────────────────────────
window.saveSingleToFavourites = function () {
  const original = document.getElementById('originalText').textContent;
  const translated = window._singleTranslatedText
    || document.getElementById('translatedText').dataset.originalText
    || document.getElementById('translatedText').textContent;
  const fromLang = document.getElementById('fromLang').value;
  const toLang = document.getElementById('toLang').value;
  if (!original || original === '—') { showToast("Nothing to save"); return; }
  if (!translated || translated === '—' || translated.startsWith("Translat") || translated.startsWith("error") || translated.startsWith("Translation")) {
    showToast("Wait for translation to complete"); return;
  }
  if (window.saveToFavourites) window.saveToFavourites(original, translated, fromLang, toLang);
};

// ── INIT ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Restore theme
  const savedTheme = localStorage.getItem('vaani_theme');
  if (savedTheme === 'light') {
    isDarkMode = false;
    document.documentElement.setAttribute('data-theme', 'light');
    const icon = document.getElementById('themeIcon');
    if (icon) icon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
  }
  // Init language selects with all languages
  initLanguageSelects();
  // Restore page from URL hash — this is the KEY fix for refresh navigation
  restorePageFromHash();
});
