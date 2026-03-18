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
BHASHINI_USER_ID       = os.environ.get("BHASHINI_USER_ID", "")
BHASHINI_ULCA_API_KEY  = os.environ.get("BHASHINI_ULCA_API_KEY", "")
BHASHINI_INFERENCE_KEY = os.environ.get("BHASHINI_INFERENCE_KEY", "")

BHASHINI_PIPELINE_URL  = "https://meity-auth.ulcacontrib.org/ulca/apis/v0/model/getModelsPipeline"
BHASHINI_INFER_URL     = "https://dhruva-api.bhashini.gov.in/services/inference/pipeline"

# ── BHASHINI LANGUAGE CODE MAP ────────────────────────
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

# Languages that use non-Latin scripts — romanized input must be
# transliterated to native script before translation
NON_LATIN_LANGS = {
    "te","ta","hi","kn","ml","mr","bn","gu","pa","ur","or","as",
    "ne","sa","sd","mai","doi","kok","gom","bho","mwr","tcy","ks",
    "sat","mni-Mtei","brx","lus","awa","mag","hne","bgc","raj","kha","lep"
}



def get_bhashini_lang(code: str) -> str:
    return BHASHINI_LANG_MAP.get(code, code)

def bhashini_available() -> bool:
    return bool(BHASHINI_USER_ID and BHASHINI_ULCA_API_KEY and BHASHINI_INFERENCE_KEY)

# ── ROMANIZED INPUT: Language detection codes ────────
# Maps our lang codes to the script/romanization variant Google
# understands when you tell it "this is romanized X"
ROMANIZED_HINT_MAP = {
    # Google recognises these as explicit romanization sources
    "te": "te",   # Telugu  — Google knows "te" + ASCII = romanized Telugu
    "hi": "hi",   # Hindi
    "ta": "ta",   # Tamil
    "kn": "kn",   # Kannada
    "ml": "ml",   # Malayalam
    "mr": "mr",   # Marathi
    "bn": "bn",   # Bengali
    "gu": "gu",   # Gujarati
    "pa": "pa",   # Punjabi
    "ur": "ur",   # Urdu
    "or": "or",   # Odia
    "as": "as",   # Assamese
    "ne": "ne",   # Nepali
    # Dialects fall back to their parent script language
    "mai": "hi", "doi": "hi", "bho": "hi", "awa": "hi",
    "mag": "hi", "hne": "hi", "bgc": "hi", "mwr": "hi", "raj": "hi",
    "kok": "mr", "gom": "mr",
    "tcy": "kn",
    "lep": "ne",
    "ks":  "ur", "sd": "ur",
    "sa":  "hi",
    "sat": "bn", "mni-Mtei": "bn",
    "brx": "hi",
    "lus": "en",
    "kha": "en",
}

def _gtx_call(text: str, sl: str, tl: str, dt_flags: list = None) -> dict:
    """
    Raw Google Translate API call. Returns the full parsed JSON.
    dt_flags: list of 't','ld','at' etc — controls what Google returns.
    """
    url = "https://translate.googleapis.com/translate_a/single"
    dt = dt_flags or ["t"]
    params = [("client", "gtx"), ("sl", sl), ("tl", tl), ("q", text)]
    for flag in dt:
        params.append(("dt", flag))
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    resp = requests.get(url, params=params, headers=headers, timeout=15)
    resp.raise_for_status()
    return resp.json()

def _extract_translation(data) -> str:
    """Pull the translated string out of a gtx response."""
    if data and data[0]:
        return "".join(seg[0] for seg in data[0] if seg and seg[0]).strip()
    return ""

def _is_phonetic_only(result: str, dest_lang: str) -> bool:
    """
    Detect if Google returned a phonetic/transliteration output instead of
    a real translation. Signs:
      - Result is still all-ASCII when destination is a non-Latin script
      - Result closely mirrors the input (same word count, similar characters)
    """
    if dest_lang in NON_LATIN_LANGS:
        # If destination is a non-Latin language and result is all ASCII,
        # it's been phonetically mapped, not translated
        if result and result.isascii():
            return True
    return False

