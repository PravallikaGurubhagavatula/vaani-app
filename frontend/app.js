/* ================================================================
   Vaani — app.js  v5.0  PATCHED

   CHANGES FROM v4.0:
   1. OCR BULLET POINT FIX — detects •-*1. etc, preserves correctly
   2. LIVE CAMERA REMOVED — all live-cam code stripped
   3. IMAGE EDITING — rotation left/right + improved crop (free crop,
      touch support, smooth handles via Cropper.js aspectRatio:NaN)
   4. PERFORMANCE — parallel OCR→translate→audio pipeline,
      optimized image resize before OCR, non-blocking async
   5. EDITABLE EXTRACTED TEXT — textarea + "Confirm & Translate" btn
   6. AUDIO CONTROLS — pause/resume, timeline always visible,
      draggable seek bar everywhere
   7. CONVERSATION MODE FIX — lang change triggers re-translation
   8. WORD HIGHLIGHTING — synced via per-word timestamp estimation
   9. TRAVEL HELPER — custom sentences, delete, custom categories,
      all persisted in localStorage
================================================================ */

const API_URL = "https://vaani-app-ui0z.onrender.com";

const VISION_API_KEY = window.VAANI_VISION_KEY || "";
const VISION_URL = "https://vision.googleapis.com/v1/images:annotate";

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

const LANG_NAMES = Object.fromEntries(Object.entries(LANG_CONFIG).map(([k,v]) => [k, v.name]));

const LANG_GROUPS = [
  { label:"Major Indian Languages", langs:["te","ta","hi","kn","ml","mr","bn","gu","pa","ur","or","as","ne","sd","mai","bho","sa"] },
  { label:"Scheduled Languages",    langs:["kok","gom","mwr","tcy","lus","ks","doi","brx","sat","mni-Mtei"] },
  { label:"Regional Languages",     langs:["awa","mag","hne","bgc","raj","kha","lep"] },
  { label:"English",                langs:["en"] }
];

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
function cacheGet(k) { return _transCache.get(k); }
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
        const dialect = DIALECT_TONE_MAP[_userStateCode];
        if (dialect) {
          _dialectTone = dialect.tone;
          console.log(`[Vaani] Detected state: ${_userStateCode}, dialect: ${_dialectTone}`);
        }
      }
    }
  } catch (_) {}
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

  const pivot = await _pivotTranslate(workText, fromLang, toLang);
  if (pivot) { cacheSet(ck, pivot); return pivot; }

  return "";
}

async function _callTranslate(text, fromLang, toLang, originalInput) {
  try {
    const r = await fetch(`${API_URL}/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, from_lang: fromLang, to_lang: toLang }),
      signal: AbortSignal.timeout(22000)
    });
    if (!r.ok) return "";
    const d = await r.json();
    const result = (d.translated || "").trim();
    if (!result) return "";
    const rLow = result.toLowerCase();
    if (rLow === (originalInput||"").toLowerCase() || rLow === text.toLowerCase()) {
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
      signal: AbortSignal.timeout(15000)
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
      signal: AbortSignal.timeout(15000)
    });
    if (!r2.ok) return "";
    const d2 = await r2.json();
    const result = (d2.translated || "").trim();
    return result;
  } catch (e) {
    console.warn("[Vaani] _pivotTranslate:", e.message);
    return "";
  }
}

// ══════════════════════════════════════════════════════════════════
// AUDIO SYSTEM — pause/resume, always-visible timeline, word-highlight
// ══════════════════════════════════════════════════════════════════
let _curAudio          = null;
let _audioPlaying      = false;
let _timelineRAF       = null;
let _timelineSeeking   = false;
let _wordHighlightWords = [];
let _wordHighlightEl    = null;
let _wordHighlightRAF   = null;
let _wordHighlightStart = 0;
let _wordHighlightDur   = 0;

function stopAudio() {
  if (_timelineRAF)     { cancelAnimationFrame(_timelineRAF); _timelineRAF = null; }
  if (_wordHighlightRAF){ cancelAnimationFrame(_wordHighlightRAF); _wordHighlightRAF = null; }
  if (_curAudio) {
    try { _curAudio.pause(); _curAudio.currentTime = 0; } catch (_) {}
    _curAudio = null;
  }
  _audioPlaying = false;
  _updateAllPlayPauseBtns();
}

function pauseAudio() {
  if (_curAudio && _audioPlaying) {
    _curAudio.pause();
    _audioPlaying = false;
    _updateAllPlayPauseBtns();
    if (_wordHighlightRAF) { cancelAnimationFrame(_wordHighlightRAF); _wordHighlightRAF = null; }
  }
}

function resumeAudio() {
  if (_curAudio && !_audioPlaying) {
    _curAudio.play().catch(e => console.warn("[Vaani] resume:", e.message));
    _audioPlaying = true;
    _updateAllPlayPauseBtns();
    if (_wordHighlightEl) _startWordHighlightLoop(_curAudio);
  }
}

function toggleAudio() {
  if (!_curAudio) return;
  if (_audioPlaying) pauseAudio();
  else resumeAudio();
}

function _updateAllPlayPauseBtns() {
  document.querySelectorAll("[data-playpause]").forEach(btn => {
    const icon = _audioPlaying
      ? `<svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`
      : `<svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
    btn.innerHTML = icon + (btn.dataset.playpause === "labeled" ? (_audioPlaying ? "Pause" : "Play") : "");
  });
}

// ── Timeline helpers ───────────────────────────────────────────────
function resetTimeline(suffix) {
  const s = suffix || "";
  const wrap = document.getElementById(`audioTimeline${s}`);
  if (!wrap) return;
  // Keep visible after first use; only reset values
  const bar   = document.getElementById(`timelineSeek${s}`);
  const cur   = document.getElementById(`timelineCurrent${s}`);
  if (bar)   { bar.value = 0; _updateSeekFill(bar, 0); }
  if (cur)   cur.textContent = "0:00";
}

function showTimeline(suffix) {
  const s = suffix || "";
  const wrap = document.getElementById(`audioTimeline${s}`);
  if (wrap) wrap.style.display = "flex";
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

function _startTimelineLoop(audio, suffix) {
  const s     = suffix || "";
  const wrap  = document.getElementById(`audioTimeline${s}`);
  const bar   = document.getElementById(`timelineSeek${s}`);
  const cur   = document.getElementById(`timelineCurrent${s}`);
  const total = document.getElementById(`timelineTotal${s}`);
  if (!wrap || !bar || !cur || !total) return;

  wrap.style.display = "flex";

  function tick() {
    if (!_curAudio || _curAudio !== audio) return;
    if (!_timelineSeeking) {
      const pct = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
      bar.value = pct;
      _updateSeekFill(bar, pct);
      cur.textContent = _fmtTime(audio.currentTime);
    }
    _timelineRAF = requestAnimationFrame(tick);
  }

  const setDuration = () => { total.textContent = _fmtTime(audio.duration); };
  if (audio.readyState >= 1) setDuration();
  else audio.addEventListener("loadedmetadata", setDuration, { once: true });

  if (_timelineRAF) cancelAnimationFrame(_timelineRAF);
  _timelineRAF = requestAnimationFrame(tick);
}

function _initTimelineControls(suffix) {
  const s   = suffix || "";
  const bar = document.getElementById(`timelineSeek${s}`);
  if (!bar || bar._vaaniInitialized) return;
  bar._vaaniInitialized = true;

  bar.addEventListener("input", () => {
    _timelineSeeking = true;
    _updateSeekFill(bar, parseFloat(bar.value));
    const cur = document.getElementById(`timelineCurrent${s}`);
    if (cur && _curAudio && _curAudio.duration) {
      cur.textContent = _fmtTime((_curAudio.duration * parseFloat(bar.value)) / 100);
    }
  });

  bar.addEventListener("change", () => {
    if (_curAudio && _curAudio.duration) {
      _curAudio.currentTime = (_curAudio.duration * parseFloat(bar.value)) / 100;
    }
    _timelineSeeking = false;
  });
}

// ══════════════════════════════════════════════════════════════════
// WORD HIGHLIGHTING — synced with audio currentTime
// ══════════════════════════════════════════════════════════════════

function _tokenizeForHighlight(text) {
  if (!text) return [];
  const raw = text.split(/(\s+)/);
  return raw.map(t => ({ word: t, isWord: /\S/.test(t) }));
}

function _buildHighlightHtml(text) {
  const tokens = _tokenizeForHighlight(text);
  let html = "";
  let wi = 0;
  for (const tok of tokens) {
    if (tok.isWord) {
      html += `<span class="wh-word" data-wi="${wi}">${_escHtml(tok.word)}</span>`;
      wi++;
    } else {
      html += tok.word.replace(/\n/g, "<br>");
    }
  }
  return html;
}

function _escHtml(s) {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

function startWordHighlight(el, text, audio) {
  if (!el || !text || !audio) return;
  clearWordHighlight();

  const words = text.split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) return;

  _wordHighlightEl    = el;
  _wordHighlightWords = words;
  _wordHighlightDur   = 0; // will be set once audio duration is known

  el.innerHTML = _buildHighlightHtml(text);
  el.classList.add("wh-active");

  const setDur = () => { _wordHighlightDur = audio.duration || 0; };
  if (audio.readyState >= 1) setDur();
  else audio.addEventListener("loadedmetadata", setDur, { once: true });

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

    const dur = audio.duration || _wordHighlightDur || 1;
    const progress = Math.min(audio.currentTime / dur, 1);
    const idx = Math.min(Math.floor(progress * words.length), words.length - 1);

    if (idx !== lastIdx) {
      const prev = el.querySelector(".wh-current");
      if (prev) prev.classList.remove("wh-current");
      const span = el.querySelector(`[data-wi="${idx}"]`);
      if (span) {
        span.classList.add("wh-current");
        try { span.scrollIntoView({ block: "nearest", behavior: "smooth" }); } catch(_){}
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
    const spans = _wordHighlightEl.querySelectorAll(".wh-word");
    if (spans.length > 0) {
      _wordHighlightEl.innerHTML = _wordHighlightEl.textContent;
    }
    _wordHighlightEl = null;
  }
  _wordHighlightWords = [];
  _wordHighlightDur   = 0;
}

// ══════════════════════════════════════════════════════════════════
// AUDIO CORE
// ══════════════════════════════════════════════════════════════════

async function speakText(text, lang) {
  if (!text?.trim()) return null;
  try {
    const r = await fetch(`${API_URL}/speak`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text.trim(), lang }),
      signal: AbortSignal.timeout(25000)
    });
    if (!r.ok) return null;
    const blob  = await r.blob();
    const url   = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.onended = () => {
      URL.revokeObjectURL(url);
      _audioPlaying = false;
      _updateAllPlayPauseBtns();
      clearWordHighlight();
      // Keep timeline visible but stop updating
      if (_timelineRAF) { cancelAnimationFrame(_timelineRAF); _timelineRAF = null; }
    };
    return audio;
  } catch (e) { console.warn("[Vaani] speakText:", e.message); return null; }
}

