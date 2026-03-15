const API_URL = "https://vaani-app-ui0z.onrender.com";

let lastSpokenText = "", lastFromLang = "";
let currentConvSpeaker = null, currentCategory = "food";
let travelPhrasesCache = {}, isDarkMode = true;

// ── KEEP-ALIVE PING ───────────────────────────────────
function pingBackend() {
  fetch(`${API_URL}/ping`, { method:"GET", signal:AbortSignal.timeout(10000) })
    .then(()=>console.log("Backend pinged ✓")).catch(()=>{});
}
pingBackend();
setInterval(pingBackend, 10 * 60 * 1000);

// ── LANGUAGE CONFIG ───────────────────────────────────
// Grouped for display: 22 Scheduled → Popular Regional → Others
const LANG_CONFIG = {
  // ── 22 Scheduled Languages (8th Schedule) ──
  as:       { name:"Assamese",            nonLatin:true  },
  bn:       { name:"Bengali (Bangla)",    nonLatin:true  },
  brx:      { name:"Bodo",               nonLatin:true  },
  doi:      { name:"Dogri",              nonLatin:true  },
  gu:       { name:"Gujarati",           nonLatin:true  },
  hi:       { name:"Hindi",              nonLatin:true  },
  ks:       { name:"Kashmiri",           nonLatin:true  },
  kn:       { name:"Kannada",            nonLatin:true  },
  kok:      { name:"Konkani",            nonLatin:true  },
  mai:      { name:"Maithili",           nonLatin:true  },
  ml:       { name:"Malayalam",          nonLatin:true  },
  "mni-Mtei":{ name:"Manipuri (Meitei)", nonLatin:true  },
  mr:       { name:"Marathi",            nonLatin:true  },
  ne:       { name:"Nepali",             nonLatin:true  },
  or:       { name:"Odia (Oriya)",       nonLatin:true  },
  pa:       { name:"Punjabi",            nonLatin:true  },
  ta:       { name:"Tamil",              nonLatin:true  },
  te:       { name:"Telugu",             nonLatin:true  },
  sat:      { name:"Santali",            nonLatin:true  },
  sd:       { name:"Sindhi",             nonLatin:true  },
  ur:       { name:"Urdu",              nonLatin:true  },
  sa:       { name:"Sanskrit",           nonLatin:true  },
  // ── Popular Regional Languages ──
  bho:      { name:"Bhojpuri",           nonLatin:true  },
  mwr:      { name:"Marwari",            nonLatin:true  },
  tcy:      { name:"Tulu",              nonLatin:true  },
  lus:      { name:"Mizo (Lushai)",      nonLatin:false },
  // ── English ──
  en:       { name:"English",            nonLatin:false }
};

const LANG_NAMES = Object.fromEntries(Object.entries(LANG_CONFIG).map(([k,v])=>[k,v.name]));

function buildLangOptions(selectedVal="en") {
  return Object.entries(LANG_CONFIG).map(([code,cfg])=>
    `<option value="${code}"${code===selectedVal?" selected":""}>${cfg.name}</option>`
  ).join("");
}

function initLanguageSelects() {
  const defaults = {
    fromLang:"te", toLang:"ta",
    travelFromLang:"te", travelToLang:"ta",
    imgFromLang:"te", imgToLang:"en",
    convLangA:"te", convLangB:"ta"
  };
  Object.entries(defaults).forEach(([id,def])=>{
    const el=document.getElementById(id);
    if(el) el.innerHTML=buildLangOptions(def);
  });
}

// ── ROMANIZATION DETECTION & TRANSLITERATION ──────────
function isLikelyRomanized(text, fromLang) {
  if (!LANG_CONFIG[fromLang]?.nonLatin) return false;
  if (/[^\x00-\x7F]/.test(text)) return false;
  return text.trim().length >= 2 && /[a-zA-Z]/.test(text);
}

async function transliterateToNative(text, targetLang) {
  const url = `https://inputtools.google.com/request?text=${encodeURIComponent(text)}&itc=${targetLang}-t-i0-und&num=1&cp=0&cs=1&ie=utf-8&oe=utf-8&app=demopage`;
  try {
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
    const res = await fetch(proxyUrl, { signal:AbortSignal.timeout(6000) });
    if (res.ok) {
      const wrapper = await res.json();
      if (wrapper.contents) {
        const data = JSON.parse(wrapper.contents);
        if (data[0]==="SUCCESS" && data[1]) {
          return data[1].map(w=>(w[1]&&w[1][0])?w[1][0]:w[0]).join(" ");
        }
      }
    }
  } catch(e) { console.warn("Transliteration failed:", e); }
  return text;
}

