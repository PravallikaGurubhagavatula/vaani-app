"""
Vaani Backend — FastAPI  v3.0
═══════════════════════════════════════════════════════════════════
TRANSLATION PRIORITY (most Indian-accurate first):
  1. Bhashini NMT  — trained on Samanantar + IndicCorp Indian data
  2. Google tw-ob  — romanized-aware waterfall (3 strategies)
  3. deep_translator / gtx — fallback

TTS PRIORITY:
  1. Bhashini TTS  — human voices, gender-aware, Indian languages
  2. gTTS           — all languages fallback

ASR PRIORITY:
  1. Bhashini ASR  — Indian-accent trained
  2. Browser Web Speech API (handled in frontend)

OCR PRIORITY:
  1. Google Cloud Vision API  — production-grade, preserves structure
  2. Tesseract (Pillow-based) — fallback

All Bhashini calls are wrapped in try/except — app NEVER crashes if
Bhashini is unconfigured or down.
═══════════════════════════════════════════════════════════════════
"""

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from gtts import gTTS
from gtts.lang import tts_langs
from deep_translator import GoogleTranslator
import pytesseract
from PIL import Image, ImageEnhance, ImageFilter
import requests, io, os, re, json, base64, hashlib, time
from uuid import uuid4
from functools import lru_cache