async function autoPlay(text, lang, timelineSuffix, highlightEl) {
  if (!text || text === "—" || text === "…" || !lang) return;
  stopAudio();
  showTimeline(timelineSuffix || "");
  const audio = await speakText(text, lang);
  if (audio) {
    _curAudio = audio;
    _audioPlaying = true;
    _updateAllPlayPauseBtns();
    _startTimelineLoop(audio, timelineSuffix || "");
    if (highlightEl) {
      audio.addEventListener("canplay", () => {
        startWordHighlight(highlightEl, text, audio);
      }, { once: true });
    }
    audio.play().catch(e => console.warn("[Vaani] play:", e.message));
  }
}

// ══════════════════════════════════════════════════════════════════
// MIC STATE MACHINE
// ══════════════════════════════════════════════════════════════════
const MicState = { IDLE:"idle", LISTENING:"listening", STOPPED:"stopped" };
const _mic = {
  single: { state: MicState.IDLE, rec: null, last: "" },
  A:      { state: MicState.IDLE, rec: null, last: "" },
  B:      { state: MicState.IDLE, rec: null, last: "" },
};

function _killMic(ctx) {
  if (ctx.rec) { try { ctx.rec.abort(); } catch(_){} ctx.rec = null; }
  ctx.state = MicState.IDLE;
  ctx.last  = "";
}

function setMicStatus(msg, id = "micStatus") {
  const el = document.getElementById(id);
  if (el) el.textContent = msg;
}

function startListening() {
  const ctx    = _mic.single;
  const micBtn = document.getElementById("micBtn");

  if (ctx.state === MicState.LISTENING) {
    if (ctx.rec) try { ctx.rec.stop(); } catch(_){}
    ctx.state = MicState.STOPPED;
    micBtn?.classList.remove("listening");
    setMicStatus("Tap to speak again");
    return;
  }

  _killMic(ctx);
  clearSingleResults();

  if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
    showToast("Voice input not supported. Use Chrome.");
    return;
  }

  const fromLang   = document.getElementById("fromLang")?.value || "en";
  const speechCode = LANG_CONFIG[fromLang]?.speechCode || "en-US";

  const SR  = window.SpeechRecognition || window.webkitSpeechRecognition;
  const rec = new SR();
  rec.lang = speechCode; rec.interimResults = false; rec.maxAlternatives = 3;

  ctx.rec   = rec;
  ctx.state = MicState.LISTENING;
  micBtn?.classList.add("listening");
  setMicStatus("Listening…");

  rec.onresult = async (e) => {
    let best = "", bestConf = -1;
    for (let i = 0; i < e.results[0].length; i++) {
      const a = e.results[0][i];
      if (a.confidence > bestConf) { bestConf = a.confidence; best = a.transcript; }
    }
    const transcript = best.trim();
    if (!transcript || transcript === ctx.last) return;
    ctx.last  = transcript;
    ctx.state = MicState.STOPPED;
    micBtn?.classList.remove("listening");

    const toLang = document.getElementById("toLang")?.value || "en";
    showOriginalText(transcript);
    setTranslating();
    setMicStatus("Translating…");

    const translated = await translateText(transcript, fromLang, toLang);
    showFinalTranslation(transcript, translated);
    setMicStatus("Tap to speak again");

    if (translated) {
      saveToHistory(transcript, translated, fromLang, toLang);
      const transEl = document.getElementById("translatedText");
      await autoPlay(translated, toLang, "", transEl);
    }
    ctx.rec = null;
  };

  rec.onerror = (e) => {
    ctx.state = MicState.IDLE; ctx.rec = null;
    micBtn?.classList.remove("listening");
    setMicStatus("Tap to speak");
    if (e.error === "no-speech") showToast("No speech. Try again.");
    else if (e.error !== "aborted") showToast("Mic: " + e.error);
  };

  rec.onend = () => {
    micBtn?.classList.remove("listening");
    if (ctx.state === MicState.LISTENING) {
      ctx.state = MicState.IDLE;
      setMicStatus("Tap to speak");
    }
    ctx.rec = null;
  };

  try { rec.start(); }
  catch (e) {
    _killMic(ctx);
    micBtn?.classList.remove("listening");
    setMicStatus("Tap to speak");
    showToast("Cannot start mic. Allow microphone access.");
  }
}

// ══════════════════════════════════════════════════════════════════
// CONVERSATION MODE — with live re-translation on lang change
// ══════════════════════════════════════════════════════════════════

// Store last spoken text per panel for re-translation
const _convLastTranscript = { A: "", B: "" };
const _convLastFromLang   = { A: "", B: "" };

async function startConvListening(speaker) {
  const ctx      = _mic[speaker];
  const otherSpk = speaker === "A" ? "B" : "A";
  const fromSel  = `convLang${speaker}`;
  const toSel    = speaker === "A" ? "convLangB" : "convLangA";
  const micBtnId = `micBtn${speaker}`;
  const statId   = `micStatus${speaker}`;

  const fromLang   = document.getElementById(fromSel)?.value || "en";
  const toLang     = document.getElementById(toSel)?.value   || "en";
  const speechCode = LANG_CONFIG[fromLang]?.speechCode || "en-US";
  const micBtn     = document.getElementById(micBtnId);

  if (ctx.state === MicState.LISTENING) {
    if (ctx.rec) try { ctx.rec.stop(); } catch(_){}
    ctx.state = MicState.STOPPED;
    micBtn?.classList.remove("listening");
    setMicStatus("Tap to speak again", statId);
    return;
  }

  _killMic(ctx);
  _killMic(_mic[otherSpk]);
  document.getElementById(`micBtn${otherSpk}`)?.classList.remove("listening");
  setMicStatus("Tap to speak", `micStatus${otherSpk}`);

  if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
    showToast("Voice not supported. Use Chrome."); return;
  }

  const SR  = window.SpeechRecognition || window.webkitSpeechRecognition;
  const rec = new SR();
  rec.lang = speechCode; rec.interimResults = false; rec.maxAlternatives = 3;

  ctx.rec = rec; ctx.state = MicState.LISTENING;
  micBtn?.classList.add("listening");
  setMicStatus("Listening…", statId);

  rec.onresult = async (e) => {
    let best = "", bconf = -1;
    for (let i = 0; i < e.results[0].length; i++) {
      const a = e.results[0][i];
      if (a.confidence > bconf) { bconf = a.confidence; best = a.transcript; }
    }
    const transcript = best.trim();
    if (!transcript || transcript === ctx.last) return;
    ctx.last = transcript; ctx.state = MicState.STOPPED;
    micBtn?.classList.remove("listening");
    setMicStatus("Translating…", statId);

    _convLastTranscript[speaker] = transcript;
    _convLastFromLang[speaker]   = fromLang;

    const origEl  = document.getElementById(`originalText${speaker}`);
    const transEl = document.getElementById(`translatedText${speaker}`);
    const playBtn = document.getElementById(`playBtn${speaker}`);

    if (origEl)  origEl.textContent  = transcript;
    if (transEl) transEl.textContent = "…";

    const translated = await translateText(transcript, fromLang, toLang);
    if (transEl) transEl.textContent = translated || "—";
    if (playBtn) playBtn.style.display = translated ? "flex" : "none";
    setMicStatus("Tap to speak again", statId);

    if (translated) await autoPlay(translated, toLang, "", transEl);
    ctx.rec = null;
  };

  rec.onerror = (e) => {
    ctx.state = MicState.IDLE; ctx.rec = null;
    micBtn?.classList.remove("listening");
    setMicStatus("Tap to speak", statId);
    if (e.error !== "aborted") showToast("Mic: " + e.error);
  };

  rec.onend = () => {
    micBtn?.classList.remove("listening");
    if (ctx.state === MicState.LISTENING) {
      ctx.state = MicState.IDLE;
      setMicStatus("Tap to speak", statId);
    }
    ctx.rec = null;
  };

  try { rec.start(); }
  catch (e) { _killMic(ctx); micBtn?.classList.remove("listening"); setMicStatus("Tap to speak", statId); }
}

