from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from gtts import gTTS
from deep_translator import GoogleTranslator
import pytesseract
from PIL import Image
import io
import os
import re

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

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
    """Split text into chunks at sentence boundaries."""
    sentences = re.split(r'(?<=[।.!?\n])\s*', text)
    chunks, current = [], ""
    for s in sentences:
        s = s.strip()
        if not s:
            continue
        if len(current) + len(s) + 1 > max_len and current:
            chunks.append(current.strip())
            current = s
        else:
            current = (current + " " + s).strip()
    if current:
        chunks.append(current)
    return chunks or [text]


# ── ROUTE 2: Text to Speech ──────────────────────────
@app.post("/speak")
async def speak(data: dict):
    text = data["text"]
    lang = data["lang"]

    tts = gTTS(text=text, lang=lang)
    filepath = "output.mp3"
    tts.save(filepath)
    return FileResponse(filepath, media_type="audio/mpeg")


# ── ROUTE 3: Image OCR + Translate ───────────────────
# Tesseract language code map for Indian languages
TESS_LANG_MAP = {
    "te": "tel",      # Telugu
    "ta": "tam",      # Tamil
    "hi": "hin",      # Hindi
    "kn": "kan",      # Kannada
    "ml": "mal",      # Malayalam
    "mr": "mar",      # Marathi
    "bn": "ben",      # Bengali
    "gu": "guj",      # Gujarati
    "pa": "pan",      # Punjabi
    "ur": "urd",      # Urdu
    "en": "eng",      # English
}

@app.post("/image-translate")
async def image_translate(
    file: UploadFile = File(...),
    from_lang: str = Form(...),
    to_lang: str = Form(...)
):
    # Read the uploaded image
    contents = await file.read()
    image = Image.open(io.BytesIO(contents))

    # Get tesseract language code
    tess_lang = TESS_LANG_MAP.get(from_lang, "eng")

    # OCR: extract text from image
    try:
        extracted_text = pytesseract.image_to_string(image, lang=tess_lang)
    except Exception:
        # Fallback to English OCR if language pack not available
        extracted_text = pytesseract.image_to_string(image, lang="eng")

    extracted_text = extracted_text.strip()

    if not extracted_text:
        return {"extracted": "", "translated": "No text found in the image."}

    # Translate the extracted text
    translator = GoogleTranslator(source=from_lang, target=to_lang)
    chunks = split_text(extracted_text, max_len=4500)
    translated_parts = [translator.translate(chunk) for chunk in chunks]
    translated_text = " ".join(translated_parts)

    return {
        "extracted": extracted_text,
        "translated": translated_text
    }


# ── ROUTE 4: Keep-alive ping (prevents Render sleep) ─
@app.get("/ping")
def ping():
    return {"status": "alive"}


# ── TEST ROUTE ───────────────────────────────────────
@app.get("/")
def home():
    return {"status": "Vaani API is running!"}
