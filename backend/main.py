"""
Vaani Backend — FastAPI  v2.0
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

All Bhashini calls are wrapped in try/except — app NEVER crashes if
Bhashini is unconfigured or down.
═══════════════════════════════════════════════════════════════════
"""

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from gtts import gTTS
from gtts.lang import tts_langs
from deep_translator import GoogleTranslator
import pytesseract
from PIL import Image, ImageEnhance, ImageFilter
import requests, io, os, re, json, base64, hashlib, time
from functools import lru_cache

app = FastAPI(title="Vaani API", version="2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ══════════════════════════════════════════════════════════════════
# BHASHINI CONFIG
# Set these environment variables in Render/Railway/etc.
# Without them the app still works — it falls back to Google.
# ══════════════════════════════════════════════════════════════════
BHASHINI_USER_ID        = os.environ.get("BHASHINI_USER_ID", "")
BHASHINI_ULCA_API_KEY   = os.environ.get("BHASHINI_ULCA_API_KEY", "")
BHASHINI_INFERENCE_KEY  = os.environ.get("BHASHINI_INFERENCE_KEY", "")

BHASHINI_PIPELINE_URL   = "https://meity-auth.ulcacontrib.org/ulca/apis/v0/model/getModelsPipeline"
BHASHINI_INFER_URL      = "https://dhruva-api.bhashini.gov.in/services/inference/pipeline"

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

# ── Simple in-memory translation cache (avoids repeat API calls) ──
_trans_cache: dict = {}
_cache_max = 2000

def cache_get(key: str):
    return _trans_cache.get(key)

def cache_set(key: str, value: str):
    if len(_trans_cache) >= _cache_max:
        # Remove oldest 20%
        keys = list(_trans_cache.keys())
        for k in keys[:int(_cache_max * 0.2)]:
            _trans_cache.pop(k, None)
    _trans_cache[key] = value


# ══════════════════════════════════════════════════════════════════
# BHASHINI HELPERS
# ══════════════════════════════════════════════════════════════════

def bhashini_available() -> bool:
    return bool(BHASHINI_USER_ID and BHASHINI_ULCA_API_KEY and BHASHINI_INFERENCE_KEY)

def get_bhashini_lang(code: str) -> str:
    return BHASHINI_LANG_MAP.get(code, code)

def get_bhashini_pipeline(task: str, src_lang: str, tgt_lang: str = None) -> dict | None:
    """Fetch Bhashini pipeline service ID for a given task."""
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
    """
    Romanized text → native script via Bhashini.
    E.g. 'vandukunnava' → 'వండుకున్నావా' (cook) not వందుకున్నావా (come).
    Bhashini's model is trained on Indian data — Google fails here.
    """
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
                print(f"[Bhashini Translit] '{text[:30]}' → '{native[:30]}'")
                return native
    except Exception as e:
        print(f"[Bhashini Translit/{lang}] {e}")
    return None


def bhashini_translate(text: str, src_lang: str, dest_lang: str) -> str | None:
    """
    Bhashini NMT — the BEST engine for Indian↔Indian language pairs.
    Trained on Samanantar (millions of Indian parallel sentences) +
    IndicCorp (8.5B words of actual Indian text).
    Understands colloquial Telugu/Hindi/Tamil that Google mangles.
    """
    if not bhashini_available():
        return None
    bl_src  = get_bhashini_lang(src_lang)
    bl_dest = get_bhashini_lang(dest_lang)
    if bl_src == bl_dest:
        return text
    pipeline = get_bhashini_pipeline("translation", bl_src, bl_dest)
    if not pipeline or not pipeline.get("serviceId"):
        print(f"[Bhashini NMT] No pipeline for {bl_src}→{bl_dest}")
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
                print(f"[Bhashini NMT] '{text[:30]}' → '{translated[:30]}'")
                return translated
    except Exception as e:
        print(f"[Bhashini NMT/{src_lang}→{dest_lang}] {e}")
    return None


def bhashini_tts(text: str, lang: str, gender: str = "female") -> bytes | None:
    """Bhashini TTS — human quality, gender-aware, Indian language voices."""
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
    """Bhashini ASR — Indian-accent trained speech recognition."""
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
# GOOGLE TRANSLATE HELPERS
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
    """True if Google returned phonetic/romanized output instead of a real translation."""
    if dest_lang in NON_LATIN_LANGS:
        if result and result.isascii():
            return True
    return False

def translate_romanized_robust(text: str, src_lang: str, dest_lang: str) -> str | None:
    """
    3-strategy waterfall for romanized Indian text (e.g. typing Telugu in English letters).
    Strategy 1: tw-ob client with explicit src lang (most accurate for short phrases)
    Strategy 2: auto-detect + language family check
    Strategy 3: pivot via English (most reliable fallback)
    """
    gt_src  = ROMANIZED_HINT_MAP.get(src_lang, src_lang)
    gt_dest = get_gt_code(dest_lang)

    # Strategy 1: tw-ob with explicit romanized source hint
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
                print(f"[Romanized S1] '{text[:20]}' → '{result[:20]}'")
                return result
    except Exception as e:
        print(f"[Romanized S1] {e}")

    # Strategy 2: auto-detect
    try:
        data   = _gtx_call(text, "auto", gt_dest, dt_flags=["t","ld"])
        result = _extract_translation(data)
        if result and not _is_phonetic_only(result, dest_lang):
            print(f"[Romanized S2] '{text[:20]}' → '{result[:20]}'")
            return result
    except Exception as e:
        print(f"[Romanized S2] {e}")

    # Strategy 3: romanized → English → target (pivot)
    try:
        data_en  = _gtx_call(text, "auto", "en")
        english  = _extract_translation(data_en)
        if english and english.lower() != text.lower():
            if dest_lang == "en" or gt_dest == "en":
                return english
            data_final = _gtx_call(english, "en", gt_dest)
            result = _extract_translation(data_final)
            if result and not _is_phonetic_only(result, dest_lang):
                print(f"[Romanized S3] pivot '{text[:20]}' → EN '{english[:20]}' → '{result[:20]}'")
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
# OCR CONFIG
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
    # Convert to grayscale
    if image.mode != 'L':
        image = image.convert('L')
    # Increase contrast
    enhancer = ImageEnhance.Contrast(image)
    image = enhancer.enhance(2.0)
    # Sharpen
    image = image.filter(ImageFilter.SHARPEN)
    # Scale up small images (Tesseract works better at 300 DPI+)
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
    """
    Main translation endpoint.
    Priority: Bhashini NMT → Google romanized waterfall → Google Translate
    """
    text      = (data.get("text") or "").strip()
    src       = data.get("from_lang", "auto")
    dest      = data.get("to_lang", "en")

    if not text:
        return JSONResponse(status_code=400, content={"error": "No text provided"})

    # Same-language shortcut
    if src == dest and src != "auto":
        return {"translated": text, "engine": "passthrough"}

    # Cache check
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

    # ── Step A: Bhashini transliteration for romanized input ──────
    if is_romanized and bhashini_available():
        native = bhashini_transliterate(text, src)
        if native and not native.isascii():
            working_text = native
            print(f"[Translate] Bhashini translit: '{text[:20]}' → '{native[:20]}'")

    # ── Step B: Bhashini NMT (best for Indian→Indian pairs) ───────
    if bhashini_available() and working_src != "auto":
        result = bhashini_translate(working_text, working_src, dest)
        if result and result.strip():
            cache_set(cache_key, result)
            return {"translated": result, "engine": "bhashini"}

    # ── Step C: Romanized Google waterfall (if Bhashini unavailable)
    if is_romanized:
        result = translate_romanized_robust(text, src, dest)
        if result and result.strip():
            cache_set(cache_key, result)
            return {"translated": result, "engine": "google-romanized"}
        working_src = "auto"

    # ── Step D: Google Translate fallback ────────────────────────
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
    """TTS endpoint. Bhashini first (gender-aware), gTTS fallback."""
    text   = (data.get("text") or "").strip()
    lang   = data.get("lang", "en")
    gender = data.get("gender", "female")

    if not text:
        return JSONResponse(status_code=400, content={"error": "No text"})

    if gender not in ("male", "female"):
        gender = "female"

    print(f"[TTS] lang={lang} gender={gender} text='{text[:40]}'")

    # Try Bhashini TTS first (human voice, gender-aware)
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

    # gTTS fallback
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
        # Last resort: English gTTS
        try:
            tts = gTTS(text=text, lang="en")
            tts.save("/tmp/vaani_out.mp3")
            return FileResponse("/tmp/vaani_out.mp3", media_type="audio/mpeg",
                                headers={"X-TTS-Engine": "gtts-en-fallback"})
        except Exception as e2:
            return JSONResponse(status_code=500, content={"error": str(e2)})


@app.post("/asr")
async def asr_endpoint(data: dict):
    """Bhashini ASR endpoint for server-side speech recognition."""
    audio_b64 = data.get("audio_b64", "")
    lang      = data.get("lang", "hi")
    if not audio_b64:
        return JSONResponse(status_code=400, content={"error": "No audio"})
    transcript = bhashini_asr(audio_b64, lang)
    if transcript:
        return {"transcript": transcript, "engine": "bhashini"}
    return JSONResponse(status_code=503,
                        content={"error": "Bhashini ASR unavailable — use browser mic"})


@app.post("/image-translate")
async def image_translate(
    file: UploadFile = File(...),
    from_lang: str   = Form("en"),
    to_lang: str     = Form("en")
):
    """OCR + translate. Enhanced preprocessing for Indian scripts."""
    contents = await file.read()
    image    = Image.open(io.BytesIO(contents))

    # Preprocess for better OCR accuracy
    processed = preprocess_image_for_ocr(image)

    tess_lang = TESS_LANG_MAP.get(from_lang, "eng")

    # Try language-specific OCR first, then fall back to eng+script combo
    extracted_text = ""
    for attempt_lang in [tess_lang, f"{tess_lang}+eng", "eng"]:
        try:
            text = pytesseract.image_to_string(processed, lang=attempt_lang,
                                               config="--oem 3 --psm 6")
            text = text.strip()
            if text and len(text) > 2:
                extracted_text = text
                break
        except Exception:
            continue

    if not extracted_text:
        # Try original unprocessed image as last resort
        try:
            extracted_text = pytesseract.image_to_string(image, lang="eng").strip()
        except Exception:
            pass

    if not extracted_text:
        return {"extracted": "", "translated": "No text detected in this image."}

    # Translate extracted text
    try:
        chunks = split_text(extracted_text)
        parts  = [translate_chunk(c, from_lang, to_lang) for c in chunks]
        return {"extracted": extracted_text, "translated": " ".join(parts)}
    except Exception as e:
        return {"extracted": extracted_text, "translated": f"Translation error: {e}"}


@app.post("/transliterate")
async def transliterate_endpoint(data: dict):
    """Convert romanized Indian text to native script."""
    text = (data.get("text") or "").strip()
    lang = data.get("lang", "hi")
    if not text:
        return JSONResponse(status_code=400, content={"error": "No text"})

    # Try Bhashini first
    native = bhashini_transliterate(text, lang)
    if native:
        return {"transliterated": native, "engine": "bhashini"}

    # Google Input Tools fallback (word by word)
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
        "version": "2.0",
        "bhashini": "connected" if bhashini_available() else "not configured — using gTTS+Google fallback",
        "timestamp": int(time.time())
    }

@app.get("/")
def home():
    return {
        "app": "Vaani API",
        "version": "2.0",
        "bhashini": bhashini_available(),
        "endpoints": ["/translate", "/speak", "/asr", "/image-translate", "/transliterate", "/ping"]
    }
