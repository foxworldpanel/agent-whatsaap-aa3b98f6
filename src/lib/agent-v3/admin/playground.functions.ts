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
      inputKind: z.string().optional(),
      isOutbound: z.boolean().optional(),
      // Simula conversations.funnel_status já "completed" — sem isso,
      // era IMPOSSÍVEL testar no Playground o comportamento pós-funil
      // (não cumprimentar de novo), porque o campo de nível principal
      // que essa regra lê nunca era passado — achado em auditoria de
      // paridade Playground x WhatsApp em 09/08/2026.
      funnelAlreadyCompleted: z.boolean().optional(),
      // Um Customer Turn pode conter uma rajada já agregada pelo pipeline real.
      // Cada item vira uma linha, na mesma ordem usada por buildCustomerTurnRuntimeInput().
      customerTurnMessages: z.array(z.string().min(1)).max(20).optional(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { sessionId, message, inputKind = "texto", isOutbound = false, funnelAlreadyCompleted = false, customerTurnMessages } = data;
    const effectiveMessage = (customerTurnMessages?.length
      ? customerTurnMessages.map((part) => part.trim()).filter(Boolean).join("\n")
      : message
    ).trim();
    const { userId, workspaceId } = context;

    // Estados impossíveis no WhatsApp real não podem existir no Playground:
    // Disparo/outbound não é uma conversa Meta Ads pós-Welcome-Funnel.
    if (isOutbound && funnelAlreadyCompleted) {
      throw new Error("Cenário inválido: Disparo e pós-Funnel não podem estar ativos ao mesmo tempo.");
    }

    if (!effectiveMessage) throw new Error("Customer Turn vazio.");

    const start = Date.now();

    const { data: recentMessages } = await context.supabase
      .from("agent_playground_messages")
      .select("*")
      .eq("session_id", sessionId)
      .order("sequence", { ascending: false })
      .limit(10);

    const messages = recentMessages || [];
    const nextSequence = Number(messages[0]?.sequence || 0) + 1;
    const history = [...messages].reverse().map(m => ({
      role: (m.role === "agent" || m.role === "assistant" ? "agent" : "customer") as "agent" | "customer",
      content: m.content
    }));

    const { data: userMsg } = await context.supabase
      .from("agent_playground_messages")
      .insert({
        session_id: sessionId,
        role: "user",
        content: effectiveMessage,
        sequence: nextSequence,
        input_kind: inputKind
      })
      .select()
      .single();

    if (!userMsg) throw new Error("Falha ao salvar mensagem do usuário");

    // Recupera a decisão comercial do turno anterior da própria sessão.
    // Assim o Playground exercita a mesma reconciliação de estado usada no
    // WhatsApp, em vez de recalcular cada turno como se fosse uma conversa nova.
    const { data: previousRun } = await context.supabase
      .from("agent_playground_runs")
      .select("conversation_feedback")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const previousBusinessDecision =
      (previousRun?.conversation_feedback as any)?.businessDecision ?? null;

    // Memória simulada derivada da própria sessão. Não lê/escreve memória de
    // cliente real, mas fornece ao núcleo o mesmo tipo de contexto que o
    // WhatsApp persiste entre turnos.
    const previousFeedback = (previousRun?.conversation_feedback as any) ?? {};
    const previousIntelligence = previousFeedback?.intelligence ?? {};
    const simulatedLifecycle =
      previousIntelligence?.lifecycle ??
      previousFeedback?.customerLifecycle ??
      "novo_lead";
    const simulatedPreviousOrderContext =
      previousFeedback?.orderContext ?? null;

    const simulatedRememberedContext = {
      platform:
        previousIntelligence?.platform ??
        previousFeedback?.rememberedContext?.platform ??
        null,
      product:
        previousIntelligence?.product ??
        previousFeedback?.rememberedContext?.product ??
        null,
    };

    const { buildAgentExecutionContext } = await import("../core/agent-execution-context.server");
    const executionContext = buildAgentExecutionContext({
      mode: "playground",
      message: effectiveMessage,
      history,
      customerLifecycle: simulatedLifecycle,
      previousBusinessDecision,
      rememberedContext: simulatedRememberedContext,
    });

    const { executeAgent } = await import("../core/execute-agent.server");
    const execResult = await executeAgent({
      message: effectiveMessage,
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
        funnelAlreadyCompleted,
      },
      // Mesmo contrato do runtime real: texto comum passa pelo Smart Router.
      // Só mídia ou uma mensagem explicitamente retomada atrás do Funnel
      // deve pular o Router. "Funnel concluído" por si só não é motivo.
      skipRouter: inputKind !== "texto",
      isOutboundReply: isOutbound,
      funnelAlreadyCompleted,
      previousOrderContext: simulatedPreviousOrderContext,
    });

    const reply = execResult.reply;
    const terminalNoReply =
      execResult.routerReason === "NATURAL_CONVERSATIONAL_SILENCE" ||
      execResult.routerReason === "STOP_REQUEST";

    // Playground é a bancada do cérebro: decisões terminais sem resposta
    // precisam aparecer como estado do turno, sem inventar uma mensagem.
    if (terminalNoReply) {
      const latencyMs = Date.now() - start;
      await context.supabase.from("agent_playground_runs").insert({
        session_id: sessionId,
        user_message: effectiveMessage,
        agent_response: "",
        latency_ms: latencyMs,
        route: execResult.route,
        conversation_feedback: {
          terminalDecision: execResult.routerReason,
          businessDecision: executionContext.businessDecision,
          rememberedContext: executionContext.rememberedContext,
          customerLifecycle: simulatedLifecycle,
          orderContext: execResult.orderContext ?? simulatedPreviousOrderContext,
          customer_turn_messages: customerTurnMessages ?? null,
        } as any,
      });
      return { message: null, terminalDecision: execResult.routerReason };
    }

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


    // Mesma lógica exata do WhatsApp real (uazapi-webhook.ts): usa o array
    // já dividido (replies), não o texto colado com .join("\n"). Achado em
    // auditoria em 10/08/2026 — o Playground salvava tudo como 1 mensagem
    // só, escondendo se o link/tabela realmente sairiam isolados ou se o
    // texto realmente seria cortado acima de 250 chars (que o orchestrator
    // já faz sozinho, via autoSplitLongPartsV3). O Playground "mentia"
    // sobre isso sem ninguém perceber.
    const replyParts =
      execResult.agentResult?.replies && execResult.agentResult.replies.length > 0
        ? execResult.agentResult.replies
        : [reply];

    // O Playground exibe a forma FINAL que o WhatsApp entregaria, não a
    // saída crua do modelo. A transformação é pura e compartilhada com o
    // sender real; só o transporte Uazapi fica fora da bancada.
    const { finalizeAgentText } = await import("../../send-agent-guarded.server");
    const recentAgentBodies = history
      .filter((item) => item.role === "agent")
      .map((item) => item.content)
      .slice(-3);
    const finalizedReplyParts: string[] = [];
    for (const part of replyParts) {
      const finalized = finalizeAgentText(part, {
        applyHumanize: true,
        recentAgentBodies: [...recentAgentBodies, ...finalizedReplyParts].slice(-3),
      });
      if (finalized.transformed) finalizedReplyParts.push(finalized.transformed);
    }

    const finalizedReplyText = finalizedReplyParts.join("\n\n");
    const { shouldReplyWithAudio } = await import("../runtime-support.server");
    const simulatedDeliveryMode = shouldReplyWithAudio({
      inputKind: inputKind as any,
      replyText: finalizedReplyText,
      intent: execResult.agentResult?.intelligence?.intent,
      stage: execResult.agentResult?.intelligence?.stage,
    }) ? "audio" : "texto";

    let agentMsg: any = null;
    for (let i = 0; i < finalizedReplyParts.length; i += 1) {
      const { data: savedPart } = await context.supabase
        .from("agent_playground_messages")
        .insert({
          session_id: sessionId,
          role: "agent",
          content: finalizedReplyParts[i],
          sequence: nextSequence + 1 + i,
          metadata:
            i === finalizedReplyParts.length - 1
              ? ({
                  ...(execResult.agentResult?.intelligence || {}),
                  route: execResult.route,
                  router_reason: execResult.routerReason,
                  conversation_score: execResult.agentResult?.score?.total,
                  conversation_feedback: [],
                } as any)
              : ({} as any),
        })
        .select()
        .single();
      agentMsg = savedPart;
    }

    if (!agentMsg) throw new Error("Falha ao salvar resposta do agente");

    const latencyMs = Date.now() - start;

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
      message_chars: effectiveMessage.length,
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
        orderContext: execResult.orderContext ?? simulatedPreviousOrderContext,
        extraContext: executionContext.extraContext,
        route: execResult.route,
        router_reason: execResult.routerReason,
        claude_called: execResult.claudeCalled,
        delivery_mode: simulatedDeliveryMode,
        customer_turn_messages: customerTurnMessages?.length ? customerTurnMessages : [effectiveMessage],
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
      reply: finalizedReplyText,
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

