const API_URL = "https://vaani-app-ui0z.onrender.com";

let lastSpokenText = "", lastFromLang = "";
let currentConvSpeaker = null, currentCategory = "food";
let travelPhrasesCache = {}, isDarkMode = true;

// ── GLOBAL AUDIO PLAYER ───────────────────────────────
let currentAudio = null;
let currentAudioBlob = null;
let currentPlayBtn = null;
let currentTimelineId = null;
let audioBlobA = null, audioBlobB = null;
let imgAudioBlob = null;

function stopAllAudio() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  document.querySelectorAll('.ac-btn.ac-primary').forEach(btn => {
    if (btn.dataset.playing === 'true') {
      btn.dataset.playing = 'false';
      btn.innerHTML = `<svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>Play`;
    }
  });
  // Remove timelines but restore original text in all translated text elements
  document.querySelectorAll('.audio-timeline-wrap').forEach(el => el.remove());
  // Restore any wrapped word spans back to plain text
  document.querySelectorAll('.rc-text.rc-accent').forEach(el => {
    if (el.dataset.originalText) {
      el.textContent = el.dataset.originalText;
      delete el.dataset.originalText;
    }
  });
}

// Wrap translated text element's words into clickable spans for karaoke
function wrapTextIntoWords(textEl, containerId) {
  const text = textEl.dataset.originalText || textEl.textContent;
  textEl.dataset.originalText = text;
  const words = text.trim().split(/\s+/);
  textEl.innerHTML = words.map((w, i) =>
    `<span class="audio-word" data-idx="${i}" onclick="seekToWord(${i}, ${words.length}, '${containerId}')">${w}</span>`
  ).join(' ');
  return words;
}

