/* ================================================================
   Vaani — app.js  v5.3  PERMISSION SYSTEM + ALL FIXES

   NEW IN v5.3:
   0.  PERMISSION MANAGEMENT SYSTEM — unified handlePermission()
       - navigator.permissions.query() state detection
       - granted / prompt / denied handling
       - Clear UI guide on denial (not alert)
       - Retry without reload where possible
       - iOS Safari fallback (no permissions API)
       - PWA installed app support
       - Cross-device: Android Chrome, iOS Safari, Desktop, Samsung

   ALL PRIOR FIXES RETAINED:
   1.  MIC PERMISSION      — explicit getUserMedia before SR
   2.  PWA CACHE BUG       — sw.js network-first
   3.  HISTORY STORAGE     — array-based, append-only
   4.  AUTH SESSION        — localStorage-backed
   5.  HISTORY/FAVS UI     — reactive re-render
   6.  BACK NAVIGATION     — pushState + popstate
   7.  AUDIO TIMELINE      — timeupdate, drag seek, replay
   8.  SPEECH RECOGNITION  — continuous, interimResults
   9.  TTS PRONUNCIATION   — correct voice selection
   10. CONVERSATION MODE   — reactive on lang change
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
// FIX 0: UNIFIED PERMISSION MANAGEMENT SYSTEM
//
// handlePermission(type) → Promise<boolean>
//   type: "audio" | "video"
//
// Flow:
//   1. Query navigator.permissions (where available)
//   2. "granted"  → fast-path, no UI needed
//   3. "prompt"   → call getUserMedia to trigger popup
//   4. "denied"   → show non-blocking UI guide with retry
//   5. iOS/Safari → no permissions API, try getUserMedia directly
//   6. On success → resolve true, cache grant in memory
//   7. On failure → show guide, resolve false
// ══════════════════════════════════════════════════════════════════

// In-memory grant cache to avoid repeated queries
const _permissionGranted = { audio: false, video: false };

/**
 * Detect if running on iOS (Safari / WKWebView / PWA).
 * iOS Safari does NOT support navigator.permissions for mic/camera.
 */
function _isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/**
 * Detect if running as an installed PWA (standalone mode).
 */
function _isPWA() {
  return window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;
}

/**
 * Show a clear, styled permission denial guide inside a modal.
 * Non-blocking — does NOT use alert().
 * Includes platform-specific instructions + Retry button.
 *
 * @param {string} type - "audio" or "video"
 * @param {Function} onRetry - called when user taps Retry
 */
function _showPermissionDeniedGuide(type, onRetry) {
  // Remove any existing guide
  document.getElementById("vaaniPermGuide")?.remove();

  const isAudio  = type === "audio";
  const label    = isAudio ? "Microphone" : "Camera";
  const icon     = isAudio
    ? `<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`
    : `<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`;

  // Detect platform for tailored instructions
  const ios     = _isIOS();
  const pwa     = _isPWA();
  const samsung = /SamsungBrowser/.test(navigator.userAgent);
  const firefox = /Firefox/.test(navigator.userAgent);

  let steps = "";
  if (ios) {
    steps = `
      <div class="vpg-step"><span class="vpg-num">1</span>Open <strong>Settings</strong> app on your iPhone/iPad</div>
      <div class="vpg-step"><span class="vpg-num">2</span>Scroll to <strong>Safari</strong> (or your browser)</div>
      <div class="vpg-step"><span class="vpg-num">3</span>Tap <strong>${label}</strong> and set to <strong>Allow</strong></div>
      <div class="vpg-step"><span class="vpg-num">4</span>Return to this app and tap <strong>Retry</strong></div>`;
  } else if (samsung) {
    steps = `
      <div class="vpg-step"><span class="vpg-num">1</span>Tap the <strong>⋮ menu</strong> (top right) in Samsung Internet</div>
      <div class="vpg-step"><span class="vpg-num">2</span>Go to <strong>Settings → Sites and downloads → Site permissions</strong></div>
      <div class="vpg-step"><span class="vpg-num">3</span>Find this site and enable <strong>${label}</strong></div>
      <div class="vpg-step"><span class="vpg-num">4</span>Return here and tap <strong>Retry</strong></div>`;
  } else if (firefox) {
    steps = `
      <div class="vpg-step"><span class="vpg-num">1</span>Click the <strong>lock icon</strong> 🔒 in the address bar</div>
      <div class="vpg-step"><span class="vpg-num">2</span>Click <strong>Connection secure → More information</strong></div>
      <div class="vpg-step"><span class="vpg-num">3</span>Go to <strong>Permissions</strong> and allow <strong>${label}</strong></div>
      <div class="vpg-step"><span class="vpg-num">4</span>Reload the page and tap <strong>Retry</strong></div>`;
  } else if (pwa) {
    steps = `
      <div class="vpg-step"><span class="vpg-num">1</span>Open <strong>Chrome</strong> browser (not this app)</div>
      <div class="vpg-step"><span class="vpg-num">2</span>Go to <strong>chrome://settings/content/${isAudio ? "microphone" : "camera"}</strong></div>
      <div class="vpg-step"><span class="vpg-num">3</span>Find <strong>${location.hostname}</strong> and allow it</div>
      <div class="vpg-step"><span class="vpg-num">4</span>Return to this app and tap <strong>Retry</strong></div>`;
  } else {
    // Chrome / Edge / default
    steps = `
      <div class="vpg-step"><span class="vpg-num">1</span>Click the <strong>lock icon</strong> 🔒 in your browser's address bar</div>
      <div class="vpg-step"><span class="vpg-num">2</span>Find <strong>${label}</strong> in the permissions list</div>
      <div class="vpg-step"><span class="vpg-num">3</span>Change it from <strong>Blocked</strong> to <strong>Allow</strong></div>
      <div class="vpg-step"><span class="vpg-num">4</span>Tap <strong>Retry</strong> below — no reload needed</div>`;
  }

  const modal = document.createElement("div");
  modal.id = "vaaniPermGuide";
  modal.innerHTML = `
    <div class="vpg-backdrop"></div>
    <div class="vpg-sheet" role="dialog" aria-modal="true" aria-label="${label} Permission Required">
      <div class="vpg-icon vpg-icon-denied">${icon}</div>
      <div class="vpg-title">${label} Access Blocked</div>
      <div class="vpg-sub">Vaani needs ${label.toLowerCase()} access to translate your speech. Follow these steps to enable it:</div>
      <div class="vpg-steps">${steps}</div>
      <div class="vpg-actions">
        <button class="vpg-retry" id="vpgRetryBtn">
          <svg viewBox="0 0 24 24" width="16" height="16"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.43"/></svg>
          Retry Permission
        </button>
        <button class="vpg-dismiss" id="vpgDismissBtn">Maybe Later</button>
      </div>
    </div>`;

  document.body.appendChild(modal);
  requestAnimationFrame(() => modal.classList.add("vpg-open"));

  const close = () => {
    modal.classList.remove("vpg-open");
    setTimeout(() => modal.remove(), 300);
  };

  modal.querySelector("#vpgDismissBtn").addEventListener("click", close);
  modal.querySelector(".vpg-backdrop").addEventListener("click", close);

  modal.querySelector("#vpgRetryBtn").addEventListener("click", async () => {
    close();
    // Small delay so modal closes before getUserMedia prompt appears
    setTimeout(() => onRetry(), 200);
  });
}

