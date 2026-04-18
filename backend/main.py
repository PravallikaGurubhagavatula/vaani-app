"""
Vaani Backend — FastAPI  v4.0
═══════════════════════════════════════════════════════════════════
TRANSLATION PRIORITY (most Indian-accurate first):
  1. Bhashini NMT     — trained on Indian data (Samanantar)
  2. Google Cloud Translation API v2 — official, accurate detection
  3. Google tw-ob     — romanized-aware waterfall (3 strategies)
  4. deep_translator / gtx — final fallback

CLAUDE PROXY:
  /claude-translate   — browser calls this, server calls Anthropic
  Completely eliminates the CORS error from humanTranslator.js

KEY FIXES in v4.0:
  - app = FastAPI() is at the TOP (was wrongly placed mid-file)
  - /claude-translate proxy endpoint added
  - Google Cloud Translation API v2 added (proper language detection)
  - /translate updated with auto-detection + new engine cascade
  - Mixed Telugu+English romanized text now detected correctly
═══════════════════════════════════════════════════════════════════
"""

# ══════════════════════════════════════════════════════════════════
# IMPORTS
# ══════════════════════════════════════════════════════════════════
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from gtts import gTTS
from gtts.lang import tts_langs
from deep_translator import GoogleTranslator
import pytesseract
from PIL import Image, ImageEnhance, ImageFilter
import requests, io, os, re, json, base64, time
import anthropic
from translation_pipeline import translate_pipeline
from transliteration import transliterate_romanized
from language_detection import detect_language

