/* ================================================================
   Vaani — app.js  v2.0
   
   ARCHITECTURE:
   ─ State machine for mic (IDLE → LISTENING → STOPPED → IDLE)
   ─ Single speakText() gateway for all TTS calls
   ─ Translation cache (2000 entries, LRU-style)
   ─ Proper async/await everywhere, no race conditions
   ─ Gender preference persisted in localStorage
   ─ Language change → reset only relevant state
   ─ Swap button → swap text + retranslate
   ─ Conversation mode — isolated state per speaker
   ─ All event listeners added once (no duplicates)
================================================================ */

const API_URL = "https://vaani-app-ui0z.onrender.com";
const VERSION  = window.VAANI_VERSION || "2.0";

// ══════════════════════════════════════════════════════════════════
// LANGUAGE CONFIG
// ══════════════════════════════════════════════════════════════════
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

// ══════════════════════════════════════════════════════════════════
// TRANSLATION CACHE (frontend mirror of backend cache)
// ══════════════════════════════════════════════════════════════════
const _transCache = new Map();
const TRANS_CACHE_MAX = 500;

function cacheGet(key) { return _transCache.get(key); }
function cacheSet(key, val) {
  if (_transCache.size >= TRANS_CACHE_MAX) {
    const firstKey = _transCache.keys().next().value;
    _transCache.delete(firstKey);
  }
  _transCache.set(key, val);
}

// ══════════════════════════════════════════════════════════════════
// SPEECH RECOGNITION STATE MACHINE
// States: IDLE → LISTENING → STOPPED → IDLE
// ══════════════════════════════════════════════════════════════════
const MicState = { IDLE:"idle", LISTENING:"listening", STOPPED:"stopped" };

// Per-context mic state (single mode + conv A + conv B)
const micContexts = {
  single: { state: MicState.IDLE, recognition: null, lastTranscript: "" },
  A:      { state: MicState.IDLE, recognition: null, lastTranscript: "" },
  B:      { state: MicState.IDLE, recognition: null, lastTranscript: "" },
};

function getMicContext(ctx) { return micContexts[ctx] || micContexts.single; }

// ══════════════════════════════════════════════════════════════════
// AUDIO STATE
// ══════════════════════════════════════════════════════════════════
let currentAudio = null;

function stopCurrentAudio() {
  if (currentAudio) {
    try { currentAudio.pause(); currentAudio.currentTime = 0; } catch(e){}
    currentAudio = null;
  }
}

// ══════════════════════════════════════════════════════════════════
// GENDER / VOICE PREFERENCE
// ══════════════════════════════════════════════════════════════════
function getVoiceGender() {
  return localStorage.getItem("vaani_voice_gender") || "female";
}
function setVoiceGender(g) {
  localStorage.setItem("vaani_voice_gender", g);
  document.querySelectorAll(".gender-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.gender === g);
  });
  showToast(g === "male" ? "👨 Male voice selected" : "👩 Female voice selected");
}
function syncGenderButtons() {
  const g = getVoiceGender();
  document.querySelectorAll(".gender-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.gender === g);
  });
}

// ══════════════════════════════════════════════════════════════════
// LANGUAGE SELECT HELPERS
// ══════════════════════════════════════════════════════════════════
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
  const cfg = {
    fromLang:"te", toLang:"ta",
    travelFromLang:"te", travelToLang:"hi",
    imgFromLang:"te", imgToLang:"en",
    convLangA:"te", convLangB:"ta"
  };
  Object.entries(cfg).forEach(([id, def]) => {
    const el = document.getElementById(id);
    if (el) {
      el.innerHTML = buildLangOptions(def);
      // Restore saved preference
      const saved = localStorage.getItem(`vaani_lang_${id}`);
      if (saved && LANG_CONFIG[saved]) el.value = saved;
    }
  });

  // Save selections on change
  ["fromLang","toLang","travelFromLang","travelToLang","imgFromLang","imgToLang","convLangA","convLangB"].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("change", () => {
        localStorage.setItem(`vaani_lang_${id}`, el.value);
      });
    }
  });
}