async function prepareInputText(text, fromLang) {
  if (!isLikelyRomanized(text, fromLang)) return text;
  showToast(`Detected romanized ${LANG_NAMES[fromLang]}...`);
  const native = await transliterateToNative(text, fromLang);
  console.log(`Romanized "${text}" → "${native}"`);
  return native;
}

// ── TRANSLATION (FAST — 3 methods) ───────────────────
async function translateText(text, fromLang, toLang) {
  if (!text||!text.trim()) return "";
  const q = text.trim();
  if (fromLang===toLang) return q;
  const gtUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${fromLang}&tl=${toLang}&dt=t&q=${encodeURIComponent(q)}`;

  // Method 1: Direct (fastest)
  try {
    const res = await fetch(gtUrl, { signal:AbortSignal.timeout(5000) });
    if (res.ok) {
      const data = await res.json();
      if (data&&data[0]) { const t=data[0].filter(s=>s&&s[0]).map(s=>s[0]).join(""); if(t) return t; }
    }
  } catch(e) {}

  // Method 2: allorigins proxy
  try {
    const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(gtUrl)}`, { signal:AbortSignal.timeout(8000) });
    if (res.ok) {
      const w = await res.json();
      if (w.contents) { const data=JSON.parse(w.contents); if(data&&data[0]){ const t=data[0].filter(s=>s&&s[0]).map(s=>s[0]).join(""); if(t) return t; } }
    }
  } catch(e) {}

  // Method 3: Backend fallback
  try {
    const res = await fetch(`${API_URL}/translate`, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({text:q, from_lang:fromLang, to_lang:toLang}),
      signal:AbortSignal.timeout(20000)
    });
    if (res.ok) { const d=await res.json(); if(d.translated) return d.translated; }
  } catch(e) {}

  throw new Error("Translation failed. Please check your connection.");
}

// ── SPEAK helper (always fetches fresh audio for given text+lang) ─────────
async function fetchAudio(text, lang) {
  const res = await fetch(`${API_URL}/speak`, {
    method:"POST", headers:{"Content-Type":"application/json"},
    body:JSON.stringify({text, lang}),
    signal:AbortSignal.timeout(25000)
  });
  if (!res.ok) throw new Error(`speak ${res.status}`);
  return res.blob();
}

// ── GLOBAL AUDIO PLAYER ───────────────────────────────
let currentAudio=null, currentAudioBlob=null, currentPlayBtn=null, currentTimelineId=null;
let audioBlobA=null, audioBlobB=null, imgAudioBlob=null;

function stopAllAudio() {
  if (currentAudio) { currentAudio.pause(); currentAudio=null; }
  document.querySelectorAll('.ac-btn.ac-primary').forEach(btn=>{
    if (btn.dataset.playing==='true') { btn.dataset.playing='false'; btn.innerHTML=`<svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>Play`; }
  });
  document.querySelectorAll('.audio-timeline-wrap').forEach(el=>el.remove());
  document.querySelectorAll('.rc-text.rc-accent').forEach(el=>{
    if (el.dataset.originalText) { el.textContent=el.dataset.originalText; delete el.dataset.originalText; }
  });
}

function wrapTextIntoWords(textEl, containerId) {
  const text = textEl.dataset.originalText||textEl.textContent.trim();
  textEl.dataset.originalText = text;
  const words = text.split(/\s+/);
  textEl.innerHTML = words.map((w,i)=>`<span class="audio-word" data-idx="${i}" onclick="seekToWord(${i},${words.length},'${containerId}')">${w}</span>`).join(' ');
  return words;
}

