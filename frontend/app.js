/* ================================================================
   Vaani — app.js
   Audio strategy:
     1. Auto-play after translation → backend gTTS (reliable, always works)
     2. User taps Play button → gTTS blob replay OR Web Speech API (human voice)
   Word highlight: requestAnimationFrame at 60fps against audio.currentTime
   Navigation: history.pushState + popstate for back/forward
================================================================ */

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
          return data[1].map(w => (w[1]?.[0]) || w[0]).join(" ");
      }
    }
  } catch(e) {}
  return text;
}

async function prepareInputText(text, fromLang) {
  if (!isLikelyRomanized(text, fromLang)) return text;
  showToast(`Converting romanized ${LANG_NAMES[fromLang]}...`);
  return await transliterateToNative(text, fromLang);
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

  let result = null;

  // ── 1. Direct Google Translate (fast, no backend needed) ──
  if (!needsBE) {
    const gtUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${srcGt}&tl=${destGt}&dt=t&q=${encodeURIComponent(q)}`;
    try {
      const res = await fetch(gtUrl, { signal: AbortSignal.timeout(6000) });
      if (res.ok) {
        const d = await res.json();
        const t = d?.[0]?.filter(s => s?.[0]).map(s => s[0]).join("") || "";
        if (t) result = t;
      }
    } catch(e) {}

    // Proxy fallback if direct blocked (some networks)
    if (!result) {
      try {
        const proxied = `https://api.allorigins.win/get?url=${encodeURIComponent(gtUrl)}`;
        const res = await fetch(proxied, { signal: AbortSignal.timeout(9000) });
        if (res.ok) {
          const w = await res.json();
          const d = JSON.parse(w.contents || "null");
          const t = d?.[0]?.filter(s => s?.[0]).map(s => s[0]).join("") || "";
          if (t) result = t;
        }
      } catch(e) {}
    }
  }

  // ── 2. Backend (handles rare/tribal languages) ──
  if (!result) {
    try {
      const res = await fetch(`${API_URL}/translate`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ text:q, from_lang:srcGt, to_lang:destGt }),
        signal: AbortSignal.timeout(30000)
      });
      if (res.ok) {
        const d = await res.json();
        if (d.translated?.trim()) result = d.translated;
      }
    } catch(e) { console.warn("Backend translate failed:", e.message); }
  }

  // ── 3. Auto-detect fallback ──
  if (!result) {
    try {
      const res = await fetch(`${API_URL}/translate`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ text:q, from_lang:"auto", to_lang:destGt }),
        signal: AbortSignal.timeout(30000)
      });
      if (res.ok) {
        const d = await res.json();
        if (d.translated?.trim()) result = d.translated;
      }
    } catch(e) {}
  }

  if (!result) throw new Error(`Translation failed: ${LANG_NAMES[fromLang]||fromLang} → ${LANG_NAMES[toLang]||toLang}. Check connection.`);

  if (_transCache.size > 300) _transCache.delete(_transCache.keys().next().value);
  _transCache.set(cacheKey, result);
  return result;
}

// ── AUDIO: backend gTTS (PRIMARY — works on all devices/browsers) ─────
// Web Speech API is unreliable for auto-play (requires user gesture on mobile)
// Strategy:
//   • Auto-play after translation: fetch gTTS blob, play immediately
//   • Tap Play button: replay blob if available, else re-fetch
//   • Web Speech API: only used if gTTS fetch fails completely AND user tapped Play

async function fetchAudioBlob(text, lang) {
  const ttsLang = LANG_CONFIG[lang]?.ttsCode || lang;
  try {
    const res = await fetch(`${API_URL}/speak`, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ text, lang: ttsLang }),
      signal: AbortSignal.timeout(25000)
    });
    if (!res.ok) { console.warn("gTTS HTTP error:", res.status); return null; }
    const blob = await res.blob();
    if (blob.size < 100) { console.warn("gTTS blob too small"); return null; }
    return blob;
  } catch(e) { console.warn("gTTS fetch error:", e.message); return null; }
}

// ── Web Speech API — ONLY as explicit fallback when user taps Play ─────
const VOICE_LANG_MAP = {
  te:"te-IN", ta:"ta-IN", hi:"hi-IN", kn:"kn-IN", ml:"ml-IN",
  mr:"mr-IN", bn:"bn-IN", gu:"gu-IN", pa:"pa-IN", ur:"ur-IN",
  or:"hi-IN", as:"bn-IN", ne:"ne-NP", sa:"hi-IN", sd:"ur-IN",
  mai:"hi-IN", doi:"hi-IN", kok:"mr-IN", gom:"mr-IN", bho:"hi-IN",
  mwr:"hi-IN", raj:"hi-IN", tcy:"kn-IN", ks:"ur-IN", sat:"bn-IN",
  "mni-Mtei":"bn-IN", brx:"hi-IN", lus:"en-IN", awa:"hi-IN",
  mag:"hi-IN", hne:"hi-IN", bgc:"hi-IN", kha:"en-IN", lep:"ne-NP",
  en:"en-IN"
};