# ══════════════════════════════════════════════════════════════════
# APP INIT  ← MUST be at the top, before any @app routes
# ══════════════════════════════════════════════════════════════════
app = FastAPI(title="Vaani API", version="4.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ══════════════════════════════════════════════════════════════════
# ENVIRONMENT VARIABLES / API KEYS
# ══════════════════════════════════════════════════════════════════
BHASHINI_USER_ID         = os.environ.get("BHASHINI_USER_ID", "")
BHASHINI_ULCA_API_KEY    = os.environ.get("BHASHINI_ULCA_API_KEY", "")
BHASHINI_INFERENCE_KEY   = os.environ.get("BHASHINI_INFERENCE_KEY", "")
BHASHINI_PIPELINE_URL    = "https://meity-auth.ulcacontrib.org/ulca/apis/v0/model/getModelsPipeline"
BHASHINI_INFER_URL       = "https://dhruva-api.bhashini.gov.in/services/inference/pipeline"

GOOGLE_VISION_API_KEY    = os.environ.get("GOOGLE_VISION_API_KEY", "")
GOOGLE_VISION_URL        = "https://vision.googleapis.com/v1/images:annotate"

ANTHROPIC_API_KEY        = os.environ.get("ANTHROPIC_API_KEY", "")
GOOGLE_TRANSLATE_API_KEY = os.environ.get("GOOGLE_TRANSLATE_API_KEY", "")

# ══════════════════════════════════════════════════════════════════
# LANGUAGE CODE MAPS
# ══════════════════════════════════════════════════════════════════

BHASHINI_LANG_MAP = {
    "as":"as","bn":"bn","brx":"brx","doi":"doi","gu":"gu","hi":"hi",
    "kn":"kn","ks":"ks","kok":"kok","mai":"mai","ml":"ml","mni-Mtei":"mni",
    "mr":"mr","ne":"ne","or":"or","pa":"pa","sa":"sa","sat":"sat",
    "sd":"sd","ta":"ta","te":"te","ur":"ur","bho":"bho","mwr":"raj",
    "tcy":"tcy","lus":"lus","en":"en","gom":"kok","awa":"hi","mag":"hi",
    "hne":"hi","bgc":"hi","raj":"raj","kha":"kha","lep":"ne",
}

# Languages that use non-Latin scripts — romanized input needs special handling
NON_LATIN_LANGS = {
    "te","ta","hi","kn","ml","mr","bn","gu","pa","ur","or","as",
    "ne","sa","sd","mai","doi","kok","gom","bho","mwr","tcy","ks",
    "sat","mni-Mtei","brx","lus","awa","mag","hne","bgc","raj","kha","lep"
}

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

# Google Cloud Translation API v2 code map
GOOGLE_CLOUD_CODE_MAP = {
    "mni-Mtei":"mni","kok":"gom","gom":"gom","awa":"hi","mag":"hi",
    "hne":"hi","bgc":"hi","mwr":"mwr","tcy":"kn","lus":"lus","kha":"kha",
    "lep":"ne","trp":"bn","lmn":"te","bho":"bho","doi":"doi","sd":"sd",
    "brx":"brx","sat":"sat","raj":"raj",
}

LANG_NAMES_FOR_PROMPT = {
    "te":"Telugu",    "hi":"Hindi",       "ta":"Tamil",
    "kn":"Kannada",   "ml":"Malayalam",   "bn":"Bengali",
    "mr":"Marathi",   "gu":"Gujarati",    "pa":"Punjabi",
    "ur":"Urdu",      "or":"Odia",        "as":"Assamese",
    "sa":"Sanskrit",  "ne":"Nepali",      "sd":"Sindhi",
    "mai":"Maithili", "bho":"Bhojpuri",   "kok":"Konkani",
    "ks":"Kashmiri",  "doi":"Dogri",      "brx":"Bodo",
    "sat":"Santali",  "mwr":"Marwari",    "tcy":"Tulu",
    "lus":"Mizo",     "awa":"Awadhi",     "mag":"Magahi",
    "hne":"Chhattisgarhi","bgc":"Haryanvi","raj":"Rajasthani",
    "kha":"Khasi",    "lep":"Lepcha",     "mni":"Meitei",
    "en":"English",   "auto":"auto-detected Indian language",
}

# ══════════════════════════════════════════════════════════════════
# IN-MEMORY TRANSLATION CACHE
# ══════════════════════════════════════════════════════════════════
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
# BHASHINI HELPERS
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
# GOOGLE CLOUD TRANSLATION API v2
# Official API — much better language detection than gtx
# Especially for romanized Indian text mixed with English
# ══════════════════════════════════════════════════════════════════

def google_translate_api_v2(text: str, src_lang: str, dest_lang: str) -> str | None:
    """
    Official Google Cloud Translation API v2.
    When src_lang is "auto" or not provided, Google auto-detects.
    This correctly handles mixed Telugu+English like "ni profile appeared here".
    """
    if not GOOGLE_TRANSLATE_API_KEY:
        return None

    gt_src  = GOOGLE_CLOUD_CODE_MAP.get(src_lang, src_lang)
    gt_dest = GOOGLE_CLOUD_CODE_MAP.get(dest_lang, dest_lang)

    try:
        url = "https://translation.googleapis.com/language/translate/v2"
        params = {
            "key":    GOOGLE_TRANSLATE_API_KEY,
            "q":      text,
            "target": gt_dest,
            "format": "text",
        }
        # Only specify source if we are confident — otherwise let Google detect
        if gt_src and gt_src not in ("auto", "romanized", "romanized_te", "romanized_hi"):
            params["source"] = gt_src

        resp = requests.post(url, params=params, timeout=15)
        if not resp.ok:
            print(f"[Google Cloud Translate] HTTP {resp.status_code}: {resp.text[:200]}")
            return None

        data = resp.json()
        translations = data.get("data", {}).get("translations", [])
        if translations:
            result = translations[0].get("translatedText", "").strip()
            detected = translations[0].get("detectedSourceLanguage", "")
            if detected:
                print(f"[Google Cloud Translate] detected source: {detected}")
            if result and result.lower() != text.lower():
                return result
    except Exception as e:
        print(f"[Google Cloud Translate] Exception: {e}")

    return None


def detect_language_google_api(text: str) -> str | None:
    """
    Use Google Cloud Translation API to detect the actual language.
    Critical for mixed-language messages like "ni profile appeared here"
    where auto-detection often wrongly returns 'en'.
    """
    if not GOOGLE_TRANSLATE_API_KEY:
        return None
    try:
        url    = "https://translation.googleapis.com/language/translate/v2/detect"
        params = {"key": GOOGLE_TRANSLATE_API_KEY, "q": text}
        resp   = requests.post(url, params=params, timeout=10)
        if resp.ok:
            data       = resp.json()
            detections = data.get("data", {}).get("detections", [[]])
            if detections and detections[0]:
                detected   = detections[0][0]
                lang       = detected.get("language", "")
                confidence = detected.get("confidence", 0)
                if lang and confidence > 0.4:
                    print(f"[Google Detect] '{text[:40]}' → {lang} (conf={confidence:.2f})")
                    return lang
    except Exception as e:
        print(f"[Google Detect API] Exception: {e}")
    return None

# ══════════════════════════════════════════════════════════════════
# GOOGLE TRANSLATE (unofficial gtx / tw-ob) — FALLBACK
# ══════════════════════════════════════════════════════════════════

def get_gt_code(lang: str) -> str:
    return GT_CODE_MAP.get(lang, lang)

def _gtx_call(text: str, sl: str, tl: str, dt_flags: list = None) -> dict:
    url    = "https://translate.googleapis.com/translate_a/single"
    dt     = dt_flags or ["t"]
    params = [("client","gtx"),("sl",sl),("tl",tl),("q",text)]
    for f in dt:
        params.append(("dt", f))
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
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
    """
    3-strategy romanized translation waterfall.
    Strategy 1: tw-ob with known source hint
    Strategy 2: gtx auto-detect
    Strategy 3: Translate to English first, then pivot to target
    """
    gt_src  = ROMANIZED_HINT_MAP.get(src_lang, src_lang)
    gt_dest = get_gt_code(dest_lang)

    # Strategy 1: tw-ob with source hint
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

    # Strategy 2: gtx auto-detect
    try:
        data   = _gtx_call(text, "auto", gt_dest, dt_flags=["t","ld"])
        result = _extract_translation(data)
        if result and not _is_phonetic_only(result, dest_lang):
            return result
    except Exception as e:
        print(f"[Romanized S2] {e}")

    # Strategy 3: English pivot
    try:
        data_en = _gtx_call(text, "auto", "en")
        english = _extract_translation(data_en)
        if english and english.lower() != text.lower():
            if dest_lang in ("en", gt_dest) and gt_dest == "en":
                return english
            data_final = _gtx_call(english, "en", gt_dest)
            result = _extract_translation(data_final)
            if result and not _is_phonetic_only(result, dest_lang):
                return result
    except Exception as e:
        print(f"[Romanized S3] {e}")

    return None

def gtx_translate(text: str, src: str, dest: str) -> str:
    url    = "https://translate.googleapis.com/translate_a/single"
    params = {"client":"gtx","sl":src,"tl":dest,"dt":"t","q":text}
    headers = {"User-Agent": "Mozilla/5.0"}
    resp   = requests.get(url, params=params, headers=headers, timeout=15)
    resp.raise_for_status()
    data   = resp.json()
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

# ══════════════════════════════════════════════════════════════════
# CLAUDE TRANSLATION PROXY
# Browser → this endpoint → Anthropic API (no CORS error)
# ══════════════════════════════════════════════════════════════════

def _build_claude_prompt(text: str, from_lang: str, to_lang: str, machine_translation: str = "") -> str:
    src_name = LANG_NAMES_FOR_PROMPT.get(from_lang, from_lang)
    tgt_name = LANG_NAMES_FOR_PROMPT.get(to_lang, to_lang)

    return f"""You are a human interpreter specialising in Indian languages for a chat app called Vaani.
Produce a natural, conversational {tgt_name} translation of the message below.

SOURCE LANGUAGE: {src_name}
TARGET LANGUAGE: {tgt_name}
ORIGINAL MESSAGE: {text}
MACHINE TRANSLATION (reference only, may be wrong): {machine_translation or "(unavailable)"}

RULES — read every rule carefully:
1. Understand the MEANING and INTENT — not just individual words.
2. Detect TONE: casual / friendly / question / emotional / excited / urgent / respectful.
3. If the input is a QUESTION, output must be a question.
4. If it is an EXCLAMATION with repeated characters (like "Pikaaaaaaa"), keep the energy and emotion — do NOT flatten it.
5. For MIXED-LANGUAGE input (e.g. a Telugu word + English words), translate the WHOLE sentence as one unit.
6. Example: "Ni profile appeared here" — "Ni" = Telugu for "Your" → translate as "Your profile appeared here."
7. "raa" at the end is a Telugu casual particle (like "bro") — translate naturally.
8. Preserve slang markers that exist naturally in the original. Do NOT add slang that was not there.
9. NEVER produce a single-word output for a multi-word input.
10. Output ONLY the final translation. No explanation, no quotes, no prefix like "Translation:".

Translate now:"""


@app.post("/claude-translate")
async def claude_translate_proxy(data: dict):
    """
    Proxy: browser calls this → server calls Anthropic → no CORS.
    Also accepts machine_translation as a reference for Claude.
    """
    text                = (data.get("text") or "").strip()
    from_lang           = data.get("from_lang", "auto")
    to_lang             = data.get("to_lang", "en")
    machine_translation = (data.get("machine_translation") or "").strip()

    if not text:
        return JSONResponse(status_code=400, content={"error": "No text provided"})

    if not ANTHROPIC_API_KEY:
        return JSONResponse(
            status_code=503,
            content={
                "error":      "ANTHROPIC_API_KEY not set on server",
                "translated": machine_translation or text
            }
        )

    # Cache check
    cache_key = f"claude||{text}||{from_lang}||{to_lang}"
    cached = cache_get(cache_key)
    if cached:
        return {"translated": cached, "engine": "claude-cached"}

    try:
        client  = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        prompt  = _build_claude_prompt(text, from_lang, to_lang, machine_translation)
        message = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=500,
            messages=[{"role": "user", "content": prompt}]
        )

        result = ""
        for block in message.content:
            if block.type == "text":
                result += block.text
        result = result.strip().strip('"\'').strip()

        if not result:
            return JSONResponse(
                status_code=500,
                content={"error": "Empty response from Claude", "translated": machine_translation or text}
            )

        # Reject passthrough
        if result.lower() == text.lower():
            return {"translated": machine_translation or text, "engine": "claude-passthrough-fallback"}

        cache_set(cache_key, result)
        print(f"[Claude Proxy] '{text[:40]}' ({from_lang}→{to_lang}) → '{result[:40]}'")
        return {"translated": result, "engine": "claude"}

    except anthropic.APIError as e:
        print(f"[Claude Proxy] Anthropic API error: {e}")
        return JSONResponse(
            status_code=502,
            content={"error": str(e), "translated": machine_translation or text}
        )
    except Exception as e:
        print(f"[Claude Proxy] Unexpected error: {e}")
        return JSONResponse(
            status_code=500,
            content={"error": str(e), "translated": machine_translation or text}
        )