// Re-translate when conversation language changes
async function onConvLangChange(speaker) {
  const fromSel = `convLang${speaker}`;
  const toSel   = speaker === "A" ? "convLangB" : "convLangA";
  const toLang  = document.getElementById(toSel)?.value || "en";

  localStorage.setItem(`vaani_lang_convLang${speaker}`, document.getElementById(fromSel)?.value || "en");

  const transcript = _convLastTranscript[speaker];
  const origFrom   = _convLastFromLang[speaker];
  if (!transcript || !origFrom) return;

  const transEl = document.getElementById(`translatedText${speaker}`);
  const playBtn = document.getElementById(`playBtn${speaker}`);
  if (transEl) transEl.textContent = "…";

  const translated = await translateText(transcript, origFrom, toLang);
  if (transEl) transEl.textContent = translated || "—";
  if (playBtn) playBtn.style.display = translated ? "flex" : "none";
  if (translated) await autoPlay(translated, toLang, "", transEl);
}

// ── SINGLE RESULT DISPLAY HELPERS ─────────────────────────────────
function clearSingleResults() {
  const s = document.getElementById("resultsSection");
  if (s) s.style.display = "none";
  const o = document.getElementById("originalText");
  const t = document.getElementById("translatedText");
  const a = document.getElementById("actionBtns");
  if (o) o.textContent = "—";
  if (t) t.textContent = "—";
  if (a) a.style.display = "none";
  resetTimeline();
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
  if (t) t.textContent  = "…";
  if (a) a.style.display = "none";
}

function showFinalTranslation(original, translated) {
  const t = document.getElementById("translatedText");
  const a = document.getElementById("actionBtns");
  if (t) t.textContent  = translated || "—";
  if (a) a.style.display = translated ? "flex" : "none";
  showTimeline("");
}

// ── TEXT MODE ─────────────────────────────────────────────────────
async function translateTypedText() {
  const area = document.getElementById("textInputArea");
  const raw  = area?.value?.trim();
  if (!raw) { showToast("Please enter some text"); return; }

  const fromLang = document.getElementById("fromLang")?.value || "en";
  const toLang   = document.getElementById("toLang")?.value   || "en";

  const btn = document.getElementById("translateTextBtn");
  if (btn) { btn.disabled = true; btn.textContent = "Translating…"; }

  showOriginalText(raw);
  setTranslating();

  const translated = await translateText(raw, fromLang, toLang);
  showFinalTranslation(raw, translated);

  if (btn) { btn.disabled = false; btn.textContent = "Translate"; }

  if (translated) {
    saveToHistory(raw, translated, fromLang, toLang);
    const transEl = document.getElementById("translatedText");
    await autoPlay(translated, toLang, "", transEl);
  }
}

// ── LANGUAGE CHANGE ───────────────────────────────────────────────
async function onLanguageChange() {
  const fromLang = document.getElementById("fromLang")?.value || "en";
  const toLang   = document.getElementById("toLang")?.value   || "en";

  localStorage.setItem("vaani_lang_fromLang", fromLang);
  localStorage.setItem("vaani_lang_toLang",   toLang);

  const transEl = document.getElementById("translatedText");
  const actEl   = document.getElementById("actionBtns");
  if (transEl) transEl.textContent  = "—";
  if (actEl)   actEl.style.display  = "none";

  const origText = (document.getElementById("originalText")?.textContent || "").trim();
  if (origText && origText !== "—" && origText !== "…") {
    if (transEl) transEl.textContent = "…";
    const translated = await translateText(origText, fromLang, toLang);
    if (transEl) transEl.textContent  = translated || "—";
    if (actEl)   actEl.style.display  = translated ? "flex" : "none";
    if (translated) await autoPlay(translated, toLang, "", transEl);
  }
}

// ── SWAP ──────────────────────────────────────────────────────────
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

  const newSource = (transText && transText !== "—" && transText !== "…") ? transText : origText;
  if (!newSource || newSource === "—") return;

  showOriginalText(newSource);
  setTranslating();

  const translated = await translateText(newSource, prevTo, prevFrom);
  showFinalTranslation(newSource, translated);
  if (translated) {
    const transEl = document.getElementById("translatedText");
    await autoPlay(translated, prevFrom, "", transEl);
  }
}

// ── INPUT MODE TOGGLE ──────────────────────────────────────────────
function switchInputMode(mode) {
  const vSec = document.getElementById("voiceInput");
  const tSec = document.getElementById("textInput");
  const vBtn = document.getElementById("voiceModeBtn");
  const tBtn = document.getElementById("textModeBtn");
  if (mode === "voice") {
    if (vSec) vSec.style.display = "block";
    if (tSec) tSec.style.display = "none";
    vBtn?.classList.add("active"); tBtn?.classList.remove("active");
  } else {
    if (vSec) vSec.style.display = "none";
    if (tSec) tSec.style.display = "block";
    tBtn?.classList.add("active"); vBtn?.classList.remove("active");
  }
}

// ── PLAY BUTTONS ─────────────────────────────────────────────────
async function playAudio() {
  if (_curAudio) { toggleAudio(); return; }
  const t = document.getElementById("translatedText")?.textContent;
  const l = document.getElementById("toLang")?.value;
  const el = document.getElementById("translatedText");
  if (t && t !== "—" && t !== "…") await autoPlay(t, l, "", el);
}
async function playAudioA() {
  if (_curAudio) { toggleAudio(); return; }
  const t = document.getElementById("translatedTextA")?.textContent;
  const l = document.getElementById("convLangB")?.value;
  const el = document.getElementById("translatedTextA");
  if (t && t !== "—") await autoPlay(t, l, "", el);
}
async function playAudioB() {
  if (_curAudio) { toggleAudio(); return; }
  const t = document.getElementById("translatedTextB")?.textContent;
  const l = document.getElementById("convLangA")?.value;
  const el = document.getElementById("translatedTextB");
  if (t && t !== "—") await autoPlay(t, l, "", el);
}
async function playImgAudio() {
  if (_curAudio) { toggleAudio(); return; }
  const t = document.getElementById("imgTranslatedText")?.textContent;
  const l = document.getElementById("imgToLang")?.value;
  const el = document.getElementById("imgTranslatedText");
  if (t && t !== "—") await autoPlay(t, l, "Img", el);
}
async function playPhrase(text, lang) {
  if (text) await autoPlay(text, lang);
}

// ── COPY ──────────────────────────────────────────────────────────
function copyTranslation() {
  const t = document.getElementById("translatedText")?.textContent;
  if (t && t !== "—") navigator.clipboard.writeText(t).then(() => showToast("Copied!")).catch(() => {});
}
function copyText(id) {
  const t = document.getElementById(id)?.textContent;
  if (t && t !== "—") navigator.clipboard.writeText(t).then(() => showToast("Copied!")).catch(() => {});
}

// ── LANGUAGE SELECT HELPERS ────────────────────────────────────────
function buildLangOptions(sel) {
  let html = "";
  LANG_GROUPS.forEach(g => {
    const opts = g.langs.filter(c => LANG_CONFIG[c])
      .map(c => `<option value="${c}"${c === sel ? " selected" : ""}>${LANG_CONFIG[c].name}</option>`)
      .join("");
    if (opts) html += `<optgroup label="${g.label}">${opts}</optgroup>`;
  });
  return html;
}

function initLanguageSelects() {
  const defaults = { fromLang:"te", toLang:"ta", travelFromLang:"te", travelToLang:"hi", imgFromLang:"te", imgToLang:"en", convLangA:"te", convLangB:"ta" };
  Object.entries(defaults).forEach(([id, def]) => {
    const el = document.getElementById(id);
    if (!el) return;
    const saved = localStorage.getItem(`vaani_lang_${id}`);
    const val   = (saved && LANG_CONFIG[saved]) ? saved : def;
    el.innerHTML = buildLangOptions(val);
    el.value     = val;
  });

  document.getElementById("fromLang")?.addEventListener("change", onLanguageChange);
  document.getElementById("toLang")?.addEventListener("change",   onLanguageChange);

  // Conversation lang change with re-translation
  document.getElementById("convLangA")?.addEventListener("change", () => onConvLangChange("A"));
  document.getElementById("convLangB")?.addEventListener("change", () => onConvLangChange("B"));

  ["travelFromLang","travelToLang","imgFromLang","imgToLang"].forEach(id => {
    document.getElementById(id)?.addEventListener("change", () => {
      localStorage.setItem(`vaani_lang_${id}`, document.getElementById(id).value);
    });
  });
}

// ══════════════════════════════════════════════════════════════════
// TRAVEL HELPER — with custom sentences, delete, custom categories
// ══════════════════════════════════════════════════════════════════
let _cat = "food";
let _tCache = {};
let _tTimer = null;

const TRAVEL_PHRASES_DEFAULT = {
  food:      [
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
    { en:"Please call the police." },  { en:"I need a doctor." },
    { en:"Where is the hospital?" },   { en:"I have lost my wallet." },
    { en:"This is an emergency!" },    { en:"Help me please!" },
    { en:"I need medicine." },         { en:"Call an ambulance." },
  ],
  shopping: [
    { en:"How much does this cost?" },    { en:"Can you reduce the price?" },
    { en:"I want to buy this." },         { en:"Do you have a smaller size?" },
    { en:"Where is the market?" },        { en:"Give me a discount." },
    { en:"Do you accept cards?" },        { en:"I want to return this." },
  ],
  greetings: [
    { en:"Hello, how are you?" },          { en:"Good morning." },
    { en:"Good evening." },                { en:"Thank you very much." },
    { en:"I don't understand." },          { en:"Please speak slowly." },
    { en:"What is your name?" },           { en:"Nice to meet you." },
  ],
};