app = FastAPI(title="Vaani API", version="3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

VOICE_UPLOAD_DIR = os.path.join("/tmp", "vaani_voice_uploads")
os.makedirs(VOICE_UPLOAD_DIR, exist_ok=True)
app.mount("/uploads/voice", StaticFiles(directory=VOICE_UPLOAD_DIR), name="voice_uploads")

# ══════════════════════════════════════════════════════════════════
# BHASHINI CONFIG
# ══════════════════════════════════════════════════════════════════
BHASHINI_USER_ID        = os.environ.get("BHASHINI_USER_ID", "")
BHASHINI_ULCA_API_KEY   = os.environ.get("BHASHINI_ULCA_API_KEY", "")
BHASHINI_INFERENCE_KEY  = os.environ.get("BHASHINI_INFERENCE_KEY", "")

BHASHINI_PIPELINE_URL   = "https://meity-auth.ulcacontrib.org/ulca/apis/v0/model/getModelsPipeline"
BHASHINI_INFER_URL      = "https://dhruva-api.bhashini.gov.in/services/inference/pipeline"

# ══════════════════════════════════════════════════════════════════
# GOOGLE VISION API CONFIG
# ══════════════════════════════════════════════════════════════════
GOOGLE_VISION_API_KEY   = os.environ.get("GOOGLE_VISION_API_KEY", "")
GOOGLE_VISION_URL       = "https://vision.googleapis.com/v1/images:annotate"

# ── Bhashini language code map ────────────────────────────────────
BHASHINI_LANG_MAP = {
    "as":"as","bn":"bn","brx":"brx","doi":"doi","gu":"gu","hi":"hi",
    "kn":"kn","ks":"ks","kok":"kok","mai":"mai","ml":"ml","mni-Mtei":"mni",
    "mr":"mr","ne":"ne","or":"or","pa":"pa","sa":"sa","sat":"sat",
    "sd":"sd","ta":"ta","te":"te","ur":"ur","bho":"bho","mwr":"raj",
    "tcy":"tcy","lus":"lus","en":"en","gom":"kok","awa":"hi","mag":"hi",
    "hne":"hi","bgc":"hi","raj":"raj","kha":"kha","lep":"ne",
}

# Non-Latin script languages (romanized input detection)
NON_LATIN_LANGS = {
    "te","ta","hi","kn","ml","mr","bn","gu","pa","ur","or","as",
    "ne","sa","sd","mai","doi","kok","gom","bho","mwr","tcy","ks",
    "sat","mni-Mtei","brx","lus","awa","mag","hne","bgc","raj","kha","lep"
}

# ── Simple in-memory translation cache ──
_trans_cache: dict = {}
_cache_max = 2000

def cache_get(key: str):
    return _trans_cache.get(key)

def cache_set(key: str, value: str):
    if len(_trans_cache) >= _cache_max:
        keys = list(_trans_cache.keys())
        for k in keys[:int(_cache_max * 0.2)]:
            _trans_cache.pop(k, None)
    _trans_cache[key] = value


# ══════════════════════════════════════════════════════════════════
# GOOGLE VISION OCR
# ══════════════════════════════════════════════════════════════════

def google_vision_ocr(image_bytes: bytes, lang_hint: str = "en") -> dict:
    """
    Use Google Cloud Vision API for production-grade OCR.
    Returns dict with:
      - text: full reconstructed text preserving structure
      - blocks: list of paragraph blocks
      - engine: "google_vision"
    Falls back gracefully if API key not set.
    """
    if not GOOGLE_VISION_API_KEY:
        return None

    # Map our lang codes to BCP-47 hints for Vision API
    lang_hint_map = {
        "te": "te", "ta": "ta", "hi": "hi", "kn": "kn", "ml": "ml",
        "mr": "mr", "bn": "bn", "gu": "gu", "pa": "pa", "ur": "ur",
        "or": "or", "as": "as", "ne": "ne", "sa": "sa", "en": "en",
        "sd": "ur", "mai": "hi", "doi": "hi", "kok": "mr", "bho": "hi",
        "mwr": "hi", "tcy": "kn", "ks": "ur",
    }
    bcp47 = lang_hint_map.get(lang_hint, "en")

    try:
        img_b64 = base64.b64encode(image_bytes).decode("utf-8")

        payload = {
            "requests": [{
                "image": {"content": img_b64},
                "features": [
                    {"type": "DOCUMENT_TEXT_DETECTION", "maxResults": 1}
                ],
                "imageContext": {
                    "languageHints": [bcp47, "en"]
                }
            }]
        }

        resp = requests.post(
            f"{GOOGLE_VISION_URL}?key={GOOGLE_VISION_API_KEY}",
            json=payload,
            timeout=30
        )

        if not resp.ok:
            print(f"[Vision API] HTTP {resp.status_code}: {resp.text[:200]}")
            return None

        data = resp.json()
        responses = data.get("responses", [{}])
        if not responses:
            return None

        r = responses[0]

        if "error" in r:
            print(f"[Vision API] Error: {r['error']}")
            return None

        full_annotation = r.get("fullTextAnnotation", {})
        if not full_annotation:
            # Try simple text annotation
            simple = r.get("textAnnotations", [])
            if simple:
                return {
                    "text": simple[0].get("description", "").strip(),
                    "blocks": [],
                    "engine": "google_vision_simple"
                }
            return None

        # Reconstruct text preserving structure from fullTextAnnotation
        reconstructed = _reconstruct_vision_text(full_annotation)

        return {
            "text": reconstructed,
            "blocks": [],
            "engine": "google_vision"
        }

    except Exception as e:
        print(f"[Vision API] Exception: {e}")
        return None


def _reconstruct_vision_text(full_annotation: dict) -> str:
    """
    Reconstruct text from Google Vision fullTextAnnotation,
    preserving paragraph structure, line breaks, bullets, and emojis.
    """
    pages = full_annotation.get("pages", [])
    if not pages:
        # Fall back to raw text
        return full_annotation.get("text", "").strip()

    result_lines = []

    for page in pages:
        for block in page.get("blocks", []):
            block_lines = []
            for paragraph in block.get("paragraphs", []):
                para_words = []
                for word in paragraph.get("words", []):
                    symbols = word.get("symbols", [])
                    word_text = ""
                    for sym in symbols:
                        char = sym.get("text", "")
                        word_text += char
                        # Check for line break or paragraph break
                        prop = sym.get("property", {})
                        detected_break = prop.get("detectedBreak", {})
                        break_type = detected_break.get("type", "")
                        if break_type in ("LINE_BREAK", "EOL_SURE_SPACE"):
                            word_text += "\n"
                        elif break_type == "HYPHEN":
                            word_text += "-"
                    para_words.append(word_text)

                para_text = " ".join(para_words).strip()
                # Clean up spaces before newlines
                para_text = re.sub(r' +\n', '\n', para_text)
                para_text = re.sub(r'\n +', '\n', para_text)
                if para_text:
                    block_lines.append(para_text)

            if block_lines:
                result_lines.append("\n".join(block_lines))

    if result_lines:
        return "\n\n".join(result_lines).strip()

    # Ultimate fallback: use the raw text field
    return full_annotation.get("text", "").strip()


# ══════════════════════════════════════════════════════════════════
# BHASHINI HELPERS (unchanged from v2.0)
# ══════════════════════════════════════════════════════════════════

def bhashini_available() -> bool:
    return bool(BHASHINI_USER_ID and BHASHINI_ULCA_API_KEY and BHASHINI_INFERENCE_KEY)

def get_bhashini_lang(code: str) -> str:
    return BHASHINI_LANG_MAP.get(code, code)

def get_bhashini_pipeline(task: str, src_lang: str, tgt_lang: str = None) -> dict | None:
    if not bhashini_available():
        return None
    try:
        payload = {
            "pipelineTasks": [{
                "taskType": task,
                "config": {"language": {"sourceLanguage": src_lang}}
            }],
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
                    "serviceId":    pipes[0].get("config", [{}])[0].get("serviceId", ""),
                    "callbackUrl":  data.get("pipelineInferenceAPIEndPoint", {}).get("callbackUrl", BHASHINI_INFER_URL),
                    "inferenceKey": data.get("pipelineInferenceAPIEndPoint", {}).get("inferenceApiKey", {}).get("value", BHASHINI_INFERENCE_KEY)
                }
    except Exception as e:
        print(f"[Bhashini pipeline/{task}] {e}")
    return None


def bhashini_transliterate(text: str, lang: str) -> str | None:
    if not bhashini_available():
        return None
    bl = get_bhashini_lang(lang)
    pipeline = get_bhashini_pipeline("transliteration", bl)
    if not pipeline or not pipeline.get("serviceId"):
        return None
    try:
        payload = {
            "pipelineTasks": [{
                "taskType": "transliteration",
                "config": {
                    "language": {"sourceLanguage": "en", "targetLanguage": bl},
                    "serviceId": pipeline["serviceId"],
                    "isSentence": True
                }
            }],
            "inputData": {"input": [{"source": text}]}
        }
        headers = {"Content-Type": "application/json", "Authorization": pipeline["inferenceKey"]}
        res = requests.post(pipeline.get("callbackUrl", BHASHINI_INFER_URL),
                            json=payload, headers=headers, timeout=15)
        if res.ok:
            data = res.json()
            native = (data.get("pipelineResponse", [{}])[0]
                          .get("output", [{}])[0]
                          .get("target", ""))
            if native and not native.isascii():
                return native
    except Exception as e:
        print(f"[Bhashini Translit/{lang}] {e}")
    return None


def bhashini_translate(text: str, src_lang: str, dest_lang: str) -> str | None:
    if not bhashini_available():
        return None
    bl_src  = get_bhashini_lang(src_lang)
    bl_dest = get_bhashini_lang(dest_lang)
    if bl_src == bl_dest:
        return text
    pipeline = get_bhashini_pipeline("translation", bl_src, bl_dest)
    if not pipeline or not pipeline.get("serviceId"):
        return None
    try:
        payload = {
            "pipelineTasks": [{
                "taskType": "translation",
                "config": {
                    "language": {"sourceLanguage": bl_src, "targetLanguage": bl_dest},
                    "serviceId": pipeline["serviceId"]
                }
            }],
            "inputData": {"input": [{"source": text}]}
        }
        headers = {"Content-Type": "application/json", "Authorization": pipeline["inferenceKey"]}
        res = requests.post(pipeline.get("callbackUrl", BHASHINI_INFER_URL),
                            json=payload, headers=headers, timeout=20)
        if res.ok:
            data = res.json()
            translated = (data.get("pipelineResponse", [{}])[0]
                              .get("output", [{}])[0]
                              .get("target", ""))
            if translated and translated.strip():
                return translated
    except Exception as e:
        print(f"[Bhashini NMT/{src_lang}→{dest_lang}] {e}")
    return None


def bhashini_tts(text: str, lang: str, gender: str = "female") -> bytes | None:
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
                    "gender": gender,
                    "samplingRate": 8000
                }
            }],
            "inputData": {"input": [{"source": text}]}
        }
        headers = {"Content-Type": "application/json", "Authorization": pipeline["inferenceKey"]}
        res = requests.post(pipeline.get("callbackUrl", BHASHINI_INFER_URL),
                            json=payload, headers=headers, timeout=20)
        if res.ok:
            data = res.json()
            audio_b64 = (data.get("pipelineResponse", [{}])[0]
                             .get("audio", [{}])[0]
                             .get("audioContent", ""))
            if audio_b64:
                return base64.b64decode(audio_b64)
    except Exception as e:
        print(f"[Bhashini TTS/{lang}/{gender}] {e}")
    return None


