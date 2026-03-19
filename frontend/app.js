/* ================================================================
   Vaani — app.js  v3.1  TIMELINE + NO-GENDER UPDATE
   
   CHANGES FROM v3.0:
   1. REMOVED: Male/Female voice gender selection UI & logic
   2. ADDED: Audio timeline (seek bar) with currentTime control
   3. All existing features preserved exactly
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
let _timelineRAF = null;    // requestAnimationFrame handle for timeline update
let _timelineSeeking = false; // true while user drags the seek bar

// ── Stop current audio and clean up timeline ───────────────────────
function stopAudio() {
  if (_timelineRAF) { cancelAnimationFrame(_timelineRAF); _timelineRAF = null; }
  if (_curAudio) {
    try { _curAudio.pause(); _curAudio.currentTime = 0; } catch (_) {}
    _curAudio = null;
  }
  resetTimeline();
}

// ── Reset the seek bar UI to zero ─────────────────────────────────
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

// ── Format seconds → m:ss ─────────────────────────────────────────
function _fmtTime(sec) {
  if (!isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ── Update the seek bar's filled-portion CSS variable ─────────────
function _updateSeekFill(bar, pct) {
  bar.style.setProperty("--seek-pct", `${Math.max(0, Math.min(100, pct))}%`);
}

// ── Start real-time timeline update loop ──────────────────────────
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

  // Set total duration once metadata loads
  const setDuration = () => { total.textContent = _fmtTime(audio.duration); };
  if (audio.readyState >= 1) setDuration();
  else audio.addEventListener("loadedmetadata", setDuration, { once: true });

  _timelineRAF = requestAnimationFrame(tick);
}

// ── Seek bar event handlers (attached once at init) ────────────────
function _initTimelineControls() {
  const bar = document.getElementById("timelineSeek");
  if (!bar || bar._vaaniInitialized) return;
  bar._vaaniInitialized = true;

  // While dragging — update fill but don't move audio yet
  bar.addEventListener("input", () => {
    _timelineSeeking = true;
    _updateSeekFill(bar, parseFloat(bar.value));
    const cur = document.getElementById("timelineCurrent");
    if (cur && _curAudio && _curAudio.duration) {
      cur.textContent = _fmtTime((_curAudio.duration * parseFloat(bar.value)) / 100);
    }
  });

  // On release — seek audio to chosen position
  bar.addEventListener("change", () => {
    if (_curAudio && _curAudio.duration) {
      _curAudio.currentTime = (_curAudio.duration * parseFloat(bar.value)) / 100;
    }
    _timelineSeeking = false;
  });

  // Click anywhere on the track (also fires "change", so handled above)
}

// ── Removed: getVoiceGender() — gender feature deleted ────────────
// All /speak calls now use a fixed default voice (no gender param)

async function speakText(text, lang) {
  if (!text?.trim()) return null;
  try {
    const r = await fetch(`${API_URL}/speak`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // gender param removed — backend will use its default
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

// ALL translations end here — auto-plays and shows timeline
async function autoPlay(text, lang) {
  if (!text || text === "—" || text === "…" || !lang) return;
  stopAudio(); // stop previous + reset timeline
  const audio = await speakText(text, lang);
  if (audio) {
    _curAudio = audio;
    _startTimelineLoop(audio);
    audio.play().catch(e => console.warn("[Vaani] play:", e.message));
  }
}

// ══════════════════════════════════════════════════════════════════
// MIC STATE MACHINE (unchanged from v3.0)
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

// Conversation mode mic (unchanged)
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

    const card = document.createElement("div");
    card.className = "phrase-card";
    card.innerHTML = `
      <div class="phrase-texts">
        <div class="phrase-orig">${fromText}</div>
        <div class="phrase-trans">${toText}</div>
        <div class="phrase-en">${phrase.en}</div>
      </div>
      <div class="phrase-btns">
        <button class="phrase-btn phrase-play"
          onclick="playPhrase(${JSON.stringify(toText)},${JSON.stringify(toLang)})">Play</button>
        <button class="phrase-btn phrase-copy"
          onclick="navigator.clipboard.writeText(${JSON.stringify(toText)}).then(()=>showToast('Copied!'))">Copy</button>
      </div>`;
    list.appendChild(card);
  }
  if (loading) loading.style.display = "none";
}

// ── IMAGE TRANSLATION ─────────────────────────────────────────────
function handleDrop(e) {
  e.preventDefault();
  document.getElementById("uploadArea")?.classList.remove("drag-over");
  const f = e.dataTransfer?.files?.[0];
  if (f) processImageFile(f);
}
function handleImageUpload(e) { const f = e.target?.files?.[0]; if (f) processImageFile(f); }
function processImageFile(file) {
  if (!file.type.startsWith("image/")) { showToast("Upload an image file"); return; }
  const reader = new FileReader();
  reader.onload = (e) => {
    const p = document.getElementById("imgPreview");
    const pb = document.getElementById("imgPreviewBox");
    const b  = document.getElementById("imgTranslateBtn");
    if (p) p.src = e.target.result;
    if (pb) pb.style.display = "block";
    if (b)  b.style.display  = "flex";
    const up = document.getElementById("uploadArea");
    if (up) up.style.display = "none";
  };
  reader.readAsDataURL(file);
}
async function translateImage() {
  const fi = document.getElementById("imageInput");
  const ci = document.getElementById("cameraInput");
  const file = fi?.files?.[0] || ci?.files?.[0];
  if (!file) { showToast("No image selected"); return; }

  const fromLang = document.getElementById("imgFromLang")?.value || "en";
  const toLang   = document.getElementById("imgToLang")?.value   || "en";
  const status   = document.getElementById("imgStatus");
  const btn      = document.getElementById("imgTranslateBtn");

  if (status) status.textContent = "Extracting text…";
  if (btn)    btn.disabled = true;
  document.getElementById("imgResults").style.display = "none";

  const fd = new FormData();
  fd.append("file", file); fd.append("from_lang", fromLang); fd.append("to_lang", toLang);

  try {
    const resp = await fetch(`${API_URL}/image-translate`, {
      method:"POST", body:fd, signal:AbortSignal.timeout(35000)
    });
    if (!resp.ok) throw new Error("Server error " + resp.status);
    const data = await resp.json();
    document.getElementById("imgExtractedText").textContent  = data.extracted || "No text found";
    document.getElementById("imgTranslatedText").textContent = data.translated || "—";
    document.getElementById("imgResults").style.display      = "block";
    if (status) status.textContent = "";
    if (data.translated && data.translated !== "No text detected in this image.") {
      await autoPlay(data.translated, toLang);
    }
  } catch (e) {
    if (status) status.textContent = "Error: " + e.message;
    showToast("Image translation failed");
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

function renderHistory() {
  const hist = JSON.parse(localStorage.getItem("vaani_history") || "[]");
  const list = document.getElementById("historyList");
  if (!list) return;
  if (!hist.length) {
    list.innerHTML = `<div class="empty-state"><div class="es-icon"><svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div><p class="es-title">No history yet</p><p class="es-sub">Start translating to see your history here</p></div>`;
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
// SETTINGS PAGE — gender voice section REMOVED
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
  // Stop all mics when navigating away
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

// ── INIT ──────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  applyTheme(localStorage.getItem("vaani_theme") || "dark");
  // Gender sync removed — no gender feature
  initLanguageSelects();
  _initTimelineControls();  // attach seek bar event listeners once
  const hash = location.hash.replace("#","");
  navigateTo(PAGES.find(p => p.toLowerCase() === hash) || "Home");
  renderHistory();
  renderFavourites();
});
