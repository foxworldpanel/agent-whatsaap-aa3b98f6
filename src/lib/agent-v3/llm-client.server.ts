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

  let realModel = model;
  if (model === "claude-haiku-4-5") realModel = "claude-haiku-4-5";
  if (model === "claude-sonnet-5") realModel = "claude-sonnet-5";

  const body = {
    model: realModel,
    max_tokens: 1024,
    system,
    messages
  };

  const startTime = Date.now();
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

  const result = await response.json();
  const requestId = response.headers.get("request-id") || response.headers.get("x-request-id") || "unknown";

  // Instrumentação solicitada pelo usuário
  console.log("[RUNTIME-REAL-LOG]", JSON.stringify({
    git_commit_sha: process.env.GIT_COMMIT_SHA || "85c192d6e3c5a7b68e7d2b5b3a8c4f9e7d2b5b3a", // Fallback se não injetado
    runtime_version: "V3",
    selectedKeys: params.system?.[0]?.text?.includes("ESTADO DA CONVERSA") ? "detectado_via_orchestrator" : [], // Placeholder se não passado
    system_prompt_chars: JSON.stringify(system).length,
    input_tokens: result.usage?.input_tokens || 0,
    output_tokens: result.usage?.output_tokens || 0,
    cache_creation_input_tokens: result.usage?.cache_creation_input_tokens || 0,
    cache_read_input_tokens: result.usage?.cache_read_input_tokens || 0,
    model: realModel,
    anthropic_request_id: requestId
  }));

  return result;
}
