from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
import io

from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
from TTS.api import TTS

import pytesseract
from PIL import Image


app=FastAPI()

app.add_middleware(
CORSMiddleware,
allow_origins=["*"],
allow_methods=["*"],
allow_headers=["*"]
)


# LOAD NLLB MODEL
MODEL_NAME="facebook/nllb-200-distilled-600M"

tokenizer=AutoTokenizer.from_pretrained(MODEL_NAME)
model=AutoModelForSeq2SeqLM.from_pretrained(MODEL_NAME)



# LOAD TTS
tts=TTS("tts_models/multilingual/multi-dataset/xtts_v2")



# TRANSLATE
def translate_text_nllb(text,src,tgt):

inputs=tokenizer(text,return_tensors="pt")

tokens=model.generate(**inputs)

result=tokenizer.batch_decode(tokens,skip_special_tokens=True)[0]

return result



@app.post("/translate")
async def translate(data:dict):

text=data["text"]
src=data["from_lang"]
tgt=data["to_lang"]

try:

translated=translate_text_nllb(text,src,tgt)

return {"translated":translated}

except Exception as e:

return JSONResponse(status_code=500,content={"error":str(e)})



# SPEECH
@app.post("/speak")
async def speak(data:dict):

text=data["text"]

try:

wav=tts.tts(text)

audio_bytes=io.BytesIO(wav)

return StreamingResponse(audio_bytes,media_type="audio/wav")

except Exception as e:

return JSONResponse(status_code=500,content={"error":str(e)})



# IMAGE OCR
@app.post("/image-translate")
async def image_translate(
file:UploadFile=File(...),
from_lang:str=Form(...),
to_lang:str=Form(...)
):

image_bytes=await file.read()

img=Image.open(io.BytesIO(image_bytes))

text=pytesseract.image_to_string(img)

if not text.strip():

return {"extracted":"","translated":"No text found"}

translated=translate_text_nllb(text,from_lang,to_lang)

return {

"extracted":text,

"translated":translated

}



@app.get("/ping")
def ping():

return {"status":"alive"}