// Inicia uma simulação de disparo: monta a abertura real (mesma função
// que o disparo de verdade usa — montarMensagemDisparo, com sorteio de
// saudação/linha2/pergunta e substituição correta de {instagram}) e
// insere como mensagem(ns) do agente, sem chamar IA nenhuma — é
// exatamente o texto fixo que seria mandado de verdade. Resolve 2
// problemas na mão: variável mal substituída e esquecer de ligar o
// modo disparo (essa função já devolve o sinal pra UI ligar sozinha).
export const startOutboundSimulation = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) =>
    z.object({
      sessionId: z.string(),
      instagramHandle: z.string().min(1).max(60),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { sessionId, instagramHandle } = data;
    const { userId, workspaceId } = context;

    // O Playground não cria contato operacional. A origem outbound é parte
    // explícita do cenário (isOutboundReply) e a sessão é a memória de teste.
    // Assim a bancada exercita o mesmo cérebro sem poluir contacts/CRM.
    const { montarMensagemDisparo } = await import("@/lib/blast-variations");
    const { _toTemplates } = await import("@/lib/opening-templates.functions");

    const { data: tplRow } = await context.supabase
      .from("opening_templates")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    const templates = _toTemplates(tplRow as any);
    const pick = montarMensagemDisparo("Teste", instagramHandle, { templates });

    const { data: existing } = await context.supabase
      .from("agent_playground_messages")
      .select("sequence")
      .eq("session_id", sessionId)
      .order("sequence", { ascending: false })
      .limit(1);

    let nextSequence = Number(existing?.[0]?.sequence || 0) + 1;

    for (const part of pick.parts) {
      await context.supabase.from("agent_playground_messages").insert({
        session_id: sessionId,
        role: "agent",
        content: part,
        sequence: nextSequence,
        metadata: { origem: "abertura_disparo_simulada" },
      });
      nextSequence += 1;
    }

    return { ok: true, parts: pick.parts };
  });