/**
 * Show a brief inline banner (not modal) when permission is already granted.
 * Used to confirm state without interrupting flow.
 */
function _showPermissionGrantedBrief(type) {
  // No UI needed — just proceed silently
}

/**
 * Core: attempt getUserMedia for the given type.
 * Stops stream immediately — only need the permission grant.
 * Returns true on success, false on failure.
 */
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
    console.warn(`[Vaani] getUserMedia(${type}) error:`, err.name, err.message);
    _permissionGranted[type] = false;
    return false;
  }
}

/**
 * MAIN ENTRY POINT: handlePermission(type)
 *
 * Call this before any mic or camera usage.
 * Handles all 3 permission states across all platforms.
 *
 * @param {string} type - "audio" | "video"
 * @param {string} [micStatusId] - optional element id to update status text
 * @returns {Promise<boolean>} - true if permission granted
 */
async function handlePermission(type, micStatusId) {
  // Fast-path: already granted in this session
  if (_permissionGranted[type]) return true;

  const setStatus = (msg) => {
    if (micStatusId) setMicStatus(msg, micStatusId);
  };

  // iOS Safari: no permissions API → go direct to getUserMedia
  const iosMode = _isIOS() || !navigator.permissions;

  if (!iosMode) {
    // Query permission state via Permissions API
    const permName = type === "audio" ? "microphone" : "camera";
    let state = "prompt";
    try {
      const result = await navigator.permissions.query({ name: permName });
      state = result.state;

      // Listen for future changes (user enables from browser settings)
      result.addEventListener("change", () => {
        if (result.state === "granted") {
          _permissionGranted[type] = true;
          console.log(`[Vaani] ${type} permission changed to granted`);
          // Close any open guide
          document.getElementById("vaaniPermGuide")?.remove();
        } else if (result.state === "denied") {
          _permissionGranted[type] = false;
        }
      }, { once: true });

    } catch (e) {
      // Firefox or older browser may not support all permission names
      console.warn("[Vaani] permissions.query failed:", e.message);
      state = "prompt";
    }

    if (state === "granted") {
      _permissionGranted[type] = true;
      return true;
    }

    if (state === "denied") {
      // Show guide — cannot re-prompt without user action
      return new Promise((resolve) => {
        _showPermissionDeniedGuide(type, async () => {
          // Retry: attempt getUserMedia — will work if user enabled in settings
          setStatus("Checking permission…");
          const ok = await _attemptGetUserMedia(type);
          if (ok) {
            resolve(true);
          } else {
            // Still denied — show guide again
            _showPermissionDeniedGuide(type, async () => {
              const ok2 = await _attemptGetUserMedia(type);
              resolve(ok2);
            });
            resolve(false);
          }
        });
      });
    }

    // state === "prompt" — fall through to getUserMedia
  }

  // Attempt getUserMedia (triggers browser popup on "prompt" or iOS)
  setStatus("Requesting permission…");
  const ok = await _attemptGetUserMedia(type);

  if (ok) return true;

  // Failed — check if now denied (post-attempt)
  if (!iosMode) {
    try {
      const permName = type === "audio" ? "microphone" : "camera";
      const result = await navigator.permissions.query({ name: permName });
      if (result.state === "denied") {
        return new Promise((resolve) => {
          _showPermissionDeniedGuide(type, async () => {
            setStatus("Checking permission…");
            const ok2 = await _attemptGetUserMedia(type);
            resolve(ok2);
          });
        });
      }
    } catch (_) {}
  }

  // iOS denied or other error — always show guide
  return new Promise((resolve) => {
    _showPermissionDeniedGuide(type, async () => {
      setStatus("Checking permission…");
      const ok2 = await _attemptGetUserMedia(type);
      resolve(ok2);
    });
  });
}

// ── Legacy wrapper for backwards-compat (used in mic flow) ────────
async function requestMicPermission(micStatusId) {
  return handlePermission("audio", micStatusId || "micStatus");
}

// ══════════════════════════════════════════════════════════════════
// FIX 9: TTS PRONUNCIATION — select correct voice from speechSynthesis
// ══════════════════════════════════════════════════════════════════

const TTS_LOCALE_MAP = {
  te: "te-IN", ta: "ta-IN", hi: "hi-IN", kn: "kn-IN", ml: "ml-IN",
  mr: "mr-IN", bn: "bn-IN", gu: "gu-IN", pa: "pa-IN", ur: "ur-IN",
  or: "or-IN", as: "as-IN", ne: "ne-NP", sa: "hi-IN", sd: "ur-IN",
  mai: "hi-IN", doi: "hi-IN", kok: "mr-IN", gom: "mr-IN", bho: "hi-IN",
  mwr: "hi-IN", tcy: "kn-IN", ks: "ur-IN", brx: "hi-IN", sat: "bn-IN",
  "mni-Mtei": "bn-IN", lus: "en-IN", awa: "hi-IN", mag: "hi-IN",
  hne: "hi-IN", bgc: "hi-IN", raj: "hi-IN", kha: "en-IN", lep: "ne-NP",
  en: "en-US",
};

let _voicesLoaded = false;
let _voiceList = [];

function _loadVoices() {
  return new Promise(resolve => {
    const voices = speechSynthesis.getVoices();
    if (voices.length > 0) {
      _voiceList = voices;
      _voicesLoaded = true;
      resolve(voices);
      return;
    }
    const onVoicesChanged = () => {
      _voiceList = speechSynthesis.getVoices();
      _voicesLoaded = true;
      speechSynthesis.removeEventListener("voiceschanged", onVoicesChanged);
      resolve(_voiceList);
    };
    speechSynthesis.addEventListener("voiceschanged", onVoicesChanged);
    setTimeout(() => {
      _voiceList = speechSynthesis.getVoices();
      _voicesLoaded = true;
      resolve(_voiceList);
    }, 1500);
  });
}

async function _getBestVoice(langCode) {
  if (!_voicesLoaded) await _loadVoices();
  const locale = TTS_LOCALE_MAP[langCode] || "en-US";
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
    const voice = await _getBestVoice(langCode);
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      utterance.lang = TTS_LOCALE_MAP[langCode] || "en-US";
    }
    utterance.rate = 0.9;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
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
    return (d2.translated || "").trim();
  } catch (e) {
    console.warn("[Vaani] _pivotTranslate:", e.message);
    return "";
  }
}

// ══════════════════════════════════════════════════════════════════
// AUDIO SYSTEM (FIX 7)
// ══════════════════════════════════════════════════════════════════

let _curAudio          = null;
let _audioPlaying      = false;
let _wordHighlightWords = [];
let _wordHighlightEl    = null;
let _wordHighlightRAF   = null;
let _wordHighlightStart = 0;
let _wordHighlightDur   = 0;
let _activeTimelineSuffix = "";
let _boundTimeUpdate = null;
let _boundAudioEnded = null;
let _timelineSeeking = false;

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
    if (_boundAudioEnded) { _curAudio.removeEventListener("ended", _boundAudioEnded); _boundAudioEnded = null; }
  }
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
  const s = suffix || "";
  const bar = document.getElementById(`timelineSeek${s}`);
  const cur = document.getElementById(`timelineCurrent${s}`);
  if (bar) { bar.value = 0; _updateSeekFill(bar, 0); }
  if (cur) cur.textContent = "0:00";
}

