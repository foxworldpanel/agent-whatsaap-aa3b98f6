import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { runAgentV3Turn } from "@/lib/agent-v3/orchestrator.server";

export const runPlaygroundTurn = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z.object({
      sessionId: z.string().uuid(),
      message: z.string().min(1),
      inputKind: z.enum(["texto", "audio", "image", "sticker"]).default("texto"),
      enabledModules: z.array(z.string()).optional(),
    }).parse(data)
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { sessionId, message, inputKind, enabledModules } = data;

    // 1. Validar que a sessão pertence ao usuário
    const { data: session, error: sessionError } = await supabase
      .from("agent_playground_sessions")
      .select("*")
      .eq("id", sessionId)
      .eq("user_id", userId)
      .single();

    if (sessionError || !session) {
      throw new Error("Sessão não encontrada ou acesso negado.");
    }

    // 2. Carregar histórico da sessão
    const { data: historyData, error: historyError } = await supabase
      .from("agent_playground_messages")
      .select("role, content, created_at")
      .eq("session_id", sessionId)
      .order("sequence", { ascending: true });

    if (historyError) throw historyError;

    let rawHistory = (historyData || []).map((m: any) => ({
      role: m.role === "user" ? ("customer" as const) : ("agent" as const),
      content: m.content,
      created_at: m.created_at
    }));

    // EXPIRAÇÃO DE 24 HORAS
    let history = [...rawHistory];
    let session_reset_reason: string | undefined;
    if (historyData && historyData.length > 0) {
      const lastMsg = historyData[historyData.length - 1];
      const lastUpdate = new Date(lastMsg.created_at).getTime();
      if (Date.now() - lastUpdate > 24 * 60 * 60 * 1000) {
        history = [];
        session_reset_reason = "inactivity_24h";
      }
    }

    // LIMITE DE 10 MENSAGENS
    const history_truncated = history.length > 10;
    if (history_truncated) {
      history = history.slice(-10);
    }

    const historyTelemetry = {
      total_messages_stored: rawHistory.length,
      history_truncated,
      session_reset_reason,
      oldest_message_sent_at: historyData?.[0]?.created_at
    };

    // 3. Salvar mensagem do usuário
    const nextSequence = (historyData?.length || 0) + 1;
    await supabase.from("agent_playground_messages").insert({
      session_id: sessionId,
      role: "user",
      content: message,
      input_kind: inputKind,
      sequence: nextSequence,
    });

    // 4. Executar o Agent V3
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicApiKey) throw new Error("ANTHROPIC_API_KEY não configurada no servidor.");

    const startTime = Date.now();
    const result = await runAgentV3Turn({
      userId: userId, // Usamos o ID do usuário como referência de workspace se necessário, mas o orchestrator busca por userId
      message,
      history,
      historyTelemetry,
      enabledModules: enabledModules || session.enabled_modules || [],
      anthropicApiKey,
      inputKind,
      messageId: `playground-${sessionId}-${nextSequence + 1}`,
    });
    const latencyMs = Date.now() - startTime;

    // 5. Salvar resposta do agente
    const { data: agentMsg, error: agentMsgError } = await supabase
      .from("agent_playground_messages")
      .insert({
        session_id: sessionId,
        role: "agent",
        content: result.replies.join("\n"),
        sequence: nextSequence + 1,
        metadata: {
          temperature: result.temperature,
          confidence: result.confidence,
          intent: result.intent,
          stage: result.stage,
          purchase_probability: result.purchase_probability,
          sentiment: result.sentiment,
          urgency: result.urgency,
          recommended_action: result.recommended_action,
          reasoning: result.reasoning,
          conversation_score: result.conversation_score,
          conversation_feedback: result.conversation_feedback,
        },


      })
      .select()
      .single();

    if (agentMsgError) throw agentMsgError;

    // 6. Salvar Telemetria (Run)
    const usage = result.usage || {};
    const modulesTelemetry = result.modulesTelemetry || [];
    const comparison = result.promptComparison || { withoutCommercial: 0, withCommercial: 0, diff: 0 };
    
    await supabase.from("agent_playground_runs").insert({
      session_id: sessionId,
      message_id: agentMsg.id,
      model: "claude-haiku-4-5",
      selected_modules: result.selectedModules || [],
      system_prompt_chars: JSON.stringify(result.rawPrompt).length,
      history_chars: JSON.stringify(history).length,
      message_chars: message.length,
      response_chars: agentMsg.content.length,
      input_tokens: usage.input_tokens || 0,
      output_tokens: usage.output_tokens || 0,
      cache_creation_input_tokens: usage.cache_creation_input_tokens || 0,
      cache_read_input_tokens: usage.cache_read_input_tokens || 0,
      cost_usd: calculateHaiku45Cost(usage),
      latency_ms: latencyMs,
      anthropic_request_id: usage.request_id,
      system_prompt_snapshot: JSON.stringify(result.rawPrompt),
      temperature: result.temperature,
      confidence: result.confidence,
      intent: result.intent,
      stage: result.stage,
      purchase_probability: result.purchase_probability,
      sentiment: result.sentiment,
      urgency: result.urgency,
      recommended_action: result.recommended_action,
      reasoning: result.reasoning,
      conversation_score: result.conversation_score,
      conversation_feedback: JSON.stringify(result.conversation_feedback),
      metadata: {
        modules_telemetry: modulesTelemetry as any,
        prompt_comparison: comparison as any
      }

    });




    return {
      reply: result.replies.join("\n"),
      metadata: {
        temperature: result.temperature,
        confidence: result.confidence,
        intent: result.intent,
        stage: result.stage,
        purchase_probability: result.purchase_probability,
        sentiment: result.sentiment,
        urgency: result.urgency,
        recommended_action: result.recommended_action,
        reasoning: result.reasoning,
      },
      usage: usage,
      latencyMs,
      selectedModules: result.selectedModules || [],
      modulesTelemetry,
      promptComparison: comparison
    };

  });

function calculateHaiku45Cost(usage: any) {
  const inputRate = 0.00000025; // $0.25 / 1M
  const outputRate = 0.00000125; // $1.25 / 1M
  const cacheWriteRate = 0.00000030; // $0.30 / 1M (estimado/placeholder se não houver oficial)
  
  const input = (usage.input_tokens || 0) * inputRate;
  const output = (usage.output_tokens || 0) * outputRate;
  const cacheWrite = (usage.cache_creation_input_tokens || 0) * cacheWriteRate;
  const cacheRead = (usage.cache_read_input_tokens || 0) * (inputRate * 0.1); // 90% discount

  return input + output + cacheWrite + cacheRead;
}
