from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from gtts import gTTS
from gtts.lang import tts_langs
from deep_translator import GoogleTranslator
import pytesseract
from PIL import Image
import io, os, re

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Languages gTTS actually supports ─────────────────
GTTS_SUPPORTED = set(tts_langs().keys())

# Fallback map: if a language isn't in gTTS, use the closest supported one
# This way audio ALWAYS works — it reads in the closest language
AUDIO_FALLBACK = {
    "or":       "hi",   # Odia → Hindi (both Devanagari-family)
    "as":       "bn",   # Assamese → Bengali (nearly identical script)
    "sa":       "hi",   # Sanskrit → Hindi
    "sd":       "ur",   # Sindhi → Urdu (similar script)
    "ks":       "ur",   # Kashmiri → Urdu
    "mai":      "hi",   # Maithili → Hindi
    "doi":      "hi",   # Dogri → Hindi
    "brx":      "hi",   # Bodo → Hindi
    "kok":      "mr",   # Konkani → Marathi (linguistically close)
    "mni-Mtei": "bn",   # Manipuri → Bengali
    "sat":      "hi",   # Santali → Hindi
    "bho":      "hi",   # Bhojpuri → Hindi
    "mwr":      "hi",   # Marwari → Hindi
    "tcy":      "kn",   # Tulu → Kannada (same region/script family)
    "lus":      "en",   # Mizo → English (Latin script)
}

def get_tts_lang(lang_code: str) -> str:
    """Return a valid gTTS lang code, with fallback if not directly supported."""
    if lang_code in GTTS_SUPPORTED:
        return lang_code
    return AUDIO_FALLBACK.get(lang_code, "en")

# ── ROUTE 1: Translate text ───────────────────────────
@app.post("/translate")
async def translate_text(data: dict):
    text = data["text"]
    src  = data["from_lang"]
    dest = data["to_lang"]
    translator = GoogleTranslator(source=src, target=dest)
    chunks = split_text(text, max_len=4500)
    translated_parts = [translator.translate(chunk) for chunk in chunks]
    return {"translated": " ".join(translated_parts)}

def split_text(text, max_len=4500):
    sentences = re.split(r'(?<=[।.!?\n])\s*', text)
    chunks, current = [], ""
    for s in sentences:
        s = s.strip()
        if not s: continue
        if len(current) + len(s) + 1 > max_len and current:
            chunks.append(current.strip()); current = s
        else:
            current = (current + " " + s).strip()
    if current: chunks.append(current)
    return chunks or [text]

# ── ROUTE 2: Text to Speech ───────────────────────────
@app.post("/speak")
async def speak(data: dict):
    text      = data["text"]
    lang_req  = data["lang"]
    tts_lang  = get_tts_lang(lang_req)      # resolve fallback if needed
    tts = gTTS(text=text, lang=tts_lang)
    filepath = "output.mp3"
    tts.save(filepath)
    # Tell the client which language was actually used (for transparency)
    response = FileResponse(filepath, media_type="audio/mpeg")
    response.headers["X-TTS-Lang-Used"] = tts_lang
    response.headers["X-TTS-Lang-Requested"] = lang_req
    return response

# ── ROUTE 3: Image OCR + Translate ───────────────────
TESS_LANG_MAP = {
    "te":"tel", "ta":"tam", "hi":"hin", "kn":"kan", "ml":"mal",
    "mr":"mar", "bn":"ben", "gu":"guj", "pa":"pan", "ur":"urd",
    "or":"ori", "as":"asm", "ne":"nep", "sa":"san", "sd":"snd",
    "ks":"kas", "mai":"mai", "doi":"dgo", "brx":"brx", "en":"eng",
}

@app.post("/image-translate")
async def image_translate(
    file: UploadFile = File(...),
    from_lang: str = Form(...),
    to_lang: str = Form(...)
):
    contents = await file.read()
    image = Image.open(io.BytesIO(contents))
    tess_lang = TESS_LANG_MAP.get(from_lang, "eng")
    try:
        extracted_text = pytesseract.image_to_string(image, lang=tess_lang)
    except Exception:
        extracted_text = pytesseract.image_to_string(image, lang="eng")
    extracted_text = extracted_text.strip()
    if not extracted_text:
        return {"extracted": "", "translated": "No text found in the image."}
    translator = GoogleTranslator(source=from_lang, target=to_lang)
    chunks = split_text(extracted_text, max_len=4500)
    translated_parts = [translator.translate(chunk) for chunk in chunks]
    translated_text = " ".join(translated_parts)
    return {"extracted": extracted_text, "translated": translated_text}

# ── ROUTE 4: Keep-alive ───────────────────────────────
@app.get("/ping")
def ping():
    return {"status": "alive"}

# ── ROUTE 5: Check which langs have native TTS ────────
@app.get("/tts-langs")
def get_tts_langs():
    """Frontend can call this to know which langs have native vs fallback TTS."""
    return {"supported": list(GTTS_SUPPORTED), "fallbacks": AUDIO_FALLBACK}

@app.get("/")
def home():
    return {"status": "Vaani API is running!"}