function showTimeline(suffix) {
  const s = suffix || "";
  const wrap = document.getElementById(`audioTimeline${s}`);
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
  if (audio.readyState >= 1) setDur();
  else audio.addEventListener("loadedmetadata", setDur, { once: true });
  _boundTimeUpdate = () => {
    if (_timelineSeeking) return;
    const pct = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
    bar.value = pct;
    _updateSeekFill(bar, pct);
    cur.textContent = _fmtTime(audio.currentTime);
  };
  _boundAudioEnded = () => {
    _audioPlaying = false;
    _updateAllPlayPauseBtns();
    clearWordHighlight();
    bar.value = 0;
    _updateSeekFill(bar, 0);
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
    if (cur && _curAudio && isFinite(_curAudio.duration)) {
      cur.textContent = _fmtTime((_curAudio.duration * pct) / 100);
    }
  });
  bar.addEventListener("change", () => {
    if (_curAudio && isFinite(_curAudio.duration)) {
      _curAudio.currentTime = (_curAudio.duration * parseFloat(bar.value)) / 100;
    }
    _timelineSeeking = false;
    if (_audioPlaying && _curAudio && _curAudio.paused) {
      _curAudio.play().catch(e => console.warn("[Vaani] seek-resume:", e.message));
    }
  });
  bar.addEventListener("touchstart", () => { _timelineSeeking = true; }, { passive: true });
  bar.addEventListener("touchend", () => {
    if (_curAudio && isFinite(_curAudio.duration)) {
      _curAudio.currentTime = (_curAudio.duration * parseFloat(bar.value)) / 100;
    }
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
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
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
  if (audio.readyState >= 1) setDur();
  else audio.addEventListener("loadedmetadata", setDur, { once: true });
  _startWordHighlightLoop(audio);
}

function _startWordHighlightLoop(audio) {
  if (_wordHighlightRAF) cancelAnimationFrame(_wordHighlightRAF);
  const words = _wordHighlightWords, el = _wordHighlightEl;
  if (!el || !words.length) return;
  let lastIdx = -1;
  function tick() {
    if (!_curAudio || _curAudio !== audio || !_wordHighlightEl) return;
    const dur = audio.duration || _wordHighlightDur || 1;
    const progress = Math.min(audio.currentTime / dur, 1);
    const idx = Math.min(Math.floor(progress * words.length), words.length - 1);
    if (idx !== lastIdx) {
      el.querySelector(".wh-current")?.classList.remove("wh-current");
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
    if (_wordHighlightEl.querySelectorAll(".wh-word").length > 0) {
      _wordHighlightEl.innerHTML = _wordHighlightEl.textContent;
    }
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
      signal: AbortSignal.timeout(25000)
    });
    if (!r.ok) return null;
    const blob = await r.blob();
    const url  = URL.createObjectURL(blob);
    const audio = new Audio(url);
    const revokeUrl = () => { try { URL.revokeObjectURL(url); } catch(_){} };
    audio.addEventListener("ended", revokeUrl, { once: true });
    audio.addEventListener("error", revokeUrl, { once: true });
    return audio;
  } catch (e) {
    console.warn("[Vaani] speakText:", e.message);
    return null;
  }
}

async function autoPlay(text, lang, timelineSuffix, highlightEl) {
  if (!text || text === "—" || text === "…" || !lang) return;
  stopAudio();
  const suffix = timelineSuffix || "";
  showTimeline(suffix);
  resetTimeline(suffix);
  _activeTimelineSuffix = suffix;
  const audio = await speakText(text, lang);
  if (!audio) { _speakBrowser(text, lang); return; }
  _curAudio = audio;
  _attachTimelineToAudio(audio, suffix);
  if (highlightEl) {
    audio.addEventListener("canplay", () => {
      startWordHighlight(highlightEl, text, audio);
    }, { once: true });
  }
  audio.currentTime = 0;
  try {
    await audio.play();
    _audioPlaying = true;
    _updateAllPlayPauseBtns();
  } catch (e) {
    console.warn("[Vaani] play:", e.message);
    _audioPlaying = false;
    _updateAllPlayPauseBtns();
    _speakBrowser(text, lang);
  }
}

// ══════════════════════════════════════════════════════════════════
// MIC STATE MACHINE (FIX 1 + FIX 8)
// ══════════════════════════════════════════════════════════════════

const MicState = { IDLE:"idle", LISTENING:"listening", STOPPED:"stopped" };
const _mic = {
  single: { state: MicState.IDLE, rec: null, last: "", finalTranscript: "", interimTranscript: "" },
  A:      { state: MicState.IDLE, rec: null, last: "", finalTranscript: "", interimTranscript: "" },
  B:      { state: MicState.IDLE, rec: null, last: "", finalTranscript: "", interimTranscript: "" },
};
const SPEECH_SILENCE_TIMEOUT = 4000;