# ══════════════════════════════════════════════════════════════════
# GOOGLE VISION OCR
# ══════════════════════════════════════════════════════════════════

def google_vision_ocr(image_bytes: bytes, lang_hint: str = "en") -> dict:
    if not GOOGLE_VISION_API_KEY:
        return None
    lang_hint_map = {
        "te":"te","ta":"ta","hi":"hi","kn":"kn","ml":"ml","mr":"mr",
        "bn":"bn","gu":"gu","pa":"pa","ur":"ur","or":"or","as":"as",
        "ne":"ne","sa":"sa","en":"en","sd":"ur","mai":"hi","doi":"hi",
        "kok":"mr","bho":"hi","mwr":"hi","tcy":"kn","ks":"ur",
    }
    bcp47 = lang_hint_map.get(lang_hint, "en")
    try:
        img_b64 = base64.b64encode(image_bytes).decode("utf-8")
        payload = {
            "requests": [{
                "image": {"content": img_b64},
                "features": [{"type": "DOCUMENT_TEXT_DETECTION", "maxResults": 1}],
                "imageContext": {"languageHints": [bcp47, "en"]}
            }]
        }
        resp = requests.post(
            f"{GOOGLE_VISION_URL}?key={GOOGLE_VISION_API_KEY}",
            json=payload, timeout=30
        )
        if not resp.ok:
            return None
        data      = resp.json()
        responses = data.get("responses", [{}])
        if not responses:
            return None
        r = responses[0]
        if "error" in r:
            return None
        full = r.get("fullTextAnnotation", {})
        if not full:
            simple = r.get("textAnnotations", [])
            if simple:
                return {"text": simple[0].get("description","").strip(), "blocks":[], "engine":"google_vision_simple"}
            return None
        return {"text": _reconstruct_vision_text(full), "blocks":[], "engine":"google_vision"}
    except Exception as e:
        print(f"[Vision API] Exception: {e}")
        return None

