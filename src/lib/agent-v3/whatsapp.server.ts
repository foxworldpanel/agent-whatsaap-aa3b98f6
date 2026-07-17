export async function sendWhatsAppMessageV3(phone: string, text: string, correlationId: string) {
  const token = process.env.UAZAPI_TOKEN;
  const instance = process.env.UAZAPI_INSTANCE;
  
  if (!token || !instance) throw new Error("UAZAPI credentials not set");

  const response = await fetch(`https://api.uazapi.com/v2/message/text`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({
      instance,
      to: `${phone}@s.whatsapp.net`,
      text: text
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Uazapi Send Error: ${error}`);
  }
}
