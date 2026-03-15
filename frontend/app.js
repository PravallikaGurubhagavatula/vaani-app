const API_URL = "https://vaani-app-ui0z.onrender.com";

let audioBlob = null;
let audioBlobA = null;
let audioBlobB = null;
let lastSpokenText = "";
let lastFromLang = "";
let currentConvSpeaker = null;
let currentCategory = "food";
let travelPhrasesCache = {};
let isDarkMode = true;

// ── THEME TOGGLE ─────────────────────────────────────
function toggleTheme() {
  isDarkMode = !isDarkMode;
  document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
  document.getElementById('themeBtn').textContent = isDarkMode ? '🌙' : '☀️';
}

// ── INPUT MODE TOGGLE ─────────────────────────────────
function switchInputMode(mode) {
  document.getElementById('voiceModeBtn').classList.toggle('active', mode === 'voice');
  document.getElementById('textModeBtn').classList.toggle('active', mode === 'text');
  document.getElementById('voiceInput').style.display = mode === 'voice' ? 'block' : 'none';
  document.getElementById('textInput').style.display = mode === 'text' ? 'block' : 'none';
}

// ── TEXT INPUT TRANSLATION ────────────────────────────
async function translateTypedText() {
  const text = document.getElementById('textInputArea').value.trim();
  if (!text) return;
  const fromLang = document.getElementById("fromLang").value;
  lastSpokenText = text;
  lastFromLang = fromLang;
  document.getElementById("originalText").textContent = text;
  document.getElementById("micStatus").textContent = "Translating...";
  await translateAndSpeak(text, fromLang);
}

// ── COPY FUNCTIONS ────────────────────────────────────
function copyTranslation() {
  const text = document.getElementById("translatedText").textContent;
  if (text && text !== "—") {
    navigator.clipboard.writeText(text).then(() => showToast("📋 Copied!"));
  }
}

// Auto-save to history if user is logged in
if (window.getCurrentUser && window.getCurrentUser()) {
  saveToHistory(
    document.getElementById('originalText').textContent,
    translation,  // or whatever your translated variable is called
    document.getElementById('fromLang').value,
    document.getElementById('toLang').value
  );
}

function copyText(elementId) {
  const text = document.getElementById(elementId).textContent;
  if (text && text !== "—") {
    navigator.clipboard.writeText(text).then(() => showToast("📋 Copied!"));
  }
}

function showToast(msg) {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2000);
}

// ── MENU ─────────────────────────────────────────────
function toggleMenu() {
  document.getElementById("sideMenu").classList.toggle("open");
  document.getElementById("menuOverlay").classList.toggle("open");
}
function closeMenu() {
  document.getElementById("sideMenu").classList.remove("open");
  document.getElementById("menuOverlay").classList.remove("open");
}
function navigateTo(page) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".menu-item").forEach(m => m.classList.remove("active"));
  document.getElementById("page" + page).classList.add("active");
  document.getElementById("menu" + page).classList.add("active");
  closeMenu();
  if (page === "Travel") loadTravelPhrases();
  case 'History':
  loadHistory();
  break;
case 'Favourites':
  loadFavourites();
  break;
}

// ── SPEECH RECOGNITION ───────────────────────────────
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const recognition = new SpeechRecognition();
recognition.continuous = false;
recognition.interimResults = false;

document.getElementById("toLang").addEventListener("change", async () => {
  if (lastSpokenText) {
    document.getElementById("micStatus").textContent = "Translating...";
    await translateAndSpeak(lastSpokenText, lastFromLang);
  }
});
document.getElementById("fromLang").addEventListener("change", async () => {
  if (lastSpokenText) {
    const newFromLang = document.getElementById("fromLang").value;
    lastFromLang = newFromLang;
    document.getElementById("micStatus").textContent = "Translating...";
    await translateAndSpeak(lastSpokenText, newFromLang);
  }
});

function startListening() {
  currentConvSpeaker = null;
  recognition.lang = document.getElementById("fromLang").value;
  document.getElementById("micBtn").classList.add("listening");
  document.getElementById("micStatus").textContent = "Listening...";
  document.getElementById("originalText").textContent = "—";
  document.getElementById("translatedText").textContent = "—";
  document.getElementById("actionBtns").style.display = "none";
  document.getElementById("copyBtn").style.display = "none";
  recognition.start();
}

