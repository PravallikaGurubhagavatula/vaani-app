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
const LANG_CONFIG = {
  as:         { name: "Assamese",              nonLatin: true,  gtCode: "as",        ttsCode: "bn",   speechCode: "bn-IN"  },
  bn:         { name: "Bengali",               nonLatin: true,  gtCode: "bn",        ttsCode: "bn",   speechCode: "bn-IN"  },
  brx:        { name: "Bodo",                  nonLatin: true,  gtCode: "brx",       ttsCode: "hi",   speechCode: "hi-IN"  },
  doi:        { name: "Dogri",                 nonLatin: true,  gtCode: "doi",       ttsCode: "hi",   speechCode: "hi-IN"  },
  gu:         { name: "Gujarati",              nonLatin: true,  gtCode: "gu",        ttsCode: "gu",   speechCode: "gu-IN"  },
  hi:         { name: "Hindi",                 nonLatin: true,  gtCode: "hi",        ttsCode: "hi",   speechCode: "hi-IN"  },
  kn:         { name: "Kannada",               nonLatin: true,  gtCode: "kn",        ttsCode: "kn",   speechCode: "kn-IN"  },
  ks:         { name: "Kashmiri",              nonLatin: true,  gtCode: "ks",        ttsCode: "ur",   speechCode: "ur-IN"  },
  kok:        { name: "Konkani",               nonLatin: true,  gtCode: "kok",       ttsCode: "mr",   speechCode: "mr-IN"  },
  mai:        { name: "Maithili",              nonLatin: true,  gtCode: "mai",       ttsCode: "hi",   speechCode: "hi-IN"  },
  ml:         { name: "Malayalam",             nonLatin: true,  gtCode: "ml",        ttsCode: "ml",   speechCode: "ml-IN"  },
  "mni-Mtei": { name: "Manipuri (Meitei)",     nonLatin: true,  gtCode: "mni-Mtei",  ttsCode: "bn",   speechCode: "bn-IN"  },
  mr:         { name: "Marathi",               nonLatin: true,  gtCode: "mr",        ttsCode: "mr",   speechCode: "mr-IN"  },
  ne:         { name: "Nepali",                nonLatin: true,  gtCode: "ne",        ttsCode: "ne",   speechCode: "ne-NP"  },
  or:         { name: "Odia (Oriya)",          nonLatin: true,  gtCode: "or",        ttsCode: "hi",   speechCode: "or-IN"  },
  pa:         { name: "Punjabi",               nonLatin: true,  gtCode: "pa",        ttsCode: "pa",   speechCode: "pa-IN"  },
  sa:         { name: "Sanskrit",              nonLatin: true,  gtCode: "sa",        ttsCode: "hi",   speechCode: "hi-IN"  },
  sat:        { name: "Santali",               nonLatin: true,  gtCode: "sat",       ttsCode: "bn",   speechCode: "bn-IN"  },
  sd:         { name: "Sindhi",                nonLatin: true,  gtCode: "sd",        ttsCode: "ur",   speechCode: "ur-IN"  },
  ta:         { name: "Tamil",                 nonLatin: true,  gtCode: "ta",        ttsCode: "ta",   speechCode: "ta-IN"  },
  te:         { name: "Telugu",                nonLatin: true,  gtCode: "te",        ttsCode: "te",   speechCode: "te-IN"  },
  ur:         { name: "Urdu",                  nonLatin: true,  gtCode: "ur",        ttsCode: "ur",   speechCode: "ur-IN"  },
  bho:        { name: "Bhojpuri",              nonLatin: true,  gtCode: "bho",       ttsCode: "hi",   speechCode: "hi-IN"  },
  mwr:        { name: "Marwari",               nonLatin: true,  gtCode: "mwr",       ttsCode: "hi",   speechCode: "hi-IN"  },
  tcy:        { name: "Tulu",                  nonLatin: true,  gtCode: "tcy",       ttsCode: "kn",   speechCode: "kn-IN"  },
  lus:        { name: "Mizo (Lushai)",         nonLatin: false, gtCode: "lus",       ttsCode: "en",   speechCode: "en-IN"  },
  awa:        { name: "Awadhi",                nonLatin: true,  gtCode: "hi",        ttsCode: "hi",   speechCode: "hi-IN"  },
  mag:        { name: "Magahi",                nonLatin: true,  gtCode: "hi",        ttsCode: "hi",   speechCode: "hi-IN"  },
  hne:        { name: "Chhattisgarhi",         nonLatin: true,  gtCode: "hi",        ttsCode: "hi",   speechCode: "hi-IN"  },
  bgc:        { name: "Haryanvi",              nonLatin: true,  gtCode: "hi",        ttsCode: "hi",   speechCode: "hi-IN"  },
  raj:        { name: "Rajasthani (Marwari)",  nonLatin: true,  gtCode: "mwr",       ttsCode: "hi",   speechCode: "hi-IN"  },
  gom:        { name: "Goan Konkani",          nonLatin: true,  gtCode: "gom",       ttsCode: "mr",   speechCode: "mr-IN"  },
  kha:        { name: "Khasi",                 nonLatin: false, gtCode: "kha",       ttsCode: "en",   speechCode: "en-IN"  },
  lep:        { name: "Lepcha",                nonLatin: true,  gtCode: "ne",        ttsCode: "ne",   speechCode: "ne-NP"  },
  en:         { name: "English",               nonLatin: false, gtCode: "en",        ttsCode: "en",   speechCode: "en-US"  },
};

const BACKEND_ONLY_LANGS = new Set([
  "ks","brx","sat","mwr","tcy","mni-Mtei","doi","kok","mai","as","or","sa","bho","lus",
  "awa","mag","hne","bgc","raj","gom","kha","lep"
]);

