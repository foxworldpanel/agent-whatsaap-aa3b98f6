import { Route } from "./src/routes/api/public/hooks/uazapi-webhook";

async function simulate() {
  const payload = {
    event: "messages.upsert",
    instance: { token: "443b8ed4-c3d1-402a-84e1-dbfcefe174a8" },
    data: {
      key: { remoteJid: "5511970116430@s.whatsapp.net", fromMe: false, id: "SIM_" + Date.now() },
      message: { conversation: "Olá, quero ver os logs." },
      messageType: "conversation"
    }
  };

  const request = new Request("http://localhost:8080/api/public/hooks/uazapi-webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  console.log("Starting simulation...");
  // We need to access the POST handler. Since Route is a TanStack route:
  const handler = Route.options.server?.handlers?.POST;
  if (handler) {
    const response = await handler({ request } as any);
    console.log("Response status:", response.status);
    const text = await response.text();
    console.log("Response body:", text);
  } else {
    console.error("POST handler not found");
  }
}

simulate().catch(console.error);