// ══════════════════════════════════════════════════════════════════
// TRANSLATION CORE
// ══════════════════════════════════════════════════════════════════
async function translateText(text, fromLang, toLang) {
  if (!text?.trim()) return "";
  const q = text.trim();
  if (fromLang === toLang) return q;

  const key = `${q}|||${fromLang}|||${toLang}`;
  const cached = cacheGet(key);
  if (cached) return cached;

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
        cacheSet(key, data.translated);
        return data.translated;
      }
    }
    const err = await resp.json().catch(() => ({}));
    console.warn("[Vaani] Translation error:", err);
  } catch(e) {
    console.warn("[Vaani] translateText:", e.message);
  }
  return "";
}

// ══════════════════════════════════════════════════════════════════
// TTS CORE — all audio goes through here
// ══════════════════════════════════════════════════════════════════
async function speakText(text, lang) {
  if (!text?.trim()) return null;
  const gender = getVoiceGender();

  try {
    const resp = await fetch(`${API_URL}/speak`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text.trim(), lang, gender }),
      signal: AbortSignal.timeout(25000)
    });
    if (!resp.ok) throw new Error(`TTS HTTP ${resp.status}`);

    const engine = resp.headers.get("X-TTS-Engine") || "";
    if (engine.startsWith("gtts") && gender === "male") {
      showToast("👨 Male voice needs Bhashini — using default");
    }

    const blob  = await resp.blob();
    const url   = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.onended = () => URL.revokeObjectURL(url);
    return audio;
  } catch(e) {
    console.warn("[Vaani] speakText:", e.message);
    return null;
  }
}

async function playAndTrack(audio) {
  if (!audio) return;
  stopCurrentAudio();
  currentAudio = audio;
  try { await audio.play(); } catch(e) { console.warn("[Vaani] play:", e.message); }
}

// ══════════════════════════════════════════════════════════════════
// SINGLE MODE — SPEECH RECOGNITION
// State machine: tap 1 = start, tap 2 = stop, tap 3 = fresh start
// ══════════════════════════════════════════════════════════════════
function startListening() {
  const ctx     = getMicContext("single");
  const micBtn  = document.getElementById("micBtn");
  const micStat = document.getElementById("micStatus");

  // ── Tap 2: stop recording ──────────────────────────────────────
  if (ctx.state === MicState.LISTENING) {
    if (ctx.recognition) {
      try { ctx.recognition.stop(); } catch(e){}
    }
    ctx.state = MicState.STOPPED;
    micBtn?.classList.remove("listening");
    if (micStat) micStat.textContent = "Tap to speak again";
    return;
  }

  // ── Tap 1 or 3: fresh start ────────────────────────────────────
  // Always abort any previous instance first
  if (ctx.recognition) {
    try { ctx.recognition.abort(); } catch(e){}
    ctx.recognition = null;
  }

  // Reset state for fresh recording
  ctx.state = MicState.IDLE;
  ctx.lastTranscript = "";

  if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
    showToast("Voice not supported in this browser. Try Chrome.");
    return;
  }

  const fromLang   = document.getElementById("fromLang")?.value || "en";
  const speechCode = LANG_CONFIG[fromLang]?.speechCode || "en-US";

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const rec = new SR();
  rec.lang            = speechCode;
  rec.interimResults  = false;
  rec.maxAlternatives = 3; // get best of 3 alternatives
  rec.continuous      = false;

  ctx.recognition = rec;
  ctx.state       = MicState.LISTENING;

  micBtn?.classList.add("listening");
  if (micStat) micStat.textContent = "Listening…";

  // Clear previous results for fresh recording
  const resultsSection = document.getElementById("resultsSection");
  if (resultsSection) resultsSection.style.display = "none";

  rec.onresult = async (e) => {
    // Pick highest-confidence alternative
    let best = "", bestConf = -1;
    for (let i = 0; i < e.results[0].length; i++) {
      const alt = e.results[0][i];
      if (alt.confidence > bestConf) {
        bestConf = alt.confidence;
        best = alt.transcript;
      }
    }
    const transcript = best.trim();
    if (!transcript) return;

    ctx.lastTranscript = transcript;
    ctx.state = MicState.STOPPED;
    micBtn?.classList.remove("listening");
    if (micStat) micStat.textContent = "Translating…";

    const toLang = document.getElementById("toLang")?.value || "en";

    document.getElementById("resultsSection").style.display = "block";
    document.getElementById("originalText").textContent = transcript;
    document.getElementById("translatedText").textContent = "…";
    document.getElementById("actionBtns").style.display = "none";

    const translated = await translateText(transcript, fromLang, toLang);
    document.getElementById("translatedText").textContent = translated || "—";
    document.getElementById("actionBtns").style.display = translated ? "flex" : "none";

    if (micStat) micStat.textContent = "Tap to speak again";

    if (translated) {
      saveToHistory(transcript, translated, fromLang, toLang);
      const audio = await speakText(translated, toLang);
      await playAndTrack(audio);
    }
  };

  rec.onerror = (e) => {
    ctx.state = MicState.IDLE;
    micBtn?.classList.remove("listening");
    if (micStat) micStat.textContent = "Tap to speak";
    if (e.error === "no-speech") {
      showToast("No speech detected. Try again.");
    } else if (e.error !== "aborted") {
      showToast(`Mic error: ${e.error}`);
    }
    ctx.recognition = null;
  };

  rec.onend = () => {
    micBtn?.classList.remove("listening");
    if (ctx.state === MicState.LISTENING) {
      // Ended without result
      ctx.state = MicState.IDLE;
      if (micStat) micStat.textContent = "Tap to speak";
    }
    ctx.recognition = null;
  };

  try {
    rec.start();
  } catch(e) {
    ctx.state = MicState.IDLE;
    micBtn?.classList.remove("listening");
    if (micStat) micStat.textContent = "Tap to speak";
    showToast("Could not start mic. Please allow microphone access.");
    ctx.recognition = null;
  }
}