const LANG_NAMES = Object.fromEntries(Object.entries(LANG_CONFIG).map(([k, v]) => [k, v.name]));

const LANG_GROUPS = [
  { label: "Major Indian Languages", langs: ["te","ta","hi","kn","ml","mr","bn","gu","pa","ur","or","as","ne","sd","mai","bho","sa"] },
  { label: "Scheduled Languages",    langs: ["kok","gom","mwr","tcy","lus","ks","doi","brx","sat","mni-Mtei"] },
  { label: "Regional Languages",     langs: ["awa","mag","hne","bgc","raj","kha","lep"] },
  { label: "English",                langs: ["en"] }
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
  showToast(`Converting romanized ${LANG_NAMES[fromLang]} to script...`);
  return await transliterateToNative(text, fromLang);
}

// ── TRANSLATION with proper caching ─────────────────
const _translationCache = new Map();

async function translateText(text, fromLang, toLang) {
  if (!text || !text.trim()) return "";
  const q = text.trim();
  if (fromLang === toLang) return q;

  // Cache key = actual text + both langs so different inputs never collide
  const cacheKey = `${q}|||${fromLang}|||${toLang}`;
  if (_translationCache.has(cacheKey)) return _translationCache.get(cacheKey);

  const srcGt = LANG_CONFIG[fromLang]?.gtCode || fromLang;
  const destGt = LANG_CONFIG[toLang]?.gtCode || toLang;
  const needsBackend = BACKEND_ONLY_LANGS.has(fromLang) || BACKEND_ONLY_LANGS.has(toLang);

  let result = null;

  if (!needsBackend) {
    const gtUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${srcGt}&tl=${destGt}&dt=t&q=${encodeURIComponent(q)}`;
    try {
      const res = await fetch(gtUrl, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const d = await res.json();
        if (d && d[0]) {
          const t = d[0].filter(s => s && s[0]).map(s => s[0]).join("");
          if (t) result = t;
        }
      }
    } catch (e) {}

    if (!result) {
      try {
        const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(gtUrl)}`, { signal: AbortSignal.timeout(8000) });
        if (res.ok) {
          const w = await res.json();
          if (w.contents) {
            const d = JSON.parse(w.contents);
            if (d && d[0]) {
              const t = d[0].filter(s => s && s[0]).map(s => s[0]).join("");
              if (t) result = t;
            }
          }
        }
      } catch (e) {}
    }
  }

  if (!result) {
    try {
      const res = await fetch(`${API_URL}/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: q, from_lang: srcGt, to_lang: destGt }),
        signal: AbortSignal.timeout(30000)
      });
      if (res.ok) {
        const d = await res.json();
        if (d.translated && d.translated.trim()) result = d.translated;
      }
    } catch (e) { console.warn(`Backend translate failed (${fromLang}→${toLang}):`, e.message); }
  }

  if (!result) {
    try {
      const res = await fetch(`${API_URL}/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: q, from_lang: "auto", to_lang: destGt }),
        signal: AbortSignal.timeout(30000)
      });
      if (res.ok) {
        const d = await res.json();
        if (d.translated && d.translated.trim()) result = d.translated;
      }
    } catch (e) {}
  }

  if (!result) throw new Error(`Translation failed for ${LANG_NAMES[fromLang] || fromLang} → ${LANG_NAMES[toLang] || toLang}. Check your connection.`);

  if (_translationCache.size > 200) _translationCache.delete(_translationCache.keys().next().value);
  _translationCache.set(cacheKey, result);
  return result;
}

// ── HUMAN-LIKE TTS via Web Speech API ────────────────
// Browser's built-in voices are real human-recorded or neural voices —
// much more natural than gTTS. We use this as the primary TTS engine.
let _speechVoices = [];

function loadVoices() {
  return new Promise(resolve => {
    const voices = window.speechSynthesis?.getVoices() || [];
    if (voices.length > 0) { _speechVoices = voices; resolve(voices); return; }
    if (window.speechSynthesis) {
      window.speechSynthesis.addEventListener('voiceschanged', () => {
        _speechVoices = window.speechSynthesis.getVoices();
        resolve(_speechVoices);
      }, { once: true });
      setTimeout(() => resolve(_speechVoices), 1500);
    } else { resolve([]); }
  });
}

// Map lang code → BCP-47 tags in preference order
const VOICE_LANG_TAGS = {
  te: ['te-IN','te'], ta: ['ta-IN','ta'], hi: ['hi-IN','hi'],
  kn: ['kn-IN','kn'], ml: ['ml-IN','ml'], mr: ['mr-IN','mr'],
  bn: ['bn-IN','bn-BD','bn'], gu: ['gu-IN','gu'], pa: ['pa-IN','pa'],
  ur: ['ur-IN','ur-PK','ur'], or: ['or-IN','hi-IN','hi'],
  as: ['as-IN','bn-IN','bn'], ne: ['ne-NP','ne-IN','ne'],
  sa: ['sa-IN','hi-IN','hi'], sd: ['sd-IN','ur-IN','ur'],
  mai: ['hi-IN','hi'], doi: ['hi-IN','hi'], kok: ['mr-IN','mr'],
  gom: ['mr-IN','mr'], bho: ['hi-IN','hi'], mwr: ['hi-IN','hi'],
  raj: ['hi-IN','hi'], tcy: ['kn-IN','kn'], ks: ['ur-IN','ur'],
  sat: ['bn-IN','bn'], "mni-Mtei": ['bn-IN','bn'], brx: ['hi-IN','hi'],
  lus: ['en-IN','en-GB','en-US','en'], awa: ['hi-IN','hi'],
  mag: ['hi-IN','hi'], hne: ['hi-IN','hi'], bgc: ['hi-IN','hi'],
  kha: ['en-IN','en'], lep: ['ne-NP','hi-IN','en'],
  en:  ['en-IN','en-GB','en-US','en'],
};