function speakFallback(text, lang, onEnd) {
  if (!window.speechSynthesis) { if (onEnd) onEnd(); return; }
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = VOICE_LANG_MAP[lang] || (lang + "-IN");
  utter.rate = 0.9; utter.pitch = 1; utter.volume = 1;
  // Try to pick the best matching voice
  const voices = window.speechSynthesis.getVoices();
  const tag = utter.lang;
  const prefix = tag.split("-")[0];
  const match = voices.find(v => v.lang === tag) || voices.find(v => v.lang.startsWith(prefix + "-")) || voices.find(v => v.lang.startsWith(prefix));
  if (match) utter.voice = match;
  utter.onend   = () => { if (onEnd) onEnd(); };
  utter.onerror = () => { if (onEnd) onEnd(); };
  window.speechSynthesis.speak(utter);
}

// ── GLOBAL AUDIO STATE ────────────────────────────────
let _audio     = null;   // current HTMLAudioElement
let _audioBlob = null;   // current blob URL source
let _playBtn   = null;   // current play button element
let _containerId = null; // current timeline container id
let _rafId     = null;   // requestAnimationFrame handle
let audioBlobA = null, audioBlobB = null, imgAudioBlob = null;

function _stopAudio() {
  if (_audio) {
    _audio.pause();
    _audio.src = "";  // release memory
    _audio = null;
  }
  if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  // Reset all play buttons to "Play"
  document.querySelectorAll(".ac-btn.ac-primary[data-playing='true']").forEach(btn => {
    btn.dataset.playing = "false";
    btn.innerHTML = `<svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>Play`;
  });
  // Remove all timelines
  document.querySelectorAll(".audio-timeline-wrap").forEach(el => el.remove());
  // Restore word-wrapped text to plain text
  document.querySelectorAll(".rc-text.rc-accent[data-original-text]").forEach(el => {
    el.textContent = el.dataset.originalText;
    delete el.dataset.originalText;
  });
}

// Alias for legacy calls
function stopAllAudio() { _stopAudio(); }

// ── WORD WRAPPING ──────────────────────────────────────
function wrapWords(textEl, cid) {
  const text = textEl.dataset.originalText || textEl.textContent.trim();
  textEl.dataset.originalText = text;
  const words = text.split(/\s+/).filter(Boolean);
  textEl.innerHTML = words.map((w, i) =>
    `<span class="audio-word" data-idx="${i}" onclick="seekToWord(${i},${words.length},'${cid}')">${w}</span>`
  ).join(" ");
  return words;
}

// ── TIMELINE UI ───────────────────────────────────────
function buildTimeline(cid, btnEl) {
  const existing = document.getElementById("timeline_" + cid);
  if (existing) return existing;
  const tw = document.createElement("div");
  tw.id = "timeline_" + cid;
  tw.className = "audio-timeline-wrap";
  tw.innerHTML = `
    <div class="audio-timeline-bar">
      <div class="audio-progress" id="progress_${cid}"></div>
      <input type="range" class="audio-scrubber" id="scrubber_${cid}" min="0" max="100" value="0" step="0.1">
    </div>
    <div class="audio-time-row">
      <span class="audio-time" id="curTime_${cid}">0:00</span>
      <span class="audio-time" id="durTime_${cid}">0:00</span>
    </div>`;
  const card = btnEl?.closest(".result-card, .result-translated");
  if (card) card.appendChild(tw);
  return tw;
}

function setProgress(cid, pct, elapsed) {
  const p = document.getElementById("progress_" + cid); if (p) p.style.width = Math.min(pct,100) + "%";
  const s = document.getElementById("scrubber_"  + cid); if (s) s.value = Math.min(pct,100);
  const c = document.getElementById("curTime_"   + cid); if (c) c.textContent = fmt(elapsed);
}

function fmt(s) {
  if (!isFinite(s) || isNaN(s)) return "0:00";
  return `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,"0")}`;
}

