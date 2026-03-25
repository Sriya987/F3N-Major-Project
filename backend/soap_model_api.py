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
import fitz
import pytesseract
from pdf2image import convert_from_path
from transformers import pipeline


# -----------------------------
# LAB REPORT PROCESSING
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

    text = re.sub(r'\s+', ' ', text)
    return text


lab_ner = pipeline(
    "ner",
    model="d4data/biomedical-ner-all",
    aggregation_strategy="simple"
)

print("✅ NER model loaded successfully")   # ✅ CHECK 6
print("NER Pipeline Type:", type(lab_ner))


def extract_lab_results(text):
    print("\n🔍 Running NER on text...\n")   # ✅ CHECK 1

    entities = lab_ner(text)

    print("🧠 NER Output Sample:", entities[:5])   # ✅ CHECK 2

    value_matches = list(re.finditer(
        r"(\d+(?:\.\d+)?)\s*(mg/dl|g/dl|mmol/l|%|mm)?",
        text,
        re.IGNORECASE
    ))

    results = {}

    for ent in entities:
        test_name = ent['word'].strip().upper()

        if not re.search(r'[A-Z]', test_name):
            continue

        ent_end = ent['end']
        closest_value = None

        for vm in value_matches:
            if vm.start() >= ent_end:
                closest_value = vm.group(0).strip()
                break

        if closest_value:
            results[test_name] = closest_value

    print("✅ Extracted Lab Results:", results)   # ✅ CHECK 3

    return results


def lab_results_to_text(lab_results):
    if not lab_results:
        return "Not reported"

    return " ".join([f"{k} is {v}." for k, v in lab_results.items()])

nltk.download('punkt')

app = FastAPI()

@app.post("/generate-soap")
async def generate_soap(data: ConversationInput):
    print("🔥 FASTAPI HIT")   # ADD THIS

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
    lab_pdf_path: str | None = None


# -----------------------------
# CLEAN OUTPUT
# -----------------------------
def clean_output(text):
    text = re.sub(r"\b(Subjective|Objective|Assessment|Plan)\s*:", "", text)
    return text.strip()


def normalize_section(text):
    compact = re.sub(r"\s+", " ", (text or "")).strip()
    return compact if compact else "Not reported"


def normalize_for_match(text):
    lowered = (text or "").lower()
    lowered = re.sub(r"[^a-z0-9\s]", " ", lowered)
    lowered = re.sub(r"\s+", " ", lowered).strip()
    return lowered


def clean_patient_sentence(text):
    s = (text or "").strip()
    # Remove common spoken disfluencies while keeping factual content.
    s = re.sub(r"\b(um+|uh+|hmm+|mm+)\b", "", s, flags=re.IGNORECASE)
    s = re.sub(r"\b(yeah|you know)\b", "", s, flags=re.IGNORECASE)
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r"\s+,", ",", s)
    s = s.strip(" ,")
    return s


def rewrite_first_person_to_clinical(text):
    s = (text or "").strip()
    replacements = [
        (r"\bi am\b", "patient is"),
        (r"\bi'm\b", "patient is"),
        (r"\bi have\b", "patient reports"),
        (r"\bi've had\b", "patient reports"),
        (r"\bi feel\b", "patient reports"),
        (r"\bmy\b", "the patient's"),
        (r"\bit's\b", "it is"),
    ]
    for pattern, repl in replacements:
        s = re.sub(pattern, repl, s, flags=re.IGNORECASE)
    s = re.sub(r"\s+", " ", s).strip()
    return s[:1].upper() + s[1:] if s else s


def is_low_information_sentence(text):
    n = normalize_for_match(text)
    if not n:
        return True
    if len(n.split()) < 4:
        return True
    low_info_patterns = [
        r"\bget it checked out\b",
        r"\bi thought i should\b",
        r"\bokay\b",
    ]
    return any(re.search(p, n) for p in low_info_patterns)


def extract_demographics_from_patient_text(patient_text):
    n = normalize_for_match(patient_text)
    age_match = re.search(r"\b(i am|i m)\s*(\d{1,3})\b", n)
    gender_match = re.search(r"\b(male|female|man|woman)\b", n)

    age = age_match.group(2) if age_match else None
    gender = gender_match.group(1) if gender_match else None

    if age and gender:
        return f"Patient is a {age}-year-old {gender}."
    if age:
        return f"Patient is {age} years old."
    if gender:
        return f"Patient sex reported as {gender}."
    return None


def extract_patient_text(conversation):
    convo = (conversation or "").strip()
    patient_lines = []

    for line in convo.splitlines():
        m = re.match(r"\s*patient\s*:\s*(.+)$", line, flags=re.IGNORECASE)
        if m:
            patient_lines.append(m.group(1).strip())

    return " ".join(patient_lines) if patient_lines else convo