function findBestVoice(langCode) {
  if (!_speechVoices.length) return null;
  const tags = VOICE_LANG_TAGS[langCode] || [langCode, 'en-IN', 'en'];
  for (const tag of tags) {
    let v = _speechVoices.find(v => v.lang === tag);
    if (v) return v;
    const prefix = tag.split('-')[0];
    v = _speechVoices.find(v => v.lang.startsWith(prefix + '-') || v.lang === prefix);
    if (v) return v;
  }
  return null;
}

// ── GLOBAL AUDIO STATE ────────────────────────────────
let currentAudio = null, currentAudioBlob = null, currentPlayBtn = null, currentTimelineId = null;
let audioBlobA = null, audioBlobB = null, imgAudioBlob = null;
let _currentUtterance = null;
let _wsWordTimer = null;
let _rafId = null;

function stopAllAudio() {
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
  if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  if (_wsWordTimer) { clearInterval(_wsWordTimer); _wsWordTimer = null; }
  _currentUtterance = null;
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
  const words = text.split(/\s+/).filter(Boolean);
  textEl.innerHTML = words.map((w, i) =>
    `<span class="audio-word" data-idx="${i}" onclick="seekToWord(${i},${words.length},'${containerId}')">${w}</span>`
  ).join(' ');
  return words;
}

function buildTimeline(containerId, btnEl) {
  let tw = document.getElementById('timeline_' + containerId);
  if (!tw) {
    tw = document.createElement('div');
    tw.id = 'timeline_' + containerId;
    tw.className = 'audio-timeline-wrap';
    tw.innerHTML = `
      <div class="audio-timeline-bar">
        <div class="audio-progress" id="progress_${containerId}"></div>
        <input type="range" class="audio-scrubber" id="scrubber_${containerId}" min="0" max="100" value="0" step="0.1">
      </div>
      <div class="audio-time-row">
        <span class="audio-time" id="curTime_${containerId}">0:00</span>
        <span class="audio-time" id="durTime_${containerId}">0:00</span>
      </div>`;
    const card = btnEl?.closest('.result-card, .result-translated');
    if (card) card.appendChild(tw);
  }
  return tw;
}

function updateProgress(containerId, pct, elapsed) {
  const prog = document.getElementById('progress_' + containerId);
  const scr = document.getElementById('scrubber_' + containerId);
  const cur = document.getElementById('curTime_' + containerId);
  if (prog) prog.style.width = Math.min(pct, 100) + '%';
  if (scr) scr.value = Math.min(pct, 100);
  if (cur) cur.textContent = formatTime(elapsed);
}

