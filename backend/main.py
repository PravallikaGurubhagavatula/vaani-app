"""
Vaani Backend — FastAPI
Audio strategy:
  1. TTS  → Bhashini (human voices, male/female) → fallback gTTS
  2. ASR  → Bhashini (Indian-accent trained)     → fallback browser mic
  3. NMT  → deep_translator / GTX               → fallback auto-detect
All Bhashini calls are wrapped in try/except so the app never crashes
if the API key is missing or the service is down.
"""

from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from gtts import gTTS
from gtts.lang import tts_langs
from deep_translator import GoogleTranslator
import pytesseract
from PIL import Image
import requests, io, os, re, json, base64

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── BHASHINI CONFIG ───────────────────────────────────
# Set these as environment variables in Render dashboard.
# The app works without them (falls back to gTTS) but
# with them you get human-quality voices with male/female choice.
BHASHINI_USER_ID       = os.environ.get("BHASHINI_USER_ID", "")
BHASHINI_ULCA_API_KEY  = os.environ.get("BHASHINI_ULCA_API_KEY", "")
BHASHINI_INFERENCE_KEY = os.environ.get("BHASHINI_INFERENCE_KEY", "")

# Bhashini pipeline search endpoint
BHASHINI_PIPELINE_URL  = "https://meity-auth.ulcacontrib.org/ulca/apis/v0/model/getModelsPipeline"
# Bhashini inference endpoint
BHASHINI_INFER_URL     = "https://dhruva-api.bhashini.gov.in/services/inference/pipeline"

# ── BHASHINI LANGUAGE CODE MAP ────────────────────────
# Maps our internal codes → Bhashini's ISO-639 codes
BHASHINI_LANG_MAP = {
    "as": "as", "bn": "bn", "brx": "brx", "doi": "doi",
    "gu": "gu", "hi": "hi", "kn": "kn",  "ks": "ks",
    "kok": "kok","mai": "mai","ml": "ml", "mni-Mtei": "mni",
    "mr": "mr", "ne": "ne", "or": "or",  "pa": "pa",
    "sa": "sa", "sat": "sat","sd": "sd", "ta": "ta",
    "te": "te", "ur": "ur", "bho": "bho","mwr": "raj",
    "tcy": "tcy","lus": "lus","en": "en", "gom": "kok",
    "awa": "hi", "mag": "hi", "hne": "hi","bgc": "hi",
    "raj": "raj","kha": "kha","lep": "ne",
}

def get_bhashini_lang(code: str) -> str:
    return BHASHINI_LANG_MAP.get(code, code)

def bhashini_available() -> bool:
    return bool(BHASHINI_USER_ID and BHASHINI_ULCA_API_KEY and BHASHINI_INFERENCE_KEY)

# ── BHASHINI: Get pipeline service IDs ───────────────
def get_bhashini_pipeline(task: str, src_lang: str, tgt_lang: str = None) -> dict | None:
    """Search Bhashini for a pipeline that supports the given task + language."""
    if not bhashini_available():
        return None
    try:
        payload = {
            "pipelineTasks": [{"taskType": task, "config": {"language": {"sourceLanguage": src_lang}}}],
            "pipelineRequestConfig": {"pipelineId": "64392f96daac500b55c543cd"}
        }
        if tgt_lang:
            payload["pipelineTasks"][0]["config"]["language"]["targetLanguage"] = tgt_lang

        headers = {
            "Content-Type": "application/json",
            "userID": BHASHINI_USER_ID,
            "ulcaApiKey": BHASHINI_ULCA_API_KEY
        }
        res = requests.post(BHASHINI_PIPELINE_URL, json=payload, headers=headers, timeout=10)
        if res.ok:
            data = res.json()
            pipes = data.get("pipelineResponseConfig", [])
            if pipes:
                return {
                    "serviceId": pipes[0].get("config", [{}])[0].get("serviceId", ""),
                    "callbackUrl": data.get("pipelineInferenceAPIEndPoint", {}).get("callbackUrl", BHASHINI_INFER_URL),
                    "inferenceKey":  data.get("pipelineInferenceAPIEndPoint", {}).get("inferenceApiKey", {}).get("value", BHASHINI_INFERENCE_KEY)
                }
    except Exception as e:
        print(f"Bhashini pipeline search failed ({task}): {e}")
    return None