// ── MAIN AUDIO PLAYER ─────────────────────────────────
// Called after fetchAudioBlob returns a blob. Plays it and sets up word sync.
function playBlob(blob, btnEl, translatedText, cid, textElId) {
  // Stop whatever is playing first
  _stopAudio();

  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  _audio = audio;
  _audioBlob = blob;
  _playBtn = btnEl;
  _containerId = cid;

  // Set button to Pause immediately
  btnEl.dataset.playing = "true";
  btnEl.innerHTML = `<svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>Pause`;

  // Wrap words
  const textEl = document.getElementById(textElId);
  if (textEl && !textEl.dataset.originalText) textEl.textContent = translatedText;
  const words = textEl ? wrapWords(textEl, cid) : translatedText.trim().split(/\s+/).filter(Boolean);

  // Build timeline
  buildTimeline(cid, btnEl);
  const scrubber = document.getElementById("scrubber_" + cid);
  if (scrubber) {
    scrubber.addEventListener("input", () => {
      if (audio.duration) audio.currentTime = (scrubber.value / 100) * audio.duration;
    });
  }

  // ── 60fps RAF loop for smooth word tracking ──
  function rafLoop() {
    if (!_audio || _audio !== audio) return;  // guard: this player was stopped
    if (audio.paused || audio.ended) return;
    const dur = audio.duration;
    if (dur > 0) {
      const pct = (audio.currentTime / dur) * 100;
      setProgress(cid, pct, audio.currentTime);
      const wIdx = Math.min(Math.floor((audio.currentTime / dur) * words.length), words.length - 1);
      textEl?.querySelectorAll(".audio-word").forEach((w,i) => w.classList.toggle("active-word", i === wIdx));
    }
    _rafId = requestAnimationFrame(rafLoop);
  }

  audio.addEventListener("loadedmetadata", () => {
    const d = document.getElementById("durTime_" + cid);
    if (d) d.textContent = fmt(audio.duration);
  });

  audio.addEventListener("ended", () => {
    if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
    btnEl.dataset.playing = "false";
    btnEl.innerHTML = `<svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>Play`;
    setProgress(cid, 0, 0);
    textEl?.querySelectorAll(".audio-word").forEach(w => w.classList.remove("active-word"));
    URL.revokeObjectURL(url);
    if (_audio === audio) _audio = null;
  });

  audio.play()
    .then(() => { _rafId = requestAnimationFrame(rafLoop); })
    .catch(err => {
      console.warn("Audio play failed:", err);
      // Autoplay blocked (rare — user hasn't interacted yet). Show toast.
      showToast("Tap Play to hear the translation");
      btnEl.dataset.playing = "false";
      btnEl.innerHTML = `<svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>Play`;
    });
}

window.seekToWord = function(idx, total, cid) {
  if (_audio && _audio.duration) {
    _audio.currentTime = (idx / total) * _audio.duration;
    if (_audio.paused) _audio.play().catch(()=>{});
  }
};

function toggleAudioPlayer(blob, btnEl, text, cid, textElId) {
  if (_audio && _playBtn === btnEl) {
    if (_audio.paused) {
      _audio.play().catch(()=>{});
      btnEl.dataset.playing = "true";
      btnEl.innerHTML = `<svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>Pause`;
      _rafId = requestAnimationFrame(function rafLoop() {
        if (!_audio || _audio.paused || _audio.ended) return;
        const dur = _audio.duration;
        if (dur > 0) {
          setProgress(cid, (_audio.currentTime/dur)*100, _audio.currentTime);
          const textEl = document.getElementById(textElId);
          const wAll = textEl?.querySelectorAll(".audio-word");
          if (wAll?.length) {
            const wIdx = Math.min(Math.floor((_audio.currentTime/dur)*wAll.length), wAll.length-1);
            wAll.forEach((w,i) => w.classList.toggle("active-word", i===wIdx));
          }
        }
        _rafId = requestAnimationFrame(rafLoop);
      });
    } else {
      _audio.pause();
      if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
      btnEl.dataset.playing = "false";
      btnEl.innerHTML = `<svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>Play`;
    }
  } else {
    playBlob(blob, btnEl, text, cid, textElId);
  }
}

// ── THEME ─────────────────────────────────────────────
function toggleTheme() {
  isDarkMode = !isDarkMode;
  document.documentElement.setAttribute("data-theme", isDarkMode ? "dark" : "light");
  const icon = document.getElementById("themeIcon");
  if (isDarkMode) icon.innerHTML = '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
  else icon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
  localStorage.setItem("vaani_theme", isDarkMode ? "dark" : "light");
}

function switchInputMode(mode) {
  document.getElementById("voiceModeBtn").classList.toggle("active", mode === "voice");
  document.getElementById("textModeBtn").classList.toggle("active", mode === "text");
  document.getElementById("voiceInput").style.display = mode === "voice" ? "block" : "none";
  document.getElementById("textInput").style.display  = mode === "text"  ? "block" : "none";
}

// ── COPY / TOAST ─────────────────────────────────────
function copyTranslation() {
  const text = window._singleTranslatedText || _getTranslatedText("translatedText");
  if (text && text !== "—" && !text.startsWith("Translat"))
    navigator.clipboard.writeText(text).then(() => showToast("Copied to clipboard"));
}
function copyText(id) {
  const el = document.getElementById(id);
  const text = el?.dataset.originalText || el?.textContent;
  if (text && text !== "—") navigator.clipboard.writeText(text).then(() => showToast("Copied to clipboard"));
}
function _getTranslatedText(id) {
  const el = document.getElementById(id);
  return el?.dataset.originalText || el?.textContent || "";
}
function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.classList.add("show");
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