// ── Audio blob player with requestAnimationFrame word sync ────────────
function createAudioPlayer(blob, btnEl, translatedText, containerId, textElId) {
  stopAllAudio();
  if (!blob) return;

  const audio = new Audio(URL.createObjectURL(blob));
  currentAudio = audio; currentAudioBlob = blob; currentPlayBtn = btnEl; currentTimelineId = containerId;
  btnEl.dataset.playing = 'true';
  btnEl.innerHTML = `<svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>Pause`;

  const textEl = document.getElementById(textElId);
  if (textEl && !textEl.dataset.originalText) textEl.textContent = translatedText;
  const words = textEl ? wrapTextIntoWords(textEl, containerId) : translatedText.trim().split(/\s+/).filter(Boolean);

  buildTimeline(containerId, btnEl);

  const scrubber = document.getElementById('scrubber_' + containerId);
  if (scrubber) scrubber.addEventListener('input', () => {
    if (audio.duration) audio.currentTime = (scrubber.value / 100) * audio.duration;
  });

  // ── RAF loop: update at 60fps for perfectly smooth word tracking ──
  function rafLoop() {
    if (!audio || audio.paused || audio.ended) return;
    const dur = audio.duration;
    if (dur > 0) {
      const pct = (audio.currentTime / dur) * 100;
      updateProgress(containerId, pct, audio.currentTime);
      // Word index: clamp to valid range
      const wIdx = Math.min(Math.floor((audio.currentTime / dur) * words.length), words.length - 1);
      if (textEl) textEl.querySelectorAll('.audio-word').forEach((w, i) => w.classList.toggle('active-word', i === wIdx));
    }
    _rafId = requestAnimationFrame(rafLoop);
  }

  audio.addEventListener('play', () => {
    btnEl.dataset.playing = 'true';
    btnEl.innerHTML = `<svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>Pause`;
    _rafId = requestAnimationFrame(rafLoop);
  });
  audio.addEventListener('pause', () => {
    if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
  });
  audio.addEventListener('loadedmetadata', () => {
    const dur = document.getElementById('durTime_' + containerId);
    if (dur) dur.textContent = formatTime(audio.duration);
  });
  audio.addEventListener('ended', () => {
    if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
    btnEl.dataset.playing = 'false';
    btnEl.innerHTML = `<svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>Play`;
    updateProgress(containerId, 0, 0);
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

// ── Web Speech API player — human voices + boundary word sync ─────────
function playWithHumanVoice(text, langCode, btnEl, containerId, textElId) {
  if (!window.speechSynthesis) return false;
  stopAllAudio();

  const textEl = document.getElementById(textElId);
  if (textEl) {
    if (!textEl.dataset.originalText) textEl.textContent = text;
  }
  const words = textEl ? wrapTextIntoWords(textEl, containerId) : text.trim().split(/\s+/).filter(Boolean);

  buildTimeline(containerId, btnEl);

  const voice = findBestVoice(langCode);
  const utter = new SpeechSynthesisUtterance(text);
  if (voice) { utter.voice = voice; utter.lang = voice.lang; }
  else { utter.lang = (VOICE_LANG_TAGS[langCode] || [langCode])[0]; }
  utter.rate = 0.90;
  utter.pitch = 1.0;
  utter.volume = 1.0;

  _currentUtterance = utter;
  currentPlayBtn = btnEl;
  btnEl.dataset.playing = 'true';
  btnEl.innerHTML = `<svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>Pause`;

  // Estimated reading time (0.4s per word minimum)
  const estimatedMs = Math.max(words.length * 400, 2000);
  let startTime = null;
  let boundaryFired = false;

  // ── Real boundary events (Chrome/Edge desktop) ──
  utter.addEventListener('boundary', (e) => {
    if (e.name !== 'word') return;
    boundaryFired = true;
    // Map character offset → word index
    const charIdx = e.charIndex;
    const textChars = text;
    let cumLen = 0;
    let wIdx = 0;
    for (let i = 0; i < words.length; i++) {
      const idx = textChars.indexOf(words[i], cumLen);
      if (idx >= charIdx) { wIdx = Math.max(0, i - 1); break; }
      cumLen = idx + words[i].length;
      wIdx = i;
    }
    if (textEl) textEl.querySelectorAll('.audio-word').forEach((w, i) => w.classList.toggle('active-word', i === wIdx));
    if (startTime) updateProgress(containerId, ((Date.now() - startTime) / estimatedMs) * 100, (Date.now() - startTime) / 1000);
  });

  utter.onstart = () => {
    startTime = Date.now();
    const durEl = document.getElementById('durTime_' + containerId);
    if (durEl) durEl.textContent = formatTime(estimatedMs / 1000);

    // ── Fallback timer (fires if boundary events not supported — iOS/Firefox/Android) ──
    setTimeout(() => {
      if (!boundaryFired && _currentUtterance === utter) {
        // Use 80ms interval for smooth, video-game-smooth word updates
        let elapsed = 0;
        _wsWordTimer = setInterval(() => {
          elapsed += 80;
          if (elapsed > estimatedMs || _currentUtterance !== utter) {
            clearInterval(_wsWordTimer); _wsWordTimer = null; return;
          }
          const pct = (elapsed / estimatedMs) * 100;
          const wIdx = Math.min(Math.floor((elapsed / estimatedMs) * words.length), words.length - 1);
          updateProgress(containerId, pct, elapsed / 1000);
          if (textEl) textEl.querySelectorAll('.audio-word').forEach((w, i) => w.classList.toggle('active-word', i === wIdx));
        }, 80);
      }
    }, 300);
  };

  utter.onend = () => {
    if (_wsWordTimer) { clearInterval(_wsWordTimer); _wsWordTimer = null; }
    btnEl.dataset.playing = 'false';
    btnEl.innerHTML = `<svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>Play`;
    updateProgress(containerId, 0, 0);
    if (textEl) textEl.querySelectorAll('.audio-word').forEach(w => w.classList.remove('active-word'));
    _currentUtterance = null;
  };
  utter.onerror = () => {
    if (_wsWordTimer) { clearInterval(_wsWordTimer); _wsWordTimer = null; }
    btnEl.dataset.playing = 'false';
    btnEl.innerHTML = `<svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>Play`;
    _currentUtterance = null;
  };

  window.speechSynthesis.speak(utter);
  return true;
}

// ── BACKEND gTTS fallback ─────────────────────────────
async function fetchAudio(text, lang) {
  const ttsLang = LANG_CONFIG[lang]?.ttsCode || lang;
  try {
    const res = await fetch(`${API_URL}/speak`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, lang: ttsLang }),
      signal: AbortSignal.timeout(25000)
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    return blob.size < 100 ? null : blob;
  } catch (e) { return null; }
}

// ── UNIFIED AUDIO LOADER ──────────────────────────────
// 1. Try browser human voices (Web Speech API)
// 2. Fall back to backend gTTS blob
async function loadAndPlayAudio(translatedText, toLang, btnEl, containerId, textElId) {
  if (!btnEl) return;
  await loadVoices();
  if (window.speechSynthesis) {
    const ok = playWithHumanVoice(translatedText, toLang, btnEl, containerId, textElId);
    if (ok) return;
  }
  const blob = await fetchAudio(translatedText, toLang);
  if (blob) {
    if (containerId === 'single') window._singleAudioBlob = blob;
    else if (containerId === 'img') imgAudioBlob = blob;
    else if (containerId === 'convA') audioBlobA = blob;
    else if (containerId === 'convB') audioBlobB = blob;
    createAudioPlayer(blob, btnEl, translatedText, containerId, textElId);
  }
}

function formatTime(s) {
  if (isNaN(s) || !isFinite(s)) return '0:00';
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

// ── THEME ─────────────────────────────────────────────
function toggleTheme() {
  isDarkMode = !isDarkMode;
  document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
  const icon = document.getElementById('themeIcon');
  if (isDarkMode) icon.innerHTML = '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
  else icon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
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

  // ── KEY FIX: Hard-reset ALL state before every translation ──
  stopAllAudio();
  window._singleAudioBlob = null;
  window._singleTranslatedText = null;
  const transEl = document.getElementById("translatedText");
  transEl.innerHTML = '';
  transEl.textContent = "Translating...";
  delete transEl.dataset.originalText;
  document.getElementById("actionBtns").style.display = "none";
  const oldTl = document.getElementById('timeline_single');
  if (oldTl) oldTl.remove();

  const text = await prepareInputText(rawText, fromLang);
  lastSpokenText = text;
  lastFromLang = fromLang;
  document.getElementById("originalText").textContent = text;
  document.getElementById("resultsSection").style.display = "block";
  await translateAndSpeak(text, fromLang);
}

// ── COPY ─────────────────────────────────────────────
function copyTranslation() {
  const text = window._singleTranslatedText
    || document.getElementById("translatedText").dataset.originalText
    || document.getElementById("translatedText").textContent;
  if (text && text !== "—" && !text.startsWith("Translat"))
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

// ── PAGE NAVIGATION with real browser history ─────────
const VALID_PAGES = ['Home', 'Single', 'Conversation', 'Travel', 'Image', 'History', 'Favourites'];

function showPage(page) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".menu-item").forEach(m => m.classList.remove("active"));
  const pageEl = document.getElementById("page" + page);
  if (pageEl) pageEl.classList.add("active");
  const menuEl = document.getElementById("menu" + page);
  if (menuEl) menuEl.classList.add("active");
  if (page === "Travel") loadTravelPhrases();
  if (page === "History") loadHistory();
  if (page === "Favourites") loadFavourites();
}

function navigateTo(page) {
  if (!VALID_PAGES.includes(page)) page = 'Home';
  const currentHash = window.location.hash.replace('#', '');
  showPage(page);
  closeMenu();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  // Use pushState so browser Back/Forward works fully
  if (currentHash !== page) {
    history.pushState({ page }, '', '#' + page);
  }
}

function restorePageFromHash() {
  const hash = window.location.hash.replace('#', '');
  const page = VALID_PAGES.includes(hash) ? hash : 'Home';
  showPage(page);
  // Ensure state is set for this entry
  history.replaceState({ page }, '', '#' + page);
}

// ── BROWSER BACK / FORWARD ────────────────────────────
window.addEventListener('popstate', (e) => {
  const page = e.state?.page || window.location.hash.replace('#', '') || 'Home';
  if (VALID_PAGES.includes(page)) {
    showPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
});

// ── SPEECH RECOGNITION ───────────────────────────────
function getSpeechLang(langCode) {
  return LANG_CONFIG[langCode]?.speechCode || (langCode + '-IN');
}
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition, recognitionActive = false, silenceTimer = null;
let finalTranscript = '', interimTranscript = '';
const SILENCE_TIMEOUT_MS = 2500;
function resetSilenceTimer() {
  if (silenceTimer) clearTimeout(silenceTimer);
  silenceTimer = setTimeout(() => { if (recognition && recognitionActive) recognition.stop(); }, SILENCE_TIMEOUT_MS);
}
try {
  recognition = new SpeechRecognition();
  recognition.continuous = true; recognition.interimResults = true; recognition.maxAlternatives = 3;
} catch (e) { console.warn("SpeechRecognition not supported:", e); }

// ── LANGUAGE CHANGE HANDLERS ──────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById("toLang")?.addEventListener("change", async () => {
    if (lastSpokenText) {
      stopAllAudio();
      window._singleAudioBlob = null; window._singleTranslatedText = null;
      const el = document.getElementById("translatedText");
      el.innerHTML = ''; el.textContent = "Translating..."; delete el.dataset.originalText;
      document.getElementById("actionBtns").style.display = "none";
      const old = document.getElementById('timeline_single'); if (old) old.remove();
      await translateAndSpeak(lastSpokenText, lastFromLang);
    }
  });

  document.getElementById("fromLang")?.addEventListener("change", () => {
    stopAllAudio(); window._singleAudioBlob = null; window._singleTranslatedText = null;
    lastSpokenText = ""; lastFromLang = "";
    const origEl = document.getElementById("originalText");
    const transEl = document.getElementById("translatedText");
    if (origEl) origEl.textContent = "—";
    if (transEl) { transEl.innerHTML = ''; transEl.textContent = "—"; delete transEl.dataset.originalText; }
    document.getElementById("resultsSection").style.display = "none";
    document.getElementById("micStatus").textContent = "Tap to speak";
    const old = document.getElementById('timeline_single'); if (old) old.remove();
  });

  document.getElementById("imgToLang")?.addEventListener("change", async () => {
    const el = document.getElementById('imgExtractedText');
    const extracted = el?.dataset.originalText || el?.textContent;
    if (extracted && extracted !== "—" && document.getElementById('imgResults').style.display !== 'none') {
      stopAllAudio(); imgAudioBlob = null;
      document.getElementById('imgTranslatedText').textContent = "Translating...";
      const fromLang = document.getElementById('imgFromLang').value;
      const toLang = document.getElementById('imgToLang').value;
      try {
        const translated = await translateText(extracted, fromLang, toLang);
        const tEl = document.getElementById('imgTranslatedText');
        tEl.textContent = translated; delete tEl.dataset.originalText;
        window._imgTranslatedText = translated;
        await loadAndPlayAudio(translated, toLang, document.querySelector('#imgActionBtns .ac-btn.ac-primary'), 'img', 'imgTranslatedText');
      } catch (e) { document.getElementById('imgTranslatedText').textContent = "Translation error: " + e.message; }
    }
  });
});

