const API_URL = "https://vaani-app-ui0z.onrender.com";

let audioBlob = null, audioBlobA = null, audioBlobB = null;
let lastSpokenText = "", lastFromLang = "";
let currentConvSpeaker = null, currentCategory = "food";
let travelPhrasesCache = {}, isDarkMode = true;

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

function switchInputMode(mode) {
  document.getElementById('voiceModeBtn').classList.toggle('active', mode === 'voice');
  document.getElementById('textModeBtn').classList.toggle('active', mode === 'text');
  document.getElementById('voiceInput').style.display = mode === 'voice' ? 'block' : 'none';
  document.getElementById('textInput').style.display = mode === 'text' ? 'block' : 'none';
}

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

function copyTranslation() {
  const text = document.getElementById("translatedText").textContent;
  if (text && text !== "—") navigator.clipboard.writeText(text).then(() => showToast("Copied to clipboard"));
}
function copyText(id) {
  const text = document.getElementById(id).textContent;
  if (text && text !== "—") navigator.clipboard.writeText(text).then(() => showToast("Copied to clipboard"));
}
function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2200);
}

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

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition;
try { recognition = new SpeechRecognition(); recognition.continuous = false; recognition.interimResults = false; } catch(e) {}

document.getElementById("toLang").addEventListener("change", async () => { if (lastSpokenText) await translateAndSpeak(lastSpokenText, lastFromLang); });
document.getElementById("fromLang").addEventListener("change", async () => { if (lastSpokenText) { lastFromLang = document.getElementById("fromLang").value; await translateAndSpeak(lastSpokenText, lastFromLang); } });

function startListening() {
  if (!recognition) { showToast("Speech recognition not supported"); return; }
  currentConvSpeaker = null;
  recognition.lang = document.getElementById("fromLang").value;
  document.getElementById("micBtn").classList.add("listening");
  document.getElementById("micStatus").textContent = "Listening...";
  document.getElementById("originalText").textContent = "—";
  document.getElementById("translatedText").textContent = "—";
  document.getElementById("resultsSection").style.display = "none";
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
  recognition.onerror = (e) => {
    if (currentConvSpeaker) { document.getElementById(`micStatus${currentConvSpeaker}`).textContent = "Error. Try again."; document.getElementById(`micBtn${currentConvSpeaker}`).classList.remove("listening"); }
    else { document.getElementById("micStatus").textContent = "Error. Try again."; document.getElementById("micBtn").classList.remove("listening"); }
  };
}

async function translateAndSpeak(text, fromLang) {
  const toLang = document.getElementById("toLang").value;
  try {
    const transRes = await fetch(`${API_URL}/translate`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text,from_lang:fromLang,to_lang:toLang})});
    const { translated } = await transRes.json();
    document.getElementById("translatedText").textContent = translated;
    const audioRes = await fetch(`${API_URL}/speak`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:translated,lang:toLang})});
    audioBlob = await audioRes.blob();
    document.getElementById("actionBtns").style.display = "flex";
    document.getElementById("micStatus").textContent = "Tap to speak";
    playAudio();
    if (window.getCurrentUser && window.getCurrentUser()) saveToHistory(text, translated, fromLang, toLang);
  } catch { document.getElementById("translatedText").textContent = "—"; document.getElementById("micStatus").textContent = "Server error. Is backend running?"; }
}

async function translateAndSpeakConv(text, fromLang, toLang, person) {
  try {
    const { translated } = await fetch(`${API_URL}/translate`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text,from_lang:fromLang,to_lang:toLang})}).then(r=>r.json());
    document.getElementById(`translatedText${person}`).textContent = translated;
    const blob = await fetch(`${API_URL}/speak`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:translated,lang:toLang})}).then(r=>r.blob());
    if (person==='A'){audioBlobA=blob;playAudioA();}else{audioBlobB=blob;playAudioB();}
    document.getElementById(`playBtn${person}`).style.display = "flex";
    document.getElementById(`micStatus${person}`).textContent = "Tap to speak";
  } catch { document.getElementById(`micStatus${person}`).textContent = "Error. Try again."; }
}

function playAudio() { if (audioBlob) new Audio(URL.createObjectURL(audioBlob)).play(); }
function playAudioA() { if (audioBlobA) new Audio(URL.createObjectURL(audioBlobA)).play(); }
function playAudioB() { if (audioBlobB) new Audio(URL.createObjectURL(audioBlobB)).play(); }

function swapLanguages() {
  const f = document.getElementById("fromLang"), t = document.getElementById("toLang");
  [f.value, t.value] = [t.value, f.value];
  lastSpokenText = ""; lastFromLang = ""; audioBlob = null;
  document.getElementById("originalText").textContent = "—";
  document.getElementById("translatedText").textContent = "—";
  document.getElementById("resultsSection").style.display = "none";
  showToast("Languages swapped");
}