function _killMic(ctx) {
  if (ctx._silenceTimer) { clearTimeout(ctx._silenceTimer); ctx._silenceTimer = null; }
  if (ctx.rec) { try { ctx.rec.abort(); } catch(_){} ctx.rec = null; }
  ctx.state = MicState.IDLE;
  ctx.last  = "";
  ctx.finalTranscript = "";
  ctx.interimTranscript = "";
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
    if (ctx.rec) try { ctx.rec.stop(); } catch(_){}
    ctx.state = MicState.STOPPED;
    micBtn?.classList.remove("listening");
    setMicStatus("Processing…");
    return;
  }

  _killMic(ctx);
  clearSingleResults();

  if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
    showToast("Voice input not supported. Use Chrome on Android/Desktop.");
    return;
  }

  // FIX 0: Use unified permission system
  setMicStatus("Requesting microphone…");
  const permitted = await handlePermission("audio", "micStatus");
  if (!permitted) {
    setMicStatus("Tap to speak");
    return;
  }

  const fromLang   = document.getElementById("fromLang")?.value || "en";
  const speechCode = LANG_CONFIG[fromLang]?.speechCode || "en-US";
  const SR  = window.SpeechRecognition || window.webkitSpeechRecognition;
  const rec = new SR();

  rec.lang            = speechCode;
  rec.continuous      = true;
  rec.interimResults  = true;
  rec.maxAlternatives = 3;

  ctx.rec              = rec;
  ctx.state            = MicState.LISTENING;
  ctx.finalTranscript  = "";
  ctx.interimTranscript = "";

  micBtn?.classList.add("listening");
  setMicStatus("Listening… (tap again to stop)");

  rec.onresult = (e) => {
    if (ctx._silenceTimer) clearTimeout(ctx._silenceTimer);
    let interimText = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const result = e.results[i];
      if (result.isFinal) ctx.finalTranscript += result[0].transcript;
      else interimText += result[0].transcript;
    }
    ctx.interimTranscript = interimText;
    const combined = (ctx.finalTranscript + " " + ctx.interimTranscript).trim();
    if (combined) showOriginalText(combined);
    ctx._silenceTimer = setTimeout(() => {
      if (ctx.rec && ctx.state === MicState.LISTENING) try { ctx.rec.stop(); } catch(_){}
    }, SPEECH_SILENCE_TIMEOUT);
  };

  rec.onspeechend = () => {};

  rec.onend = async () => {
    micBtn?.classList.remove("listening");
    if (ctx._silenceTimer) { clearTimeout(ctx._silenceTimer); ctx._silenceTimer = null; }
    const transcript = (ctx.finalTranscript || ctx.interimTranscript || "").trim();
    if (!transcript) {
      if (ctx.state === MicState.LISTENING || ctx.state === MicState.STOPPED) {
        ctx.state = MicState.IDLE;
        setMicStatus("No speech detected. Tap to try again.");
      }
      ctx.rec = null;
      return;
    }
    if (transcript === ctx.last) {
      ctx.state = MicState.IDLE;
      ctx.rec   = null;
      setMicStatus("Tap to speak again");
      return;
    }
    ctx.last  = transcript;
    ctx.state = MicState.STOPPED;
    ctx.rec   = null;
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
  };

  rec.onerror = (e) => {
    ctx.state = MicState.IDLE;
    ctx.rec   = null;
    micBtn?.classList.remove("listening");
    if (ctx._silenceTimer) { clearTimeout(ctx._silenceTimer); ctx._silenceTimer = null; }
    if (e.error === "no-speech") {
      setMicStatus("No speech detected. Tap to try again.");
    } else if (e.error === "not-allowed") {
      // FIX 0: Show guide instead of silent failure
      _permissionGranted.audio = false;
      setMicStatus("Microphone blocked.");
      _showPermissionDeniedGuide("audio", async () => {
        const ok = await _attemptGetUserMedia("audio");
        if (ok) {
          setMicStatus("Permission granted! Tap to speak.");
        }
      });
    } else if (e.error === "aborted") {
      setMicStatus("Tap to speak");
    } else {
      showToast("Mic error: " + e.error);
      setMicStatus("Tap to speak");
    }
  };

  try {
    rec.start();
  } catch (e) {
    _killMic(ctx);
    micBtn?.classList.remove("listening");
    setMicStatus("Tap to speak");
    showToast("Cannot start mic. Allow microphone access.");
    console.warn("[Vaani] rec.start:", e.message);
  }
}