function createAudioPlayer(blob, btnEl, translatedText, containerId, textElId) {
  if (currentAudio) { currentAudio.pause(); currentAudio=null; }
  document.querySelectorAll('.ac-btn.ac-primary').forEach(btn=>{
    if (btn!==btnEl&&btn.dataset.playing==='true') { btn.dataset.playing='false'; btn.innerHTML=`<svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>Play`; }
  });
  document.querySelectorAll('.audio-timeline-wrap').forEach(el=>{ if(el.id!=='timeline_'+containerId) el.remove(); });
  document.querySelectorAll('.rc-text.rc-accent').forEach(el=>{ if(el.id!==textElId&&el.dataset.originalText){ el.textContent=el.dataset.originalText; delete el.dataset.originalText; } });
  if (!blob) return;

  const audio = new Audio(URL.createObjectURL(blob));
  currentAudio=audio; currentAudioBlob=blob; currentPlayBtn=btnEl; currentTimelineId=containerId;
  btnEl.dataset.playing='true';
  btnEl.innerHTML=`<svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>Pause`;

  const textEl = document.getElementById(textElId);
  if (textEl&&!textEl.dataset.originalText) textEl.textContent=translatedText;
  const words = textEl ? wrapTextIntoWords(textEl,containerId) : translatedText.trim().split(/\s+/);

  let tw = document.getElementById('timeline_'+containerId);
  if (!tw) {
    tw=document.createElement('div'); tw.id='timeline_'+containerId; tw.className='audio-timeline-wrap';
    tw.innerHTML=`<div class="audio-timeline-bar"><div class="audio-progress" id="progress_${containerId}"></div><input type="range" class="audio-scrubber" id="scrubber_${containerId}" min="0" max="100" value="0" step="0.1"></div><div class="audio-time-row"><span class="audio-time" id="curTime_${containerId}">0:00</span><span class="audio-time" id="durTime_${containerId}">0:00</span></div>`;
    btnEl.closest('.result-card,.result-translated').appendChild(tw);
  }
  const scrubber=document.getElementById('scrubber_'+containerId);
  if (scrubber) scrubber.addEventListener('input',()=>{ if(audio.duration) audio.currentTime=(scrubber.value/100)*audio.duration; });
  audio.addEventListener('timeupdate',()=>{
    if (!audio.duration) return;
    const pct=(audio.currentTime/audio.duration)*100;
    const prog=document.getElementById('progress_'+containerId), scr=document.getElementById('scrubber_'+containerId), cur=document.getElementById('curTime_'+containerId);
    if(prog) prog.style.width=pct+'%'; if(scr) scr.value=pct; if(cur) cur.textContent=formatTime(audio.currentTime);
    const wIdx=Math.floor((audio.currentTime/audio.duration)*words.length);
    if(textEl) textEl.querySelectorAll('.audio-word').forEach((w,i)=>w.classList.toggle('active-word',i===wIdx));
  });
  audio.addEventListener('loadedmetadata',()=>{ const dur=document.getElementById('durTime_'+containerId); if(dur) dur.textContent=formatTime(audio.duration); });
  audio.addEventListener('ended',()=>{
    btnEl.dataset.playing='false'; btnEl.innerHTML=`<svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>Play`;
    const prog=document.getElementById('progress_'+containerId), scr=document.getElementById('scrubber_'+containerId);
    if(prog) prog.style.width='0%'; if(scr) scr.value=0;
    if(textEl) textEl.querySelectorAll('.audio-word').forEach(w=>w.classList.remove('active-word'));
    currentAudio=null;
  });
  audio.play();
}

window.seekToWord=function(idx,total,containerId){ if(currentAudio&&currentAudio.duration){ currentAudio.currentTime=(idx/total)*currentAudio.duration; if(currentAudio.paused) currentAudio.play(); } };

function toggleAudio(blob,btnEl,translatedText,containerId,textElId){
  if(currentAudio&&currentPlayBtn===btnEl){
    if(currentAudio.paused){ currentAudio.play(); btnEl.dataset.playing='true'; btnEl.innerHTML=`<svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>Pause`; }
    else { currentAudio.pause(); btnEl.dataset.playing='false'; btnEl.innerHTML=`<svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>Play`; }
  } else { createAudioPlayer(blob,btnEl,translatedText,containerId,textElId); }
}

function formatTime(s){ if(isNaN(s)) return '0:00'; const m=Math.floor(s/60),sec=Math.floor(s%60); return `${m}:${sec.toString().padStart(2,'0')}`; }