const LANG_NAMES = {te:"Telugu",ta:"Tamil",hi:"Hindi",kn:"Kannada",ml:"Malayalam",mr:"Marathi",bn:"Bengali",gu:"Gujarati",pa:"Punjabi",ur:"Urdu",en:"English"};
const PHRASES = {
  food:[{en:"I am hungry"},{en:"Give me a menu please"},{en:"How much is this?"},{en:"This is delicious!"},{en:"I am vegetarian"},{en:"Water please"},{en:"The bill please"},{en:"No spicy food please"}],
  transport:[{en:"Where is the bus stop?"},{en:"How much is the ticket?"},{en:"Take me to this address"},{en:"Stop here please"},{en:"Is this the right train?"},{en:"Where is the airport?"},{en:"How far is it?"},{en:"Call a taxi please"}],
  hotel:[{en:"I have a reservation"},{en:"What time is checkout?"},{en:"Can I get extra towels?"},{en:"The AC is not working"},{en:"Is breakfast included?"},{en:"I need a wake up call"},{en:"Where is the lift?"},{en:"Can I extend my stay?"}],
  emergency:[{en:"Help me please!"},{en:"Call the police"},{en:"I need a doctor"},{en:"I am lost"},{en:"Call an ambulance"},{en:"I have been robbed"},{en:"Where is the hospital?"},{en:"I am allergic to this"}],
  shopping:[{en:"How much does this cost?"},{en:"Can you give a discount?"},{en:"Do you have a smaller size?"},{en:"I am just looking"},{en:"I will take this one"},{en:"Do you accept cards?"},{en:"Can I return this?"},{en:"Where is the trial room?"}]
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
  if (travelPhrasesCache[key]) { document.getElementById("travelLoading").style.display = "none"; renderPhrases(travelPhrasesCache[key], fromLang, toLang); return; }
  try {
    const results = [];
    for (const phrase of PHRASES[currentCategory]) {
      const [fr, tr] = await Promise.all([
        fetch(`${API_URL}/translate`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:phrase.en,from_lang:"en",to_lang:fromLang})}).then(r=>r.json()),
        fetch(`${API_URL}/translate`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:phrase.en,from_lang:"en",to_lang:toLang})}).then(r=>r.json())
      ]);
      results.push({en:phrase.en,from:fr.translated,to:tr.translated,toLang});
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
    card.innerHTML = `<div class="phrase-texts"><div class="phrase-orig">${LANG_NAMES[fromLang]}: ${r.from}</div><div class="phrase-trans">${LANG_NAMES[toLang]}: ${r.to}</div><div class="phrase-en">${r.en}</div></div><div class="phrase-btns"><button class="phrase-btn" onclick="copyPhraseText(${i})" title="Copy"><svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button><button class="phrase-btn phrase-play" onclick="playPhrase(${i})" title="Play"><svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg></button></div>`;
    list.appendChild(card);
  });
  window._phraseResults = results;
}

function copyPhraseText(i) { const p = window._phraseResults[i]; if (p) navigator.clipboard.writeText(p.to).then(() => showToast("Copied")); }
async function playPhrase(i) {
  const p = window._phraseResults[i]; if (!p) return;
  try { const res = await fetch(`${API_URL}/speak`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:p.to,lang:p.toLang})}); new Audio(URL.createObjectURL(await res.blob())).play(); }
  catch { showToast("Could not play audio"); }
}

let imgAudioBlob = null;
function handleDrop(e) { e.preventDefault(); document.getElementById('uploadArea').classList.remove('drag-over'); const f = e.dataTransfer.files[0]; if (f && f.type.startsWith('image/')) processImageFile(f); }
function handleImageUpload(e) { const f = e.target.files[0]; if (f) processImageFile(f); }
function processImageFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById('imgPreview').src = e.target.result;
    document.getElementById('uploadArea').style.display = 'none';
    document.getElementById('imgPreviewBox').style.display = 'block';
    document.getElementById('imgTranslateBtn').style.display = 'flex';
    document.getElementById('imgResults').style.display = 'none';
    document.getElementById('imgStatus').textContent = '';
    imgAudioBlob = null;
  };
  reader.readAsDataURL(file);
}

async function translateImage() {
  const file = document.getElementById('imageInput').files[0]; if (!file) return;
  const fromLang = document.getElementById('imgFromLang').value;
  const toLang = document.getElementById('imgToLang').value;
  const btn = document.getElementById('imgTranslateBtn');
  btn.disabled = true; btn.textContent = 'Processing...';
  document.getElementById('imgStatus').textContent = 'Reading text from image...';
  document.getElementById('imgResults').style.display = 'none';
  try {
    const langs = {en:'eng',hi:'hin',te:'tel',ta:'tam',kn:'kan',ml:'mal',bn:'ben',mr:'mar',gu:'guj',pa:'pan',ur:'urd'};
    const worker = await Tesseract.createWorker(langs[fromLang] || 'eng');
    const { data: { text } } = await worker.recognize(document.getElementById('imgPreview').src);
    await worker.terminate();
    const extracted = text.trim();
    if (!extracted) { document.getElementById('imgStatus').textContent = 'No text found. Try a clearer image.'; btn.disabled=false; btn.innerHTML='<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>Extract & Translate'; return; }
    document.getElementById('imgExtractedText').textContent = extracted;
    document.getElementById('imgStatus').textContent = 'Translating...';
    const { translated } = await fetch(`${API_URL}/translate`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:extracted,from_lang:fromLang,to_lang:toLang})}).then(r=>r.json());
    document.getElementById('imgTranslatedText').textContent = translated;
    imgAudioBlob = await fetch(`${API_URL}/speak`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:translated,lang:toLang})}).then(r=>r.blob());
    document.getElementById('imgResults').style.display = 'block';
    document.getElementById('imgStatus').textContent = 'Done!';
    playImgAudio();
  } catch(err) { document.getElementById('imgStatus').textContent = 'Error processing image. Try again.'; console.error(err); }
  btn.disabled=false; btn.innerHTML='<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>Extract & Translate';
}
function playImgAudio() { if (imgAudioBlob) new Audio(URL.createObjectURL(imgAudioBlob)).play(); }