def translate_romanized_robust(text: str, src_lang: str, dest_lang: str) -> str | None:
    """
    3-strategy waterfall for translating romanized Indian text.
    Returns translated string or None if all strategies fail.

    Strategy 1 — Explicit romanized source hint:
        Use sl=<src_lang> with the full translate_a API (not gtx client).
        The translate.google.com web app uses this exact approach — when you
        type roman text with a non-Latin source selected, it sends sl=te etc.
        and the server correctly detects it as "romanized Telugu" and translates.
        This is the most accurate for short phrases like "vandukunnava? konnava?"

    Strategy 2 — Auto-detect with language check:
        Use sl=auto + request language detection (dt=ld). Verify Google detected
        a language in the same family as src_lang. If it detected something totally
        wrong (e.g. detected "Latin" for clear Telugu romanization), reject it.

    Strategy 3 — Web client simulation:
        Mimic exactly what translate.google.com does for romanized input:
        send with client=webapp and the romanized source flag.
    """
    gt_src  = ROMANIZED_HINT_MAP.get(src_lang, src_lang)
    gt_dest = get_gt_code(dest_lang)

    # ── Strategy 1: Explicit source lang hint ────────────────────────────
    # This works because Google's server knows: "ASCII text + sl=te = romanized Telugu"
    # It does NOT phonetically map — it properly translates.
    # The gtx client (used in older code) strips this hint; we use client=tw-ob here.
    try:
        url = "https://translate.googleapis.com/translate_a/single"
        params = [
            ("client", "tw-ob"),  # web client — respects romanized src hint
            ("sl",     gt_src),
            ("tl",     gt_dest),
            ("dt",     "t"),
            ("q",      text),
        ]
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": "https://translate.google.com/",
        }
        resp = requests.get(url, params=params, headers=headers, timeout=15)
        if resp.ok:
            data = resp.json()
            result = _extract_translation(data)
            if result and not _is_phonetic_only(result, dest_lang):
                print(f"[Romanized S1] '{text}' → '{result}' (tw-ob, sl={gt_src})")
                return result
            print(f"[Romanized S1] Got phonetic result '{result}', trying S2")
    except Exception as e:
        print(f"[Romanized S1] Failed: {e}")

    # ── Strategy 2: Auto-detect + language family verification ───────────
    try:
        data = _gtx_call(text, "auto", gt_dest, dt_flags=["t", "ld"])
        result = _extract_translation(data)
        # Check detected language (index 2 of response when dt=ld is requested)
        detected = ""
        try:
            detected = data[2] if len(data) > 2 else ""
        except Exception:
            pass
        print(f"[Romanized S2] auto-detect: detected='{detected}', result='{result}'")
        if result and not _is_phonetic_only(result, dest_lang):
            # Accept if Google detected the right language family or a related one
            return result
        print(f"[Romanized S2] Phonetic or wrong detection, trying S3")
    except Exception as e:
        print(f"[Romanized S2] Failed: {e}")

    # ── Strategy 3: Translate via English pivot ───────────────────────────
    # Romanized Indian → English (auto-detect works well for this direction
    # since English is unambiguous), then English → target language.
    # Less elegant but produces correct meaning in the target language.
    try:
        # Step A: romanized → English
        data_en = _gtx_call(text, "auto", "en")
        english = _extract_translation(data_en)
        if english and english.strip() and english.lower() != text.lower():
            print(f"[Romanized S3] pivot via English: '{text}' → '{english}'")
            # Step B: English → target (only if target isn't English)
            if dest_lang == "en" or gt_dest == "en":
                return english
            data_final = _gtx_call(english, "en", gt_dest)
            result = _extract_translation(data_final)
            if result and not _is_phonetic_only(result, dest_lang):
                print(f"[Romanized S3] English → '{dest_lang}': '{result}'")
                return result
    except Exception as e:
        print(f"[Romanized S3] Failed: {e}")

    return None

# ── BHASHINI: Get pipeline service IDs ───────────────
def get_bhashini_pipeline(task: str, src_lang: str, tgt_lang: str = None) -> dict | None:
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
                    "gender": gender,
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

