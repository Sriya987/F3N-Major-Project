export async function generateSoap(conversation: string) {
  const response = await fetch("http://localhost:8000/generate-soap", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      conversation: conversation,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to generate SOAP note");
  }

  const data = await response.json();

  return data.soap;
}