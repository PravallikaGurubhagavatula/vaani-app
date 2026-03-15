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

# ── gTTS supported language codes ────────────────────
GTTS_SUPPORTED = set(tts_langs().keys())

# ── Language code normalization ───────────────────────
# Some codes used internally differ from what APIs expect
# deep_translator GoogleTranslator code map
DEEP_TRANSLATOR_CODE = {
    "mni-Mtei": "mni-Mtei",  # Manipuri - deep_translator supports this
    "sat":      "sat",        # Santali
    "brx":      "brx",        # Bodo
    "ks":       "ks",         # Kashmiri
    "doi":      "doi",        # Dogri
    "kok":      "gom",        # Konkani - deep_translator uses "gom"
    "mai":      "mai",        # Maithili
    "lus":      "lus",        # Mizo
    "mwr":      "mwr",        # Marwari
    "bho":      "bho",        # Bhojpuri
    "tcy":      "tcy",        # Tulu
    "or":       "or",         # Odia
}

# ── Audio fallback: if gTTS can't handle a lang, use closest ─
# Languages with Ol Chiki or unusual scripts get English fallback
# to avoid garbled audio
AUDIO_FALLBACK = {
    "or":       "hi",   # Odia → Hindi
    "as":       "bn",   # Assamese → Bengali (nearly identical script)
    "sa":       "hi",   # Sanskrit → Hindi
    "sd":       "ur",   # Sindhi → Urdu
    "ks":       "ur",   # Kashmiri → Urdu
    "mai":      "hi",   # Maithili → Hindi
    "doi":      "hi",   # Dogri → Hindi
    "brx":      "hi",   # Bodo → Hindi
    "kok":      "mr",   # Konkani → Marathi
    "gom":      "mr",   # Konkani alt code → Marathi
    "mni-Mtei": "bn",   # Manipuri Meitei script → Bengali (similar script family)
    "sat":      "en",   # Santali Ol Chiki script → English (Ol Chiki unreadable by any TTS)
    "bho":      "hi",   # Bhojpuri → Hindi
    "mwr":      "hi",   # Marwari → Hindi
    "tcy":      "kn",   # Tulu → Kannada
    "lus":      "en",   # Mizo → English (Latin script)
}

def get_tts_lang(lang_code: str) -> str:
    if lang_code in GTTS_SUPPORTED:
        return lang_code
    return AUDIO_FALLBACK.get(lang_code, "en")

def get_translator_code(lang_code: str) -> str:
    """Return the code deep_translator expects for a given language."""
    return DEEP_TRANSLATOR_CODE.get(lang_code, lang_code)

# ── ROUTE 1: Translate text ───────────────────────────
@app.post("/translate")
async def translate_text(data: dict):
    text     = data["text"]
    src_raw  = data["from_lang"]
    dest_raw = data["to_lang"]

    src  = get_translator_code(src_raw)
    dest = get_translator_code(dest_raw)

    try:
        translator = GoogleTranslator(source=src, target=dest)
        chunks = split_text(text, max_len=4500)
        translated_parts = [translator.translate(chunk) for chunk in chunks]
        return {"translated": " ".join(translated_parts)}
    except Exception as e:
        # Try with "auto" source as fallback for tricky language codes
        try:
            translator = GoogleTranslator(source="auto", target=dest)
            chunks = split_text(text, max_len=4500)
            translated_parts = [translator.translate(chunk) for chunk in chunks]
            return {"translated": " ".join(translated_parts)}
        except Exception as e2:
            return {"error": str(e2), "translated": ""}

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
    text     = data["text"]
    lang_req = data["lang"]
    tts_lang = get_tts_lang(lang_req)
    try:
        tts = gTTS(text=text, lang=tts_lang)
        filepath = "output.mp3"
        tts.save(filepath)
        response = FileResponse(filepath, media_type="audio/mpeg")
        response.headers["X-TTS-Lang-Used"]      = tts_lang
        response.headers["X-TTS-Lang-Requested"] = lang_req
        return response
    except Exception as e:
        # Last resort: try English
        try:
            tts = gTTS(text=text, lang="en")
            filepath = "output.mp3"
            tts.save(filepath)
            response = FileResponse(filepath, media_type="audio/mpeg")
            response.headers["X-TTS-Lang-Used"]      = "en"
            response.headers["X-TTS-Lang-Requested"] = lang_req
            return response
        except Exception as e2:
            return JSONResponse(status_code=500, content={"error": str(e2)})

# ── ROUTE 3: Image OCR + Translate ───────────────────
TESS_LANG_MAP = {
    "te":"tel","ta":"tam","hi":"hin","kn":"kan","ml":"mal",
    "mr":"mar","bn":"ben","gu":"guj","pa":"pan","ur":"urd",
    "or":"ori","as":"asm","ne":"nep","sa":"san","sd":"snd",
    "ks":"kas","mai":"mai","doi":"eng","brx":"eng",
    "kok":"mar","mni-Mtei":"eng","sat":"eng","en":"eng",
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

    dest = get_translator_code(to_lang)
    src  = get_translator_code(from_lang)
    try:
        translator = GoogleTranslator(source=src, target=dest)
        chunks = split_text(extracted_text, max_len=4500)
        translated_parts = [translator.translate(chunk) for chunk in chunks]
        return {"extracted": extracted_text, "translated": " ".join(translated_parts)}
    except Exception:
        try:
            translator = GoogleTranslator(source="auto", target=dest)
            chunks = split_text(extracted_text, max_len=4500)
            translated_parts = [translator.translate(chunk) for chunk in chunks]
            return {"extracted": extracted_text, "translated": " ".join(translated_parts)}
        except Exception as e:
            return {"extracted": extracted_text, "translated": f"Translation error: {e}"}

# ── ROUTE 4: Keep-alive ───────────────────────────────
@app.get("/ping")
def ping():
    return {"status": "alive"}

@app.get("/")
def home():
    return {"status": "Vaani API is running!"}