// ── START LISTENING ───────────────────────────────────
function startListening() {
  if (!recognition) { showToast("Speech recognition not supported in this browser"); return; }
  if (recognitionActive) { recognition.stop(); return; }
  currentConvSpeaker = null; finalTranscript = ''; interimTranscript = '';
  const fromLang = document.getElementById("fromLang").value;
  recognition.lang = getSpeechLang(fromLang);
  document.getElementById("micBtn").classList.add("listening");
  document.getElementById("micStatus").textContent = "Listening… (tap mic to stop early)";
  document.getElementById("originalText").textContent = "—";
  document.getElementById("translatedText").textContent = "—";
  document.getElementById("resultsSection").style.display = "none";
  stopAllAudio();
  try { recognition.start(); recognitionActive = true; resetSilenceTimer(); }
  catch (e) { console.warn("Recognition start error:", e); recognitionActive = false; document.getElementById("micStatus").textContent = "Tap to speak"; document.getElementById("micBtn").classList.remove("listening"); }
}

function startConvListening(person) {
  if (!recognition) return;
  if (recognitionActive) { recognition.stop(); return; }
  currentConvSpeaker = person; finalTranscript = ''; interimTranscript = '';
  const langCode = document.getElementById(`convLang${person}`).value;
  recognition.lang = getSpeechLang(langCode);
  document.getElementById(`micBtn${person}`).classList.add("listening");
  document.getElementById(`micStatus${person}`).textContent = "Listening…";
  document.getElementById(`originalText${person}`).textContent = "—";
  document.getElementById(`translatedText${person}`).textContent = "—";
  document.getElementById(`playBtn${person}`).style.display = "none";
  try { recognition.start(); recognitionActive = true; resetSilenceTimer(); }
  catch (e) { console.warn("Recognition start error:", e); recognitionActive = false; }
}

