import { createServerFn } from "@tanstack/react-start";
import { withWorkspaceScope } from "@/lib/workspace-scope-middleware";
import { z } from "zod";
import { normalizeHumanizationSettings, calculateHumanResponseTargetMs, sleepMs } from "../humanization.server";

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

    // O playground envia apenas a janela recente. Reenviar a sessão inteira a cada turno
    // aumenta o custo de input indefinidamente e não representa o runtime de produção.
    const { data: recentMessages } = await context.supabase
      .from("agent_playground_messages")
      .select("*")
      .eq("session_id", sessionId)
      .order("sequence", { ascending: false })
      .limit(10);

    const messages = recentMessages || [];
    const nextSequence = Number(messages[0]?.sequence || 0) + 1;
    const history = [...messages].reverse().map(m => ({
      role: (m.role === "assistant" ? "agent" : "customer") as "agent" | "customer",
      content: m.content
    }));

    const { data: userMsg } = await context.supabase
      .from("agent_playground_messages")
      .insert({
        session_id: sessionId,
        role: "user",
        content: message,
        sequence: nextSequence,
        input_kind: inputKind
      })
      .select()
      .single();

    if (!userMsg) throw new Error("Falha ao salvar mensagem do usuário");

    const { buildAgentExecutionContext } = await import("../core/agent-execution-context.server");
    const executionContext = buildAgentExecutionContext({
      mode: "playground",
      message,
      history,
    });

    // PONTO ÚNICO DE EXECUÇÃO — mesmo fluxo do WhatsApp (Router primeiro,
    // Claude só se necessário). Isso é o que faz o Playground refletir o
    // custo real da arquitetura, não só o custo de uma chamada direta.
    const { executeAgent } = await import("../core/execute-agent.server");
    const execResult = await executeAgent({
      message,
      userId,
      history,
      anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
      workspaceId,
      inputKind: inputKind as any,
      businessDecision: executionContext.businessDecision,
      extraContext: executionContext.extraContext,
      rememberedContext: executionContext.rememberedContext as any,
      routerContext: {
        isFirstTurn: history.length === 0,
        funnelAlreadyCompleted: false, // Playground não tem conceito de funil de boas-vindas
      },
    });

    const reply = execResult.reply;

    // Playground permanece rápido por padrão. O atraso só é aplicado quando
    // explicitamente habilitado na aba Tempo e Humanização.
    const { data: humanizationConfigRow } = await (context.supabase as any)
      .from("agent_config")
      .select("modules, response_delay_min_sec, response_delay_max_sec, typing_indicator_enabled")
      .eq("user_id", userId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    const legacyModules =
      humanizationConfigRow?.modules &&
      typeof humanizationConfigRow.modules === "object"
        ? humanizationConfigRow.modules
        : {};

    const storedHumanization =
      (legacyModules as any)?.__humanization_settings;

    const humanization = normalizeHumanizationSettings(
      storedHumanization && typeof storedHumanization === "object"
        ? storedHumanization
        : {
            min_response_delay_ms:
              Number.isFinite(Number(humanizationConfigRow?.response_delay_min_sec))
                ? Number(humanizationConfigRow.response_delay_min_sec) * 1000
                : undefined,
            max_response_delay_ms:
              Number.isFinite(Number(humanizationConfigRow?.response_delay_max_sec))
                ? Number(humanizationConfigRow.response_delay_max_sec) * 1000
                : undefined,
            typing_enabled:
              typeof humanizationConfigRow?.typing_indicator_enabled === "boolean"
                ? humanizationConfigRow.typing_indicator_enabled
                : undefined,
          },
    );
    if (humanization.enabled && humanization.playground_delay_enabled) {
      const targetMs = calculateHumanResponseTargetMs(reply, humanization);
      const elapsedMs = Date.now() - start;
      await sleepMs(Math.max(0, targetMs - elapsedMs));
    }

    const { data: agentMsg } = await context.supabase
      .from("agent_playground_messages")
      .insert({
        session_id: sessionId,
        role: "agent",
        content: reply,
        sequence: nextSequence + 1,
        metadata: {
          ...(execResult.agentResult?.intelligence || {}),
          route: execResult.route,
          router_reason: execResult.routerReason,
          conversation_score: execResult.agentResult?.score?.total,
          conversation_feedback: []
        } as any
      })
      .select()
      .single();

    if (!agentMsg) throw new Error("Falha ao salvar resposta do agente");

    const latencyMs = Date.now() - start;

    // Quando a rota foi "code" (Router respondeu, Claude não foi chamado),
    // vários campos que só existem numa chamada real ao Claude (módulos,
    // intelligence, prompt) ficam com valores neutros — refletindo
    // fielmente que a IA não participou dessa resposta.
    const usage = execResult.usage;
    const modules = execResult.agentResult?.modules ?? {
      selected_keys: [],
      versions: {},
      estimated_tokens_by_module: {},
      estimated_chars_by_module: {},
      prompt_tokens_without_commercial: 0,
      prompt_tokens_with_commercial: 0,
      commercial_tokens_added: 0,
    };
    const intelligence = execResult.agentResult?.intelligence ?? null;
    const score = execResult.agentResult?.score ?? null;
    const cost = execResult.cost;

    const insertData: any = {
      session_id: sessionId,
      message_id: agentMsg.id,
      model: execResult.claudeCalled ? (usage as any).model : "nenhum (respondido pelo Smart Router)",
      selected_modules: modules.selected_keys,
      system_prompt_chars: execResult.agentResult ? JSON.stringify(execResult.agentResult.rawPrompt).length : 0,
      history_chars: JSON.stringify(history).length,
      message_chars: message.length,
      response_chars: agentMsg.content.length,
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      cache_creation_input_tokens: (usage as any).cache_creation_input_tokens || 0,
      cache_read_input_tokens: (usage as any).cache_read_input_tokens || 0,
      cost_usd: cost.total_usd,
      latency_ms: latencyMs,
      anthropic_request_id: (usage as any).request_id ?? null,
      system_prompt_snapshot: execResult.agentResult ? JSON.stringify(execResult.agentResult.rawPrompt) : null,
      temperature: intelligence?.temperature ?? null,
      confidence: intelligence?.confidence ?? null,
      intent: intelligence?.intent ?? null,
      stage: intelligence?.stage ?? null,
      purchase_probability: intelligence?.purchase_probability ?? null,
      sentiment: intelligence?.sentiment ?? null,
      urgency: intelligence?.urgency ?? null,
      recommended_action: intelligence?.recommended_action ?? null,
      reasoning: intelligence?.reasoning ?? null,
      conversation_score: score?.total || 0,
      conversation_feedback: {
        modules: modules,
        intelligence: intelligence,
        score: score,
        cost: cost,
        businessDecision: executionContext.businessDecision,
        extraContext: executionContext.extraContext,
        route: execResult.route,
        router_reason: execResult.routerReason,
        claude_called: execResult.claudeCalled,
      }
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
      route: execResult.route,
      routerReason: execResult.routerReason,
      claudeCalled: execResult.claudeCalled,
      usage: execResult.usage,
      cost: execResult.cost
    });

    return {
      reply,
      run: (savedRun || insertData) as any,
      usage: execResult.usage,
      cost: execResult.cost,
      modules: modules as any,
      intelligence,
      score,
      businessDecision: executionContext.businessDecision,
      extraContext: executionContext.extraContext,
      route: execResult.route,
      routerReason: execResult.routerReason,
      claudeCalled: execResult.claudeCalled,
    };
  });