// ── THEME ─────────────────────────────────────────────
function toggleTheme(){
  isDarkMode=!isDarkMode;
  document.documentElement.setAttribute('data-theme',isDarkMode?'dark':'light');
  const icon=document.getElementById('themeIcon');
  if(isDarkMode) icon.innerHTML='<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
  else icon.innerHTML='<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
}

// ── INPUT MODE ────────────────────────────────────────
function switchInputMode(mode){
  document.getElementById('voiceModeBtn').classList.toggle('active',mode==='voice');
  document.getElementById('textModeBtn').classList.toggle('active',mode==='text');
  document.getElementById('voiceInput').style.display=mode==='voice'?'block':'none';
  document.getElementById('textInput').style.display=mode==='text'?'block':'none';
}

// ── TEXT TRANSLATE ────────────────────────────────────
async function translateTypedText(){
  const rawText=document.getElementById('textInputArea').value.trim(); if(!rawText) return;
  const fromLang=document.getElementById("fromLang").value;
  const text=await prepareInputText(rawText,fromLang);
  lastSpokenText=text; lastFromLang=fromLang;
  document.getElementById("originalText").textContent=text;
  document.getElementById("resultsSection").style.display="block";
  document.getElementById("translatedText").textContent="Translating...";
  await translateAndSpeak(text,fromLang);
}

// ── COPY ─────────────────────────────────────────────
function copyTranslation(){ const text=window._singleTranslatedText||document.getElementById("translatedText").dataset.originalText||document.getElementById("translatedText").textContent; if(text&&text!=="—"&&text!=="Translating...") navigator.clipboard.writeText(text).then(()=>showToast("Copied to clipboard")); }
function copyText(id){ const el=document.getElementById(id); const text=el.dataset.originalText||el.textContent; if(text&&text!=="—") navigator.clipboard.writeText(text).then(()=>showToast("Copied to clipboard")); }
function showToast(msg){ const t=document.getElementById("toast"); t.textContent=msg; t.classList.add("show"); setTimeout(()=>t.classList.remove("show"),2200); }

// ── MENU ─────────────────────────────────────────────
function toggleMenu(){ document.getElementById("sideMenu").classList.toggle("open"); document.getElementById("menuOverlay").classList.toggle("open"); document.body.style.overflow=document.getElementById("sideMenu").classList.contains("open")?"hidden":""; }
function closeMenu(){ document.getElementById("sideMenu").classList.remove("open"); document.getElementById("menuOverlay").classList.remove("open"); document.body.style.overflow=""; }
function navigateTo(page){
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  document.querySelectorAll(".menu-item").forEach(m=>m.classList.remove("active"));
  const pageEl=document.getElementById("page"+page); if(pageEl) pageEl.classList.add("active");
  const menuEl=document.getElementById("menu"+page); if(menuEl) menuEl.classList.add("active");
  closeMenu(); window.scrollTo({top:0,behavior:'smooth'});
  if(page==="Travel") loadTravelPhrases();
  if(page==="History") loadHistory();
  if(page==="Favourites") loadFavourites();
}

// ── SPEECH RECOGNITION ───────────────────────────────
const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
let recognition;
try{ recognition=new SpeechRecognition(); recognition.continuous=false; recognition.interimResults=false; }catch(e){}

// ── BUG FIX: toLang change — clear old audio blob, fetch fresh audio for NEW language ──
document.getElementById("toLang").addEventListener("change", async()=>{
  if (lastSpokenText) {
    stopAllAudio();
    // Clear old audio blobs so Play doesn't use stale Tamil/other language audio
    window._singleAudioBlob = null;
    window._singleTranslatedText = null;
    document.getElementById("translatedText").textContent="Translating...";
    document.getElementById("actionBtns").style.display="none";
    await translateAndSpeak(lastSpokenText, lastFromLang);
  }
});

document.getElementById("fromLang").addEventListener("change",async()=>{
  if(lastSpokenText){
    stopAllAudio();
    window._singleAudioBlob=null; window._singleTranslatedText=null;
    lastFromLang=document.getElementById("fromLang").value;
    document.getElementById("translatedText").textContent="Translating...";
    document.getElementById("actionBtns").style.display="none";
    await translateAndSpeak(lastSpokenText,lastFromLang);
  }
});

