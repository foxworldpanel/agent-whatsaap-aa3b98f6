// src/lib/agent-v3/integrations/llm-client.server.ts

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;
const RETRYABLE_STATUS = new Set([408, 409, 429, 500, 502, 503, 504]);

export type AnthropicV3Result = {
  content?: Array<{ type?: string; text?: string }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  request_id?: string;
};


export function extractAnthropicTextV3(result: AnthropicV3Result): string {
  return (result.content || [])
    .filter(
      (item): item is { type?: string; text: string } =>
        item.type === "text" && typeof item.text === "string" && item.text.trim().length > 0,
    )
    .map((item) => item.text.trim())
    .join("\n\n")
    .trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(attempt: number, retryAfter: string | null): number {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1_000, 10_000);
    }

    const retryDateMs = Date.parse(retryAfter);
    if (Number.isFinite(retryDateMs)) {
      return Math.min(Math.max(0, retryDateMs - Date.now()), 10_000);
    }
  }

  // Backoff curto com jitter para evitar rajadas simultâneas no webhook.
  const base = 300 * 2 ** Math.max(0, attempt - 1);
  return Math.min(base + Math.floor(Math.random() * 150), 2_500);
}

function safeErrorBody(body: string): string {
  const compact = body.replace(/\s+/g, " ").trim();
  return compact.length > 1_500 ? `${compact.slice(0, 1_500)}…` : compact;
}

/**
 * Cliente Anthropic do Agent V3 com timeout, retry limitado e request id.
 */
export async function callAnthropicV3(params: {
  apiKey?: string;
  system: unknown;
  messages: unknown[];
  model: string;
  timeoutMs?: number;
  metadata?: {
    message_id?: string;
    call_number?: number;
    selectedKeys?: string[];
    system_prompt_chars?: number;
    history_chars?: number;
    message_chars?: number;
    history_summary?: string;
    history_telemetry?: unknown;
  };
}): Promise<AnthropicV3Result> {
  const { apiKey, system, messages, model, metadata } = params;
  const normalizedApiKey = apiKey?.trim();
  const anthropicModel = model.trim();

  if (!normalizedApiKey) {
    throw new Error("Anthropic API key is required");
  }
  if (!anthropicModel) {
    throw new Error("Anthropic model is required");
  }

  const headers: Record<string, string> = {
    "content-type": "application/json",
    "anthropic-version": "2023-06-01",
    "anthropic-beta": "prompt-caching-2024-07-31",
    "x-api-key": normalizedApiKey,
  };

  const body = {
    model: anthropicModel,
    max_tokens: 384,
    system,
    messages,
  };

  const timeoutMs = Math.max(1_000, params.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(ANTHROPIC_MESSAGES_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const requestId =
        response.headers.get("request-id") || response.headers.get("x-request-id") || "unknown";

      if (!response.ok) {
        const errorBody = safeErrorBody(await response.text());
        const error = new Error(
          `Anthropic API Error: ${response.status}${errorBody ? ` - ${errorBody}` : ""}`,
        );
        lastError = error;

        if (attempt < MAX_ATTEMPTS && RETRYABLE_STATUS.has(response.status)) {
          const delay = retryDelayMs(attempt, response.headers.get("retry-after"));
          console.warn(
            `[agent-v3] Anthropic attempt ${attempt}/${MAX_ATTEMPTS} failed with ${response.status}; retrying in ${delay}ms (request_id=${requestId})`,
          );
          await sleep(delay);
          continue;
        }

        console.error(
          `[agent-v3] Anthropic request failed (status=${response.status}, request_id=${requestId}):`,
          errorBody,
        );
        throw error;
      }

      const result = (await response.json()) as AnthropicV3Result;
      result.request_id = requestId;

      const usage = result.usage || {};
      const input_tokens = usage.input_tokens || 0;
      const output_tokens = usage.output_tokens || 0;
      const cache_creation_input_tokens = usage.cache_creation_input_tokens || 0;
      const cache_read_input_tokens = usage.cache_read_input_tokens || 0;

      // Mantém a telemetria existente. Os valores financeiros finais também são
      // calculados no orchestrator para compatibilidade com a UI atual.
      const inputCost = (input_tokens * 1) / 1_000_000;
      const outputCost = (output_tokens * 5) / 1_000_000;
      const cacheWriteCost = (cache_creation_input_tokens * 1.25) / 1_000_000;
      const cacheReadCost = (cache_read_input_tokens * 0.1) / 1_000_000;
      const totalCost = inputCost + outputCost + cacheWriteCost + cacheReadCost;

      const response_chars = (result.content || [])
        .filter((item) => item.type === "text" && typeof item.text === "string")
        .reduce((total, item) => total + (item.text?.length || 0), 0);

      console.log(
        "[ANTHROPIC-TELEMETRY-RAW]",
        JSON.stringify({
          usage: {
            model: anthropicModel,
            input_tokens,
            output_tokens,
            cache_creation_input_tokens,
            cache_read_input_tokens,
            request_id: requestId,
            raw_usage: usage,
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
            response_chars,
            attempts: attempt,
          },
          financial: {
            inputCost,
            outputCost,
            cacheWriteCost,
            cacheReadCost,
            totalCost,
          },
        }),
      );

      return result;
    } catch (error) {
      lastError = error;
      const isAbort = error instanceof Error && error.name === "AbortError";
      const isRetryableNetworkError = isAbort || error instanceof TypeError;

      if (attempt < MAX_ATTEMPTS && isRetryableNetworkError) {
        const delay = retryDelayMs(attempt, null);
        console.warn(
          `[agent-v3] Anthropic ${isAbort ? "timeout" : "network error"} on attempt ${attempt}/${MAX_ATTEMPTS}; retrying in ${delay}ms`,
        );
        await sleep(delay);
        continue;
      }

      if (isAbort) {
        throw new Error(`Anthropic request timed out after ${timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Anthropic request failed");
}