# ── BHASHINI TTS ──────────────────────────────────────
def bhashini_tts(text: str, lang: str, gender: str = "female") -> bytes | None:
    """
    Call Bhashini TTS. Returns raw MP3/WAV bytes or None on failure.
    gender: "male" or "female"
    """
    if not bhashini_available():
        return None
    bl = get_bhashini_lang(lang)
    pipeline = get_bhashini_pipeline("tts", bl)
    if not pipeline or not pipeline.get("serviceId"):
        return None
    try:
        payload = {
            "pipelineTasks": [{
                "taskType": "tts",
                "config": {
                    "language": {"sourceLanguage": bl},
                    "serviceId": pipeline["serviceId"],
                    "gender": gender,          # "male" or "female"
                    "samplingRate": 8000
                }
            }],
            "inputData": {"input": [{"source": text}]}
        }
        headers = {
            "Content-Type": "application/json",
            "Authorization": pipeline["inferenceKey"]
        }
        res = requests.post(
            pipeline.get("callbackUrl", BHASHINI_INFER_URL),
            json=payload, headers=headers, timeout=20
        )
        if res.ok:
            data = res.json()
            audio_b64 = (
                data.get("pipelineResponse", [{}])[0]
                    .get("audio", [{}])[0]
                    .get("audioContent", "")
            )
            if audio_b64:
                return base64.b64decode(audio_b64)
    except Exception as e:
        print(f"Bhashini TTS failed ({lang}, {gender}): {e}")
    return None

# ── BHASHINI ASR ──────────────────────────────────────
def bhashini_asr(audio_b64: str, lang: str) -> str | None:
    """
    Call Bhashini ASR with base64-encoded audio. Returns transcript or None.
    audio_b64: base64 WAV audio
    """
    if not bhashini_available():
        return None
    bl = get_bhashini_lang(lang)
    pipeline = get_bhashini_pipeline("asr", bl)
    if not pipeline or not pipeline.get("serviceId"):
        return None
    try:
        payload = {
            "pipelineTasks": [{
                "taskType": "asr",
                "config": {
                    "language": {"sourceLanguage": bl},
                    "serviceId": pipeline["serviceId"],
                    "audioFormat": "wav",
                    "samplingRate": 16000
                }
            }],
            "inputData": {
                "audio": [{"audioContent": audio_b64}]
            }
        }
        headers = {
            "Content-Type": "application/json",
            "Authorization": pipeline["inferenceKey"]
        }
        res = requests.post(
            pipeline.get("callbackUrl", BHASHINI_INFER_URL),
            json=payload, headers=headers, timeout=20
        )
        if res.ok:
            data = res.json()
            transcript = (
                data.get("pipelineResponse", [{}])[0]
                    .get("output", [{}])[0]
                    .get("source", "")
            )
            return transcript if transcript else None
    except Exception as e:
        print(f"Bhashini ASR failed ({lang}): {e}")
    return None

# ── gTTS FALLBACK CONFIG ──────────────────────────────
GTTS_SUPPORTED = set(tts_langs().keys())

TTS_FALLBACK = {
    "or":"hi","as":"bn","sa":"hi","sd":"ur","ks":"ur","mai":"hi","doi":"hi",
    "brx":"hi","kok":"mr","gom":"mr","mni-Mtei":"bn","sat":"bn","bho":"hi",
    "mwr":"hi","tcy":"kn","lus":"en","awa":"hi","mag":"hi","hne":"hi",
    "bgc":"hi","raj":"hi","kha":"en","lep":"ne","trp":"bn","lmn":"te",
}

