import { createServerFn } from "@tanstack/react-start";
import { withWorkspaceScope } from "@/lib/workspace-scope-middleware";
import { z } from "zod";
import { runAgentV3Turn } from "./orchestrator.server";
import { supabase } from "@/integrations/supabase/client";

const calculateHaiku45Cost = (usage: any) => {
  const input = usage.input_tokens || 0;
  const output = usage.output_tokens || 0;
  return (input * 0.00000015) + (output * 0.00000060);
};

export const runPlaygroundTurn = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) => 
    z.object({
      sessionId: z.string(),
      message: z.string(),
      inputKind: z.string().optional()
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { sessionId, message, inputKind = "texto" } = data;
    const { userId, workspaceId } = context;

    const start = Date.now();

    const { data: messages } = await supabase
      .from("agent_playground_messages")
      .select("*")
      .eq("session_id", sessionId)
      .order("sequence", { ascending: true });

    const history = (messages || []).map(m => ({
      role: (m.role === "assistant" ? "agent" : "customer") as "agent" | "customer",
      content: m.content
    }));

    const { data: userMsg } = await supabase
      .from("agent_playground_messages")
      .insert({
        session_id: sessionId,
        role: "user",
        content: message,
        sequence: (messages?.length || 0) + 1,
        input_kind: inputKind
      })
      .select()
      .single();

    if (!userMsg) throw new Error("Falha ao salvar mensagem do usuário");

    const result = await runAgentV3Turn({
      message,
      userId,
      history,
      anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
      inputKind: inputKind as any
    });

    const { data: agentMsg } = await supabase
      .from("agent_playground_messages")
      .insert({
        session_id: sessionId,
        role: "assistant",
        content: result.replies.join("\n"),
        sequence: (messages?.length || 0) + 2,
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
          conversation_feedback: result.conversation_feedback
        } as any
      })
      .select()
      .single();

    if (!agentMsg) throw new Error("Falha ao salvar resposta do agente");

    const latencyMs = Date.now() - start;
    const usage = result.usage || {};
    const modulesTelemetry = result.modulesTelemetry || [];
    const comparison = result.promptComparison || { withoutCommercial: 0, withCommercial: 0, diff: 0 };
    
    const insertData: any = {
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
        modules_telemetry: modulesTelemetry,
        prompt_comparison: comparison
      }
    };

    await supabase.from("agent_playground_runs").insert(insertData);

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
        conversation_score: result.conversation_score,
        conversation_feedback: result.conversation_feedback
      }
    };
  });
