from functools import lru_cache
from typing import Optional

from language_detection import DetectionResult

INDIC_SCRIPT_MAP = {
    "te": "telugu",
    "ta": "tamil",
    "kn": "kannada",
    "ml": "malayalam",
    "hi": "devanagari",
    "mr": "devanagari",
    "ne": "devanagari",
    "sa": "devanagari",
    "doi": "devanagari",
    "mai": "devanagari",
    "bn": "bengali",
    "as": "bengali",
    "gu": "gujarati",
    "pa": "gurmukhi",
    "or": "oriya",
}

RULE_BASED_WORDS = {
    "te": {
        "bagunnava": "బాగున్నావా",
        "namaskaram": "నమస్కారం",
        "chelli": "చెల్లి",
        "adenti": "అదేంటి",
        "nenu": "నేను",
        "telugu": "తెలుగు",
        "kada": "కదా",
        "matladanu": "మాట్లాడాను",
    },
    "hi": {
        "kya": "क्या",
        "kar": "कर",
        "raha": "रहा",
        "hai": "है",
    },
}


@lru_cache(maxsize=1)
def _load_indic_trans():
    try:
        from indic_transliteration import sanscript
        from indic_transliteration.sanscript import transliterate

        return sanscript, transliterate
    except Exception:
        return None, None


def _rule_based_transliterate(text: str, lang: str) -> str:
    mapping = RULE_BASED_WORDS.get(lang, {})
    words = text.split()
    out = []
    for token in words:
        clean = ''.join(ch for ch in token.lower() if ch.isalpha())
        mapped = mapping.get(clean)
        out.append(mapped if mapped else token)
    return " ".join(out)


def transliterate_romanized(text: str, detection: DetectionResult) -> Optional[str]:
    if not detection.is_romanized:
        return None

    target_lang = detection.language
    target_script = INDIC_SCRIPT_MAP.get(target_lang)

    sanscript, transliterate_fn = _load_indic_trans()
    if transliterate_fn and target_script and hasattr(sanscript, "ITRANS"):
        try:
            scheme = getattr(sanscript, target_script.upper(), None)
            if scheme is not None:
                result = transliterate_fn(text, sanscript.ITRANS, scheme)
                if result and result != text:
                    return result
        except Exception:
            pass

    fallback = _rule_based_transliterate(text, target_lang)
    return fallback if fallback != text else None
