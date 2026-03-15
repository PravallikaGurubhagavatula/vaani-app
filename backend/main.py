from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from gtts import gTTS
import httpx
import os

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── ROUTE 1: Translate text ───────────────────────────
@app.post("/translate")
async def translate_text(data: dict):
    text = data["text"]
    src  = data["from_lang"]
    dest = data["to_lang"]

    async with httpx.AsyncClient(timeout=15.0) as client:
        # Primary: Google Translate free endpoint
        try:
            from urllib.parse import quote
            url = f"https://translate.googleapis.com/translate_a/single?client=gtx&sl={src}&tl={dest}&dt=t&q={quote(text)}"
            res = await client.get(url)
            if res.status_code == 200:
                data_resp = res.json()
                if data_resp and data_resp[0]:
                    translated = "".join(
                        seg[0] for seg in data_resp[0] if seg and seg[0]
                    )
                    if translated:
                        return {"translated": translated}
        except Exception as e:
            print(f"Google Translate failed: {e}")

        # Fallback: MyMemory (works well for pairs involving English)
        try:
            chunks = split_text(text)
            translated_chunks = []
            for chunk in chunks:
                params = {"q": chunk, "langpair": f"{src}|{dest}"}
                res = await client.get("https://api.mymemory.translated.net/get", params=params)
                result = res.json()
                if result.get("responseStatus") == 200:
                    translated_chunks.append(result["responseData"]["translatedText"])
                else:
                    raise Exception(f"MyMemory error: {result.get('responseDetails')}")
            return {"translated": " ".join(translated_chunks)}
        except Exception as e:
            print(f"MyMemory failed: {e}")
            raise


def split_text(text, max_len=480):
    """Split text into chunks at sentence boundaries."""
    import re
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


# ── ROUTE 2: Text to Speech ──────────────────────────
@app.post("/speak")
async def speak(data: dict):
    text = data["text"]
    lang = data["lang"]
    tts = gTTS(text=text, lang=lang)
    filepath = "output.mp3"
    tts.save(filepath)
    return FileResponse(filepath, media_type="audio/mpeg")


# ── TEST ROUTE ───────────────────────────────────────
@app.get("/")
def home():
    return {"status": "Vaani API is running!"}