def bhashini_asr(audio_b64: str, lang: str) -> str | None:
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
            "inputData": {"audio": [{"audioContent": audio_b64}]}
        }
        headers = {"Content-Type": "application/json", "Authorization": pipeline["inferenceKey"]}
        res = requests.post(pipeline.get("callbackUrl", BHASHINI_INFER_URL),
                            json=payload, headers=headers, timeout=20)
        if res.ok:
            data = res.json()
            transcript = (data.get("pipelineResponse", [{}])[0]
                              .get("output", [{}])[0]
                              .get("source", ""))
            return transcript if transcript else None
    except Exception as e:
        print(f"[Bhashini ASR/{lang}] {e}")
    return None


# ══════════════════════════════════════════════════════════════════
# GOOGLE TRANSLATE HELPERS (unchanged from v2.0)
# ══════════════════════════════════════════════════════════════════

GT_CODE_MAP = {
    "kok":"gom","awa":"hi","mag":"hi","hne":"hi","bgc":"hi","raj":"mwr",
    "lep":"ne","kha":"kha","gon":"hi","hlb":"hi","trp":"bn","lmn":"te",
}
DEEP_TRANS_UNSUPPORTED = {
    "ks","brx","sat","mwr","tcy","lus","awa","mag","hne","bgc","raj","kha","lep",
}

