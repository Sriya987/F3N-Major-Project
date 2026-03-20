export interface SOAPResponse {
  subjective: string
  objective: string
  assessment: string
  plan: string
}

export const flanSoapService = {

  async generateSOAP(conversation: string): Promise<SOAPResponse> {

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
      throw new Error("SOAP generation failed")
    }

    const data = await response.json()

    return data
  }

}