def _reconstruct_vision_text(full_annotation: dict) -> str:
    pages = full_annotation.get("pages", [])
    if not pages:
        return full_annotation.get("text","").strip()
    result_lines = []
    for page in pages:
        for block in page.get("blocks", []):
            block_lines = []
            for paragraph in block.get("paragraphs", []):
                para_words = []
                for word in paragraph.get("words", []):
                    word_text = ""
                    for sym in word.get("symbols", []):
                        word_text += sym.get("text","")
                        bt = sym.get("property",{}).get("detectedBreak",{}).get("type","")
                        if bt in ("LINE_BREAK","EOL_SURE_SPACE"):
                            word_text += "\n"
                        elif bt == "HYPHEN":
                            word_text += "-"
                    para_words.append(word_text)
                para_text = " ".join(para_words).strip()
                para_text = re.sub(r' +\n', '\n', para_text)
                para_text = re.sub(r'\n +', '\n', para_text)
                if para_text:
                    block_lines.append(para_text)
            if block_lines:
                result_lines.append("\n".join(block_lines))
    if result_lines:
        return "\n\n".join(result_lines).strip()
    return full_annotation.get("text","").strip()

# ══════════════════════════════════════════════════════════════════
# gTTS + TESSERACT CONFIG
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

TESS_LANG_MAP = {
    "te":"tel","ta":"tam","hi":"hin","kn":"kan","ml":"mal","mr":"mar",
    "bn":"ben","gu":"guj","pa":"pan","ur":"urd","or":"ori","as":"asm",
    "ne":"nep","sa":"san","sd":"snd","mai":"hin","doi":"hin","kok":"mar",
    "bho":"hin","mwr":"hin","tcy":"kan","ks":"urd","sat":"ben",
    "mni-Mtei":"ben","lus":"eng","brx":"hin","awa":"hin","mag":"hin",
    "hne":"hin","en":"eng",
}