ROMANIZED_HINT_MAP = {
    "te":"te","hi":"hi","ta":"ta","kn":"kn","ml":"ml","mr":"mr","bn":"bn",
    "gu":"gu","pa":"pa","ur":"ur","or":"or","as":"as","ne":"ne",
    "mai":"hi","doi":"hi","bho":"hi","awa":"hi","mag":"hi","hne":"hi",
    "bgc":"hi","mwr":"hi","raj":"hi","kok":"mr","gom":"mr","tcy":"kn",
    "lep":"ne","ks":"ur","sd":"ur","sa":"hi","sat":"bn","mni-Mtei":"bn",
    "brx":"hi","lus":"en","kha":"en",
}

def get_gt_code(lang: str) -> str:
    return GT_CODE_MAP.get(lang, lang)

def _gtx_call(text: str, sl: str, tl: str, dt_flags: list = None) -> dict:
    url = "https://translate.googleapis.com/translate_a/single"
    dt  = dt_flags or ["t"]
    params = [("client","gtx"),("sl",sl),("tl",tl),("q",text)]
    for f in dt: params.append(("dt", f))
    headers = {"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
    resp = requests.get(url, params=params, headers=headers, timeout=15)
    resp.raise_for_status()
    return resp.json()

def _extract_translation(data) -> str:
    if data and data[0]:
        return "".join(seg[0] for seg in data[0] if seg and seg[0]).strip()
    return ""

def _is_phonetic_only(result: str, dest_lang: str) -> bool:
    if dest_lang in NON_LATIN_LANGS:
        if result and result.isascii():
            return True
    return False

def translate_romanized_robust(text: str, src_lang: str, dest_lang: str) -> str | None:
    gt_src  = ROMANIZED_HINT_MAP.get(src_lang, src_lang)
    gt_dest = get_gt_code(dest_lang)

    try:
        url = "https://translate.googleapis.com/translate_a/single"
        params = [("client","tw-ob"),("sl",gt_src),("tl",gt_dest),("dt","t"),("q",text)]
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            "Referer": "https://translate.google.com/",
        }
        resp = requests.get(url, params=params, headers=headers, timeout=15)
        if resp.ok:
            data   = resp.json()
            result = _extract_translation(data)
            if result and not _is_phonetic_only(result, dest_lang):
                return result
    except Exception as e:
        print(f"[Romanized S1] {e}")

    try:
        data   = _gtx_call(text, "auto", gt_dest, dt_flags=["t","ld"])
        result = _extract_translation(data)
        if result and not _is_phonetic_only(result, dest_lang):
            return result
    except Exception as e:
        print(f"[Romanized S2] {e}")

    try:
        data_en  = _gtx_call(text, "auto", "en")
        english  = _extract_translation(data_en)
        if english and english.lower() != text.lower():
            if dest_lang == "en" or gt_dest == "en":
                return english
            data_final = _gtx_call(english, "en", gt_dest)
            result = _extract_translation(data_final)
            if result and not _is_phonetic_only(result, dest_lang):
                return result
    except Exception as e:
        print(f"[Romanized S3] {e}")

    return None

