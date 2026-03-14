from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from googletrans import Translator
from gtts import gTTS
import os

app = FastAPI()

# This allows your frontend to talk to backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

translator = Translator()

# ── ROUTE 1: Translate text ──────────────────────────
@app.post("/translate")
async def translate_text(data: dict):
    text = data["text"]
    src  = data["from_lang"]   # e.g. "te" for Telugu
    dest = data["to_lang"]     # e.g. "ta" for Tamil

    result = translator.translate(text, src=src, dest=dest)
    return {"translated": result.text}

# ── ROUTE 2: Text to Speech ──────────────────────────
@app.post("/speak")
async def speak(data: dict):
    text = data["text"]
    lang = data["lang"]        # e.g. "ta" for Tamil

    tts = gTTS(text=text, lang=lang)
    filepath = "output.mp3"
    tts.save(filepath)
    return FileResponse(filepath, media_type="audio/mpeg")

# ── TEST ROUTE: Check if server is alive ─────────────
@app.get("/")
def home():
    return {"status": "Vaani API is running!"}
    