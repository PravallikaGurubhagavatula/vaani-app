const API_URL = "https://vaani-app-ui0z.onrender.com";

let audioBlob = null;
let audioBlobA = null;
let audioBlobB = null;
let lastSpokenText = "";
let lastFromLang = "";
let currentConvSpeaker = null;
let currentCategory = "food";
let travelPhrasesCache = {};

// ── Travel Phrases (English source) ──────────────────
const PHRASES = {
  food: [
    { en: "I am hungry", key: "food1" },
    { en: "Give me a menu please", key: "food2" },
    { en: "How much is this?", key: "food3" },
    { en: "This is delicious!", key: "food4" },
    { en: "I am vegetarian", key: "food5" },
    { en: "Water please", key: "food6" },
    { en: "The bill please", key: "food7" },
    { en: "No spicy food please", key: "food8" },
  ],
  transport: [
    { en: "Where is the bus stop?", key: "tr1" },
    { en: "How much is the ticket?", key: "tr2" },
    { en: "Take me to this address", key: "tr3" },
    { en: "Stop here please", key: "tr4" },
    { en: "Is this the right train?", key: "tr5" },
    { en: "Where is the airport?", key: "tr6" },
    { en: "How far is it?", key: "tr7" },
    { en: "Call a taxi please", key: "tr8" },
  ],
  hotel: [
    { en: "I have a reservation", key: "h1" },
    { en: "What time is checkout?", key: "h2" },
    { en: "Can I get extra towels?", key: "h3" },
    { en: "The AC is not working", key: "h4" },
    { en: "Is breakfast included?", key: "h5" },
    { en: "I need a wake up call", key: "h6" },
    { en: "Where is the lift?", key: "h7" },
    { en: "Can I extend my stay?", key: "h8" },
  ],
  emergency: [
    { en: "Help me please!", key: "em1" },
    { en: "Call the police", key: "em2" },
    { en: "I need a doctor", key: "em3" },
    { en: "I am lost", key: "em4" },
    { en: "Call an ambulance", key: "em5" },
    { en: "I have been robbed", key: "em6" },
    { en: "Where is the hospital?", key: "em7" },
    { en: "I am allergic to this", key: "em8" },
  ],
  shopping: [
    { en: "How much does this cost?", key: "sh1" },
    { en: "Can you give a discount?", key: "sh2" },
    { en: "Do you have a smaller size?", key: "sh3" },
    { en: "I am just looking", key: "sh4" },
    { en: "I will take this one", key: "sh5" },
    { en: "Do you accept cards?", key: "sh6" },
    { en: "Can I return this?", key: "sh7" },
    { en: "Where is the trial room?", key: "sh8" },
  ]
};

// ── Language names map ────────────────────────────────
const LANG_NAMES = {
  te: "Telugu", ta: "Tamil", hi: "Hindi", kn: "Kannada",
  ml: "Malayalam", mr: "Marathi", bn: "Bengali",
  gu: "Gujarati", pa: "Punjabi", ur: "Urdu", en: "English"
};

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
}

// ── SPEECH RECOGNITION ───────────────────────────────
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const recognition = new SpeechRecognition();
recognition.continuous = false;
recognition.interimResults = false;

// Language change listeners
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
  document.getElementById("playBtn").style.display = "none";
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

function stopMic() {
  document.getElementById("micBtn").classList.remove("listening");
}

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
    const audioRes = await fetch(`${API_URL}/speak`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: translatedText, lang: toLang })
    });
    audioBlob = await audioRes.blob();
    document.getElementById("playBtn").style.display = "block";
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
  document.getElementById("playBtn").style.display = "none";
  document.getElementById("micStatus").textContent = "Languages swapped! Press mic and speak again.";
}

// ── TRAVEL HELPER ─────────────────────────────────────
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

  // Check cache
  if (travelPhrasesCache[cacheKey]) {
    document.getElementById("travelLoading").style.display = "none";
    renderPhrases(travelPhrasesCache[cacheKey], fromLang, toLang);
    return;
  }

  try {
    // Translate all phrases
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

      results.push({
        en: phrase.en,
        from: fromData.translated,
        to: toData.translated,
        toLang: toLang
      });
    }

    travelPhrasesCache[cacheKey] = results;
    document.getElementById("travelLoading").style.display = "none";
    renderPhrases(results, fromLang, toLang);

  } catch (err) {
    document.getElementById("travelLoading").style.display = "none";
    document.getElementById("phrasesList").innerHTML =
      `<p style="text-align:center; color:#888; padding:20px;">Could not load phrases. Is backend running?</p>`;
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
      <button class="phrase-play-btn" onclick="playPhrase(${i})" data-index="${i}">🔊</button>
    `;
    list.appendChild(card);
  });
  window._currentPhraseResults = results;
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
    alert("Could not play audio. Is backend running?");
  }
}
