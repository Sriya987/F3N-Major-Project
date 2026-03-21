export interface SOAPResponse {
  subjective: string
  objective: string
  assessment: string
  plan: string
}

const normalizeSoapResponse = (payload: any): SOAPResponse => {
  const source = payload?.soap_note && typeof payload.soap_note === 'object'
    ? payload.soap_note
    : payload;

  return {
    subjective: source?.subjective || 'Not reported',
    objective: source?.objective || 'Not reported',
    assessment: source?.assessment || 'Not reported',
    plan: source?.plan || 'Not reported'
  };
};

export const flanSoapService = {

  async generateSOAP(conversation: string): Promise<SOAPResponse> {
    try {
      const response = await fetch("http://localhost:8000/generate-soap", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          conversation: conversation
        })
      })

      if (!response.ok) {
        throw new Error("SOAP generation failed on local model API")
      }

      const data = await response.json()

      return normalizeSoapResponse(data)
    } catch (error: any) {
      if ((error?.message || "").toLowerCase().includes("failed to fetch")) {
        throw new Error("Cannot reach SOAP API at http://localhost:8000. Ensure uvicorn is running.")
      }
      throw error
    }
  }

}