document.getElementById("imgToLang").addEventListener("change",async()=>{
  const el=document.getElementById('imgExtractedText');
  const extracted=el.dataset.originalText||el.textContent;
  if(extracted&&extracted!=="—"&&document.getElementById('imgResults').style.display!=='none'){
    stopAllAudio();
    // BUG FIX: Clear old imgAudioBlob so it doesn't play old language
    imgAudioBlob=null;
    document.getElementById('imgTranslatedText').textContent="Translating...";
    const fromLang=document.getElementById('imgFromLang').value, toLang=document.getElementById('imgToLang').value;
    try{
      const translated=await translateText(extracted,fromLang,toLang);
      const translatedEl=document.getElementById('imgTranslatedText');
      translatedEl.textContent=translated; delete translatedEl.dataset.originalText;
      window._imgTranslatedText=translated;
      // Fetch fresh audio for the new toLang
      imgAudioBlob=await fetchAudio(translated,toLang);
      const playBtn=document.querySelector('#imgActionBtns .ac-btn.ac-primary');
      if(playBtn){ const old=document.getElementById('timeline_img'); if(old) old.remove(); createAudioPlayer(imgAudioBlob,playBtn,translated,'img','imgTranslatedText'); }
    }catch{ document.getElementById('imgTranslatedText').textContent="Translation error"; }
  }
});

function startListening(){
  if(!recognition){ showToast("Speech recognition not supported"); return; }
  currentConvSpeaker=null;
  recognition.lang=document.getElementById("fromLang").value;
  document.getElementById("micBtn").classList.add("listening");
  document.getElementById("micStatus").textContent="Listening...";
  document.getElementById("originalText").textContent="—";
  document.getElementById("translatedText").textContent="—";
  document.getElementById("resultsSection").style.display="none";
  stopAllAudio(); recognition.start();
}
function startConvListening(person){
  if(!recognition) return;
  currentConvSpeaker=person;
  recognition.lang=document.getElementById(`convLang${person}`).value;
  document.getElementById(`micBtn${person}`).classList.add("listening");
  document.getElementById(`micStatus${person}`).textContent="Listening...";
  document.getElementById(`originalText${person}`).textContent="—";
  document.getElementById(`translatedText${person}`).textContent="—";
  document.getElementById(`playBtn${person}`).style.display="none";
  recognition.start();
}

if(recognition){
  recognition.onresult=async(event)=>{
    const spokenText=event.results[0][0].transcript;
    if(currentConvSpeaker){
      const person=currentConvSpeaker, other=person==='A'?'B':'A';
      const fromLang=document.getElementById(`convLang${person}`).value;
      const toLang=document.getElementById(`convLang${other}`).value;
      document.getElementById(`originalText${person}`).textContent=spokenText;
      document.getElementById(`micStatus${person}`).textContent="Translating...";
      document.getElementById(`micBtn${person}`).classList.remove("listening");
      await translateAndSpeakConv(spokenText,fromLang,toLang,person);
    } else {
      const fromLang=document.getElementById("fromLang").value;
      const text=await prepareInputText(spokenText,fromLang);
      lastSpokenText=text; lastFromLang=fromLang;
      document.getElementById("originalText").textContent=text;
      document.getElementById("micStatus").textContent="Translating...";
      document.getElementById("micBtn").classList.remove("listening");
      document.getElementById("resultsSection").style.display="block";
      document.getElementById("translatedText").textContent="Translating...";
      await translateAndSpeak(text,fromLang);
    }
  };
  recognition.onerror=()=>{
    if(currentConvSpeaker){ document.getElementById(`micStatus${currentConvSpeaker}`).textContent="Error. Try again."; document.getElementById(`micBtn${currentConvSpeaker}`).classList.remove("listening"); }
    else{ document.getElementById("micStatus").textContent="Error. Try again."; document.getElementById("micBtn").classList.remove("listening"); }
  };
}