def gtx_translate(text: str, src: str, dest: str) -> str:
    url = "https://translate.googleapis.com/translate_a/single"
    params = {"client":"gtx","sl":src,"tl":dest,"dt":"t","q":text}
    headers = {"User-Agent":"Mozilla/5.0"}
    resp = requests.get(url, params=params, headers=headers, timeout=15)
    resp.raise_for_status()
    data = resp.json()
    if data and data[0]:
        return "".join(seg[0] for seg in data[0] if seg and seg[0])
    raise ValueError("Empty response")

def translate_chunk(text: str, src: str, dest: str) -> str:
    gt_src, gt_dest = get_gt_code(src), get_gt_code(dest)
    use_direct = src in DEEP_TRANS_UNSUPPORTED or dest in DEEP_TRANS_UNSUPPORTED
    if not use_direct:
        try:
            result = GoogleTranslator(source=gt_src, target=gt_dest).translate(text)
            if result and result.strip():
                return result
        except Exception as e:
            print(f"[deep_translator/{src}→{dest}] {e}")
    for src_arg in [gt_src, "auto"]:
        try:
            result = gtx_translate(text, src_arg, gt_dest)
            if result and result.strip():
                return result
        except Exception as e:
            print(f"[gtx/{src_arg}→{dest}] {e}")
    raise ValueError(f"All translation methods failed for {src}→{dest}")

def split_text(text: str, max_len: int = 4500) -> list[str]:
    sentences = re.split(r'(?<=[।.!?\n])\s*', text)
    chunks, current = [], ""
    for s in sentences:
        s = s.strip()
        if not s: continue
        if len(current) + len(s) + 1 > max_len and current:
            chunks.append(current.strip())
            current = s
        else:
            current = (current + " " + s).strip()
    if current:
        chunks.append(current)
    return chunks or [text]


# ══════════════════════════════════════════════════════════════════
# gTTS FALLBACK CONFIG
# ══════════════════════════════════════════════════════════════════

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


# ══════════════════════════════════════════════════════════════════
# TESSERACT OCR FALLBACK CONFIG
# ══════════════════════════════════════════════════════════════════

TESS_LANG_MAP = {
    "te":"tel","ta":"tam","hi":"hin","kn":"kan","ml":"mal","mr":"mar",
    "bn":"ben","gu":"guj","pa":"pan","ur":"urd","or":"ori","as":"asm",
    "ne":"nep","sa":"san","sd":"snd","mai":"hin","doi":"hin","kok":"mar",
    "bho":"hin","mwr":"hin","tcy":"kan","ks":"urd","sat":"ben",
    "mni-Mtei":"ben","lus":"eng","brx":"hin","awa":"hin","mag":"hin",
    "hne":"hin","en":"eng",
}

def preprocess_image_for_ocr(image: Image.Image) -> Image.Image:
    """Enhance image for better OCR accuracy, especially for Indian scripts."""
    if image.mode != 'L':
        image = image.convert('L')
    enhancer = ImageEnhance.Contrast(image)
    image = enhancer.enhance(2.0)
    image = image.filter(ImageFilter.SHARPEN)
    w, h = image.size
    if w < 1000:
        scale = 1000 / w
        image = image.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
    return image


# ══════════════════════════════════════════════════════════════════
# ROUTES
# ══════════════════════════════════════════════════════════════════

@app.post("/translate")
async def translate_text(data: dict):
    text      = (data.get("text") or "").strip()
    src       = data.get("from_lang", "auto")
    dest      = data.get("to_lang", "en")

    if not text:
        return JSONResponse(status_code=400, content={"error": "No text provided"})

    if src == dest and src != "auto":
        return {"translated": text, "engine": "passthrough"}

    cache_key = f"{text}|||{src}|||{dest}"
    cached = cache_get(cache_key)
    if cached:
        return {"translated": cached, "engine": "cache"}

    is_romanized = (
        src in NON_LATIN_LANGS
        and text.isascii()
        and any(c.isalpha() for c in text)
        and len(text.strip()) >= 2
    )

    working_text = text
    working_src  = src

    if is_romanized and bhashini_available():
        native = bhashini_transliterate(text, src)
        if native and not native.isascii():
            working_text = native

    if bhashini_available() and working_src != "auto":
        result = bhashini_translate(working_text, working_src, dest)
        if result and result.strip():
            cache_set(cache_key, result)
            return {"translated": result, "engine": "bhashini"}

    if is_romanized:
        result = translate_romanized_robust(text, src, dest)
        if result and result.strip():
            cache_set(cache_key, result)
            return {"translated": result, "engine": "google-romanized"}
        working_src = "auto"

    try:
        chunks = split_text(working_text)
        parts  = [translate_chunk(c, working_src, dest) for c in chunks]
        result = " ".join(parts)
        cache_set(cache_key, result)
        return {"translated": result, "engine": "google"}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e), "translated": ""})