function startConvListening(person) {
  currentConvSpeaker = person;
  recognition.lang = document.getElementById(`convLang${person}`).value;
  document.getElementById(`micBtn${person}`).classList.add("listening");
  document.getElementById(`micStatus${person}`).textContent = "Listening...";
  document.getElementById(`originalText${person}`).textContent = "—";
  document.getElementById(`translatedText${person}`).textContent = "—";
  document.getElementById(`playBtn${person}`).style.display = "none";
  recognition.start();
}

recognition.onresult = async (event) => {
  const spokenText = event.results[0][0].transcript;
  if (currentConvSpeaker) {
    const person = currentConvSpeaker;
    const otherPerson = person === 'A' ? 'B' : 'A';
    const fromLang = document.getElementById(`convLang${person}`).value;
    const toLang = document.getElementById(`convLang${otherPerson}`).value;
    document.getElementById(`originalText${person}`).textContent = spokenText;
    document.getElementById(`micStatus${person}`).textContent = "Translating...";
    document.getElementById(`micBtn${person}`).classList.remove("listening");
    await translateAndSpeakConv(spokenText, fromLang, toLang, person);
  } else {
    const fromLang = document.getElementById("fromLang").value;
    lastSpokenText = spokenText;
    lastFromLang = fromLang;
    document.getElementById("originalText").textContent = spokenText;
    document.getElementById("micStatus").textContent = "Translating...";
    stopMic();
    await translateAndSpeak(spokenText, fromLang);
  }
};

recognition.onerror = (e) => {
  if (currentConvSpeaker) {
    document.getElementById(`micStatus${currentConvSpeaker}`).textContent = "Error. Try again.";
    document.getElementById(`micBtn${currentConvSpeaker}`).classList.remove("listening");
  } else {
    document.getElementById("micStatus").textContent = "Error. Try again.";
    stopMic();
  }
};

function stopMic() { document.getElementById("micBtn").classList.remove("listening"); }

// ── TRANSLATE + SPEAK (Single) ────────────────────────
async function translateAndSpeak(text, fromLang) {
  const toLang = document.getElementById("toLang").value;
  try {
    const transRes = await fetch(`${API_URL}/translate`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, from_lang: fromLang, to_lang: toLang })
    });
    const transData = await transRes.json();
    const translatedText = transData.translated;
    document.getElementById("translatedText").textContent = translatedText;
    document.getElementById("copyBtn").style.display = "block";

    const audioRes = await fetch(`${API_URL}/speak`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: translatedText, lang: toLang })
    });
    audioBlob = await audioRes.blob();
    document.getElementById("actionBtns").style.display = "flex";
    document.getElementById("micStatus").textContent = "Press mic and speak";
    playAudio();
  } catch (err) {
    document.getElementById("micStatus").textContent = "Server error. Is backend running?";
  }
}

// ── TRANSLATE + SPEAK (Conversation) ─────────────────
async function translateAndSpeakConv(text, fromLang, toLang, person) {
  try {
    const transRes = await fetch(`${API_URL}/translate`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, from_lang: fromLang, to_lang: toLang })
    });
    const transData = await transRes.json();
    const translatedText = transData.translated;
    document.getElementById(`translatedText${person}`).textContent = translatedText;
    const audioRes = await fetch(`${API_URL}/speak`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: translatedText, lang: toLang })
    });
    const blob = await audioRes.blob();
    if (person === 'A') { audioBlobA = blob; playAudioA(); }
    else { audioBlobB = blob; playAudioB(); }
    document.getElementById(`playBtn${person}`).style.display = "block";
    document.getElementById(`micStatus${person}`).textContent = "Press mic and speak";
  } catch (err) {
    document.getElementById(`micStatus${person}`).textContent = "Server error. Is backend running?";
  }
}

// ── AUDIO PLAYERS ─────────────────────────────────────
function playAudio() { if (audioBlob) new Audio(URL.createObjectURL(audioBlob)).play(); }
function playAudioA() { if (audioBlobA) new Audio(URL.createObjectURL(audioBlobA)).play(); }
function playAudioB() { if (audioBlobB) new Audio(URL.createObjectURL(audioBlobB)).play(); }

