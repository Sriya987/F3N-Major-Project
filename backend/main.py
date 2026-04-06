from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from model_inference import generate_soap_note

import shutil
import os
import uuid
import traceback
import time
import logging
import asyncio
import numpy as np


from faster_whisper import WhisperModel

# -----------------------------
# LOGGING
# -----------------------------
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# -----------------------------
# FFmpeg PATH (Windows fix)
# -----------------------------
os.environ["PATH"] += r";C:\Users\DELL\Desktop\ffmpeg-8.1-essentials_build\ffmpeg-8.1-essentials_build\bin"

# -----------------------------
# INIT APP
# -----------------------------
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:8000"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------
# LOAD MODEL ONCE
# -----------------------------
logger.info("🚀 Loading Faster-Whisper model...")

whisper_model = WhisperModel(
    "base",          # 🔥 use "small" if needed
    device="cpu",
    compute_type="int8"
)

logger.info("✅ Model loaded")

# -----------------------------
# AUDIO PREPROCESSING (FAST)
# -----------------------------
import subprocess
import numpy as np

def preprocess_audio(file_path, target_sr=16000):
    try:
        # 🔥 Convert audio → raw PCM using ffmpeg
        cmd = [
            "ffmpeg",
            "-i", file_path,
            "-f", "f32le",
            "-acodec", "pcm_f32le",
            "-ac", "1",
            "-ar", str(target_sr),
            "-"
        ]

        process = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

        audio = np.frombuffer(process.stdout, np.float32)

        # 🔥 Silence removal
        threshold = 0.01
        non_silent = np.where(np.abs(audio) > threshold)[0]

        if len(non_silent) > 0:
            audio = audio[non_silent[0]:non_silent[-1]]

        # Normalize
        if np.max(np.abs(audio)) > 0:
            audio = audio / np.max(np.abs(audio))

        return audio, target_sr

    except Exception as e:
        raise RuntimeError(f"Audio preprocessing failed: {str(e)}")

# -----------------------------
# TRANSCRIPTION LOGIC
# -----------------------------
def run_transcription(audio_path):
    # 🔥 Preprocess first
    audio_array, sr = preprocess_audio(audio_path)

    # 🔥 Direct array transcription (NO temp chunks)
    segments, _ = whisper_model.transcribe(
        audio_array,
        beam_size=1   # faster
    )

    return " ".join([seg.text for seg in segments])


# =========================
# ROOT
# =========================
@app.get("/")
def home():
    return {"message": "SOAP API running successfully"}


# =========================
# TRANSCRIBE (FAST + CLEAN)
# =========================
@app.post("/transcribe")
async def transcribe_audio(audio: UploadFile = File(...)):
    audio_path = None

    try:
        logger.info("🎤 Transcription request received")
        logger.info(f"📄 File: {audio.filename}")

        ext = audio.filename.split(".")[-1]
        audio_path = f"temp_{uuid.uuid4()}.{ext}"

        # Save file
        with open(audio_path, "wb") as buffer:
            shutil.copyfileobj(audio.file, buffer)

        logger.info(f"📁 Saved: {audio_path}")

        start = time.time()

        # 🔥 NON-BLOCKING THREAD
        transcript = await asyncio.to_thread(run_transcription, audio_path)

        end = time.time()

        logger.info(f"🧾 Transcript: {transcript}")
        logger.info(f"⏱ Time: {end - start:.2f} sec")

        return {"transcript": transcript}

    except Exception:
        logger.error("💥 Transcription failed")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Transcription failed")

    finally:
        if audio_path and os.path.exists(audio_path):
            os.remove(audio_path)
            logger.info(f"🧹 Deleted: {audio_path}")


# =========================
# GENERATE SOAP
# =========================
@app.post("/generate-soap")
async def generate_soap(
    conversation: str = Form(...),
    lab_file: UploadFile = File(None)
):
    lab_path = None

    try:
        logger.info("🧠 SOAP request received")

        if lab_file:
            lab_path = f"temp_lab_{uuid.uuid4()}_{lab_file.filename}"

            with open(lab_path, "wb") as buffer:
                shutil.copyfileobj(lab_file.file, buffer)

            logger.info(f"📄 Lab file saved: {lab_path}")

        start = time.time()

        # 🔥 Your existing LLM pipeline
        soap_note = generate_soap_note(conversation, lab_path)

        end = time.time()

        logger.info(f"⏱ SOAP time: {end - start:.2f} sec")

        return {
            "soap_note": {
                "subjective": soap_note.get("subjective", "Not reported"),
                "objective": soap_note.get("objective", "Not reported"),
                "assessment": soap_note.get("assessment", "Not reported"),
                "plan": soap_note.get("plan", "Not reported"),
            }
        }

    except Exception:
        logger.error("💥 SOAP generation failed")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="SOAP generation failed")

    finally:
        if lab_path and os.path.exists(lab_path):
            try:
                os.remove(lab_path)
                logger.info(f"🧹 Deleted lab file")
            except Exception as e:
                logger.warning(f"⚠ Cleanup failed: {e}")