// ══════════════════════════════════════════════════════════════════
// CONVERSATION MODE (FIX 8 + FIX 10)
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
  const speechCode = LANG_CONFIG[fromLang]?.speechCode || "en-US";
  const micBtn     = document.getElementById(micBtnId);

  if (ctx.state === MicState.LISTENING) {
    if (ctx.rec) try { ctx.rec.stop(); } catch(_){}
    ctx.state = MicState.STOPPED;
    micBtn?.classList.remove("listening");
    setMicStatus("Processing…", statId);
    return;
  }

  _killMic(_mic[otherSpk]);
  document.getElementById(`micBtn${otherSpk}`)?.classList.remove("listening");
  setMicStatus("Tap to speak", `micStatus${otherSpk}`);
  _killMic(ctx);

  if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
    showToast("Voice not supported. Use Chrome."); return;
  }

  // FIX 0: unified permission
  setMicStatus("Requesting microphone…", statId);
  const permitted = await handlePermission("audio", statId);
  if (!permitted) {
    setMicStatus("Tap to speak", statId);
    return;
  }

  const SR  = window.SpeechRecognition || window.webkitSpeechRecognition;
  const rec = new SR();
  rec.lang            = speechCode;
  rec.continuous      = true;
  rec.interimResults  = true;
  rec.maxAlternatives = 3;
  ctx.rec              = rec;
  ctx.state            = MicState.LISTENING;
  ctx.finalTranscript  = "";
  ctx.interimTranscript = "";
  micBtn?.classList.add("listening");
  setMicStatus("Listening… (tap again to stop)", statId);

  const origEl  = document.getElementById(`originalText${speaker}`);
  const transEl = document.getElementById(`translatedText${speaker}`);
  const playBtn = document.getElementById(`playBtn${speaker}`);

  rec.onresult = (e) => {
    if (ctx._silenceTimer) clearTimeout(ctx._silenceTimer);
    let interimText = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const result = e.results[i];
      if (result.isFinal) ctx.finalTranscript += result[0].transcript;
      else interimText += result[0].transcript;
    }
    ctx.interimTranscript = interimText;
    const combined = (ctx.finalTranscript + " " + ctx.interimTranscript).trim();
    if (origEl && combined) origEl.textContent = combined;
    ctx._silenceTimer = setTimeout(() => {
      if (ctx.rec && ctx.state === MicState.LISTENING) try { ctx.rec.stop(); } catch(_){}
    }, SPEECH_SILENCE_TIMEOUT);
  };

  rec.onend = async () => {
    micBtn?.classList.remove("listening");
    if (ctx._silenceTimer) { clearTimeout(ctx._silenceTimer); ctx._silenceTimer = null; }
    const transcript = (ctx.finalTranscript || ctx.interimTranscript || "").trim();
    if (!transcript) { ctx.state = MicState.IDLE; ctx.rec = null; setMicStatus("Tap to speak", statId); return; }
    if (transcript === ctx.last) { ctx.state = MicState.IDLE; ctx.rec = null; setMicStatus("Tap to speak again", statId); return; }
    ctx.last  = transcript;
    ctx.state = MicState.STOPPED;
    ctx.rec   = null;
    setMicStatus("Translating…", statId);
    if (transEl) transEl.textContent = "…";
    _convLastTranscript[speaker] = transcript;
    _convLastFromLang[speaker]   = fromLang;
    _convLastToLang[speaker]     = toLang;
    const translated = await translateText(transcript, fromLang, toLang);
    if (transEl) transEl.textContent = translated || "—";
    if (playBtn) playBtn.style.display = translated ? "flex" : "none";
    setMicStatus("Tap to speak again", statId);
    if (translated) await autoPlay(translated, toLang, "", transEl);
  };

  rec.onerror = (e) => {
    ctx.state = MicState.IDLE;
    ctx.rec   = null;
    micBtn?.classList.remove("listening");
    if (ctx._silenceTimer) { clearTimeout(ctx._silenceTimer); ctx._silenceTimer = null; }
    setMicStatus("Tap to speak", statId);
    if (e.error === "not-allowed") {
      // FIX 0: guide instead of silent failure
      _permissionGranted.audio = false;
      _showPermissionDeniedGuide("audio", async () => {
        const ok = await _attemptGetUserMedia("audio");
        if (ok) setMicStatus("Permission granted! Tap to speak.", statId);
      });
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

// FIX 10: Reactive re-translation on conv language change
async function onConvLangChange(speaker) {
  const selectId = `convLang${speaker}`;
  const newLang  = document.getElementById(selectId)?.value || "en";
  localStorage.setItem(`vaani_lang_${selectId}`, newLang);

  // The OPPOSITE speaker produced the content to re-translate
  const sourceSpeak = speaker === "B" ? "A" : "B";
  const transcript  = _convLastTranscript[sourceSpeak];
  const origFrom    = _convLastFromLang[sourceSpeak];

  if (!transcript || !origFrom) return;
  if (_convLastToLang[sourceSpeak] === newLang) return;

  if (sourceSpeak === "A" && _convTranslatingA) return;
  if (sourceSpeak === "B" && _convTranslatingB) return;

  if (sourceSpeak === "A") _convTranslatingA = true;
  else                     _convTranslatingB = true;

  const transEl = document.getElementById(`translatedText${sourceSpeak}`);
  const playBtn = document.getElementById(`playBtn${sourceSpeak}`);
  if (transEl) transEl.textContent = "…";

  try {
    const translated = await translateText(transcript, origFrom, newLang);
    if (transEl) transEl.textContent = translated || "—";
    if (playBtn) playBtn.style.display = translated ? "flex" : "none";
    _convLastToLang[sourceSpeak] = newLang;
    if (translated) await autoPlay(translated, newLang, "", transEl);
  } finally {
    if (sourceSpeak === "A") _convTranslatingA = false;
    else                     _convTranslatingB = false;
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

// ── INPUT MODE TOGGLE ─────────────────────────────────────────────

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
  const t  = document.getElementById("translatedText")?.textContent;
  const l  = document.getElementById("toLang")?.value;
  const el = document.getElementById("translatedText");
  if (t && t !== "—" && t !== "…") await autoPlay(t, l, "", el);
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
async function playImgAudio() {
  if (_curAudio) { toggleAudio(); return; }
  const t  = document.getElementById("imgTranslatedText")?.textContent;
  const l  = document.getElementById("imgToLang")?.value;
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
  const el = document.getElementById(id);
  const t = el?.tagName === "TEXTAREA" ? el.value : el?.textContent;
  if (t && t !== "—") navigator.clipboard.writeText(t).then(() => showToast("Copied!")).catch(() => {});
}

// ── LANGUAGE SELECT HELPERS ───────────────────────────────────────

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
  const defaults = {
    fromLang:"te", toLang:"ta",
    travelFromLang:"te", travelToLang:"hi",
    imgFromLang:"te", imgToLang:"en",
    convLangA:"te", convLangB:"ta"
  };
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
  document.getElementById("convLangA")?.addEventListener("change", () => onConvLangChange("A"));
  document.getElementById("convLangB")?.addEventListener("change", () => onConvLangChange("B"));
  ["travelFromLang","travelToLang","imgFromLang","imgToLang"].forEach(id => {
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

function _getTravelCustom() {
  try { return JSON.parse(localStorage.getItem("vaani_travel_custom") || "{}"); } catch(_){ return {}; }
}
function _saveTravelCustom(data) {
  localStorage.setItem("vaani_travel_custom", JSON.stringify(data));
}
function _getTravelCategories() {
  const custom = _getTravelCustom();
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
  return LABELS[cat] || cat.charAt(0).toUpperCase() + cat.slice(1);
}

function _renderCatTabs() {
  const tabs = document.getElementById("catTabs");
  if (!tabs) return;
  const cats = _getTravelCategories();
  tabs.innerHTML = cats.map(cat => `
    <button class="cat-btn${_cat === cat ? " active" : ""}" onclick="selectCategory('${cat}',this)">
      ${_getTravelCatLabel(cat)}
    </button>`).join("") + `
    <button class="cat-btn cat-btn-add" onclick="addTravelCategory()" title="Add category">+</button>`;
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

  const isBuiltin = (phrase) => (TRAVEL_PHRASES_DEFAULT[_cat] || []).some(p => p.en === phrase.en);

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
    playBtn.addEventListener("click", function() { autoPlay(this.dataset.text, this.dataset.lang); });

    const copyBtn = document.createElement("button");
    copyBtn.className = "phrase-btn phrase-copy";
    copyBtn.textContent = "Copy";
    copyBtn.dataset.text = toText;
    copyBtn.addEventListener("click", function() {
      navigator.clipboard.writeText(this.dataset.text).then(() => showToast("Copied!")).catch(() => {});
    });

    btnsDiv.appendChild(playBtn);
    btnsDiv.appendChild(copyBtn);

    if (isCustomPhrase) {
      const delBtn = document.createElement("button");
      delBtn.className = "phrase-btn phrase-del";
      delBtn.textContent = "✕";
      delBtn.title = "Delete phrase";
      const phraseEn = phrase.en;
      delBtn.addEventListener("click", () => deleteTravelPhrase(_cat, phraseEn));
      btnsDiv.appendChild(delBtn);
    }

    card.appendChild(textsDiv);
    card.appendChild(btnsDiv);
    list.appendChild(card);
  }

  const addRow = document.createElement("div");
  addRow.className = "phrase-add-row";
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
// OCR
// ══════════════════════════════════════════════════════════════════

function _fixBullets(text) {
  if (!text) return text;
  return text.split(/\r?\n/).map(line => {
    let l = line;
    l = l.replace(/^([e|o·•●■▪◦‣⁃➢➤►▶→]\s+)/, () => "• ");
    l = l.replace(/^([\-\*]\s+)/, "• ");
    l = l.replace(/^(e\s+e\s+)/, "• ");
    return l;
  }).join("\n");
}

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
    if (!resp || resp.error) { console.warn("[Vision] API error:", resp?.error); return null; }
    const fullAnnotation = resp.fullTextAnnotation;
    if (fullAnnotation) {
      const reconstructed = _reconstructVisionText(fullAnnotation);
      if (reconstructed && reconstructed.length > 2) return _fixBullets(reconstructed);
    }
    const simple = resp.textAnnotations?.[0]?.description;
    if (simple && simple.trim().length > 2) return _fixBullets(simple.trim());
    return null;
  } catch (e) {
    console.warn("[Vision OCR]", e.message);
    return null;
  }
}

function _reconstructVisionText(fullAnnotation) {
  const pages = fullAnnotation.pages;
  if (!pages || pages.length === 0) return (fullAnnotation.text || "").trim();
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
            if (breakType === "LINE_BREAK" || breakType === "EOL_SURE_SPACE") wordText += "\n";
            else if (breakType === "HYPHEN") wordText += "-";
            else if (breakType === "SPACE" || breakType === "SURE_SPACE") wordText += " ";
          }
          paraText += wordText;
        }
        paraText = paraText.replace(/ +\n/g, "\n").replace(/\n +/g, "\n").replace(/ {2,}/g, " ").trim();
        if (paraText) paraTexts.push(paraText);
      }
      if (paraTexts.length > 0) blockTexts.push(paraTexts.join("\n"));
    }
  }
  return blockTexts.length > 0 ? blockTexts.join("\n\n").trim() : (fullAnnotation.text || "").trim();
}

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

function _optimizeImageForOCR(file) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 1400;
      let { width: w, height: h } = img;
      if (w > MAX || h > MAX) { const scale = MAX / Math.max(w, h); w = Math.round(w * scale); h = Math.round(h * scale); }
      else if (w < 800) { const scale = 800 / w; w = Math.round(w * scale); h = Math.round(h * scale); }
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
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

