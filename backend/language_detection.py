import os
import re
from dataclasses import dataclass
from functools import lru_cache
from typing import Optional

SCRIPT_RANGES = {
    "te": r"[\u0C00-\u0C7F]",
    "ta": r"[\u0B80-\u0BFF]",
    "kn": r"[\u0C80-\u0CFF]",
    "ml": r"[\u0D00-\u0D7F]",
    "gu": r"[\u0A80-\u0AFF]",
    "pa": r"[\u0A00-\u0A7F]",
    "or": r"[\u0B00-\u0B7F]",
    "bn": r"[\u0980-\u09FF]",
    "hi": r"[\u0900-\u097F]",
    "ur": r"[\u0600-\u06FF]",
}

ROMANIZED_MARKERS = {
    "te": ["bagunn", "nenu", "matlad", "ippudu", "adenti", "kada", "chelli", "enti"],
    "hi": ["kya", "kaise", "nahi", "tum", "aap", "raha", "kyun"],
    "ta": ["enna", "epdi", "iruka", "unga", "saptiya", "illa"],
    "kn": ["hegiddiya", "ninna", "yaake", "iddira"],
    "ml": ["sughamano", "entha", "alle", "njan"],
}

COMMON_SLANG = {"lol", "bro", "bruh", "hehe", "lmao", "ok", "hi", "yo"}


@dataclass
class DetectionResult:
    language: str
    confidence: float
    is_romanized: bool
    is_mixed: bool


@lru_cache(maxsize=1)
def _load_fasttext_model():
    model_path = os.environ.get("FASTTEXT_MODEL_PATH", "backend/models/lid.176.bin")
    if not os.path.exists(model_path):
        return None
    try:
        import fasttext

        return fasttext.load_model(model_path)
    except Exception:
        return None


def _script_detect(text: str) -> Optional[str]:
    for lang, pattern in SCRIPT_RANGES.items():
        if re.search(pattern, text):
            return lang
    return None


def _romanized_hint(text: str) -> Optional[str]:
    lowered = f" {text.lower()} "
    best = (None, 0)
    for lang, markers in ROMANIZED_MARKERS.items():
        score = sum(1 for m in markers if f" {m}" in lowered or f"{m} " in lowered)
        if score > best[1]:
            best = (lang, score)
    return best[0] if best[1] > 0 else None


def detect_language(text: str) -> DetectionResult:
    content = (text or "").strip()
    if not content:
        return DetectionResult(language="en", confidence=1.0, is_romanized=False, is_mixed=False)

    script_lang = _script_detect(content)
    ascii_only = all(ord(ch) < 128 for ch in content if ch.strip())

    if script_lang:
        latin_exists = bool(re.search(r"[A-Za-z]", content))
        return DetectionResult(script_lang, 0.98, False, latin_exists)

    lowered_tokens = re.findall(r"[a-zA-Z']+", content.lower())
    if lowered_tokens and all(t in COMMON_SLANG for t in lowered_tokens):
        return DetectionResult("en", 0.95, False, False)

    ft_model = _load_fasttext_model()
    ft_lang = None
    ft_conf = 0.0
    if ft_model:
        try:
            labels, scores = ft_model.predict(content.replace("\n", " "), k=1)
            ft_lang = labels[0].replace("__label__", "")
            ft_conf = float(scores[0])
        except Exception:
            ft_lang, ft_conf = None, 0.0

    hint_lang = _romanized_hint(content) if ascii_only else None

    if ascii_only and hint_lang and (not ft_lang or ft_conf < 0.75 or ft_lang in {"en", "unknown"}):
        mixed = bool(re.search(r"\b(hey|bro|please|thanks|lol|ok)\b", content.lower()))
        return DetectionResult(hint_lang, max(ft_conf, 0.72), True, mixed)

    lang = ft_lang or "en"
    conf = ft_conf if ft_lang else 0.55

    indian_langs = {
        "as", "bn", "brx", "doi", "gu", "hi", "kn", "kok", "mai", "ml", "mr", "ne", "or", "pa", "sa", "sat", "sd", "ta", "te", "ur", "bho", "mni", "ks"
    }
    is_romanized = ascii_only and lang in indian_langs and lang != "en"
    is_mixed = ascii_only and bool(re.search(r"\b(and|but|bro|please|thanks|hey)\b", content.lower())) and is_romanized

    return DetectionResult(lang, conf, is_romanized, is_mixed)