@app.post("/speak")
async def speak(data: dict):
    text   = (data.get("text") or "").strip()
    lang   = data.get("lang", "en")
    gender = data.get("gender", "female")

    if not text:
        return JSONResponse(status_code=400, content={"error": "No text"})

    if gender not in ("male", "female"):
        gender = "female"

    audio_bytes = bhashini_tts(text, lang, gender)
    if audio_bytes and len(audio_bytes) > 100:
        return StreamingResponse(
            io.BytesIO(audio_bytes),
            media_type="audio/mpeg",
            headers={
                "X-TTS-Engine": "bhashini",
                "X-TTS-Gender": gender,
                "X-TTS-Lang":   lang,
                "Cache-Control": "no-cache"
            }
        )

    tts_lang = get_gtts_lang(lang)
    try:
        tts = gTTS(text=text, lang=tts_lang, slow=False)
        fp  = "/tmp/vaani_out.mp3"
        tts.save(fp)
        return FileResponse(
            fp, media_type="audio/mpeg",
            headers={"X-TTS-Engine": "gtts", "X-TTS-Lang": tts_lang}
        )
    except Exception as e:
        print(f"[gTTS/{tts_lang}] {e}")
        try:
            tts = gTTS(text=text, lang="en")
            tts.save("/tmp/vaani_out.mp3")
            return FileResponse("/tmp/vaani_out.mp3", media_type="audio/mpeg",
                                headers={"X-TTS-Engine": "gtts-en-fallback"})
        except Exception as e2:
            return JSONResponse(status_code=500, content={"error": str(e2)})


@app.post("/asr")
async def asr_endpoint(data: dict):
    audio_b64 = data.get("audio_b64", "")
    lang      = data.get("lang", "hi")
    if not audio_b64:
        return JSONResponse(status_code=400, content={"error": "No audio"})
    transcript = bhashini_asr(audio_b64, lang)
    if transcript:
        return {"transcript": transcript, "engine": "bhashini"}
    return JSONResponse(status_code=503,
                        content={"error": "Bhashini ASR unavailable — use browser mic"})


@app.post("/chat/voice/upload")
@app.post("/api/chat/voice/upload")
async def upload_voice_message(
    request: Request,
    file: UploadFile = File(...),
    duration_ms: int = Form(0)
):
    if not file:
        return JSONResponse(status_code=400, content={"error": "Missing audio file"})

    content_type = (file.content_type or "").lower()
    if not content_type.startswith("audio/"):
        return JSONResponse(status_code=400, content={"error": f"Invalid file type: {content_type or 'unknown'}"})

    payload = await file.read()
    if not payload:
        return JSONResponse(status_code=400, content={"error": "Audio file is empty"})

    ext = ".webm"
    if "mpeg" in content_type or "mp3" in content_type:
        ext = ".mp3"
    elif "wav" in content_type:
        ext = ".wav"
    elif "ogg" in content_type:
        ext = ".ogg"

    max_bytes = 12 * 1024 * 1024
    if len(payload) > max_bytes:
        return JSONResponse(status_code=413, content={"error": "Audio file too large (max 12MB)"})

    file_name = f"{int(time.time())}_{uuid4().hex}{ext}"
    out_path = os.path.join(VOICE_UPLOAD_DIR, file_name)
    with open(out_path, "wb") as out_file:
        out_file.write(payload)

    audio_url = str(request.base_url).rstrip("/") + f"/uploads/voice/{file_name}"
    return {
        "success": True,
        "audioUrl": audio_url,
        "mimeType": content_type,
        "durationMs": max(0, int(duration_ms or 0)),
        "size": len(payload)
    }


