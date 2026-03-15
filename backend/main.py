from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from gtts import gTTS
from gtts.lang import tts_langs
from deep_translator import GoogleTranslator
import pytesseract
from PIL import Image
import requests, io, os, re, json

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── gTTS supported codes ──────────────────────────────
GTTS_SUPPORTED = set(tts_langs().keys())

# ── deep_translator code mapping ─────────────────────
# Some codes differ between what we use internally and what deep_translator expects
DEEP_TRANS_MAP = {
    "kok": "gom",        # Konkani → deep_translator uses 'gom'
    "mni-Mtei": "mni-Mtei",  # Manipuri — works in deep_translator
}

# Languages NOT supported by deep_translator at all — use direct gtx requests
# (These are supported by Google Translate web but not by deep_translator library)
DEEP_TRANS_UNSUPPORTED = {"ks", "brx", "sat", "mwr", "tcy"}

# ── Audio fallback map ────────────────────────────────
AUDIO_FALLBACK = {
    "or": "hi", "as": "bn", "sa": "hi", "sd": "ur", "ks": "ur",
    "mai": "hi", "doi": "hi", "brx": "hi", "kok": "mr", "gom": "mr",
    "mni-Mtei": "bn", "sat": "en", "bho": "hi", "mwr": "hi",
    "tcy": "kn", "lus": "en",
}

def get_tts_lang(lang_code: str) -> str:
    if lang_code in GTTS_SUPPORTED:
        return lang_code
    return AUDIO_FALLBACK.get(lang_code, "en")

# ── Direct Google Translate (bypasses deep_translator) ──
# Uses the same gtx endpoint as the frontend, but from server side
# This works for ALL languages Google Translate supports
def gtx_translate(text: str, src: str, dest: str) -> str:
    """Call Google Translate gtx API directly via requests."""
    url = "https://translate.googleapis.com/translate_a/single"
    params = {
        "client": "gtx",
        "sl": src,
        "tl": dest,
        "dt": "t",
        "q": text
    }
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    }
    resp = requests.get(url, params=params, headers=headers, timeout=15)
    resp.raise_for_status()
    data = resp.json()
    if data and data[0]:
        return "".join(seg[0] for seg in data[0] if seg and seg[0])
    raise ValueError("Empty translation response")

def translate_chunk(text: str, src: str, dest: str) -> str:
    """Translate a single chunk with best available method."""
    # Map internal codes to deep_translator codes
    dt_src  = DEEP_TRANS_MAP.get(src, src)
    dt_dest = DEEP_TRANS_MAP.get(dest, dest)

    use_direct = (src in DEEP_TRANS_UNSUPPORTED or dest in DEEP_TRANS_UNSUPPORTED)

    if not use_direct:
        # Try deep_translator first (more reliable for supported langs)
        try:
            translator = GoogleTranslator(source=dt_src, target=dt_dest)
            result = translator.translate(text)
            if result and result.strip():
                return result
        except Exception as e:
            print(f"deep_translator failed ({src}→{dest}): {e}, trying direct gtx")

    # Fallback / primary for unsupported langs: direct gtx API
    try:
        result = gtx_translate(text, src, dest)
        if result and result.strip():
            return result
    except Exception as e:
        print(f"gtx direct failed ({src}→{dest}): {e}")

    # Last resort: auto-detect source
    try:
        result = gtx_translate(text, "auto", dest)
        if result and result.strip():
            return result
    except Exception as e:
        print(f"gtx auto failed: {e}")

    raise ValueError(f"All translation methods failed for {src}→{dest}")

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

# ── ROUTE 1: Translate ────────────────────────────────
@app.post("/translate")
async def translate_text(data: dict):
    text = data["text"]
    src  = data["from_lang"]
    dest = data["to_lang"]
    try:
        chunks = split_text(text, max_len=4500)
        translated_parts = [translate_chunk(chunk, src, dest) for chunk in chunks]
        return {"translated": " ".join(translated_parts)}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e), "translated": ""})

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
        try:
            tts = gTTS(text=text, lang="en")
            tts.save("output.mp3")
            response = FileResponse("output.mp3", media_type="audio/mpeg")
            response.headers["X-TTS-Lang-Used"] = "en"
            return response
        except Exception as e2:
            return JSONResponse(status_code=500, content={"error": str(e2)})

# ── ROUTE 3: Image OCR + Translate ───────────────────
TESS_LANG_MAP = {
    "te":"tel","ta":"tam","hi":"hin","kn":"kan","ml":"mal",
    "mr":"mar","bn":"ben","gu":"guj","pa":"pan","ur":"urd",
    "or":"ori","as":"asm","ne":"nep","sa":"san","sd":"snd",
    "en":"eng",
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
    try:
        chunks = split_text(extracted_text, max_len=4500)
        translated_parts = [translate_chunk(chunk, from_lang, to_lang) for chunk in chunks]
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