// ══════════════════════════════════════════════════════════════════
// CONVERSATION MODE
// ══════════════════════════════════════════════════════════════════
async function startConvListening(speaker) {
  const ctx        = getMicContext(speaker);
  const langSel    = `convLang${speaker}`;
  const otherLang  = speaker === "A" ? "convLangB" : "convLangA";
  const micBtnId   = `micBtn${speaker}`;
  const micStatId  = `micStatus${speaker}`;
  const origId     = `originalText${speaker}`;
  const transId    = `translatedText${speaker}`;
  const playBtnId  = `playBtn${speaker}`;

  const fromLang   = document.getElementById(langSel)?.value   || "en";
  const toLang     = document.getElementById(otherLang)?.value || "en";
  const speechCode = LANG_CONFIG[fromLang]?.speechCode || "en-US";
  const micBtn     = document.getElementById(micBtnId);
  const micStat    = document.getElementById(micStatId);

  // Stop if listening (tap 2)
  if (ctx.state === MicState.LISTENING) {
    if (ctx.recognition) try { ctx.recognition.stop(); } catch(e){}
    ctx.state = MicState.STOPPED;
    micBtn?.classList.remove("listening");
    if (micStat) micStat.textContent = "Tap to speak again";
    return;
  }

  // Fresh start (tap 1 or 3)
  if (ctx.recognition) {
    try { ctx.recognition.abort(); } catch(e){}
    ctx.recognition = null;
  }
  ctx.state = MicState.IDLE;
  ctx.lastTranscript = "";

  // Stop the OTHER speaker if they were recording
  const otherSpeaker = speaker === "A" ? "B" : "A";
  const otherCtx = getMicContext(otherSpeaker);
  if (otherCtx.state === MicState.LISTENING && otherCtx.recognition) {
    try { otherCtx.recognition.abort(); } catch(e){}
    otherCtx.state = MicState.IDLE;
    otherCtx.recognition = null;
    const otherMicBtn = document.getElementById(`micBtn${otherSpeaker}`);
    const otherStat   = document.getElementById(`micStatus${otherSpeaker}`);
    otherMicBtn?.classList.remove("listening");
    if (otherStat) otherStat.textContent = "Tap to speak";
  }

  if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
    showToast("Voice not supported. Try Chrome.");
    return;
  }

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const rec = new SR();
  rec.lang            = speechCode;
  rec.interimResults  = false;
  rec.maxAlternatives = 3;

  ctx.recognition = rec;
  ctx.state       = MicState.LISTENING;

  micBtn?.classList.add("listening");
  if (micStat) micStat.textContent = "Listening…";

  rec.onresult = async (e) => {
    let best = "", bestConf = -1;
    for (let i = 0; i < e.results[0].length; i++) {
      const alt = e.results[0][i];
      if (alt.confidence > bestConf) { bestConf = alt.confidence; best = alt.transcript; }
    }
    const transcript = best.trim();
    if (!transcript) return;

    ctx.state = MicState.STOPPED;
    micBtn?.classList.remove("listening");
    if (micStat) micStat.textContent = "Translating…";

    const origEl  = document.getElementById(origId);
    const transEl = document.getElementById(transId);
    const playBtn = document.getElementById(playBtnId);

    if (origEl) origEl.textContent = transcript;
    if (transEl) transEl.textContent = "…";

    const translated = await translateText(transcript, fromLang, toLang);
    if (transEl) transEl.textContent = translated || "—";
    if (playBtn) playBtn.style.display = translated ? "flex" : "none";

    if (micStat) micStat.textContent = "Tap to speak again";

    if (translated) {
      const audio = await speakText(translated, toLang);
      await playAndTrack(audio);
    }
    ctx.recognition = null;
  };

  rec.onerror = (e) => {
    ctx.state = MicState.IDLE;
    micBtn?.classList.remove("listening");
    if (micStat) micStat.textContent = "Tap to speak";
    if (e.error !== "aborted") showToast(`Mic error: ${e.error}`);
    ctx.recognition = null;
  };

  rec.onend = () => {
    micBtn?.classList.remove("listening");
    if (ctx.state === MicState.LISTENING) {
      ctx.state = MicState.IDLE;
      if (micStat) micStat.textContent = "Tap to speak";
    }
    ctx.recognition = null;
  };

  try {
    rec.start();
  } catch(e) {
    ctx.state = MicState.IDLE;
    micBtn?.classList.remove("listening");
    if (micStat) micStat.textContent = "Tap to speak";
    ctx.recognition = null;
    showToast("Could not start mic.");
  }
}