// ── SWAP ──────────────────────────────────────────────
function swapLanguages() {
  const f = document.getElementById("fromLang");
  const t = document.getElementById("toLang");
  const temp = f.value; f.value = t.value; t.value = temp;
  lastSpokenText = ""; lastFromLang = ""; audioBlob = null;
  document.getElementById("originalText").textContent = "—";
  document.getElementById("translatedText").textContent = "—";
  document.getElementById("actionBtns").style.display = "none";
  document.getElementById("copyBtn").style.display = "none";
  document.getElementById("micStatus").textContent = "Languages swapped! Press mic and speak again.";
}

// ── TRAVEL HELPER ─────────────────────────────────────
const LANG_NAMES = {
  te: "Telugu", ta: "Tamil", hi: "Hindi", kn: "Kannada",
  ml: "Malayalam", mr: "Marathi", bn: "Bengali",
  gu: "Gujarati", pa: "Punjabi", ur: "Urdu", en: "English"
};

const PHRASES = {
  food: [
    { en: "I am hungry" }, { en: "Give me a menu please" },
    { en: "How much is this?" }, { en: "This is delicious!" },
    { en: "I am vegetarian" }, { en: "Water please" },
    { en: "The bill please" }, { en: "No spicy food please" },
  ],
  transport: [
    { en: "Where is the bus stop?" }, { en: "How much is the ticket?" },
    { en: "Take me to this address" }, { en: "Stop here please" },
    { en: "Is this the right train?" }, { en: "Where is the airport?" },
    { en: "How far is it?" }, { en: "Call a taxi please" },
  ],
  hotel: [
    { en: "I have a reservation" }, { en: "What time is checkout?" },
    { en: "Can I get extra towels?" }, { en: "The AC is not working" },
    { en: "Is breakfast included?" }, { en: "I need a wake up call" },
    { en: "Where is the lift?" }, { en: "Can I extend my stay?" },
  ],
  emergency: [
    { en: "Help me please!" }, { en: "Call the police" },
    { en: "I need a doctor" }, { en: "I am lost" },
    { en: "Call an ambulance" }, { en: "I have been robbed" },
    { en: "Where is the hospital?" }, { en: "I am allergic to this" },
  ],
  shopping: [
    { en: "How much does this cost?" }, { en: "Can you give a discount?" },
    { en: "Do you have a smaller size?" }, { en: "I am just looking" },
    { en: "I will take this one" }, { en: "Do you accept cards?" },
    { en: "Can I return this?" }, { en: "Where is the trial room?" },
  ]
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
  const phrases = PHRASES[currentCategory];
  const cacheKey = `${currentCategory}_${fromLang}_${toLang}`;

  document.getElementById("phrasesList").innerHTML = "";
  document.getElementById("travelLoading").style.display = "block";

  if (travelPhrasesCache[cacheKey]) {
    document.getElementById("travelLoading").style.display = "none";
    renderPhrases(travelPhrasesCache[cacheKey], fromLang, toLang);
    return;
  }

  try {
    const results = [];
    for (const phrase of phrases) {
      const fromRes = await fetch(`${API_URL}/translate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: phrase.en, from_lang: "en", to_lang: fromLang })
      });
      const fromData = await fromRes.json();
      const toRes = await fetch(`${API_URL}/translate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: phrase.en, from_lang: "en", to_lang: toLang })
      });
      const toData = await toRes.json();
      results.push({ en: phrase.en, from: fromData.translated, to: toData.translated, toLang });
    }
    travelPhrasesCache[cacheKey] = results;
    document.getElementById("travelLoading").style.display = "none";
    renderPhrases(results, fromLang, toLang);
  } catch (err) {
    document.getElementById("travelLoading").style.display = "none";
    document.getElementById("phrasesList").innerHTML =
      `<p style="text-align:center; color:var(--text-muted); padding:20px;">Could not load phrases. Is backend running?</p>`;
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
        <div class="phrase-original">${LANG_NAMES[fromLang]}: ${r.from}</div>
        <div class="phrase-translated">${LANG_NAMES[toLang]}: ${r.to}</div>
        <div class="phrase-english">${r.en}</div>
      </div>
      <div class="phrase-actions">
        <button class="phrase-copy-btn" onclick="copyPhraseText(${i})" title="Copy">📋</button>
        <button class="phrase-play-btn" onclick="playPhrase(${i})" title="Play">🔊</button>
      </div>
    `;
    list.appendChild(card);
  });
  window._currentPhraseResults = results;
}

function copyPhraseText(index) {
  const phrase = window._currentPhraseResults[index];
  if (phrase) {
    navigator.clipboard.writeText(phrase.to).then(() => showToast("📋 Copied!"));
  }
}

async function playPhrase(index) {
  const phrase = window._currentPhraseResults[index];
  if (!phrase) return;
  try {
    const res = await fetch(`${API_URL}/speak`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: phrase.to, lang: phrase.toLang })
    });
    const blob = await res.blob();
    new Audio(URL.createObjectURL(blob)).play();
  } catch (err) {
    showToast("❌ Could not play audio");
  }
}

// ── IMAGE TRANSLATION ─────────────────────────────────
let imgAudioBlob = null;

function handleDrop(event) {
  event.preventDefault();
  document.getElementById('uploadArea').classList.remove('drag-over');
  const file = event.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) {
    processImageFile(file);
  }
}

function handleImageUpload(event) {
  const file = event.target.files[0];
  if (file) processImageFile(file);
}

function processImageFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById('imgPreview').src = e.target.result;
    document.getElementById('uploadArea').style.display = 'none';
    document.getElementById('imgPreviewBox').style.display = 'block';
    document.getElementById('imgTranslateBtn').style.display = 'block';
    document.getElementById('imgResults').style.display = 'none';
    document.getElementById('imgStatus').textContent = '';
    imgAudioBlob = null;
  };
  reader.readAsDataURL(file);
}

async function translateImage() {
  const fileInput = document.getElementById('imageInput');
  const file = fileInput.files[0];
  if (!file) return;

  const fromLang = document.getElementById('imgFromLang').value;
  const toLang = document.getElementById('imgToLang').value;
  const btn = document.getElementById('imgTranslateBtn');

  btn.disabled = true;
  btn.textContent = '⏳ Processing...';
  document.getElementById('imgStatus').textContent = 'Reading text from image...';
  document.getElementById('imgResults').style.display = 'none';

  try {
    // Use Tesseract.js for OCR directly in browser
    const { createWorker } = Tesseract;
    const imgSrc = document.getElementById('imgPreview').src;

    // Map language codes to Tesseract language codes
    const tesseractLangs = {
      en: 'eng', hi: 'hin', te: 'tel', ta: 'tam',
      kn: 'kan', ml: 'mal', bn: 'ben', mr: 'mar',
      gu: 'guj', pa: 'pan', ur: 'urd'
    };
    const ocrLang = tesseractLangs[fromLang] || 'eng';

    document.getElementById('imgStatus').textContent = 'Reading text from image... (this may take a moment)';

    const worker = await createWorker(ocrLang);
    const { data: { text } } = await worker.recognize(imgSrc);
    await worker.terminate();

    const extractedText = text.trim();

    if (!extractedText) {
      document.getElementById('imgStatus').textContent = '❌ No text found in image. Try a clearer image!';
      btn.disabled = false;
      btn.textContent = '🔍 Extract & Translate Text';
      return;
    }

    document.getElementById('imgExtractedText').textContent = extractedText;
    document.getElementById('imgStatus').textContent = 'Translating...';

    // Translate extracted text
    const transRes = await fetch(`${API_URL}/translate`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: extractedText, from_lang: fromLang, to_lang: toLang })
    });
    const transData = await transRes.json();
    const translatedText = transData.translated;
    document.getElementById('imgTranslatedText').textContent = translatedText;

    // Get audio
    const audioRes = await fetch(`${API_URL}/speak`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: translatedText, lang: toLang })
    });
    imgAudioBlob = await audioRes.blob();

    document.getElementById('imgResults').style.display = 'block';
    document.getElementById('imgStatus').textContent = '✅ Done!';
    playImgAudio();

  } catch (err) {
    document.getElementById('imgStatus').textContent = '❌ Error processing image. Try again!';
    console.error(err);
  }

  btn.disabled = false;
  btn.textContent = '🔍 Extract & Translate Text';
}

function playImgAudio() {
  if (imgAudioBlob) new Audio(URL.createObjectURL(imgAudioBlob)).play();
}