// ── TRANSLATE + SPEAK (Single) ────────────────────────
async function translateAndSpeak(text,fromLang){
  const toLang=document.getElementById("toLang").value;
  try{
    const translated=await translateText(text,fromLang,toLang);
    window._singleTranslatedText=translated;
    const textEl=document.getElementById("translatedText");
    textEl.textContent=translated; delete textEl.dataset.originalText;

    // BUG FIX: Always fetch audio for the CURRENT toLang (not cached from previous lang)
    const blob=await fetchAudio(translated, toLang);
    document.getElementById("actionBtns").style.display="flex";
    window._singleAudioBlob=blob;
    document.getElementById("micStatus").textContent="Tap to speak";
    const old=document.getElementById('timeline_single'); if(old) old.remove();
    const btn=document.getElementById('playBtn'); if(btn) createAudioPlayer(blob,btn,translated,'single','translatedText');
    if(window.getCurrentUser&&window.getCurrentUser()) saveToHistory(text,translated,fromLang,toLang);
  }catch(err){
    document.getElementById("translatedText").textContent="—";
    document.getElementById("micStatus").textContent="Translation error. Check connection.";
  }
}
function playAudio(){ const blob=window._singleAudioBlob; const text=window._singleTranslatedText; const btn=document.getElementById('playBtn'); if(!blob||!btn) return; toggleAudio(blob,btn,text,'single','translatedText'); }

// ── TRANSLATE + SPEAK (Conversation) ─────────────────
async function translateAndSpeakConv(text,fromLang,toLang,person){
  try{
    const translated=await translateText(text,fromLang,toLang);
    const textEl=document.getElementById(`translatedText${person}`);
    textEl.textContent=translated; delete textEl.dataset.originalText;
    // BUG FIX: Use fetchAudio helper — always fetches for the correct toLang
    const blob=await fetchAudio(translated, toLang);
    if(person==='A') audioBlobA=blob; else audioBlobB=blob;
    window[`_convText${person}`]=translated;
    document.getElementById(`playBtn${person}`).style.display="flex";
    document.getElementById(`micStatus${person}`).textContent="Tap to speak";
    const btn=document.getElementById(`playBtn${person}`);
    const old=document.getElementById(`timeline_conv${person}`); if(old) old.remove();
    createAudioPlayer(blob,btn,translated,`conv${person}`,`translatedText${person}`);
  }catch{ document.getElementById(`micStatus${person}`).textContent="Error. Try again."; }
}
function playAudioA(){ const el=document.getElementById("translatedTextA"); const text=window._convTextA||el.dataset.originalText||el.textContent; const btn=document.getElementById('playBtnA'); if(!audioBlobA) return; toggleAudio(audioBlobA,btn,text,'convA','translatedTextA'); }
function playAudioB(){ const el=document.getElementById("translatedTextB"); const text=window._convTextB||el.dataset.originalText||el.textContent; const btn=document.getElementById('playBtnB'); if(!audioBlobB) return; toggleAudio(audioBlobB,btn,text,'convB','translatedTextB'); }

// ── SWAP ─────────────────────────────────────────────
function swapLanguages(){
  const f=document.getElementById("fromLang"),t=document.getElementById("toLang");
  [f.value,t.value]=[t.value,f.value];
  lastSpokenText=""; lastFromLang=""; stopAllAudio();
  window._singleAudioBlob=null; window._singleTranslatedText=null;
  document.getElementById("originalText").textContent="—";
  document.getElementById("translatedText").textContent="—";
  document.getElementById("resultsSection").style.display="none";
  const old=document.getElementById('timeline_single'); if(old) old.remove();
  showToast("Languages swapped");
}

