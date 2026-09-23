import { sendAgentTextGuarded } from "@/lib/send-agent-guarded.server";
import { generateTraceId, logExecutionTrace } from "@/lib/agent-v3/telemetry/execution-tracer.server";
import type { AgentV3RuntimeExecutor } from "@/lib/agent-v3/inbound-runtime-contract.server";
import { runtimeTerminal } from "@/lib/agent-v3/inbound-runtime-result.server";
import { detectCriticalHumanEscalation, shouldReplyWithAudio, traceFunnel } from "@/lib/agent-v3/runtime-support.server";

// Generated from the audited effectful webhook boundary. The webhook owns the
// outer catch/finally so durable ownership is finalized in one place.
export const executeAgentV3Runtime: AgentV3RuntimeExecutor = async (supabaseAdmin, input) => {
  const msgId = input.externalMessageId;
  const conversationId = input.conversationId;
  const contactId = input.contactId;
  const contactSource = input.contactSource;
  const phoneStr = input.phone;
  const workspaceId = input.workspaceId;
  const sendTarget = input.sendTarget;
  const instanceToken = input.instance.uazapiToken;
  const deferredFunnelMessage = input.deferredFunnelMessage;
  const content = { ...input.content };
  const num = {
    id: input.whatsappNumberId,
    user_id: input.userId,
    workspace_id: input.workspaceId,
    uazapi_url: input.instance.uazapiUrl,
  };
  const inboundStartedAt = Date.now();
  const traceId = generateTraceId();

  let contactTemperature = null;
  let customerMemory = null;
  let customerMemoryContext = "";
  if (contactId) {
    const { data: contactRow, error: contactError } = await supabaseAdmin.from("contacts").select("perfil, temperatura").eq("id", contactId).eq("workspace_id", workspaceId).maybeSingle();
    if (contactError) console.warn("[CUSTOMER-MEMORY] contact load failed:", contactError);
    contactTemperature = contactRow?.temperatura ?? null;
    const memoryModule = await import("@/lib/agent-v3/memory/customer-memory.server");
    customerMemory = await memoryModule.loadCustomerCommercialMemory({ supabaseAdmin, workspaceId, contactId, contactTemperature, contactProfile: contactRow?.perfil ?? null });
    customerMemoryContext = memoryModule.customerMemoryPromptContext(customerMemory);
  }

      const { data: integ, error: integErr } = await supabaseAdmin
        .from("integrations")
        .select("anthropic_api_key, openai_api_key, elevenlabs_api_key, elevenlabs_voice_id")
        .eq("user_id", num.user_id)
        .eq("workspace_id", workspaceId)
        .maybeSingle();

      if (integErr) {
        console.error("[UAZ-WEBHOOK] Failed to load AI integrations:", integErr);
        if (conversationId) {
          await supabaseAdmin
            .from("conversations")
            .update({
              needs_review: true,
              review_reason: "falha ao carregar integraÃ§Ãµes de IA",
            })
            .eq("id", conversationId)
            .then(({ error }: { error: any }) => {
              if (error) console.error("[UAZ-WEBHOOK] Failed to flag integration error for review:", error);
            });
        }
        return runtimeTerminal("ai_integrations_unavailable");
      }

      const anthropicApiKey =
        integ?.anthropic_api_key?.trim() || process.env.ANTHROPIC_API_KEY?.trim() || "";
      const openaiApiKey =
        integ?.openai_api_key?.trim() || process.env.OPENAI_API_KEY?.trim() || "";
      const elevenlabsApiKey =
        integ?.elevenlabs_api_key?.trim() || process.env.ELEVENLABS_API_KEY?.trim() || "";
      const elevenlabsVoiceId =
        integ?.elevenlabs_voice_id?.trim() || process.env.ELEVENLABS_VOICE_ID?.trim() || "";

      const creds = { uazapi_url: num.uazapi_url ?? "", uazapi_token: instanceToken };

      let finalMsgText = deferredFunnelMessage || content.text || "";
      if (content.kind === "audio") {
        if (!openaiApiKey) {
          console.error("[AUDIO-V3] Whisper indisponÃ­vel: OPENAI_API_KEY ausente");
          if (conversationId) {
            await supabaseAdmin
              .from("conversations")
              .update({
                needs_review: true,
                review_reason: "Ã¡udio recebido sem chave OpenAI para transcriÃ§Ã£o",
              })
              .eq("id", conversationId);
          }
          return runtimeTerminal("audio_unavailable");
        }

        try {
          console.log("[AUDIO-V3] 1/5 Ã¡udio inbound detectado", {
            msgId,
            mime: content.mime || null,
            webhookMediaUrl: !!content.mediaUrl,
          });

          // Caminho principal: a prÃ³pria Uazapi baixa/descriptografa a mÃ­dia e
          // pede ao Whisper a transcriÃ§Ã£o. Isso evita depender de mediaUrl temporÃ¡ria
          // ou de campos diferentes entre versÃµes do webhook.
          const { uazapiResolveInboundMedia } = await import("@/lib/uazapi.server");

          const downloaded = await uazapiResolveInboundMedia({
            creds,
            webhookMessageId: msgId,
            chatPhone: phoneStr,
            mediaKind: "audio",
            openaiApiKey,
          });

          const inboundAudioUrl =
            downloaded.fileURL?.trim() ||
            downloaded.fileData?.trim() ||
            content.mediaUrl?.trim() ||
            "";

          finalMsgText = downloaded.transcription?.trim() || "";

          console.log("[AUDIO-V3] /message/download concluÃ­do", {
            hasTranscription: !!finalMsgText,
            hasUrl: !!downloaded.fileURL,
            hasData: !!downloaded.fileData,
            mimetype: downloaded.mimetype,
          });

          // Fallback: se a Uazapi nÃ£o retornou a transcriÃ§Ã£o, usamos nosso
          // processador Whisper diretamente com a mÃ­dia resolvida.
          if (!finalMsgText) {
            if (!inboundAudioUrl) {
              throw new Error(
                "Uazapi nÃ£o retornou transcriÃ§Ã£o nem mÃ­dia utilizÃ¡vel para o Ã¡udio",
              );
            }

            const { processAudioV3 } = await import(
              "@/lib/agent-v3/integrations/audio-processor.server"
            );
            const transcription = await processAudioV3(
              inboundAudioUrl,
              openaiApiKey,
            );
            finalMsgText = transcription?.trim() || "";
          }

          if (!finalMsgText) {
            throw new Error("Whisper retornou transcriÃ§Ã£o vazia");
          }

          console.log("[AUDIO-V3] 2/5 Whisper concluÃ­do", {
            chars: finalMsgText.length,
          });

          // Se a Uazapi disponibilizou uma URL reproduzÃ­vel, salva no CRM tambÃ©m.
          // Assim o player da conversa deixa de exibir 0:00 quando houver mÃ­dia pÃºblica.
          if (conversationId && downloaded.fileURL) {
            const { error: audioUrlPersistErr } = await supabaseAdmin
              .from("messages")
              .update({ audio_url: downloaded.fileURL })
              .eq("conversation_id", conversationId)
              .eq("external_id", msgId);

            if (audioUrlPersistErr) {
              console.warn(
                "[AUDIO-V3] Falha ao salvar URL reproduzÃ­vel do Ã¡udio:",
                audioUrlPersistErr,
              );
            }
          }

          // A mensagem inbound foi persistida antes da transcriÃ§Ã£o para garantir
          // deduplicaÃ§Ã£o. Agora substituÃ­mos "[Ã¡udio recebido]" pelo texto real
          // do Whisper para o CRM, histÃ³rico e tela de Conversas mostrarem o conteÃºdo.
          if (conversationId && finalMsgText) {
            const { error: transcriptPersistErr } = await supabaseAdmin
              .from("messages")
              .update({
                body: finalMsgText,
                kind: "audio",
              })
              .eq("conversation_id", conversationId)
              .eq("external_id", msgId);

            if (transcriptPersistErr) {
              console.error("[AUDIO-V3] Whisper funcionou, mas falhou ao salvar transcriÃ§Ã£o no CRM:", transcriptPersistErr);
            }

            const { error: previewPersistErr } = await supabaseAdmin
              .from("conversations")
              .update({
                last_message_preview: finalMsgText.slice(0, 120),
                last_message_at: new Date().toISOString(),
              })
              .eq("id", conversationId);

            if (previewPersistErr) {
              console.error("[AUDIO-V3] Falha ao atualizar preview transcrito:", previewPersistErr);
            }
          }
        } catch (audioErr) {
          console.error("[UAZ-WEBHOOK] Transcription failed:", audioErr);
          if (conversationId) {
            const { error: reviewErr } = await supabaseAdmin
              .from("conversations")
              .update({
                needs_review: true,
                review_reason: "falha ao transcrever Ã¡udio recebido",
              })
              .eq("id", conversationId);
            if (reviewErr) {
              console.error("[UAZ-WEBHOOK] Failed to flag transcription error for review:", reviewErr);
            }
          }
          return runtimeTerminal("audio_transcription_failed");
        }
      }

      let resolvedImageSource:
        | { url?: string; data?: string; mediaType?: string }
        | undefined;

      if (content.kind === "image") {
        try {
          const { uazapiResolveInboundMedia } = await import("@/lib/uazapi.server");
          const image = await uazapiResolveInboundMedia({
            creds,
            webhookMessageId: msgId,
            chatPhone: phoneStr,
            mediaKind: "image",
          });

          const mime =
            image.mimetype?.includes("png") ? "image/png" :
            image.mimetype?.includes("gif") ? "image/gif" :
            image.mimetype?.includes("webp") ? "image/webp" :
            "image/jpeg";

          if (image.fileData) {
            const match = image.fileData.match(/^data:([^;,]+);base64,(.+)$/s);
            if (match) {
              resolvedImageSource = {
                data: match[2],
                mediaType: /^image\/(jpeg|png|gif|webp)$/i.test(match[1])
                  ? match[1].toLowerCase()
                  : mime,
              };
            }
          }

          if (!resolvedImageSource && image.fileURL) {
            const response = await fetch(image.fileURL);
            if (response.ok) {
              const bytes = Buffer.from(await response.arrayBuffer());
              if (bytes.length > 0) {
                const responseMime =
                  response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ||
                  mime;
                resolvedImageSource = {
                  data: bytes.toString("base64"),
                  mediaType: /^image\/(jpeg|png|gif|webp)$/i.test(responseMime)
                    ? responseMime
                    : mime,
                };
              }
            }
          }

          if (!resolvedImageSource) {
            throw new Error("Imagem resolvida pela Uazapi, mas sem bytes utilizÃ¡veis");
          }

          finalMsgText =
            content.text && content.text !== "[imagem recebida]"
              ? content.text
              : "Analise a imagem enviada e responda de acordo com o contexto da conversa.";

          console.log("[IMAGE-V3] imagem pronta para Claude Vision", {
            messageId: image.messageId,
            mediaType: resolvedImageSource.mediaType,
          });
        } catch (imageError) {
          console.error("[IMAGE-V3] Falha ao resolver imagem:", imageError);
          if (conversationId) {
            await supabaseAdmin
              .from("conversations")
              .update({
                needs_review: true,
                review_reason: "falha ao carregar imagem para anÃ¡lise visual",
              })
              .eq("id", conversationId);
          }
          return runtimeTerminal("image_unavailable");
        }
      }

      if (!finalMsgText.trim()) {
        return runtimeTerminal("empty_content");
      }


      const criticalEscalation = await detectCriticalHumanEscalation({
        supabaseAdmin,
        conversationId,
        currentText: finalMsgText,
      });

      if (criticalEscalation.escalate) {
        const nowIso = new Date().toISOString();
        const handoffReply =
          "Entendi. Como seu caso precisa de uma anÃ¡lise mais detalhada, vou pausar por aqui e encaminhar para o setor responsÃ¡vel. Assim que possÃ­vel, a equipe darÃ¡ continuidade ao seu atendimento.";

        try {
          if (conversationId) {
            const { error: criticalConvErr } = await supabaseAdmin
              .from("conversations")
              .update({
                agent_enabled: false,
                needs_review: true,
                review_reason: criticalEscalation.reason || "suporte humano necessÃ¡rio",
                auto_paused_at: nowIso,
                status: "aguardando",
                internal_note:
                  `EscalaÃ§Ã£o automÃ¡tica para humano. Motivo: ${criticalEscalation.reason || "caso crÃ­tico de suporte"}.`,
              })
              .eq("id", conversationId);

            if (criticalConvErr) throw criticalConvErr;
          }

          // MantÃ©m o Lead Intelligence coerente com o handoff crÃ­tico.
          await supabaseAdmin.from("agent_logs").insert({
            user_id: num.user_id,
            workspace_id: workspaceId,
            phone: phoneStr,
            conversation_id: conversationId,
            type: "agent_v3_turn",
            level: "warning",
            summary: "Agent V3 escalou caso crÃ­tico para revisÃ£o humana",
            response: handoffReply,
            metadata: {
              human_escalation: true,
              escalation_reason: criticalEscalation.reason,
              intelligence: {
                temperature: "frio",
                confidence: "Muito alta",
                intent: "ReclamaÃ§Ã£o",
                stage: "PÃ³s-venda",
                purchase_probability: 20,
                sentiment: "Negativo",
                urgency: "Alta",
                recommended_action: "Atendimento humano obrigatÃ³rio antes de novas tentativas automÃ¡ticas.",
                reasoning: criticalEscalation.reason || "Caso crÃ­tico de suporte.",
              },
            },
          }).then(({ error }: any) => {
            if (error) console.warn("[HUMAN-ESCALATION] Falha ao salvar inteligÃªncia:", error);
          });

          const sendResult = await sendAgentTextGuarded(
            creds,
            sendTarget,
            handoffReply,
            {
              conversationId: conversationId as string,
              source: "critical_human_escalation",
            },
          );


          if (conversationId) {
            const { error: persistErr } = await supabaseAdmin
              .from("messages")
              .insert({
                conversation_id: conversationId,
                user_id: num.user_id,
                workspace_id: workspaceId,
                sender: "agente",
                kind: "texto",
                body: sendResult.transformed,
              });

            if (persistErr) {
              console.error("[HUMAN-ESCALATION] Handoff enviado, mas falhou ao persistir:", persistErr);
            }
          }

          const { clearConversationStateV3 } = await import(
            "@/lib/agent-v3/memory/conversation-state.server"
          );
          await clearConversationStateV3(
            num.user_id,
            phoneStr,
            workspaceId,
          ).catch((error) => {
            console.warn("[HUMAN-ESCALATION] Falha ao limpar memÃ³ria V3:", error);
          });

          console.warn("[HUMAN-ESCALATION] Atendimento automÃ¡tico pausado", {
            conversationId,
            phone: phoneStr,
            reason: criticalEscalation.reason,
          });

          return runtimeTerminal("critical_human_escalation");
        } catch (criticalErr) {
          console.error("[HUMAN-ESCALATION] Falha ao escalar conversa:", criticalErr);
          return runtimeTerminal("critical_escalation_failed");
        }
      }

      const { getConversationStateV3, saveConversationStateV3 } = await import("@/lib/agent-v3/memory/conversation-state.server");
      const {
        DEFAULT_AGENT_HUMANIZATION,
        normalizeHumanizationSettings,
        calculateHumanResponseTargetMs,
        calculatePartDelayMs,
        sleepMs,
      } = await import("@/lib/agent-v3/humanization.server");

      const { data: humanizationConfigRow, error: humanizationError } = await (supabaseAdmin as any)
        .from("agent_config")
        .select("modules, response_delay_min_sec, response_delay_max_sec, typing_indicator_enabled")
        .eq("user_id", num.user_id)
        .eq("workspace_id", workspaceId)
        .maybeSingle();

      if (humanizationError) {
        console.warn("[UAZ-WEBHOOK] Falha ao carregar configuraÃ§Ã£o de humanizaÃ§Ã£o; usando padrÃ£o:", humanizationError);
      }

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
              ...DEFAULT_AGENT_HUMANIZATION,
              min_response_delay_ms:
                Number.isFinite(Number(humanizationConfigRow?.response_delay_min_sec))
                  ? Number(humanizationConfigRow.response_delay_min_sec) * 1000
                  : DEFAULT_AGENT_HUMANIZATION.min_response_delay_ms,
              max_response_delay_ms:
                Number.isFinite(Number(humanizationConfigRow?.response_delay_max_sec))
                  ? Number(humanizationConfigRow.response_delay_max_sec) * 1000
                  : DEFAULT_AGENT_HUMANIZATION.max_response_delay_ms,
              typing_enabled:
                typeof humanizationConfigRow?.typing_indicator_enabled === "boolean"
                  ? humanizationConfigRow.typing_indicator_enabled
                  : DEFAULT_AGENT_HUMANIZATION.typing_enabled,
            },
      );
      // Enquanto o modelo prepara uma resposta em texto, jÃ¡ exibimos "digitando...".
      // A espera final considera o tempo jÃ¡ gasto pelo processamento para nÃ£o deixar
      // o atendimento artificialmente lento.
      if (
        humanization.enabled &&
        humanization.typing_enabled &&
        content.kind !== "audio"
      ) {
        const { uazapiSendTyping } = await import("@/lib/uazapi.server");
        await uazapiSendTyping(
          creds,
          sendTarget,
          humanization.max_response_delay_ms,
        ).catch((error) => {
          console.warn("[UAZ-WEBHOOK] NÃ£o foi possÃ­vel sinalizar digitando:", error);
        });
      }

      console.log(`[UAZ-WEBHOOK] [AUDIT] Recuperando estado da conversa para ${phoneStr}`);
      const { history, telemetry: historyTelemetry } = await getConversationStateV3(
        num.user_id,
        phoneStr,
        workspaceId,
      );
      console.log(`[UAZ-WEBHOOK] [AUDIT] HistÃ³rico recuperado: ${history?.length || 0} mensagens. Telemetria: ${JSON.stringify(historyTelemetry || {})}`);

      // Pós-Funnel precisa significar conclusão durável real, não apenas
      // "existe alguma linha". Uma execução running/needs_review nunca pode
      // fazer o Agent presumir que a apresentação terminou.
      let funnelAlreadyCompleted = false;
      if (contactId && conversationId) {
        const { data: completedFunnelRun, error: completedFunnelRunError } =
          await (supabaseAdmin as any)
            .from("welcome_funnel_runs")
            .select("funnel_id,status")
            .eq("contact_id", contactId)
            .eq("conversation_id", conversationId)
            .eq("workspace_id", workspaceId)
            .eq("status", "completed")
            .limit(1)
            .maybeSingle();
        if (completedFunnelRunError) {
          throw new Error(
            `Welcome Funnel completion state unavailable: ${completedFunnelRunError.message || String(completedFunnelRunError)}`,
          );
        }
        funnelAlreadyCompleted = Boolean(completedFunnelRun);
      }
      traceFunnel(supabaseAdmin, msgId, phoneStr, "funnel_already_completed_check", {
        contactId: contactId ?? null,
        conversationId: conversationId ?? null,
        workspaceId,
        funnelAlreadyCompleted,
      });

      // O Customer Turn já é a unidade semântica autoritativa de entrada.
      // buildCustomerTurnRuntimeInput() agrega, ordena e resolve todos os membros
      // antes de chegar aqui. Não releia a tabela messages por janela de tempo:
      // isso poderia duplicar membros do turno ou incorporar uma mensagem que
      // pertence ao próximo Customer Turn, quebrando a paridade com o Playground.
      const effectiveAgentMessage = finalMsgText;

      // ============================================================
      // SMART ROUTER â€” agora encapsulado dentro de executeAgent(), junto
      // com a chamada condicional ao Claude. Ver o bloco logo abaixo,
      // prÃ³ximo de "RETURN-PONTO: chegou na V3". Mantido aqui como
      // comentÃ¡rio histÃ³rico: antes disso, o webhook tinha sua prÃ³pria
      // cÃ³pia dessa checagem â€” unificado agora pra Playground e WhatsApp
      // usarem exatamente o mesmo ponto de decisÃ£o.
      // ============================================================

      // Fonte única de preparação da inteligência conversacional.
      // Playground e WhatsApp passam pelo mesmo builder antes de executeAgent().
      // O WhatsApp acrescenta apenas estado/memória persistidos do canal.
      let previousBusinessDecision: any = null;
      if (conversationId) {
        const { loadSingleBusinessStateV3 } = await import(
          "@/lib/agent-v3/memory/business-state-memory.server"
        );
        previousBusinessDecision = await loadSingleBusinessStateV3({
          supabaseAdmin,
          workspaceId,
          conversationId,
        });
      }

      const { buildAgentExecutionContext } = await import(
        "@/lib/agent-v3/core/agent-execution-context.server"
      );
      const executionContext = buildAgentExecutionContext({
        mode: "whatsapp",
        message: effectiveAgentMessage,
        history: history.map((h) => ({ role: h.role, content: h.content })),
        customerLifecycle: customerMemory?.lifecycle ?? null,
        previousBusinessDecision,
        rememberedContext: {
          platform: ((customerMemory?.preferredPlatform ?? null) as import("@/lib/agent-v3/selector/module-selector.server").ConversationContext["platform"]),
          product: ((customerMemory?.preferredProduct ?? null) as import("@/lib/agent-v3/selector/module-selector.server").ConversationContext["product"]),
        },
      });
      const businessDecision = executionContext.businessDecision;

      console.log("[BUSINESS-STATE-V3] decisÃ£o antes do LLM", {
        conversationId,
        state: businessDecision.state,
        risk: businessDecision.risk,
        reason: businessDecision.reason,
        nextAction: businessDecision.nextAction,
      });

      // ============================================================
      // FLOW ENGINE â€” checagem ANTECIPADA (antes da IA), sÃ³ pra
      // permitir que uma FlowAction ligada por feature flag influencie
      // a resposta. Enquanto NENHUMA flag estiver ligada (estado atual),
      // "anyFlowActionEnabled()" Ã© false e nada alÃ©m dessa checagem
      // sÃ­ncrona acontece â€” zero custo extra, zero leitura de banco.
      // ============================================================
      let flowActionHint: { version: number; action: string; reasonCode: string; reason: string; payload: unknown } | null = null;
      try {
        const { anyFlowActionEnabled, isFlowActionEnabled } = await import(
          "@/lib/agent-v3/flow/flow-action-flags.server"
        );
        if (anyFlowActionEnabled()) {
          const { deriveOrderContextV3, loadOrderContextV3 } = await import(
            "@/lib/agent-v3/memory/order-context.server"
          );
          const { evaluateFlow } = await import("@/lib/agent-v3/flow/flow-engine.server");

          const earlyPreviousOrderContext = await loadOrderContextV3(phoneStr, workspaceId);
          const earlyHistory = history.map((m) => ({
            role: m.role === "agent" ? ("agent" as const) : ("customer" as const),
            content: m.content,
          }));
          const earlyOrderContext = deriveOrderContextV3(
            effectiveAgentMessage,
            earlyHistory,
            earlyPreviousOrderContext,
          );
          const earlyFlowDecision = evaluateFlow(earlyOrderContext, businessDecision);

          if (isFlowActionEnabled(earlyFlowDecision.action)) {
            flowActionHint = {
              version: earlyFlowDecision.version,
              action: earlyFlowDecision.action,
              reasonCode: earlyFlowDecision.reasonCode,
              reason: earlyFlowDecision.reason,
              payload: earlyFlowDecision.payload,
            };
            console.log("[FLOW-ENGINE] FlowAction LIGADA influenciando a resposta:", flowActionHint);
          }
        }
      } catch (earlyFlowError) {
        console.warn("[FLOW-ENGINE] Falha na checagem antecipada (seguindo sem hint, Claude decide normalmente):", earlyFlowError);
        flowActionHint = null;
      }

      console.log("RETURN-PONTO: chegou na V3", { phone: phoneStr });

      const { executeAgent } = await import("@/lib/agent-v3/core/execute-agent.server");
      
      const orchestratorStartAt = Date.now();
      await logExecutionTrace({
        traceId,
        step: "orchestrator_start",
        conversationId: conversationId || undefined,
        phone: phoneStr,
        messageId: msgId
      });

      console.log("executeAgent foi chamado? SIM");
      const execResult = await executeAgent({
        traceId, // Pass traceId to executeAgent
        userId: num.user_id,
        flowActionHint,
        workspaceId,
        conversationId: conversationId ?? undefined,
        phone: phoneStr,
        message: effectiveAgentMessage,
        history: history,
        historyTelemetry: historyTelemetry,
        anthropicApiKey,
        routerContext: {
          isFirstTurn: history.length === 0,
          funnelAlreadyCompleted,
        },
        skipRouter: !(content.kind === "texto" && !deferredFunnelMessage),
        rememberedContext: executionContext.rememberedContext as any,
        extraContext: [
          customerMemoryContext,
          executionContext.extraContext,
        ].filter(Boolean).join("\n\n") || undefined,
        businessDecision,
        funnelAlreadyCompleted,
        // Cliente originado de disparo (abordagem fria) vs orgÃ¢nico
        // (Meta Ads/interesse espontÃ¢neo). contacts.source="disparo" jÃ¡
        // era gravado hÃ¡ tempos, sÃ³ nunca era lido de volta pra mudar o
        // comportamento da JÃºlia â€” achado em 09/08/2026.
        isOutboundReply: contactSource === "disparo",
        customerLifecycle: customerMemory?.lifecycle,
        repurchasePotential: customerMemory?.repurchasePotential,
        inputKind: content.kind,
        imageSource: resolvedImageSource,
        messageId: msgId
      });

      if (execResult.routerReason === "HUMAN_HANDOFF_REQUEST") {
        try {
          if (conversationId) {
            const { error } = await supabaseAdmin.from("conversations").update({
              agent_enabled: false,
              needs_review: true,
              review_reason: "cliente solicitou atendimento humano",
              auto_paused_at: new Date().toISOString(),
              status: "aguardando",
              internal_note: "Cliente solicitou atendimento humano. Agent V3 pausado até reativação manual.",
            }).eq("id", conversationId);
            if (error) throw error;
          }
          const sendResult = await sendAgentTextGuarded(creds, sendTarget, execResult.reply, {
            conversationId: conversationId as string,
            source: "human_handoff",
          });
          if (conversationId) {
            await supabaseAdmin.from("messages").insert({
              conversation_id: conversationId,
              user_id: num.user_id,
              workspace_id: workspaceId,
              sender: "agente",
              kind: "texto",
              body: sendResult.transformed,
            });
          }
          const { clearConversationStateV3 } = await import("@/lib/agent-v3/memory/conversation-state.server");
          await clearConversationStateV3(num.user_id, phoneStr, workspaceId).catch(() => undefined);
          return runtimeTerminal("human_handoff");
        } catch (error) {
          console.error("[HUMAN-HANDOFF] Falha no handoff:", error);
          return runtimeTerminal("human_handoff_failed");
        }
      }

      if (execResult.routerReason === "STOP_REQUEST") {
        const nowIso = new Date().toISOString();
        const tasks: PromiseLike<unknown>[] = [];
        if (conversationId) tasks.push(supabaseAdmin.from("conversations").update({
          agent_enabled: false,
          needs_review: true,
          review_reason: "opt-out solicitado pelo contato",
          auto_paused_at: nowIso,
          internal_note: "Contato pediu para não receber novas mensagens automáticas.",
        }).eq("id", conversationId));
        if (contactId) tasks.push(supabaseAdmin.from("contacts").update({
          status: "bloqueado",
          temperatura: "bloqueado",
          temperatura_updated_at: nowIso,
        }).eq("id", contactId));
        await Promise.all(tasks);
        const { clearConversationStateV3 } = await import("@/lib/agent-v3/memory/conversation-state.server");
        await clearConversationStateV3(num.user_id, phoneStr, workspaceId).catch(() => undefined);
        return runtimeTerminal("stop_request");
      }

      if (execResult.routerReason === "NATURAL_CONVERSATIONAL_SILENCE") {
        console.log(`[UAZ-WEBHOOK] [AUDIT] RETORNO: natural conversational silence para conversa ${conversationId}`);
        return runtimeTerminal("natural_conversational_silence");
      }

      const orchestratorDuration = Date.now() - orchestratorStartAt;
      await logExecutionTrace({
        traceId,
        step: "orchestrator_end",
        durationMs: orchestratorDuration,
        conversationId: conversationId || undefined,
        phone: phoneStr,
        details: {
          route: execResult.route,
          claudeCalled: execResult.claudeCalled,
          replyPreview: execResult.reply?.slice(0, 100)
        }
      });

      console.log("[SMART-ROUTER]", {
        route: execResult.route,
        reason: execResult.routerReason,
        phone: phoneStr,
        mensagem: effectiveAgentMessage.slice(0, 80),
        costSaved: !execResult.claudeCalled ? "1 Claude call" : null,
      });

      if (execResult.route === "code") {
        try {
          const sendResult = await sendAgentTextGuarded(creds, sendTarget, execResult.reply, {
            conversationId: conversationId as string,
            source: "smart_router_v1",
          });

          if (conversationId) {
            const { error: persistErr } = await supabaseAdmin.from("messages").insert({
              conversation_id: conversationId,
              user_id: num.user_id,
              workspace_id: workspaceId,
              sender: "agente",
              kind: "texto",
              body: sendResult.transformed,
            });
            if (persistErr) {
              console.error("[SMART-ROUTER] Resposta enviada, mas falhou ao persistir:", persistErr);
            }
            await supabaseAdmin
              .from("conversations")
              .update({
                last_message_preview: sendResult.transformed.slice(0, 120),
                last_message_at: new Date().toISOString(),
                status: "aguardando",
              })
              .eq("id", conversationId);
          }

          return runtimeTerminal("smart_router_completed");
        } catch (routerSendError) {
          // Falha ao enviar a resposta do router: loga e segue o fluxo,
          // nÃ£o deixa a mensagem cair no limbo sem resposta nenhuma.
          console.error("[SMART-ROUTER] Falha ao enviar resposta:", routerSendError);
          return runtimeTerminal("smart_router_send_failed");
        }
      }

      // route === "claude": segue o fluxo normal, extenso, jÃ¡ existente,
      // que processa v3Response (memÃ³ria, CRM, humanizaÃ§Ã£o, envio, etc.)
      const v3Response = execResult.agentResult!;

      if (contactId && customerMemory) {
        try {
          const { persistCustomerCommercialMemory } = await import(
            "@/lib/agent-v3/memory/customer-memory.server"
          );

          customerMemory = await persistCustomerCommercialMemory({
            supabaseAdmin,
            workspaceId,
            userId: num.user_id,
            contactId,
            current: customerMemory,
            customerMessage: finalMsgText,
            platform:
              (v3Response.modules.selection_context as any)?.platform ??
              customerMemory?.preferredPlatform ??
              null,
            product:
              (v3Response.modules.selection_context as any)?.product ??
              customerMemory?.preferredProduct ??
              null,
            intent: (v3Response.modules.selection_context as any)?.intent ?? null,
            stage: v3Response.intelligence.stage,
            purchaseProbability: v3Response.intelligence.purchase_probability,
          });

          if (
            customerMemory &&
            (customerMemory.lifecycle === "cliente" ||
              customerMemory.lifecycle === "cliente_recorrente")
          ) {
            if (conversationId) {
              await supabaseAdmin
                .from("conversations")
                .update({ status: "convertido" })
                .eq("id", conversationId)
                .eq("workspace_id", workspaceId);
            }

            // MemÃ³ria de cliente NÃƒO forÃ§a todo novo turno para PÃ³s-venda.
            // Um cliente antigo pode estar fazendo uma nova compra e deve permanecer
            // em Compra/Pagamento atÃ© que o pedido atual seja confirmado.
            const currentIntent = String((v3Response.modules.selection_context as any)?.intent || "");
            const confirmedNow = /\b((?:j[aÃ¡]\s+)?(?:comprei|paguei)(?:\s+hoje|\s+ontem)?|j[aÃ¡]\s+fiz\s+o\s+pedido|pedido\s+(?:feito|realizado)|pagamento\s+(?:feito|realizado))\b/i.test(finalMsgText);
            if (confirmedNow || currentIntent === "pos_compra" || currentIntent === "suporte") {
              v3Response.intelligence.temperature = confirmedNow ? "quente" : v3Response.intelligence.temperature;
              v3Response.intelligence.intent = currentIntent === "suporte" ? "suporte" : "pos_compra";
              v3Response.intelligence.stage = "pos_venda";
              if (confirmedNow) v3Response.intelligence.purchase_probability = 100;
              else if (customerMemory.repurchasePotential === "alto") {
                v3Response.intelligence.purchase_probability = Math.max(v3Response.intelligence.purchase_probability, 90);
                v3Response.intelligence.temperature = "quente";
              } else if (customerMemory.repurchasePotential === "medio") {
                v3Response.intelligence.purchase_probability = Math.max(v3Response.intelligence.purchase_probability, 70);
                if (v3Response.intelligence.temperature === "frio") v3Response.intelligence.temperature = "morno";
              }
              v3Response.intelligence.recommended_action =
                `Cliente existente. Potencial de recompra: ${customerMemory.repurchasePotential}. NÃ£o reiniciar qualificaÃ§Ã£o.`;
            }
          }
        } catch (memoryPersistError) {
          console.warn("[CUSTOMER-MEMORY] Falha ao atualizar memÃ³ria comercial:", memoryPersistError);
        }
      }

      // ============================================================
      // ORDER CONTEXT + FLOW ENGINE (fase de observaÃ§Ã£o) â€” NÃƒO
      // influenciam a resposta. SÃ³ derivam, avaliam e logam, pra
      // validar antes de qualquer decisÃ£o real depender disso.
      // ============================================================
      try {
        const { deriveOrderContextV3, loadOrderContextV3, saveOrderContextV3 } = await import(
          "@/lib/agent-v3/memory/order-context.server"
        );
        const { evaluateFlow } = await import("@/lib/agent-v3/flow/flow-engine.server");

        const previousOrderContext = await loadOrderContextV3(phoneStr, workspaceId);
        const agentHistoryForOrderContext = history.map((m) => ({
          role: m.role === "agent" ? ("agent" as const) : ("customer" as const),
          content: m.content,
        }));
        const newOrderContext = deriveOrderContextV3(
          effectiveAgentMessage,
          agentHistoryForOrderContext,
          previousOrderContext,
        );

        const flowResult = evaluateFlow(newOrderContext, businessDecision);

        console.log("[ORDER-CONTEXT] EvoluÃ§Ã£o do pedido:", {
          phone: phoneStr,
          mensagem: effectiveAgentMessage.slice(0, 80),
          antes: {
            platform: previousOrderContext.platform,
            service: previousOrderContext.service,
            quantity: previousOrderContext.quantity,
            missingFields: previousOrderContext.missingFields,
          },
          depois: {
            platform: newOrderContext.platform,
            service: newOrderContext.service,
            quantity: newOrderContext.quantity,
            missingFields: newOrderContext.missingFields,
            readyForQuote: newOrderContext.readyForQuote,
            readyForPayment: newOrderContext.readyForPayment,
            confidence: newOrderContext.confidence,
          },
        });

        console.log("[FLOW-ENGINE] DecisÃ£o determinÃ­stica (modo sombra â€” nÃ£o influencia a resposta):", {
          phone: phoneStr,
          nextAction: flowResult.action,
          reason: flowResult.reason,
          canQuote: flowResult.canQuote,
          canCheckout: flowResult.canCheckout,
          canFinish: flowResult.canFinish,
          missingFields: flowResult.requiredFields,
        });

        // Registra a decisÃ£o pra medir precisÃ£o por aÃ§Ã£o depois (revisÃ£o
        // manual), critÃ©rio de promoÃ§Ã£o individual via feature flag.
        await (supabaseAdmin as any).from("flow_action_decisions").insert({
          workspace_id: workspaceId,
          phone: phoneStr,
          conversation_id: conversationId ?? null,
          action: flowResult.action,
          reason: flowResult.reason,
          order_context_snapshot: {
            platform: newOrderContext.platform,
            service: newOrderContext.service,
            quantity: newOrderContext.quantity,
            missingFields: newOrderContext.missingFields,
          },
        } as any);

        await saveOrderContextV3(phoneStr, workspaceId, num.user_id, newOrderContext);
      } catch (orderContextError) {
        console.warn("[ORDER-CONTEXT/FLOW-ENGINE] Falha ao processar (nÃ£o bloqueia o fluxo):", orderContextError);
      }

      // Sincroniza a caixa Frio/Morno/Quente/Cliente do CRM.
      // Ela Ã© persistente e usa evidÃªncias objetivas do funil comercial, em vez
      // de depender somente da classificaÃ§Ã£o de uma mensagem isolada.
      if (contactId) {
        try {
          const { syncPersistentContactTemperatureV3 } = await import(
            "@/lib/agent-v3/memory/contact-temperature.server"
          );

          const {
            calculateBasePurchaseProbability,
            deriveTemperatureFromProbability,
            applyBusinessDecisionToIntelligence,
          } = await import("@/lib/agent-v3/core/intelligence-utils.server");

          const selectionContextForTemperature =
            (v3Response?.modules?.selection_context as any) || {};

          let purchaseProbability = v3Response?.intelligence?.purchase_probability;
          let intelligenceTemperature = v3Response?.intelligence?.temperature;

          // Se nÃ£o houver resposta do Claude (Smart Router), derivamos da inteligÃªncia de vendas
          if (purchaseProbability === undefined || intelligenceTemperature === undefined) {
            const baseProb = calculateBasePurchaseProbability({
              intent: selectionContextForTemperature.intent || "desconhecido",
              platform: selectionContextForTemperature.platform || customerMemory?.preferredPlatform,
              product: selectionContextForTemperature.product || customerMemory?.preferredProduct,
              hasQuantity: selectionContextForTemperature.hasQuantity,
              hasPaidSignal: selectionContextForTemperature.hasPaidSignal,
              hasPaymentSignal: selectionContextForTemperature.hasPaymentSignal,
            });

            const decision = applyBusinessDecisionToIntelligence({
              state: businessDecision.state,
              currentProb: baseProb,
              repurchasePotential: customerMemory?.repurchasePotential,
            });

            purchaseProbability = decision.purchase_probability;
            intelligenceTemperature = decision.temperature;
          }

          contactTemperature = await syncPersistentContactTemperatureV3({
            supabaseAdmin,
            workspaceId,
            contactId,
            current: contactTemperature,
            lifecycle: customerMemory?.lifecycle ?? null,
            purchaseCount: customerMemory?.purchaseCount ?? 0,
            businessState: businessDecision.state,
            intelligenceTemperature: intelligenceTemperature as any,
            purchaseProbability: purchaseProbability!,
            hasPlatform: Boolean(
              selectionContextForTemperature.platform ||
                customerMemory?.preferredPlatform,
            ),
            hasProduct: Boolean(
              selectionContextForTemperature.product ||
                customerMemory?.preferredProduct,
            ),
          });
        } catch (temperatureSyncError) {
          console.warn(
            "[CONTACT-TEMPERATURE-V3] Falha nÃ£o bloqueante:",
            temperatureSyncError,
          );
        }
      }

      if (conversationId) {
        try {
          const { persistBusinessStateV3 } = await import(
            "@/lib/agent-v3/memory/business-state-memory.server"
          );

          // Usa a decisÃ£o prÃ©-LLM como estado autoritativo. A inteligÃªncia serve
          // como telemetria/visÃ£o comercial, mas nÃ£o pode empurrar a conversa
          // para trÃ¡s no funil.
          await persistBusinessStateV3({
            supabaseAdmin,
            userId: num.user_id,
            workspaceId,
            conversationId,
            decision: businessDecision,
            summary: `${businessDecision.state}: ${businessDecision.reason}`,
          });
        } catch (businessStateError) {
          console.warn("[BUSINESS-STATE-V3] Falha ao persistir estado:", businessStateError);
        }
      }

      console.log("RETURN-PONTO: V3 respondeu", { phone: phoneStr });
      const replyParts = v3Response.replies.length > 0 ? v3Response.replies : [v3Response.response];
      const replyText = replyParts.join("\n\n");

      const replyWithAudio = shouldReplyWithAudio({
        inputKind: content.kind,
        replyText,
        intent: v3Response.intelligence.intent,
        stage: v3Response.intelligence.stage,
      });

      if (content.kind === "audio") {
        console.log("[AUDIO-V3] 3/5 Claude concluiu resposta", {
          chars: replyText.length,
          replyMode: replyWithAudio ? "audio" : "texto",
          intent: v3Response.intelligence.intent,
          stage: v3Response.intelligence.stage,
        });
      }

      const finalConvId = String(conversationId || phoneStr);

      const targetHumanDelayMs = calculateHumanResponseTargetMs(replyText, humanization);
      const elapsedBeforeDeliveryMs = Date.now() - inboundStartedAt;
      const remainingFirstReplyDelayMs = Math.max(
        0,
        targetHumanDelayMs - elapsedBeforeDeliveryMs,
      );

      let sentAsAudio = false;
      let deliveredReplyText = replyText;

      if (replyWithAudio && elevenlabsApiKey && elevenlabsVoiceId) {
        try {
          const { textToSpeechV3 } = await import("@/lib/agent-v3/integrations/audio-processor.server");
          const { uazapiSendAudio, uazapiSendRecording, uazapiClearPresence } = await import("@/lib/uazapi.server");

          if (humanization.enabled && humanization.audio_recording_enabled) {
            await uazapiSendRecording(
              creds,
              sendTarget,
              Math.max(3000, remainingFirstReplyDelayMs),
            ).catch((error) => {
              console.warn("[UAZ-WEBHOOK] NÃ£o foi possÃ­vel sinalizar gravando Ã¡udio:", error);
            });
          }

          const audioBase64 = await textToSpeechV3({
            apiKey: elevenlabsApiKey,
            voiceId: elevenlabsVoiceId,
            text: replyText,
          });

          console.log("[AUDIO-V3] 4/5 ElevenLabs concluiu TTS", {
            chars: replyText.length,
            audioDataChars: audioBase64.length,
            voiceId: `${elevenlabsVoiceId.slice(0, 4)}â€¦`,
          });

          // O tempo de geraÃ§Ã£o do Claude/TTS conta como parte da espera humana.
          const remainingAudioDelayMs = Math.max(
            0,
            targetHumanDelayMs - (Date.now() - inboundStartedAt),
          );
          await sleepMs(remainingAudioDelayMs);

          await uazapiSendAudio(creds, sendTarget, audioBase64);
          console.log("[AUDIO-V3] 5/5 nota de voz enviada pela Uazapi");
          await uazapiClearPresence(creds, sendTarget).catch(() => undefined);
          sentAsAudio = true;

          // Registra explicitamente o outbound de Ã¡udio. O arquivo TTS Ã© enviado
          // como base64 e nÃ£o possui URL persistente; o body mantÃ©m a transcriÃ§Ã£o
          // exata usada para gerar o Ã¡udio e a memÃ³ria conversacional.
          if (conversationId) {
            const { error: audioPersistErr } = await supabaseAdmin
              .from("messages")
              .insert({
                conversation_id: conversationId,
                user_id: num.user_id,
                workspace_id: workspaceId,
                sender: "agente",
                kind: "audio",
                body: replyText,
              });
            if (audioPersistErr) {
              console.error("[UAZ-WEBHOOK] Ãudio enviado, mas falhou ao persistir outbound no CRM:", audioPersistErr);
            }
          }

          console.log("[UAZ-WEBHOOK] Resposta do Agent V3 enviada por Ã¡udio");
        } catch (audioSendErr) {
          console.error("[UAZ-WEBHOOK] Falha ao responder por Ã¡udio; usando texto:", audioSendErr);
        }
      }

      if (
        replyWithAudio &&
        (!elevenlabsApiKey || !elevenlabsVoiceId)
      ) {
        console.error("[AUDIO-V3] Resposta em Ã¡udio desativada por configuraÃ§Ã£o incompleta", {
          hasElevenLabsKey: !!elevenlabsApiKey,
          hasVoiceId: !!elevenlabsVoiceId,
        });
      }

      if (!sentAsAudio) {
        const recentAgentBodies = history
          .filter((item) => item.role === "agent")
          .map((item) => item.content)
          .slice(-3);
        const deliveredParts: string[] = [];

        // Mensagens recebidas em sequÃªncia sÃ£o serializadas pelo lock da conversa.
        // O orchestrator jÃ¡ separa respostas longas/parÃ¡grafos em partes prÃ³prias.
        // Enviar o join() como uma Ãºnica mensagem anulava completamente o splitter.
        for (let partIndex = 0; partIndex < replyParts.length; partIndex += 1) {
          const part = replyParts[partIndex];

          if (humanization.enabled) {
            if (partIndex === 0) {
              await sleepMs(remainingFirstReplyDelayMs);
            } else {
              const partDelayMs = calculatePartDelayMs(humanization);
              if (humanization.typing_enabled) {
                const { uazapiSendTyping } = await import("@/lib/uazapi.server");
                await uazapiSendTyping(creds, sendTarget, partDelayMs).catch(() => undefined);
              }
              await sleepMs(partDelayMs);
            }
          }

          console.log("RETURN-PONTO: enviando pro whatsapp", { phone: phoneStr });
          const sendResult = await sendAgentTextGuarded(
            creds,
            sendTarget,
            part,
            {
              conversationId: finalConvId,
              source: "agent_v3",
              applyHumanize: true,
              recentAgentBodiesOverride: [...recentAgentBodies, ...deliveredParts].slice(-3),
            },
          );
          console.log("RETURN-PONTO: enviado com sucesso", { phone: phoneStr });
          
          await logExecutionTrace({
            traceId,
            step: "whatsapp_send",
            conversationId: finalConvId,
            phone: phoneStr,
            details: {
              partIndex,
              totalParts: replyParts.length,
              textPreview: part.slice(0, 100)
            }
          });

          deliveredParts.push(sendResult.transformed);

          // O envio via Uazapi nÃ£o garante que o webhook de eco fromMe serÃ¡
          // entregue. Persistimos cada parte confirmada aqui para que o CRM
          // reflita exatamente o que o cliente recebeu. NÃ£o usamos external_id:
          // se o provedor tambÃ©m ecoar a mensagem, o fluxo fromMe continua
          // responsÃ¡vel por registrar o evento externo sem colisÃ£o artificial.
          if (conversationId) {
            const { error: outboundPersistErr } = await supabaseAdmin
              .from("messages")
              .insert({
                conversation_id: conversationId,
                user_id: num.user_id,
                workspace_id: workspaceId,
                sender: "agente",
                kind: "texto",
                body: sendResult.transformed,
              });
            if (outboundPersistErr) {
              console.error("[UAZ-WEBHOOK] Resposta enviada, mas falhou ao persistir parte no CRM:", outboundPersistErr);
            }
          }
        }

        deliveredReplyText = deliveredParts.join("\n\n");
      }

      const nextHistory = [
        ...history,
        { role: "customer" as const, content: effectiveAgentMessage },
        // Salva exatamente o texto que chegou ao cliente apÃ³s humanizaÃ§Ã£o/emoji guard.
        { role: "agent" as const, content: deliveredReplyText },
      ].slice(-100);

      // SÃ³ persiste a resposta do agente depois que o envio foi confirmado.
      // Antes, uma falha no WhatsApp deixava o histÃ³rico afirmando que o cliente
      // recebeu uma resposta que nunca foi entregue.
      console.log("----------------------------------------------------");
      console.log("Fluxo");
      console.log("O cÃ³digo retornou apÃ³s o funil? NÃƒO (seguindo para Agent V3)");
      console.log("----------------------------------------------------");
      console.log("Resultado Final");
      console.log("FUNIL IGNORADO");
      console.log("Motivo: Gatilho nÃ£o identificado ou execuÃ§Ã£o jÃ¡ completada.");
      console.log("==============================");

      await saveConversationStateV3(

        num.user_id,
        phoneStr,
        nextHistory,
        workspaceId,
      );

      console.log(`[UAZ-WEBHOOK] [AUDIT] RETORNO: AI processed para conversa ${conversationId}`);
      return runtimeTerminal("ai_processed");


  return runtimeTerminal("completed");
};
