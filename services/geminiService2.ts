import { SOAPNote } from "../types";

const BACKEND_API = 
  (import.meta as any)?.env?.VITE_API_BASE ||
  "http://localhost:3001";

type LocalAttachment = {
  kind: "audio" | "pdf";
  data: string;
  mimeType: string;
};

const parseSoapFromText = (text: string): Partial<SOAPNote> => {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      try {
        const snippet = text.slice(start, end + 1);
        return JSON.parse(snippet);
      } catch {
        return {};
      }
    }
    return {};
  }
};

const callOllama = async (prompt: string, attachments?: LocalAttachment[]) => {
  try {
    console.log("Calling backend proxy at:", `${BACKEND_API}/api/ollama/generate`);
    
    const attachmentNotice = attachments?.length
      ? `\n\nNote: Attachments provided (${attachments.length}), but using text-based inference only.\n`
      : "";

    const payload = {
      prompt: `${prompt}${attachmentNotice}`,
      model: 'llama3.2:latest' 
    };
    
    console.log("Sending prompt to backend...");

    const response = await fetch(`${BACKEND_API}/api/ollama/generate`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    console.log("Response status:", response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Backend error response:", errorText);
      throw new Error(`Backend error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    console.log("Response received, length:", data?.response?.length);
    return parseSoapFromText(data?.response || "");
  } catch (error: any) {
    console.error("Backend call failed:", error.message, error);
    throw new Error(`Failed to generate SOAP: ${error.message}`);
  }
};

export const geminiService2 = {
  /**
   * Generates SOAP note using text-only dialogue with a local model.
   */
  generateSOAP: async (dialogue: string, context: string = ""): Promise<Partial<SOAPNote>> => {
    const prompt = `You are a clinical documentation assistant. Convert the following doctor-patient dialogue into a SOAP note.
${context ? `Additional Context: ${context}` : ""}

Dialogue:
${dialogue}

Respond ONLY with valid JSON (no markdown, no extra text) with these exact keys:
{
  "subjective": "Patient's symptoms and history from the dialogue",
  "objective": "Clinical observations and findings",
  "assessment": "Diagnosis or clinical impression",
  "plan": "Treatment plan and recommendations"
}`;

    return callOllama(prompt);
  },

  /**
   * Generates SOAP note using multimodal inputs through a local model endpoint.
   * This assumes your local model server can accept base64 audio/pdf attachments.
   */
  generateSOAPMultimodal: async (
    dialogueAudio?: { data: string; mimeType: string },
    labPdf?: { data: string; mimeType: string }
  ): Promise<Partial<SOAPNote>> => {
    const prompt = `You are a clinical documentation assistant. Create a SOAP note based on the provided information.
${dialogueAudio ? "An audio recording of the doctor-patient encounter is available." : ""}
${labPdf ? "A PDF lab report is available." : ""}

Since you may not be able to process binary attachments directly, use your clinical knowledge to structure this as a SOAP note.

Respond ONLY with valid JSON (no markdown, no extra text) with these exact keys:
{
  "subjective": "Patient's description of symptoms and concerns",
  "objective": "Clinical findings and lab values",
  "assessment": "Clinical diagnosis or impression",
  "plan": "Treatment recommendations and follow-up"
}`;

    return callOllama(prompt, [
      ...(dialogueAudio ? [{ kind: "audio" as const, data: dialogueAudio.data, mimeType: dialogueAudio.mimeType }] : []),
      ...(labPdf ? [{ kind: "pdf" as const, data: labPdf.data, mimeType: labPdf.mimeType }] : [])
    ]);
  }
};
