
import torch
import re
import json
import concurrent.futures
from pathlib import Path
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM, pipeline
from peft import PeftModel
from nltk.tokenize import sent_tokenize
import nltk
import fitz
import pytesseract
from pdf2image import convert_from_path
from google import genai
import os
from dotenv import load_dotenv


load_dotenv()



nltk.download('punkt')

# -----------------------------
# DEVICE
# -----------------------------
device = "cuda" if torch.cuda.is_available() else "cpu"

# -----------------------------
# LOAD MODEL (FLAN + LoRA)
# -----------------------------
PROJECT_ROOT = Path(__file__).resolve().parent
MODEL_PATH = (PROJECT_ROOT / "flan_t5_clinical_lora").as_posix()

tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH, local_files_only=True)

base_model = AutoModelForSeq2SeqLM.from_pretrained("google/flan-t5-base")
model = PeftModel.from_pretrained(base_model, MODEL_PATH, local_files_only=True)

model.to(device)
model.eval()

# -----------------------------
# GEMINI SETUP
# -----------------------------


# -----------------------------
# LOAD NER MODEL
# -----------------------------
ner_pipeline = pipeline(
    "ner",
    model="d4data/biomedical-ner-all",
    aggregation_strategy="simple"
)

# -----------------------------
# LAB TEXT EXTRACTION
# -----------------------------
def extract_text(pdf_path):
    text = ""
    try:
        doc = fitz.open(pdf_path)
        for page in doc:
            text += page.get_text()
    except:
        pass

    if len(text.strip()) < 100:
        images = convert_from_path(pdf_path)
        for img in images:
            text += pytesseract.image_to_string(img)

    return re.sub(r'\s+', ' ', text)

# -----------------------------
# LAB RESULT EXTRACTION
# -----------------------------
def extract_lab_results(text):
    entities = ner_pipeline(text)

    value_matches = list(re.finditer(
        r"(\d+(?:\.\d+)?)\s*(mg/dl|g/dl|mmol/l|%|mm)?",
        text,
        re.IGNORECASE
    ))

    results = {}

    for ent in entities:
        name = ent['word'].strip().upper()
        end = ent['end']

        for vm in value_matches:
            if vm.start() >= end:
                results[name] = vm.group(0)
                break

    return results

def lab_results_to_text(lab_results):
    if not lab_results:
        return "Not reported"
    return " ".join([f"{k} is {v}." for k, v in lab_results.items()])

# -----------------------------
# HELPERS
# -----------------------------
def normalize_section(text):
    return re.sub(r"\s+", " ", text or "").strip() or "Not reported"

def parse_soap_sections(text):
    sections = {
        "subjective": "Not reported",
        "objective": "Not reported",
        "assessment": "Not reported",
        "plan": "Not reported"
    }

    try:
        pattern = re.compile(
            r"S:\s*(.*?)\s*O:\s*(.*?)\s*A:\s*(.*?)\s*P:\s*(.*)",
            re.DOTALL | re.IGNORECASE
        )

        match = pattern.search(text)

        if match:
            sections["subjective"] = normalize_section(match.group(1))
            sections["objective"] = normalize_section(match.group(2))
            sections["assessment"] = normalize_section(match.group(3))
            sections["plan"] = normalize_section(match.group(4))
        else:
            print("⚠️ Regex parsing failed, fallback...")

            s = re.search(r"S:\s*(.*?)(?=O:|A:|P:|$)", text, re.DOTALL | re.IGNORECASE)
            o = re.search(r"O:\s*(.*?)(?=A:|P:|$)", text, re.DOTALL | re.IGNORECASE)
            a = re.search(r"A:\s*(.*?)(?=P:|$)", text, re.DOTALL | re.IGNORECASE)
            p = re.search(r"P:\s*(.*)", text, re.DOTALL | re.IGNORECASE)

            if s: sections["subjective"] = normalize_section(s.group(1))
            if o: sections["objective"] = normalize_section(o.group(1))
            if a: sections["assessment"] = normalize_section(a.group(1))
            if p: sections["plan"] = normalize_section(p.group(1))

    except Exception as e:
        print("⚠️ Parsing error:", e)

    return sections

# -----------------------------
# EVIDENCE FILTER (NO HALLUCINATION)
# -----------------------------
def enforce_evidence_rules(conversation, lab_text, sections):

    combined = (conversation + " " + lab_text).lower()

    if not any(word in combined for word in ["diagnosis", "impression", "suggests"]):
        sections["assessment"] = "Not reported"

    if not any(word in combined for word in ["prescribe", "advice", "treatment", "take", "medication"]):
        sections["plan"] = "Not reported"

    return sections

