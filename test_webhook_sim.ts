import { Route } from "./src/routes/api/public/hooks/uazapi-webhook";

async function simulate() {
  const payload = {
    event: "messages",
    token: "443b8ed4-c3d1-402a-84e1-dbfcefe174a8",
    message: {
      chatid: "5511970116430@s.whatsapp.net",
      sender: "5511970116430@s.whatsapp.net",
      messageid: "SIM_" + Date.now(),
      text: "Mensagem de teste para auditoria",
      type: "text",
      fromMe: false
    }
  };

  const request = new Request("http://localhost:8080/api/public/hooks/uazapi-webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  console.log("Starting simulation...");
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
