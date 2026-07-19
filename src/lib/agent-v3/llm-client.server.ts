// src/lib/agent-v3/llm-client.server.ts

/**
 * Interface simplificada para o cliente Anthropic na V3.
 */
export async function callAnthropicV3(params: {
  apiKey?: string;
  system: any;
  messages: any[];
  model: string;
}) {
  const { apiKey, system, messages, model } = params;
  
  // Nota: Em Lovable Cloud, se o apiKey for omitido, o gateway cuida da auth.
  // Se for fornecido via add_secret, usamos ele.
  const authHeader = apiKey ? { "x-api-key": apiKey } : {};

  // Chamada via Anthropic API (compatível com o que o AI Gateway espera ou fetch direto)
  // Usamos fetch direto para garantir controle total sobre o prompt caching.
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "anthropic-version": "2023-06-01",
      ...authHeader
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system,
      messages
    })
  });

  if (!response.ok) {
    const err = await response.text();
    console.error("[agent-v3] Anthropic API Error:", err);
    throw new Error(`Anthropic API Error: ${response.status}`);
  }

  return await response.json();
}