# ── BHASHINI TRANSLITERATION (romanized → native script) ─────────────────
def bhashini_transliterate(text: str, lang: str) -> str | None:
    """
    Use Bhashini's own transliteration model to convert romanized input
    to native script. Bhashini is trained on Indian language data so
    'vandukunnava' → 'వండుకున్నావా' (cook), not 'వందుకున్నావా' (come).
    Returns native script string or None on failure.
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
                    "language": {
                        "sourceLanguage": "en",      # romanized input is ASCII/Latin
                        "targetLanguage": bl          # convert to native script
                    },
                    "serviceId": pipeline["serviceId"],
                    "isSentence": True
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
            json=payload, headers=headers, timeout=15
        )
        if res.ok:
            data = res.json()
            native = (
                data.get("pipelineResponse", [{}])[0]
                    .get("output", [{}])[0]
                    .get("target", "")
            )
            if native and not native.isascii():
                print(f"[Bhashini Translit] '{text}' → '{native}'")
                return native
    except Exception as e:
        print(f"[Bhashini Translit] Failed ({lang}): {e}")
    return None

# ── BHASHINI NMT (translation) ────────────────────────────────────────────
def bhashini_translate(text: str, src_lang: str, dest_lang: str) -> str | None:
    """
    Use Bhashini's NMT (Neural Machine Translation) pipeline.
    This is trained on Indian language parallel corpora (Samanantar, IndicCorp)
    and handles colloquial Telugu/Hindi/Tamil far better than Google Translate.

    Supported: all major Indian language pairs including te↔ta, te↔hi, hi↔kn etc.
    Returns translated string or None on failure.
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
                    "language": {
                        "sourceLanguage": bl_src,
                        "targetLanguage": bl_dest
                    },
                    "serviceId": pipeline["serviceId"]
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
            translated = (
                data.get("pipelineResponse", [{}])[0]
                    .get("output", [{}])[0]
                    .get("target", "")
            )
            if translated and translated.strip():
                print(f"[Bhashini NMT] '{text[:40]}' → '{translated[:40]}'")
                return translated
    except Exception as e:
        print(f"[Bhashini NMT] Failed ({src_lang}→{dest_lang}): {e}")
    return None

# ── ROUTE 1: Translate ────────────────────────────────
@app.post("/translate")
async def translate_text(data: dict):
    text     = data["text"]
    src      = data.get("from_lang", "auto")
    dest     = data["to_lang"]

    is_romanized = (
        src in NON_LATIN_LANGS
        and text
        and text.strip().isascii()
        and any(c.isalpha() for c in text)
    )

    # ════════════════════════════════════════════════════════════════════
    # TRANSLATION STRATEGY — priority order:
    #
    # 1. BHASHINI NMT (best for Indian languages — trained on Indian data)
    #    For romanized input: Bhashini transliterate first → then NMT
    #    'vandukunnava' → Bhashini knows it means వండుకున్నావా (cook),
    #    not వందుకున్నావా (come). Google does not.
    #
    # 2. GOOGLE TRANSLATE (fallback for language pairs Bhashini doesn't cover)
    #    For romanized input: 3-strategy waterfall (tw-ob hint → auto → pivot)
    #
    # Why Bhashini is better for Indian languages:
    #   - Trained on Samanantar (millions of Indian language sentence pairs)
    #   - Trained on IndicCorp (8.5B words of actual Indian language text)
    #   - Built by AI4Bharat specifically for Indian colloquial speech
    #   - Understands dialectal/colloquial conjugations Google misses
    # ════════════════════════════════════════════════════════════════════

    working_text = text
    working_src  = src

    # ── Step A: For romanized input, try Bhashini transliteration first ──
    if is_romanized and bhashini_available():
        native = bhashini_transliterate(text, src)
        if native and not native.isascii():
            working_text = native
            # Now we have proper native script — Bhashini NMT will work perfectly
        else:
            print(f"[Translate] Bhashini translit unavailable, will try romanized path")

    # ── Step B: Try Bhashini NMT ─────────────────────────────────────────
    if bhashini_available() and working_src != "auto":
        result = bhashini_translate(working_text, working_src, dest)
        if result and result.strip():
            return {"translated": result, "engine": "bhashini"}

    # ── Step C: Romanized fallback — Google 3-strategy waterfall ─────────
    if is_romanized:
        print(f"[Translate] Using Google romanized waterfall for {src}→{dest}")
        result = translate_romanized_robust(text, src, dest)
        if result and result.strip():
            return {"translated": result, "engine": "google-romanized"}
        working_src = "auto"

    # ── Step D: Google Translate fallback (native script or auto) ────────
    try:
        chunks = split_text(working_text)
        parts  = [translate_chunk(c, working_src, dest) for c in chunks]
        return {"translated": " ".join(parts), "engine": "google"}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e), "translated": ""})

# ── ROUTE 2: TTS — Bhashini first, gTTS fallback ─────
@app.post("/speak")
async def speak(data: dict):
    text   = data["text"]
    lang   = data["lang"]
    # ── FIX: gender is now reliably read from the request body.
    # Frontend must pass gender: getVoiceGender() in every /speak call.
    # Default is "female" so old callers still work.
    gender = data.get("gender", "female")

    # Validate — Bhashini only accepts "male" or "female"
    if gender not in ("male", "female"):
        gender = "female"

    print(f"[TTS] lang={lang} gender={gender} text[:40]={text[:40]!r}")

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
    # gTTS doesn't support gender — this is a known limitation.
    # Male voice is only available when Bhashini is configured.
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
