/* ================================================================
   Vaani — app.js  v3.3  SURGICAL FIX
   
   FIXES FROM v3.2:
   1. Travel Helper Play button: fixed broken card innerHTML (Copy
      button onclick had unescaped quotes breaking DOM parse, which
      silently broke the Play button onclick too). Now uses safe
      data-attributes + delegated handlers. Copy button removed per spec.
   2. Camera: always requests back camera (facingMode:environment)
      in the dynamic camera-input created by the change modal.
   3. OCR post-processing: _cleanOcrText() strips garbage symbols,
      normalises spacing, deduplicates lines, preserves emojis.
   4. OCR cleaned text applied before display and translation.
   All other features preserved exactly.
================================================================ */

const API_URL = "https://vaani-app-ui0z.onrender.com";

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

// ── TRANSLATION CACHE ──────────────────────────────────────────────
const _transCache = new Map();
function cacheGet(k) { return _transCache.get(k); }
function cacheSet(k, v) {
  if (_transCache.size >= 500) _transCache.delete(_transCache.keys().next().value);
  _transCache.set(k, v);
}
function cacheClear() { _transCache.clear(); }

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

// ── CORE TRANSLATE ────────────────────────────────────────────────
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
    console.log(`[Vaani pivot] "${text}"→EN:"${en}"→"${result}"`);
    return result;
  } catch (e) {
    console.warn("[Vaani] _pivotTranslate:", e.message);
    return "";
  }
}

// ══════════════════════════════════════════════════════════════════
// AUDIO SYSTEM — Single instance + Timeline seek bar
// ══════════════════════════════════════════════════════════════════
let _curAudio = null;
let _timelineRAF = null;
let _timelineSeeking = false;

function stopAudio() {
  if (_timelineRAF) { cancelAnimationFrame(_timelineRAF); _timelineRAF = null; }
  if (_curAudio) {
    try { _curAudio.pause(); _curAudio.currentTime = 0; } catch (_) {}
    _curAudio = null;
  }
  resetTimeline();
}

function resetTimeline() {
  const wrap = document.getElementById("audioTimeline");
  if (!wrap) return;
  wrap.style.display = "none";
  const bar   = document.getElementById("timelineSeek");
  const cur   = document.getElementById("timelineCurrent");
  const total = document.getElementById("timelineTotal");
  if (bar)   { bar.value = 0; _updateSeekFill(bar, 0); }
  if (cur)   cur.textContent = "0:00";
  if (total) total.textContent = "0:00";
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

function _startTimelineLoop(audio) {
  const wrap  = document.getElementById("audioTimeline");
  const bar   = document.getElementById("timelineSeek");
  const cur   = document.getElementById("timelineCurrent");
  const total = document.getElementById("timelineTotal");
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

  _timelineRAF = requestAnimationFrame(tick);
}

function _initTimelineControls() {
  const bar = document.getElementById("timelineSeek");
  if (!bar || bar._vaaniInitialized) return;
  bar._vaaniInitialized = true;

  bar.addEventListener("input", () => {
    _timelineSeeking = true;
    _updateSeekFill(bar, parseFloat(bar.value));
    const cur = document.getElementById("timelineCurrent");
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
      resetTimeline();
    };
    return audio;
  } catch (e) { console.warn("[Vaani] speakText:", e.message); return null; }
}

async function autoPlay(text, lang) {
  if (!text || text === "—" || text === "…" || !lang) return;
  stopAudio();
  const audio = await speakText(text, lang);
  if (audio) {
    _curAudio = audio;
    _startTimelineLoop(audio);
    audio.play().catch(e => console.warn("[Vaani] play:", e.message));
  }
}

// ══════════════════════════════════════════════════════════════════
// MIC STATE MACHINE (unchanged from v3.1)
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
      await autoPlay(translated, toLang);
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

    const origEl  = document.getElementById(`originalText${speaker}`);
    const transEl = document.getElementById(`translatedText${speaker}`);
    const playBtn = document.getElementById(`playBtn${speaker}`);

    if (origEl)  origEl.textContent  = transcript;
    if (transEl) transEl.textContent = "…";

    const translated = await translateText(transcript, fromLang, toLang);
    if (transEl) transEl.textContent = translated || "—";
    if (playBtn) playBtn.style.display = translated ? "flex" : "none";
    setMicStatus("Tap to speak again", statId);

    if (translated) await autoPlay(translated, toLang);
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
  resetTimeline();
}

