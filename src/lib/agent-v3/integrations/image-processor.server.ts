const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";

function normalizeImageSource(media: string, mimetype?: string | null): { type: "base64"; media_type: string; data: string } | { type: "url"; url: string } {
  const value = media.trim();
  const data = value.match(/^data:([^;]+);base64,(.+)$/s);
  if (data) return { type: "base64", media_type: data[1], data: data[2].replace(/\s+/g, "") };
  if (/^https?:\/\//i.test(value)) return { type: "url", url: value };
  if (/^[A-Za-z0-9+/=\r\n]+$/.test(value) && value.length > 500) {
    return { type: "base64", media_type: mimetype || "image/jpeg", data: value.replace(/\s+/g, "") };
  }
  throw new Error("Inbound image has unsupported media source");
}

export async function processImageV3(media: string, anthropicApiKey: string, mimetype?: string | null): Promise<string> {
  const apiKey = anthropicApiKey.trim();
  if (!apiKey) throw new Error("Anthropic API key is required for image understanding");
  const source = normalizeImageSource(media, mimetype);
  const response = await fetch(ANTHROPIC_MESSAGES_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "anthropic-version": "2023-06-01",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 350,
      messages: [{
        role: "user",
        content: [
          { type: "image", source },
          { type: "text", text: "Analise esta imagem recebida em uma conversa comercial no WhatsApp. Descreva objetivamente o que é relevante para responder ao cliente: textos visíveis, plataforma/tela, valores, botões, estados, erros e contexto. Se parecer comprovante de pagamento, descreva apenas o que está visível e nunca afirme que o pagamento foi confirmado pelo sistema. Não invente dados ilegíveis. Responda em português, de forma concisa." },
        ],
      }],
    }),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`Anthropic vision failed (${response.status}): ${raw.slice(0, 300)}`);
  const result = JSON.parse(raw) as { content?: Array<{ type?: string; text?: string }> };
  const text = (result.content || []).filter((x) => x.type === "text" && x.text).map((x) => x.text!.trim()).join("\n").trim();
  if (!text) throw new Error("Anthropic vision returned empty image description");
  return text;
}
