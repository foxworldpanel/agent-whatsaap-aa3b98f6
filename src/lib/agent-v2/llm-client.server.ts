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

/**
 * Motor de Inferência V2 (Isolado da V1)
 * Chama diretamente a API da Anthropic via fetch para evitar poluição por regras da V1.
 */
export async function callLLMV2(params: {
  systemPrompt: string;
  userPrompt: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = params.model || 'claude-3-haiku-20240307';
  
  if (!apiKey) {
    console.warn('[LLMV2] ANTHROPIC_API_KEY não configurada. Usando bridge V1 como fallback.');
    const { generateAgentReplyWithMeta } = await import('../ai.server');
    const result = await generateAgentReplyWithMeta({
      user_message: params.userPrompt,
      base_instruction: params.systemPrompt,
      model: model as any
    });
    return {
      reply: result.reply,
      usage: result.usage,
      model: result.model,
      duration_ms: 0
    };
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
        messages: [{ role: 'user', content: params.userPrompt }]
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
