/* ================================================================
   Vaani — app.js  v5.7
   ----------------------------------------------------------------
   Changes from v5.6:
   1.  window.finalTranslate DEFINED — was called everywhere but
       never declared. Now the single entry-point for all translation.
   2.  normalizeInput() integrated — normalizer.js is loaded before
       this file; every user-typed / spoken input is normalised
       before hitting the translation API.
   3.  LANG_CODE_MAP added — maps LANG_CONFIG keys → normalizer codes.
   4.  Conversation mode normalisation — startConvListening now
       normalises both speakers' transcripts.
   5.  Text mode normalisation — translateTypedText + retranslateSpeech
       both normalise before sending.
   6.  Live translation normalisation — _runLiveTranslation normalises.
   7.  onLanguageChange / swapLanguages now route through finalTranslate
       (they already did, but finalTranslate was undefined — fixed).
   8.  _liveArea scoping bug fixed — moved to module scope.
   9.  speechEditBox pre-fill uses correct element reference.
   10. retranslateSpeech: missing saveToHistory after re-translate fixed.
   11. Travel renderTravelPhrases: uses translateText directly (correct —
       travel phrases are English source, not romanised user input).
   12. Auth safety-net timeout reduced from 5000 → 4000 ms.
   13. Audio: stopAudio() called before every new autoPlay to prevent
       stale _curAudio leaking into playAudio() toggle.
   14. Minor: _liveLastText reset on language change so live translate
       fires immediately on the same text after lang switch.
================================================================ */

const API_URL = "https://vaani-app-ui0z.onrender.com";

// ── GLOBAL AUTH STATE ─────────────────────────────────────────────
window.VAANI_AUTH_READY  = false;
window._vaaniCurrentUser = null;

// ── LANGUAGE CONFIG ────────────────────────────────────────────────
const LANG_CONFIG = {
  as:         { name:"Assamese",             nonLatin:true,  gtCode:"as",       ttsCode:"bn",  speechCode:"bn-IN" },
  bn:         { name:"Bengali",              nonLatin:true,  gtCode:"bn",       ttsCode:"bn",  speechCode:"bn-IN" },
  brx:        { name:"Bodo",                 nonLatin:true,  gtCode:"brx",      ttsCode:"hi",  speechCode:"hi-IN" },
  doi:        { name:"Dogri",                nonLatin:true,  gtCode:"doi",      ttsCode:"hi",  speechCode:"hi-IN" },
  gu:         { name:"Gujarati",             nonLatin:true,  gtCode:"gu",       ttsCode:"gu",  speechCode:"gu-IN" },
  hi:         { name:"Hindi",                nonLatin:true,  gtCode:"hi",       ttsCode:"hi",  speechCode:"hi-IN" },
  kn:         { name:"Kannada",              nonLatin:true,  gtCode:"kn",       ttsCode:"kn",  speechCode:"kn-IN" },
  ks:         { name:"Kashmiri",             nonLatin:true,  gtCode:"ks",       ttsCode:"ur",  speechCode:"ur-IN" },
  kok:        { name:"Konkani",              nonLatin:true,  gtCode:"kok",      ttsCode:"mr",  speechCode:"mr-IN" },
  mai:        { name:"Maithili",             nonLatin:true,  gtCode:"mai",      ttsCode:"hi",  speechCode:"hi-IN" },
  ml:         { name:"Malayalam",            nonLatin:true,  gtCode:"ml",       ttsCode:"ml",  speechCode:"ml-IN" },
  "mni-Mtei": { name:"Manipuri (Meitei)",    nonLatin:true,  gtCode:"mni-Mtei", ttsCode:"bn",  speechCode:"bn-IN" },
  mr:         { name:"Marathi",              nonLatin:true,  gtCode:"mr",       ttsCode:"mr",  speechCode:"mr-IN" },
  ne:         { name:"Nepali",               nonLatin:true,  gtCode:"ne",       ttsCode:"ne",  speechCode:"ne-NP" },
  or:         { name:"Odia (Oriya)",         nonLatin:true,  gtCode:"or",       ttsCode:"hi",  speechCode:"or-IN" },
  pa:         { name:"Punjabi",              nonLatin:true,  gtCode:"pa",       ttsCode:"pa",  speechCode:"pa-IN" },
  sa:         { name:"Sanskrit",             nonLatin:true,  gtCode:"sa",       ttsCode:"hi",  speechCode:"hi-IN" },
  sat:        { name:"Santali",              nonLatin:true,  gtCode:"sat",      ttsCode:"bn",  speechCode:"bn-IN" },
  sd:         { name:"Sindhi",               nonLatin:true,  gtCode:"sd",       ttsCode:"ur",  speechCode:"ur-IN" },
  ta:         { name:"Tamil",                nonLatin:true,  gtCode:"ta",       ttsCode:"ta",  speechCode:"ta-IN" },
  te:         { name:"Telugu",               nonLatin:true,  gtCode:"te",       ttsCode:"te",  speechCode:"te-IN" },
  ur:         { name:"Urdu",                 nonLatin:true,  gtCode:"ur",       ttsCode:"ur",  speechCode:"ur-IN" },
  bho:        { name:"Bhojpuri",             nonLatin:true,  gtCode:"bho",      ttsCode:"hi",  speechCode:"hi-IN" },
  mwr:        { name:"Marwari",              nonLatin:true,  gtCode:"mwr",      ttsCode:"hi",  speechCode:"hi-IN" },
  tcy:        { name:"Tulu",                 nonLatin:true,  gtCode:"tcy",      ttsCode:"kn",  speechCode:"kn-IN" },
  lus:        { name:"Mizo (Lushai)",        nonLatin:false, gtCode:"lus",      ttsCode:"en",  speechCode:"en-IN" },
  awa:        { name:"Awadhi",               nonLatin:true,  gtCode:"hi",       ttsCode:"hi",  speechCode:"hi-IN" },
  mag:        { name:"Magahi",               nonLatin:true,  gtCode:"hi",       ttsCode:"hi",  speechCode:"hi-IN" },
  hne:        { name:"Chhattisgarhi",        nonLatin:true,  gtCode:"hi",       ttsCode:"hi",  speechCode:"hi-IN" },
  bgc:        { name:"Haryanvi",             nonLatin:true,  gtCode:"hi",       ttsCode:"hi",  speechCode:"hi-IN" },
  raj:        { name:"Rajasthani (Marwari)", nonLatin:true,  gtCode:"mwr",      ttsCode:"hi",  speechCode:"hi-IN" },
  gom:        { name:"Goan Konkani",         nonLatin:true,  gtCode:"gom",      ttsCode:"mr",  speechCode:"mr-IN" },
  kha:        { name:"Khasi",                nonLatin:false, gtCode:"kha",      ttsCode:"en",  speechCode:"en-IN" },
  lep:        { name:"Lepcha",               nonLatin:true,  gtCode:"ne",       ttsCode:"ne",  speechCode:"ne-NP" },
  en:         { name:"English",              nonLatin:false, gtCode:"en",       ttsCode:"en",  speechCode:"en-US" },
};

const LANG_NAMES = Object.fromEntries(
  Object.entries(LANG_CONFIG).map(([k, v]) => [k, v.name])
);

const LANG_GROUPS = [
  { label:"Major Indian Languages", langs:["te","ta","hi","kn","ml","mr","bn","gu","pa","ur","or","as","ne","sd","mai","bho","sa"] },
  { label:"Scheduled Languages",    langs:["kok","gom","mwr","tcy","lus","ks","doi","brx","sat","mni-Mtei"] },
  { label:"Regional Languages",     langs:["awa","mag","hne","bgc","raj","kha","lep"] },
  { label:"English",                langs:["en"] },
];

// ══════════════════════════════════════════════════════════════════
// FIX 1 — LANG CODE MAP  (normalizer.js lang codes)
// ── Maps every LANG_CONFIG key to the code normalizeInput() expects.
// ══════════════════════════════════════════════════════════════════

const LANG_CODE_MAP = {
  // LANG_CONFIG key → normalizer code
  te:         "te",
  ta:         "ta",
  hi:         "hi",
  kn:         "kn",
  ml:         "ml",
  mr:         "mr",
  bn:         "bn",
  gu:         "gu",
  pa:         "pa",
  ur:         "ur",
  or:         "or",
  as:         "as",
  ne:         "ne",
  sa:         "sa",
  sd:         "ur",   // Sindhi — romanised similar to Urdu
  mai:        "mai",
  doi:        "hi",   // Dogri — close to Hindi romanisation
  kok:        "kok",
  gom:        "kok",  // Goan Konkani — same normaliser as Konkani
  bho:        "bho",
  mwr:        "hi",   // Marwari — fallback to Hindi
  tcy:        "tcy",
  lus:        "lus",
  awa:        "awa",
  mag:        "hi",   // Magahi — fallback
  hne:        "hi",   // Chhattisgarhi — fallback
  bgc:        "har",  // Haryanvi
  raj:        "hi",   // Rajasthani — fallback
  kha:        "kha",
  lep:        "ne",   // Lepcha — fallback Nepali
  brx:        "brx",
  sat:        "sat",
  ks:         "ks",
  "mni-Mtei": "mni",
  en:         "en",
};

// ── DIALECT TONE MAP ───────────────────────────────────────────────
const DIALECT_TONE_MAP = {
  "TN":{ lang:"ta", tone:"Chennai colloquial Tamil" },
  "KA":{ lang:"kn", tone:"Bengaluru Kannada" },
  "AP":{ lang:"te", tone:"Andhra coastal Telugu" },
  "TS":{ lang:"te", tone:"Hyderabad Telugu" },
  "KL":{ lang:"ml", tone:"Kerala formal Malayalam" },
  "MH":{ lang:"mr", tone:"Mumbai Marathi" },
  "GJ":{ lang:"gu", tone:"Ahmedabad Gujarati" },
  "PB":{ lang:"pa", tone:"Punjab Punjabi" },
  "UP":{ lang:"hi", tone:"Awadhi-influenced Hindi" },
  "DL":{ lang:"hi", tone:"Delhi Hindi" },
  "RJ":{ lang:"hi", tone:"Rajasthani-influenced Hindi" },
  "WB":{ lang:"bn", tone:"Kolkata Bengali" },
  "OR":{ lang:"or", tone:"Odia formal" },
  "AS":{ lang:"as", tone:"Assamese regional" },
};

// ── TRANSLATION CACHE ──────────────────────────────────────────────
const _transCache = new Map();
function cacheGet(k)    { return _transCache.get(k); }
function cacheSet(k, v) {
  if (_transCache.size >= 500) _transCache.delete(_transCache.keys().next().value);
  _transCache.set(k, v);
}
function cacheClear() { _transCache.clear(); }

let _userStateCode = null;
let _dialectTone   = null;

async function detectUserLocation() {
  try {
    const r = await fetch("https://ipapi.co/json/", { signal: AbortSignal.timeout(5000) });
    if (r.ok) {
      const d = await r.json();
      if (d.country_code === "IN" && d.region_code) {
        _userStateCode = d.region_code.toUpperCase();
        const dialect  = DIALECT_TONE_MAP[_userStateCode];
        if (dialect) {
          _dialectTone = dialect.tone;
          console.log(`[Vaani] Detected state: ${_userStateCode}, dialect: ${_dialectTone}`);
        }
      }
    }
  } catch (_) {}
}