// ══════════════════════════════════════════════════════════════════
// TEXT MODE TRANSLATION
// ══════════════════════════════════════════════════════════════════
async function translateTypedText() {
  const textArea = document.getElementById("textInputArea");
  const raw = textArea?.value?.trim();
  if (!raw) { showToast("Please enter some text"); return; }

  const fromLang = document.getElementById("fromLang")?.value || "en";
  const toLang   = document.getElementById("toLang")?.value   || "en";

  const btn = document.querySelector("#textInput .btn-primary");
  if (btn) { btn.disabled = true; btn.textContent = "Translating…"; }

  document.getElementById("resultsSection").style.display = "block";
  document.getElementById("originalText").textContent  = raw;
  document.getElementById("translatedText").textContent = "…";
  document.getElementById("actionBtns").style.display  = "none";

  const translated = await translateText(raw, fromLang, toLang);

  document.getElementById("translatedText").textContent = translated || "—";
  document.getElementById("actionBtns").style.display   = translated ? "flex" : "none";

  if (btn) { btn.disabled = false; btn.textContent = "Translate"; }

  if (translated) {
    saveToHistory(raw, translated, fromLang, toLang);
    const audio = await speakText(translated, toLang);
    await playAndTrack(audio);
  }
}

// ══════════════════════════════════════════════════════════════════
// LANGUAGE SWAP
// ══════════════════════════════════════════════════════════════════
async function swapLanguages() {
  const from = document.getElementById("fromLang");
  const to   = document.getElementById("toLang");
  if (!from || !to) return;

  const origText  = document.getElementById("originalText")?.textContent;
  const transText = document.getElementById("translatedText")?.textContent;

  // Swap language values
  const tmp = from.value;
  from.value = to.value;
  to.value   = tmp;

  // Save swapped selections
  localStorage.setItem("vaani_lang_fromLang", from.value);
  localStorage.setItem("vaani_lang_toLang", to.value);

  // Swap text display
  if (origText && origText !== "—" && transText && transText !== "—" && transText !== "…") {
    document.getElementById("originalText").textContent  = transText;
    document.getElementById("translatedText").textContent = origText;

    // Re-translate in new direction
    const newTranslated = await translateText(transText, from.value, to.value);
    if (newTranslated) {
      document.getElementById("translatedText").textContent = newTranslated;
    }
  }
}