def preprocess_image_for_ocr(image: Image.Image) -> Image.Image:
    if image.mode != 'L':
        image = image.convert('L')
    enhancer = ImageEnhance.Contrast(image)
    image = enhancer.enhance(2.0)
    image = image.filter(ImageFilter.SHARPEN)
    w, h = image.size
    if w < 1000:
        scale = 1000 / w
        image = image.resize((int(w*scale), int(h*scale)), Image.LANCZOS)
    return image

# ══════════════════════════════════════════════════════════════════
# ROUTES
# ══════════════════════════════════════════════════════════════════

@app.post("/translate")
async def translate_text(data: dict):
    """Unified translation/transliteration pipeline endpoint."""
    text = (data.get("text") or "").strip()
    target = data.get("target_language") or data.get("to_lang") or "en"
    source = data.get("from_lang", "auto")
    options = data.get("options") or {}

    if not text:
        return JSONResponse(status_code=400, content={"error": "No text provided"})

    try:
        result = translate_pipeline(text, target_language=target, options=options, source_hint=source)
        return {
            "original": result.original,
            "transliterated": result.transliterated,
            "translated": result.translated,
            "confidence": result.confidence,
            "source_language": result.source_language,
            "target_language": result.target_language,
            "engine": result.engine,
            "cached": result.cached,
        }
    except Exception as e:
        return JSONResponse(status_code=500, content={
            "original": text,
            "transliterated": None,
            "translated": text,
            "confidence": 0.0,
            "source_language": source if source != "auto" else "unknown",
            "target_language": target,
            "error": str(e),
        })


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
            io.BytesIO(audio_bytes), media_type="audio/mpeg",
            headers={"X-TTS-Engine":"bhashini","X-TTS-Gender":gender,"X-TTS-Lang":lang,"Cache-Control":"no-cache"}
        )
    tts_lang = get_gtts_lang(lang)
    try:
        tts = gTTS(text=text, lang=tts_lang, slow=False)
        fp  = "/tmp/vaani_out.mp3"
        tts.save(fp)
        return FileResponse(fp, media_type="audio/mpeg",
                            headers={"X-TTS-Engine":"gtts","X-TTS-Lang":tts_lang})
    except Exception as e:
        print(f"[gTTS/{tts_lang}] {e}")
        try:
            tts = gTTS(text=text, lang="en")
            tts.save("/tmp/vaani_out.mp3")
            return FileResponse("/tmp/vaani_out.mp3", media_type="audio/mpeg",
                                headers={"X-TTS-Engine":"gtts-en-fallback"})
        except Exception as e2:
            return JSONResponse(status_code=500, content={"error": str(e2)})