// ── NAVIGATION ────────────────────────────────────────
const VALID_PAGES = ["Home","Single","Conversation","Travel","Image","History","Favourites"];

function _showPage(page) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".menu-item").forEach(m => m.classList.remove("active"));
  document.getElementById("page" + page)?.classList.add("active");
  document.getElementById("menu" + page)?.classList.add("active");
  if (page === "Travel")     loadTravelPhrases();
  if (page === "History")    loadHistory?.();
  if (page === "Favourites") loadFavourites?.();
}

function navigateTo(page) {
  if (!VALID_PAGES.includes(page)) page = "Home";
  _showPage(page);
  closeMenu();
  window.scrollTo({ top:0, behavior:"smooth" });
  if (window.location.hash !== "#" + page)
    history.pushState({ page }, "", "#" + page);
}

function restorePageFromHash() {
  const hash = window.location.hash.replace("#","");
  const page = VALID_PAGES.includes(hash) ? hash : "Home";
  _showPage(page);
  history.replaceState({ page }, "", "#" + page);
}

window.addEventListener("popstate", e => {
  const page = e.state?.page || window.location.hash.replace("#","") || "Home";
  if (VALID_PAGES.includes(page)) {
    _showPage(page);
    window.scrollTo({ top:0, behavior:"smooth" });
  }
});

// ── SPEECH RECOGNITION ───────────────────────────────
function getSpeechLang(lang) { return LANG_CONFIG[lang]?.speechCode || (lang + "-IN"); }

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition, recognitionActive = false, silenceTimer = null;
let finalTranscript = "", interimTranscript = "";

function resetSilenceTimer() {
  if (silenceTimer) clearTimeout(silenceTimer);
  silenceTimer = setTimeout(() => { if (recognition && recognitionActive) recognition.stop(); }, 2500);
}

try {
  recognition = new SpeechRecognition();
  recognition.continuous = true; recognition.interimResults = true; recognition.maxAlternatives = 3;
} catch(e) { console.warn("No SpeechRecognition:", e); }

// ── LANG SELECT LISTENERS ─────────────────────────────
document.addEventListener("DOMContentLoaded", () => {

  document.getElementById("toLang")?.addEventListener("change", async () => {
    if (!lastSpokenText) return;
    _resetSingleResults();
    await translateAndSpeak(lastSpokenText, lastFromLang);
  });

  document.getElementById("fromLang")?.addEventListener("change", () => {
    lastSpokenText = ""; lastFromLang = "";
    _resetSingleResults();
  });

  document.getElementById("imgToLang")?.addEventListener("change", async () => {
    const el = document.getElementById("imgExtractedText");
    const extracted = el?.dataset.originalText || el?.textContent;
    if (!extracted || extracted === "—" || document.getElementById("imgResults").style.display === "none") return;
    _stopAudio(); imgAudioBlob = null;
    const tEl = document.getElementById("imgTranslatedText");
    tEl.textContent = "Translating..."; delete tEl.dataset.originalText;
    const fromLang = document.getElementById("imgFromLang").value;
    const toLang   = document.getElementById("imgToLang").value;
    try {
      const translated = await translateText(extracted, fromLang, toLang);
      tEl.textContent = translated; delete tEl.dataset.originalText;
      window._imgTranslatedText = translated;
      const playBtn = document.querySelector("#imgActionBtns .ac-btn.ac-primary");
      _fetchAndPlay(translated, toLang, playBtn, "img", "imgTranslatedText", b => { imgAudioBlob = b; });
    } catch(e) { tEl.textContent = "Translation error: " + e.message; }
  });
});

// Reset Single Mode results to blank
function _resetSingleResults() {
  _stopAudio();
  window._singleAudioBlob = null; window._singleTranslatedText = null;
  const orig  = document.getElementById("originalText");
  const trans = document.getElementById("translatedText");
  if (orig)  orig.textContent = "—";
  if (trans) { trans.innerHTML = ""; trans.textContent = "—"; delete trans.dataset.originalText; }
  document.getElementById("resultsSection").style.display = "none";
  document.getElementById("actionBtns").style.display = "none";
  document.getElementById("micStatus").textContent = "Tap to speak";
  document.getElementById("timeline_single")?.remove();
}

// ── FETCH + PLAY helper (used internally, not exposed) ──
// Fetches gTTS blob and calls playBlob. Also stores blob for replay.
async function _fetchAndPlay(text, lang, btnEl, cid, textElId, storeCb) {
  if (!btnEl) return;
  const blob = await fetchAudioBlob(text, lang);
  if (blob) {
    if (storeCb) storeCb(blob);
    playBlob(blob, btnEl, text, cid, textElId);
  } else {
    // gTTS completely failed — silent fallback, don't crash
    showToast(`Audio unavailable for ${LANG_NAMES[lang]||lang}`);
    btnEl.dataset.playing = "false";
    btnEl.innerHTML = `<svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>Play`;
  }
}