// ══════════════════════════════════════════════════════════════════
// PLAY BUTTONS
// ══════════════════════════════════════════════════════════════════
async function playAudio() {
  const text = document.getElementById("translatedText")?.textContent;
  const lang = document.getElementById("toLang")?.value;
  if (!text || text === "—" || text === "…") return;
  const btn = document.getElementById("playBtn");
  if (btn) btn.classList.add("loading");
  const audio = await speakText(text, lang);
  await playAndTrack(audio);
  if (btn) btn.classList.remove("loading");
}

async function playAudioA() {
  const text = document.getElementById("translatedTextA")?.textContent;
  const lang = document.getElementById("convLangB")?.value;
  if (!text || text === "—") return;
  const audio = await speakText(text, lang);
  await playAndTrack(audio);
}

async function playAudioB() {
  const text = document.getElementById("translatedTextB")?.textContent;
  const lang = document.getElementById("convLangA")?.value;
  if (!text || text === "—") return;
  const audio = await speakText(text, lang);
  await playAndTrack(audio);
}

async function playImgAudio() {
  const text = document.getElementById("imgTranslatedText")?.textContent;
  const lang = document.getElementById("imgToLang")?.value;
  if (!text || text === "—") return;
  const audio = await speakText(text, lang);
  await playAndTrack(audio);
}

async function playPhrase(text, lang, btn) {
  if (!text) return;
  if (btn) btn.classList.add("loading");
  const audio = await speakText(text, lang);
  await playAndTrack(audio);
  if (btn) btn.classList.remove("loading");
}

// ══════════════════════════════════════════════════════════════════
// INPUT MODE TOGGLE
// ══════════════════════════════════════════════════════════════════
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

// ══════════════════════════════════════════════════════════════════
// COPY HELPERS
// ══════════════════════════════════════════════════════════════════
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

// ══════════════════════════════════════════════════════════════════
// TRAVEL HELPER
// ══════════════════════════════════════════════════════════════════
let currentCategory = "food";
let travelPhrasesCache = {};

const TRAVEL_PHRASES = {
  food: [
    { en:"Where is a good restaurant?",         key:"food_1" },
    { en:"I am vegetarian.",                      key:"food_2" },
    { en:"The bill please.",                      key:"food_3" },
    { en:"Is this spicy?",                        key:"food_4" },
    { en:"No onion, no garlic please.",           key:"food_5" },
    { en:"Water please.",                         key:"food_6" },
    { en:"I am allergic to nuts.",                key:"food_7" },
    { en:"Is this food fresh?",                   key:"food_8" },
  ],
  transport: [
    { en:"Where is the bus stand?",               key:"transport_1" },
    { en:"How much to go to the station?",        key:"transport_2" },
    { en:"Stop here please.",                     key:"transport_3" },
    { en:"Is this the right bus?",                key:"transport_4" },
    { en:"I am lost, please help.",               key:"transport_5" },
    { en:"Call an auto rickshaw please.",         key:"transport_6" },
    { en:"How long will it take?",                key:"transport_7" },
    { en:"Please go slow.",                       key:"transport_8" },
  ],
  hotel: [
    { en:"Do you have a room available?",         key:"hotel_1" },
    { en:"What is the price per night?",          key:"hotel_2" },
    { en:"Can I see the room?",                   key:"hotel_3" },
    { en:"Please clean the room.",                key:"hotel_4" },
    { en:"The AC is not working.",                key:"hotel_5" },
    { en:"What time is checkout?",                key:"hotel_6" },
    { en:"I need an extra blanket.",              key:"hotel_7" },
    { en:"Can I get hot water?",                  key:"hotel_8" },
  ],
  emergency: [
    { en:"Please call the police.",               key:"emergency_1" },
    { en:"I need a doctor.",                      key:"emergency_2" },
    { en:"Where is the hospital?",                key:"emergency_3" },
    { en:"I have lost my wallet.",                key:"emergency_4" },
    { en:"This is an emergency!",                 key:"emergency_5" },
    { en:"Help me please!",                       key:"emergency_6" },
    { en:"I need medicine.",                      key:"emergency_7" },
    { en:"Call an ambulance.",                    key:"emergency_8" },
  ],
  shopping: [
    { en:"How much does this cost?",              key:"shopping_1" },
    { en:"Can you reduce the price?",             key:"shopping_2" },
    { en:"I want to buy this.",                   key:"shopping_3" },
    { en:"Do you have a smaller size?",           key:"shopping_4" },
    { en:"Where is the market?",                  key:"shopping_5" },
    { en:"Give me a discount.",                   key:"shopping_6" },
    { en:"Do you accept cards?",                  key:"shopping_7" },
    { en:"I want to return this.",                key:"shopping_8" },
  ],
  greetings: [
    { en:"Hello, how are you?",                   key:"greet_1" },
    { en:"Good morning.",                         key:"greet_2" },
    { en:"Good evening.",                         key:"greet_3" },
    { en:"Thank you very much.",                  key:"greet_4" },
    { en:"I don't understand.",                   key:"greet_5" },
    { en:"Please speak slowly.",                  key:"greet_6" },
    { en:"What is your name?",                    key:"greet_7" },
    { en:"Nice to meet you.",                     key:"greet_8" },
  ],
};