function createAudioPlayer(blob, btnEl, translatedText, containerId, textElId) {
  stopAllAudio();
  if (!blob) return;

  const audio = new Audio(URL.createObjectURL(blob));
  currentAudio = audio;
  currentAudioBlob = blob;
  currentPlayBtn = btnEl;
  currentTimelineId = containerId;

  btnEl.dataset.playing = 'true';
  btnEl.innerHTML = `<svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>Pause`;

  // Wrap the translated text into clickable words
  const textEl = document.getElementById(textElId);
  const words = textEl ? wrapTextIntoWords(textEl, containerId) : translatedText.trim().split(/\s+/);

  // Build timeline (just scrubber + time, NO word list below)
  let timelineWrap = document.getElementById('timeline_' + containerId);
  if (!timelineWrap) {
    timelineWrap = document.createElement('div');
    timelineWrap.id = 'timeline_' + containerId;
    timelineWrap.className = 'audio-timeline-wrap';
    timelineWrap.innerHTML = `
      <div class="audio-timeline-bar">
        <div class="audio-progress" id="progress_${containerId}"></div>
        <input type="range" class="audio-scrubber" id="scrubber_${containerId}" min="0" max="100" value="0" step="0.1">
      </div>
      <div class="audio-time-row">
        <span class="audio-time" id="curTime_${containerId}">0:00</span>
        <span class="audio-time" id="durTime_${containerId}">0:00</span>
      </div>
    `;
    btnEl.closest('.result-card, .result-translated').appendChild(timelineWrap);
  }

  const scrubber = document.getElementById('scrubber_' + containerId);
  if (scrubber) {
    scrubber.addEventListener('input', () => {
      if (audio.duration) audio.currentTime = (scrubber.value / 100) * audio.duration;
    });
  }

  audio.addEventListener('timeupdate', () => {
    if (!audio.duration) return;
    const pct = (audio.currentTime / audio.duration) * 100;
    const prog = document.getElementById('progress_' + containerId);
    const scr = document.getElementById('scrubber_' + containerId);
    const cur = document.getElementById('curTime_' + containerId);
    if (prog) prog.style.width = pct + '%';
    if (scr) scr.value = pct;
    if (cur) cur.textContent = formatTime(audio.currentTime);

    // Highlight word directly inside the translated text element
    const wIdx = Math.floor((audio.currentTime / audio.duration) * words.length);
    if (textEl) {
      textEl.querySelectorAll('.audio-word').forEach((w, i) => {
        w.classList.toggle('active-word', i === wIdx);
      });
    }
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

  audio.play();
}

window.seekToWord = function(idx, total, containerId) {
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

// ── TRANSLATION (MyMemory API — free, no key needed) ──────────────────────
const LANG_CODE_MAP = {
  te: "te", ta: "ta", hi: "hi", kn: "kn",
  ml: "ml", mr: "mr", bn: "bn", gu: "gu",
  pa: "pa", ur: "ur", en: "en"
};

async function translateText(text, fromLang, toLang) {
  const MAX_CHUNK = 480;
  const chunks = [];
  const sentences = text.split(/(?<=[।.!?])\s+/);
  let current = "";
  for (const sentence of sentences) {
    if ((current + " " + sentence).trim().length > MAX_CHUNK && current.length > 0) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current = current ? current + " " + sentence : sentence;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  const src = LANG_CODE_MAP[fromLang] || fromLang;
  const tgt = LANG_CODE_MAP[toLang] || toLang;
  const langPair = `${src}|${tgt}`;

  const translatedChunks = [];
  for (const chunk of chunks) {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=${langPair}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.responseStatus === 200) {
      translatedChunks.push(data.responseData.translatedText);
    } else {
      throw new Error("Translation failed: " + (data.responseDetails || data.responseStatus));
    }
  }

  return translatedChunks.join(" ");
}

// ── THEME ──────────────────────────────────────────────
function toggleTheme() {
  isDarkMode = !isDarkMode;
  document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
  const icon = document.getElementById('themeIcon');
  if (isDarkMode) {
    icon.innerHTML = '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
  } else {
    icon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
  }
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
  const text = document.getElementById('textInputArea').value.trim();
  if (!text) return;
  const fromLang = document.getElementById("fromLang").value;
  lastSpokenText = text; lastFromLang = fromLang;
  document.getElementById("originalText").textContent = text;
  document.getElementById("resultsSection").style.display = "block";
  document.getElementById("translatedText").textContent = "Translating...";
  await translateAndSpeak(text, fromLang);
}

// ── COPY ──────────────────────────────────────────────
function copyTranslation() {
  const el = document.getElementById("translatedText");
  const text = el.dataset.originalText || el.textContent;
  if (text && text !== "—" && text !== "Translating...") navigator.clipboard.writeText(text).then(() => showToast("Copied to clipboard"));
}
function copyText(id) {
  const el = document.getElementById(id);
  const text = el.dataset.originalText || el.textContent;
  if (text && text !== "—") navigator.clipboard.writeText(text).then(() => showToast("Copied to clipboard"));
}
function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2200);
}

// ── MENU ──────────────────────────────────────────────
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
}

// ── SPEECH RECOGNITION ───────────────────────────────
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition;
try { recognition = new SpeechRecognition(); recognition.continuous = false; recognition.interimResults = false; } catch(e) {}

document.getElementById("toLang").addEventListener("change", async () => {
  if (lastSpokenText) {
    stopAllAudio();
    document.getElementById("translatedText").textContent = "Translating...";
    await translateAndSpeak(lastSpokenText, lastFromLang);
  }
});
document.getElementById("fromLang").addEventListener("change", async () => {
  if (lastSpokenText) {
    stopAllAudio();
    lastFromLang = document.getElementById("fromLang").value;
    document.getElementById("translatedText").textContent = "Translating...";
    await translateAndSpeak(lastSpokenText, lastFromLang);
  }
});

document.getElementById("imgToLang").addEventListener("change", async () => {
  const extracted = document.getElementById('imgExtractedText').textContent;
  if (extracted && extracted !== "—" && document.getElementById('imgResults').style.display !== 'none') {
    stopAllAudio();
    document.getElementById('imgTranslatedText').textContent = "Translating...";
    const fromLang = document.getElementById('imgFromLang').value;
    const toLang = document.getElementById('imgToLang').value;
    try {
      const translated = await translateText(extracted, fromLang, toLang);
      document.getElementById('imgTranslatedText').textContent = translated;
      window._imgTranslatedText = translated;
      imgAudioBlob = await fetch(`${API_URL}/speak`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: translated, lang: toLang })
      }).then(r => r.blob());
      const playBtn = document.querySelector('#imgActionBtns .ac-btn.ac-primary');
      if (playBtn) {
        const old = document.getElementById('timeline_img');
        if (old) old.remove();
        createAudioPlayer(imgAudioBlob, playBtn, translated, 'img', 'imgTranslatedText');
      }
    } catch { document.getElementById('imgTranslatedText').textContent = "Translation error"; }
  }
});