// ── MIC BUTTON ────────────────────────────────────────
function startListening() {
  if (!recognition) { showToast("Speech recognition not supported"); return; }
  if (recognitionActive) { recognition.stop(); return; }
  currentConvSpeaker = null; finalTranscript = ""; interimTranscript = "";
  const fromLang = document.getElementById("fromLang").value;
  recognition.lang = getSpeechLang(fromLang);
  document.getElementById("micBtn").classList.add("listening");
  document.getElementById("micStatus").textContent = "Listening… (tap to stop)";
  document.getElementById("originalText").textContent = "—";
  document.getElementById("translatedText").textContent = "—";
  document.getElementById("resultsSection").style.display = "none";
  _stopAudio();
  try { recognition.start(); recognitionActive = true; resetSilenceTimer(); }
  catch(e) {
    console.warn("Mic start error:", e);
    recognitionActive = false;
    document.getElementById("micStatus").textContent = "Tap to speak";
    document.getElementById("micBtn").classList.remove("listening");
  }
}

function startConvListening(person) {
  if (!recognition) return;
  if (recognitionActive) { recognition.stop(); return; }
  currentConvSpeaker = person; finalTranscript = ""; interimTranscript = "";
  recognition.lang = getSpeechLang(document.getElementById(`convLang${person}`).value);
  document.getElementById(`micBtn${person}`).classList.add("listening");
  document.getElementById(`micStatus${person}`).textContent = "Listening…";
  document.getElementById(`originalText${person}`).textContent = "—";
  document.getElementById(`translatedText${person}`).textContent = "—";
  document.getElementById(`playBtn${person}`).style.display = "none";
  try { recognition.start(); recognitionActive = true; resetSilenceTimer(); }
  catch(e) { console.warn("Mic start error:", e); recognitionActive = false; }
}

if (recognition) {
  recognition.onresult = event => {
    resetSilenceTimer();
    let nf = "", ni = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const r = event.results[i];
      if (r.isFinal) {
        let best = r[0];
        for (let j=1; j<r.length; j++) if (r[j].confidence > best.confidence) best = r[j];
        nf += best.transcript;
      } else ni += r[0].transcript;
    }
    if (nf) finalTranscript += nf;
    interimTranscript = ni;
    const display = (finalTranscript + (ni ? " "+ni : "")).trim();
    if (display) {
      if (currentConvSpeaker) {
        document.getElementById(`originalText${currentConvSpeaker}`).textContent = display;
      } else {
        document.getElementById("originalText").textContent = display;
        document.getElementById("resultsSection").style.display = "block";
      }
    }
  };

  recognition.onend = async () => {
    if (silenceTimer) clearTimeout(silenceTimer);
    recognitionActive = false;
    const spoken = (finalTranscript || interimTranscript).trim();

    if (!spoken) {
      const msg = "No speech detected. Tap to try again.";
      if (currentConvSpeaker) {
        document.getElementById(`micStatus${currentConvSpeaker}`).textContent = msg;
        document.getElementById(`micBtn${currentConvSpeaker}`).classList.remove("listening");
      } else {
        document.getElementById("micStatus").textContent = msg;
        document.getElementById("micBtn").classList.remove("listening");
      }
      return;
    }

    if (currentConvSpeaker) {
      const person = currentConvSpeaker, other = person==="A"?"B":"A";
      const fromLang = document.getElementById(`convLang${person}`).value;
      const toLang   = document.getElementById(`convLang${other}`).value;
      document.getElementById(`originalText${person}`).textContent = spoken;
      document.getElementById(`micStatus${person}`).textContent = "Translating...";
      document.getElementById(`micBtn${person}`).classList.remove("listening");
      await translateAndSpeakConv(spoken, fromLang, toLang, person);
    } else {
      const fromLang = document.getElementById("fromLang").value;
      const text = await prepareInputText(spoken, fromLang);
      lastSpokenText = text; lastFromLang = fromLang;
      document.getElementById("originalText").textContent = text;
      document.getElementById("micStatus").textContent = "Translating...";
      document.getElementById("micBtn").classList.remove("listening");
      document.getElementById("resultsSection").style.display = "block";
      // Hard-reset translated element before new result
      _stopAudio(); window._singleAudioBlob = null; window._singleTranslatedText = null;
      const tEl = document.getElementById("translatedText");
      tEl.innerHTML = ""; tEl.textContent = "Translating..."; delete tEl.dataset.originalText;
      document.getElementById("actionBtns").style.display = "none";
      document.getElementById("timeline_single")?.remove();
      await translateAndSpeak(text, fromLang);
    }
  };

  recognition.onerror = event => {
    if (silenceTimer) clearTimeout(silenceTimer);
    recognitionActive = false;
    const msgs = {
      "no-speech":"No speech heard. Tap to try again.",
      "network":"Network error. Check connection.",
      "not-allowed":"Microphone access denied.",
      "aborted":"Tap to speak"
    };
    const msg = msgs[event.error] || "Error. Tap to try again.";
    if (currentConvSpeaker) {
      document.getElementById(`micStatus${currentConvSpeaker}`).textContent = msg;
      document.getElementById(`micBtn${currentConvSpeaker}`).classList.remove("listening");
    } else {
      document.getElementById("micStatus").textContent = msg;
      document.getElementById("micBtn").classList.remove("listening");
    }
  };
}