function selectCategory(cat, btn) {
  currentCategory = cat;
  document.querySelectorAll(".cat-btn").forEach(b => b.classList.remove("active"));
  btn?.classList.add("active");
  renderTravelPhrases();
}

let _travelRenderTimeout = null;
async function loadTravelPhrases() {
  clearTimeout(_travelRenderTimeout);
  _travelRenderTimeout = setTimeout(renderTravelPhrases, 200);
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
    const fromKey = `${phrase.key}_en_${fromLang}`;
    const toKey   = `${phrase.key}_en_${toLang}`;

    let fromText = phrase.en;
    let toText   = "…";

    if (fromLang !== "en") {
      fromText = travelPhrasesCache[fromKey] || await translateText(phrase.en, "en", fromLang);
      travelPhrasesCache[fromKey] = fromText;
    }

    toText = travelPhrasesCache[toKey] || await translateText(phrase.en, "en", toLang);
    travelPhrasesCache[toKey] = toText;

    const card = document.createElement("div");
    card.className = "phrase-card";
    const safeToText   = JSON.stringify(toText);
    const safeLang     = JSON.stringify(toLang);
    const safeCopyText = (toText || "").replace(/'/g,"&#39;");
    card.innerHTML = `
      <div class="phrase-texts">
        <div class="phrase-orig">${fromText}</div>
        <div class="phrase-trans">${toText}</div>
        <div class="phrase-en">${phrase.en}</div>
      </div>
      <div class="phrase-btns">
        <button class="phrase-btn phrase-play" title="Play"
          onclick="playPhrase(${safeToText},${safeLang},this)">
          <svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        </button>
        <button class="phrase-btn" title="Copy"
          onclick="navigator.clipboard.writeText(${safeToText}).then(()=>showToast('Copied!'))">
          <svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </button>
      </div>
    `;
    list.appendChild(card);
  }
  if (loading) loading.style.display = "none";
}

// ══════════════════════════════════════════════════════════════════
// IMAGE TRANSLATION
// ══════════════════════════════════════════════════════════════════
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
    const preview    = document.getElementById("imgPreview");
    const previewBox = document.getElementById("imgPreviewBox");
    const translateBtn = document.getElementById("imgTranslateBtn");
    if (preview)    preview.src = e.target.result;
    if (previewBox) previewBox.style.display = "block";
    if (translateBtn) translateBtn.style.display = "flex";
    const uploadArea = document.getElementById("uploadArea");
    if (uploadArea) uploadArea.style.display = "none";
  };
  reader.readAsDataURL(file);
}

async function translateImage() {
  const fileInput   = document.getElementById("imageInput");
  const cameraInput = document.getElementById("cameraInput");
  const file = fileInput?.files?.[0] || cameraInput?.files?.[0];
  if (!file) { showToast("No image selected"); return; }

  const fromLang = document.getElementById("imgFromLang")?.value || "en";
  const toLang   = document.getElementById("imgToLang")?.value   || "en";
  const status   = document.getElementById("imgStatus");
  const btn      = document.getElementById("imgTranslateBtn");

  if (status) status.textContent = "Extracting text…";
  if (btn) { btn.disabled = true; }
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

    document.getElementById("imgExtractedText").textContent  = data.extracted || "No text found in image";
    document.getElementById("imgTranslatedText").textContent = data.translated || "—";
    document.getElementById("imgResults").style.display      = "block";
    if (status) status.textContent = "";
  } catch(e) {
    if (status) status.textContent = "Error: " + e.message;
    showToast("Image translation failed");
  } finally {
    if (btn) { btn.disabled = false; }
  }
}