@app.post("/image-translate")
async def image_translate(
    file: UploadFile = File(...),
    from_lang: str   = Form("en"),
    to_lang: str     = Form("en")
):
    """
    OCR + translate.
    Priority: Google Vision API → Tesseract fallback
    Preserves text structure, emojis, bullet points.
    """
    contents = await file.read()

    extracted_text = ""
    ocr_engine = "unknown"

    # ── Step 1: Try Google Vision API ────────────────────────────
    vision_result = google_vision_ocr(contents, from_lang)
    if vision_result and vision_result.get("text", "").strip():
        extracted_text = vision_result["text"].strip()
        ocr_engine = vision_result["engine"]
        print(f"[OCR] Vision API extracted {len(extracted_text)} chars")
    else:
        # ── Step 2: Tesseract fallback ────────────────────────────
        print(f"[OCR] Vision API unavailable, using Tesseract")
        image = Image.open(io.BytesIO(contents))
        processed = preprocess_image_for_ocr(image)
        tess_lang = TESS_LANG_MAP.get(from_lang, "eng")

        for attempt_lang in [tess_lang, f"{tess_lang}+eng", "eng"]:
            try:
                text = pytesseract.image_to_string(processed, lang=attempt_lang,
                                                   config="--oem 3 --psm 6")
                text = text.strip()
                if text and len(text) > 2:
                    extracted_text = text
                    ocr_engine = "tesseract"
                    break
            except Exception:
                continue

        if not extracted_text:
            try:
                image = Image.open(io.BytesIO(contents))
                extracted_text = pytesseract.image_to_string(image, lang="eng").strip()
                ocr_engine = "tesseract-fallback"
            except Exception:
                pass

    if not extracted_text:
        return {"extracted": "", "translated": "No text detected in this image.", "engine": ocr_engine}

    # ── Step 3: Translate extracted text ─────────────────────────
    try:
        if from_lang == to_lang:
            return {"extracted": extracted_text, "translated": extracted_text, "engine": ocr_engine}

        # For structured text, translate paragraph by paragraph to preserve formatting
        paragraphs = extracted_text.split("\n\n")
        translated_paras = []
        for para in paragraphs:
            if para.strip():
                # Translate line by line within paragraph to preserve bullets/structure
                lines = para.split("\n")
                translated_lines = []
                for line in lines:
                    line = line.strip()
                    if not line:
                        translated_lines.append("")
                        continue
                    try:
                        chunks = split_text(line)
                        parts  = [translate_chunk(c, from_lang, to_lang) for c in chunks]
                        translated_lines.append(" ".join(parts))
                    except Exception:
                        translated_lines.append(line)
                translated_paras.append("\n".join(translated_lines))
            else:
                translated_paras.append("")

        translated = "\n\n".join(translated_paras).strip()
        return {"extracted": extracted_text, "translated": translated, "engine": ocr_engine}
    except Exception as e:
        return {"extracted": extracted_text, "translated": f"Translation error: {e}", "engine": ocr_engine}


@app.post("/transliterate")
async def transliterate_endpoint(data: dict):
    text = (data.get("text") or "").strip()
    lang = data.get("lang", "hi")
    if not text:
        return JSONResponse(status_code=400, content={"error": "No text"})

    native = bhashini_transliterate(text, lang)
    if native:
        return {"transliterated": native, "engine": "bhashini"}

    gt_code = BHASHINI_LANG_MAP.get(lang, lang)
    words = text.split()
    results = []
    for word in words:
        try:
            url = f"https://inputtools.google.com/request?text={word}&itc={gt_code}-t-i0-und&num=1&cp=0&cs=1&ie=utf-8&oe=utf-8&app=demopage"
            r = requests.get(url, timeout=5)
            if r.ok:
                d = r.json()
                if d[0] == "SUCCESS" and d[1] and d[1][0] and d[1][0][1]:
                    results.append(d[1][0][1][0])
                    continue
        except Exception:
            pass
        results.append(word)
    return {"transliterated": " ".join(results), "engine": "google-input-tools"}


@app.get("/ping")
def ping():
    return {
        "status": "alive",
        "version": "3.0",
        "bhashini": "connected" if bhashini_available() else "not configured — using gTTS+Google fallback",
        "vision_api": "configured" if GOOGLE_VISION_API_KEY else "not configured — using Tesseract fallback",
        "timestamp": int(time.time())
    }

@app.get("/")
def home():
    return {
        "app": "Vaani API",
        "version": "3.0",
        "bhashini": bhashini_available(),
        "vision_api": bool(GOOGLE_VISION_API_KEY),
        "endpoints": ["/translate", "/speak", "/asr", "/image-translate", "/transliterate", "/ping"]
    }