// ══════════════════════════════════════════════════════════════════
// FIX 2 — window.finalTranslate  (was called everywhere, never defined)
// ──────────────────────────────────────────────────────────────────
// Single entry-point for ALL user-input → translation calls.
// Pipeline:
//   1. Normalise romanised Indian text (normalizer.js)
//   2. Log diff if changed (debug, no-op in prod)
//   3. Call translateText() with the cleaned input
// ══════════════════════════════════════════════════════════════════

window.finalTranslate = async function finalTranslate(userText, fromLang, toLang) {
  const raw = (userText || "").trim();
  if (!raw) return "";
  if (fromLang === toLang) return raw;

  // ── Normalise only romanised Indian-language input ─────────────
  // English and non-Latin scripts skip normalisation.
  // normalizeInput() is defined in normalizer.js (loaded before this file).
  let normalised = raw;
  if (typeof normalizeInput === "function") {
    const normCode = LANG_CODE_MAP[fromLang] || fromLang;
    normalised = normalizeInput(raw, normCode);
    if (normalised !== raw) {
      console.debug(`[Vaani normalizer] "${raw}" → "${normalised}"`);
    }
  }

  return translateText(normalised, fromLang, toLang);
};

// ══════════════════════════════════════════════════════════════════
// PERMISSION SYSTEM
// ══════════════════════════════════════════════════════════════════

const _permissionGranted = { audio: false, video: false };

function _isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function _showPermissionDeniedGuide(type, onRetry) {
  document.getElementById("vaaniPermGuide")?.remove();
  const label = type === "audio" ? "Microphone" : "Camera";
  const modal  = document.createElement("div");
  modal.id = "vaaniPermGuide";
  modal.innerHTML = `
    <div class="vpg-backdrop"></div>
    <div class="vpg-sheet" role="dialog" aria-modal="true" aria-label="${label} Permission">
      <div class="vpg-title">Microphone or Camera access is required to use this feature.</div>
      <div class="vpg-actions">
        <button class="vpg-retry"   id="vpgRetryBtn">Retry</button>
        <button class="vpg-dismiss" id="vpgDismissBtn">Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  requestAnimationFrame(() => modal.classList.add("vpg-open"));
  const close = () => { modal.classList.remove("vpg-open"); setTimeout(() => modal.remove(), 300); };
  modal.querySelector("#vpgDismissBtn").addEventListener("click", close);
  modal.querySelector(".vpg-backdrop").addEventListener("click", close);
  modal.querySelector("#vpgRetryBtn").addEventListener("click", () => {
    close(); setTimeout(() => onRetry(), 200);
  });
}

async function _attemptGetUserMedia(type) {
  if (!navigator.mediaDevices?.getUserMedia) return false;
  const constraints = type === "audio"
    ? { audio: true, video: false }
    : { video: { facingMode: "environment" }, audio: false };
  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    stream.getTracks().forEach(t => t.stop());
    _permissionGranted[type] = true;
    return true;
  } catch (err) {
    console.warn(`[Vaani] getUserMedia(${type}):`, err.name);
    _permissionGranted[type] = false;
    return false;
  }
}

async function handlePermission(type, micStatusId) {
  if (_permissionGranted[type]) return true;
  const setStatus = (msg) => { if (micStatusId) setMicStatus(msg, micStatusId); };
  const iosMode   = _isIOS() || !navigator.permissions;
  if (!iosMode) {
    const permName = type === "audio" ? "microphone" : "camera";
    let state = "prompt";
    try {
      const result = await navigator.permissions.query({ name: permName });
      state = result.state;
      result.addEventListener("change", () => {
        if (result.state === "granted")  { _permissionGranted[type] = true;  document.getElementById("vaaniPermGuide")?.remove(); }
        else if (result.state === "denied") { _permissionGranted[type] = false; }
      }, { once: true });
    } catch (e) { state = "prompt"; }
    if (state === "granted") { _permissionGranted[type] = true; return true; }
    if (state === "denied") {
      return new Promise((resolve) => {
        _showPermissionDeniedGuide(type, async () => {
          setStatus("Checking…");
          const ok = await _attemptGetUserMedia(type);
          resolve(ok);
          if (!ok) _showPermissionDeniedGuide(type, async () => { resolve(await _attemptGetUserMedia(type)); });
        });
      });
    }
  }
  setStatus("Requesting permission…");
  const ok = await _attemptGetUserMedia(type);
  if (ok) return true;
  if (!iosMode) {
    try {
      const permName = type === "audio" ? "microphone" : "camera";
      const result   = await navigator.permissions.query({ name: permName });
      if (result.state === "denied") {
        return new Promise((resolve) => {
          _showPermissionDeniedGuide(type, async () => { setStatus("Checking…"); resolve(await _attemptGetUserMedia(type)); });
        });
      }
    } catch (_) {}
  }
  return new Promise((resolve) => {
    _showPermissionDeniedGuide(type, async () => { setStatus("Checking…"); resolve(await _attemptGetUserMedia(type)); });
  });
}

async function requestMicPermission(micStatusId) {
  return handlePermission("audio", micStatusId || "micStatus");
}

// ══════════════════════════════════════════════════════════════════
// TTS — VOICE SELECTION
// ══════════════════════════════════════════════════════════════════

const TTS_LOCALE_MAP = {
  te:"te-IN", ta:"ta-IN", hi:"hi-IN", kn:"kn-IN", ml:"ml-IN",
  mr:"mr-IN", bn:"bn-IN", gu:"gu-IN", pa:"pa-IN", ur:"ur-IN",
  or:"or-IN", as:"as-IN", ne:"ne-NP", sa:"hi-IN", sd:"ur-IN",
  mai:"hi-IN", doi:"hi-IN", kok:"mr-IN", gom:"mr-IN", bho:"hi-IN",
  mwr:"hi-IN", tcy:"kn-IN", ks:"ur-IN", brx:"hi-IN", sat:"bn-IN",
  "mni-Mtei":"bn-IN", lus:"en-IN", awa:"hi-IN", mag:"hi-IN",
  hne:"hi-IN", bgc:"hi-IN", raj:"hi-IN", kha:"en-IN", lep:"ne-NP",
  en:"en-US",
};

let _voicesLoaded = false;
let _voiceList    = [];

function _loadVoices() {
  return new Promise(resolve => {
    const voices = speechSynthesis.getVoices();
    if (voices.length > 0) { _voiceList = voices; _voicesLoaded = true; resolve(voices); return; }
    const onVoicesChanged = () => {
      _voiceList    = speechSynthesis.getVoices();
      _voicesLoaded = true;
      speechSynthesis.removeEventListener("voiceschanged", onVoicesChanged);
      resolve(_voiceList);
    };
    speechSynthesis.addEventListener("voiceschanged", onVoicesChanged);
    setTimeout(() => { _voiceList = speechSynthesis.getVoices(); _voicesLoaded = true; resolve(_voiceList); }, 1500);
  });
}

async function _getBestVoice(langCode) {
  if (!_voicesLoaded) await _loadVoices();
  const locale     = TTS_LOCALE_MAP[langCode] || "en-US";
  const langPrefix = locale.split("-")[0].toLowerCase();
  let voice = _voiceList.find(v => v.lang.toLowerCase() === locale.toLowerCase());
  if (voice) return voice;
  voice = _voiceList.find(v => v.lang.toLowerCase().startsWith(langPrefix));
  if (voice) return voice;
  voice = _voiceList.find(v => v.lang.toLowerCase().startsWith("en"));
  return voice || null;
}

function _speakBrowser(text, langCode) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const speak = async () => {
    const utterance = new SpeechSynthesisUtterance(text);
    const voice     = await _getBestVoice(langCode);
    if (voice) { utterance.voice = voice; utterance.lang = voice.lang; }
    else { utterance.lang = TTS_LOCALE_MAP[langCode] || "en-US"; }
    utterance.rate = 0.9; utterance.pitch = 1.0; utterance.volume = 1.0;
    window.speechSynthesis.speak(utterance);
  };
  speak().catch(e => console.warn("[Vaani] Browser TTS:", e));
}

// ══════════════════════════════════════════════════════════════════
// TRANSLITERATION PIPELINE
// ══════════════════════════════════════════════════════════════════

function isRomanized(text, fromLang) {
  if (!LANG_CONFIG[fromLang]?.nonLatin) return false;
  const t = (text || "").trim();
  if (t.length < 2) return false;
  if (/[^\x00-\x7F]/.test(t)) return false;
  return /[a-zA-Z]/.test(t);
}

async function transliterateWord(word, gtCode) {
  if (!word) return word;
  const url = `https://inputtools.google.com/request?text=${encodeURIComponent(word)}&itc=${gtCode}-t-i0-und&num=1&cp=0&cs=1&ie=utf-8&oe=utf-8&app=demopage`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (r.ok) {
      const d = await r.json();
      if (d[0] === "SUCCESS" && d[1]?.[0]?.[1]?.[0]) return d[1][0][1][0];
    }
  } catch (_) {}
  return word;
}

async function transliterateToNative(text, fromLang) {
  if (!isRomanized(text, fromLang)) return text;
  const gtCode = LANG_CONFIG[fromLang]?.gtCode || fromLang;
  const words  = text.trim().split(/\s+/);
  const out    = await Promise.all(words.map(w => transliterateWord(w, gtCode)));
  const native = out.join(" ");
  console.log(`[Vaani translit] "${text}" → "${native}"`);
  return native;
}

async function translateText(text, fromLang, toLang) {
  const q = (text || "").trim();
  if (!q || fromLang === toLang) return q || "";
  const ck = `${q}|${fromLang}|${toLang}`;
  if (cacheGet(ck)) return cacheGet(ck);
  let workText = q;
  if (isRomanized(q, fromLang)) {
    setMicStatus("Converting script…");
    workText = await transliterateToNative(q, fromLang);
  }
  const result = await _callTranslate(workText, fromLang, toLang, q);
  if (result) { cacheSet(ck, result); return result; }
  const pivot  = await _pivotTranslate(workText, fromLang, toLang);
  if (pivot)  { cacheSet(ck, pivot);  return pivot; }
  return "";
}

