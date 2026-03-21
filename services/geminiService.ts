
import { GoogleGenAI, Type } from "@google/genai";
import { SOAPNote } from "../types";

// Always use the API key directly from process.env.API_KEY as per guidelines.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const SOAP_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    subjective: { type: Type.STRING, description: 'Patient symptoms, history, and concerns.' },
    objective: { type: Type.STRING, description: 'Vital signs, physical exam findings, and lab results.' },
    assessment: { type: Type.STRING, description: 'Diagnosis or differential diagnosis.' },
    plan: { type: Type.STRING, description: 'Proposed treatment, medications, and follow-up.' }
  },
  required: ['subjective', 'objective', 'assessment', 'plan']
};

export const geminiService = {
  /**
   * Generates SOAP note using text-only dialogue.
   * Fixes errors in Comparison.tsx where this method was missing.
   */
  generateSOAP: async (dialogue: string, context: string = '', model: string = 'gemini-3-flash-preview'): Promise<Partial<SOAPNote>> => {
    const prompt = `
      As a clinical documentation assistant, analyze the following doctor-patient dialogue.
      ${context ? `Additional Context: ${context}` : ''}
      Dialogue: ${dialogue}
      
      Structure this information into a professional SOAP note (Subjective, Objective, Assessment, Plan).
      
      Strict Rules:
      1. Do not hallucinate or add facts not present in the input.
      2. Use medical terminology appropriately.
    `;

    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: SOAP_SCHEMA
      }
    });

    // Extract text directly from the .text property
    return JSON.parse(response.text || '{}');
  },

  /**
   * Generates SOAP note using multimodal inputs (Dialogue audio and PDF lab report).
   */
  generateSOAPMultimodal: async (
    dialogueAudio?: { data: string, mimeType: string },
    labPdf?: { data: string, mimeType: string },
    model: string = 'gemini-3-flash-preview'
  ): Promise<Partial<SOAPNote>> => {
    const parts: any[] = [
      {
        text: `
          As a clinical documentation assistant, analyze the provided doctor-patient audio dialogue and the lab report PDF.
          Structure this information into a professional SOAP note (Subjective, Objective, Assessment, Plan).
          
          Strict Rules:
          1. Do not hallucinate or add facts not present in the inputs.
          2. Use medical terminology appropriately.
          3. Subjective should focus on the patient narrative from the dialogue.
          4. Objective should focus on clinical observations and lab values from the PDF.
          5. If audio is provided, transcribe it accurately in context of the SOAP sections.
        `
      }
    ];

    if (dialogueAudio) {
      parts.push({
        inlineData: {
          data: dialogueAudio.data,
          mimeType: dialogueAudio.mimeType
        }
      });
    }

    if (labPdf) {
      parts.push({
        inlineData: {
          data: labPdf.data,
          mimeType: labPdf.mimeType
        }
      });
    }

    const response = await ai.models.generateContent({
      model: model,
      contents: { parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: SOAP_SCHEMA
      }
    });

    // Extract text directly from the .text property
    return JSON.parse(response.text || '{}');
  },
  transcribeAudio: async (
    dialogueAudio: { data: string; mimeType: string },
    model: string = 'gemini-3-flash-preview'
  ): Promise<string> => {
    if (!dialogueAudio?.data) {
      throw new Error("Audio data is required for transcription.");
    }

    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [
          {
            text: `
              Transcribe the provided clinical conversation audio accurately.
              Rules:
              1. Return only the verbatim transcript text.
              2. Do not summarize.
              3. Do not add information not present in the audio.
              4. Preserve speaker meaning and medical terms as spoken.
              5. Do not mention instructions, prompts, or request metadata.
              6. If speech is unclear, write exactly: [UNINTELLIGIBLE]
            `
          },
          {
            inlineData: {
              data: dialogueAudio.data,
              mimeType: dialogueAudio.mimeType
            }
          }
        ]
      },
      config: {
        temperature: 0
      }
    });

    const transcript = (response.text || '').trim();
    const looksLikePromptLeak = /provide (the )?audio file|text you would like me to transcribe|transcribe the provided/i.test(transcript);

    if (!transcript || looksLikePromptLeak) {
      console.error('Invalid transcription output:', transcript);
      throw new Error('Transcription failed: audio could not be interpreted. Please upload a clearer audio file or record again.');
    }

    return transcript;
  },
  /**
   * Polishes the text for professional clinical standards.
   */
  // refineSOAP: async (note: Partial<SOAPNote>): Promise<Partial<SOAPNote>> => {
  //   const prompt = `
  //     Refine the following clinical notes to be more professional, succinct, and shorter. 
  //     Ensure HIPAA-compliant style and medical precision. 
  //     DO NOT ADD NEW MEDICAL INFORMATION. Only improve clarity, brevity, and formatting.
  //     Make the notes concise while retaining all important medical information.
      
  //     Subjective: ${note.subjective}
  //     Objective: ${note.objective}
  //     Assessment: ${note.assessment}
  //     Plan: ${note.plan}
  //   `;

  //   try {
  //     const response = await ai.models.generateContent({
  //       model: 'gemini-1.5-pro',
  //       contents: prompt,
  //       config: {
  //         responseMimeType: "application/json",
  //         responseSchema: SOAP_SCHEMA
  //       }
  //     });

  //     // Extract text directly from the .text property
  //     const result = JSON.parse(response.text || '{}');
  //     console.log("Refinement successful:", result);
  //     return result;
  //   } catch (error: any) {
  //     console.error("Refinement error details:", error);
  //     // If refinement fails, return the original note
  //     console.warn("Refinement failed, returning original note");
  //     return note;
  //   }
  // },

  refineSOAP: async (note: Partial<SOAPNote>): Promise<Partial<SOAPNote>> => {

  const clean = (text?: string) =>
    (text || "")
      .replace(/\bS:\s*/gi, "")
      .replace(/\bO:\s*/gi, "")
      .replace(/\bA:\s*/gi, "")
      .replace(/\bP:\s*/gi, "")
      .replace(/\n+/g, " ")
      .trim();

  const mergedText = `
${clean(note.subjective)}
${clean(note.objective)}
${clean(note.assessment)}
${clean(note.plan)}
`;

  const prompt = `
You are a clinical documentation assistant.

The following clinical statements were extracted from a doctor–patient conversation.
They may contain duplicated or miscategorized information.

Your task:

1. Remove duplicated sentences.
2. Assign each statement to the correct SOAP section.
3. Do not repeat the same sentence in multiple sections.
4. Use concise medical language.

SOAP definitions:

Subjective:
Patient symptoms and reported history.

Objective:
Exam findings, vitals, lab results, imaging.

Assessment:
Clinical interpretation or diagnosis.

Plan:
Treatment, medications, follow-up instructions.

Return JSON only:

{
 "subjective": "",
 "objective": "",
 "assessment": "",
 "plan": ""
}

Clinical statements:
${mergedText}
`;
  try {

    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: SOAP_SCHEMA
      }
    });

    const result = JSON.parse(response.text || "{}");

    return {
      subjective: result.subjective || "",
      objective: result.objective || "",
      assessment: result.assessment || "",
      plan: result.plan || ""
    };

  } catch (err) {

    console.error("SOAP refinement failed:", err);

    return {
      subjective: clean(note.subjective),
      objective: clean(note.objective),
      assessment: clean(note.assessment),
      plan: clean(note.plan)
    };
  }
},

  analyzeDifferences: async (flash: any, pro: any): Promise<string> => {
    const prompt = `
      Compare these two versions of a SOAP note.
      Version A (Flash Model): ${JSON.stringify(flash)}
      Version B (Pro Model): ${JSON.stringify(pro)}
      
      Analyze the differences in terms of:
      1. Clinical accuracy and nuance.
      2. Potential hallucinations or omissions.
      3. Linguistic professionalism.
      Provide a brief expert summary.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt
    });

    // Extract text directly from the .text property
    return response.text || "Analysis unavailable.";
  },

  queryNotes: async (query: string, history: SOAPNote[]): Promise<string> => {
    const context = history.map(n => `Date: ${n.date}, Patient: ${n.patientName}, Assessment: ${n.assessment}`).join('\n');
    const prompt = `
      You are a clinical query assistant. Use the following medical records context to answer the clinician's query.
      Context:
      ${context}
      
      Query: ${query}
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt
    });

    // Extract text directly from the .text property
    return response.text || "No relevant information found.";
  }
};