if (recognition) {
  recognition.onresult = (event) => {
    resetSilenceTimer();
    let newFinal = '', newInterim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) {
        let best = result[0];
        for (let j = 1; j < result.length; j++) { if (result[j].confidence > best.confidence) best = result[j]; }
        newFinal += best.transcript;
      } else { newInterim += result[0].transcript; }
    }
    if (newFinal) finalTranscript += newFinal;
    interimTranscript = newInterim;
    const displayText = (finalTranscript + (interimTranscript ? ' ' + interimTranscript : '')).trim();
    if (displayText) {
      if (currentConvSpeaker) document.getElementById(`originalText${currentConvSpeaker}`).textContent = displayText;
      else { document.getElementById("originalText").textContent = displayText; document.getElementById("resultsSection").style.display = "block"; }
    }
  };
  recognition.onend = async () => {
    if (silenceTimer) clearTimeout(silenceTimer);
    recognitionActive = false;
    const spokenText = (finalTranscript || interimTranscript).trim();
    if (!spokenText) {
      const errMsg = "No speech detected. Tap to try again.";
      if (currentConvSpeaker) { document.getElementById(`micStatus${currentConvSpeaker}`).textContent = errMsg; document.getElementById(`micBtn${currentConvSpeaker}`).classList.remove("listening"); }
      else { document.getElementById("micStatus").textContent = errMsg; document.getElementById("micBtn").classList.remove("listening"); }
      return;
    }
    if (currentConvSpeaker) {
      const person = currentConvSpeaker, other = person === 'A' ? 'B' : 'A';
      const fromLang = document.getElementById(`convLang${person}`).value;
      const toLang = document.getElementById(`convLang${other}`).value;
      document.getElementById(`originalText${person}`).textContent = spokenText;
      document.getElementById(`micStatus${person}`).textContent = "Translating...";
      document.getElementById(`micBtn${person}`).classList.remove("listening");
      await translateAndSpeakConv(spokenText, fromLang, toLang, person);
    } else {
      const fromLang = document.getElementById("fromLang").value;
      const text = await prepareInputText(spokenText, fromLang);
      lastSpokenText = text; lastFromLang = fromLang;
      document.getElementById("originalText").textContent = text;
      document.getElementById("micStatus").textContent = "Translating...";
      document.getElementById("micBtn").classList.remove("listening");
      document.getElementById("resultsSection").style.display = "block";
      // Hard-reset translation element
      stopAllAudio(); window._singleAudioBlob = null; window._singleTranslatedText = null;
      const transEl = document.getElementById("translatedText");
      transEl.innerHTML = ''; transEl.textContent = "Translating..."; delete transEl.dataset.originalText;
      document.getElementById("actionBtns").style.display = "none";
      const old = document.getElementById('timeline_single'); if (old) old.remove();
      await translateAndSpeak(text, fromLang);
    }
  };
  recognition.onerror = (event) => {
    if (silenceTimer) clearTimeout(silenceTimer);
    recognitionActive = false;
    let errMsg = "Error. Tap to try again.";
    if (event.error === 'no-speech') errMsg = "No speech heard. Tap to try again.";
    else if (event.error === 'network') errMsg = "Network error. Check connection.";
    else if (event.error === 'not-allowed') errMsg = "Microphone access denied. Please allow mic.";
    else if (event.error === 'aborted') errMsg = "Tap to speak";
    if (currentConvSpeaker) { document.getElementById(`micStatus${currentConvSpeaker}`).textContent = errMsg; document.getElementById(`micBtn${currentConvSpeaker}`).classList.remove("listening"); }
    else { document.getElementById("micStatus").textContent = errMsg; document.getElementById("micBtn").classList.remove("listening"); }
  };
}

// ── TRANSLATE + SPEAK ─────────────────────────────────
async function translateAndSpeak(text, fromLang) {
  const toLang = document.getElementById("toLang").value;
  let translated = null;
  try {
    translated = await translateText(text, fromLang, toLang);
    window._singleTranslatedText = translated;
    // ── FIX: Completely reset textEl DOM before writing new translation ──
    const textEl = document.getElementById("translatedText");
    delete textEl.dataset.originalText;
    textEl.innerHTML = '';
    textEl.textContent = translated;
    document.getElementById("actionBtns").style.display = "flex";
    document.getElementById("micStatus").textContent = "Loading audio...";
    const btn = document.getElementById('playBtn');
    if (btn) await loadAndPlayAudio(translated, toLang, btn, 'single', 'translatedText');
    document.getElementById("micStatus").textContent = "Tap to speak";
    if (window.getCurrentUser?.()) saveToHistory(text, translated, fromLang, toLang);
  } catch (err) {
    if (!translated) {
      document.getElementById("translatedText").textContent = "Translation error — " + (err.message || "try again.");
      document.getElementById("micStatus").textContent = "Error. Tap to try again.";
    }
  }
}