// Storage helpers for custom travel data
function _getTravelCustom() {
  try { return JSON.parse(localStorage.getItem("vaani_travel_custom") || "{}"); } catch(_){ return {}; }
}
function _saveTravelCustom(data) {
  localStorage.setItem("vaani_travel_custom", JSON.stringify(data));
}
function _getTravelCategories() {
  // Returns ordered list of category keys
  const custom = _getTravelCustom();
  const defaultKeys = Object.keys(TRAVEL_PHRASES_DEFAULT);
  const customKeys  = Object.keys(custom).filter(k => !defaultKeys.includes(k));
  return [...defaultKeys, ...customKeys];
}
function _getPhrasesForCat(cat) {
  const custom = _getTravelCustom();
  const base   = TRAVEL_PHRASES_DEFAULT[cat] || [];
  const extra  = custom[cat] || [];
  return [...base, ...extra];
}

function _getTravelCatLabel(cat) {
  const LABELS = { food:"Food", transport:"Transport", hotel:"Hotel", emergency:"Emergency", shopping:"Shopping", greetings:"Greetings" };
  return LABELS[cat] || cat.charAt(0).toUpperCase() + cat.slice(1);
}

function _renderCatTabs() {
  const tabs = document.getElementById("catTabs");
  if (!tabs) return;
  const cats = _getTravelCategories();
  tabs.innerHTML = cats.map(cat => `
    <button class="cat-btn${_cat === cat ? " active" : ""}" onclick="selectCategory('${cat}',this)">
      ${_getTravelCatLabel(cat)}
    </button>
  `).join("") + `
    <button class="cat-btn cat-btn-add" onclick="addTravelCategory()" title="Add category">+</button>
  `;
}

function selectCategory(cat, btn) {
  _cat = cat;
  _renderCatTabs();
  clearTimeout(_tTimer);
  _tTimer = setTimeout(renderTravelPhrases, 150);
}

function loadTravelPhrases() {
  _renderCatTabs();
  clearTimeout(_tTimer);
  _tTimer = setTimeout(renderTravelPhrases, 200);
}

async function renderTravelPhrases() {
  const fromLang = document.getElementById("travelFromLang")?.value || "en";
  const toLang   = document.getElementById("travelToLang")?.value   || "en";
  const phrases  = _getPhrasesForCat(_cat);
  const list     = document.getElementById("phrasesList");
  const loading  = document.getElementById("travelLoading");
  if (!list) return;
  list.innerHTML = "";
  if (loading) loading.style.display = "flex";

  const custom       = _getTravelCustom();
  const defaultKeys  = Object.keys(TRAVEL_PHRASES_DEFAULT);
  const isBuiltin    = (phrase) => (TRAVEL_PHRASES_DEFAULT[_cat] || []).some(p => p.en === phrase.en);

  for (const phrase of phrases) {
    const fk = `${phrase.en}|${fromLang}`;
    const tk = `${phrase.en}|${toLang}`;
    let fromText = phrase.en;
    if (fromLang !== "en") {
      fromText = _tCache[fk] || await translateText(phrase.en, "en", fromLang);
      _tCache[fk] = fromText;
    }
    const toText = _tCache[tk] || await translateText(phrase.en, "en", toLang);
    _tCache[tk] = toText;

    const isCustomPhrase = !isBuiltin(phrase);

    const card = document.createElement("div");
    card.className = "phrase-card";

    const textsDiv = document.createElement("div");
    textsDiv.className = "phrase-texts";

    const origDiv = document.createElement("div");
    origDiv.className = "phrase-orig";
    origDiv.textContent = fromText;

    const transDiv = document.createElement("div");
    transDiv.className = "phrase-trans";
    transDiv.textContent = toText;

    const enDiv = document.createElement("div");
    enDiv.className = "phrase-en";
    enDiv.textContent = phrase.en;

    textsDiv.appendChild(origDiv);
    textsDiv.appendChild(transDiv);
    textsDiv.appendChild(enDiv);

    const btnsDiv = document.createElement("div");
    btnsDiv.className = "phrase-btns";

    const playBtn = document.createElement("button");
    playBtn.className = "phrase-btn phrase-play";
    playBtn.textContent = "Play";
    playBtn.dataset.text = toText;
    playBtn.dataset.lang = toLang;
    playBtn.addEventListener("click", function() {
      autoPlay(this.dataset.text, this.dataset.lang);
    });

    const copyBtn = document.createElement("button");
    copyBtn.className = "phrase-btn phrase-copy";
    copyBtn.textContent = "Copy";
    copyBtn.dataset.text = toText;
    copyBtn.addEventListener("click", function() {
      navigator.clipboard.writeText(this.dataset.text).then(() => showToast("Copied!")).catch(() => {});
    });

    btnsDiv.appendChild(playBtn);
    btnsDiv.appendChild(copyBtn);

    // Delete button for custom phrases
    if (isCustomPhrase) {
      const delBtn = document.createElement("button");
      delBtn.className = "phrase-btn phrase-del";
      delBtn.textContent = "✕";
      delBtn.title = "Delete phrase";
      const phraseEn = phrase.en;
      delBtn.addEventListener("click", () => {
        deleteTravelPhrase(_cat, phraseEn);
      });
      btnsDiv.appendChild(delBtn);
    }

    card.appendChild(textsDiv);
    card.appendChild(btnsDiv);
    list.appendChild(card);
  }

  // "Add sentence" button at bottom
  const addRow = document.createElement("div");
  addRow.className = "phrase-add-row";
  addRow.innerHTML = `
    <input type="text" id="newPhraseInput" class="phrase-add-input" placeholder="Add a custom sentence in English…">
    <button class="phrase-btn phrase-play phrase-add-btn" onclick="addTravelPhrase()">Add</button>
  `;
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
  custom[_cat].push({ en: val });
  _saveTravelCustom(custom);
  if (input) input.value = "";
  showToast("Phrase added!");
  clearTimeout(_tTimer);
  _tTimer = setTimeout(renderTravelPhrases, 100);
}

function deleteTravelPhrase(cat, phraseEn) {
  const custom = _getTravelCustom();
  if (!custom[cat]) return;
  custom[cat] = custom[cat].filter(p => p.en !== phraseEn);
  _saveTravelCustom(custom);
  showToast("Phrase removed");
  clearTimeout(_tTimer);
  _tTimer = setTimeout(renderTravelPhrases, 100);
}

function addTravelCategory() {
  const name = prompt("New category name:");
  if (!name || !name.trim()) return;
  const key = name.trim().toLowerCase().replace(/\s+/g, "_");
  const custom = _getTravelCustom();
  if (custom[key] || TRAVEL_PHRASES_DEFAULT[key]) { showToast("Category already exists"); return; }
  custom[key] = [];
  _saveTravelCustom(custom);
  _cat = key;
  _renderCatTabs();
  showToast(`Category "${name}" added!`);
  clearTimeout(_tTimer);
  _tTimer = setTimeout(renderTravelPhrases, 100);
}

// ══════════════════════════════════════════════════════════════════
// OCR BULLET POINT FIX
// ══════════════════════════════════════════════════════════════════

/**
 * Normalize OCR'd bullet characters.
 * Tesseract often misreads • ● ■ ▪ → "e" or "|" or "o"
 * This heuristic detects list-like lines and restores bullets.
 */
function _fixBullets(text) {
  if (!text) return text;
  const lines = text.split(/\r?\n/);
  const fixed = lines.map((line, idx) => {
    let l = line;

    // Replace known OCR bullet misreads at start of line
    // Pattern: line starts with isolated "e", "o", "|", "·", "•", "●", "■", "▪", "-", "*"
    // followed by a space and actual text
    l = l.replace(/^([e|o·•●■▪◦‣⁃➢➤►▶→]\s+)/, (match, bullet) => "• ");
    l = l.replace(/^([\-\*]\s+)/, "• ");

    // Numbered list: "1." "2." etc — preserve
    // Already fine, no change needed

    // Double-"e" bullet artifact: "e e Item" → "• Item"
    l = l.replace(/^(e\s+e\s+)/, "• ");

    return l;
  });
  return fixed.join("\n");
}

// ══════════════════════════════════════════════════════════════════
// GOOGLE VISION OCR
// ══════════════════════════════════════════════════════════════════

