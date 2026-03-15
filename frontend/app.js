const API_URL = "https://vaani-app-ui0z.onrender.com";

let audioBlob = null;
let audioBlobA = null;
let audioBlobB = null;
let lastSpokenText = "";
let lastFromLang = "";
let currentConvSpeaker = null;

// ── Speech Recognition Setup ─────────────────────────
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const recognition = new SpeechRecognition();
recognition.continuous = false;
recognition.interimResults = false;

// ── Mode Switcher ─────────────────────────────────────
function switchMode(mode) {
  if (mode === 'single') {
    document.getElementById('singleMode').style.display = 'block';
    document.getElementById('convMode').style.display = 'none';
    document.getElementById('singleModeBtn').classList.add('active');
    document.getElementById('convModeBtn').classList.remove('active');
  } else {
    document.getElementById('singleMode').style.display = 'none';
    document.getElementById('convMode').style.display = 'block';
    document.getElementById('singleModeBtn').classList.remove('active');
    document.getElementById('convModeBtn').classList.add('active');
  }
}

// ── Language Change Listeners (Single Mode) ───────────
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

// ── Single Mode: Start Listening ──────────────────────
function startListening() {
  currentConvSpeaker = null;
  const fromLang = document.getElementById("fromLang").value;
  recognition.lang = fromLang;

  document.getElementById("micBtn").classList.add("listening");
  document.getElementById("micStatus").textContent = "Listening...";
  document.getElementById("originalText").textContent = "—";
  document.getElementById("translatedText").textContent = "—";
  document.getElementById("playBtn").style.display = "none";

  recognition.start();
}

// ── Conversation Mode: Start Listening ────────────────
function startConvListening(person) {
  currentConvSpeaker = person;
  const langSelect = document.getElementById(`convLang${person}`);
  recognition.lang = langSelect.value;

  document.getElementById(`micBtn${person}`).classList.add("listening");
  document.getElementById(`micStatus${person}`).textContent = "Listening...";
  document.getElementById(`originalText${person}`).textContent = "—";
  document.getElementById(`translatedText${person}`).textContent = "—";
  document.getElementById(`playBtn${person}`).style.display = "none";

  recognition.start();
}

// ── When Speech is Captured ───────────────────────────
recognition.onresult = async (event) => {
  const spokenText = event.results[0][0].transcript;

  if (currentConvSpeaker) {
    // Conversation mode
    const person = currentConvSpeaker;
    const otherPerson = person === 'A' ? 'B' : 'A';
    const fromLang = document.getElementById(`convLang${person}`).value;
    const toLang = document.getElementById(`convLang${otherPerson}`).value;

    document.getElementById(`originalText${person}`).textContent = spokenText;
    document.getElementById(`micStatus${person}`).textContent = "Translating...";
    document.getElementById(`micBtn${person}`).classList.remove("listening");

    await translateAndSpeakConv(spokenText, fromLang, toLang, person);
  } else {
    // Single mode
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

// ── Single Mode: Translate + Speak ───────────────────
async function translateAndSpeak(text, fromLang) {
  const toLang = document.getElementById("toLang").value;
  try {
    const transRes = await fetch(`${API_URL}/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, from_lang: fromLang, to_lang: toLang })
    });
    const transData = await transRes.json();
    const translatedText = transData.translated;
    document.getElementById("translatedText").textContent = translatedText;

    const audioRes = await fetch(`${API_URL}/speak`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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

// ── Conversation Mode: Translate + Speak ─────────────
async function translateAndSpeakConv(text, fromLang, toLang, person) {
  try {
    const transRes = await fetch(`${API_URL}/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, from_lang: fromLang, to_lang: toLang })
    });
    const transData = await transRes.json();
    const translatedText = transData.translated;
    document.getElementById(`translatedText${person}`).textContent = translatedText;

    const audioRes = await fetch(`${API_URL}/speak`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: translatedText, lang: toLang })
    });

    const blob = await audioRes.blob();
    if (person === 'A') audioBlobA = blob;
    else audioBlobB = blob;

    document.getElementById(`playBtn${person}`).style.display = "block";
    document.getElementById(`micStatus${person}`).textContent = "Press mic and speak";

    // Auto play
    if (person === 'A') playAudioA();
    else playAudioB();

  } catch (err) {
    document.getElementById(`micStatus${person}`).textContent = "Server error. Is backend running?";
  }
}

// ── Audio Players ─────────────────────────────────────
function playAudio() {
  if (!audioBlob) return;
  const url = URL.createObjectURL(audioBlob);
  new Audio(url).play();
}
function playAudioA() {
  if (!audioBlobA) return;
  const url = URL.createObjectURL(audioBlobA);
  new Audio(url).play();
}
function playAudioB() {
  if (!audioBlobB) return;
  const url = URL.createObjectURL(audioBlobB);
  new Audio(url).play();
}

// ── Swap Languages (Single Mode) ─────────────────────
function swapLanguages() {
  const f = document.getElementById("fromLang");
  const t = document.getElementById("toLang");
  const temp = f.value;
  f.value = t.value;
  t.value = temp;

  lastSpokenText = "";
  lastFromLang = "";
  audioBlob = null;
  document.getElementById("originalText").textContent = "—";
  document.getElementById("translatedText").textContent = "—";
  document.getElementById("playBtn").style.display = "none";
  document.getElementById("micStatus").textContent = "Languages swapped! Press mic and speak again.";
}
