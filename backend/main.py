from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from gtts import gTTS
from deep_translator import GoogleTranslator
import os

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

    # deep_translator's GoogleTranslator is maintained, reliable,
    # supports all Indian language pairs (te->ta, hi->kn, etc.)
    translator = GoogleTranslator(source=src, target=dest)

    # Split into chunks of max 4500 chars (deep_translator limit)
    chunks = split_text(text, max_len=4500)
    translated_parts = [translator.translate(chunk) for chunk in chunks]
    return {"translated": " ".join(translated_parts)}


def split_text(text, max_len=4500):
    """Split text into chunks at sentence boundaries."""
    import re
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


# ── TEST ROUTE ───────────────────────────────────────
@app.get("/")
def home():
    return {"status": "Vaani API is running!"}
