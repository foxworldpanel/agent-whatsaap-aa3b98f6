// src/lib/agent-v3/llm-client.server.ts

/**
 * Interface simplificada para o cliente Anthropic na V3.
 */
export async function callAnthropicV3(params: {
  apiKey?: string;
  system: any;
  messages: any[];
  model: string;
  metadata?: {
    message_id?: string;
    call_number?: number;
    selectedKeys?: string[];
    system_prompt_chars?: number;
    history_chars?: number;
    message_chars?: number;
    history_summary?: string;
    history_telemetry?: any;
  };
}) {
  const { apiKey, system, messages, model, metadata } = params;
  
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "anthropic-version": "2023-06-01",
    "anthropic-beta": "prompt-caching-2024-07-31",
  };

  if (apiKey) {
    headers["x-api-key"] = apiKey;
    console.log("[DEBUG-V3] Using API Key:", apiKey?.slice(0, 10) + "...");

  }

  // Map high-level models to real Anthropic identifiers
  const anthropicModel = model === "claude-sonnet-5" ? "claude-3-5-sonnet-20241022" : "claude-3-5-sonnet-20241022";









  const body = {
    model: anthropicModel,
    max_tokens: 1024,
    system,
    messages
  };

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

  // TELEMETRIA FINANCEIRA REAL
  const usage = result.usage || {};
  const input_tokens = usage.input_tokens || 0;
  const output_tokens = usage.output_tokens || 0;
  const cache_creation_input_tokens = usage.cache_creation_input_tokens || 0;
  const cache_read_input_tokens = usage.cache_read_input_tokens || 0;

  const PRECO_CACHE_WRITE = 1.25; 
  const PRECO_CACHE_READ = 0.10;  

  const inputCost = (input_tokens * 1) / 1_000_000;
  const outputCost = (output_tokens * 5) / 1_000_000;
  const cacheWriteCost = (cache_creation_input_tokens * PRECO_CACHE_WRITE) / 1_000_000;
  const cacheReadCost = (cache_read_input_tokens * PRECO_CACHE_READ) / 1_000_000;
  const totalCost = inputCost + outputCost + cacheWriteCost + cacheReadCost;

  const response_chars = result.content?.[0]?.text?.length || 0;

  console.log("[ANTHROPIC-TELEMETRY-RAW]", JSON.stringify({
    usage: {
      model: model,
      input_tokens,
      output_tokens,
      cache_creation_input_tokens,
      cache_read_input_tokens,
      request_id: requestId,
      raw_usage: usage // Registre o objeto usage literal retornado pela Anthropic
    },
    metadata: {
      call_number_for_message: metadata?.call_number || 1,
      message_id: metadata?.message_id || "unknown",
      selectedKeys: metadata?.selectedKeys || [],
      system_prompt_chars: metadata?.system_prompt_chars || 0,
      history_chars: metadata?.history_chars || 0,
      message_chars: metadata?.message_chars || 0,
      history_summary: metadata?.history_summary || "none",
      history_telemetry: metadata?.history_telemetry || {},
      response_chars
    },
    financial: {
      inputCost,
      outputCost,
      cacheWriteCost,
      cacheReadCost,
      totalCost
    }
  }));

  return result;
}