function startListening() {
  if (!recognition) { showToast("Speech recognition not supported"); return; }
  currentConvSpeaker = null;
  recognition.lang = document.getElementById("fromLang").value;
  document.getElementById("micBtn").classList.add("listening");
  document.getElementById("micStatus").textContent = "Listening...";
  document.getElementById("originalText").textContent = "—";
  document.getElementById("translatedText").textContent = "—";
  document.getElementById("resultsSection").style.display = "none";
  stopAllAudio();
  recognition.start();
}

function startConvListening(person) {
  if (!recognition) return;
  currentConvSpeaker = person;
  recognition.lang = document.getElementById(`convLang${person}`).value;
  document.getElementById(`micBtn${person}`).classList.add("listening");
  document.getElementById(`micStatus${person}`).textContent = "Listening...";
  document.getElementById(`originalText${person}`).textContent = "—";
  document.getElementById(`translatedText${person}`).textContent = "—";
  document.getElementById(`playBtn${person}`).style.display = "none";
  recognition.start();
}

if (recognition) {
  recognition.onresult = async (event) => {
    const spokenText = event.results[0][0].transcript;
    if (currentConvSpeaker) {
      const person = currentConvSpeaker, other = person === 'A' ? 'B' : 'A';
      const fromLang = document.getElementById(`convLang${person}`).value;
      const toLang = document.getElementById(`convLang${other}`).value;
      document.getElementById(`originalText${person}`).textContent = spokenText;
      document.getElementById(`micStatus${person}`).textContent = "Translating...";
      document.getElementById(`micBtn${person}`).classList.remove("listening");
      await translateAndSpeakConv(spokenText, fromLang, toLang, person);
    } else {
      lastSpokenText = spokenText; lastFromLang = document.getElementById("fromLang").value;
      document.getElementById("originalText").textContent = spokenText;
      document.getElementById("micStatus").textContent = "Translating...";
      document.getElementById("micBtn").classList.remove("listening");
      document.getElementById("resultsSection").style.display = "block";
      document.getElementById("translatedText").textContent = "Translating...";
      await translateAndSpeak(spokenText, lastFromLang);
    }
  };
  recognition.onerror = () => {
    if (currentConvSpeaker) {
      document.getElementById(`micStatus${currentConvSpeaker}`).textContent = "Error. Try again.";
      document.getElementById(`micBtn${currentConvSpeaker}`).classList.remove("listening");
    } else {
      document.getElementById("micStatus").textContent = "Error. Try again.";
      document.getElementById("micBtn").classList.remove("listening");
    }
  };
}

// ── TRANSLATE + SPEAK (Single) ───────────────────────
async function translateAndSpeak(text, fromLang) {
  const toLang = document.getElementById("toLang").value;
  try {
    const translated = await translateText(text, fromLang, toLang);
    document.getElementById("translatedText").textContent = translated;
    const blob = await fetch(`${API_URL}/speak`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: translated, lang: toLang })
    }).then(r => r.blob());
    document.getElementById("actionBtns").style.display = "flex";
    window._singleAudioBlob = blob;
    window._singleTranslatedText = translated;
    document.getElementById("micStatus").textContent = "Tap to speak";
    const old = document.getElementById('timeline_single');
    if (old) old.remove();
    const btn = document.getElementById('playBtn');
    createAudioPlayer(blob, btn, translated, 'single', 'translatedText');
    if (window.getCurrentUser && window.getCurrentUser()) saveToHistory(text, translated, fromLang, toLang);
  } catch(err) {
    document.getElementById("translatedText").textContent = "—";
    document.getElementById("micStatus").textContent = "Translation error. Check connection.";
  }
}