async function _callTranslate(text, fromLang, toLang, originalInput) {
  try {
    const r = await fetch(`${API_URL}/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, from_lang: fromLang, to_lang: toLang }),
      signal: AbortSignal.timeout(22000),
    });
    if (!r.ok) return "";
    const d      = await r.json();
    const result = (d.translated || "").trim();
    if (!result) return "";
    const rLow = result.toLowerCase();
    if (rLow === (originalInput || "").toLowerCase() || rLow === text.toLowerCase()) {
      console.warn("[Vaani] Passthrough detected:", result);
      return "";
    }
    return result;
  } catch (e) {
    console.warn("[Vaani] _callTranslate:", e.message);
    return "";
  }
}

async function _pivotTranslate(text, fromLang, toLang) {
  if (toLang === "en") return "";
  try {
    const r1 = await fetch(`${API_URL}/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, from_lang: fromLang, to_lang: "en" }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r1.ok) return "";
    const d1 = await r1.json();
    const en  = (d1.translated || "").trim();
    if (!en || en.toLowerCase() === text.toLowerCase()) return "";
    if (toLang === "en") return en;
    const r2 = await fetch(`${API_URL}/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: en, from_lang: "en", to_lang: toLang }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r2.ok) return "";
    const d2 = await r2.json();
    return (d2.translated || "").trim();
  } catch (e) {
    console.warn("[Vaani] _pivotTranslate:", e.message);
    return "";
  }
}

// ══════════════════════════════════════════════════════════════════
// AUDIO SYSTEM
// ══════════════════════════════════════════════════════════════════

let _curAudio           = null;
let _audioPlaying       = false;
let _wordHighlightWords = [];
let _wordHighlightEl    = null;
let _wordHighlightRAF   = null;
let _wordHighlightDur   = 0;
let _boundTimeUpdate    = null;
let _boundAudioEnded    = null;
let _timelineSeeking    = false;

function stopAudio() {
  _detachAudioListeners();
  if (_wordHighlightRAF) { cancelAnimationFrame(_wordHighlightRAF); _wordHighlightRAF = null; }
  if (_curAudio) {
    try { _curAudio.pause(); _curAudio.currentTime = 0; } catch (_) {}
    _curAudio = null;
  }
  _audioPlaying = false;
  _updateAllPlayPauseBtns();
}

function _detachAudioListeners() {
  if (_curAudio) {
    if (_boundTimeUpdate) { _curAudio.removeEventListener("timeupdate", _boundTimeUpdate); _boundTimeUpdate = null; }
    if (_boundAudioEnded) { _curAudio.removeEventListener("ended", _boundAudioEnded);      _boundAudioEnded = null; }
  }
}

function pauseAudio() {
  if (_curAudio && _audioPlaying) {
    _curAudio.pause(); _audioPlaying = false; _updateAllPlayPauseBtns();
    if (_wordHighlightRAF) { cancelAnimationFrame(_wordHighlightRAF); _wordHighlightRAF = null; }
  }
}

function resumeAudio() {
  if (_curAudio && !_audioPlaying) {
    _curAudio.play().catch(e => console.warn("[Vaani] resume:", e.message));
    _audioPlaying = true; _updateAllPlayPauseBtns();
    if (_wordHighlightEl) _startWordHighlightLoop(_curAudio);
  }
}

function toggleAudio() {
  if (!_curAudio) return;
  if (_audioPlaying) pauseAudio(); else resumeAudio();
}

function _updateAllPlayPauseBtns() {
  document.querySelectorAll("[data-playpause]").forEach(btn => {
    const icon = _audioPlaying
      ? `<svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`
      : `<svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
    btn.innerHTML = icon + (btn.dataset.playpause === "labeled" ? (_audioPlaying ? "Pause" : "Play") : "");
  });
}

function _fmtTime(sec) {
  if (!isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function _updateSeekFill(bar, pct) {
  bar.style.setProperty("--seek-pct", `${Math.max(0, Math.min(100, pct))}%`);
}

function resetTimeline(suffix) {
  const s   = suffix || "";
  const bar = document.getElementById(`timelineSeek${s}`);
  const cur = document.getElementById(`timelineCurrent${s}`);
  if (bar) { bar.value = 0; _updateSeekFill(bar, 0); }
  if (cur) cur.textContent = "0:00";
}

function showTimeline(suffix) {
  const wrap = document.getElementById(`audioTimeline${suffix || ""}`);
  if (wrap) wrap.style.display = "flex";
}

function _attachTimelineToAudio(audio, suffix) {
  const s     = suffix || "";
  const bar   = document.getElementById(`timelineSeek${s}`);
  const cur   = document.getElementById(`timelineCurrent${s}`);
  const total = document.getElementById(`timelineTotal${s}`);
  if (!bar || !cur || !total) return;
  _detachAudioListeners();
  const setDur = () => { if (total && isFinite(audio.duration)) total.textContent = _fmtTime(audio.duration); };
  if (audio.readyState >= 1) setDur(); else audio.addEventListener("loadedmetadata", setDur, { once: true });
  _boundTimeUpdate = () => {
    if (_timelineSeeking) return;
    const pct = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
    bar.value = pct; _updateSeekFill(bar, pct);
    cur.textContent = _fmtTime(audio.currentTime);
  };
  _boundAudioEnded = () => {
    _audioPlaying = false; _updateAllPlayPauseBtns(); clearWordHighlight();
    bar.value = 0; _updateSeekFill(bar, 0);
    if (cur) cur.textContent = "0:00";
  };
  audio.addEventListener("timeupdate", _boundTimeUpdate);
  audio.addEventListener("ended",      _boundAudioEnded);
}

function _initTimelineControls(suffix) {
  const s   = suffix || "";
  const bar = document.getElementById(`timelineSeek${s}`);
  if (!bar || bar._vaaniInitialized) return;
  bar._vaaniInitialized = true;
  const cur = document.getElementById(`timelineCurrent${s}`);
  bar.addEventListener("input", () => {
    _timelineSeeking = true;
    const pct = parseFloat(bar.value);
    _updateSeekFill(bar, pct);
    if (cur && _curAudio && isFinite(_curAudio.duration))
      cur.textContent = _fmtTime((_curAudio.duration * pct) / 100);
  });
  bar.addEventListener("change", () => {
    if (_curAudio && isFinite(_curAudio.duration))
      _curAudio.currentTime = (_curAudio.duration * parseFloat(bar.value)) / 100;
    _timelineSeeking = false;
    if (_audioPlaying && _curAudio && _curAudio.paused)
      _curAudio.play().catch(e => console.warn("[Vaani] seek-resume:", e.message));
  });
  bar.addEventListener("touchstart", () => { _timelineSeeking = true; }, { passive: true });
  bar.addEventListener("touchend",   () => {
    if (_curAudio && isFinite(_curAudio.duration))
      _curAudio.currentTime = (_curAudio.duration * parseFloat(bar.value)) / 100;
    _timelineSeeking = false;
    if (_audioPlaying && _curAudio && _curAudio.paused) _curAudio.play().catch(() => {});
  });
}

// ── WORD HIGHLIGHTING ─────────────────────────────────────────────

function _tokenizeForHighlight(text) {
  if (!text) return [];
  return text.split(/(\s+)/).map(t => ({ word: t, isWord: /\S/.test(t) }));
}

function _buildHighlightHtml(text) {
  const tokens = _tokenizeForHighlight(text);
  let html = "", wi = 0;
  for (const tok of tokens) {
    if (tok.isWord) { html += `<span class="wh-word" data-wi="${wi}">${_escHtml(tok.word)}</span>`; wi++; }
    else html += tok.word.replace(/\n/g, "<br>");
  }
  return html;
}

function _escHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function startWordHighlight(el, text, audio) {
  if (!el || !text || !audio) return;
  clearWordHighlight();
  const words = text.split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) return;
  _wordHighlightEl    = el;
  _wordHighlightWords = words;
  _wordHighlightDur   = 0;
  el.innerHTML = _buildHighlightHtml(text);
  el.classList.add("wh-active");
  const setDur = () => { _wordHighlightDur = audio.duration || 0; };
  if (audio.readyState >= 1) setDur(); else audio.addEventListener("loadedmetadata", setDur, { once: true });
  _startWordHighlightLoop(audio);
}

function _startWordHighlightLoop(audio) {
  if (_wordHighlightRAF) cancelAnimationFrame(_wordHighlightRAF);
  const words = _wordHighlightWords;
  const el    = _wordHighlightEl;
  if (!el || !words.length) return;
  let lastIdx = -1;
  function tick() {
    if (!_curAudio || _curAudio !== audio || !_wordHighlightEl) return;
    const dur      = audio.duration || _wordHighlightDur || 1;
    const progress = Math.min(audio.currentTime / dur, 1);
    const idx      = Math.min(Math.floor(progress * words.length), words.length - 1);
    if (idx !== lastIdx) {
      el.querySelector(".wh-current")?.classList.remove("wh-current");
      const span = el.querySelector(`[data-wi="${idx}"]`);
      if (span) {
        span.classList.add("wh-current");
        try { span.scrollIntoView({ block: "nearest", behavior: "smooth" }); } catch (_) {}
      }
      lastIdx = idx;
    }
    _wordHighlightRAF = requestAnimationFrame(tick);
  }
  _wordHighlightRAF = requestAnimationFrame(tick);
}

function clearWordHighlight() {
  if (_wordHighlightRAF) { cancelAnimationFrame(_wordHighlightRAF); _wordHighlightRAF = null; }
  if (_wordHighlightEl) {
    _wordHighlightEl.classList.remove("wh-active");
    if (_wordHighlightEl.querySelectorAll(".wh-word").length > 0)
      _wordHighlightEl.innerHTML = _wordHighlightEl.textContent;
    _wordHighlightEl = null;
  }
  _wordHighlightWords = [];
  _wordHighlightDur   = 0;
}

// ── AUDIO CORE ────────────────────────────────────────────────────

async function speakText(text, lang) {
  if (!text?.trim()) return null;
  try {
    const r = await fetch(`${API_URL}/speak`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text.trim(), lang }),
      signal: AbortSignal.timeout(25000),
    });
    if (!r.ok) return null;
    const blob  = await r.blob();
    const url   = URL.createObjectURL(blob);
    const audio = new Audio(url);
    const revokeUrl = () => { try { URL.revokeObjectURL(url); } catch (_) {} };
    audio.addEventListener("ended", revokeUrl, { once: true });
    audio.addEventListener("error", revokeUrl, { once: true });
    return audio;
  } catch (e) {
    console.warn("[Vaani] speakText:", e.message);
    return null;
  }
}

// FIX 13 — stopAudio() is called at the top of autoPlay so that
// _curAudio is always null before a new Audio is assigned.
// This ensures playAudio() never replays a stale cached object.
async function autoPlay(text, lang, timelineSuffix, highlightEl) {
  if (!text || text === "—" || text === "…" || !lang) return;
  stopAudio();   // clear stale _curAudio before fetching new audio
  const suffix = timelineSuffix || "";
  showTimeline(suffix);
  resetTimeline(suffix);
  const audio = await speakText(text, lang);
  if (!audio) { _speakBrowser(text, lang); return; }
  _curAudio = audio;
  _attachTimelineToAudio(audio, suffix);
  if (highlightEl) {
    audio.addEventListener("canplay", () => { startWordHighlight(highlightEl, text, audio); }, { once: true });
  }
  audio.currentTime = 0;
  try {
    await audio.play(); _audioPlaying = true; _updateAllPlayPauseBtns();
  } catch (e) {
    console.warn("[Vaani] play:", e.message);
    _audioPlaying = false; _updateAllPlayPauseBtns();
    _speakBrowser(text, lang);
  }
}

// ══════════════════════════════════════════════════════════════════
// MIC STATE MACHINE
// ══════════════════════════════════════════════════════════════════

const MicState = { IDLE: "idle", LISTENING: "listening", STOPPED: "stopped" };

const _mic = {
  single: { state: MicState.IDLE, rec: null, last: "", transcript: "" },
  A:      { state: MicState.IDLE, rec: null, last: "", transcript: "" },
  B:      { state: MicState.IDLE, rec: null, last: "", transcript: "" },
};

function _killMic(ctx) {
  if (ctx._silenceTimer) { clearTimeout(ctx._silenceTimer); ctx._silenceTimer = null; }
  if (ctx.rec) {
    ctx.rec.onresult  = null;
    ctx.rec.onend     = null;
    ctx.rec.onerror   = null;
    ctx.rec.onspeechend = null;
    try { ctx.rec.abort(); } catch (_) {}
    ctx.rec = null;
  }
  ctx.state = MicState.IDLE;
  ctx.last  = "";
  ctx.transcript = "";
}

function setMicStatus(msg, id = "micStatus") {
  const el = document.getElementById(id);
  if (el) el.textContent = msg;
}

// ── SINGLE MODE MIC ───────────────────────────────────────────────