function playAudio() {
  const btn = document.getElementById('playBtn');
  if (!btn) return;
  const text = window._singleTranslatedText || document.getElementById('translatedText').dataset.originalText || document.getElementById('translatedText').textContent;
  const toLang = document.getElementById("toLang").value;
  if (!text || text === '—' || text.startsWith('Translat')) return;
  // Toggle Web Speech if currently speaking
  if (_currentUtterance && window.speechSynthesis?.speaking) {
    window.speechSynthesis.cancel();
    btn.dataset.playing = 'false'; btn.innerHTML = `<svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>Play`;
    return;
  }
  if (window._singleAudioBlob) { toggleAudio(window._singleAudioBlob, btn, text, 'single', 'translatedText'); return; }
  if (window.speechSynthesis) { playWithHumanVoice(text, toLang, btn, 'single', 'translatedText'); return; }
  showToast("Generating audio...");
  fetchAudio(text, toLang).then(b => {
    if (b) { window._singleAudioBlob = b; createAudioPlayer(b, btn, text, 'single', 'translatedText'); }
    else showToast(`Audio not available for ${LANG_NAMES[toLang] || toLang}`);
  });
}

async function translateAndSpeakConv(text, fromLang, toLang, person) {
  let translated = null;
  try {
    translated = await translateText(text, fromLang, toLang);
    // ── FIX: Hard-reset translation element ──
    const textEl = document.getElementById(`translatedText${person}`);
    delete textEl.dataset.originalText; textEl.innerHTML = ''; textEl.textContent = translated;
    const btn = document.getElementById(`playBtn${person}`);
    if (btn) btn.style.display = "flex";
    document.getElementById(`micStatus${person}`).textContent = "Loading audio...";
    window[`_convText${person}`] = translated;
    if (btn) await loadAndPlayAudio(translated, toLang, btn, `conv${person}`, `translatedText${person}`);
    document.getElementById(`micStatus${person}`).textContent = "Tap to speak";
  } catch (err) { if (!translated) document.getElementById(`micStatus${person}`).textContent = "Translation error. Try again."; }
}

function playAudioA() {
  const el = document.getElementById("translatedTextA");
  const text = window._convTextA || el?.dataset.originalText || el?.textContent;
  const btn = document.getElementById('playBtnA');
  const toLang = document.getElementById('convLangB').value;
  if (!btn || !text) return;
  if (audioBlobA) { toggleAudio(audioBlobA, btn, text, 'convA', 'translatedTextA'); return; }
  if (window.speechSynthesis) playWithHumanVoice(text, toLang, btn, 'convA', 'translatedTextA');
}
function playAudioB() {
  const el = document.getElementById("translatedTextB");
  const text = window._convTextB || el?.dataset.originalText || el?.textContent;
  const btn = document.getElementById('playBtnB');
  const toLang = document.getElementById('convLangA').value;
  if (!btn || !text) return;
  if (audioBlobB) { toggleAudio(audioBlobB, btn, text, 'convB', 'translatedTextB'); return; }
  if (window.speechSynthesis) playWithHumanVoice(text, toLang, btn, 'convB', 'translatedTextB');
}