function playAudio() {
  const blob = window._singleAudioBlob;
  const text = window._singleTranslatedText || document.getElementById("translatedText").textContent;
  const btn = document.getElementById('playBtn');
  if (!blob) return;
  const old = document.getElementById('timeline_single');
  if (old && currentPlayBtn !== btn) old.remove();
  toggleAudio(blob, btn, text, 'single', 'translatedText');
}

// ── TRANSLATE + SPEAK (Conversation) ─────────────────
async function translateAndSpeakConv(text, fromLang, toLang, person) {
  try {
    const translated = await translateText(text, fromLang, toLang);
    document.getElementById(`translatedText${person}`).textContent = translated;
    const blob = await fetch(`${API_URL}/speak`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: translated, lang: toLang })
    }).then(r => r.blob());
    if (person === 'A') audioBlobA = blob; else audioBlobB = blob;
    window[`_convText${person}`] = translated;
    document.getElementById(`playBtn${person}`).style.display = "flex";
    document.getElementById(`micStatus${person}`).textContent = "Tap to speak";
    const btn = document.getElementById(`playBtn${person}`);
    const old = document.getElementById(`timeline_conv${person}`);
    if (old) old.remove();
    createAudioPlayer(blob, btn, translated, `conv${person}`, `translatedText${person}`);
  } catch {
    document.getElementById(`micStatus${person}`).textContent = "Error. Try again.";
  }
}

function playAudioA() {
  const blob = audioBlobA;
  const text = window._convTextA || document.getElementById("translatedTextA").textContent;
  const btn = document.getElementById('playBtnA');
  if (!blob) return;
  toggleAudio(blob, btn, text, 'convA', 'translatedTextA');
}
function playAudioB() {
  const blob = audioBlobB;
  const text = window._convTextB || document.getElementById("translatedTextB").textContent;
  const btn = document.getElementById('playBtnB');
  if (!blob) return;
  toggleAudio(blob, btn, text, 'convB', 'translatedTextB');
}

// ── SWAP ──────────────────────────────────────────────
function swapLanguages() {
  const f = document.getElementById("fromLang"), t = document.getElementById("toLang");
  [f.value, t.value] = [t.value, f.value];
  lastSpokenText = ""; lastFromLang = ""; stopAllAudio();
  window._singleAudioBlob = null;
  document.getElementById("originalText").textContent = "—";
  document.getElementById("translatedText").textContent = "—";
  document.getElementById("resultsSection").style.display = "none";
  const old = document.getElementById('timeline_single');
  if (old) old.remove();
  showToast("Languages swapped");
}

// ── TRAVEL ────────────────────────────────────────────
const LANG_NAMES = { te:"Telugu", ta:"Tamil", hi:"Hindi", kn:"Kannada", ml:"Malayalam", mr:"Marathi", bn:"Bengali", gu:"Gujarati", pa:"Punjabi", ur:"Urdu", en:"English" };
const PHRASES = {
  food: [{en:"I am hungry"},{en:"Give me a menu please"},{en:"How much does this cost?"},{en:"This is delicious!"},{en:"I am vegetarian"},{en:"Water please"},{en:"The bill please"},{en:"No spicy food please"}],
  transport: [{en:"Where is the bus stop?"},{en:"How much is the ticket?"},{en:"Take me to this address"},{en:"Stop here please"},{en:"Is this the right train?"},{en:"Where is the airport?"},{en:"How far is it?"},{en:"Call a taxi please"}],
  hotel: [{en:"I have a reservation"},{en:"What time is checkout?"},{en:"Can I get extra towels?"},{en:"The AC is not working"},{en:"Is breakfast included?"},{en:"I need a wake up call"},{en:"Where is the lift?"},{en:"Can I extend my stay?"}],
  emergency: [{en:"Help me please!"},{en:"Call the police"},{en:"I need a doctor"},{en:"I am lost"},{en:"Call an ambulance"},{en:"I have been robbed"},{en:"Where is the hospital?"},{en:"I am allergic to this"}],
  shopping: [{en:"How much does this cost?"},{en:"Can you give a discount?"},{en:"Do you have a smaller size?"},{en:"I am just looking"},{en:"I will take this one"},{en:"Do you accept cards?"},{en:"Can I return this?"},{en:"Where is the trial room?"}]
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
    renderPhrases(travelPhrasesCache[key], fromLang, toLang); return;
  }
  try {
    const results = [];
    for (const phrase of PHRASES[currentCategory]) {
      const [frTranslated, toTranslated] = await Promise.all([
        translateText(phrase.en, "en", fromLang),
        translateText(phrase.en, "en", toLang)
      ]);
      results.push({ en: phrase.en, from: frTranslated, to: toTranslated, toLang });
    }
    travelPhrasesCache[key] = results;
    document.getElementById("travelLoading").style.display = "none";
    renderPhrases(results, fromLang, toLang);
  } catch {
    document.getElementById("travelLoading").style.display = "none";
    document.getElementById("phrasesList").innerHTML = `<div class="empty-state"><p class="es-sub">Could not load phrases. Check your connection.</p></div>`;
  }
}