async function startListening() {
  const ctx    = _mic.single;
  const micBtn = document.getElementById("micBtn");

  if (ctx.state === MicState.LISTENING) {
    if (ctx._recorder) { ctx._recorder.stop().catch(() => {}); ctx._recorder = null; }
    if (ctx.rec) { ctx.rec.onend = null; try { ctx.rec.stop(); } catch (_) {} }
    _killMic(ctx);
    micBtn?.classList.remove("listening");
    setMicStatus("Tap to speak");
    return;
  }

  _killMic(ctx);
  clearSingleResults();

  if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
    showToast("Voice input not supported. Use Chrome on Android/Desktop.");
    return;
  }

  setMicStatus("Requesting microphone…");
  const permitted = await handlePermission("audio", "micStatus");
  if (!permitted) { setMicStatus("Tap to speak"); return; }

  const fromLang   = document.getElementById("fromLang")?.value || "en";
  const toLang     = document.getElementById("toLang")?.value   || "en";
  const speechCode = LANG_CONFIG[fromLang]?.speechCode          || "en-US";

  // ── MediaRecorder (Bhashini ASR when USE_API=true) ──────────────
  let recorderController = null;
  if (window.USE_API && typeof window.startRecording === "function") {
    recorderController = await window.startRecording().catch(() => null);
  }
  ctx._recorder = recorderController;

  // ── Web Speech API (fallback transcript) ────────────────────────
  const SR  = window.SpeechRecognition || window.webkitSpeechRecognition;
  const rec = new SR();

  rec.lang            = speechCode;
  rec.continuous      = false;
  rec.interimResults  = false;
  rec.maxAlternatives = 3;

  ctx.rec = rec; ctx.state = MicState.LISTENING; ctx.transcript = "";
  micBtn?.classList.add("listening");
  setMicStatus("Listening… (tap again to stop)");

  rec.onresult = (e) => {
    let finalText = "";
    let bestConf  = -1;
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (!e.results[i].isFinal) continue;
      for (let j = 0; j < e.results[i].length; j++) {
        const alt  = e.results[i][j];
        const conf = (typeof alt.confidence === "number" && alt.confidence > 0)
                     ? alt.confidence : (j === 0 ? 1 : 0);
        if (conf > bestConf) { bestConf = conf; finalText = alt.transcript; }
      }
    }
    if (finalText.trim()) {
      ctx.transcript = finalText.trim();
      showOriginalText(ctx.transcript);
    }
  };

  rec.onspeechend = () => {
    if (ctx.rec && ctx.state === MicState.LISTENING) { try { ctx.rec.stop(); } catch (_) {} }
  };

  rec.onend = async () => {
    micBtn?.classList.remove("listening");
    if (ctx.state === MicState.IDLE) return;

    // Stop MediaRecorder
    let audioBlob = null;
    if (ctx._recorder) {
      try { audioBlob = await ctx._recorder.stop(); } catch (_) {}
      ctx._recorder = null;
    }

    // Determine final transcript — try Bhashini ASR first
    let transcript = ctx.transcript.trim();
    if (window.USE_API && typeof window.speechToText === "function" && audioBlob) {
      setMicStatus("Processing speech…");
      try {
        const apiTranscript = await window.speechToText(audioBlob, fromLang);
        if (apiTranscript && apiTranscript.trim()) {
          transcript = apiTranscript.trim();
          console.log("[Vaani] Using Bhashini ASR transcript:", transcript);
        }
      } catch (err) {
        console.warn("[Vaani] speechToText threw:", err.message, "— using Web Speech fallback");
      }
    }

    if (!transcript) {
      ctx.state = MicState.IDLE; ctx.rec = null;
      setMicStatus("No speech detected. Tap to try again.");
      return;
    }
    if (transcript === ctx.last) {
      ctx.state = MicState.IDLE; ctx.rec = null;
      setMicStatus("Tap to speak again");
      return;
    }

    ctx.last = transcript; ctx.state = MicState.STOPPED; ctx.rec = null;

    showOriginalText(transcript);
    _showSpeechEditBtn(transcript);
    setTranslating();
    setMicStatus("Translating…");

    // FIX 2 — route through finalTranslate (normalises + translates)
    const translated = await window.finalTranslate(transcript, fromLang, toLang);
    showFinalTranslation(transcript, translated);
    setMicStatus("Tap ✏️ to correct · tap mic to record again");

    if (translated) {
      saveToHistory(transcript, translated, fromLang, toLang);
      const transEl = document.getElementById("translatedText");
      await autoPlay(translated, toLang, "", transEl);
    }
    ctx.state = MicState.IDLE;
  };

  rec.onerror = (e) => {
    const prevState = ctx.state;
    if (ctx._recorder) { ctx._recorder.stop().catch(() => {}); ctx._recorder = null; }
    _killMic(ctx);
    micBtn?.classList.remove("listening");
    if      (e.error === "no-speech")    { setMicStatus("No speech detected. Tap to try again."); }
    else if (e.error === "not-allowed")  {
      _permissionGranted.audio = false;
      setMicStatus("Microphone blocked.");
      _showPermissionDeniedGuide("audio", async () => {
        const ok = await _attemptGetUserMedia("audio");
        if (ok) setMicStatus("Permission granted! Tap to speak.");
      });
    }
    else if (e.error === "aborted") { if (prevState === MicState.LISTENING) setMicStatus("Tap to speak"); }
    else { showToast("Mic error: " + e.error); setMicStatus("Tap to speak"); }
  };

  try { rec.start(); }
  catch (e) {
    if (ctx._recorder) { ctx._recorder.stop().catch(() => {}); ctx._recorder = null; }
    _killMic(ctx);
    micBtn?.classList.remove("listening");
    setMicStatus("Tap to speak");
    console.warn("[Vaani] rec.start:", e.message);
  }
}

// ══════════════════════════════════════════════════════════════════
// CONVERSATION MODE
// ══════════════════════════════════════════════════════════════════

const _convLastTranscript = { A: "", B: "" };
const _convLastFromLang   = { A: "", B: "" };
const _convLastToLang     = { A: "", B: "" };
let _convTranslatingA = false;
let _convTranslatingB = false;

async function startConvListening(speaker) {
  const ctx      = _mic[speaker];
  const otherSpk = speaker === "A" ? "B" : "A";
  const fromSel  = `convLang${speaker}`;
  const toSel    = speaker === "A" ? "convLangB" : "convLangA";
  const micBtnId = `micBtn${speaker}`;
  const statId   = `micStatus${speaker}`;

  const fromLang   = document.getElementById(fromSel)?.value || "en";
  const toLang     = document.getElementById(toSel)?.value   || "en";
  const speechCode = LANG_CONFIG[fromLang]?.speechCode       || "en-US";
  const micBtn     = document.getElementById(micBtnId);

  if (ctx.state === MicState.LISTENING) {
    if (ctx.rec) { ctx.rec.onend = null; try { ctx.rec.stop(); } catch (_) {} }
    _killMic(ctx);
    micBtn?.classList.remove("listening");
    setMicStatus("Tap to speak", statId);
    return;
  }

  // Stop the other speaker's mic
  _killMic(_mic[otherSpk]);
  document.getElementById(`micBtn${otherSpk}`)?.classList.remove("listening");
  setMicStatus("Tap to speak", `micStatus${otherSpk}`);
  _killMic(ctx);

  if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
    showToast("Voice not supported. Use Chrome.");
    return;
  }

  setMicStatus("Requesting microphone…", statId);
  const permitted = await handlePermission("audio", statId);
  if (!permitted) { setMicStatus("Tap to speak", statId); return; }

  const SR  = window.SpeechRecognition || window.webkitSpeechRecognition;
  const rec = new SR();
  rec.lang = speechCode; rec.continuous = false; rec.interimResults = false; rec.maxAlternatives = 1;
  ctx.rec = rec; ctx.state = MicState.LISTENING; ctx.transcript = "";
  micBtn?.classList.add("listening");
  setMicStatus("Listening… (tap again to stop)", statId);

  const origEl  = document.getElementById(`originalText${speaker}`);
  const transEl = document.getElementById(`translatedText${speaker}`);
  const playBtn = document.getElementById(`playBtn${speaker}`);

  rec.onresult = (e) => {
    if (ctx._silenceTimer) { clearTimeout(ctx._silenceTimer); ctx._silenceTimer = null; }
    let finalText = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
    }
    if (finalText.trim()) {
      ctx.transcript = finalText.trim();
      if (origEl) origEl.textContent = ctx.transcript;
    }
  };

  rec.onspeechend = () => {
    if (ctx.rec && ctx.state === MicState.LISTENING) { try { ctx.rec.stop(); } catch (_) {} }
  };

  rec.onend = async () => {
    micBtn?.classList.remove("listening");
    if (ctx._silenceTimer) { clearTimeout(ctx._silenceTimer); ctx._silenceTimer = null; }
    if (ctx.state === MicState.IDLE) return;

    const transcript = ctx.transcript.trim();
    if (!transcript) {
      ctx.state = MicState.IDLE; ctx.rec = null;
      setMicStatus("Tap to speak", statId);
      return;
    }
    if (transcript === ctx.last) {
      ctx.state = MicState.IDLE; ctx.rec = null;
      setMicStatus("Tap to speak again", statId);
      return;
    }

    ctx.last = transcript; ctx.state = MicState.STOPPED; ctx.rec = null;
    setMicStatus("Translating…", statId);
    if (transEl) transEl.textContent = "…";

    _convLastTranscript[speaker] = transcript;
    _convLastFromLang[speaker]   = fromLang;
    _convLastToLang[speaker]     = toLang;

    // FIX 2 & 4 — route through finalTranslate (normalises + translates)
    const translated = await window.finalTranslate(transcript, fromLang, toLang);
    if (transEl) transEl.textContent = translated || "—";
    if (playBtn) playBtn.style.display = translated ? "flex" : "none";
    setMicStatus("Tap to speak again", statId);
    if (translated) await autoPlay(translated, toLang, "", transEl);
    ctx.state = MicState.IDLE;
  };

  rec.onerror = (e) => {
    _killMic(ctx);
    micBtn?.classList.remove("listening");
    setMicStatus("Tap to speak", statId);
    if (e.error === "not-allowed") {
      _permissionGranted.audio = false;
      _showPermissionDeniedGuide("audio", async () => {
        const ok = await _attemptGetUserMedia("audio");
        if (ok) setMicStatus("Permission granted! Tap to speak.", statId);
      });
    } else if (e.error === "no-speech") {
      setMicStatus("No speech detected. Tap to try again.", statId);
    } else if (e.error !== "aborted") {
      showToast("Mic: " + e.error);
    }
  };

  try { rec.start(); }
  catch (e) {
    _killMic(ctx);
    micBtn?.classList.remove("listening");
    setMicStatus("Tap to speak", statId);
    console.warn("[Vaani] conv rec.start:", e.message);
  }
}

async function onConvLangChange(speaker) {
  const selectId   = `convLang${speaker}`;
  const newLang    = document.getElementById(selectId)?.value || "en";
  localStorage.setItem(`vaani_lang_${selectId}`, newLang);

  const sourceSpeak = speaker === "B" ? "A" : "B";
  const transcript  = _convLastTranscript[sourceSpeak];
  const origFrom    = _convLastFromLang[sourceSpeak];
  if (!transcript || !origFrom) return;
  if (_convLastToLang[sourceSpeak] === newLang) return;
  if (sourceSpeak === "A" && _convTranslatingA) return;
  if (sourceSpeak === "B" && _convTranslatingB) return;

  if (sourceSpeak === "A") _convTranslatingA = true; else _convTranslatingB = true;

  const transEl = document.getElementById(`translatedText${sourceSpeak}`);
  const playBtn = document.getElementById(`playBtn${sourceSpeak}`);
  if (transEl) transEl.textContent = "…";

  try {
    // FIX 2 — route through finalTranslate
    const translated = await window.finalTranslate(transcript, origFrom, newLang);
    if (transEl) transEl.textContent = translated || "—";
    if (playBtn) playBtn.style.display = translated ? "flex" : "none";
    _convLastToLang[sourceSpeak] = newLang;
    if (translated) await autoPlay(translated, newLang, "", transEl);
  } finally {
    if (sourceSpeak === "A") _convTranslatingA = false; else _convTranslatingB = false;
  }
}