async function _googleVisionOCR(blob, langCode) {
  if (!VISION_API_KEY) return null;

  const langHintMap = {
    "te":"te","ta":"ta","hi":"hi","kn":"kn","ml":"ml","mr":"mr","bn":"bn",
    "gu":"gu","pa":"pa","ur":"ur","or":"or","as":"as","ne":"ne","sa":"sa",
    "en":"en","sd":"ur","mai":"hi","doi":"hi","kok":"mr","bho":"hi",
    "mwr":"hi","tcy":"kn","ks":"ur",
  };
  const bcp47 = langHintMap[langCode] || "en";

  try {
    const arrayBuf = await blob.arrayBuffer();
    const bytes    = new Uint8Array(arrayBuf);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    const b64 = btoa(binary);

    const payload = {
      requests: [{
        image: { content: b64 },
        features: [{ type: "DOCUMENT_TEXT_DETECTION", maxResults: 1 }],
        imageContext: { languageHints: [bcp47, "en"] }
      }]
    };

    const r = await fetch(`${VISION_URL}?key=${VISION_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000)
    });

    if (!r.ok) { console.warn("[Vision] HTTP", r.status); return null; }

    const data = await r.json();
    const resp = data.responses?.[0];
    if (!resp) return null;
    if (resp.error) { console.warn("[Vision] API error:", resp.error); return null; }

    const fullAnnotation = resp.fullTextAnnotation;
    if (fullAnnotation) {
      const reconstructed = _reconstructVisionText(fullAnnotation);
      if (reconstructed && reconstructed.length > 2) {
        return _fixBullets(reconstructed);
      }
    }

    const simple = resp.textAnnotations?.[0]?.description;
    if (simple && simple.trim().length > 2) {
      return _fixBullets(simple.trim());
    }

    return null;
  } catch (e) {
    console.warn("[Vision OCR]", e.message);
    return null;
  }
}

function _reconstructVisionText(fullAnnotation) {
  const pages = fullAnnotation.pages;
  if (!pages || pages.length === 0) {
    return (fullAnnotation.text || "").trim();
  }

  const blockTexts = [];

  for (const page of pages) {
    for (const block of (page.blocks || [])) {
      const paraTexts = [];

      for (const paragraph of (block.paragraphs || [])) {
        let paraText = "";

        for (const word of (paragraph.words || [])) {
          let wordText = "";
          for (const symbol of (word.symbols || [])) {
            wordText += symbol.text || "";
            const breakType = symbol.property?.detectedBreak?.type || "";
            if (breakType === "LINE_BREAK" || breakType === "EOL_SURE_SPACE") {
              wordText += "\n";
            } else if (breakType === "HYPHEN") {
              wordText += "-";
            } else if (breakType === "SPACE" || breakType === "SURE_SPACE") {
              wordText += " ";
            }
          }
          paraText += wordText;
        }

        paraText = paraText
          .replace(/ +\n/g, "\n")
          .replace(/\n +/g, "\n")
          .replace(/ {2,}/g, " ")
          .trim();

        if (paraText) paraTexts.push(paraText);
      }

      if (paraTexts.length > 0) {
        blockTexts.push(paraTexts.join("\n"));
      }
    }
  }

  if (blockTexts.length > 0) {
    return blockTexts.join("\n\n").trim();
  }

  return (fullAnnotation.text || "").trim();
}

// ── Load Tesseract.js lazily ───────────────────────────────────────
function _loadTesseract() {
  return new Promise((resolve, reject) => {
    if (window.Tesseract) { resolve(window.Tesseract); return; }
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.1.0/tesseract.min.js";
    s.onload  = () => resolve(window.Tesseract);
    s.onerror = () => reject(new Error("Failed to load Tesseract.js"));
    document.head.appendChild(s);
  });
}

// ── Load Cropper.js lazily ────────────────────────────────────────
function _loadCropper() {
  return new Promise((resolve, reject) => {
    if (window.Cropper) { resolve(window.Cropper); return; }
    if (!document.getElementById("vaani-cropper-css")) {
      const link = document.createElement("link");
      link.id   = "vaani-cropper-css";
      link.rel  = "stylesheet";
      link.href = "https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.6.2/cropper.min.css";
      document.head.appendChild(link);
    }
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.6.2/cropper.min.js";
    s.onload  = () => resolve(window.Cropper);
    s.onerror = () => reject(new Error("Failed to load Cropper.js"));
    document.head.appendChild(s);
  });
}

const TESS_LANG_MAP = {
  te:"tel", ta:"tam", hi:"hin", kn:"kan", ml:"mal", mr:"mar",
  bn:"ben", gu:"guj", pa:"pan", ur:"urd", or:"ori", as:"asm",
  ne:"nep", sa:"san", sd:"snd", mai:"hin", doi:"hin", kok:"mar",
  bho:"hin", mwr:"hin", tcy:"kan", ks:"urd", sat:"ben",
  "mni-Mtei":"ben", lus:"eng", brx:"hin", awa:"hin", mag:"hin",
  hne:"hin", en:"eng",
};

// ── Optimized image resize for OCR (target ~1200px max dimension) ──
function _optimizeImageForOCR(file) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 1400;
      let { width: w, height: h } = img;

      // Only scale up if too small; scale down if too large
      if (w > MAX || h > MAX) {
        const scale = MAX / Math.max(w, h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      } else if (w < 800) {
        const scale = 800 / w;
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }

      const canvas = document.createElement("canvas");
      canvas.width  = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);

      // Contrast enhancement
      const imageData = ctx.getImageData(0, 0, w, h);
      const d = imageData.data;
      for (let i = 0; i < d.length; i += 4) {
        const gray = 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2];
        const c = Math.min(255, Math.max(0, 1.7 * (gray - 128) + 128));
        d[i] = d[i+1] = d[i+2] = c;
      }
      ctx.putImageData(imageData, 0, 0);

      canvas.toBlob(blob => resolve(blob || file), "image/png");
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

// ── Preprocess image for Tesseract (legacy compat) ────────────────
function _preprocessImage(file) {
  return _optimizeImageForOCR(file);
}

// ── Run Tesseract OCR ──────────────────────────────────────────────
async function _runOCR(blob, langCode) {
  const Tesseract = await _loadTesseract();
  const tessLang  = TESS_LANG_MAP[langCode] || "eng";
  const langStr   = tessLang === "eng" ? "eng" : `${tessLang}+eng`;

  const statusEl = document.getElementById("imgStatus");
  const worker = await Tesseract.createWorker(langStr, 1, {
    logger: m => {
      if (m.status === "recognizing text" && statusEl) {
        const pct = Math.round((m.progress || 0) * 100);
        statusEl.textContent = `Recognizing text… ${pct}%`;
      }
    }
  });

  try {
    const { data: { text } } = await worker.recognize(blob);
    await worker.terminate();
    return (text || "").trim();
  } catch (e) {
    try { await worker.terminate(); } catch(_){}
    throw e;
  }
}

// ── OCR post-processing with bullet fix ───────────────────────────
function _cleanOcrText(raw) {
  if (!raw) return "";

  let lines = raw.split(/\r?\n/);

  lines = lines.map(line => {
    line = line
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, " ")
      .replace(/[|]{2,}/g, " ")
      .replace(/_{3,}/g, " ")
      .replace(/={3,}/g, " ")
      .replace(/-{3,}/g, " ")
      .replace(/\.{4,}/g, "… ")
      .replace(/[~^`#*\\]{2,}/g, " ");

    const tokens = line.split(/\s+/);
    const cleanTokens = tokens.filter(tok => {
      if (!tok) return false;
      if (/[\p{L}\p{N}]/u.test(tok)) return true;
      if (/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{FE00}-\u{FEFF}]/u.test(tok)) return true;
      return false;
    });

    return cleanTokens.join(" ").trim();
  });

  const seen = new Set();
  lines = lines.filter(line => {
    const norm = line.trim();
    if (!norm) return false;
    if (seen.has(norm)) return false;
    seen.add(norm);
    return true;
  });

  let result = lines.join("\n");
  result = result
    .replace(/\n{3,}/g, "\n\n")
    .replace(/ {2,}/g, " ")
    .replace(/ ([.,!?:;])/g, "$1")
    .trim();

  return _fixBullets(result);
}

// ══════════════════════════════════════════════════════════════════
// IMAGE EDITING — Rotation + Improved Cropping
// ══════════════════════════════════════════════════════════════════

let _imgCurrentFile  = null;
let _imgCroppedBlob  = null;
let _cropperInstance = null;
let _cropRotation    = 0;

function openImagePreview(src) {
  const existing = document.getElementById("vaaniImgModal");
  if (existing) existing.remove();

  const modal = document.createElement("div");
  modal.id = "vaaniImgModal";
  modal.className = "vaani-img-modal";
  modal.innerHTML = `
    <div class="vim-backdrop"></div>
    <div class="vim-content">
      <button class="vim-close" aria-label="Close preview">
        <svg viewBox="0 0 24 24" width="20" height="20"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
      <img class="vim-img" src="${src}" alt="Full preview">
    </div>`;

  document.body.appendChild(modal);
  requestAnimationFrame(() => modal.classList.add("vim-open"));

  const close = () => {
    modal.classList.remove("vim-open");
    setTimeout(() => modal.remove(), 300);
  };

  modal.querySelector(".vim-backdrop").addEventListener("click", close);
  modal.querySelector(".vim-close").addEventListener("click", close);

  const onKey = (e) => { if (e.key === "Escape") { close(); document.removeEventListener("keydown", onKey); } };
  document.addEventListener("keydown", onKey);
}