// ── TRAVEL ────────────────────────────────────────────
const PHRASES={
  food:      [{en:"I am hungry"},{en:"Give me a menu please"},{en:"How much does this cost?"},{en:"This is delicious!"},{en:"I am vegetarian"},{en:"Water please"},{en:"The bill please"},{en:"No spicy food please"}],
  transport: [{en:"Where is the bus stop?"},{en:"How much is the ticket?"},{en:"Take me to this address"},{en:"Stop here please"},{en:"Is this the right train?"},{en:"Where is the airport?"},{en:"How far is it?"},{en:"Call a taxi please"}],
  hotel:     [{en:"I have a reservation"},{en:"What time is checkout?"},{en:"Can I get extra towels?"},{en:"The AC is not working"},{en:"Is breakfast included?"},{en:"I need a wake up call"},{en:"Where is the lift?"},{en:"Can I extend my stay?"}],
  emergency: [{en:"Help me please!"},{en:"Call the police"},{en:"I need a doctor"},{en:"I am lost"},{en:"Call an ambulance"},{en:"I have been robbed"},{en:"Where is the hospital?"},{en:"I am allergic to this"}],
  shopping:  [{en:"How much does this cost?"},{en:"Can you give a discount?"},{en:"Do you have a smaller size?"},{en:"I am just looking"},{en:"I will take this one"},{en:"Do you accept cards?"},{en:"Can I return this?"},{en:"Where is the trial room?"}]
};
function selectCategory(cat,btn){ currentCategory=cat; document.querySelectorAll(".cat-btn").forEach(b=>b.classList.remove("active")); btn.classList.add("active"); loadTravelPhrases(); }
async function loadTravelPhrases(){
  const fromLang=document.getElementById("travelFromLang").value, toLang=document.getElementById("travelToLang").value;
  const key=`${currentCategory}_${fromLang}_${toLang}`;
  document.getElementById("phrasesList").innerHTML=""; document.getElementById("travelLoading").style.display="flex";
  if(travelPhrasesCache[key]){ document.getElementById("travelLoading").style.display="none"; renderPhrases(travelPhrasesCache[key],fromLang,toLang); return; }
  try{
    const results=[];
    for(const phrase of PHRASES[currentCategory]){
      const[frT,toT]=await Promise.all([translateText(phrase.en,"en",fromLang),translateText(phrase.en,"en",toLang)]);
      results.push({en:phrase.en,from:frT,to:toT,toLang});
    }
    travelPhrasesCache[key]=results; document.getElementById("travelLoading").style.display="none"; renderPhrases(results,fromLang,toLang);
  }catch{ document.getElementById("travelLoading").style.display="none"; document.getElementById("phrasesList").innerHTML=`<div class="empty-state"><p class="es-sub">Could not load phrases. Check your connection.</p></div>`; }
}
function renderPhrases(results,fromLang,toLang){
  const list=document.getElementById("phrasesList"); list.innerHTML="";
  results.forEach((r,i)=>{ const card=document.createElement("div"); card.className="phrase-card"; card.innerHTML=`<div class="phrase-texts"><div class="phrase-orig">${LANG_NAMES[fromLang]}: ${r.from}</div><div class="phrase-trans">${LANG_NAMES[toLang]}: ${r.to}</div><div class="phrase-en">${r.en}</div></div><div class="phrase-btns"><button class="phrase-btn" onclick="copyPhraseText(${i})" title="Copy"><svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button><button class="phrase-btn phrase-play" onclick="playPhrase(${i})" title="Play"><svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg></button></div>`; list.appendChild(card); });
  window._phraseResults=results;
}
function copyPhraseText(i){ const p=window._phraseResults[i]; if(p) navigator.clipboard.writeText(p.to).then(()=>showToast("Copied")); }
async function playPhrase(i){ const p=window._phraseResults[i]; if(!p) return; try{ const blob=await fetchAudio(p.to,p.toLang); stopAllAudio(); new Audio(URL.createObjectURL(blob)).play(); }catch{ showToast("Could not play audio"); } }