// ── SWAP ─────────────────────────────────────────────
function swapLanguages() {
  const f = document.getElementById("fromLang"), t = document.getElementById("toLang");
  [f.value, t.value] = [t.value, f.value];
  lastSpokenText = ""; lastFromLang = "";
  stopAllAudio(); window._singleAudioBlob = null; window._singleTranslatedText = null;
  const origEl = document.getElementById("originalText");
  const transEl = document.getElementById("translatedText");
  if (origEl) origEl.textContent = "—";
  if (transEl) { transEl.innerHTML = ''; transEl.textContent = "—"; delete transEl.dataset.originalText; }
  document.getElementById("resultsSection").style.display = "none";
  document.getElementById("micStatus").textContent = "Tap to speak";
  const old = document.getElementById('timeline_single'); if (old) old.remove();
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
  currentCategory = cat; document.querySelectorAll(".cat-btn").forEach(b => b.classList.remove("active")); btn.classList.add("active"); loadTravelPhrases();
}
async function loadTravelPhrases() {
  const fromLang = document.getElementById("travelFromLang").value;
  const toLang = document.getElementById("travelToLang").value;
  const key = `${currentCategory}_${fromLang}_${toLang}`;
  document.getElementById("phrasesList").innerHTML = ""; document.getElementById("travelLoading").style.display = "flex";
  if (travelPhrasesCache[key]) { document.getElementById("travelLoading").style.display = "none"; renderPhrases(travelPhrasesCache[key], fromLang, toLang); return; }
  try {
    const results = [];
    for (const phrase of PHRASES[currentCategory]) {
      const [frT, toT] = await Promise.all([translateText(phrase.en, "en", fromLang), translateText(phrase.en, "en", toLang)]);
      results.push({ en: phrase.en, from: frT, to: toT, toLang });
    }
    travelPhrasesCache[key] = results; document.getElementById("travelLoading").style.display = "none"; renderPhrases(results, fromLang, toLang);
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
function copyPhraseText(i) { const p = window._phraseResults[i]; if (p) navigator.clipboard.writeText(p.to).then(() => showToast("Copied")); }
async function playPhrase(i) {
  const p = window._phraseResults[i]; if (!p) return;
  stopAllAudio(); await loadVoices();
  if (window.speechSynthesis) {
    const utter = new SpeechSynthesisUtterance(p.to);
    const voice = findBestVoice(p.toLang);
    if (voice) { utter.voice = voice; utter.lang = voice.lang; }
    else { utter.lang = (VOICE_LANG_TAGS[p.toLang] || [p.toLang])[0]; }
    utter.rate = 0.90; window.speechSynthesis.speak(utter); return;
  }
  const blob = await fetchAudio(p.to, p.toLang);
  if (blob) new Audio(URL.createObjectURL(blob)).play();
  else showToast(`Audio unavailable for ${LANG_NAMES[p.toLang] || p.toLang}`);
}

// ── IMAGE TRANSLATION ─────────────────────────────────
let currentImageFile = null;
function handleDrop(e) { e.preventDefault(); document.getElementById('uploadArea').classList.remove('drag-over'); const f = e.dataTransfer.files[0]; if (f && f.type.startsWith('image/')) processImageFile(f); }
function handleImageUpload(e) { const f = e.target.files[0]; if (f) processImageFile(f); }
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
    imgAudioBlob = null; stopAllAudio();
    const old = document.getElementById('timeline_img'); if (old) old.remove();
  };
  reader.readAsDataURL(file);
}
const BTN_READY_HTML = `<svg viewBox="0 0 24 24" style="width:16px;height:16px;stroke:white;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>Extract & Translate`;
async function translateImage() {
  if (!currentImageFile) { showToast("Please upload an image first"); return; }
  const fromLang = document.getElementById('imgFromLang').value, toLang = document.getElementById('imgToLang').value;
  const btn = document.getElementById('imgTranslateBtn'), statusEl = document.getElementById('imgStatus');
  btn.disabled = true; btn.textContent = 'Reading image...'; statusEl.textContent = 'Extracting text...';
  document.getElementById('imgResults').style.display = 'none'; stopAllAudio();
  const old = document.getElementById('timeline_img'); if (old) old.remove(); imgAudioBlob = null;
  let translated = null;
  try {
    const tessLangs = { en:'eng',hi:'hin',te:'tel',ta:'tam',kn:'kan',ml:'mal',bn:'ben',mr:'mar',gu:'guj',pa:'pan',ur:'urd',or:'ori',as:'asm',ne:'nep',sa:'san',sd:'snd',mai:'hin',doi:'hin',kok:'mar',bho:'hin',mwr:'hin',tcy:'kan',ks:'urd',sat:'ben',"mni-Mtei":'ben',lus:'eng',brx:'hin',awa:'hin',mag:'hin',hne:'hin' };
    const ocrLang = tessLangs[fromLang] || 'eng';
    statusEl.textContent = 'Loading OCR...'; btn.textContent = 'Loading OCR...';
    const { createWorker } = Tesseract;
    const worker = await createWorker(ocrLang, 1, { logger: m => { if (m.status === 'recognizing text') statusEl.textContent = `Reading... ${Math.round((m.progress||0)*100)}%`; else if (m.status) statusEl.textContent = m.status.charAt(0).toUpperCase() + m.status.slice(1) + '...'; } });
    const { data: { text } } = await worker.recognize(currentImageFile); await worker.terminate();
    const extracted = text.trim();
    if (!extracted || extracted.length < 2) { statusEl.textContent = 'No text found. Try a clearer image.'; btn.disabled = false; btn.innerHTML = BTN_READY_HTML; return; }
    const extEl = document.getElementById('imgExtractedText'); extEl.textContent = extracted; delete extEl.dataset.originalText;
    statusEl.textContent = 'Translating...'; btn.textContent = 'Translating...';
    translated = await translateText(extracted, fromLang, toLang);
    const tEl = document.getElementById('imgTranslatedText'); tEl.textContent = translated; delete tEl.dataset.originalText;
    window._imgTranslatedText = translated;
    document.getElementById('imgResults').style.display = 'block'; statusEl.textContent = 'Loading audio...';
    const playBtn = document.querySelector('#imgActionBtns .ac-btn.ac-primary');
    await loadAndPlayAudio(translated, toLang, playBtn, 'img', 'imgTranslatedText');
    statusEl.textContent = 'Done ✓';
  } catch (err) { statusEl.textContent = !translated ? 'Error: ' + (err.message||'Something went wrong.') : 'Done ✓'; if (translated) document.getElementById('imgResults').style.display = 'block'; }
  btn.disabled = false; btn.innerHTML = BTN_READY_HTML;
}
function playImgAudio() {
  const el = document.getElementById('imgTranslatedText');
  const text = window._imgTranslatedText || el?.dataset.originalText || el?.textContent;
  const btn = document.querySelector('#imgActionBtns .ac-btn.ac-primary');
  const toLang = document.getElementById('imgToLang').value;
  if (!btn || !text) return;
  if (imgAudioBlob) { toggleAudio(imgAudioBlob, btn, text, 'img', 'imgTranslatedText'); return; }
  if (window.speechSynthesis) { playWithHumanVoice(text, toLang, btn, 'img', 'imgTranslatedText'); return; }
  showToast("Generating audio..."); fetchAudio(text, toLang).then(b => { if (b) { imgAudioBlob = b; createAudioPlayer(b, btn, text, 'img', 'imgTranslatedText'); } else showToast(`Audio unavailable for ${LANG_NAMES[toLang]||toLang}`); });
}

// ── SAVE TO FAVOURITES ────────────────────────────────
window.saveSingleToFavourites = function () {
  const original = document.getElementById('originalText').textContent;
  const translated = window._singleTranslatedText || document.getElementById('translatedText').dataset.originalText || document.getElementById('translatedText').textContent;
  const fromLang = document.getElementById('fromLang').value, toLang = document.getElementById('toLang').value;
  if (!original || original === '—') { showToast("Nothing to save"); return; }
  if (!translated || translated === '—' || translated.startsWith("Translat")) { showToast("Wait for translation to complete"); return; }
  if (window.saveToFavourites) window.saveToFavourites(original, translated, fromLang, toLang);
};

// ── INIT ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const savedTheme = localStorage.getItem('vaani_theme');
  if (savedTheme === 'light') {
    isDarkMode = false; document.documentElement.setAttribute('data-theme', 'light');
    const icon = document.getElementById('themeIcon');
    if (icon) icon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
  }
  initLanguageSelects();
  loadVoices(); // Pre-load human voices for instant playback
  restorePageFromHash();
});