async function _openCropModal(file, onConfirm) {
  const existing = document.getElementById("vaaniCropModal");
  if (existing) existing.remove();
  if (_cropperInstance) { try { _cropperInstance.destroy(); } catch(_){} _cropperInstance = null; }

  _cropRotation = 0;
  await _loadCropper();

  const objectUrl = URL.createObjectURL(file);

  const modal = document.createElement("div");
  modal.id = "vaaniCropModal";
  modal.className = "vaani-crop-modal";
  modal.innerHTML = `
    <div class="vcm-backdrop"></div>
    <div class="vcm-content">
      <div class="vcm-header">
        <span class="vcm-title">Crop &amp; Rotate Image</span>
        <button class="vcm-close" aria-label="Cancel crop">
          <svg viewBox="0 0 24 24" width="18" height="18"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="vcm-rotate-bar">
        <button class="vcm-rot-btn" id="vcmRotLeft" title="Rotate Left 90°">
          <svg viewBox="0 0 24 24" width="16" height="16"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.43"/></svg>
          Rotate Left
        </button>
        <span class="vcm-rot-label" id="vcmRotLabel">0°</span>
        <button class="vcm-rot-btn" id="vcmRotRight" title="Rotate Right 90°">
          <svg viewBox="0 0 24 24" width="16" height="16"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.49-3.43"/></svg>
          Rotate Right
        </button>
      </div>
      <div class="vcm-body">
        <img id="vcmCropImg" src="${objectUrl}" alt="Crop" style="max-width:100%">
      </div>
      <div class="vcm-footer">
        <button class="vcm-btn vcm-cancel">Cancel</button>
        <button class="vcm-btn vcm-confirm">Crop &amp; Process</button>
      </div>
    </div>`;

  document.body.appendChild(modal);
  requestAnimationFrame(() => modal.classList.add("vcm-open"));

  const cropImg = modal.querySelector("#vcmCropImg");
  cropImg.onload = () => {
    _cropperInstance = new Cropper(cropImg, {
      viewMode: 1,
      autoCropArea: 0.9,
      responsive: true,
      background: false,
      movable: true,
      zoomable: true,
      rotatable: true,
      scalable: true,
      aspectRatio: NaN,        // FREE crop — no fixed ratio
      cropBoxResizable: true,
      cropBoxMovable: true,
      toggleDragModeOnDblclick: true,
    });
  };

  // Rotation buttons
  modal.querySelector("#vcmRotLeft").addEventListener("click", () => {
    _cropRotation = (_cropRotation - 90 + 360) % 360;
    _cropperInstance?.rotate(-90);
    modal.querySelector("#vcmRotLabel").textContent = `${_cropRotation}°`;
  });
  modal.querySelector("#vcmRotRight").addEventListener("click", () => {
    _cropRotation = (_cropRotation + 90) % 360;
    _cropperInstance?.rotate(90);
    modal.querySelector("#vcmRotLabel").textContent = `${_cropRotation}°`;
  });

  const close = () => {
    modal.classList.remove("vcm-open");
    setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
      modal.remove();
      if (_cropperInstance) { try { _cropperInstance.destroy(); } catch(_){} _cropperInstance = null; }
    }, 300);
  };

  modal.querySelector(".vcm-cancel").addEventListener("click", close);
  modal.querySelector(".vcm-close").addEventListener("click", close);
  modal.querySelector(".vcm-backdrop").addEventListener("click", close);

  modal.querySelector(".vcm-confirm").addEventListener("click", () => {
    if (!_cropperInstance) return;
    const canvas = _cropperInstance.getCroppedCanvas({ maxWidth: 2000, maxHeight: 2000 });
    canvas.toBlob(blob => {
      close();
      if (blob) onConfirm(blob);
    }, "image/png");
  });
}

// ── Show "Change" options modal ───────────────────────────────────
function _openChangeModal() {
  const existing = document.getElementById("vaaniChangeModal");
  if (existing) existing.remove();

  const modal = document.createElement("div");
  modal.id = "vaaniChangeModal";
  modal.className = "vaani-change-modal";
  modal.innerHTML = `
    <div class="vchm-backdrop"></div>
    <div class="vchm-sheet">
      <div class="vchm-title">Change Image</div>
      <button class="vchm-opt" id="vchm-gallery">
        <svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
        Upload from Gallery
      </button>
      <button class="vchm-opt" id="vchm-camera">
        <svg viewBox="0 0 24 24"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
        Take a Photo (Back Camera)
      </button>
      <button class="vchm-cancel">Cancel</button>
    </div>`;

  document.body.appendChild(modal);
  requestAnimationFrame(() => modal.classList.add("vchm-open"));

  const close = () => {
    modal.classList.remove("vchm-open");
    setTimeout(() => modal.remove(), 300);
  };

  modal.querySelector(".vchm-backdrop").addEventListener("click", close);
  modal.querySelector(".vchm-cancel").addEventListener("click", close);

  modal.querySelector("#vchm-gallery").addEventListener("click", () => {
    close();
    const input = document.getElementById("imageInput");
    if (input) { input.value = ""; input.click(); }
  });

  modal.querySelector("#vchm-camera").addEventListener("click", async () => {
    close();
    await _captureBackCamera();
  });
}

// ══════════════════════════════════════════════════════════════════
// BACK CAMERA CAPTURE via getUserMedia
// ══════════════════════════════════════════════════════════════════

let _cameraStream  = null;
let _cameraModal   = null;

async function _captureBackCamera() {
  if (_cameraModal) { _cameraModal.remove(); _cameraModal = null; }
  _stopCameraStream();

  const modal = document.createElement("div");
  modal.id = "vaaniCameraModal";
  modal.className = "vaani-camera-modal";
  modal.innerHTML = `
    <div class="vcam-backdrop"></div>
    <div class="vcam-content">
      <div class="vcam-header">
        <span class="vcam-title">📷 Back Camera</span>
        <button class="vcam-close">
          <svg viewBox="0 0 24 24" width="18" height="18"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="vcam-body">
        <video id="vcamVideo" autoplay playsinline muted style="width:100%;border-radius:8px;background:#000"></video>
        <canvas id="vcamCanvas" style="display:none"></canvas>
        <div class="vcam-status" id="vcamStatus">Starting camera…</div>
      </div>
      <div class="vcam-footer">
        <button class="vcm-btn vcm-cancel" id="vcamCancelBtn">Cancel</button>
        <button class="vcm-btn vcm-confirm" id="vcamCaptureBtn" disabled>
          <svg viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6" fill="currentColor"/></svg>
          Capture
        </button>
      </div>
    </div>`;

  document.body.appendChild(modal);
  _cameraModal = modal;
  requestAnimationFrame(() => modal.classList.add("vcm-open"));

  const close = () => {
    _stopCameraStream();
    modal.classList.remove("vcm-open");
    setTimeout(() => { modal.remove(); if (_cameraModal === modal) _cameraModal = null; }, 300);
  };

  modal.querySelector(".vcam-close").addEventListener("click", close);
  modal.querySelector(".vcam-backdrop").addEventListener("click", close);
  modal.querySelector("#vcamCancelBtn").addEventListener("click", close);

  const video      = modal.querySelector("#vcamVideo");
  const canvas     = modal.querySelector("#vcamCanvas");
  const statusEl   = modal.querySelector("#vcamStatus");
  const captureBtn = modal.querySelector("#vcamCaptureBtn");

  let stream = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { exact: "environment" } }
    });
    statusEl.textContent = "Back camera active — point at text";
  } catch (e1) {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      statusEl.textContent = "Camera active — point at text";
    } catch (e2) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
        statusEl.textContent = "Camera active (front — back not available)";
        showToast("Back camera unavailable, using front");
      } catch (e3) {
        statusEl.textContent = "Camera access denied";
        showToast("Camera access denied. Check permissions.");
        return;
      }
    }
  }

  _cameraStream = stream;
  video.srcObject = stream;
  captureBtn.disabled = false;

  captureBtn.addEventListener("click", () => {
    canvas.width  = video.videoWidth  || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(blob => {
      close();
      if (blob) processImageFile(blob);
    }, "image/jpeg", 0.95);
  });
}

function _stopCameraStream() {
  if (_cameraStream) {
    _cameraStream.getTracks().forEach(t => t.stop());
    _cameraStream = null;
  }
}

// ── Show preview with click-to-expand ─────────────────────────────
function _showPreviewBox(objectUrl) {
  const pb = document.getElementById("imgPreviewBox");
  const p  = document.getElementById("imgPreview");
  const b  = document.getElementById("imgTranslateBtn");
  const up = document.getElementById("uploadArea");

  if (p) {
    p.src = objectUrl;
    p.style.cursor = "zoom-in";
    p.onclick = () => openImagePreview(p.src);
  }
  if (pb) pb.style.display = "block";
  if (b)  b.style.display  = "flex";
  if (up) up.style.display = "none";
}

async function processImageFile(file) {
  if (!file || (!(file instanceof Blob))) {
    showToast("Please upload an image file");
    return;
  }
  _imgCurrentFile = file;

  await _openCropModal(file, (croppedBlob) => {
    _imgCroppedBlob = croppedBlob;
    const croppedUrl = URL.createObjectURL(croppedBlob);
    _showPreviewBox(croppedUrl);
    document.getElementById("imgResults").style.display = "none";
    document.getElementById("imgStatus").textContent = "";
    _resetEditableExtracted();
    resetTimeline("Img");
  });
}

function handleDrop(e) {
  e.preventDefault();
  document.getElementById("uploadArea")?.classList.remove("drag-over");
  const f = e.dataTransfer?.files?.[0];
  if (f) processImageFile(f);
}

function handleImageUpload(e) {
  const f = e.target?.files?.[0];
  if (f) processImageFile(f);
}

// ── Editable extracted text helpers ───────────────────────────────
function _resetEditableExtracted() {
  const ta = document.getElementById("imgExtractedTextEdit");
  if (ta) ta.value = "";
  const confirmBtn = document.getElementById("imgConfirmTranslateBtn");
  if (confirmBtn) confirmBtn.style.display = "none";
}

function _showEditableExtracted(text) {
  const ta = document.getElementById("imgExtractedTextEdit");
  const confirmBtn = document.getElementById("imgConfirmTranslateBtn");
  if (ta) {
    ta.value = text;
    ta.style.display = "block";
  }
  if (confirmBtn) confirmBtn.style.display = "flex";
}