// ── IMAGE TRANSLATION ─────────────────────────────────
let currentImageFile=null;
function handleDrop(e){ e.preventDefault(); document.getElementById('uploadArea').classList.remove('drag-over'); const f=e.dataTransfer.files[0]; if(f&&f.type.startsWith('image/')) processImageFile(f); }
function handleImageUpload(e){ const f=e.target.files[0]; if(f) processImageFile(f); }
function processImageFile(file){
  currentImageFile=file;
  const reader=new FileReader();
  reader.onload=(e)=>{ document.getElementById('imgPreview').src=e.target.result; document.getElementById('uploadArea').style.display='none'; document.getElementById('imgPreviewBox').style.display='block'; document.getElementById('imgTranslateBtn').style.display='flex'; document.getElementById('imgResults').style.display='none'; document.getElementById('imgStatus').textContent=''; imgAudioBlob=null; stopAllAudio(); const old=document.getElementById('timeline_img'); if(old) old.remove(); };
  reader.readAsDataURL(file);
}
const BTN_READY_HTML=`<svg viewBox="0 0 24 24" style="width:16px;height:16px;stroke:white;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>Extract & Translate`;
async function translateImage(){
  if(!currentImageFile){ showToast("Please upload an image first"); return; }
  const fromLang=document.getElementById('imgFromLang').value, toLang=document.getElementById('imgToLang').value;
  const btn=document.getElementById('imgTranslateBtn'), statusEl=document.getElementById('imgStatus');
  btn.disabled=true; btn.textContent='Reading image...'; statusEl.textContent='Extracting text from image...';
  document.getElementById('imgResults').style.display='none'; stopAllAudio();
  const old=document.getElementById('timeline_img'); if(old) old.remove(); imgAudioBlob=null;
  try{
    const tessLangs={en:'eng',hi:'hin',te:'tel',ta:'tam',kn:'kan',ml:'mal',bn:'ben',mr:'mar',gu:'guj',pa:'pan',ur:'urd',or:'ori',as:'asm',ne:'nep',sa:'san',sd:'snd',ks:'kas',mai:'mai',doi:'doi',brx:'brx'};
    const ocrLang=tessLangs[fromLang]||'eng';
    statusEl.textContent='Loading OCR engine... (first time may take 30s)'; btn.textContent='Loading OCR...';
    const{createWorker}=Tesseract;
    const worker=await createWorker(ocrLang,1,{logger:m=>{ if(m.status==='recognizing text') statusEl.textContent=`Reading text... ${Math.round((m.progress||0)*100)}%`; else if(m.status) statusEl.textContent=m.status.charAt(0).toUpperCase()+m.status.slice(1)+'...'; }});
    btn.textContent='Extracting text...';
    const{data:{text}}=await worker.recognize(currentImageFile); await worker.terminate();
    const extracted=text.trim();
    if(!extracted||extracted.length<2){ statusEl.textContent='No text found. Try a clearer image.'; btn.disabled=false; btn.innerHTML=BTN_READY_HTML; return; }
    const extractedEl=document.getElementById('imgExtractedText'); extractedEl.textContent=extracted; delete extractedEl.dataset.originalText;
    statusEl.textContent='Translating...'; btn.textContent='Translating...';
    const translated=await translateText(extracted,fromLang,toLang);
    const translatedEl=document.getElementById('imgTranslatedText'); translatedEl.textContent=translated; delete translatedEl.dataset.originalText; window._imgTranslatedText=translated;
    btn.textContent='Generating audio...'; statusEl.textContent='Generating audio...';
    try{ imgAudioBlob=await fetchAudio(translated,toLang); }
    catch{ imgAudioBlob=null; statusEl.textContent='Done (audio unavailable — try Play in a moment)'; }
    document.getElementById('imgResults').style.display='block';
    if(imgAudioBlob){ statusEl.textContent='Done ✓'; const playBtn=document.querySelector('#imgActionBtns .ac-btn.ac-primary'); if(playBtn) createAudioPlayer(imgAudioBlob,playBtn,translated,'img','imgTranslatedText'); }
  }catch(err){ console.error(err); statusEl.textContent='Error: '+(err.message||'Something went wrong. Try again.'); }
  btn.disabled=false; btn.innerHTML=BTN_READY_HTML;
}
function playImgAudio(){
  const blob=imgAudioBlob, el=document.getElementById('imgTranslatedText');
  const text=window._imgTranslatedText||el.dataset.originalText||el.textContent;
  const btn=document.querySelector('#imgActionBtns .ac-btn.ac-primary');
  if(!blob||!btn){
    if(window._imgTranslatedText){ const toLang=document.getElementById('imgToLang').value; showToast("Generating audio..."); fetchAudio(window._imgTranslatedText,toLang).then(b=>{ imgAudioBlob=b; if(btn) toggleAudio(b,btn,window._imgTranslatedText,'img','imgTranslatedText'); }).catch(()=>showToast("Audio unavailable.")); }
    return;
  }
  toggleAudio(blob,btn,text,'img','imgTranslatedText');
}

// ── SAVE TO FAVOURITES (safe) ─────────────────────────
window.saveSingleToFavourites=function(){
  const original=document.getElementById('originalText').textContent;
  const translated=window._singleTranslatedText||document.getElementById('translatedText').dataset.originalText||document.getElementById('translatedText').textContent;
  const fromLang=document.getElementById('fromLang').value, toLang=document.getElementById('toLang').value;
  if(!original||original==='—'){ showToast("Nothing to save"); return; }
  if(!translated||translated==='—'||translated==='Translating...'){ showToast("Wait for translation to complete"); return; }
  if(window.saveToFavourites) window.saveToFavourites(original,translated,fromLang,toLang);
};

// ── INIT ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded',()=>{ initLanguageSelects(); });
