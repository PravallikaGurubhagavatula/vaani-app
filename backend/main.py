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

# ── Comprehensive TTS fallback map ───────────────────
# Maps language code → best available TTS voice
TTS_FALLBACK = {
    # Odia → Hindi (closest family)
    "or": "hi",
    # Assamese → Bengali (same script, close family)
    "as": "bn",
    # Sanskrit → Hindi (Devanagari, close)
    "sa": "hi",
    # Sindhi → Urdu (Arabic script, similar)
    "sd": "ur",
    # Kashmiri → Urdu
    "ks": "ur",
    # Maithili → Hindi
    "mai": "hi",
    # Dogri → Hindi
    "doi": "hi",
    # Bodo → Hindi (Devanagari script)
    "brx": "hi",
    # Konkani → Marathi (same script, close)
    "kok": "mr",
    "gom": "mr",
    # Manipuri → Bengali
    "mni-Mtei": "bn",
    # Santali → Bengali
    "sat": "bn",
    # Bhojpuri → Hindi
    "bho": "hi",
    # Marwari → Hindi
    "mwr": "hi",
    # Tulu → Kannada (same script region)
    "tcy": "kn",
    # Mizo → English
    "lus": "en",
    # Awadhi → Hindi
    "awa": "hi",
    # Magahi → Hindi
    "mag": "hi",
    # Chhattisgarhi → Hindi
    "hne": "hi",
    # Haryanvi → Hindi
    "bgc": "hi",
    # Rajasthani → Hindi
    "raj": "hi",
    # Khasi → English
    "kha": "en",
    # Lepcha → Nepali
    "lep": "ne",
    # Kokborok → Bengali
    "trp": "bn",
    # Lambadi → Telugu
    "lmn": "te",
    # Gondi → Hindi
    "gon": "hi",
    # Halbi → Hindi
    "hlb": "hi",
    # Kurukh → Hindi
    "kru": "hi",
    # Ho → Bengali
    "hoc": "bn",
    # Mundari → Bengali
    "unr": "bn",
    # Garhwali → Hindi
    "gbm": "hi",
    # Kumaoni → Hindi
    "kfy": "hi",
    # Angika → Hindi
    "anp": "hi",
    # Bundeli → Hindi
    "bns": "hi",
    # Bhili → Gujarati
    "bhb": "gu",
    # Kutchi → Gujarati
    "kfr": "gu",
    # Pahari → Hindi
    "him": "hi",
    # Kangri → Hindi
    "xnr": "hi",
    # Karbi → Assamese
    "ajz": "as",
    # Mishing → Assamese
    "mrm": "as",
}

def get_tts_lang(lang_code: str) -> str:
    """Get best available TTS language code."""
    if lang_code in GTTS_SUPPORTED:
        return lang_code
    # Try fallback
    fallback = TTS_FALLBACK.get(lang_code)
    if fallback and fallback in GTTS_SUPPORTED:
        return fallback
    return "en"

# ── Google Translate code mapping ────────────────────
# Internal code → Google Translate API code
GT_CODE_MAP = {
    "kok": "gom",        # Konkani
    "awa": "hi",         # Awadhi → use Hindi
    "mag": "hi",         # Magahi → use Hindi
    "hne": "hi",         # Chhattisgarhi → use Hindi
    "bgc": "hi",         # Haryanvi → use Hindi
    "raj": "mwr",        # Rajasthani → Marwari code
    "lep": "ne",         # Lepcha → Nepali
    "kha": "kha",        # Khasi (supported)
    "gon": "hi",         # Gondi → Hindi
    "hlb": "hi",         # Halbi → Hindi
    "kru": "hi",         # Kurukh → Hindi
    "hoc": "bn",         # Ho → Bengali
    "unr": "bn",         # Mundari → Bengali
    "gbm": "hi",         # Garhwali → Hindi
    "kfy": "hi",         # Kumaoni → Hindi
    "anp": "hi",         # Angika → Hindi
    "bns": "hi",         # Bundeli → Hindi
    "bhb": "gu",         # Bhili → Gujarati
    "kfr": "gu",         # Kutchi → Gujarati
    "him": "hi",         # Pahari → Hindi
    "xnr": "hi",         # Kangri → Hindi
    "ajz": "as",         # Karbi → Assamese
    "mrm": "as",         # Mishing → Assamese
    "trp": "bn",         # Kokborok → Bengali
    "lmn": "te",         # Lambadi → Telugu
}

