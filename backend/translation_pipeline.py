import re
import time
from collections import OrderedDict
from dataclasses import asdict, dataclass
from typing import Dict, Optional

from language_detection import detect_language
from routing import route_translation
from transliteration import transliterate_romanized

SHORT_SKIP = {"hi", "ok", "hmm", "lol", "bro", "hehe", "yo"}


@dataclass
class PipelineResult:
    original: str
    transliterated: Optional[str]
    translated: str
    confidence: float
    source_language: str
    target_language: str
    engine: str
    cached: bool = False

    def to_dict(self):
        data = asdict(self)
        data.pop("engine", None)
        data.pop("cached", None)
        return data


class _LRUCache:
    def __init__(self, maxsize: int = 3000):
        self.maxsize = maxsize
        self._store: OrderedDict[str, tuple[float, Dict]] = OrderedDict()

    def get(self, key: str):
    hit = self._store.get(key)
    if not hit:
        return None

    timestamp, value = hit

    # TTL = 10 minutes
    if time.time() - timestamp > 600:
        self._store.pop(key, None)
        return None

    self._store.move_to_end(key)
    return value

    timestamp, value = hit

    # 🔥 TTL = 10 minutes (600 seconds)
    if time.time() - timestamp > 600:
        self._store.pop(key, None)
        return None

    self._store.move_to_end(key)
    return value

    def set(self, key: str, value: Dict):
        self._store[key] = (time.time(), value)
        self._store.move_to_end(key)
        while len(self._store) > self.maxsize:
            self._store.popitem(last=False)


CACHE = _LRUCache()


def _normalize_lang(code: str) -> str:
    return (code or "en").strip().lower().replace("_", "-")


def _is_short_or_slang(text: str) -> bool:
    words = re.findall(r"[A-Za-z']+", text.lower())
    if not words:
        return len(text.strip()) <= 3
    return len(words) <= 2 and all(w in SHORT_SKIP for w in words)


def translate_pipeline(text: str, target_language: str, options: Optional[Dict] = None, source_hint: str = "auto") -> PipelineResult:
    original = str(text or "")
    opts = options or {}
    target = _normalize_lang(target_language)

    cache_key = f"{original}|||{target}|||{bool(opts.get('transliterate', True))}|||{source_hint}"
    cached = CACHE.get(cache_key)
    if cached:
        return PipelineResult(**cached, cached=True)

    if not original.strip():
        result = PipelineResult(original=original, transliterated=None, translated="", confidence=1.0, source_language="en", target_language=target, engine="empty")
        CACHE.set(cache_key, asdict(result))
        return result

    if _is_short_or_slang(original):
        result = PipelineResult(original=original, transliterated=None, translated=original, confidence=0.99, source_language="en", target_language=target, engine="short-circuit")
        CACHE.set(cache_key, asdict(result))
        return result

    detection = detect_language(original)
    source_language = _normalize_lang(source_hint if source_hint not in {"", "auto", None} else detection.language)

    transliterated = None
    text_for_translation = original
    if opts.get("transliterate", True):
        transliterated = transliterate_romanized(original, detection)
        if transliterated:
            text_for_translation = transliterated

    # 🔥 Confidence-based routing
if detection.confidence < 0.65:
    source_language = "auto"

translated, engine = route_translation(
    text=text_for_translation,
    source_language=source_language,
    target_language=target,
    confidence=detection.confidence,
)

# 🔥 Fallback if translation weak
if not translated or translated.strip() == text_for_translation:
    translated, engine = route_translation(
        text=original,
        source_language="auto",
        target_language=target,
        confidence=0.5,
    )

    result = PipelineResult(
        original=original,
        transliterated=transliterated,
        translated=translated or original,
        confidence=float(detection.confidence),
        source_language=source_language,
        target_language=target,
        engine=engine,
    )
    CACHE.set(cache_key, asdict(result))
    return result
