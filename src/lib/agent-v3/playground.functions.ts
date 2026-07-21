import { createServerFn } from "@tanstack/react-start";
import { withWorkspaceScope } from "@/lib/workspace-scope-middleware";
import { z } from "zod";
import { runAgentV3Turn } from "./orchestrator.server";


// Cost calculation moved to orchestrator, but we keep this as helper if needed
const calculateHaiku45Cost = (usage: any) => {
  const input = usage.input_tokens || 0;
  const output = usage.output_tokens || 0;
  const cacheWrite = usage.cache_creation_input_tokens || 0;
  const cacheRead = usage.cache_read_input_tokens || 0;
  return (input * 0.000001) + (output * 0.000005) + (cacheWrite * 0.00000125) + (cacheRead * 0.0000001);
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

    const { data: messages } = await context.supabase
      .from("agent_playground_messages")
      .select("*")
      .eq("session_id", sessionId)
      .order("sequence", { ascending: true });

    const history = (messages || []).map(m => ({
      role: (m.role === "assistant" ? "agent" : "customer") as "agent" | "customer",
      content: m.content
    }));

    const { data: userMsg } = await context.supabase
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

    const { data: agentMsg } = await context.supabase
      .from("agent_playground_messages")
      .insert({
        session_id: sessionId,
        role: "agent",
        content: result.replies.join("\n"),
        sequence: (messages?.length || 0) + 2,
        metadata: {
          ...result.intelligence,
          conversation_score: result.score?.total,
          conversation_feedback: [] // Derived from reasoning or future audit
        } as any
      })
      .select()
      .single();

    if (!agentMsg) throw new Error("Falha ao salvar resposta do agente");

    const latencyMs = Date.now() - start;
    const usage = result.usage;
    const modules = result.modules;
    const intelligence = result.intelligence;
    const score = result.score;
    const cost = result.cost;
    
    const insertData: any = {
      session_id: sessionId,
      message_id: agentMsg.id,
      model: usage.model,
      selected_modules: modules.selected_keys,
      system_prompt_chars: JSON.stringify(result.rawPrompt).length,
      history_chars: JSON.stringify(history).length,
      message_chars: message.length,
      response_chars: agentMsg.content.length,
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      cache_creation_input_tokens: usage.cache_creation_input_tokens,
      cache_read_input_tokens: usage.cache_read_input_tokens,
      cost_usd: cost.total_usd,
      latency_ms: usage.latency_ms,
      anthropic_request_id: usage.request_id,
      system_prompt_snapshot: JSON.stringify(result.rawPrompt),
      temperature: intelligence.temperature,
      confidence: intelligence.confidence,
      intent: intelligence.intent,
      stage: intelligence.stage,
      purchase_probability: intelligence.purchase_probability,
      sentiment: intelligence.sentiment,
      urgency: intelligence.urgency,
      recommended_action: intelligence.recommended_action,
      reasoning: intelligence.reasoning,
      conversation_score: score?.total || 0,
      
      // Coluna metadata não existe no banco, removendo para evitar erro PGRST204
      // conversation_feedback é jsonb e serve para metadados complexos
      conversation_feedback: JSON.parse(JSON.stringify({
        modules: modules,
        intelligence: intelligence,
        score: score,
        cost: cost
      }))
    };

    const { data: savedRun, error: runError } = await context.supabase
      .from("agent_playground_runs")
      .insert(insertData)
      .select()
      .single();

    if (runError) {
      console.error("[PLAYGROUND-RUN-SAVE-FAILED]", {
        code: runError.code,
        message: runError.message,
        details: runError.details,
        hint: runError.hint,
        payload: insertData
      });
    }

    console.log("[PLAYGROUND-TURN-COMPLETE]", {
      sessionId,
      messageId: agentMsg.id,
      runId: savedRun?.id,
      usage: result.usage,
      cost: result.cost
    });

    return {
      reply: result.replies.join("\n"),
      run: savedRun || {
        ...insertData,
        derived_metadata: insertData.metadata
      },
      usage: result.usage,
      cost: result.cost,
      modules: result.modules,
      intelligence: result.intelligence,
      score: result.score
    };
  });