// ══════════════════════════════════════════════════════════════════
// HISTORY & FAVOURITES
// ══════════════════════════════════════════════════════════════════
function saveToHistory(original, translated, fromLang, toLang) {
  try {
    const hist = JSON.parse(localStorage.getItem("vaani_history") || "[]");
    // Deduplicate: don't add same original+toLang twice in a row
    if (hist.length && hist[0].original === original && hist[0].toLang === toLang) return;
    hist.unshift({ original, translated, fromLang, toLang, ts: Date.now() });
    if (hist.length > 200) hist.splice(200);
    localStorage.setItem("vaani_history", JSON.stringify(hist));
  } catch(e) {}
}

function renderHistory() {
  const hist = JSON.parse(localStorage.getItem("vaani_history") || "[]");
  const list = document.getElementById("historyList");
  if (!list) return;
  if (!hist.length) {
    list.innerHTML = `<div class="empty-state">
      <div class="es-icon"><svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>
      <p class="es-title">No history yet</p>
      <p class="es-sub">Start translating to see your history here</p>
    </div>`;
    return;
  }
  list.innerHTML = hist.map((h, i) => `
    <div class="hist-card">
      <div class="hist-langs">${LANG_NAMES[h.fromLang]||h.fromLang} → ${LANG_NAMES[h.toLang]||h.toLang}</div>
      <div class="hist-orig">${h.original}</div>
      <div class="hist-trans">${h.translated}</div>
      <div class="hist-actions">
        <button class="hist-btn" onclick="speakText(${JSON.stringify(h.translated)},${JSON.stringify(h.toLang)}).then(a=>playAndTrack(a))">
          <svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>Play
        </button>
        <button class="hist-btn" onclick="navigator.clipboard.writeText(${JSON.stringify(h.translated)}).then(()=>showToast('Copied!'))">
          <svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>Copy
        </button>
        <button class="hist-btn" onclick="saveFavourite(${JSON.stringify(h.original)},${JSON.stringify(h.translated)},${JSON.stringify(h.fromLang)},${JSON.stringify(h.toLang)})">
          <svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>Save
        </button>
        <button class="hist-btn del" onclick="deleteHistory(${i})">
          <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>Del
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
  if (!translated || translated === "—" || translated === "…") return;
  saveFavourite(original, translated, fromLang, toLang);
}

function saveFavourite(original, translated, fromLang, toLang) {
  try {
    const favs = JSON.parse(localStorage.getItem("vaani_favs") || "[]");
    const exists = favs.some(f => f.original === original && f.toLang === toLang);
    if (exists) { showToast("Already saved!"); return; }
    favs.unshift({ original, translated, fromLang, toLang, ts: Date.now() });
    localStorage.setItem("vaani_favs", JSON.stringify(favs));
    showToast("⭐ Saved to favourites");
    renderFavourites();
  } catch(e) {}
}

function renderFavourites() {
  const favs = JSON.parse(localStorage.getItem("vaani_favs") || "[]");
  const list = document.getElementById("favouritesList");
  if (!list) return;
  if (!favs.length) {
    list.innerHTML = `<div class="empty-state">
      <div class="es-icon"><svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></div>
      <p class="es-title">No favourites yet</p>
      <p class="es-sub">Tap the star after a translation to save it here</p>
    </div>`;
    return;
  }
  list.innerHTML = favs.map((f, i) => `
    <div class="hist-card fav-card">
      <div class="hist-langs">${LANG_NAMES[f.fromLang]||f.fromLang} → ${LANG_NAMES[f.toLang]||f.toLang}</div>
      <div class="hist-orig">${f.original}</div>
      <div class="hist-trans">${f.translated}</div>
      <div class="hist-actions">
        <button class="hist-btn" onclick="speakText(${JSON.stringify(f.translated)},${JSON.stringify(f.toLang)}).then(a=>playAndTrack(a))">
          <svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>Play
        </button>
        <button class="hist-btn" onclick="navigator.clipboard.writeText(${JSON.stringify(f.translated)}).then(()=>showToast('Copied!'))">
          <svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/></svg>Copy
        </button>
        <button class="hist-btn del" onclick="deleteFavourite(${i})">
          <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>Remove
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

// ══════════════════════════════════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════════════════════════════════
const PAGES = ["Home","Single","Conversation","Travel","Image","History","Favourites"];

function navigateTo(page) {
  if (!PAGES.includes(page)) page = "Home";
  PAGES.forEach(p => {
    const el   = document.getElementById(`page${p}`);
    const item = document.getElementById(`menu${p}`);
    if (el)   el.classList.toggle("active", p === page);
    if (item) item.classList.toggle("active", p === page);
  });
  closeMenu();
  history.pushState({ page }, "", `#${page.toLowerCase()}`);

  if (page === "Travel")     renderTravelPhrases();
  if (page === "History")    renderHistory();
  if (page === "Favourites") renderFavourites();

  // Stop any active mic when navigating away
  Object.values(micContexts).forEach(ctx => {
    if (ctx.recognition) {
      try { ctx.recognition.abort(); } catch(e){}
      ctx.recognition = null;
    }
    ctx.state = MicState.IDLE;
  });
}

window.addEventListener("popstate", (e) => {
  const page = e.state?.page || "Home";
  navigateTo(page);
});

// ══════════════════════════════════════════════════════════════════
// MENU
// ══════════════════════════════════════════════════════════════════
function toggleMenu() {
  document.getElementById("sideMenu")?.classList.toggle("open");
  document.getElementById("menuOverlay")?.classList.toggle("open");
}
function closeMenu() {
  document.getElementById("sideMenu")?.classList.remove("open");
  document.getElementById("menuOverlay")?.classList.remove("open");
}

// ══════════════════════════════════════════════════════════════════
// THEME
// ══════════════════════════════════════════════════════════════════
function toggleTheme() {
  const html = document.documentElement;
  const newTheme = html.getAttribute("data-theme") === "dark" ? "light" : "dark";
  html.setAttribute("data-theme", newTheme);
  localStorage.setItem("vaani_theme", newTheme);
}

// ══════════════════════════════════════════════════════════════════
// TOAST
// ══════════════════════════════════════════════════════════════════
let _toastTimer = null;
function showToast(msg) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove("show"), 2800);
}

