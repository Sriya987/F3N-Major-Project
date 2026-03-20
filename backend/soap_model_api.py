from fastapi import FastAPI
from pydantic import BaseModel
import torch
import re
from pathlib import Path
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM
from peft import PeftModel
from fastapi.middleware.cors import CORSMiddleware
from nltk.tokenize import sent_tokenize
import nltk

nltk.download('punkt')

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

device = "cuda" if torch.cuda.is_available() else "cpu"

# -----------------------------
# LOAD MODEL (UPDATED PATH)
# -----------------------------
PROJECT_ROOT = Path(__file__).resolve().parent
MODEL_PATH = (PROJECT_ROOT / "flan_t5_clinical_lora").resolve().as_posix()

print("Loading model from:", MODEL_PATH)

tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH, local_files_only=True)

base_model = AutoModelForSeq2SeqLM.from_pretrained("google/flan-t5-base")
model = PeftModel.from_pretrained(base_model, MODEL_PATH, local_files_only=True)

model.to(device)
model.eval()


class ConversationInput(BaseModel):
    conversation: str


# -----------------------------
# CLEAN OUTPUT
# -----------------------------
def clean_output(text):
    text = re.sub(r"\b(Subjective|Objective|Assessment|Plan)\s*:", "", text)
    return text.strip()


# -----------------------------
# POST FILTER (ANTI-HALLUCINATION)
# -----------------------------
def filter_output(text):
    bad_phrases = ["may include", "possible", "differential diagnosis"]

    filtered = []
    for sent in sent_tokenize(text):
        if not any(bp in sent.lower() for bp in bad_phrases):
            filtered.append(sent)

    return " ".join(filtered)


# -----------------------------
# MAIN GENERATION FUNCTION
# -----------------------------
def generate_soap_note(conversation):

    prompt = f"""
Generate a strictly factual SOAP note.

RULES:
- Use ONLY information from the conversation
- DO NOT add medical assumptions
- DO NOT include differential diagnosis
- If not mentioned, write "Not reported"
- Be concise and factual

Format:
Subjective:
Objective:
Assessment:
Plan:

Conversation:
{conversation}

SOAP Note:
"""

    inputs = tokenizer(
        prompt,
        return_tensors="pt",
        truncation=True,
        max_length=1024
    ).to(device)

    with torch.no_grad():
        outputs = model.generate(
            **inputs,
            max_new_tokens=180,
            num_beams=4,
            length_penalty=1.0,
            no_repeat_ngram_size=3,
            early_stopping=True
        )

    result = tokenizer.decode(outputs[0], skip_special_tokens=True)

    result = clean_output(result)
    result = filter_output(result)

    return result


# -----------------------------
# API ENDPOINT
# -----------------------------
@app.post("/generate-soap")
async def generate_soap(data: ConversationInput):

    soap_note = generate_soap_note(data.conversation)

    return {
        "soap_note": soap_note
    }