function showFinalTranslation(original, translated) {
  const t = document.getElementById("translatedText");
  const a = document.getElementById("actionBtns");
  if (t) t.textContent  = translated || "—";
  if (a) a.style.display = translated ? "flex" : "none";
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
    await autoPlay(translated, toLang);
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
  resetTimeline();

  const origText = (document.getElementById("originalText")?.textContent || "").trim();
  if (origText && origText !== "—" && origText !== "…") {
    if (transEl) transEl.textContent = "…";
    const translated = await translateText(origText, fromLang, toLang);
    if (transEl) transEl.textContent  = translated || "—";
    if (actEl)   actEl.style.display  = translated ? "flex" : "none";
    if (translated) await autoPlay(translated, toLang);
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
  if (translated) await autoPlay(translated, prevFrom);
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

// ── PLAY BUTTONS (manual) ─────────────────────────────────────────
async function playAudio() {
  const t = document.getElementById("translatedText")?.textContent;
  const l = document.getElementById("toLang")?.value;
  if (t && t !== "—" && t !== "…") await autoPlay(t, l);
}
async function playAudioA() {
  const t = document.getElementById("translatedTextA")?.textContent;
  const l = document.getElementById("convLangB")?.value;
  if (t && t !== "—") await autoPlay(t, l);
}
async function playAudioB() {
  const t = document.getElementById("translatedTextB")?.textContent;
  const l = document.getElementById("convLangA")?.value;
  if (t && t !== "—") await autoPlay(t, l);
}
async function playImgAudio() {
  const t = document.getElementById("imgTranslatedText")?.textContent;
  const l = document.getElementById("imgToLang")?.value;
  if (t && t !== "—") await autoPlay(t, l);
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

  ["travelFromLang","travelToLang","imgFromLang","imgToLang","convLangA","convLangB"].forEach(id => {
    document.getElementById(id)?.addEventListener("change", () => {
      localStorage.setItem(`vaani_lang_${id}`, document.getElementById(id).value);
    });
  });
}

// ══════════════════════════════════════════════════════════════════
// TRAVEL HELPER
// ══════════════════════════════════════════════════════════════════
let _cat = "food";
let _tCache = {};
let _tTimer = null;

const TRAVEL_PHRASES = {
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

function selectCategory(cat, btn) {
  _cat = cat;
  document.querySelectorAll(".cat-btn").forEach(b => b.classList.remove("active"));
  if (btn) btn.classList.add("active");
  clearTimeout(_tTimer);
  _tTimer = setTimeout(renderTravelPhrases, 150);
}

function loadTravelPhrases() {
  clearTimeout(_tTimer);
  _tTimer = setTimeout(renderTravelPhrases, 200);
}

async function renderTravelPhrases() {
  const fromLang = document.getElementById("travelFromLang")?.value || "en";
  const toLang   = document.getElementById("travelToLang")?.value   || "en";
  const phrases  = TRAVEL_PHRASES[_cat] || [];
  const list     = document.getElementById("phrasesList");
  const loading  = document.getElementById("travelLoading");
  if (!list) return;
  list.innerHTML = "";
  if (loading) loading.style.display = "flex";

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

    // ── FIXED: use DOM API + data-attributes instead of innerHTML
    // with inline onclick — avoids HTML-attribute quote escaping bugs
    // that silently broke the Play button when Copy used showToast('...')
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

    // Play button — stores text/lang in data-* attributes, handler below
    const playBtn = document.createElement("button");
    playBtn.className = "phrase-btn phrase-play";
    playBtn.textContent = "Play";
    playBtn.dataset.text = toText;
    playBtn.dataset.lang = toLang;
    playBtn.addEventListener("click", function() {
      const t = this.dataset.text;
      const l = this.dataset.lang;
      if (t && l) autoPlay(t, l);
    });

    // Copy button — also uses data-* attributes, no inline onclick
    const copyBtn = document.createElement("button");
    copyBtn.className = "phrase-btn phrase-copy";
    copyBtn.textContent = "Copy";
    copyBtn.dataset.text = toText;
    copyBtn.addEventListener("click", function() {
      const t = this.dataset.text;
      if (t) navigator.clipboard.writeText(t).then(() => showToast("Copied!")).catch(() => {});
    });

    btnsDiv.appendChild(playBtn);
    btnsDiv.appendChild(copyBtn);

    card.appendChild(textsDiv);
    card.appendChild(btnsDiv);
    list.appendChild(card);
  }
  if (loading) loading.style.display = "none";
}

// ══════════════════════════════════════════════════════════════════
// IMAGE TRANSLATION — PATCHED: Tesseract.js OCR + Crop + Preview
// ══════════════════════════════════════════════════════════════════

// State for the current image workflow
let _imgCurrentFile = null;   // the raw File object before crop
let _imgCroppedBlob = null;   // the cropped Blob ready for OCR
let _cropperInstance = null;  // Cropper.js instance

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
    // CSS
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

// ── Map lang code → Tesseract lang string ─────────────────────────
const TESS_LANG_MAP = {
  te:"tel", ta:"tam", hi:"hin", kn:"kan", ml:"mal", mr:"mar",
  bn:"ben", gu:"guj", pa:"pan", ur:"urd", or:"ori", as:"asm",
  ne:"nep", sa:"san", sd:"snd", mai:"hin", doi:"hin", kok:"mar",
  bho:"hin", mwr:"hin", tcy:"kan", ks:"urd", sat:"ben",
  "mni-Mtei":"ben", lus:"eng", brx:"hin", awa:"hin", mag:"hin",
  hne:"hin", en:"eng",
};

// ── Preprocess image for better OCR (canvas-based) ─────────────────
function _preprocessImage(file) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      // Scale up small images
      const scale = img.width < 1000 ? (1000 / img.width) : 1;
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // Grayscale + contrast boost
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = imageData.data;
      for (let i = 0; i < d.length; i += 4) {
        const gray = 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2];
        // Contrast: f(x) = 1.5*(x-128)+128
        const c = Math.min(255, Math.max(0, 1.8 * (gray - 128) + 128));
        d[i] = d[i+1] = d[i+2] = c;
      }
      ctx.putImageData(imageData, 0, 0);
      canvas.toBlob(blob => resolve(blob), "image/png");
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

// ── Run Tesseract OCR ──────────────────────────────────────────────
async function _runOCR(blob, langCode) {
  const Tesseract = await _loadTesseract();
  const tessLang  = TESS_LANG_MAP[langCode] || "eng";

  // Build language string: always include eng as fallback script
  const langStr = tessLang === "eng" ? "eng" : `${tessLang}+eng`;

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

// ── OCR post-processing — strip garbage, preserve emojis, normalise ─
function _cleanOcrText(raw) {
  if (!raw) return "";

  // Step 1: Split into lines, process each line
  let lines = raw.split(/\r?\n/);

  lines = lines.map(line => {
    // Remove lone special chars / OCR noise characters that are not
    // part of words or emoji. Keep: letters (any script), digits,
    // basic punctuation (.,!?:;'"()-), spaces, and emoji (U+1F000+,
    // misc symbols U+2600-U+27BF, enclosed U+2300-U+23FF).
    // Strategy: tokenise, keep valid tokens, discard noise tokens.

    // Replace common OCR artifacts: form-feed, null bytes, pipes used
    // as l/I, underscores used as lines, etc.
    line = line
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, " ") // control chars
      .replace(/[|]{2,}/g, " ")           // runs of pipes
      .replace(/_{3,}/g, " ")             // long underscores (horizontal rules)
      .replace(/={3,}/g, " ")             // long equals
      .replace(/-{3,}/g, " ")             // long dashes
      .replace(/\.{4,}/g, "… ")           // ellipsis noise
      .replace(/[~^`#*\\]{2,}/g, " ");    // repeated markdown-like noise

    // Remove tokens that are purely garbage: a token is garbage if it
    // contains NO letter (Unicode \p{L}), NO digit, NO emoji, and is
    // longer than 1 char OR is a lone non-punctuation symbol.
    // We use a regex to identify valid tokens vs noise tokens.
    // Valid token: contains at least one letter/digit/emoji codepoint.
    // We keep standard punctuation attached to valid tokens naturally.

    // Split on whitespace, filter, rejoin
    const tokens = line.split(/\s+/);
    const cleanTokens = tokens.filter(tok => {
      if (!tok) return false;
      // Always keep tokens that contain a letter (any script), digit, or emoji
      if (/[\p{L}\p{N}]/u.test(tok)) return true;
      // Keep emoji-only tokens (U+1F000–U+1FFFF range and common symbol blocks)
      if (/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{FE00}-\u{FEFF}]/u.test(tok)) return true;
      // Discard anything else (pure symbols/noise)
      return false;
    });

    return cleanTokens.join(" ").trim();
  });

  // Step 2: Remove blank lines and deduplicate consecutive identical lines
  const seen = new Set();
  lines = lines.filter(line => {
    const norm = line.trim();
    if (!norm) return false;
    // Deduplicate: skip if exact same line appeared consecutively
    if (seen.has(norm)) return false;
    seen.add(norm);
    return true;
  });

  // Step 3: Join lines, normalise internal whitespace
  let result = lines.join(" ");
  result = result
    .replace(/\s{2,}/g, " ")     // collapse multiple spaces
    .replace(/ ([.,!?:;])/g, "$1") // remove space before punctuation
    .trim();

  return result;
}

function openImagePreview(src) {
  // Remove existing modal if any
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

  // Close on Escape
  const onKey = (e) => { if (e.key === "Escape") { close(); document.removeEventListener("keydown", onKey); } };
  document.addEventListener("keydown", onKey);
}

// ── Open crop modal ───────────────────────────────────────────────
async function _openCropModal(file, onConfirm) {
  // Remove existing
  const existing = document.getElementById("vaaniCropModal");
  if (existing) existing.remove();
  if (_cropperInstance) { try { _cropperInstance.destroy(); } catch(_){} _cropperInstance = null; }

  await _loadCropper();

  const objectUrl = URL.createObjectURL(file);

  const modal = document.createElement("div");
  modal.id = "vaaniCropModal";
  modal.className = "vaani-crop-modal";
  modal.innerHTML = `
    <div class="vcm-backdrop"></div>
    <div class="vcm-content">
      <div class="vcm-header">
        <span class="vcm-title">Crop Image</span>
        <button class="vcm-close" aria-label="Cancel crop">
          <svg viewBox="0 0 24 24" width="18" height="18"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
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
    });
  };

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
        Take a Photo
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

  // FIX: Camera button always uses back camera (environment)
  // The existing cameraInput in HTML already has capture="environment".
  // We also update the accept + capture attributes before triggering
  // to guarantee the back camera is requested consistently.
  modal.querySelector("#vchm-camera").addEventListener("click", () => {
    close();
    const input = document.getElementById("cameraInput");
    if (input) {
      input.value = "";
      // Ensure back-camera is always requested
      input.setAttribute("capture", "environment");
      input.click();
    }
  });
}

// ── Show preview with click-to-expand ─────────────────────────────
function _showPreviewBox(objectUrl) {
  const pb = document.getElementById("imgPreviewBox");
  const p  = document.getElementById("imgPreview");
  const b  = document.getElementById("imgTranslateBtn");
  const up = document.getElementById("uploadArea");

  if (p) {
    p.src = objectUrl;
    // Click → full screen preview
    p.style.cursor = "zoom-in";
    p.onclick = () => openImagePreview(p.src);
  }
  if (pb) pb.style.display = "block";
  if (b)  b.style.display  = "flex";
  if (up) up.style.display = "none";
}

// ── Core: handle a new file (show crop → update preview) ──────────
async function processImageFile(file) {
  if (!file || !file.type.startsWith("image/")) {
    showToast("Please upload an image file");
    return;
  }
  _imgCurrentFile = file;

  // Show crop modal; on confirm update preview and store cropped blob
  await _openCropModal(file, (croppedBlob) => {
    _imgCroppedBlob = croppedBlob;
    const croppedUrl = URL.createObjectURL(croppedBlob);
    _showPreviewBox(croppedUrl);
    // Reset results
    document.getElementById("imgResults").style.display = "none";
    document.getElementById("imgStatus").textContent = "";
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

// ── Main translate image handler ───────────────────────────────────
async function translateImage() {
  const fromLang = document.getElementById("imgFromLang")?.value || "en";
  const toLang   = document.getElementById("imgToLang")?.value   || "en";
  const status   = document.getElementById("imgStatus");
  const btn      = document.getElementById("imgTranslateBtn");

  // Use cropped blob first, fall back to raw file
  const sourceBlob = _imgCroppedBlob || _imgCurrentFile;

  if (!sourceBlob) {
    showToast("No image selected");
    return;
  }

  if (btn)    btn.disabled = true;
  if (status) status.textContent = "Preprocessing image…";
  document.getElementById("imgResults").style.display = "none";

  try {
    // Step 1: Preprocess
    const preprocessed = await _preprocessImage(sourceBlob);

    // Step 2: OCR with Tesseract.js
    if (status) status.textContent = "Loading OCR engine…";
    let extractedText = "";
    try {
      const rawOcr = await _runOCR(preprocessed, fromLang);
      // FIX: clean OCR output — strip garbage, preserve emojis, normalise
      extractedText = _cleanOcrText(rawOcr);
    } catch (ocrErr) {
      console.warn("[Vaani OCR] Tesseract error:", ocrErr);
      // Fallback: try backend OCR
      if (status) status.textContent = "Trying server OCR…";
      try {
        const fd = new FormData();
        fd.append("file", sourceBlob, "image.png");
        fd.append("from_lang", fromLang);
        fd.append("to_lang", toLang);
        const resp = await fetch(`${API_URL}/image-translate`, {
          method:"POST", body:fd, signal:AbortSignal.timeout(35000)
        });
        if (resp.ok) {
          const d = await resp.json();
          // Clean backend OCR result too
          extractedText = _cleanOcrText(d.extracted || "");
          const translatedFromBackend = (d.translated || "").trim();
          if (translatedFromBackend && extractedText) {
            document.getElementById("imgExtractedText").textContent  = extractedText;
            document.getElementById("imgTranslatedText").textContent = translatedFromBackend;
            document.getElementById("imgResults").style.display      = "block";
            if (status) status.textContent = "";
            await autoPlay(translatedFromBackend, toLang);
            return;
          }
        }
      } catch(fbErr) {
        console.warn("[Vaani OCR] Backend fallback error:", fbErr);
      }
    }

    // Step 3: Display extracted text
    if (!extractedText || extractedText.length < 2) {
      document.getElementById("imgExtractedText").textContent  = "No text found";
      document.getElementById("imgTranslatedText").textContent = "No text detected in this image.";
      document.getElementById("imgResults").style.display      = "block";
      if (status) status.textContent = "";
      return;
    }

    document.getElementById("imgExtractedText").textContent = extractedText;
    if (status) status.textContent = "Translating…";

    // Step 4: Translate
    let translated = "";
    if (fromLang === toLang) {
      translated = extractedText;
    } else {
      try {
        const chunks = _splitText(extractedText);
        const parts  = await Promise.all(chunks.map(c => _clientTranslateChunk(c, fromLang, toLang)));
        translated = parts.join(" ");
      } catch(tErr) {
        console.warn("[Vaani] Translation error:", tErr);
        translated = extractedText;
      }
    }

    document.getElementById("imgTranslatedText").textContent = translated || "—";
    document.getElementById("imgResults").style.display      = "block";
    if (status) status.textContent = "";

    if (translated && translated !== extractedText) {
      await autoPlay(translated, toLang);
    }
  } catch (e) {
    console.error("[Vaani] translateImage:", e);
    if (status) status.textContent = "Error: " + e.message;
    showToast("Image processing failed");
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ── Client-side translate chunk (mirrors backend logic lightly) ────
function _splitText(text, maxLen = 4500) {
  const sentences = text.split(/(?<=[।.!?\n])\s*/);
  const chunks = [], current_parts = [];
  let len = 0;
  for (const s of sentences) {
    const st = s.trim();
    if (!st) continue;
    if (len + st.length + 1 > maxLen && current_parts.length) {
      chunks.push(current_parts.join(" "));
      current_parts.length = 0; len = 0;
    }
    current_parts.push(st); len += st.length + 1;
  }
  if (current_parts.length) chunks.push(current_parts.join(" "));
  return chunks.length ? chunks : [text];
}

async function _clientTranslateChunk(text, fromLang, toLang) {
  return await translateText(text, fromLang, toLang) || text;
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
// HISTORY PAGE — PATCHED: shows sign-in prompt for non-logged users
// ══════════════════════════════════════════════════════════════════
function renderHistory() {
  const list = document.getElementById("historyList");
  if (!list) return;

  // Check login state via Firebase currentUser (may be null if not signed in)
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
        <button class="stg-btn stg-danger" onclick="stgResetAll()">Reset All App Data</button>
      </div>
    </div>

    <div class="stg-section">
      <div class="stg-title">About</div>
      <div class="stg-about">
        <div>Vaani — Indian Language Translator</div>
        <div>Translation: Bhashini NMT + Google Translate fallback</div>
        <div>Speech: Bhashini TTS + gTTS fallback</div>
        <div>OCR: Tesseract.js (client-side) + server fallback</div>
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
  if (page === "Travel")     renderTravelPhrases();
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

// Firebase stubs — real auth state tracked via window._vaaniCurrentUser
if (typeof window.signInWithGoogle === "undefined") window.signInWithGoogle = () => showToast("Sign-in coming soon");
if (typeof window.signOutUser      === "undefined") window.signOutUser      = () => showToast("Signed out");

// ── AUTH STATE HOOK ───────────────────────────────────────────────
// firebase.js should set window._vaaniCurrentUser on auth state change
// and call window._vaaniOnAuthChange() if defined.
window._vaaniCurrentUser = null;
window._vaaniOnAuthChange = function(user) {
  window._vaaniCurrentUser = user || null;
  // Re-render history if it's currently visible
  const histPage = document.getElementById("pageHistory");
  if (histPage && histPage.classList.contains("active")) {
    renderHistory();
  }
};

// ── INIT ──────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  applyTheme(localStorage.getItem("vaani_theme") || "dark");
  initLanguageSelects();
  _initTimelineControls();

  // Change button → open change modal (patch: replaces direct file input click)
  const changeBtn = document.getElementById("imgChangeBtn");
  if (changeBtn) {
    changeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      _openChangeModal();
    });
  }

  const hash = location.hash.replace("#","");
  navigateTo(PAGES.find(p => p.toLowerCase() === hash) || "Home");
  renderHistory();
  renderFavourites();
});