def has_phrase_overlap(sentence_norm, convo_norm, n=4):
    tokens = sentence_norm.split()
    if len(tokens) < n:
        return sentence_norm in convo_norm

    for i in range(len(tokens) - n + 1):
        phrase = " ".join(tokens[i:i + n])
        if phrase in convo_norm:
            return True
    return False


def sentence_supported_by_conversation(sentence, conversation):
    sent = normalize_for_match(sentence)
    convo = normalize_for_match(conversation)

    if not sent:
        return False

    # Fast path: exact normalized sentence appears in transcript.
    if sent in convo:
        return True

    # Fallback: require at least one 3-token phrase overlap with transcript.
    return has_phrase_overlap(sent, convo, n=3)


def keep_supported_sentences(section_text, conversation):
    if not section_text or section_text == "Not reported":
        return "Not reported"

    kept = []
    for sent in sent_tokenize(section_text):
        s = sent.strip()
        if sentence_supported_by_conversation(s, conversation):
            kept.append(s)

    return normalize_section(" ".join(kept)) if kept else "Not reported"


def contains_any(text, terms):
    hay = (text or "").lower()
    return any(term in hay for term in terms)


def conversation_has_objective_evidence(conversation):
    convo = (conversation or "").lower()

    objective_patterns = [
        r"\bbp\s*\d{2,3}\s*/\s*\d{2,3}\b",
        r"\bblood pressure\b",
        r"\bheart rate\s*\d+\b",
        r"\bpulse\s*\d+\b",
        r"\brespiratory rate\s*\d+\b",
        r"\bspo2\s*\d+\b",
        r"\boxygen saturation\s*\d+\b",
        r"\btemperature\s*\d+(\.\d+)?\b",
        r"\b(on\s+)?exam\s+(shows|showed|reveals|revealed|noted|demonstrates|demonstrated)\b",
        r"\becg\b",
        r"\bekg\b",
        r"\btroponin\b",
        r"\blab(s)?\b",
        r"\bimaging\b",
        r"\bx\s*-?ray\b",
        r"\bct\b",
        r"\bmri\b"
    ]

    return any(re.search(pattern, convo) for pattern in objective_patterns)


def extract_objective_from_conversation(conversation):
    convo = (conversation or "")
    lines = [ln.strip() for ln in convo.splitlines() if ln.strip()]

    objective_snippets = []
    patterns = [
        r"\bbp\s*\d{2,3}\s*/\s*\d{2,3}\b",
        r"\bheart rate\s*\d+\b",
        r"\bpulse\s*\d+\b",
        r"\brespiratory rate\s*\d+\b",
        r"\bspo2\s*\d+\b",
        r"\boxygen saturation\s*\d+\b",
        r"\btemperature\s*\d+(\.\d+)?\b",
        r"\becg\b",
        r"\bekg\b",
        r"\btroponin\b",
        r"\blab(s)?\b",
        r"\bimaging\b",
        r"\bx\s*-?ray\b",
        r"\bct\b",
        r"\bmri\b",
    ]

    for line in lines:
        lower = line.lower()
        if any(re.search(p, lower) for p in patterns):
            cleaned = re.sub(r"^\s*(doctor|patient)\s*:\s*", "", line, flags=re.IGNORECASE).strip()
            if cleaned and cleaned not in objective_snippets:
                objective_snippets.append(cleaned)

    return normalize_section(" ".join(objective_snippets)) if objective_snippets else "Not reported"


def has_explicit_pain_score(conversation):
    convo = (conversation or "").lower()
    patterns = [
        r"\b\d+\s*/\s*10\b",
        r"\b\d+\s*out of\s*10\b",
        r"\b(one|two|three|four|five|six|seven|eight|nine|ten)\s+out of\s+ten\b",
        r"\bpain\s+(is|was)\s+(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\b"
    ]
    return any(re.search(pattern, convo) for pattern in patterns)


def enforce_evidence_rules(conversation, sections):
    convo = (conversation or "").lower()

    plan_markers = [
        "prescribe", "prescribed", "start ", "continue ", "discharge", "follow up",
        "follow-up", "return precautions", "advised", "recommend", "treatment", "medication",
        "dose", "plan is"
    ]

    if not conversation_has_objective_evidence(conversation):
        sections["objective"] = "Not reported"

    if not contains_any(convo, plan_markers):
        sections["plan"] = "Not reported"

    return sections


def strip_disallowed_assessment_content(text, conversation):
    if not text or text == "Not reported":
        return "Not reported"

    allow_pain_score = has_explicit_pain_score(conversation)

    cleaned_sentences = []
    for sent in sent_tokenize(text):
        s = sent.strip()
        lowered = s.lower()
        if "differential diagnosis" in lowered or "differential diagnoses" in lowered:
            continue
        if "primary diagnose" in lowered:
            s = re.sub(r"primary diagnose", "primary diagnosis", s, flags=re.IGNORECASE)
        if not allow_pain_score and ("scale of" in lowered or "out of ten" in lowered or "worst pain" in lowered):
            continue
        cleaned_sentences.append(s)

    return normalize_section(" ".join(cleaned_sentences))