// ══════════════════════════════════════════════════════════════════
// KEEP-ALIVE PING (prevents Render free-tier sleep)
// ══════════════════════════════════════════════════════════════════
function pingBackend() {
  fetch(`${API_URL}/ping`, {
    method: "GET",
    signal: AbortSignal.timeout(10000)
  }).then(r => r.json())
    .then(d => console.log("[Vaani] Backend:", d.status, "| Bhashini:", d.bhashini))
    .catch(() => {});
}
pingBackend();
setInterval(pingBackend, 10 * 60 * 1000);

// ══════════════════════════════════════════════════════════════════
// Firebase stubs (overridden by firebase.js when loaded)
// ══════════════════════════════════════════════════════════════════
if (typeof window.signInWithGoogle === "undefined") {
  window.signInWithGoogle = () => showToast("Sign-in coming soon");
}
if (typeof window.signOutUser === "undefined") {
  window.signOutUser = () => showToast("Signed out");
}

// ══════════════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", () => {
  // Restore theme
  const savedTheme = localStorage.getItem("vaani_theme") || "dark";
  document.documentElement.setAttribute("data-theme", savedTheme);

  // Sync gender buttons
  syncGenderButtons();

  // Populate all language dropdowns
  initLanguageSelects();

  // Handle language change → retranslate
  ["fromLang","toLang"].forEach(id => {
    document.getElementById(id)?.addEventListener("change", async () => {
      const origText   = document.getElementById("originalText")?.textContent;
      const fromLang   = document.getElementById("fromLang")?.value;
      const toLang     = document.getElementById("toLang")?.value;
      if (origText && origText !== "—" && origText.trim()) {
        document.getElementById("translatedText").textContent = "…";
        const translated = await translateText(origText, fromLang, toLang);
        document.getElementById("translatedText").textContent = translated || "—";
      }
    });
  });

  // Navigate to hash or Home
  const hash      = location.hash.replace("#", "");
  const startPage = PAGES.find(p => p.toLowerCase() === hash) || "Home";
  navigateTo(startPage);

  // Render stored data
  renderHistory();
  renderFavourites();
});
