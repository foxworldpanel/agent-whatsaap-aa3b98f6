import { z } from 'zod';

const AnthropicResponseSchema = z.object({
  id: z.string(),
  content: z.array(z.object({
    text: z.string(),
    type: z.string()
  })),
  usage: z.object({
    input_tokens: z.number(),
    output_tokens: z.number()
  }),
  model: z.string()
});

export interface LLMMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Motor de Inferência V2 (Isolado da V1)
 * Chama diretamente a API da Anthropic via fetch para evitar poluição por regras da V1.
 */
export async function callLLMV2(params: {
  systemPrompt: string;
  messages: LLMMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  workspaceId?: string;
  phoneNumber?: string;
}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = params.model || 'claude-3-haiku-20240307';
  
  if (!apiKey) {
    throw new Error('[LLMV2] ANTHROPIC_API_KEY não configurada. V2 requer inferência direta.');
  }

  const startTime = Date.now();
  
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: model,
        max_tokens: params.maxTokens || 1024,
        temperature: params.temperature ?? 0.7,
        system: params.systemPrompt,
        messages: params.messages
      })
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`Anthropic API Error (${response.status}): ${errorData}`);
    }

    const data = await response.json();
    const parsed = AnthropicResponseSchema.parse(data);
    
    return {
      reply: parsed.content[0].text,
      usage: {
        input_tokens: parsed.usage.input_tokens,
        output_tokens: parsed.usage.output_tokens,
        total_tokens: parsed.usage.input_tokens + parsed.usage.output_tokens
      },
      model: parsed.model,
      duration_ms: Date.now() - startTime
    };
  } catch (error) {
    console.error('[LLMV2] Erro na chamada direta Anthropic:', error);
    throw error;
  }
}
