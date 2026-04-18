import os
from functools import lru_cache
from typing import Optional, Tuple

import requests

INDICTRANS2_MODEL = os.environ.get("INDICTRANS2_MODEL", "ai4bharat/IndicTrans2")
LIBRETRANSLATE_URL = os.environ.get("LIBRETRANSLATE_URL", "")
BHASHINI_INFER_URL = os.environ.get("BHASHINI_INFER_URL", "https://dhruva-api.bhashini.gov.in/services/inference/pipeline")
BHASHINI_INFERENCE_KEY = os.environ.get("BHASHINI_INFERENCE_KEY", "")


@lru_cache(maxsize=1)
def _load_indictrans2_pipeline():
    try:
        from transformers import AutoTokenizer, AutoModelForSeq2SeqLM, pipeline

        tokenizer = AutoTokenizer.from_pretrained(INDICTRANS2_MODEL)
        model = AutoModelForSeq2SeqLM.from_pretrained(INDICTRANS2_MODEL)
        return pipeline("translation", model=model, tokenizer=tokenizer)
    except Exception:
        return None


def _translate_indictrans2(text: str, source_language: str, target_language: str) -> Optional[str]:
    pipe = _load_indictrans2_pipeline()
    if pipe is None:
        return None
    try:
        prompt = f"{source_language} to {target_language}: {text}"
        output = pipe(prompt, max_length=512)
        if output and isinstance(output, list):
            return (output[0].get("translation_text") or "").strip() or None
    except Exception:
        return None
    return None


def _translate_libretranslate(text: str, source_language: str, target_language: str) -> Optional[str]:
    if not LIBRETRANSLATE_URL:
        return None
    try:
        response = requests.post(
            f"{LIBRETRANSLATE_URL.rstrip('/')}/translate",
            json={"q": text, "source": source_language or "auto", "target": target_language, "format": "text"},
            timeout=8,
        )
        if response.ok:
            translated = (response.json().get("translatedText") or "").strip()
            return translated or None
    except Exception:
        return None
    return None


def _translate_argos(text: str, source_language: str, target_language: str) -> Optional[str]:
    try:
        import argostranslate.translate

        langs = argostranslate.translate.get_installed_languages()
        from_lang = next((l for l in langs if l.code == source_language), None)
        to_lang = next((l for l in langs if l.code == target_language), None)
        if not from_lang or not to_lang:
            return None
        translated = from_lang.get_translation(to_lang).translate(text)
        return translated.strip() if translated else None
    except Exception:
        return None


def _translate_bhashini(text: str, source_language: str, target_language: str) -> Optional[str]:
    if not BHASHINI_INFERENCE_KEY:
        return None
    payload = {
        "pipelineTasks": [{
            "taskType": "translation",
            "config": {
                "language": {"sourceLanguage": source_language, "targetLanguage": target_language},
            },
        }],
        "inputData": {"input": [{"source": text}]},
    }
    try:
        response = requests.post(
            BHASHINI_INFER_URL,
            json=payload,
            headers={"Authorization": BHASHINI_INFERENCE_KEY, "Content-Type": "application/json"},
            timeout=10,
        )
        if response.ok:
            out = response.json()
            target = out.get("pipelineResponse", [{}])[0].get("output", [{}])[0].get("target", "")
            return target.strip() if target else None
    except Exception:
        return None
    return None


def route_translation(text: str, source_language: str, target_language: str, confidence: float) -> Tuple[str, str]:
    if source_language == target_language:
        return text, "passthrough"

    if confidence >= 0.75:
        result = _translate_indictrans2(text, source_language, target_language)
        if result:
            return result, "indictrans2"

    for engine, fn in [
        ("libretranslate", _translate_libretranslate),
        ("argos", _translate_argos),
        ("bhashini", _translate_bhashini),
    ]:
        result = fn(text, source_language, target_language)
        if result:
            return result, engine

    return text, "original"