def sanitize_plan_section(text):
    if not text or text == "Not reported":
        return "Not reported"

    lowered = text.lower()
    actionable_patterns = [
        r"\bprescribe(d)?\b",
        r"\bmedication(s)?\b",
        r"\bstart\b",
        r"\bcontinue\b",
        r"\bstop\b",
        r"\bfollow\s*-?up\b",
        r"\breturn\b",
        r"\brefer\b",
        r"\border\b",
        r"\bobtain\b",
        r"\badvised\b",
        r"\brecommend(ed|ation)?\b",
        r"\bmonitor\b",
        r"\bdischarge\b",
        r"\bemergency\s+department\b",
        r"\bemergency\s+room\b"
    ]

    # If the generated plan does not contain any concrete action, treat it as missing.
    if not any(re.search(pattern, lowered) for pattern in actionable_patterns):
        return "Not reported"

    # Remove vague filler fragments that are common generation artifacts.
    cleaned = re.sub(r"\bwill be performed\b", "", text, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bseverity of (the )?pain[^.]*", "", cleaned, flags=re.IGNORECASE)
    cleaned = normalize_section(cleaned)

    return cleaned


def sanitize_sections(sections, conversation):
    cleaned = dict(sections)
    patient_text = extract_patient_text(conversation)
    cleaned["subjective"] = keep_supported_sentences(cleaned.get("subjective", ""), patient_text)
    conv_obj = extract_objective_from_conversation(conversation)
    lab_obj = lab_results_to_text(lab_results)

    combined_obj = f"{conv_obj} {lab_obj}".strip()

    cleaned["objective"] = normalize_section(combined_obj)
    cleaned["assessment"] = strip_disallowed_assessment_content(cleaned.get("assessment", ""), conversation)
    cleaned["assessment"] = keep_supported_sentences(cleaned.get("assessment", ""), patient_text)
    cleaned["plan"] = sanitize_plan_section(cleaned.get("plan", ""))
    cleaned["plan"] = keep_supported_sentences(cleaned.get("plan", ""), conversation)

    convo_norm = normalize_for_match(conversation)
    objective_norm = normalize_for_match(cleaned.get("objective", ""))
    risky_objective_terms = ["temperature", "swelling", "rashes", "physical examination", "lungs"]
    for term in risky_objective_terms:
        if term in objective_norm and term not in convo_norm:
            cleaned["objective"] = "Not reported"
            break

    # Do not treat checklist-style negatives as objective findings.
    if cleaned.get("objective", "") != "Not reported":
        obj = cleaned.get("objective", "")
        obj_l = obj.lower()
        looks_like_negative_checklist = (
            obj_l.startswith("no ")
            or " no " in f" {obj_l} "
            or "denies" in obj_l
        )
        has_numeric_measurement = bool(re.search(r"\b\d+(\.\d+)?\b", obj_l))
        if looks_like_negative_checklist and not has_numeric_measurement:
            cleaned["objective"] = "Not reported"

    if not conversation_has_objective_evidence(conversation):
        cleaned["objective"] = "Not reported"

    return cleaned


def parse_soap_sections(text):
    sections = {
        "subjective": "Not reported",
        "objective": "Not reported",
        "assessment": "Not reported",
        "plan": "Not reported"
    }

    pattern = re.compile(
        r"((Subjective|Objective|Assessment|Plan)\s*:?|([SOAP])\s*:)\s*(.*?)(?=((?:Subjective|Objective|Assessment|Plan)\s*:?|(?:[SOAP])\s*:|$))",
        re.IGNORECASE | re.DOTALL,
    )

    short_to_long = {
        "s": "subjective",
        "o": "objective",
        "a": "assessment",
        "p": "plan"
    }

    matches = list(pattern.finditer(text or ""))
    for m in matches:
        full_label = (m.group(2) or "").lower().strip()
        short_label = (m.group(3) or "").lower().strip()
        label = full_label if full_label else short_to_long.get(short_label, "")
        content = filter_output((m.group(4) or "").strip())

        if label in sections:
            sections[label] = normalize_section(content)

    if not matches:
        fallback = normalize_section(filter_output(text or ""))
        if fallback != "Not reported":
            sections["subjective"] = fallback

    return sections


# -----------------------------
# POST FILTER (ANTI-HALLUCINATION)
# -----------------------------
def filter_output(text):
    bad_phrases = ["may include", "possible", "differential diagnosis", "differential diagnoses"]

    filtered = []
    for sent in sent_tokenize(text):
        if not any(bp in sent.lower() for bp in bad_phrases):
            filtered.append(sent)

    return " ".join(filtered)


def transcript_fallback_sections(conversation):
    patient_text = extract_patient_text(conversation)
    raw_sentences = [s.strip() for s in sent_tokenize(patient_text) if s.strip()]

    filler = {"um", "uh", "hmm", "okay", "sure", "right", "yeah", "yes", "no"}

    selected = []
    selected_for_assessment = []
    seen = set()

    demographics_sentence = extract_demographics_from_patient_text(patient_text)
    if demographics_sentence:
        selected.append(demographics_sentence)

    for s in raw_sentences:
        cleaned_sentence = clean_patient_sentence(s)
        cleaned_sentence = rewrite_first_person_to_clinical(cleaned_sentence)
        normalized = normalize_for_match(cleaned_sentence)
        normalized = re.sub(r"^(yeah|yes|no|um|uh|okay|sure|right)\s+", "", normalized)
        words = normalized.split()
        if len(words) < 4:
            continue
        if len(words) <= 6 and all(w in filler for w in words):
            continue
        if is_low_information_sentence(cleaned_sentence):
            continue
        if normalized in seen:
            continue
        seen.add(normalized)
        selected.append(cleaned_sentence)

        # Prefer clinically meaningful lines for assessment seed and skip demographics-only phrases.
        if not re.search(r"\b(i\s*am|i\s*m)\s*\d+\b", normalized) and not re.search(r"\bmale\b|\bfemale\b", normalized):
            selected_for_assessment.append(cleaned_sentence)

        if len(selected) >= 8:
            break

    subjective = " ".join(selected) if selected else "Not reported"

    if subjective != "Not reported":
        assessment_candidates = selected_for_assessment if selected_for_assessment else selected
        assessment_seed = " ".join(assessment_candidates[:2])
        assessment = f"Clinical impression based on reported symptoms: {assessment_seed}"
    else:
        assessment = "Not reported"

    return {
        "subjective": normalize_section(subjective),
        "objective": "Not reported",
        "assessment": normalize_section(assessment),
        "plan": "Not reported"
    }


def apply_fallback_if_sparse(sections, conversation):
    fallback = transcript_fallback_sections(conversation)
    merged = dict(sections)

    subjective_text = merged.get("subjective", "")
    subjective_sent_count = len([s for s in sent_tokenize(subjective_text) if s.strip()]) if subjective_text else 0
    if (
        fallback.get("subjective", "Not reported") != "Not reported"
        and (merged.get("subjective", "Not reported") == "Not reported" or len(subjective_text) < 180 or subjective_sent_count < 4)
    ):
        merged["subjective"] = fallback["subjective"]

    assessment_text = merged.get("assessment", "")
    if fallback.get("assessment", "Not reported") != "Not reported" and (merged.get("assessment", "Not reported") == "Not reported" or len(assessment_text) < 80):
        merged["assessment"] = fallback["assessment"]

    # Always trust deterministic objective extraction over generative objective text.
    merged["objective"] = extract_objective_from_conversation(conversation)

    return merged


def convert_to_bullets(text):
    if not text or text == "Not reported":
        return ["Not reported"]

    sentences = [s.strip() for s in sent_tokenize(text) if s.strip()]
    return sentences
# -----------------------------
# MAIN GENERATION FUNCTION
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
                max_new_tokens=180,
                num_beams=1,
                do_sample=False,
                length_penalty=1.0,
                no_repeat_ngram_size=3,
                early_stopping=True
            )

        result = tokenizer.decode(outputs[0], skip_special_tokens=True)

        parsed = parse_soap_sections(result)
        evidence_clean = enforce_evidence_rules(conversation, parsed)
        sanitized = sanitize_sections(evidence_clean, conversation)
        

    # Inject lab into objective AFTER sanitization
    if lab_results:
        conv_obj = sanitized.get("objective", "")
        lab_obj = lab_results_to_text(lab_results)
        sanitized["objective"] = normalize_section(f"{conv_obj} {lab_obj}")
        return apply_fallback_if_sparse(sanitized, conversation)


# -----------------------------
# API ENDPOINT
# -----------------------------
@app.post("/generate-soap")
async def generate_soap(data: ConversationInput):

    preview = (data.conversation or "").strip()
    print("[TRANSCRIPT]", preview if len(preview) <= 1200 else f"{preview[:1200]}... [truncated]")

    soap_note = generate_soap_note(
    data.conversation,
    data.lab_pdf_path
)

    return {
    "soap_note": {
        "subjective": convert_to_bullets(soap_note["subjective"]),
        "objective": convert_to_bullets(soap_note["objective"]),
        "assessment": convert_to_bullets(soap_note["assessment"]),
        "plan": convert_to_bullets(soap_note["plan"]),
    }
}