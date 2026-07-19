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
  
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "anthropic-version": "2023-06-01",
    "anthropic-beta": "prompt-caching-2024-07-31",
  };

  if (apiKey) {
    headers["x-api-key"] = apiKey;
  }

  // MAPEA OS NOMES AMIGÁVEIS PARA OS IDS REAIS DO GATEWAY/API
  let realModel = model;
  if (model === "claude-haiku-4-5") realModel = "claude-3-5-sonnet-20240620";
  if (model === "claude-sonnet-5") realModel = "claude-3-5-sonnet-20240620";

  const body = {
    model: realModel,
    max_tokens: 1024,
    system,
    messages
  };

  console.log(`[agent-v3] Calling Anthropic with model ${realModel}. Messages count: ${messages.length}`);

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const err = await response.text();
    console.error("[agent-v3] Anthropic API Error:", err);
    throw new Error(`Anthropic API Error: ${response.status}`);
  }

  return await response.json();
}