def get_gtts_lang(code: str) -> str:
    if code in GTTS_SUPPORTED:
        return code
    fb = TTS_FALLBACK.get(code)
    if fb and fb in GTTS_SUPPORTED:
        return fb
    return "en"

# ── TRANSLATION CONFIG ────────────────────────────────
GT_CODE_MAP = {
    "kok":"gom","awa":"hi","mag":"hi","hne":"hi","bgc":"hi","raj":"mwr",
    "lep":"ne","kha":"kha","gon":"hi","hlb":"hi","kru":"hi","hoc":"bn",
    "unr":"bn","gbm":"hi","kfy":"hi","anp":"hi","bns":"hi","bhb":"gu",
    "kfr":"gu","him":"hi","xnr":"hi","ajz":"as","mrm":"as","trp":"bn","lmn":"te",
}
DEEP_TRANS_UNSUPPORTED = {
    "ks","brx","sat","mwr","tcy","lus","awa","mag","hne","bgc","raj","kha","lep",
    "gon","hlb","kru","hoc","unr","gbm","kfy","anp","bns","bhb","kfr","him",
    "xnr","ajz","mrm","trp","lmn"
}

def get_gt_code(lang: str) -> str:
    return GT_CODE_MAP.get(lang, lang)

def gtx_translate(text: str, src: str, dest: str) -> str:
    url = "https://translate.googleapis.com/translate_a/single"
    params = {"client":"gtx","sl":src,"tl":dest,"dt":"t","q":text}
    headers = {"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    resp = requests.get(url, params=params, headers=headers, timeout=15)
    resp.raise_for_status()
    data = resp.json()
    if data and data[0]:
        return "".join(seg[0] for seg in data[0] if seg and seg[0])
    raise ValueError("Empty translation response")

def translate_chunk(text: str, src: str, dest: str) -> str:
    gt_src, gt_dest = get_gt_code(src), get_gt_code(dest)
    use_direct = src in DEEP_TRANS_UNSUPPORTED or dest in DEEP_TRANS_UNSUPPORTED
    if not use_direct:
        try:
            result = GoogleTranslator(source=gt_src, target=gt_dest).translate(text)
            if result and result.strip():
                return result
        except Exception as e:
            print(f"deep_translator failed ({src}→{dest}): {e}")
    for src_arg in [gt_src, "auto"]:
        try:
            result = gtx_translate(text, src_arg, gt_dest)
            if result and result.strip():
                return result
        except Exception as e:
            print(f"gtx failed ({src_arg}→{dest}): {e}")
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
    # If text is pure ASCII but src language uses non-Latin script,
    # the transliteration on the frontend failed — use auto-detect
    # so Google correctly identifies romanized Telugu/Hindi/Tamil etc.
    NON_LATIN = {
        "te","ta","hi","kn","ml","mr","bn","gu","pa","ur","or","as",
        "ne","sa","sd","mai","doi","kok","gom","bho","mwr","tcy","ks",
        "sat","mni-Mtei","brx","lus","awa","mag","hne","bgc","raj","kha","lep"
    }
    if src in NON_LATIN and text and text.isascii():
        src = "auto"
    try:
        chunks = split_text(text)
        parts  = [translate_chunk(c, src, dest) for c in chunks]
        return {"translated": " ".join(parts)}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e), "translated": ""})