// ── TEXT INPUT TRANSLATE ──────────────────────────────
async function translateTypedText() {
  const rawText = document.getElementById("textInputArea").value.trim();
  if (!rawText) return;
  const fromLang = document.getElementById("fromLang").value;
  // Hard-reset before new translation
  _stopAudio(); window._singleAudioBlob = null; window._singleTranslatedText = null;
  const tEl = document.getElementById("translatedText");
  tEl.innerHTML = ""; tEl.textContent = "Translating..."; delete tEl.dataset.originalText;
  document.getElementById("actionBtns").style.display = "none";
  document.getElementById("timeline_single")?.remove();
  const text = await prepareInputText(rawText, fromLang);
  lastSpokenText = text; lastFromLang = fromLang;
  document.getElementById("originalText").textContent = text;
  document.getElementById("resultsSection").style.display = "block";
  await translateAndSpeak(text, fromLang);
}

// ── CORE TRANSLATE + PLAY ─────────────────────────────
async function translateAndSpeak(text, fromLang) {
  const toLang = document.getElementById("toLang").value;
  let translated = null;
  try {
    translated = await translateText(text, fromLang, toLang);
    window._singleTranslatedText = translated;
    // Write translated text cleanly
    const tEl = document.getElementById("translatedText");
    delete tEl.dataset.originalText; tEl.innerHTML = ""; tEl.textContent = translated;
    document.getElementById("actionBtns").style.display = "flex";
    document.getElementById("micStatus").textContent = "Loading audio...";
    // Fetch + play blob
    const btn = document.getElementById("playBtn");
    if (btn) {
      const blob = await fetchAudioBlob(translated, toLang);
      if (blob) {
        window._singleAudioBlob = blob;
        playBlob(blob, btn, translated, "single", "translatedText");
      } else {
        document.getElementById("micStatus").textContent = "Tap Play to hear";
        showToast("Audio loading slow — tap Play");
      }
    }
    document.getElementById("micStatus").textContent = "Tap to speak";
    if (window.getCurrentUser?.()) saveToHistory(text, translated, fromLang, toLang);
  } catch(err) {
    if (!translated) {
      document.getElementById("translatedText").textContent = "Translation error — " + (err.message || "try again.");
      document.getElementById("micStatus").textContent = "Error. Tap to try again.";
    }
  }
}

// Play button tapped by user (always reliable — user gesture = no autoplay block)
function playAudio() {
  const btn  = document.getElementById("playBtn");
  const toLang = document.getElementById("toLang").value;
  const text = window._singleTranslatedText || _getTranslatedText("translatedText");
  if (!btn || !text || text === "—" || text.startsWith("Translat")) return;

  // If we have the blob, toggle it
  if (window._singleAudioBlob) {
    toggleAudioPlayer(window._singleAudioBlob, btn, text, "single", "translatedText");
    return;
  }
  // Blob not ready yet — fetch then play (user gesture = allowed)
  showToast("Loading audio...");
  fetchAudioBlob(text, toLang).then(blob => {
    if (blob) {
      window._singleAudioBlob = blob;
      playBlob(blob, btn, text, "single", "translatedText");
    } else {
      // Web Speech API fallback (user gesture makes this reliable)
      speakFallback(text, toLang, () => {
        btn.dataset.playing = "false";
        btn.innerHTML = `<svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>Play`;
      });
    }
  });
}

// ── CONVERSATION MODE ─────────────────────────────────
async function translateAndSpeakConv(text, fromLang, toLang, person) {
  let translated = null;
  try {
    translated = await translateText(text, fromLang, toLang);
    const tEl = document.getElementById(`translatedText${person}`);
    delete tEl.dataset.originalText; tEl.innerHTML = ""; tEl.textContent = translated;
    const btn = document.getElementById(`playBtn${person}`);
    if (btn) btn.style.display = "flex";
    document.getElementById(`micStatus${person}`).textContent = "Loading audio...";
    window[`_convText${person}`] = translated;
    const blob = await fetchAudioBlob(translated, toLang);
    if (blob) {
      if (person === "A") audioBlobA = blob; else audioBlobB = blob;
      playBlob(blob, btn, translated, `conv${person}`, `translatedText${person}`);
    }
    document.getElementById(`micStatus${person}`).textContent = "Tap to speak";
  } catch(err) {
    if (!translated) document.getElementById(`micStatus${person}`).textContent = "Translation error.";
  }
}

