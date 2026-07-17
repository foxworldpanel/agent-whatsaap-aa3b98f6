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
export async function callLLMV2(params) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    const model = params.model || 'claude-haiku-4-5-20251001';
    const effectiveModel = model;
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
                model: effectiveModel,
                max_tokens: params.maxTokens || 1024,
                temperature: params.temperature ?? 0.7,
                system: params.systemPrompt,
                messages: params.messages
            })
        });
        const bodyText = await response.text();
        if (!response.ok) {
            throw new Error(`Anthropic API Error (${response.status}): ${bodyText}`);
        }
        const data = JSON.parse(bodyText);
        const parsed = AnthropicResponseSchema.parse(data);
        const reply = parsed.content[0].text;
        // LOG DE SEGURANÇA E AUDITORIA - Captura o turno real
        // LOG DE SEGURANÇA E AUDITORIA - Mascaramento básico de dados sensíveis
        const maskSensitive = (text) => {
            return text
                .replace(/\d{2,3}\.\d{3}\.\d{3}-\d{2}/g, '***.***.***-**') // CPF
                .replace(/\(\d{2}\)\s?\d{4,5}-\d{4}/g, '(XX) XXXXX-XXXX') // Telefone
                .replace(/[\w-\.]+@([\w-]+\.)+[\w-]{2,4}/g, 'email@mascarado.com'); // Email
        };
        const maskedReply = maskSensitive(reply);
        console.log(`[LLMV2][RAW_RESPONSE] Turn: ${Date.now()} | Source: ${params.workspaceId ? 'v2' : 'unknown'} | Model: ${model} | Reply: ${maskedReply.slice(0, 100)}...`);
        // Alerta de custo (estimado para Haiku/Sonnet)
        const estimatedCost = (parsed.usage.input_tokens * (model.includes('sonnet') ? 0.000003 : 0.00000025)) +
            (parsed.usage.output_tokens * (model.includes('sonnet') ? 0.000015 : 0.00000125));
        if (estimatedCost > 0.005) {
            console.warn(`[LLMV2][COST_ALERT] Turno caro detectado: US$ ${estimatedCost.toFixed(6)}`);
        }
        if (reply.includes("atualização") || reply.includes("plays e ouvintes")) {
            console.warn(`[LLMV2][LEAK_DETECTED] Resposta contém termos proibidos: "${maskedReply}"`);
        }
        return {
            reply,
            usage: {
                input_tokens: parsed.usage.input_tokens,
                output_tokens: parsed.usage.output_tokens,
                total_tokens: parsed.usage.input_tokens + parsed.usage.output_tokens
            },
            model: parsed.model,
            duration_ms: Date.now() - startTime
        };
    }
    catch (error) {
        console.error('[LLMV2] Erro na chamada direta Anthropic:', error);
        throw error;
    }
}