# ── ROUTE 2: TTS — Bhashini first, gTTS fallback ─────
@app.post("/speak")
async def speak(data: dict):
    text   = data["text"]
    lang   = data["lang"]
    gender = data.get("gender", "female")  # "male" or "female"

    # ── Try Bhashini first (human voice, gender-aware) ──
    audio_bytes = bhashini_tts(text, lang, gender)
    if audio_bytes and len(audio_bytes) > 100:
        return StreamingResponse(
            io.BytesIO(audio_bytes),
            media_type="audio/mpeg",
            headers={
                "X-TTS-Engine": "bhashini",
                "X-TTS-Gender": gender,
                "X-TTS-Lang":   lang
            }
        )

    # ── Fallback: gTTS (works for all languages) ────────
    tts_lang = get_gtts_lang(lang)
    try:
        tts = gTTS(text=text, lang=tts_lang, slow=False)
        fp  = "/tmp/vaani_out.mp3"
        tts.save(fp)
        return FileResponse(fp, media_type="audio/mpeg",
                            headers={"X-TTS-Engine":"gtts","X-TTS-Lang":tts_lang})
    except Exception as e:
        print(f"gTTS failed ({tts_lang}): {e}")
        try:
            tts = gTTS(text=text, lang="en")
            tts.save("/tmp/vaani_out.mp3")
            return FileResponse("/tmp/vaani_out.mp3", media_type="audio/mpeg",
                                headers={"X-TTS-Engine":"gtts-en-fallback"})
        except Exception as e2:
            return JSONResponse(status_code=500, content={"error": str(e2)})

# ── ROUTE 3: Bhashini ASR endpoint ───────────────────
@app.post("/asr")
async def asr_endpoint(data: dict):
    """
    Receive base64 WAV audio + language, return transcript via Bhashini ASR.
    Frontend sends: { audio_b64: "...", lang: "te" }
    Returns: { transcript: "..." } or { error: "..." }
    """
    audio_b64 = data.get("audio_b64", "")
    lang      = data.get("lang", "hi")
    if not audio_b64:
        return JSONResponse(status_code=400, content={"error": "No audio provided"})
    transcript = bhashini_asr(audio_b64, lang)
    if transcript:
        return {"transcript": transcript, "engine": "bhashini"}
    return JSONResponse(status_code=503, content={"error": "ASR unavailable, use browser mic"})

# ── ROUTE 4: Image OCR + Translate ───────────────────
TESS_LANG_MAP = {
    "te":"tel","ta":"tam","hi":"hin","kn":"kan","ml":"mal","mr":"mar",
    "bn":"ben","gu":"guj","pa":"pan","ur":"urd","or":"ori","as":"asm",
    "ne":"nep","sa":"san","sd":"snd","mai":"hin","doi":"hin","kok":"mar",
    "bho":"hin","mwr":"hin","tcy":"kan","ks":"urd","sat":"ben",
    "mni-Mtei":"ben","lus":"eng","brx":"hin","awa":"hin","mag":"hin",
    "hne":"hin","en":"eng",
}

@app.post("/image-translate")
async def image_translate(
    file: UploadFile = File(...),
    from_lang: str   = Form(...),
    to_lang: str     = Form(...)
):
    contents = await file.read()
    image    = Image.open(io.BytesIO(contents))
    tess_lang = TESS_LANG_MAP.get(from_lang, "eng")
    try:
        extracted_text = pytesseract.image_to_string(image, lang=tess_lang)
    except Exception:
        extracted_text = pytesseract.image_to_string(image, lang="eng")
    extracted_text = extracted_text.strip()
    if not extracted_text:
        return {"extracted": "", "translated": "No text found in the image."}
    try:
        chunks = split_text(extracted_text)
        parts  = [translate_chunk(c, from_lang, to_lang) for c in chunks]
        return {"extracted": extracted_text, "translated": " ".join(parts)}
    except Exception as e:
        return {"extracted": extracted_text, "translated": f"Translation error: {e}"}

# ── ROUTE 5: Status / keep-alive ─────────────────────
@app.get("/ping")
def ping():
    return {
        "status": "alive",
        "bhashini": "connected" if bhashini_available() else "not configured — using gTTS fallback"
    }

@app.get("/")
def home():
    return {"status": "Vaani API running", "bhashini": bhashini_available()}