async function confirmAndTranslate() {
  const ta = document.getElementById("imgExtractedTextEdit");
  const extractedText = (ta?.value || "").trim();
  if (!extractedText) { showToast("No text to translate"); return; }

  const fromLang = document.getElementById("imgFromLang")?.value || "en";
  const toLang   = document.getElementById("imgToLang")?.value   || "en";
  const status   = document.getElementById("imgStatus");
  const btn      = document.getElementById("imgConfirmTranslateBtn");

  if (btn) btn.disabled = true;
  if (status) status.textContent = "Translating…";

  let translated = "";
  if (fromLang === toLang) {
    translated = extractedText;
  } else {
    try {
      const paragraphs = extractedText.split(/\n\n+/);
      const translatedParas = await Promise.all(
        paragraphs.map(async (para) => {
          if (!para.trim()) return "";
          const lines = para.split("\n");
          const translatedLines = await Promise.all(
            lines.map(async (line) => {
              const l = line.trim();
              if (!l) return "";
              try { return await translateText(l, fromLang, toLang); } catch (_) { return l; }
            })
          );
          return translatedLines.join("\n");
        })
      );
      translated = translatedParas.join("\n\n").trim();
    } catch(tErr) {
      console.warn("[Image] Translation error:", tErr);
      translated = extractedText;
    }
  }

  const transEl = document.getElementById("imgTranslatedText");
  if (transEl) transEl.textContent = translated || "—";
  if (status) status.textContent = "Translation complete ✓";
  if (btn) btn.disabled = false;

  if (translated && translated !== extractedText) {
    await autoPlay(translated, toLang, "Img", transEl);
  }
}

// ══════════════════════════════════════════════════════════════════
// MAIN IMAGE TRANSLATE — Parallel OCR + Translation + Audio
// ══════════════════════════════════════════════════════════════════

async function translateImage() {
  const fromLang = document.getElementById("imgFromLang")?.value || "en";
  const toLang   = document.getElementById("imgToLang")?.value   || "en";
  const status   = document.getElementById("imgStatus");
  const btn      = document.getElementById("imgTranslateBtn");

  const sourceBlob = _imgCroppedBlob || _imgCurrentFile;

  if (!sourceBlob) { showToast("No image selected"); return; }

  if (btn)    btn.disabled = true;
  if (status) status.textContent = "Optimizing image…";
  document.getElementById("imgResults").style.display = "none";
  _resetEditableExtracted();
  resetTimeline("Img");

  try {
    // ── Step 1: Optimize image in background (non-blocking) ───────
    const optimizedBlobPromise = _optimizeImageForOCR(sourceBlob);

    // ── Step 2: Try Vision OCR (runs in parallel with optimization) ─
    if (status) status.textContent = "Running OCR…";

    let extractedText = "";
    let ocrEngine = "unknown";

    // Run Vision API on original blob immediately (no need to wait for optimization)
    const visionPromise = _googleVisionOCR(sourceBlob, fromLang);

    // Wait for both
    const [visionResult, optimizedBlob] = await Promise.all([visionPromise, optimizedBlobPromise]);

    if (visionResult && visionResult.length > 2) {
      extractedText = visionResult;
      ocrEngine = "Google Vision";
    } else {
      // ── Step 3: Backend OCR (parallel with client fallback setup) ──
      if (status) status.textContent = "Running server OCR…";

      const backendPromise = (async () => {
        try {
          const fd = new FormData();
          fd.append("file", optimizedBlob || sourceBlob, "image.png");
          fd.append("from_lang", fromLang);
          fd.append("to_lang", toLang);
          const resp = await fetch(`${API_URL}/image-translate`, {
            method:"POST", body:fd, signal:AbortSignal.timeout(40000)
          });
          if (resp.ok) {
            const d = await resp.json();
            return d;
          }
        } catch(fbErr) {
          console.warn("[Image] Backend error:", fbErr);
        }
        return null;
      })();

      const backendResult = await backendPromise;

      if (backendResult && backendResult.extracted && backendResult.extracted.length > 2) {
        if (backendResult.translated && backendResult.translated.trim()) {
          // Backend did OCR + translation together — fast path
          const extracted = backendResult.extracted;
          const translatedFromBackend = backendResult.translated.trim();

          _showEditableExtracted(extracted);
          document.getElementById("imgResults").style.display = "block";
          const transEl = document.getElementById("imgTranslatedText");
          if (transEl) transEl.textContent = translatedFromBackend;
          if (status) status.textContent = `OCR: ${backendResult.engine || "server"} ✓`;
          showTimeline("Img");
          // Start audio in background without blocking UI
          autoPlay(translatedFromBackend, toLang, "Img", transEl);
          return;
        }
        extractedText = backendResult.extracted;
        ocrEngine = backendResult.engine || "server";
      }

      if (!extractedText) {
        // ── Step 4: Tesseract.js client fallback ───────────────────
        if (status) status.textContent = "Loading Tesseract OCR…";
        try {
          const rawOcr = await _runOCR(optimizedBlob || sourceBlob, fromLang);
          extractedText = _cleanOcrText(rawOcr);
          ocrEngine = "Tesseract";
        } catch (ocrErr) {
          console.warn("[Image] Tesseract error:", ocrErr);
        }
      }
    }

    // ── Step 5: Show extracted (editable) ────────────────────────
    if (!extractedText || extractedText.length < 2) {
      _showEditableExtracted("");
      document.getElementById("imgTranslatedText").textContent = "No text detected in this image.";
      document.getElementById("imgResults").style.display = "block";
      if (status) status.textContent = "";
      return;
    }

    _showEditableExtracted(extractedText);
    if (status) status.textContent = `OCR: ${ocrEngine} ✓ — Translating…`;

    // ── Step 6: Translate (paragraph-aware) + start audio in parallel ─
    let translated = "";
    if (fromLang === toLang) {
      translated = extractedText;
    } else {
      const paragraphs = extractedText.split(/\n\n+/);
      const translatedParas = await Promise.all(
        paragraphs.map(async (para) => {
          if (!para.trim()) return "";
          const lines = para.split("\n");
          const translatedLines = await Promise.all(
            lines.map(async (line) => {
              const l = line.trim();
              if (!l) return "";
              try { return await translateText(l, fromLang, toLang); } catch (_) { return l; }
            })
          );
          return translatedLines.join("\n");
        })
      );
      translated = translatedParas.join("\n\n").trim();
    }

    const transEl = document.getElementById("imgTranslatedText");
    if (transEl) transEl.textContent = translated || "—";
    document.getElementById("imgResults").style.display = "block";
    if (status) status.textContent = `OCR: ${ocrEngine} ✓`;
    showTimeline("Img");

    if (translated && translated !== extractedText) {
      // Fire audio without awaiting — non-blocking
      autoPlay(translated, toLang, "Img", transEl);
    }
  } catch (e) {
    console.error("[Vaani] translateImage:", e);
    if (status) status.textContent = "Error: " + e.message;
    showToast("Image processing failed");
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ── HISTORY & FAVOURITES ──────────────────────────────────────────
function saveToHistory(orig, trans, fromLang, toLang) {
  try {
    const h = JSON.parse(localStorage.getItem("vaani_history") || "[]");
    if (h.length && h[0].original === orig && h[0].toLang === toLang) return;
    h.unshift({ original:orig, translated:trans, fromLang, toLang, ts:Date.now() });
    if (h.length > 200) h.splice(200);
    localStorage.setItem("vaani_history", JSON.stringify(h));
  } catch(_){}
}

// ══════════════════════════════════════════════════════════════════
// HISTORY PAGE
// ══════════════════════════════════════════════════════════════════
function renderHistory() {
  const list = document.getElementById("historyList");
  if (!list) return;

  const isLoggedIn = !!(window._vaaniCurrentUser);

  if (!isLoggedIn) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="es-icon">
          <svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        </div>
        <p class="es-title">Sign in to view history</p>
        <p class="es-sub">Sign in to save and view your translation history across devices.</p>
        <button class="btn-primary" style="margin-top:20px;padding:11px 28px;font-size:14px" onclick="signInWithGoogle()">
          <svg viewBox="0 0 24 24" width="16" height="16"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          Sign In
        </button>
      </div>`;
    return;
  }

  const hist = JSON.parse(localStorage.getItem("vaani_history") || "[]");
  if (!hist.length) {
    list.innerHTML = `<div class="empty-state"><div class="es-icon"><svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div><p class="es-title">No history yet</p><p class="es-sub">Start translating to see your history here.</p></div>`;
    return;
  }
  list.innerHTML = hist.map((h,i) => `
    <div class="hist-card">
      <div class="hist-langs">${LANG_NAMES[h.fromLang]||h.fromLang} → ${LANG_NAMES[h.toLang]||h.toLang}</div>
      <div class="hist-orig">${h.original}</div>
      <div class="hist-trans">${h.translated}</div>
      <div class="hist-actions">
        <button class="hist-btn" onclick="autoPlay(${JSON.stringify(h.translated)},${JSON.stringify(h.toLang)})">Play</button>
        <button class="hist-btn" onclick="navigator.clipboard.writeText(${JSON.stringify(h.translated)}).then(()=>showToast('Copied!'))">Copy</button>
        <button class="hist-btn" onclick="saveFavourite(${JSON.stringify(h.original)},${JSON.stringify(h.translated)},${JSON.stringify(h.fromLang)},${JSON.stringify(h.toLang)})">Save</button>
        <button class="hist-btn del" onclick="deleteHistory(${i})">Delete</button>
      </div>
    </div>`).join("");
}

function deleteHistory(i) {
  const h = JSON.parse(localStorage.getItem("vaani_history") || "[]");
  h.splice(i,1); localStorage.setItem("vaani_history", JSON.stringify(h)); renderHistory();
}

function saveSingleToFavourites() {
  const o = document.getElementById("originalText")?.textContent;
  const t = document.getElementById("translatedText")?.textContent;
  const f = document.getElementById("fromLang")?.value;
  const tl = document.getElementById("toLang")?.value;
  if (!t || t === "—" || t === "…") return;
  saveFavourite(o, t, f, tl);
}

function saveFavourite(orig, trans, fromLang, toLang) {
  try {
    const favs = JSON.parse(localStorage.getItem("vaani_favs") || "[]");
    if (favs.some(f => f.original === orig && f.toLang === toLang)) { showToast("Already saved!"); return; }
    favs.unshift({ original:orig, translated:trans, fromLang, toLang, ts:Date.now() });
    localStorage.setItem("vaani_favs", JSON.stringify(favs));
    showToast("Saved to favourites");
    renderFavourites();
  } catch(_){}
}

function renderFavourites() {
  const favs = JSON.parse(localStorage.getItem("vaani_favs") || "[]");
  const list = document.getElementById("favouritesList");
  if (!list) return;
  if (!favs.length) {
    list.innerHTML = `<div class="empty-state"><div class="es-icon"><svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></div><p class="es-title">No favourites yet</p><p class="es-sub">Tap the star after translating</p></div>`;
    return;
  }
  list.innerHTML = favs.map((f,i) => `
    <div class="hist-card fav-card">
      <div class="hist-langs">${LANG_NAMES[f.fromLang]||f.fromLang} → ${LANG_NAMES[f.toLang]||f.toLang}</div>
      <div class="hist-orig">${f.original}</div>
      <div class="hist-trans">${f.translated}</div>
      <div class="hist-actions">
        <button class="hist-btn" onclick="autoPlay(${JSON.stringify(f.translated)},${JSON.stringify(f.toLang)})">Play</button>
        <button class="hist-btn" onclick="navigator.clipboard.writeText(${JSON.stringify(f.translated)}).then(()=>showToast('Copied!'))">Copy</button>
        <button class="hist-btn del" onclick="deleteFavourite(${i})">Remove</button>
      </div>
    </div>`).join("");
}

function deleteFavourite(i) {
  const favs = JSON.parse(localStorage.getItem("vaani_favs") || "[]");
  favs.splice(i,1); localStorage.setItem("vaani_favs", JSON.stringify(favs)); renderFavourites();
}

// ══════════════════════════════════════════════════════════════════
// SETTINGS PAGE
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
      <div class="stg-row">
        <label class="stg-label">Default Source Language</label>
        <select class="stg-select" onchange="stgSaveLang('fromLang',this.value)">
          ${buildLangOptions(fromPref)}
        </select>
      </div>
      <div class="stg-row">
        <label class="stg-label">Default Target Language</label>
        <select class="stg-select" onchange="stgSaveLang('toLang',this.value)">
          ${buildLangOptions(toPref)}
        </select>
      </div>
      ${dialectInfo}
    </div>

    <div class="stg-section">
      <div class="stg-title">Appearance</div>
      <div class="stg-row">
        <label class="stg-label">Theme</label>
        <div class="stg-radios">
          <label class="stg-radio-lbl">
            <input type="radio" name="stgTheme" value="dark"
              ${theme === "dark" ? "checked" : ""} onchange="applyTheme('dark')">
            <span>Dark</span>
          </label>
          <label class="stg-radio-lbl">
            <input type="radio" name="stgTheme" value="light"
              ${theme === "light" ? "checked" : ""} onchange="applyTheme('light')">
            <span>Light</span>
          </label>
        </div>
      </div>
    </div>

    <div class="stg-section">
      <div class="stg-title">Data &amp; Cache</div>
      <div class="stg-btn-col">
        <button class="stg-btn stg-warn" onclick="stgClearHistory()">Clear Translation History</button>
        <button class="stg-btn stg-warn" onclick="stgClearFavs()">Clear Favourites</button>
        <button class="stg-btn stg-warn" onclick="stgClearTravel()">Clear Custom Travel Phrases</button>
        <button class="stg-btn stg-danger" onclick="stgResetAll()">Reset All App Data</button>
      </div>
    </div>

    <div class="stg-section">
      <div class="stg-title">About</div>
      <div class="stg-about">
        <div>Vaani — Indian Language Translator v5.0</div>
        <div>OCR: Google Vision API + Tesseract fallback</div>
        <div>Translation: Bhashini NMT + Google Translate fallback</div>
        <div>Speech: Bhashini TTS + gTTS fallback</div>
        <div>Camera: getUserMedia back-camera capture</div>
        <div>30+ Indian languages supported</div>
      </div>
    </div>
  `;
}

function stgSaveLang(field, val) {
  localStorage.setItem(`vaani_lang_${field}`, val);
  const el = document.getElementById(field);
  if (el && LANG_CONFIG[val]) el.value = val;
}

function applyTheme(t) {
  document.documentElement.setAttribute("data-theme", t);
  localStorage.setItem("vaani_theme", t);
}

function stgClearHistory() {
  if (!confirm("Clear all translation history?")) return;
  localStorage.removeItem("vaani_history");
  showToast("History cleared");
  renderHistory();
}
function stgClearFavs() {
  if (!confirm("Clear all favourites?")) return;
  localStorage.removeItem("vaani_favs");
  showToast("Favourites cleared");
  renderFavourites();
}
function stgClearTravel() {
  if (!confirm("Clear all custom travel phrases?")) return;
  localStorage.removeItem("vaani_travel_custom");
  _tCache = {};
  showToast("Custom travel phrases cleared");
}
function stgResetAll() {
  if (!confirm("Reset ALL app data? Cannot be undone.")) return;
  localStorage.clear();
  cacheClear();
  showToast("All data reset");
  setTimeout(() => location.reload(), 800);
}

// ── NAVIGATION ────────────────────────────────────────────────────
const PAGES = ["Home","Single","Conversation","Travel","Image","History","Favourites","Settings"];

function navigateTo(page) {
  if (!PAGES.includes(page)) page = "Home";
  PAGES.forEach(p => {
    document.getElementById(`page${p}`)?.classList.toggle("active", p === page);
    document.getElementById(`menu${p}`)?.classList.toggle("active", p === page);
  });
  closeMenu();
  history.pushState({ page }, "", `#${page.toLowerCase()}`);
  if (page === "Travel")     { _renderCatTabs(); loadTravelPhrases(); }
  if (page === "History")    renderHistory();
  if (page === "Favourites") renderFavourites();
  if (page === "Settings")   renderSettingsPage();
  Object.values(_mic).forEach(ctx => { _killMic(ctx); });
  ["micBtn","micBtnA","micBtnB"].forEach(id =>
    document.getElementById(id)?.classList.remove("listening")
  );
}
window.addEventListener("popstate", e => navigateTo(e.state?.page || "Home"));

// ── MENU ──────────────────────────────────────────────────────────
function toggleMenu() {
  document.getElementById("sideMenu")?.classList.toggle("open");
  document.getElementById("menuOverlay")?.classList.toggle("open");
}
function closeMenu() {
  document.getElementById("sideMenu")?.classList.remove("open");
  document.getElementById("menuOverlay")?.classList.remove("open");
}

// ── THEME ─────────────────────────────────────────────────────────
function toggleTheme() {
  const cur = document.documentElement.getAttribute("data-theme");
  applyTheme(cur === "dark" ? "light" : "dark");
}

// ── TOAST ─────────────────────────────────────────────────────────
let _toastTimer = null;
function showToast(msg) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove("show"), 2800);
}