// ── SINGLE RESULT DISPLAY ─────────────────────────────────────────

function clearSingleResults() {
  const s = document.getElementById("resultsSection");
  if (s) s.style.display = "none";
  const o = document.getElementById("originalText");
  const t = document.getElementById("translatedText");
  const a = document.getElementById("actionBtns");
  if (o) o.textContent = "—";
  if (t) t.textContent = "—";
  if (a) a.style.display = "none";
  resetTimeline("");
  const saveBtn = document.getElementById("saveBtn");
  if (saveBtn) { saveBtn.classList.remove("active"); saveBtn.innerHTML = _starSvg() + "Save"; }
  _hideSpeechEditBtn();
}

function showOriginalText(text) {
  const s = document.getElementById("resultsSection");
  if (s) s.style.display = "block";
  const o = document.getElementById("originalText");
  if (o) o.textContent = text;
}

function setTranslating() {
  const t = document.getElementById("translatedText");
  const a = document.getElementById("actionBtns");
  if (t) t.textContent = "…";
  if (a) a.style.display = "none";
}

function showFinalTranslation(original, translated) {
  const t = document.getElementById("translatedText");
  const a = document.getElementById("actionBtns");
  if (t) t.textContent = translated || "—";
  if (a) a.style.display = translated ? "flex" : "none";
  showTimeline("");
  _updateSingleStarBtn();
}

// ── SPEECH EDIT UI ───────────────────────────────────────────────

function _showSpeechEditBtn(transcript) {
  const btn = document.getElementById("editSpeechBtn");
  const box = document.getElementById("speechEditBox");
  const inp = document.getElementById("speechEditInput");
  if (btn) btn.style.display = "flex";
  if (box) box.style.display = "none";    // collapsed by default
  // FIX 9 — use inp reference, not a re-query
  if (inp) inp.value = transcript || "";
}

function _hideSpeechEditBtn() {
  const btn = document.getElementById("editSpeechBtn");
  const box = document.getElementById("speechEditBox");
  if (btn) btn.style.display = "none";
  if (box) box.style.display = "none";
}

function toggleSpeechEdit() {
  const box = document.getElementById("speechEditBox");
  const inp = document.getElementById("speechEditInput");
  if (!box) return;
  const isOpen = box.style.display !== "none";
  box.style.display = isOpen ? "none" : "block";
  if (!isOpen && inp) {
    const orig = document.getElementById("originalText")?.textContent;
    if (orig && orig !== "—") inp.value = orig;
    setTimeout(() => inp.focus(), 50);
  }
}

// FIX 5 & 10 — retranslateSpeech now normalises + saves to history
async function retranslateSpeech() {
  const inp    = document.getElementById("speechEditInput");
  const edited = inp?.value?.trim();
  if (!edited) { showToast("Please enter some text"); return; }

  const fromLang = document.getElementById("fromLang")?.value || "en";
  const toLang   = document.getElementById("toLang")?.value   || "en";

  const origEl = document.getElementById("originalText");
  if (origEl) origEl.textContent = edited;

  const box = document.getElementById("speechEditBox");
  if (box) box.style.display = "none";

  setTranslating();
  setMicStatus("Translating edited text…");

  // FIX 2 & 10 — finalTranslate normalises; also save to history (was missing)
  const translated = await window.finalTranslate(edited, fromLang, toLang);
  showFinalTranslation(edited, translated);
  setMicStatus("Tap edit to correct · tap mic to record again");

  if (translated) {
    saveToHistory(edited, translated, fromLang, toLang);
    const transEl = document.getElementById("translatedText");
    await autoPlay(translated, toLang, "", transEl);
  }
}

// ── TEXT MODE ─────────────────────────────────────────────────────

// FIX 5 — translateTypedText routes through finalTranslate
async function translateTypedText() {
  const area = document.getElementById("textInputArea");
  const raw  = area?.value?.trim();
  if (!raw) { showToast("Please enter some text"); return; }

  const fromLang = document.getElementById("fromLang")?.value || "en";
  const toLang   = document.getElementById("toLang")?.value   || "en";
  const btn      = document.getElementById("translateTextBtn");

  clearTimeout(_liveTimer);
  _liveLastText = raw;   // mark committed so live-translate skips it
  _liveClearHint();

  if (btn) { btn.disabled = true; btn.textContent = "Translating…"; }
  showOriginalText(raw);
  setTranslating();

  // FIX 2 — normalise + translate via finalTranslate
  const translated = await window.finalTranslate(raw, fromLang, toLang);
  showFinalTranslation(raw, translated);
  if (btn) { btn.disabled = false; btn.textContent = "Translate"; }

  if (translated) {
    saveToHistory(raw, translated, fromLang, toLang);
    const transEl = document.getElementById("translatedText");
    await autoPlay(translated, toLang, "", transEl);
  }
}

// ══════════════════════════════════════════════════════════════════
// LIVE TRANSLATION  (debounced, text mode only)
// ══════════════════════════════════════════════════════════════════

const _LIVE_DEBOUNCE_MS = 500;
let   _liveTimer        = null;
let   _liveLastText     = "";
let   _liveRequestId    = 0;

// FIX 8 — _liveArea at module scope (was re-declared inside closure)
const _liveArea = document.getElementById
  ? null   // lazily resolved at first use; see _getLiveArea()
  : null;

function _getLiveArea() {
  return document.getElementById("textInputArea");
}

function _liveSetPending() {
  const hint = document.getElementById("liveHint");
  if (hint) { hint.textContent = "Translating…"; hint.classList.add("live-hint--active"); }
}

function _liveClearHint() {
  const hint = document.getElementById("liveHint");
  if (hint) { hint.textContent = ""; hint.classList.remove("live-hint--active"); }
  const area = _getLiveArea();
  if (area) area.classList.remove("live-typing");
}

// FIX 13 — stopAudio() clears stale _curAudio before showing new result
function _liveShowResult(raw, translated) {
  if (!translated || !translated.trim()) return;
  stopAudio();
  resetTimeline("");
  showOriginalText(raw);
  const t = document.getElementById("translatedText");
  const a = document.getElementById("actionBtns");
  if (t) t.textContent = translated;
  if (a) a.style.display = "flex";
  _updateSingleStarBtn();
  _liveClearHint();
}

// FIX 6 — _runLiveTranslation routes through finalTranslate (normalises)
async function _runLiveTranslation(text, fromLang, toLang) {
  const myId = ++_liveRequestId;
  try {
    const translated = await window.finalTranslate(text, fromLang, toLang);
    if (myId !== _liveRequestId) return;   // stale — discard
    if (translated && translated.trim()) {
      _liveShowResult(text, translated);
      _liveLastText = text;
    }
  } catch (err) {
    if (myId === _liveRequestId) console.warn("[Vaani LiveTranslation]", err?.message);
  }
}

function handleLiveTranslation() {
  if (_mic.single.state === MicState.LISTENING) return;
  if (_mic.A.state       === MicState.LISTENING) return;
  if (_mic.B.state       === MicState.LISTENING) return;

  const textSec = document.getElementById("textInput");
  if (!textSec || textSec.style.display === "none") return;

  const area = _getLiveArea();
  const raw  = (area?.value || "").trim();

  if (!raw || raw.length < 2) { clearTimeout(_liveTimer); _liveClearHint(); return; }
  if (raw === _liveLastText)  return;

  _liveSetPending();
  if (area) area.classList.add("live-typing");
  _liveRequestId++;
  clearTimeout(_liveTimer);

  _liveTimer = setTimeout(async () => {
    const area2 = _getLiveArea();
    if (area2) area2.classList.remove("live-typing");
    const text = (area2?.value || "").trim();
    if (!text || text.length < 2) { _liveClearHint(); return; }
    const fromLang = document.getElementById("fromLang")?.value || "en";
    const toLang   = document.getElementById("toLang")?.value   || "en";
    await _runLiveTranslation(text, fromLang, toLang);
  }, _LIVE_DEBOUNCE_MS);
}

// ══════════════════════════════════════════════════════════════════

// FIX 7 & 14 — onLanguageChange resets _liveLastText so live-translate
// fires immediately on same text after a language switch.
async function onLanguageChange() {
  const fromLang = document.getElementById("fromLang")?.value || "en";
  const toLang   = document.getElementById("toLang")?.value   || "en";
  localStorage.setItem("vaani_lang_fromLang", fromLang);
  localStorage.setItem("vaani_lang_toLang",   toLang);

  // FIX 14 — reset so live-translate re-fires for same text in new lang
  _liveLastText = "";

  const transEl = document.getElementById("translatedText");
  const actEl   = document.getElementById("actionBtns");
  if (transEl) transEl.textContent = "—";
  if (actEl)   actEl.style.display = "none";

  const origText = (document.getElementById("originalText")?.textContent || "").trim();
  if (origText && origText !== "—" && origText !== "…") {
    if (transEl) transEl.textContent = "…";
    // FIX 2 — route through finalTranslate
    const translated = await window.finalTranslate(origText, fromLang, toLang);
    if (transEl) transEl.textContent = translated || "—";
    if (actEl)   actEl.style.display = translated ? "flex" : "none";
    if (translated) await autoPlay(translated, toLang, "", transEl);
  }
}

async function swapLanguages() {
  const fromEl = document.getElementById("fromLang");
  const toEl   = document.getElementById("toLang");
  if (!fromEl || !toEl) return;

  const prevFrom  = fromEl.value;
  const prevTo    = toEl.value;
  const origText  = (document.getElementById("originalText")?.textContent  || "").trim();
  const transText = (document.getElementById("translatedText")?.textContent || "").trim();

  fromEl.value = prevTo;
  toEl.value   = prevFrom;
  localStorage.setItem("vaani_lang_fromLang", prevTo);
  localStorage.setItem("vaani_lang_toLang",   prevFrom);

  // FIX 14 — reset live so it re-fires after swap
  _liveLastText = "";

  const newSource = (transText && transText !== "—" && transText !== "…") ? transText : origText;
  if (!newSource || newSource === "—") return;

  showOriginalText(newSource);
  setTranslating();
  // FIX 2 — route through finalTranslate
  const translated = await window.finalTranslate(newSource, prevTo, prevFrom);
  showFinalTranslation(newSource, translated);
  if (translated) {
    const transEl = document.getElementById("translatedText");
    await autoPlay(translated, prevFrom, "", transEl);
  }
}

function switchInputMode(mode) {
  const vSec = document.getElementById("voiceInput");
  const tSec = document.getElementById("textInput");
  const vBtn = document.getElementById("voiceModeBtn");
  const tBtn = document.getElementById("textModeBtn");
  if (mode === "voice") {
    if (vSec) vSec.style.display = "block"; if (tSec) tSec.style.display = "none";
    vBtn?.classList.add("active"); tBtn?.classList.remove("active");
  } else {
    if (vSec) vSec.style.display = "none"; if (tSec) tSec.style.display = "block";
    tBtn?.classList.add("active"); vBtn?.classList.remove("active");
  }
}

