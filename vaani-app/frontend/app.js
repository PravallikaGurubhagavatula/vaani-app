const API = "http://127.0.0.1:8000";
let audioBlob = null;

// ── Speech Recognition Setup ─────────────────────────
const SpeechRecognition = window.SpeechRecognition 
                        || window.webkitSpeechRecognition;
const recognition = new SpeechRecognition();
recognition.continuous = false;
recognition.interimResults = false;

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
  document.getElementById("originalText").textContent = spokenText;
  document.getElementById("micStatus").textContent = "Translating...";
  stopMic();

  await translateAndSpeak(spokenText);
};

recognition.onerror = (e) => {
  document.getElementById("micStatus").textContent = "Error. Try again.";
  stopMic();
};

function stopMic() {
  document.getElementById("micBtn").classList.remove("listening");
}

// ── Translate + Get Audio ─────────────────────────────
async function translateAndSpeak(text) {
  const fromLang = document.getElementById("fromLang").value;
  const toLang   = document.getElementById("toLang").value;

  try {
    // Step 1: Translate
    const transRes = await fetch(`${API}/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, from_lang: fromLang, to_lang: toLang })
    });
    const transData = await transRes.json();
    const translatedText = transData.translated;

    document.getElementById("translatedText").textContent = translatedText;

    // Step 2: Get Audio
    const audioRes = await fetch(`${API}/speak`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: translatedText, lang: toLang })
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
}
