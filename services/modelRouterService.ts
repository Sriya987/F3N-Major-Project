import { flanSoapService } from "./flanSoapService";
import { geminiService } from "./geminiService";

export interface GenerateSOAPInput {
  conversation: string;
  labFile?: File | null;
}

export interface ModelRouterResponse {
  data: {
    subjective: string;
    objective: string;
    assessment: string;
    plan: string;
  };
  source: "local" | "gemini";
}

/* -------------------- NORMALIZER -------------------- */
const normalizeSOAP = (raw: any) => {
  return {
    subjective: raw?.subjective?.trim() || "Not reported",
    objective: raw?.objective?.trim() || "Not reported",
    assessment: raw?.assessment?.trim() || "Not reported",
    plan: raw?.plan?.trim() || "Not reported"
  };
};

/* -------------------- ROUTER -------------------- */
export const modelRouterService = {
  async generateSOAP(input: GenerateSOAPInput): Promise<ModelRouterResponse> {
    const { conversation } = input;

    /* 🔹 STEP 1: TRY LOCAL MODEL */
    try {
      console.log("Trying LOCAL model...");

      const localResponse = await flanSoapService.generateSOAP(conversation);

      return {
        data: normalizeSOAP(localResponse),   // ✅ NORMALIZED
        source: "local"
      };

    } catch (localError) {
      console.warn("Local model failed, switching to Gemini...", localError);

      /* 🔹 STEP 2: FALLBACK → GEMINI */
      try {
        const geminiResponse = await geminiService.generateSOAP(conversation);

        return {
          data: normalizeSOAP(geminiResponse),  // ✅ NORMALIZED
          source: "gemini"
        };

      } catch (geminiError) {
        console.error("Both LOCAL and GEMINI failed");

        throw new Error(
          "Both local model and Gemini failed. Please check backend or API."
        );
      }
    }
  }
};