async function playAudio() {
  if (_curAudio) { toggleAudio(); return; }
  const t  = document.getElementById("translatedText")?.textContent;
  const l  = document.getElementById("toLang")?.value;
  const el = document.getElementById("translatedText");
  if (t && t !== "—" && t !== "…") await autoPlay(t, l, "", el);
}

async function playFavorite(text, lang) {
  if (!text || text === "—") return;
  if (_curAudio) { toggleAudio(); return; }
  await autoPlay(text, lang);
}

async function playAudioA() {
  if (_curAudio) { toggleAudio(); return; }
  const t  = document.getElementById("translatedTextA")?.textContent;
  const l  = document.getElementById("convLangB")?.value;
  const el = document.getElementById("translatedTextA");
  if (t && t !== "—") await autoPlay(t, l, "", el);
}

async function playAudioB() {
  if (_curAudio) { toggleAudio(); return; }
  const t  = document.getElementById("translatedTextB")?.textContent;
  const l  = document.getElementById("convLangA")?.value;
  const el = document.getElementById("translatedTextB");
  if (t && t !== "—") await autoPlay(t, l, "", el);
}

async function playPhrase(text, lang) {
  if (text) await autoPlay(text, lang);
}

function copyTranslation() {
  const t = document.getElementById("translatedText")?.textContent;
  if (t && t !== "—") navigator.clipboard.writeText(t).then(() => showToast("Copied!")).catch(() => {});
}

function copyText(id) {
  const el = document.getElementById(id);
  const t  = el?.tagName === "TEXTAREA" ? el.value : el?.textContent;
  if (t && t !== "—") navigator.clipboard.writeText(t).then(() => showToast("Copied!")).catch(() => {});
}

function buildLangOptions(sel) {
  let html = "";
  LANG_GROUPS.forEach(g => {
    const opts = g.langs
      .filter(c => LANG_CONFIG[c])
      .map(c => `<option value="${c}"${c === sel ? " selected" : ""}>${LANG_CONFIG[c].name}</option>`)
      .join("");
    if (opts) html += `<optgroup label="${g.label}">${opts}</optgroup>`;
  });
  return html;
}

function initLanguageSelects() {
  const defaults = {
    fromLang:      "te", toLang:      "ta",
    travelFromLang:"te", travelToLang:"hi",
    convLangA:     "te", convLangB:   "ta",
  };
  Object.entries(defaults).forEach(([id, def]) => {
    const el    = document.getElementById(id);
    if (!el) return;
    const saved = localStorage.getItem(`vaani_lang_${id}`);
    const val   = (saved && LANG_CONFIG[saved]) ? saved : def;
    el.innerHTML = buildLangOptions(val);
    el.value     = val;
  });
  document.getElementById("fromLang")?.addEventListener("change", onLanguageChange);
  document.getElementById("toLang")?.addEventListener("change",   onLanguageChange);
  document.getElementById("convLangA")?.addEventListener("change", () => onConvLangChange("A"));
  document.getElementById("convLangB")?.addEventListener("change", () => onConvLangChange("B"));
  ["travelFromLang", "travelToLang"].forEach(id => {
    document.getElementById(id)?.addEventListener("change", () => {
      localStorage.setItem(`vaani_lang_${id}`, document.getElementById(id).value);
    });
  });
}

// ══════════════════════════════════════════════════════════════════
// TRAVEL HELPER
// ══════════════════════════════════════════════════════════════════

let _cat   = "food";
let _tCache = {};
let _tTimer = null;

const TRAVEL_PHRASES_DEFAULT = {
  food: [
    { en:"Where is a good restaurant?" }, { en:"I am vegetarian." },
    { en:"The bill please." },            { en:"Is this spicy?" },
    { en:"No onion, no garlic please." }, { en:"Water please." },
    { en:"I am allergic to nuts." },      { en:"Is this food fresh?" },
  ],
  transport: [
    { en:"Where is the bus stand?" },      { en:"How much to go to the station?" },
    { en:"Stop here please." },            { en:"Is this the right bus?" },
    { en:"I am lost, please help." },      { en:"Call an auto rickshaw please." },
    { en:"How long will it take?" },       { en:"Please go slow." },
  ],
  hotel: [
    { en:"Do you have a room available?" }, { en:"What is the price per night?" },
    { en:"Can I see the room?" },           { en:"Please clean the room." },
    { en:"The AC is not working." },        { en:"What time is checkout?" },
    { en:"I need an extra blanket." },      { en:"Can I get hot water?" },
  ],
  emergency: [
    { en:"Please call the police." }, { en:"I need a doctor." },
    { en:"Where is the hospital?" },  { en:"I have lost my wallet." },
    { en:"This is an emergency!" },   { en:"Help me please!" },
    { en:"I need medicine." },        { en:"Call an ambulance." },
  ],
  shopping: [
    { en:"How much does this cost?" }, { en:"Can you reduce the price?" },
    { en:"I want to buy this." },      { en:"Do you have a smaller size?" },
    { en:"Where is the market?" },     { en:"Give me a discount." },
    { en:"Do you accept cards?" },     { en:"I want to return this." },
  ],
  greetings: [
    { en:"Hello, how are you?" },     { en:"Good morning." },
    { en:"Good evening." },           { en:"Thank you very much." },
    { en:"I don't understand." },     { en:"Please speak slowly." },
    { en:"What is your name?" },      { en:"Nice to meet you." },
  ],
};

function _getTravelCustom() {
  try { return JSON.parse(localStorage.getItem("vaani_travel_custom") || "{}"); } catch (_) { return {}; }
}
function _saveTravelCustom(data) { localStorage.setItem("vaani_travel_custom", JSON.stringify(data)); }
function _getTravelCategories() {
  const custom     = _getTravelCustom();
  const defaultKeys = Object.keys(TRAVEL_PHRASES_DEFAULT);
  const customKeys  = Object.keys(custom).filter(k => !defaultKeys.includes(k));
  return [...defaultKeys, ...customKeys];
}
function _getPhrasesForCat(cat) {
  const custom = _getTravelCustom();
  return [...(TRAVEL_PHRASES_DEFAULT[cat] || []), ...(custom[cat] || [])];
}
function _getTravelCatLabel(cat) {
  const LABELS = { food:"Food", transport:"Transport", hotel:"Hotel", emergency:"Emergency", shopping:"Shopping", greetings:"Greetings" };
  return LABELS[cat] || (cat.charAt(0).toUpperCase() + cat.slice(1));
}

function _renderCatTabs() {
  const tabs = document.getElementById("catTabs");
  if (!tabs) return;
  const cats = _getTravelCategories();
  tabs.innerHTML = cats.map(cat => `
    <button class="cat-btn${_cat === cat ? " active" : ""}" onclick="selectCategory('${cat}',this)">
      ${_getTravelCatLabel(cat)}
    </button>`).join("") +
    `<button class="cat-btn cat-btn-add" onclick="addTravelCategory()" title="Add category">+</button>`;
}

function selectCategory(cat) {
  _cat = cat; _renderCatTabs();
  clearTimeout(_tTimer); _tTimer = setTimeout(renderTravelPhrases, 150);
}

function loadTravelPhrases() {
  _renderCatTabs(); clearTimeout(_tTimer); _tTimer = setTimeout(renderTravelPhrases, 200);
}

// Travel phrases: translateText used directly (English source → no normalisation needed)
async function renderTravelPhrases() {
  const fromLang = document.getElementById("travelFromLang")?.value || "en";
  const toLang   = document.getElementById("travelToLang")?.value   || "en";
  const phrases  = _getPhrasesForCat(_cat);
  const list     = document.getElementById("phrasesList");
  const loading  = document.getElementById("travelLoading");
  if (!list) return;
  list.innerHTML = "";
  if (loading) loading.style.display = "flex";

  const isBuiltin = (phrase) => (TRAVEL_PHRASES_DEFAULT[_cat] || []).some(p => p.en === phrase.en);

  for (const phrase of phrases) {
    const fk = `${phrase.en}|${fromLang}`;
    const tk = `${phrase.en}|${toLang}`;
    let fromText = phrase.en;
    if (fromLang !== "en") {
      fromText    = _tCache[fk] || await translateText(phrase.en, "en", fromLang);
      _tCache[fk] = fromText;
    }
    const toText  = _tCache[tk] || await translateText(phrase.en, "en", toLang);
    _tCache[tk]   = toText;

    const isCustomPhrase = !isBuiltin(phrase);
    const card     = document.createElement("div"); card.className    = "phrase-card";
    const textsDiv = document.createElement("div"); textsDiv.className = "phrase-texts";
    const origDiv  = document.createElement("div"); origDiv.className  = "phrase-orig";  origDiv.textContent  = fromText;
    const transDiv = document.createElement("div"); transDiv.className = "phrase-trans"; transDiv.textContent = toText;
    const enDiv    = document.createElement("div"); enDiv.className    = "phrase-en";    enDiv.textContent    = phrase.en;
    textsDiv.appendChild(origDiv); textsDiv.appendChild(transDiv); textsDiv.appendChild(enDiv);

    const btnsDiv = document.createElement("div"); btnsDiv.className = "phrase-btns";
    const playBtn = document.createElement("button");
    playBtn.className = "phrase-btn phrase-play"; playBtn.textContent = "Play";
    playBtn.dataset.text = toText; playBtn.dataset.lang = toLang;
    playBtn.addEventListener("click", function () { autoPlay(this.dataset.text, this.dataset.lang); });

    const copyBtn = document.createElement("button");
    copyBtn.className = "phrase-btn phrase-copy"; copyBtn.textContent = "Copy";
    copyBtn.dataset.text = toText;
    copyBtn.addEventListener("click", function () {
      navigator.clipboard.writeText(this.dataset.text).then(() => showToast("Copied!")).catch(() => {});
    });

    btnsDiv.appendChild(playBtn); btnsDiv.appendChild(copyBtn);

    if (isCustomPhrase) {
      const delBtn      = document.createElement("button");
      delBtn.className  = "phrase-btn phrase-del"; delBtn.textContent = "✕"; delBtn.title = "Delete phrase";
      const phraseEn    = phrase.en;
      delBtn.addEventListener("click", () => deleteTravelPhrase(_cat, phraseEn));
      btnsDiv.appendChild(delBtn);
    }

    card.appendChild(textsDiv); card.appendChild(btnsDiv); list.appendChild(card);
  }

  const addRow = document.createElement("div"); addRow.className = "phrase-add-row";
  addRow.innerHTML = `
    <input type="text" id="newPhraseInput" class="phrase-add-input" placeholder="Add a custom sentence in English…">
    <button class="phrase-btn phrase-play phrase-add-btn" onclick="addTravelPhrase()">Add</button>`;
  list.appendChild(addRow);
  if (loading) loading.style.display = "none";
}

function addTravelPhrase() {
  const input = document.getElementById("newPhraseInput");
  const val   = (input?.value || "").trim();
  if (!val) { showToast("Enter a sentence first"); return; }
  const custom = _getTravelCustom();
  if (!custom[_cat]) custom[_cat] = [];
  if (custom[_cat].some(p => p.en === val)) { showToast("Already exists"); return; }
  custom[_cat].push({ en: val }); _saveTravelCustom(custom);
  if (input) input.value = "";
  showToast("Phrase added!");
  clearTimeout(_tTimer); _tTimer = setTimeout(renderTravelPhrases, 100);
}