function playAudioA() {
  const tEl = document.getElementById("translatedTextA");
  const text = window._convTextA || _getTranslatedText("translatedTextA");
  const btn  = document.getElementById("playBtnA");
  const toLang = document.getElementById("convLangB").value;
  if (!btn || !text || text === "—") return;
  if (audioBlobA) { toggleAudioPlayer(audioBlobA, btn, text, "convA", "translatedTextA"); return; }
  speakFallback(text, toLang);
}
function playAudioB() {
  const text = window._convTextB || _getTranslatedText("translatedTextB");
  const btn  = document.getElementById("playBtnB");
  const toLang = document.getElementById("convLangA").value;
  if (!btn || !text || text === "—") return;
  if (audioBlobB) { toggleAudioPlayer(audioBlobB, btn, text, "convB", "translatedTextB"); return; }
  speakFallback(text, toLang);
}

// ── SWAP LANGUAGES ────────────────────────────────────
function swapLanguages() {
  const f = document.getElementById("fromLang"), t = document.getElementById("toLang");
  [f.value, t.value] = [t.value, f.value];
  _resetSingleResults(); lastSpokenText = ""; lastFromLang = "";
  showToast("Languages swapped");
}

// ── TRAVEL HELPER ─────────────────────────────────────
const PHRASES = {
  food:      [{en:"I am hungry"},{en:"Give me a menu please"},{en:"How much does this cost?"},{en:"This is delicious!"},{en:"I am vegetarian"},{en:"Water please"},{en:"The bill please"},{en:"No spicy food please"}],
  transport: [{en:"Where is the bus stop?"},{en:"How much is the ticket?"},{en:"Take me to this address"},{en:"Stop here please"},{en:"Is this the right train?"},{en:"Where is the airport?"},{en:"How far is it?"},{en:"Call a taxi please"}],
  hotel:     [{en:"I have a reservation"},{en:"What time is checkout?"},{en:"Can I get extra towels?"},{en:"The AC is not working"},{en:"Is breakfast included?"},{en:"I need a wake up call"},{en:"Where is the lift?"},{en:"Can I extend my stay?"}],
  emergency: [{en:"Help me please!"},{en:"Call the police"},{en:"I need a doctor"},{en:"I am lost"},{en:"Call an ambulance"},{en:"I have been robbed"},{en:"Where is the hospital?"},{en:"I am allergic to this"}],
  shopping:  [{en:"How much does this cost?"},{en:"Can you give a discount?"},{en:"Do you have a smaller size?"},{en:"I am just looking"},{en:"I will take this one"},{en:"Do you accept cards?"},{en:"Can I return this?"},{en:"Where is the trial room?"}]
};
function selectCategory(cat, btn) {
  currentCategory = cat;
  document.querySelectorAll(".cat-btn").forEach(b => b.classList.remove("active")); btn.classList.add("active");
  loadTravelPhrases();
}
async function loadTravelPhrases() {
  const fromLang = document.getElementById("travelFromLang").value;
  const toLang   = document.getElementById("travelToLang").value;
  const key = `${currentCategory}_${fromLang}_${toLang}`;
  document.getElementById("phrasesList").innerHTML = "";
  document.getElementById("travelLoading").style.display = "flex";
  if (travelPhrasesCache[key]) {
    document.getElementById("travelLoading").style.display = "none";
    renderPhrases(travelPhrasesCache[key], fromLang, toLang); return;
  }
  try {
    const results = [];
    for (const phrase of PHRASES[currentCategory]) {
      const [frT, toT] = await Promise.all([translateText(phrase.en,"en",fromLang), translateText(phrase.en,"en",toLang)]);
      results.push({ en:phrase.en, from:frT, to:toT, toLang });
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
  const list = document.getElementById("phrasesList"); list.innerHTML = "";
  results.forEach((r, i) => {
    const card = document.createElement("div"); card.className = "phrase-card";
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
  const p = window._phraseResults[i]; if (!p) return;
  _stopAudio();
  const blob = await fetchAudioBlob(p.to, p.toLang);
  if (blob) new Audio(URL.createObjectURL(blob)).play().catch(()=>{});
  else speakFallback(p.to, p.toLang);
}

// ── IMAGE TRANSLATION ─────────────────────────────────
let currentImageFile = null;
function handleDrop(e) { e.preventDefault(); document.getElementById("uploadArea").classList.remove("drag-over"); const f = e.dataTransfer.files[0]; if (f?.type.startsWith("image/")) processImageFile(f); }
function handleImageUpload(e) { const f = e.target.files[0]; if (f) processImageFile(f); }
function processImageFile(file) {
  currentImageFile = file;
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById("imgPreview").src = e.target.result;
    document.getElementById("uploadArea").style.display = "none";
    document.getElementById("imgPreviewBox").style.display = "block";
    document.getElementById("imgTranslateBtn").style.display = "flex";
    document.getElementById("imgResults").style.display = "none";
    document.getElementById("imgStatus").textContent = "";
    imgAudioBlob = null; _stopAudio(); document.getElementById("timeline_img")?.remove();
  };
  reader.readAsDataURL(file);
}
const BTN_READY_HTML = `<svg viewBox="0 0 24 24" style="width:16px;height:16px;stroke:white;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>Extract & Translate`;
async function translateImage() {
  if (!currentImageFile) { showToast("Please upload an image first"); return; }
  const fromLang = document.getElementById("imgFromLang").value;
  const toLang   = document.getElementById("imgToLang").value;
  const btn = document.getElementById("imgTranslateBtn"), st = document.getElementById("imgStatus");
  btn.disabled = true; btn.textContent = "Reading image..."; st.textContent = "Extracting text...";
  document.getElementById("imgResults").style.display = "none"; _stopAudio(); document.getElementById("timeline_img")?.remove(); imgAudioBlob = null;
  let translated = null;
  try {
    const tessLangs = { en:"eng",hi:"hin",te:"tel",ta:"tam",kn:"kan",ml:"mal",bn:"ben",mr:"mar",gu:"guj",pa:"pan",ur:"urd",or:"ori",as:"asm",ne:"nep",sa:"san",sd:"snd",mai:"hin",doi:"hin",kok:"mar",bho:"hin",mwr:"hin",tcy:"kan",ks:"urd",sat:"ben","mni-Mtei":"ben",lus:"eng",brx:"hin",awa:"hin",mag:"hin",hne:"hin" };
    const worker = await Tesseract.createWorker(tessLangs[fromLang]||"eng", 1, { logger: m => { if (m.status==="recognizing text") st.textContent=`Reading... ${Math.round((m.progress||0)*100)}%`; else if (m.status) st.textContent=m.status[0].toUpperCase()+m.status.slice(1)+"..."; } });
    const { data:{text} } = await worker.recognize(currentImageFile); await worker.terminate();
    const extracted = text.trim();
    if (!extracted || extracted.length < 2) { st.textContent = "No text found. Try a clearer image."; btn.disabled=false; btn.innerHTML=BTN_READY_HTML; return; }
    document.getElementById("imgExtractedText").textContent = extracted; delete document.getElementById("imgExtractedText").dataset.originalText;
    st.textContent = "Translating..."; btn.textContent = "Translating...";
    translated = await translateText(extracted, fromLang, toLang);
    const tEl = document.getElementById("imgTranslatedText"); tEl.textContent = translated; delete tEl.dataset.originalText;
    window._imgTranslatedText = translated;
    document.getElementById("imgResults").style.display = "block"; st.textContent = "Loading audio...";
    const playBtn = document.querySelector("#imgActionBtns .ac-btn.ac-primary");
    const blob = await fetchAudioBlob(translated, toLang);
    if (blob) { imgAudioBlob = blob; playBlob(blob, playBtn, translated, "img", "imgTranslatedText"); }
    st.textContent = "Done ✓";
  } catch(err) { st.textContent = translated ? "Done ✓" : "Error: " + (err.message||"Something went wrong."); if (translated) document.getElementById("imgResults").style.display="block"; }
  btn.disabled = false; btn.innerHTML = BTN_READY_HTML;
}
function playImgAudio() {
  const text = window._imgTranslatedText || _getTranslatedText("imgTranslatedText");
  const btn  = document.querySelector("#imgActionBtns .ac-btn.ac-primary");
  const toLang = document.getElementById("imgToLang").value;
  if (!btn || !text || text === "—") return;
  if (imgAudioBlob) { toggleAudioPlayer(imgAudioBlob, btn, text, "img", "imgTranslatedText"); return; }
  fetchAudioBlob(text, toLang).then(blob => {
    if (blob) { imgAudioBlob = blob; playBlob(blob, btn, text, "img", "imgTranslatedText"); }
    else speakFallback(text, toLang);
  });
}

// ── FAVOURITES ────────────────────────────────────────
window.saveSingleToFavourites = function() {
  const original   = document.getElementById("originalText").textContent;
  const translated = window._singleTranslatedText || _getTranslatedText("translatedText");
  const fromLang   = document.getElementById("fromLang").value;
  const toLang     = document.getElementById("toLang").value;
  if (!original || original === "—") { showToast("Nothing to save"); return; }
  if (!translated || translated === "—" || translated.startsWith("Translat")) { showToast("Wait for translation to complete"); return; }
  window.saveToFavourites?.(original, translated, fromLang, toLang);
};

// ── INIT ─────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  const theme = localStorage.getItem("vaani_theme");
  if (theme === "light") {
    isDarkMode = false; document.documentElement.setAttribute("data-theme","light");
    const icon = document.getElementById("themeIcon");
    if (icon) icon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
  }
  initLanguageSelects();
  restorePageFromHash();
});