@app.post("/asr")
async def asr_endpoint(data: dict):
    audio_b64 = data.get("audio_b64","")
    lang      = data.get("lang","hi")
    if not audio_b64:
        return JSONResponse(status_code=400, content={"error":"No audio"})
    transcript = bhashini_asr(audio_b64, lang)
    if transcript:
        return {"transcript": transcript, "engine": "bhashini"}
    return JSONResponse(status_code=503,
                        content={"error":"Bhashini ASR unavailable — use browser mic"})


@app.post("/image-translate")
async def image_translate(
    file: UploadFile = File(...),
    from_lang: str   = Form("en"),
    to_lang: str     = Form("en")
):
    contents = await file.read()
    extracted_text = ""
    ocr_engine = "unknown"

    vision_result = google_vision_ocr(contents, from_lang)
    if vision_result and vision_result.get("text","").strip():
        extracted_text = vision_result["text"].strip()
        ocr_engine     = vision_result["engine"]
        print(f"[OCR] Vision API extracted {len(extracted_text)} chars")
    else:
        print(f"[OCR] Vision API unavailable, using Tesseract")
        image     = Image.open(io.BytesIO(contents))
        processed = preprocess_image_for_ocr(image)
        tess_lang = TESS_LANG_MAP.get(from_lang, "eng")
        for attempt_lang in [tess_lang, f"{tess_lang}+eng", "eng"]:
            try:
                text = pytesseract.image_to_string(processed, lang=attempt_lang, config="--oem 3 --psm 6").strip()
                if text and len(text) > 2:
                    extracted_text = text
                    ocr_engine     = "tesseract"
                    break
            except Exception:
                continue
        if not extracted_text:
            try:
                extracted_text = pytesseract.image_to_string(Image.open(io.BytesIO(contents)), lang="eng").strip()
                ocr_engine = "tesseract-fallback"
            except Exception:
                pass

    if not extracted_text:
        return {"extracted":"","translated":"No text detected in this image.","engine":ocr_engine}

    try:
        if from_lang == to_lang:
            return {"extracted":extracted_text,"translated":extracted_text,"engine":ocr_engine}
        paragraphs = extracted_text.split("\n\n")
        translated_paras = []
        for para in paragraphs:
            if para.strip():
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
        return {"extracted":extracted_text,"translated":translated,"engine":ocr_engine}
    except Exception as e:
        return {"extracted":extracted_text,"translated":f"Translation error: {e}","engine":ocr_engine}


@app.post("/transliterate")
async def transliterate_endpoint(data: dict):
    text = (data.get("text") or "").strip()
    lang = data.get("lang", "auto")
    if not text:
        return JSONResponse(status_code=400, content={"error": "No text"})

    detection = detect_language(text)
    if lang and lang != "auto":
        detection.language = lang
        detection.is_romanized = text.isascii()

    native = transliterate_romanized(text, detection)
    return {
        "original": text,
        "transliterated": native or text,
        "source_language": detection.language,
        "confidence": detection.confidence,
        "engine": "indic-transliteration" if native else "fallback-original",
    }


@app.get("/ping")
def ping():
    return {
        "status":           "alive",
        "version":          "4.0",
        "bhashini":         "connected" if bhashini_available() else "not configured",
        "vision_api":       "configured" if GOOGLE_VISION_API_KEY else "not configured",
        "anthropic":        "configured" if ANTHROPIC_API_KEY else "NOT SET — add ANTHROPIC_API_KEY",
        "google_translate": "configured" if GOOGLE_TRANSLATE_API_KEY else "NOT SET — add GOOGLE_TRANSLATE_API_KEY",
        "timestamp":        int(time.time())
    }

@app.get("/")
def home():
    return {
        "app":      "Vaani API",
        "version":  "4.0",
        "bhashini": bhashini_available(),
        "endpoints": [
            "/translate","/speak","/asr","/image-translate",
            "/transliterate","/claude-translate","/ping"
        ]
    }
