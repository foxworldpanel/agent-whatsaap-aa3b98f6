import { sendAgentTextGuarded } from "@/lib/send-agent-guarded.server";
import { generateTraceId, logExecutionTrace } from "@/lib/agent-v3/telemetry/execution-tracer.server";
import type { AgentV3RuntimeExecutor } from "@/lib/agent-v3/inbound-runtime-contract.server";
import { runtimeTerminal } from "@/lib/agent-v3/inbound-runtime-result.server";

// Generated from the audited effectful webhook boundary. Do not wire this file
// until it compiles and the remaining helper dependencies have been made explicit.
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
              review_reason: "falha ao carregar integrações de IA",
            })
            .eq("id", conversationId)
            .then(({ error }) => {
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
          console.error("[AUDIO-V3] Whisper indisponível: OPENAI_API_KEY ausente");
          if (conversationId) {
            await supabaseAdmin
              .from("conversations")
              .update({
                needs_review: true,
                review_reason: "áudio recebido sem chave OpenAI para transcrição",
              })
              .eq("id", conversationId);
          }
          return runtimeTerminal("audio_unavailable");
        }

        try {
          console.log("[AUDIO-V3] 1/5 áudio inbound detectado", {
            msgId,
            mime: content.mime || null,
            webhookMediaUrl: !!content.mediaUrl,
          });

          // Caminho principal: a própria Uazapi baixa/descriptografa a mídia e
          // pede ao Whisper a transcrição. Isso evita depender de mediaUrl temporária
          // ou de campos diferentes entre versões do webhook.
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

          console.log("[AUDIO-V3] /message/download concluído", {
            hasTranscription: !!finalMsgText,
            hasUrl: !!downloaded.fileURL,
            hasData: !!downloaded.fileData,
            mimetype: downloaded.mimetype,
          });

          // Fallback: se a Uazapi não retornou a transcrição, usamos nosso
          // processador Whisper diretamente com a mídia resolvida.
          if (!finalMsgText) {
            if (!inboundAudioUrl) {
              throw new Error(
                "Uazapi não retornou transcrição nem mídia utilizável para o áudio",
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
            throw new Error("Whisper retornou transcrição vazia");
          }

          console.log("[AUDIO-V3] 2/5 Whisper concluído", {
            chars: finalMsgText.length,
          });

          // Se a Uazapi disponibilizou uma URL reproduzível, salva no CRM também.
          // Assim o player da conversa deixa de exibir 0:00 quando houver mídia pública.
          if (conversationId && downloaded.fileURL) {
            const { error: audioUrlPersistErr } = await supabaseAdmin
              .from("messages")
              .update({ audio_url: downloaded.fileURL })
              .eq("conversation_id", conversationId)
              .eq("external_id", msgId);

            if (audioUrlPersistErr) {
              console.warn(
                "[AUDIO-V3] Falha ao salvar URL reproduzível do áudio:",
                audioUrlPersistErr,
              );
            }
          }

          // A mensagem inbound foi persistida antes da transcrição para garantir
          // deduplicação. Agora substituímos "[áudio recebido]" pelo texto real
          // do Whisper para o CRM, histórico e tela de Conversas mostrarem o conteúdo.
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
              console.error("[AUDIO-V3] Whisper funcionou, mas falhou ao salvar transcrição no CRM:", transcriptPersistErr);
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
                review_reason: "falha ao transcrever áudio recebido",
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
            throw new Error("Imagem resolvida pela Uazapi, mas sem bytes utilizáveis");
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
                review_reason: "falha ao carregar imagem para análise visual",
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
          "Entendi. Como seu caso precisa de uma análise mais detalhada, vou pausar por aqui e encaminhar para o setor responsável. Assim que possível, a equipe dará continuidade ao seu atendimento.";

        try {
          if (conversationId) {
            const { error: criticalConvErr } = await supabaseAdmin
              .from("conversations")
              .update({
                agent_enabled: false,
                needs_review: true,
                review_reason: criticalEscalation.reason || "suporte humano necessário",
                auto_paused_at: nowIso,
                status: "aguardando",
                internal_note:
                  `Escalação automática para humano. Motivo: ${criticalEscalation.reason || "caso crítico de suporte"}.`,
              })
              .eq("id", conversationId);

            if (criticalConvErr) throw criticalConvErr;
          }

          // Mantém o Lead Intelligence coerente com o handoff crítico.
          await supabaseAdmin.from("agent_logs").insert({
            user_id: num.user_id,
            workspace_id: workspaceId,
            phone: phoneStr,
            conversation_id: conversationId,
            type: "agent_v3_turn",
            level: "warning",
            summary: "Agent V3 escalou caso crítico para revisão humana",
            response: handoffReply,
            metadata: {
              human_escalation: true,
              escalation_reason: criticalEscalation.reason,
              intelligence: {
                temperature: "frio",
                confidence: "Muito alta",
                intent: "Reclamação",
                stage: "Pós-venda",
                purchase_probability: 20,
                sentiment: "Negativo",
                urgency: "Alta",
                recommended_action: "Atendimento humano obrigatório antes de novas tentativas automáticas.",
                reasoning: criticalEscalation.reason || "Caso crítico de suporte.",
              },
            },
          }).then(({ error }: any) => {
            if (error) console.warn("[HUMAN-ESCALATION] Falha ao salvar inteligência:", error);
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
            console.warn("[HUMAN-ESCALATION] Falha ao limpar memória V3:", error);
          });

          console.warn("[HUMAN-ESCALATION] Atendimento automático pausado", {
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

      if (isHumanHandoffRequest(finalMsgText)) {
        const handoffReply =
          "Claro. Vou pausar por aqui e encaminhar seu atendimento para o setor responsável. Assim que possível, a equipe dará continuidade por aqui.";

        try {
          if (conversationId) {
            const { error: handoffConvErr } = await supabaseAdmin
              .from("conversations")
              .update({
                agent_enabled: false,
                needs_review: true,
                review_reason: "cliente solicitou atendimento humano",
                auto_paused_at: new Date().toISOString(),
                status: "aguardando",
                internal_note:
                  "Cliente solicitou atendimento humano pelo WhatsApp. Agent V3 pausado até reativação manual.",
              })
              .eq("id", conversationId);

            if (handoffConvErr) throw handoffConvErr;
          }

          // Confirma UMA vez e encerra o turno. Depois disso agent_enabled=false
          // impede novas respostas automáticas até reativação manual no painel.
          const sendResult = await sendAgentTextGuarded(
            creds,
            sendTarget,
            handoffReply,
            {
              conversationId: conversationId as string,
              source: "human_handoff",
            },
          );


          if (conversationId) {
            const { error: handoffMessageErr } = await supabaseAdmin
              .from("messages")
              .insert({
                conversation_id: conversationId,
                user_id: num.user_id,
                workspace_id: workspaceId,
                sender: "agente",
                kind: "texto",
                body: sendResult.transformed,
              });

            if (handoffMessageErr) {
              console.error(
                "[HUMAN-HANDOFF] Confirmação enviada, mas falhou ao persistir:",
                handoffMessageErr,
              );
            }
          }

          // Limpa a memória operacional do Agent V3. Quando o operador decidir
          // reativar a conversa, o agente não retoma um estado comercial antigo.
          const { clearConversationStateV3 } = await import(
            "@/lib/agent-v3/memory/conversation-state.server"
          );
          await clearConversationStateV3(
            num.user_id,
            phoneStr,
            workspaceId,
          ).catch((error) => {
            console.warn("[HUMAN-HANDOFF] Falha ao limpar memória V3:", error);
          });

          console.log("[HUMAN-HANDOFF] Agent V3 pausado para atendimento humano", {
            conversationId,
            phone: phoneStr,
          });

          return runtimeTerminal("human_handoff");
        } catch (handoffErr) {
          console.error("[HUMAN-HANDOFF] Falha no handoff:", handoffErr);
          return runtimeTerminal("human_handoff_failed");
        }
      }

      if (isStopRequest(finalMsgText)) {
        const nowIso = new Date().toISOString();
        const persistenceTasks: PromiseLike<unknown>[] = [];

        if (conversationId) {
          persistenceTasks.push(
            supabaseAdmin
              .from("conversations")
              .update({
                agent_enabled: false,
                needs_review: true,
                review_reason: "opt-out solicitado pelo contato",
                auto_paused_at: nowIso,
                internal_note: "Contato pediu para não receber novas mensagens automáticas.",
              })
              .eq("id", conversationId),
          );
        }

        if (contactId) {
          persistenceTasks.push(
            supabaseAdmin
              .from("contacts")
              .update({
                status: "bloqueado",
                temperatura: "bloqueado",
                temperatura_updated_at: nowIso,
              })
              .eq("id", contactId),
          );
        }

        const stopResults = await Promise.all(persistenceTasks);
        for (const result of stopResults) {
          const error = (result as { error?: unknown }).error;
          if (error) console.error("[UAZ-WEBHOOK] Failed to persist stop request:", error);
        }

        const { clearConversationStateV3 } = await import("@/lib/agent-v3/memory/conversation-state.server");
        await clearConversationStateV3(
          num.user_id,
          phoneStr,
          workspaceId,
        ).catch((error) => {
          console.error("[UAZ-WEBHOOK] Failed to clear V3 state after stop request:", error);
        });

        return runtimeTerminal("stop_request");
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
        console.warn("[UAZ-WEBHOOK] Falha ao carregar configuração de humanização; usando padrão:", humanizationError);
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
      // Enquanto o modelo prepara uma resposta em texto, já exibimos "digitando...".
      // A espera final considera o tempo já gasto pelo processamento para não deixar
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
          console.warn("[UAZ-WEBHOOK] Não foi possível sinalizar digitando:", error);
        });
      }

      console.log(`[UAZ-WEBHOOK] [AUDIT] Recuperando estado da conversa para ${phoneStr}`);
      const { history, telemetry: historyTelemetry } = await getConversationStateV3(
        num.user_id,
        phoneStr,
        workspaceId,
      );
      console.log(`[UAZ-WEBHOOK] [AUDIT] Histórico recuperado: ${history?.length || 0} mensagens. Telemetria: ${JSON.stringify(historyTelemetry || {})}`);

      // O histórico V3 não contém necessariamente as peças automáticas do funil.
      // Consulte o runtime do funil para impedir uma segunda apresentação da Júlia.
      // SIMPLIFICADO: sem coluna status na tabela real, existência da linha
      // já significa "esse funil já rodou pra esse contato" (síncrono).
      let funnelAlreadyCompleted = false;
      if (contactId) {
        const { data: completedFunnelRun } = await (supabaseAdmin as any)
          .from("welcome_funnel_runs")
          .select("funnel_id")
          .eq("contact_id", contactId)
          .eq("workspace_id", workspaceId)
          .limit(1)
          .maybeSingle();
        funnelAlreadyCompleted = Boolean(completedFunnelRun);
      }
      // Diagnóstico real — achado em conversa de produção em 10/08/2026
      // onde a Júlia cumprimentou de novo mesmo com o funil já concluído
      // (violando a regra PÓS-FUNIL). O código de cálculo parece correto
      // lendo, então isso registra o valor real computado toda vez, pra
      // confirmar com dado se é timing/corrida ou outra causa, em vez de
      // suposição.
      traceFunnel(supabaseAdmin, msgId, phoneStr, "funnel_already_completed_check", {
        contactId: contactId ?? null,
        workspaceId,
        funnelAlreadyCompleted,
      });

      // Agrupa rajadas curtas do mesmo cliente (ex.: "Inscritos" + "E comentário").
      // Isso evita responder à primeira metade como se ela fosse a intenção completa.
      let effectiveAgentMessage = finalMsgText;
      if (conversationId && content.kind === "texto") {
        const burstSince = new Date(Date.now() - 12_000).toISOString();
        const { data: burstRows } = await supabaseAdmin
          .from("messages")
          .select("body, created_at")
          .eq("conversation_id", conversationId)
          .eq("sender", "cliente")
          .gte("created_at", burstSince)
          .order("created_at", { ascending: true })
          .limit(4);

        const burstBodies = (burstRows || [])
          .map((row: any) => String(row?.body || "").trim())
          .filter(Boolean);
        if (burstBodies.length > 1) {
          effectiveAgentMessage = burstBodies.join("\n");
        }
      }

      // ============================================================
      // SMART ROUTER — agora encapsulado dentro de executeAgent(), junto
      // com a chamada condicional ao Claude. Ver o bloco logo abaixo,
      // próximo de "RETURN-PONTO: chegou na V3". Mantido aqui como
      // comentário histórico: antes disso, o webhook tinha sua própria
      // cópia dessa checagem — unificado agora pra Playground e WhatsApp
      // usarem exatamente o mesmo ponto de decisão.
      // ============================================================

      const {
        deriveBusinessDecisionV3,
        businessDecisionToPromptV3,
        enrichBusinessDecisionV3,
        reconcileBusinessDecisionV3,
      } = await import("@/lib/agent-v3/brain/business-state.server");

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

      const derivedBusinessDecision = enrichBusinessDecisionV3(deriveBusinessDecisionV3({
        message: effectiveAgentMessage,
        recentCustomerMessages: history
          .filter((item) => item.role === "customer")
          .slice(-6)
          .map((item) => item.content),
        customerLifecycle: customerMemory?.lifecycle ?? null,
      }), effectiveAgentMessage);

      const businessDecision = reconcileBusinessDecisionV3({
        previous: previousBusinessDecision,
        current: derivedBusinessDecision,
        message: effectiveAgentMessage,
      });

      // ============================================================
      // MODO SOMBRA — buildAgentExecutionContext() rodando em paralelo,
      // só pra comparação. NÃO influencia a resposta real, que continua
      // vindo 100% do pipeline antigo acima. Qualquer erro aqui é só
      // logado, nunca interrompe o atendimento.
      // ============================================================
      try {
        const { buildAgentExecutionContext } = await import(
          "@/lib/agent-v3/core/agent-execution-context.server"
        );
        const shadowContext = buildAgentExecutionContext({
          mode: "whatsapp",
          message: effectiveAgentMessage,
          history: history.map((h) => ({ role: h.role, content: h.content })),
          customerLifecycle: customerMemory?.lifecycle ?? null,
          previousBusinessDecision,
          rememberedContext: {
            platform: customerMemory?.preferredPlatform ?? null,
            product: customerMemory?.preferredProduct ?? null,
          },
        });

        const oldExtraContext = [
          customerMemoryContext,
          businessDecisionToPromptV3(businessDecision),
        ].filter(Boolean).join("\n\n") || undefined;

        const diffs: string[] = [];

        if (shadowContext.businessDecision.state !== businessDecision.state) {
          diffs.push(
            `BusinessDecision.state: antigo="${businessDecision.state}" novo="${shadowContext.businessDecision.state}"`,
          );
        }
        if (shadowContext.businessDecision.nextAction !== businessDecision.nextAction) {
          diffs.push(
            `BusinessDecision.nextAction: antigo="${businessDecision.nextAction}" novo="${shadowContext.businessDecision.nextAction}"`,
          );
        }
        if (shadowContext.businessDecision.risk !== businessDecision.risk) {
          diffs.push(
            `BusinessDecision.risk: antigo="${businessDecision.risk}" novo="${shadowContext.businessDecision.risk}"`,
          );
        }
        // extraContext é comparado por tamanho E por hash — hash detecta
        // qualquer diferença de conteúdo, mesmo que o tamanho bata por
        // coincidência.
        const oldExtraContextChars = (oldExtraContext || "").length;
        const newExtraContextChars = (shadowContext.extraContext || "").length;
        const extraContextCharsDiff = newExtraContextChars - oldExtraContextChars;
        if (Math.abs(extraContextCharsDiff) > 50) {
          diffs.push(
            `extraContext.length: antigo=${oldExtraContextChars} novo=${newExtraContextChars} (diferença: ${extraContextCharsDiff > 0 ? "+" : ""}${extraContextCharsDiff} chars)`,
          );
        }

        const { createHash } = await import("node:crypto");
        const hashOf = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 16);
        const oldExtraContextHash = hashOf(oldExtraContext || "");
        const newExtraContextHash = hashOf(shadowContext.extraContext || "");
        const extraContextHashMatches = oldExtraContextHash === newExtraContextHash;
        if (!extraContextHashMatches && !diffs.some(d => d.startsWith("extraContext"))) {
          // Tamanho bateu mas conteúdo é diferente — hash pegou o que o
          // tamanho sozinho não pegaria.
          diffs.push(`extraContext.hash: antigo=${oldExtraContextHash} novo=${newExtraContextHash} (conteúdo diferente apesar do tamanho parecido)`);
        }

        // Nota percentual: cada checagem vale igual, simples e transparente.
        const checks = [
          { name: "BusinessDecision.state", ok: !diffs.some(d => d.startsWith("BusinessDecision.state")) },
          { name: "BusinessDecision.nextAction", ok: !diffs.some(d => d.startsWith("BusinessDecision.nextAction")) },
          { name: "BusinessDecision.risk", ok: !diffs.some(d => d.startsWith("BusinessDecision.risk")) },
          { name: "extraContext", ok: extraContextHashMatches },
        ];
        const score = Math.round((checks.filter(c => c.ok).length / checks.length) * 1000) / 10;
        const allEqual = checks.every(c => c.ok);

        console.log(`
=============================
PARIDADE (modo sombra — não afeta a resposta)
=============================
${checks.map(c => `${c.name}: ${c.ok ? "✓ Igual" : "✗ Diferente"}`).join("\n")}
-----------------------------
PARIDADE: ${score}%
=============================
${diffs.length > 0 ? "DETALHES DAS DIVERGÊNCIAS:\n" + diffs.join("\n") : "Nenhuma divergência encontrada."}
=============================`);

        // Persiste pra consulta posterior (SELECT * WHERE equal = false).
        // Best-effort — falha aqui não afeta nada.
        await (supabaseAdmin as any).from("agent_parity_runs").insert({
          workspace_id: workspaceId,
          phone: phoneStr,
          conversation_id: conversationId ?? null,
          equal: allEqual,
          score,
          differences: diffs,
          old_snapshot: {
            state: businessDecision.state,
            nextAction: businessDecision.nextAction,
            risk: businessDecision.risk,
            extraContextHash: oldExtraContextHash,
            extraContextChars: oldExtraContextChars,
          },
          new_snapshot: {
            state: shadowContext.businessDecision.state,
            nextAction: shadowContext.businessDecision.nextAction,
            risk: shadowContext.businessDecision.risk,
            extraContextHash: newExtraContextHash,
            extraContextChars: newExtraContextChars,
          },
        } as any);
      } catch (shadowModeError) {
        console.warn("[PARIDADE] Falha no modo sombra (não bloqueia o fluxo):", shadowModeError);
      }

      console.log("[BUSINESS-STATE-V3] decisão antes do LLM", {
        conversationId,
        state: businessDecision.state,
        risk: businessDecision.risk,
        reason: businessDecision.reason,
        nextAction: businessDecision.nextAction,
      });

      const { shouldStaySilentForNaturalConversation } = await import(
        "@/lib/agent-v3/brain/guards.server"
      );
      const naturalSilence = shouldStaySilentForNaturalConversation({
        message: effectiveAgentMessage,
        history: history.map((item) => ({
          sender: item.role === "agent" ? "agente" : "cliente",
          body: item.content,
        })),
      });

      if (content.kind === "texto" && naturalSilence) {
        console.log(`[UAZ-WEBHOOK] [AUDIT] RETORNO: natural conversational silence para conversa ${conversationId}`);
        return runtimeTerminal("natural_conversational_silence");
      }

      // ============================================================
      // FLOW ENGINE — checagem ANTECIPADA (antes da IA), só pra
      // permitir que uma FlowAction ligada por feature flag influencie
      // a resposta. Enquanto NENHUMA flag estiver ligada (estado atual),
      // "anyFlowActionEnabled()" é false e nada além dessa checagem
      // síncrona acontece — zero custo extra, zero leitura de banco.
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
        rememberedContext: {
          platform: customerMemory?.preferredPlatform ?? null,
          product: customerMemory?.preferredProduct ?? null,
        },
        extraContext: [
          customerMemoryContext,
          businessDecisionToPromptV3(businessDecision),
        ].filter(Boolean).join("\n\n") || undefined,
        businessDecision,
        funnelAlreadyCompleted,
        // Cliente originado de disparo (abordagem fria) vs orgânico
        // (Meta Ads/interesse espontâneo). contacts.source="disparo" já
        // era gravado há tempos, só nunca era lido de volta pra mudar o
        // comportamento da Júlia — achado em 09/08/2026.
        isOutboundReply: contactSource === "disparo",
        customerLifecycle: customerMemory?.lifecycle,
        repurchasePotential: customerMemory?.repurchasePotential,
        inputKind: content.kind,
        imageSource: resolvedImageSource,
        messageId: msgId
      });

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
          // não deixa a mensagem cair no limbo sem resposta nenhuma.
          console.error("[SMART-ROUTER] Falha ao enviar resposta:", routerSendError);
          return runtimeTerminal("smart_router_send_failed");
        }
      }

      // route === "claude": segue o fluxo normal, extenso, já existente,
      // que processa v3Response (memória, CRM, humanização, envio, etc.)
      const v3Response = execResult.agentResult!;

      if (contactId) {
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
            customerMemory.lifecycle === "cliente" ||
            customerMemory.lifecycle === "cliente_recorrente"
          ) {
            if (conversationId) {
              await supabaseAdmin
                .from("conversations")
                .update({ status: "convertido" })
                .eq("id", conversationId)
                .eq("workspace_id", workspaceId);
            }

            // Memória de cliente NÃO força todo novo turno para Pós-venda.
            // Um cliente antigo pode estar fazendo uma nova compra e deve permanecer
            // em Compra/Pagamento até que o pedido atual seja confirmado.
            const currentIntent = String((v3Response.modules.selection_context as any)?.intent || "");
            const confirmedNow = /\b((?:j[aá]\s+)?(?:comprei|paguei)(?:\s+hoje|\s+ontem)?|j[aá]\s+fiz\s+o\s+pedido|pedido\s+(?:feito|realizado)|pagamento\s+(?:feito|realizado))\b/i.test(finalMsgText);
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
                `Cliente existente. Potencial de recompra: ${customerMemory.repurchasePotential}. Não reiniciar qualificação.`;
            }
          }
        } catch (memoryPersistError) {
          console.warn("[CUSTOMER-MEMORY] Falha ao atualizar memória comercial:", memoryPersistError);
        }
      }

      // ============================================================
      // ORDER CONTEXT + FLOW ENGINE (fase de observação) — NÃO
      // influenciam a resposta. Só derivam, avaliam e logam, pra
      // validar antes de qualquer decisão real depender disso.
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

        console.log("[ORDER-CONTEXT] Evolução do pedido:", {
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

        console.log("[FLOW-ENGINE] Decisão determinística (modo sombra — não influencia a resposta):", {
          phone: phoneStr,
          nextAction: flowResult.action,
          reason: flowResult.reason,
          canQuote: flowResult.canQuote,
          canCheckout: flowResult.canCheckout,
          canFinish: flowResult.canFinish,
          missingFields: flowResult.requiredFields,
        });

        // Registra a decisão pra medir precisão por ação depois (revisão
        // manual), critério de promoção individual via feature flag.
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
        console.warn("[ORDER-CONTEXT/FLOW-ENGINE] Falha ao processar (não bloqueia o fluxo):", orderContextError);
      }

      // Sincroniza a caixa Frio/Morno/Quente/Cliente do CRM.
      // Ela é persistente e usa evidências objetivas do funil comercial, em vez
      // de depender somente da classificação de uma mensagem isolada.
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

          // Se não houver resposta do Claude (Smart Router), derivamos da inteligência de vendas
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
            "[CONTACT-TEMPERATURE-V3] Falha não bloqueante:",
            temperatureSyncError,
          );
        }
      }

      if (conversationId) {
        try {
          const { persistBusinessStateV3 } = await import(
            "@/lib/agent-v3/memory/business-state-memory.server"
          );

          // Usa a decisão pré-LLM como estado autoritativo. A inteligência serve
          // como telemetria/visão comercial, mas não pode empurrar a conversa
          // para trás no funil.
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
              console.warn("[UAZ-WEBHOOK] Não foi possível sinalizar gravando áudio:", error);
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
            voiceId: `${elevenlabsVoiceId.slice(0, 4)}…`,
          });

          // O tempo de geração do Claude/TTS conta como parte da espera humana.
          const remainingAudioDelayMs = Math.max(
            0,
            targetHumanDelayMs - (Date.now() - inboundStartedAt),
          );
          await sleepMs(remainingAudioDelayMs);

          await uazapiSendAudio(creds, sendTarget, audioBase64);
          console.log("[AUDIO-V3] 5/5 nota de voz enviada pela Uazapi");
          await uazapiClearPresence(creds, sendTarget).catch(() => undefined);
          sentAsAudio = true;

          // Registra explicitamente o outbound de áudio. O arquivo TTS é enviado
          // como base64 e não possui URL persistente; o body mantém a transcrição
          // exata usada para gerar o áudio e a memória conversacional.
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
              console.error("[UAZ-WEBHOOK] Áudio enviado, mas falhou ao persistir outbound no CRM:", audioPersistErr);
            }
          }

          console.log("[UAZ-WEBHOOK] Resposta do Agent V3 enviada por áudio");
        } catch (audioSendErr) {
          console.error("[UAZ-WEBHOOK] Falha ao responder por áudio; usando texto:", audioSendErr);
        }
      }

      if (
        replyWithAudio &&
        (!elevenlabsApiKey || !elevenlabsVoiceId)
      ) {
        console.error("[AUDIO-V3] Resposta em áudio desativada por configuração incompleta", {
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

        // Mensagens recebidas em sequência são serializadas pelo lock da conversa.
        // O orchestrator já separa respostas longas/parágrafos em partes próprias.
        // Enviar o join() como uma única mensagem anulava completamente o splitter.
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

          // O envio via Uazapi não garante que o webhook de eco fromMe será
          // entregue. Persistimos cada parte confirmada aqui para que o CRM
          // reflita exatamente o que o cliente recebeu. Não usamos external_id:
          // se o provedor também ecoar a mensagem, o fluxo fromMe continua
          // responsável por registrar o evento externo sem colisão artificial.
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
        // Salva exatamente o texto que chegou ao cliente após humanização/emoji guard.
        { role: "agent" as const, content: deliveredReplyText },
      ].slice(-100);

      // Só persiste a resposta do agente depois que o envio foi confirmado.
      // Antes, uma falha no WhatsApp deixava o histórico afirmando que o cliente
      // recebeu uma resposta que nunca foi entregue.
      console.log("----------------------------------------------------");
      console.log("Fluxo");
      console.log("O código retornou após o funil? NÃO (seguindo para Agent V3)");
      console.log("----------------------------------------------------");
      console.log("Resultado Final");
      console.log("FUNIL IGNORADO");
      console.log("Motivo: Gatilho não identificado ou execução já completada.");
      console.log("==============================");

      await saveConversationStateV3(

        num.user_id,
        phoneStr,
        nextHistory,
        workspaceId,
      );

      console.log(`[UAZ-WEBHOOK] [AUDIT] RETORNO: AI processed para conversa ${conversationId}`);
      return runtimeTerminal("ai_processed");

      } catch (e: any) {
        const criticalErrorMessage = String(e?.message ?? e ?? "erro desconhecido");
        runtimeNeedsReview = true;
        runtimeFailure = criticalErrorMessage;
        console.error("[UAZ-WEBHOOK] AI Critical Error:", criticalErrorMessage);

        // A mensagem do cliente já foi persistida no CRM antes deste ponto.
        // Não pedimos retry ao provedor para evitar uma segunda resposta, mas
        // também não deixamos a falha silenciosa: a conversa fica visível para
        // atendimento humano/revisão.
        if (conversationId) {
          const { error: reviewErr } = await supabaseAdmin
            .from("conversations")
            .update({
              needs_review: true,
              review_reason: `falha crítica no Agent V3: ${criticalErrorMessage}`.slice(0, 500),
            })
            .eq("id", conversationId);
          if (reviewErr) {
            console.error("[UAZ-WEBHOOK] Failed to flag AI error for review:", reviewErr);
          }
        }


        console.log(`[UAZ-WEBHOOK] [AUDIT] RETORNO: AI error flagged para conversa ${conversationId}`);
        return runtimeTerminal("ai_error_needs_review");

  return runtimeTerminal("completed");
};