function renderPhrases(results, fromLang, toLang) {
  const list = document.getElementById("phrasesList");
  list.innerHTML = "";
  results.forEach((r, i) => {
    const card = document.createElement("div");
    card.className = "phrase-card";
    card.innerHTML = `
      <div class="phrase-texts">
        <div class="phrase-orig">${LANG_NAMES[fromLang]}: ${r.from}</div>
        <div class="phrase-trans">${LANG_NAMES[toLang]}: ${r.to}</div>
        <div class="phrase-en">${r.en}</div>
      </div>
      <div class="phrase-btns">
        <button class="phrase-btn" onclick="copyPhraseText(${i})" title="Copy">
          <svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </button>
        <button class="phrase-btn phrase-play" onclick="playPhrase(${i})" title="Play">
          <svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        </button>
      </div>`;
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
  try {
    const blob = await fetch(`${API_URL}/speak`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({text:p.to,lang:p.toLang}) }).then(r=>r.blob());
    stopAllAudio();
    new Audio(URL.createObjectURL(blob)).play();
  } catch { showToast("Could not play audio"); }
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
  try {
    const tessLangs = { en:'eng', hi:'hin', te:'tel', ta:'tam', kn:'kan', ml:'mal', bn:'ben', mr:'mar', gu:'guj', pa:'pan', ur:'urd' };
    const ocrLang = tessLangs[fromLang] || 'eng';
    statusEl.textContent = 'Reading text from image...';
    const { createWorker } = Tesseract;
    const worker = await createWorker(ocrLang);
    const { data: { text } } = await worker.recognize(currentImageFile);
    await worker.terminate();
    const extracted = text.trim();
    if (!extracted || extracted.length < 2) {
      statusEl.textContent = 'No text found. Try a clearer image.';
      btn.disabled = false; btn.innerHTML = BTN_READY_HTML; return;
    }
    document.getElementById('imgExtractedText').textContent = extracted;
    statusEl.textContent = 'Translating...';
    btn.textContent = 'Translating...';
    const translated = await translateText(extracted, fromLang, toLang);
    document.getElementById('imgTranslatedText').textContent = translated;
    window._imgTranslatedText = translated;
    btn.textContent = 'Generating audio...';
    imgAudioBlob = await fetch(`${API_URL}/speak`, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({text: translated, lang: toLang})
    }).then(r=>r.blob());
    document.getElementById('imgResults').style.display = 'block';
    statusEl.textContent = 'Done';
    const playBtn = document.querySelector('#imgActionBtns .ac-btn.ac-primary');
    if (playBtn) createAudioPlayer(imgAudioBlob, playBtn, translated, 'img', 'imgTranslatedText');
  } catch(err) {
    console.error(err);
    statusEl.textContent = 'Error: ' + (err.message || 'Something went wrong. Try again.');
  }
  btn.disabled = false; btn.innerHTML = BTN_READY_HTML;
}

function playImgAudio() {
  const blob = imgAudioBlob;
  const text = window._imgTranslatedText || document.getElementById('imgTranslatedText').textContent;
  const btn = document.querySelector('#imgActionBtns .ac-btn.ac-primary');
  if (!blob || !btn) return;
  toggleAudio(blob, btn, text, 'img', 'imgTranslatedText');
}