function deleteTravelPhrase(cat, phraseEn) {
  const custom = _getTravelCustom();
  if (!custom[cat]) return;
  custom[cat] = custom[cat].filter(p => p.en !== phraseEn);
  _saveTravelCustom(custom); showToast("Phrase removed");
  clearTimeout(_tTimer); _tTimer = setTimeout(renderTravelPhrases, 100);
}

function addTravelCategory() {
  const name = prompt("New category name:");
  if (!name || !name.trim()) return;
  const key    = name.trim().toLowerCase().replace(/\s+/g, "_");
  const custom = _getTravelCustom();
  if (custom[key] || TRAVEL_PHRASES_DEFAULT[key]) { showToast("Category already exists"); return; }
  custom[key] = []; _saveTravelCustom(custom); _cat = key; _renderCatTabs();
  showToast(`Category "${name}" added!`);
  clearTimeout(_tTimer); _tTimer = setTimeout(renderTravelPhrases, 100);
}

// ══════════════════════════════════════════════════════════════════
// HISTORY
// ══════════════════════════════════════════════════════════════════

function _readHistory() {
  try {
    const raw = localStorage.getItem("vaani_history");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object" && parsed.original) return [parsed];
    return [];
  } catch (_) { return []; }
}

function _writeHistory(arr) {
  try { localStorage.setItem("vaani_history", JSON.stringify(arr)); } catch (_) {}
}

function saveToHistory(orig, trans, fromLang, toLang) {
  if (!orig || !trans) return;
  const h = _readHistory();
  if (h.length && h[0].original === orig && h[0].toLang === toLang) return;
  h.unshift({ original: orig, translated: trans, fromLang, toLang, ts: Date.now() });
  if (h.length > 200) h.splice(200);
  _writeHistory(h);
  const histPage = document.getElementById("pageHistory");
  if (histPage && histPage.classList.contains("active")) renderHistory();
}

function deleteHistory(i) {
  const h = _readHistory();
  if (i < 0 || i >= h.length) return;
  h.splice(i, 1); _writeHistory(h); renderHistory();
}

// ══════════════════════════════════════════════════════════════════
// FAVOURITES
// ══════════════════════════════════════════════════════════════════

function _readFavs() {
  try {
    const raw = localStorage.getItem("vaani_favs");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object" && parsed.original) return [parsed];
    return [];
  } catch (_) { return []; }
}

function _writeFavs(arr) {
  try { localStorage.setItem("vaani_favs", JSON.stringify(arr)); } catch (_) {}
}

function _starSvg() {
  return `<svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
}

function _isSingleResultSaved() {
  const t  = document.getElementById("translatedText")?.textContent;
  const tl = document.getElementById("toLang")?.value;
  if (!t || t === "—" || t === "…") return false;
  return _readFavs().some(f => f.translated === t && f.toLang === tl);
}

function _updateSingleStarBtn() {
  const btn = document.getElementById("saveBtn");
  if (!btn) return;
  const saved = _isSingleResultSaved();
  btn.classList.toggle("active", saved);
  btn.innerHTML = _starSvg() + (saved ? "Saved" : "Save");
}

function saveSingleToFavourites() {
  const o  = document.getElementById("originalText")?.textContent;
  const t  = document.getElementById("translatedText")?.textContent;
  const f  = document.getElementById("fromLang")?.value;
  const tl = document.getElementById("toLang")?.value;
  if (!t || t === "—" || t === "…") return;

  const favs    = _readFavs();
  const already = favs.some(fav => fav.translated === t && fav.toLang === tl);

  if (already) {
    const idx = favs.findIndex(fav => fav.translated === t && fav.toLang === tl);
    if (idx !== -1) favs.splice(idx, 1);
    _writeFavs(favs); showToast("Removed from favourites");
  } else {
    favs.unshift({ original: o, translated: t, fromLang: f, toLang: tl, ts: Date.now() });
    _writeFavs(favs); showToast("Saved to favourites");
  }

  _updateSingleStarBtn();
  const favsPage = document.getElementById("pageFavourites");
  if (favsPage && favsPage.classList.contains("active")) renderFavourites();
}

function saveFavourite(orig, trans, fromLang, toLang) {
  const favs = _readFavs();
  if (favs.some(f => f.original === orig && f.toLang === toLang)) { showToast("Already saved!"); return; }
  favs.unshift({ original: orig, translated: trans, fromLang, toLang, ts: Date.now() });
  _writeFavs(favs); showToast("Saved to favourites");
  _updateSingleStarBtn();
  const favsPage = document.getElementById("pageFavourites");
  if (favsPage && favsPage.classList.contains("active")) renderFavourites();
}

function deleteFavourite(i) {
  const favs = _readFavs();
  if (i < 0 || i >= favs.length) return;
  favs.splice(i, 1); _writeFavs(favs); renderFavourites();
}

// ── RENDER HISTORY ────────────────────────────────────────────────

function renderHistory() {
  const list = document.getElementById("historyList");
  if (!list) return;

  if (!window.VAANI_AUTH_READY) {
    list.innerHTML = `<div class="empty-state"><div class="spinner" style="margin:0 auto 16px"></div><p class="es-sub">Loading…</p></div>`;
    return;
  }

  if (!window._vaaniCurrentUser) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="es-icon"><svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>
        <p class="es-title">Sign in to view history</p>
        <p class="es-sub">Sign in to save and view your translation history across devices.</p>
        <button class="btn-primary" style="margin-top:20px;padding:11px 28px;font-size:14px" onclick="signInWithGoogle()">
          <svg viewBox="0 0 24 24" width="16" height="16"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          Sign In
        </button>
      </div>`;
    return;
  }

  const hist = _readHistory();
  if (!hist.length) {
    list.innerHTML = `<div class="empty-state"><div class="es-icon"><svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div><p class="es-title">No history yet</p><p class="es-sub">Start translating to see your history here.</p></div>`;
    return;
  }

  list.innerHTML = "";
  hist.forEach((h, i) => {
    const card    = document.createElement("div"); card.className    = "hist-card";
    const langs   = document.createElement("div"); langs.className   = "hist-langs";
    langs.textContent = `${LANG_NAMES[h.fromLang] || h.fromLang} → ${LANG_NAMES[h.toLang] || h.toLang}`;
    const orig    = document.createElement("div"); orig.className    = "hist-orig";  orig.textContent  = h.original;
    const trans   = document.createElement("div"); trans.className   = "hist-trans"; trans.textContent = h.translated;
    const actions = document.createElement("div"); actions.className = "hist-actions";

    const playBtn = document.createElement("button"); playBtn.className = "hist-btn"; playBtn.textContent = "Play";
    playBtn.addEventListener("click", () => autoPlay(h.translated, h.toLang));

    const copyBtn = document.createElement("button"); copyBtn.className = "hist-btn"; copyBtn.textContent = "Copy";
    copyBtn.addEventListener("click", () =>
      navigator.clipboard.writeText(h.translated).then(() => showToast("Copied!")).catch(() => {})
    );

    const saveBtn = document.createElement("button");
    saveBtn.className = "hist-btn hist-btn-star";
    const alreadySaved = _readFavs().some(f => f.translated === h.translated && f.toLang === h.toLang);
    saveBtn.innerHTML = _starSvg() + (alreadySaved ? " Saved" : " Save");
    saveBtn.classList.toggle("active", alreadySaved);
    saveBtn.addEventListener("click", () => {
      const favs    = _readFavs();
      const idx     = favs.findIndex(f => f.translated === h.translated && f.toLang === h.toLang);
      const nowSaved = idx === -1;
      if (!nowSaved) {
        favs.splice(idx, 1); _writeFavs(favs); showToast("Removed from favourites");
      } else {
        favs.unshift({ original: h.original, translated: h.translated, fromLang: h.fromLang, toLang: h.toLang, ts: Date.now() });
        _writeFavs(favs); showToast("Saved to favourites");
      }
      saveBtn.classList.toggle("active", nowSaved);
      saveBtn.innerHTML = _starSvg() + (nowSaved ? " Saved" : " Save");
      _updateSingleStarBtn();
      const favsPage = document.getElementById("pageFavourites");
      if (favsPage && favsPage.classList.contains("active")) renderFavourites();
    });

    const delBtn = document.createElement("button"); delBtn.className = "hist-btn del"; delBtn.textContent = "Delete";
    delBtn.addEventListener("click", () => deleteHistory(i));

    actions.appendChild(playBtn); actions.appendChild(copyBtn);
    actions.appendChild(saveBtn); actions.appendChild(delBtn);
    card.appendChild(langs); card.appendChild(orig);
    card.appendChild(trans); card.appendChild(actions);
    list.appendChild(card);
  });
}

// ── RENDER FAVOURITES ─────────────────────────────────────────────

