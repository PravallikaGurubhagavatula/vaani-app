const API_URL = "https://vaani-app-ui0z.onrender.com";

let lastSpokenText = "", lastFromLang = "";
let currentConvSpeaker = null;
let currentCategory = "food";
let travelPhrasesCache = {};
let isDarkMode = true;

let isListening=false;

// SPEECH LANGUAGE MAP
const SPEECH_LANG_MAP={
en:"en-IN",
hi:"hi-IN",
te:"te-IN",
ta:"ta-IN",
kn:"kn-IN",
ml:"ml-IN",
mr:"mr-IN",
bn:"bn-IN",
gu:"gu-IN",
pa:"pa-IN",
ur:"ur-IN",
ne:"ne-NP",
as:"as-IN"
}

// KEEP ALIVE
function pingBackend(){
fetch(`${API_URL}/ping`)
.catch(()=>{})
}

pingBackend()
setInterval(pingBackend,600000)


// LANGUAGE CONFIG
const LANG_CONFIG={
as:{name:"Assamese",nonLatin:true},
bn:{name:"Bengali",nonLatin:true},
brx:{name:"Bodo",nonLatin:true},
doi:{name:"Dogri",nonLatin:true},
gu:{name:"Gujarati",nonLatin:true},
hi:{name:"Hindi",nonLatin:true},
ks:{name:"Kashmiri",nonLatin:true},
kn:{name:"Kannada",nonLatin:true},
kok:{name:"Konkani",nonLatin:true},
mai:{name:"Maithili",nonLatin:true},
ml:{name:"Malayalam",nonLatin:true},
mni:{name:"Manipuri",nonLatin:true},
mr:{name:"Marathi",nonLatin:true},
ne:{name:"Nepali",nonLatin:true},
or:{name:"Odia",nonLatin:true},
pa:{name:"Punjabi",nonLatin:true},
ta:{name:"Tamil",nonLatin:true},
te:{name:"Telugu",nonLatin:true},
sat:{name:"Santali",nonLatin:true},
sd:{name:"Sindhi",nonLatin:true},
ur:{name:"Urdu",nonLatin:true},
sa:{name:"Sanskrit",nonLatin:true},
bho:{name:"Bhojpuri",nonLatin:true},
mwr:{name:"Marwari",nonLatin:true},
tcy:{name:"Tulu",nonLatin:true},
lus:{name:"Mizo",nonLatin:false},
en:{name:"English",nonLatin:false}
}

const LANG_NAMES=Object.fromEntries(Object.entries(LANG_CONFIG).map(([k,v])=>[k,v.name]))


// BUILD OPTIONS
function buildLangOptions(selectedVal="en"){
return Object.entries(LANG_CONFIG)
.map(([code,cfg])=>`<option value="${code}"${code===selectedVal?" selected":""}>${cfg.name}</option>`)
.join("")
}

function initLanguageSelects(){

const defaults={
fromLang:"te",
toLang:"ta"
}

Object.entries(defaults).forEach(([id,val])=>{
const el=document.getElementById(id)
if(el) el.innerHTML=buildLangOptions(val)
})
}



// TRANSLATE (backend first)
async function translateText(text,fromLang,toLang){

if(!text.trim()) return ""

const res=await fetch(`${API_URL}/translate`,{
method:"POST",
headers:{"Content-Type":"application/json"},
body:JSON.stringify({
text:text,
from_lang:fromLang,
to_lang:toLang
})
})

const data=await res.json()

if(data.translated) return data.translated

throw new Error("Translation failed")
}



// AUDIO
async function fetchAudio(text,lang){

try{

const res=await fetch(`${API_URL}/speak`,{
method:"POST",
headers:{"Content-Type":"application/json"},
body:JSON.stringify({text,lang})
})

if(!res.ok) return null

return await res.blob()

}catch{
return null
}

}



// SPEECH RECOGNITION
const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition

let recognition

try{

recognition=new SpeechRecognition()

recognition.continuous=true
recognition.interimResults=true
recognition.maxAlternatives=3

}catch(e){}



// MIC TOGGLE
function startListening(){

if(!recognition){
alert("Speech recognition not supported")
return
}

if(isListening){

recognition.stop()

document.getElementById("micBtn").classList.remove("listening")
document.getElementById("micStatus").textContent="Tap to speak"

isListening=false
return
}

const lang=document.getElementById("fromLang").value

recognition.lang=SPEECH_LANG_MAP[lang]||"en-IN"

document.getElementById("micBtn").classList.add("listening")
document.getElementById("micStatus").textContent="Listening..."

recognition.start()

isListening=true
}



// RESULT
if(recognition){

recognition.onresult=async(event)=>{

let transcript=""

for(let i=event.resultIndex;i<event.results.length;i++){

if(event.results[i].isFinal){

transcript+=event.results[i][0].transcript

}

}

if(!transcript) return

const fromLang=document.getElementById("fromLang").value

lastSpokenText=transcript
lastFromLang=fromLang

document.getElementById("originalText").textContent=transcript

document.getElementById("micStatus").textContent="Translating..."

const translated=await translateText(transcript,fromLang,document.getElementById("toLang").value)

document.getElementById("translatedText").textContent=translated

const blob=await fetchAudio(translated,document.getElementById("toLang").value)

if(blob){

new Audio(URL.createObjectURL(blob)).play()

}

document.getElementById("micStatus").textContent="Tap to speak"

}

}



// PAGE REFRESH FIX
window.addEventListener("load",()=>{

const page=location.hash.replace("#","")||"Home"

navigateTo(page)

})



function navigateTo(page){

location.hash=page

document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"))

const el=document.getElementById("page"+page)

if(el) el.classList.add("active")

}



// INIT
document.addEventListener("DOMContentLoaded",()=>{

initLanguageSelects()

})