# Languages that deep_translator doesn't support well — use direct GTX
DEEP_TRANS_UNSUPPORTED = {
    "ks", "brx", "sat", "mwr", "tcy", "lus", "awa", "mag", "hne",
    "bgc", "raj", "kha", "lep", "gon", "hlb", "kru", "hoc", "unr",
    "gbm", "kfy", "anp", "bns", "bhb", "kfr", "him", "xnr", "ajz",
    "mrm", "trp", "lmn"
}

def get_gt_code(lang: str) -> str:
    """Map internal language code to Google Translate API code."""
    return GT_CODE_MAP.get(lang, lang)

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
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    resp = requests.get(url, params=params, headers=headers, timeout=15)
    resp.raise_for_status()
    data = resp.json()
    if data and data[0]:
        return "".join(seg[0] for seg in data[0] if seg and seg[0])
    raise ValueError("Empty translation response")

def translate_chunk(text: str, src: str, dest: str) -> str:
    """Translate a single chunk with best available method."""
    # Map to Google Translate codes
    gt_src = get_gt_code(src)
    gt_dest = get_gt_code(dest)

    use_direct = (src in DEEP_TRANS_UNSUPPORTED or dest in DEEP_TRANS_UNSUPPORTED)

    if not use_direct:
        # Try deep_translator first (more reliable for supported langs)
        try:
            translator = GoogleTranslator(source=gt_src, target=gt_dest)
            result = translator.translate(text)
            if result and result.strip():
                return result
        except Exception as e:
            print(f"deep_translator failed ({src}→{dest}): {e}, trying direct gtx")

    # Fallback / primary for unsupported langs: direct gtx API
    try:
        result = gtx_translate(text, gt_src, gt_dest)
        if result and result.strip():
            return result
    except Exception as e:
        print(f"gtx direct failed ({src}→{dest}): {e}")

    # Try with auto-detect source
    try:
        result = gtx_translate(text, "auto", gt_dest)
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
    src  = data.get("from_lang", "auto")
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
        tts = gTTS(text=text, lang=tts_lang, slow=False)
        filepath = "/tmp/output_vaani.mp3"
        tts.save(filepath)
        response = FileResponse(filepath, media_type="audio/mpeg")
        response.headers["X-TTS-Lang-Used"]      = tts_lang
        response.headers["X-TTS-Lang-Requested"] = lang_req
        return response
    except Exception as e:
        print(f"TTS error for lang={tts_lang}: {e}, trying 'en' fallback")
        try:
            tts = gTTS(text=text, lang="en")
            tts.save("/tmp/output_vaani.mp3")
            response = FileResponse("/tmp/output_vaani.mp3", media_type="audio/mpeg")
            response.headers["X-TTS-Lang-Used"] = "en"
            return response
        except Exception as e2:
            return JSONResponse(status_code=500, content={"error": str(e2)})

# ── ROUTE 3: Image OCR + Translate ───────────────────
TESS_LANG_MAP = {
    "te":"tel","ta":"tam","hi":"hin","kn":"kan","ml":"mal",
    "mr":"mar","bn":"ben","gu":"guj","pa":"pan","ur":"urd",
    "or":"ori","as":"asm","ne":"nep","sa":"san","sd":"snd",
    "mai":"hin","doi":"hin","kok":"mar","gom":"mar","bho":"hin",
    "mwr":"hin","tcy":"kan","ks":"urd","sat":"ben","mni-Mtei":"ben",
    "lus":"eng","brx":"hin","awa":"hin","mag":"hin","hne":"hin",
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