function _preprocessImage(file) { return _optimizeImageForOCR(file); }

async function _runOCR(blob, langCode) {
  const Tesseract = await _loadTesseract();
  const tessLang  = TESS_LANG_MAP[langCode] || "eng";
  const langStr   = tessLang === "eng" ? "eng" : `${tessLang}+eng`;
  const statusEl  = document.getElementById("imgStatus");
  const worker = await Tesseract.createWorker(langStr, 1, {
    logger: m => {
      if (m.status === "recognizing text" && statusEl) {
        statusEl.textContent = `Recognizing text… ${Math.round((m.progress || 0) * 100)}%`;
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

function _cleanOcrText(raw) {
  if (!raw) return "";
  let lines = raw.split(/\r?\n/);
  lines = lines.map(line => {
    line = line
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, " ")
      .replace(/[|]{2,}/g, " ").replace(/_{3,}/g, " ").replace(/={3,}/g, " ")
      .replace(/-{3,}/g, " ").replace(/\.{4,}/g, "… ").replace(/[~^`#*\\]{2,}/g, " ");
    return line.split(/\s+/).filter(tok => {
      if (!tok) return false;
      if (/[\p{L}\p{N}]/u.test(tok)) return true;
      if (/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{FE00}-\u{FEFF}]/u.test(tok)) return true;
      return false;
    }).join(" ").trim();
  });
  const seen = new Set();
  lines = lines.filter(line => {
    const norm = line.trim();
    if (!norm || seen.has(norm)) return false;
    seen.add(norm);
    return true;
  });
  return _fixBullets(
    lines.join("\n").replace(/\n{3,}/g, "\n\n").replace(/ {2,}/g, " ").replace(/ ([.,!?:;])/g, "$1").trim()
  );
}

// ── IMAGE EDITING ─────────────────────────────────────────────────

let _imgCurrentFile  = null;
let _imgCroppedBlob  = null;
let _cropperInstance = null;
let _cropRotation    = 0;

function openImagePreview(src) {
  document.getElementById("vaaniImgModal")?.remove();
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
  const close = () => { modal.classList.remove("vim-open"); setTimeout(() => modal.remove(), 300); };
  modal.querySelector(".vim-backdrop").addEventListener("click", close);
  modal.querySelector(".vim-close").addEventListener("click", close);
  const onKey = (e) => { if (e.key === "Escape") { close(); document.removeEventListener("keydown", onKey); } };
  document.addEventListener("keydown", onKey);
}

async function _openCropModal(file, onConfirm) {
  document.getElementById("vaaniCropModal")?.remove();
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
        <button class="vcm-rot-btn" id="vcmRotLeft">
          <svg viewBox="0 0 24 24" width="16" height="16"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.43"/></svg>Rotate Left
        </button>
        <span class="vcm-rot-label" id="vcmRotLabel">0°</span>
        <button class="vcm-rot-btn" id="vcmRotRight">
          <svg viewBox="0 0 24 24" width="16" height="16"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.49-3.43"/></svg>Rotate Right
        </button>
      </div>
      <div class="vcm-body"><img id="vcmCropImg" src="${objectUrl}" alt="Crop" style="max-width:100%"></div>
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
      viewMode: 1, autoCropArea: 0.9, responsive: true, background: false,
      movable: true, zoomable: true, rotatable: true, scalable: true,
      aspectRatio: NaN, cropBoxResizable: true, cropBoxMovable: true, toggleDragModeOnDblclick: true,
    });
  };
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
    canvas.toBlob(blob => { close(); if (blob) onConfirm(blob); }, "image/png");
  });
}

function _openChangeModal() {
  document.getElementById("vaaniChangeModal")?.remove();
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
  const close = () => { modal.classList.remove("vchm-open"); setTimeout(() => modal.remove(), 300); };
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

let _cameraStream = null;
let _cameraModal  = null;

async function _captureBackCamera() {
  if (_cameraModal) { _cameraModal.remove(); _cameraModal = null; }
  _stopCameraStream();

  // FIX 0: Check camera permission first
  const permitted = await handlePermission("video");
  if (!permitted) return;

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
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { exact: "environment" } } });
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
        close();
        _showPermissionDeniedGuide("video", async () => {
          const ok = await _attemptGetUserMedia("video");
          if (ok) showToast("Camera enabled! Tap Take Photo again.");
        });
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
    canvas.toBlob(blob => { close(); if (blob) processImageFile(blob); }, "image/jpeg", 0.95);
  });
}

function _stopCameraStream() {
  if (_cameraStream) { _cameraStream.getTracks().forEach(t => t.stop()); _cameraStream = null; }
}

function _showPreviewBox(objectUrl) {
  const pb = document.getElementById("imgPreviewBox");
  const p  = document.getElementById("imgPreview");
  const b  = document.getElementById("imgTranslateBtn");
  const up = document.getElementById("uploadArea");
  if (p) { p.src = objectUrl; p.style.cursor = "zoom-in"; p.onclick = () => openImagePreview(p.src); }
  if (pb) pb.style.display = "block";
  if (b)  b.style.display  = "flex";
  if (up) up.style.display = "none";
}

async function processImageFile(file) {
  if (!file || !(file instanceof Blob)) { showToast("Please upload an image file"); return; }
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

function _resetEditableExtracted() {
  const ta = document.getElementById("imgExtractedTextEdit");
  if (ta) ta.value = "";
  const confirmBtn = document.getElementById("imgConfirmTranslateBtn");
  if (confirmBtn) confirmBtn.style.display = "none";
}

function _showEditableExtracted(text) {
  const ta = document.getElementById("imgExtractedTextEdit");
  const confirmBtn = document.getElementById("imgConfirmTranslateBtn");
  if (ta) { ta.value = text; ta.style.display = "block"; }
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
      const translatedParas = await Promise.all(paragraphs.map(async (para) => {
        if (!para.trim()) return "";
        const lines = para.split("\n");
        const translatedLines = await Promise.all(lines.map(async (line) => {
          const l = line.trim();
          if (!l) return "";
          try { return await translateText(l, fromLang, toLang); } catch (_) { return l; }
        }));
        return translatedLines.join("\n");
      }));
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
  if (translated && translated !== extractedText) await autoPlay(translated, toLang, "Img", transEl);
}

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
    const optimizedBlobPromise = _optimizeImageForOCR(sourceBlob);
    if (status) status.textContent = "Running OCR…";
    let extractedText = "", ocrEngine = "unknown";
    const visionPromise = _googleVisionOCR(sourceBlob, fromLang);
    const [visionResult, optimizedBlob] = await Promise.all([visionPromise, optimizedBlobPromise]);
    if (visionResult && visionResult.length > 2) {
      extractedText = visionResult;
      ocrEngine = "Google Vision";
    } else {
      if (status) status.textContent = "Running server OCR…";
      const backendPromise = (async () => {
        try {
          const fd = new FormData();
          fd.append("file", optimizedBlob || sourceBlob, "image.png");
          fd.append("from_lang", fromLang);
          fd.append("to_lang", toLang);
          const resp = await fetch(`${API_URL}/image-translate`, { method:"POST", body:fd, signal:AbortSignal.timeout(40000) });
          if (resp.ok) return await resp.json();
        } catch(fbErr) { console.warn("[Image] Backend error:", fbErr); }
        return null;
      })();
      const backendResult = await backendPromise;
      if (backendResult?.extracted && backendResult.extracted.length > 2) {
        if (backendResult.translated?.trim()) {
          _showEditableExtracted(backendResult.extracted);
          document.getElementById("imgResults").style.display = "block";
          const transEl = document.getElementById("imgTranslatedText");
          if (transEl) transEl.textContent = backendResult.translated.trim();
          if (status) status.textContent = `OCR: ${backendResult.engine || "server"} ✓`;
          showTimeline("Img");
          autoPlay(backendResult.translated.trim(), toLang, "Img", transEl);
          return;
        }
        extractedText = backendResult.extracted;
        ocrEngine = backendResult.engine || "server";
      }
      if (!extractedText) {
        if (status) status.textContent = "Loading Tesseract OCR…";
        try {
          const rawOcr = await _runOCR(optimizedBlob || sourceBlob, fromLang);
          extractedText = _cleanOcrText(rawOcr);
          ocrEngine = "Tesseract";
        } catch (ocrErr) { console.warn("[Image] Tesseract error:", ocrErr); }
      }
    }
    if (!extractedText || extractedText.length < 2) {
      _showEditableExtracted("");
      document.getElementById("imgTranslatedText").textContent = "No text detected in this image.";
      document.getElementById("imgResults").style.display = "block";
      if (status) status.textContent = "";
      return;
    }
    _showEditableExtracted(extractedText);
    if (status) status.textContent = `OCR: ${ocrEngine} ✓ — Translating…`;
    let translated = "";
    if (fromLang === toLang) {
      translated = extractedText;
    } else {
      const paragraphs = extractedText.split(/\n\n+/);
      const translatedParas = await Promise.all(paragraphs.map(async (para) => {
        if (!para.trim()) return "";
        const lines = para.split("\n");
        const translatedLines = await Promise.all(lines.map(async (line) => {
          const l = line.trim();
          if (!l) return "";
          try { return await translateText(l, fromLang, toLang); } catch (_) { return l; }
        }));
        return translatedLines.join("\n");
      }));
      translated = translatedParas.join("\n\n").trim();
    }
    const transEl = document.getElementById("imgTranslatedText");
    if (transEl) transEl.textContent = translated || "—";
    document.getElementById("imgResults").style.display = "block";
    if (status) status.textContent = `OCR: ${ocrEngine} ✓`;
    showTimeline("Img");
    if (translated && translated !== extractedText) autoPlay(translated, toLang, "Img", transEl);
  } catch (e) {
    console.error("[Vaani] translateImage:", e);
    if (status) status.textContent = "Error: " + e.message;
    showToast("Image processing failed");
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ══════════════════════════════════════════════════════════════════
// HISTORY (FIX 3 & 5)
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
  h.splice(i, 1);
  _writeHistory(h);
  renderHistory();
}

// ══════════════════════════════════════════════════════════════════
// FAVOURITES (FIX 3 & 5)
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

function saveSingleToFavourites() {
  const o  = document.getElementById("originalText")?.textContent;
  const t  = document.getElementById("translatedText")?.textContent;
  const f  = document.getElementById("fromLang")?.value;
  const tl = document.getElementById("toLang")?.value;
  if (!t || t === "—" || t === "…") return;
  saveFavourite(o, t, f, tl);
}

function saveFavourite(orig, trans, fromLang, toLang) {
  const favs = _readFavs();
  if (favs.some(f => f.original === orig && f.toLang === toLang)) { showToast("Already saved!"); return; }
  favs.unshift({ original: orig, translated: trans, fromLang, toLang, ts: Date.now() });
  _writeFavs(favs);
  showToast("Saved to favourites");
  const favsPage = document.getElementById("pageFavourites");
  if (favsPage && favsPage.classList.contains("active")) renderFavourites();
}

function deleteFavourite(i) {
  const favs = _readFavs();
  if (i < 0 || i >= favs.length) return;
  favs.splice(i, 1);
  _writeFavs(favs);
  renderFavourites();
}

// ── RENDER HISTORY ────────────────────────────────────────────────

function renderHistory() {
  const list = document.getElementById("historyList");
  if (!list) return;
  const isLoggedIn = !!(window._vaaniCurrentUser);
  if (!isLoggedIn) {
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
  list.innerHTML = hist.map((h, i) => `
    <div class="hist-card">
      <div class="hist-langs">${LANG_NAMES[h.fromLang]||h.fromLang} → ${LANG_NAMES[h.toLang]||h.toLang}</div>
      <div class="hist-orig">${_escHtml(h.original)}</div>
      <div class="hist-trans">${_escHtml(h.translated)}</div>
      <div class="hist-actions">
        <button class="hist-btn" onclick="autoPlay(${JSON.stringify(h.translated)},${JSON.stringify(h.toLang)})">Play</button>
        <button class="hist-btn" onclick="navigator.clipboard.writeText(${JSON.stringify(h.translated)}).then(()=>showToast('Copied!'))">Copy</button>
        <button class="hist-btn" onclick="saveFavourite(${JSON.stringify(h.original)},${JSON.stringify(h.translated)},${JSON.stringify(h.fromLang)},${JSON.stringify(h.toLang)})">Save</button>
        <button class="hist-btn del" onclick="deleteHistory(${i})">Delete</button>
      </div>
    </div>`).join("");
}

function renderFavourites() {
  const favs = _readFavs();
  const list = document.getElementById("favouritesList");
  if (!list) return;
  if (!favs.length) {
    list.innerHTML = `<div class="empty-state"><div class="es-icon"><svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></div><p class="es-title">No favourites yet</p><p class="es-sub">Tap the star after translating</p></div>`;
    return;
  }
  list.innerHTML = favs.map((f, i) => `
    <div class="hist-card fav-card">
      <div class="hist-langs">${LANG_NAMES[f.fromLang]||f.fromLang} → ${LANG_NAMES[f.toLang]||f.toLang}</div>
      <div class="hist-orig">${_escHtml(f.original)}</div>
      <div class="hist-trans">${_escHtml(f.translated)}</div>
      <div class="hist-actions">
        <button class="hist-btn" onclick="autoPlay(${JSON.stringify(f.translated)},${JSON.stringify(f.toLang)})">Play</button>
        <button class="hist-btn" onclick="navigator.clipboard.writeText(${JSON.stringify(f.translated)}).then(()=>showToast('Copied!'))">Copy</button>
        <button class="hist-btn del" onclick="deleteFavourite(${i})">Remove</button>
      </div>
    </div>`).join("");
}

// ══════════════════════════════════════════════════════════════════
// AUTH SESSION (FIX 4)
// ══════════════════════════════════════════════════════════════════

const SESSION_KEY = "vaani_user_session";

function _persistUserSession(user) {
  if (user) {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        uid: user.uid, displayName: user.displayName || "",
        email: user.email || "", photoURL: user.photoURL || "", ts: Date.now()
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
      localStorage.removeItem(SESSION_KEY);
      return null;
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
  if (avatar) avatar.src           = user.photoURL || "";
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
      <div class="stg-row">
        <label class="stg-label">Default Source Language</label>
        <select class="stg-select" onchange="stgSaveLang('fromLang',this.value)">${buildLangOptions(fromPref)}</select>
      </div>
      <div class="stg-row">
        <label class="stg-label">Default Target Language</label>
        <select class="stg-select" onchange="stgSaveLang('toLang',this.value)">${buildLangOptions(toPref)}</select>
      </div>
      ${dialectInfo}
    </div>
    <div class="stg-section">
      <div class="stg-title">Appearance</div>
      <div class="stg-row">
        <label class="stg-label">Theme</label>
        <div class="stg-radios">
          <label class="stg-radio-lbl"><input type="radio" name="stgTheme" value="dark" ${theme === "dark" ? "checked" : ""} onchange="applyTheme('dark')"><span>Dark</span></label>
          <label class="stg-radio-lbl"><input type="radio" name="stgTheme" value="light" ${theme === "light" ? "checked" : ""} onchange="applyTheme('light')"><span>Light</span></label>
        </div>
      </div>
    </div>
    <div class="stg-section">
      <div class="stg-title">Permissions</div>
      <div class="stg-row" style="flex-direction:column;align-items:flex-start;gap:10px">
        <span class="stg-label">Microphone &amp; Camera</span>
        <span style="font-size:12px;color:var(--text3);line-height:1.5">If permissions are blocked, tap below to see how to re-enable them in your browser settings.</span>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="stg-btn stg-warn" style="padding:8px 16px;font-size:13px" onclick="_showPermissionDeniedGuide('audio',()=>handlePermission('audio'))">🎤 Fix Microphone</button>
          <button class="stg-btn stg-warn" style="padding:8px 16px;font-size:13px" onclick="_showPermissionDeniedGuide('video',()=>handlePermission('video'))">📷 Fix Camera</button>
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
        <div>Vaani — Indian Language Translator v5.3</div>
        <div>OCR: Google Vision API + Tesseract fallback</div>
        <div>Translation: Bhashini NMT + Google Translate fallback</div>
        <div>Speech: Bhashini TTS + gTTS + Browser TTS fallback</div>
        <div>Camera: getUserMedia back-camera capture</div>
        <div>Permissions: Smart detection + guided recovery</div>
        <div>30+ Indian languages supported</div>
      </div>
    </div>`;
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

// ══════════════════════════════════════════════════════════════════
// NAVIGATION (FIX 6)
// ══════════════════════════════════════════════════════════════════

const PAGES = ["Home","Single","Conversation","Travel","Image","History","Favourites","Settings"];
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
  _onPageActivate(page);
  Object.values(_mic).forEach(ctx => { _killMic(ctx); });
  ["micBtn","micBtnA","micBtnB"].forEach(id => document.getElementById(id)?.classList.remove("listening"));
}

function _onPageActivate(page) {
  if (page === "Travel")     { _renderCatTabs(); loadTravelPhrases(); }
  if (page === "History")    renderHistory();
  if (page === "Favourites") renderFavourites();
  if (page === "Settings")   renderSettingsPage();
}

window.addEventListener("popstate", (e) => {
  const page = e.state?.page || "Home";
  PAGES.forEach(p => {
    document.getElementById(`page${p}`)?.classList.toggle("active", p === page);
    document.getElementById(`menu${p}`)?.classList.toggle("active", p === page);
  });
  closeMenu();
  _onPageActivate(page);
  Object.values(_mic).forEach(ctx => { _killMic(ctx); });
  ["micBtn","micBtnA","micBtnB"].forEach(id => document.getElementById(id)?.classList.remove("listening"));
});

function toggleMenu() {
  document.getElementById("sideMenu")?.classList.toggle("open");
  document.getElementById("menuOverlay")?.classList.toggle("open");
}
function closeMenu() {
  document.getElementById("sideMenu")?.classList.remove("open");
  document.getElementById("menuOverlay")?.classList.remove("open");
}
function toggleTheme() {
  applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
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
    .then(r => r.json())
    .then(d => console.log("[Vaani] ping:", d.status))
    .catch(() => {});
}
pingBackend();
setInterval(pingBackend, 10 * 60 * 1000);

// ── FIREBASE / AUTH STUBS ─────────────────────────────────────────
if (typeof window.signInWithGoogle === "undefined") {
  window.signInWithGoogle = () => showToast("Sign-in coming soon");
}
if (typeof window.signOutUser === "undefined") {
  window.signOutUser = () => {
    window._vaaniCurrentUser = null;
    _persistUserSession(null);
    _applyUserToUI(null);
    showToast("Signed out");
    const histPage = document.getElementById("pageHistory");
    if (histPage && histPage.classList.contains("active")) renderHistory();
  };
}
window._vaaniCurrentUser = null;

window._vaaniOnAuthChange = function(user) {
  window._vaaniCurrentUser = user || null;
  _persistUserSession(user);
  _applyUserToUI(user);
  const histPage = document.getElementById("pageHistory");
  if (histPage && histPage.classList.contains("active")) renderHistory();
};

// ── INIT ──────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  applyTheme(localStorage.getItem("vaani_theme") || "dark");

  const restoredSession = _restoreUserSession();
  if (restoredSession) {
    window._vaaniCurrentUser = restoredSession;
    _applyUserToUI(restoredSession);
  }

  initLanguageSelects();

  _initTimelineControls("");
  _initTimelineControls("Img");

  if (window.speechSynthesis) _loadVoices().catch(() => {});

  const changeBtn = document.getElementById("imgChangeBtn");
  if (changeBtn) changeBtn.addEventListener("click", (e) => { e.stopPropagation(); _openChangeModal(); });

  const camSrcBtn = document.getElementById("cameraSrcBtn");
  if (camSrcBtn) camSrcBtn.addEventListener("click", async (e) => { e.preventDefault(); await _captureBackCamera(); });

  const cameraInput = document.getElementById("cameraInput");
  if (cameraInput) {
    cameraInput.setAttribute("capture", "environment");
    cameraInput.addEventListener("change", handleImageUpload);
  }

  const hash = location.hash.replace("#", "").toLowerCase();
  const initialPage = PAGES.find(p => p.toLowerCase() === hash) || "Home";
  history.replaceState({ page: initialPage }, "", `#${initialPage.toLowerCase()}`);
  _navStack.push(initialPage);
  PAGES.forEach(p => {
    document.getElementById(`page${p}`)?.classList.toggle("active", p === initialPage);
    document.getElementById(`menu${p}`)?.classList.toggle("active", p === initialPage);
  });
  _onPageActivate(initialPage);
  renderHistory();
  renderFavourites();
  detectUserLocation();

  // FIX 0: Proactively detect permission state on load (silent — no popup)
  // This populates _permissionGranted cache without showing any UI
  if (navigator.permissions) {
    navigator.permissions.query({ name: "microphone" }).then(r => {
      if (r.state === "granted") _permissionGranted.audio = true;
    }).catch(() => {});
    navigator.permissions.query({ name: "camera" }).then(r => {
      if (r.state === "granted") _permissionGranted.video = true;
    }).catch(() => {});
  }
});
