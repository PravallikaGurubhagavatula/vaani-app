// const API = "http://127.0.0.1:8000";
const API_URL = "https://vaani-app-ui0z.onrender.com";

let audioBlob = null;
let lastSpokenText = "";      // stores original spoken text
let lastFromLang = "";        // stores original from language

// ── Speech Recognition Setup ─────────────────────────
const SpeechRecognition = window.SpeechRecognition 
                        || window.webkitSpeechRecognition;
const recognition = new SpeechRecognition();
recognition.continuous = false;
recognition.interimResults = false;

// ── Language Change Listeners ─────────────────────────
// When "Translate To" language changes → re-translate same text
document.getElementById("toLang").addEventListener("change", async () => {
  if (lastSpokenText) {
    document.getElementById("micStatus").textContent = "Translating...";
    await translateAndSpeak(lastSpokenText, lastFromLang);
  }
});

// When "I Speak" language changes → re-translate same text using NEW from language
document.getElementById("fromLang").addEventListener("change", async () => {
  if (lastSpokenText) {
    const newFromLang = document.getElementById("fromLang").value;
    lastFromLang = newFromLang;  // update source language
    document.getElementById("micStatus").textContent = "Translating...";
    await translateAndSpeak(lastSpokenText, newFromLang);
  }
});

// ── Start Listening ───────────────────────────────────
function startListening() {
  const fromLang = document.getElementById("fromLang").value;
  recognition.lang = fromLang;

  document.getElementById("micBtn").classList.add("listening");
  document.getElementById("micStatus").textContent = "Listening...";
  document.getElementById("originalText").textContent = "—";
  document.getElementById("translatedText").textContent = "—";
  document.getElementById("playBtn").style.display = "none";

  recognition.start();
}

// ── When Speech is Captured ───────────────────────────
recognition.onresult = async (event) => {
  const spokenText = event.results[0][0].transcript;
  const fromLang = document.getElementById("fromLang").value;

  // Save for re-use when language changes
  lastSpokenText = spokenText;
  lastFromLang = fromLang;

  document.getElementById("originalText").textContent = spokenText;
  document.getElementById("micStatus").textContent = "Translating...";
  stopMic();

  await translateAndSpeak(spokenText, fromLang);
};

recognition.onerror = (e) => {
  document.getElementById("micStatus").textContent = "Error. Try again.";
  stopMic();
};

function stopMic() {
  document.getElementById("micBtn").classList.remove("listening");
}

// ── Translate + Get Audio ─────────────────────────────
async function translateAndSpeak(text, fromLang) {
  const toLang = document.getElementById("toLang").value;

  try {
    // Step 1: Translate
    const transRes = await fetch(`${API_URL}/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, from_lang: fromLang, to_lang: toLang })
    });
    const transData = await transRes.json();
    const translatedText = transData.translated;

    document.getElementById("translatedText").textContent = translatedText;

    // Step 2: Get Audio in the CORRECT toLang language
    const audioRes = await fetch(`${API_URL}/speak`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: translatedText, lang: toLang })  // ← always uses toLang!
    });

    audioBlob = await audioRes.blob();
    document.getElementById("playBtn").style.display = "block";
    document.getElementById("micStatus").textContent = "Press mic and speak";

    // Auto-play
    playAudio();

  } catch (err) {
    document.getElementById("micStatus").textContent = "Server error. Is backend running?";
  }
}

// ── Play Translated Audio ─────────────────────────────
function playAudio() {
  if (!audioBlob) return;
  const url = URL.createObjectURL(audioBlob);
  const audio = new Audio(url);
  audio.play();
}

// ── Swap Languages ────────────────────────────────────
function swapLanguages() {
  const f = document.getElementById("fromLang");
  const t = document.getElementById("toLang");
  const temp = f.value;
  f.value = t.value;
  t.value = temp;

  // Clear everything after swap
  lastSpokenText = "";
  lastFromLang = "";
  audioBlob = null;
  document.getElementById("originalText").textContent = "—";
  document.getElementById("translatedText").textContent = "—";
  document.getElementById("playBtn").style.display = "none";
  document.getElementById("micStatus").textContent = "Languages swapped! Press mic and speak again.";
}