def sanitize_sections(sections):
    return {k: normalize_section(v) for k, v in sections.items()}


def gemini_post_process_with_timeout(raw_output, conversation, lab_text, timeout=10):
    import concurrent.futures
    import os
    import re
    import json

    def call_gemini():
        try:
            # 1. Load the key from the environment
            api_key = os.getenv("GEMINI_API_KEY")

            if not api_key:
                print("❌ GEMINI API KEY NOT FOUND IN .ENV")
                return None

            # 2. Initialize the client with the api_key parameter
            client = genai.Client(api_key=api_key)

        
        

            prompt = f"""
Refine the following SOAP note.

STRICT RULES:
- Do NOT add new medical information
- Do NOT hallucinate
- Keep ONLY factual content
- If a section lacks evidence → keep "Not reported"
- Return strictly in JSON:
{{
  "subjective": "...",
  "objective": "...",
  "assessment": "...",
  "plan": "..."
}}

Conversation:
{conversation}

Lab:
{lab_text}

Raw SOAP:
{raw_output}
"""

            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt
            )

            text = response.text.strip()

            # Safer JSON parsing
            try:
                return json.loads(text)
            except:
                json_match = re.search(r"\{.*\}", text, re.DOTALL)
                if json_match:
                    return json.loads(json_match.group(0))

        except Exception as e:
            print("⚠️ Gemini error:", e)

        return None

    # ⏱ Timeout control
    with concurrent.futures.ThreadPoolExecutor() as executor:
        future = executor.submit(call_gemini)
        try:
            return future.result(timeout=timeout)
        except concurrent.futures.TimeoutError:
            print("⏱ Gemini timeout")
            return None



# -----------------------------
# MAIN FUNCTION
# -----------------------------

def generate_soap_note(conversation, lab_pdf_path=None):
    lab_results = {}

    if lab_pdf_path:
        try:
            lab_text_raw = extract_text(lab_pdf_path)
            lab_results = extract_lab_results(lab_text_raw)
        except Exception as e:
            print("Lab processing error:", e)

    lab_text = lab_results_to_text(lab_results)

    prompt = f"""
    Generate a strictly factual SOAP note.

    RULES:
    - Use ONLY information from the conversation
    - DO NOT add medical assumptions
    - DO NOT include differential diagnosis
    - If not mentioned, write "Not reported"
    - Be concise and factual
    - If a clinician asks checklist questions and patient does not explicitly confirm a symptom, do not include it as a finding
    - Do not invent physical exam, vitals, labs, imaging, or treatment plan when absent
    - Remove conversational fillers (e.g., um/uh/yeah) from output wording
    - Do not copy clinician question stems as findings
    - Prefer concise clinical phrasing over verbatim transcript style

    Format:
    Subjective:
    Objective:
    Assessment:
    Plan:

    Conversation:
    {conversation}

    Lab Findings:
    {lab_text}

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
            max_new_tokens=300,
            num_beams=1,
            do_sample=False,
            length_penalty=1.0,
            no_repeat_ngram_size=3,
            early_stopping=True
        )

    result = tokenizer.decode(outputs[0], skip_special_tokens=True)

    print("\n🧾 RAW MODEL OUTPUT:\n", result)

    # -----------------------------
    # PARSE
    # -----------------------------
    parsed = parse_soap_sections(result)

    print("\n🧩 PARSED:\n", parsed)

    # -----------------------------
    # RULES
    # -----------------------------
    cleaned = enforce_evidence_rules(conversation, lab_text, parsed)

    sanitized = sanitize_sections(cleaned)

    # -----------------------------
    # LAB INJECTION
    # -----------------------------
    if lab_results:
        sanitized["objective"] = normalize_section(
            sanitized["objective"] + " " + lab_text
        )

    print("\n⚙️ BEFORE GEMINI:\n", sanitized)

    # -----------------------------
    # GEMINI (SAFE CALL)
    # -----------------------------
    gemini_output = gemini_post_process_with_timeout(
        raw_output=result,
        conversation=conversation,
        lab_text=lab_text,
        timeout=60
    )

    if gemini_output:
        print("\n✨ GEMINI OUTPUT:\n", gemini_output)
        sanitized = gemini_output
    else:
        print("⚠️ Using fallback")

    print("\n✅ FINAL SOAP:\n", sanitized)

    return sanitized