// ── KEEP-ALIVE ────────────────────────────────────────────────────
function pingBackend() {
  fetch(`${API_URL}/ping`, { signal: AbortSignal.timeout(10000) })
    .then(r => r.json()).then(d => console.log("[Vaani] ping:", d.status)).catch(() => {});
}
pingBackend();
setInterval(pingBackend, 10 * 60 * 1000);

// Firebase stubs
if (typeof window.signInWithGoogle === "undefined") window.signInWithGoogle = () => showToast("Sign-in coming soon");
if (typeof window.signOutUser      === "undefined") window.signOutUser      = () => showToast("Signed out");

window._vaaniCurrentUser = null;
window._vaaniOnAuthChange = function(user) {
  window._vaaniCurrentUser = user || null;
  const histPage = document.getElementById("pageHistory");
  if (histPage && histPage.classList.contains("active")) {
    renderHistory();
  }
};

// ── INIT ──────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  applyTheme(localStorage.getItem("vaani_theme") || "dark");
  initLanguageSelects();

  _initTimelineControls("");
  _initTimelineControls("Img");

  const changeBtn = document.getElementById("imgChangeBtn");
  if (changeBtn) {
    changeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      _openChangeModal();
    });
  }

  const camSrcBtn = document.getElementById("cameraSrcBtn");
  if (camSrcBtn) {
    camSrcBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      await _captureBackCamera();
    });
  }

  const cameraInput = document.getElementById("cameraInput");
  if (cameraInput) {
    cameraInput.setAttribute("capture", "environment");
    cameraInput.addEventListener("change", handleImageUpload);
  }

  const hash = location.hash.replace("#","");
  navigateTo(PAGES.find(p => p.toLowerCase() === hash) || "Home");
  renderHistory();
  renderFavourites();

  detectUserLocation();
});