function renderFavourites() {
  const list = document.getElementById("favouritesList");
  if (!list) return;

  if (!window.VAANI_AUTH_READY) {
    list.innerHTML = `<div class="empty-state"><div class="spinner" style="margin:0 auto 16px"></div><p class="es-sub">Loading…</p></div>`;
    return;
  }

  if (!window._vaaniCurrentUser) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="es-icon"><svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></div>
        <p class="es-title">Sign in to view favourites</p>
        <p class="es-sub">Sign in to save and access your favourite translations.</p>
        <button class="btn-primary" style="margin-top:20px;padding:11px 28px;font-size:14px" onclick="signInWithGoogle()">
          <svg viewBox="0 0 24 24" width="16" height="16"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          Sign In
        </button>
      </div>`;
    return;
  }

  const favs = _readFavs();
  if (!favs.length) {
    list.innerHTML = `<div class="empty-state"><div class="es-icon"><svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></div><p class="es-title">No favourites yet</p><p class="es-sub">Tap the star after translating to save here.</p></div>`;
    return;
  }

  list.innerHTML = "";
  favs.forEach((f, i) => {
    const card    = document.createElement("div"); card.className    = "hist-card fav-card";
    const langs   = document.createElement("div"); langs.className   = "hist-langs";
    langs.textContent = `${LANG_NAMES[f.fromLang] || f.fromLang} → ${LANG_NAMES[f.toLang] || f.toLang}`;
    const orig    = document.createElement("div"); orig.className    = "hist-orig";  orig.textContent  = f.original;
    const trans   = document.createElement("div"); trans.className   = "hist-trans"; trans.textContent = f.translated;
    const actions = document.createElement("div"); actions.className = "hist-actions";

    const playBtn = document.createElement("button"); playBtn.className = "hist-btn"; playBtn.textContent = "Play";
    playBtn.addEventListener("click", () => playFavorite(f.translated, f.toLang));

    const copyBtn = document.createElement("button"); copyBtn.className = "hist-btn"; copyBtn.textContent = "Copy";
    copyBtn.addEventListener("click", () =>
      navigator.clipboard.writeText(f.translated).then(() => showToast("Copied!")).catch(() => showToast("Copy failed"))
    );

    const removeBtn = document.createElement("button"); removeBtn.className = "hist-btn del"; removeBtn.textContent = "Remove";
    removeBtn.addEventListener("click", () => deleteFavourite(i));

    actions.appendChild(playBtn); actions.appendChild(copyBtn); actions.appendChild(removeBtn);
    card.appendChild(langs); card.appendChild(orig); card.appendChild(trans); card.appendChild(actions);
    list.appendChild(card);
  });
}

// ══════════════════════════════════════════════════════════════════
// AUTH SESSION HELPERS
// ══════════════════════════════════════════════════════════════════

const SESSION_KEY = "vaani_user_session";

function _persistUserSession(user) {
  if (user) {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        uid: user.uid, displayName: user.displayName || "",
        email: user.email || "", photoURL: user.photoURL || "", ts: Date.now(),
      }));
    } catch (_) {}
  } else {
    try { localStorage.removeItem(SESSION_KEY); } catch (_) {}
  }
}

function _restoreUserSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (Date.now() - (session.ts || 0) > 30 * 24 * 60 * 60 * 1000) {
      localStorage.removeItem(SESSION_KEY); return null;
    }
    return session;
  } catch (_) { return null; }
}

function _applyUserToUI(user) {
  const card   = document.getElementById("menuSigninCard");
  const out    = document.getElementById("menuSignout");
  const uEl    = document.getElementById("menuUser");
  const avatar = document.getElementById("menuAvatar");
  const name   = document.getElementById("menuUserName");
  if (!user) {
    if (card) card.style.display = "block";
    if (out)  out.style.display  = "none";
    if (uEl)  uEl.style.display  = "none";
    return;
  }
  if (card)   card.style.display   = "none";
  if (out)    out.style.display    = "block";
  if (uEl)    uEl.style.display    = "flex";
  if (avatar) avatar.src           = user.photoURL    || "";
  if (name)   name.textContent     = user.displayName || user.email || "User";
}

// ══════════════════════════════════════════════════════════════════
// SETTINGS
// ══════════════════════════════════════════════════════════════════

function renderSettingsPage() {
  const container = document.getElementById("settingsContainer");
  if (!container) return;
  const theme    = localStorage.getItem("vaani_theme") || "dark";
  const fromPref = localStorage.getItem("vaani_lang_fromLang") || "te";
  const toPref   = localStorage.getItem("vaani_lang_toLang")   || "ta";
  let dialectInfo = "";
  if (_dialectTone) {
    dialectInfo = `<div class="stg-row"><span class="stg-label">Detected Dialect</span><span style="font-size:13px;color:var(--accent-light)">${_dialectTone}</span></div>`;
  }
  container.innerHTML = `
    <div class="stg-section">
      <div class="stg-title">Language Preferences</div>
      <div class="stg-row"><label class="stg-label">Default Source Language</label><select class="stg-select" onchange="stgSaveLang('fromLang',this.value)">${buildLangOptions(fromPref)}</select></div>
      <div class="stg-row"><label class="stg-label">Default Target Language</label><select class="stg-select" onchange="stgSaveLang('toLang',this.value)">${buildLangOptions(toPref)}</select></div>
      ${dialectInfo}
    </div>
    <div class="stg-section">
      <div class="stg-title">Appearance</div>
      <div class="stg-row">
        <label class="stg-label">Theme</label>
        <div class="stg-radios">
          <label class="stg-radio-lbl"><input type="radio" name="stgTheme" value="dark"  ${theme === "dark"  ? "checked" : ""} onchange="applyTheme('dark')"><span>Dark</span></label>
          <label class="stg-radio-lbl"><input type="radio" name="stgTheme" value="light" ${theme === "light" ? "checked" : ""} onchange="applyTheme('light')"><span>Light</span></label>
        </div>
      </div>
    </div>
    <div class="stg-section">
      <div class="stg-title">Data &amp; Cache</div>
      <div class="stg-btn-col">
        <button class="stg-btn stg-warn"   onclick="stgClearHistory()">Clear Translation History</button>
        <button class="stg-btn stg-warn"   onclick="stgClearFavs()">Clear Favourites</button>
        <button class="stg-btn stg-warn"   onclick="stgClearTravel()">Clear Custom Travel Phrases</button>
        <button class="stg-btn stg-danger" onclick="stgResetAll()">Reset All App Data</button>
      </div>
    </div>
    <div class="stg-section">
      <div class="stg-title">About</div>
      <div class="stg-about">
        <div>Vaani — Indian Language Translator v5.7</div>
        <div>Normalisation: Universal Indian romanisation engine (normalizer.js)</div>
        <div>Translation: Bhashini NMT + Google Translate fallback</div>
        <div>Speech: Bhashini TTS + gTTS + Browser TTS fallback</div>
        <div>30+ Indian languages supported</div>
      </div>
    </div>`;
}

function stgSaveLang(field, val) {
  localStorage.setItem(`vaani_lang_${field}`, val);
  const el = document.getElementById(field);
  if (el && LANG_CONFIG[val]) el.value = val;
}
function applyTheme(t) { document.documentElement.setAttribute("data-theme", t); localStorage.setItem("vaani_theme", t); }
function stgClearHistory() { if (!confirm("Clear all translation history?")) return; localStorage.removeItem("vaani_history"); showToast("History cleared"); renderHistory(); }
function stgClearFavs()    { if (!confirm("Clear all favourites?")) return; localStorage.removeItem("vaani_favs"); showToast("Favourites cleared"); renderFavourites(); }
function stgClearTravel()  { if (!confirm("Clear all custom travel phrases?")) return; localStorage.removeItem("vaani_travel_custom"); _tCache = {}; showToast("Custom travel phrases cleared"); }
function stgResetAll()     { if (!confirm("Reset ALL app data? Cannot be undone.")) return; localStorage.clear(); cacheClear(); showToast("All data reset"); setTimeout(() => location.reload(), 800); }

// ══════════════════════════════════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════════════════════════════════

const PAGES     = ["Home","Single","Conversation","Chat","Travel","History","Favourites","Settings"];
const _navStack = [];

function navigateTo(page) {
  if (!PAGES.includes(page)) page = "Home";
  PAGES.forEach(p => {
    document.getElementById(`page${p}`)?.classList.toggle("active", p === page);
    document.getElementById(`menu${p}`)?.classList.toggle("active", p === page);
  });
  closeMenu();
  const currentHash = location.hash.replace("#", "").toLowerCase();
  const currentPage = PAGES.find(p => p.toLowerCase() === currentHash) || "Home";
  if (currentPage !== page) {
    history.pushState({ page }, "", `#${page.toLowerCase()}`);
    _navStack.push(page);
  } else {
    history.replaceState({ page }, "", `#${page.toLowerCase()}`);
    if (!_navStack.length || _navStack[_navStack.length - 1] !== page) _navStack.push(page);
  }
  // Close chat listener when leaving
  if (page !== "Chat" && window.vaaniChat) window.vaaniChat.close();
  _onPageActivate(page);
  Object.values(_mic).forEach(ctx => { _killMic(ctx); });
  ["micBtn", "micBtnA", "micBtnB"].forEach(id => document.getElementById(id)?.classList.remove("listening"));
}

function _onPageActivate(page) {
  if (page === "Travel")     { _renderCatTabs(); loadTravelPhrases(); }
  if (page === "History")    renderHistory();
  if (page === "Favourites") renderFavourites();
  if (page === "Settings")   renderSettingsPage();
  if (page === "Chat" && window.vaaniChat) window.vaaniChat.open();
}

window.addEventListener("popstate", (e) => {
  const page = e.state?.page || "Home";
  PAGES.forEach(p => {
    document.getElementById(`page${p}`)?.classList.toggle("active", p === page);
    document.getElementById(`menu${p}`)?.classList.toggle("active", p === page);
  });
  closeMenu(); _onPageActivate(page);
  Object.values(_mic).forEach(ctx => { _killMic(ctx); });
  ["micBtn", "micBtnA", "micBtnB"].forEach(id => document.getElementById(id)?.classList.remove("listening"));
});

function toggleMenu()  { document.getElementById("sideMenu")?.classList.toggle("open"); document.getElementById("menuOverlay")?.classList.toggle("open"); }
function closeMenu()   { document.getElementById("sideMenu")?.classList.remove("open"); document.getElementById("menuOverlay")?.classList.remove("open"); }
function toggleTheme() { applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark"); }

// ── TOAST ─────────────────────────────────────────────────────────
let _toastTimer = null;
function showToast(msg) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg; t.classList.add("show");
  clearTimeout(_toastTimer); _toastTimer = setTimeout(() => t.classList.remove("show"), 2800);
}

// ── KEEP-ALIVE ────────────────────────────────────────────────────
function pingBackend() {
  fetch(`${API_URL}/ping`, { signal: AbortSignal.timeout(10000) })
    .then(r => r.json()).then(d => console.log("[Vaani] ping:", d.status)).catch(() => {});
}
pingBackend();
setInterval(pingBackend, 10 * 60 * 1000);

// ══════════════════════════════════════════════════════════════════
// AUTH — SINGLE SOURCE OF TRUTH
// ══════════════════════════════════════════════════════════════════

if (typeof window.signInWithGoogle === "undefined") {
  window.signInWithGoogle = () => showToast("Sign-in coming soon");
}
if (typeof window.signOutUser === "undefined") {
  window.signOutUser = () => showToast("Sign-out coming soon");
}

window._vaaniOnAuthChange = function (user) {
  window._vaaniCurrentUser = user || null;
  window.VAANI_AUTH_READY  = true;
  console.log("[Vaani] Auth →", user ? `signed in: ${user.email}` : "signed out");
  _applyUserToUI(user);
  _persistUserSession(user);
  _refreshAuthSensitivePages();
};

function _refreshAuthSensitivePages() {
  const histPage = document.getElementById("pageHistory");
  const favPage  = document.getElementById("pageFavourites");
  if (histPage && histPage.classList.contains("active")) renderHistory();
  if (favPage  && favPage.classList.contains("active"))  renderFavourites();
}

// ══════════════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════════════

document.addEventListener("DOMContentLoaded", () => {
  applyTheme(localStorage.getItem("vaani_theme") || "dark");
  initLanguageSelects();
  _initTimelineControls("");
  if (window.speechSynthesis) _loadVoices().catch(() => {});

  const hash        = location.hash.replace("#", "").toLowerCase();
  const initialPage = PAGES.find(p => p.toLowerCase() === hash) || "Home";
  history.replaceState({ page: initialPage }, "", `#${initialPage.toLowerCase()}`);
  _navStack.push(initialPage);
  PAGES.forEach(p => {
    document.getElementById(`page${p}`)?.classList.toggle("active", p === initialPage);
    document.getElementById(`menu${p}`)?.classList.toggle("active", p === initialPage);
  });

  _refreshAuthSensitivePages();

  // FIX 12 — reduced from 5000 → 4000 ms for snappier signed-out fallback
  setTimeout(() => {
    if (!window.VAANI_AUTH_READY) {
      console.warn("[Vaani] Auth timeout — defaulting to signed out");
      window.VAANI_AUTH_READY  = true;
      window._vaaniCurrentUser = null;
      _applyUserToUI(null);
      _refreshAuthSensitivePages();
    }
  }, 4000);

  detectUserLocation();

  // ── Live translation ──────────────────────────────────────────
  const _liveTextArea = document.getElementById("textInputArea");
  if (_liveTextArea) _liveTextArea.addEventListener("input", handleLiveTranslation);

  // ── Mic permission prefetch ───────────────────────────────────
  if (navigator.permissions) {
    navigator.permissions.query({ name: "microphone" }).then(r => {
      if (r.state === "granted") _permissionGranted.audio = true;
      r.addEventListener("change", () => { _permissionGranted.audio = r.state === "granted"; });
    }).catch(() => {});
  }
});

/*
 * ── IMPORTANT: Load order in your HTML ───────────────────────────
 *
 *   <!-- 1. Normalizer (must come before app.js) -->
 *   <script src="normalizer.js"></script>
 *
 *   <!-- 2. Firebase (auth — must come before app.js) -->
 *   <script src="firebase.js"></script>
 *
 *   <!-- 3. App -->
 *   <script src="app.js"></script>
 *
 * ─────────────────────────────────────────────────────────────────
 */