// Personalidades pré-definidas do cliente IA — cobrem os cenários mais
// comuns de abordagem fria (disparo) e também servem pra inbound.
export const CUSTOMER_PERSONAS: Record<string, string> = {
  curioso: "Curioso e receptivo — está interessado em ouvir, faz perguntas genuínas, não é difícil de convencer.",
  cetico: "Desconfiado — desconfia que pode ser golpe, questiona a legitimidade antes de continuar, pede prova/explicação.",
  seco: "Responde curto e seco — 'sim', 'ok', 'quem é', frases de 2-3 palavras, não elabora, dá trabalho pra extrair informação.",
  ocupado: "Ocupado, mensagens curtas e espaçadas — demora pra responder, às vezes ignora, mas eventualmente volta.",
  ja_conhece: "Já ouviu falar da Mind antes (por outro artista ou já pesquisou) — menciona isso, quer saber se é confiável mesmo.",
  gravadora: "Não é o artista, é alguém da equipe/produtora respondendo pelo perfil — fala de forma mais profissional, pergunta sobre contrato/processo.",
  bravo: "Já teve experiência ruim com outro serviço parecido, entra na conversa desconfiado e um pouco na defensiva.",
};

// Gera a próxima mensagem do "cliente" via IA. Usado só no Playground —
// nunca roda no fluxo real de produção.
export const generateSimulatedCustomerReply = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) =>
    z.object({
      sessionId: z.string(),
      persona: z.string(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { sessionId, persona } = data;

    const { data: recentMessages } = await context.supabase
      .from("agent_playground_messages")
      .select("role, content, sequence")
      .eq("session_id", sessionId)
      .order("sequence", { ascending: false })
      .limit(10);

    const history = [...(recentMessages || [])].reverse();
    const personaDescription = CUSTOMER_PERSONAS[persona] || persona;

    const historyText = history.length
      ? history
          .map((m: any) => `${m.role === "agent" ? "Atendente" : "Cliente"}: ${m.content}`)
          .join("\n")
      : "(nenhuma mensagem ainda — essa é a primeira resposta do cliente)";

    const { callAnthropicV3, extractAnthropicTextV3 } = await import("../integrations/llm-client.server");

    const raw = await callAnthropicV3({
      apiKey: process.env.ANTHROPIC_API_KEY,
      system: `Você está simulando um CLIENTE de WhatsApp real, só pra teste interno — nunca revele que é uma simulação.

Personalidade desse cliente: ${personaDescription}

Regras:
- Responda como uma pessoa real digitaria no WhatsApp: curto, informal, sem pontuação perfeita às vezes.
- Nunca saia do personagem, nunca mencione que é IA ou simulação.
- Baseie sua resposta no histórico da conversa até agora.
- Gere SÓ a próxima mensagem do cliente, nada mais — sem aspas, sem "Cliente:", só o texto da mensagem.`,
      messages: [
        {
          role: "user",
          content: `Histórico da conversa até agora:\n\n${historyText}\n\nGere a próxima mensagem do cliente.`,
        },
      ],
      model: "claude-sonnet-5",
    });

    const text = extractAnthropicTextV3(raw).trim();
    return { message: text };
  });