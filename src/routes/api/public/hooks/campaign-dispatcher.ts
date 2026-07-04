import { createFileRoute } from "@tanstack/react-router";

// pg_cron chama este endpoint a cada minuto.
// Para cada campanha "rodando" do usuário:
//  - dentro da janela de horário?
//  - intervalo desde último envio respeitado?
//  - volume diário não atingido?
// Se sim, pega 1 contato "nao_abordado" do perfil alvo, gera mensagem com Claude,
// envia via Uazapi, registra em campaign_logs e cria conversation + message.

// Plataforma 24h — janela de horário removida.
export const Route = createFileRoute("/api/public/hooks/campaign-dispatcher")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { uazapiSendText } = await import("@/lib/uazapi.server");
        const { generateAgentReply } = await import("@/lib/ai.server");

        const { data: campaigns, error: cErr } = await supabaseAdmin
          .from("campaigns")
          .select("*")
          .eq("state", "rodando");
        if (cErr) return new Response(cErr.message, { status: 500 });

        const results: Array<{ campaign: string; result: string }> = [];

        for (const camp of campaigns ?? []) {
          try {
            // 24h: janela de horário desativada.

            // volume diário
            const startOfDay = new Date();
            startOfDay.setUTCHours(0, 0, 0, 0);
            const { count: sentToday } = await supabaseAdmin
              .from("campaign_logs")
              .select("id", { count: "exact", head: true })
              .eq("campaign_id", camp.id)
              .gte("created_at", startOfDay.toISOString());
            if ((sentToday ?? 0) >= camp.daily_volume) {
              results.push({ campaign: camp.id, result: "volume diário atingido" });
              continue;
            }

            // último envio
            const { data: lastLog } = await supabaseAdmin
              .from("campaign_logs")
              .select("created_at")
              .eq("campaign_id", camp.id)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (lastLog) {
              const diffMin = (Date.now() - new Date(lastLog.created_at).getTime()) / 60000;
              if (diffMin < camp.interval_minutes) {
                results.push({ campaign: camp.id, result: "aguardando intervalo" });
                continue;
              }
            }

            // integrações e agente
            const { data: integ } = await supabaseAdmin
              .from("integrations")
              .select("uazapi_url, uazapi_token, anthropic_api_key")
              .eq("user_id", camp.user_id)
              .maybeSingle();
            if (!integ?.uazapi_url || !integ.uazapi_token) {
              results.push({ campaign: camp.id, result: "uazapi não configurado" });
              continue;
            }
            const { data: agent } = await supabaseAdmin
              .from("agent_config")
              .select("*")
              .eq("user_id", camp.user_id)
              .maybeSingle();
            if (!agent) {
              results.push({ campaign: camp.id, result: "agente não configurado" });
              continue;
            }
            if (agent.agent_enabled === false) {
              results.push({ campaign: camp.id, result: "agente desativado" });
              continue;
            }

            // próximo contato do perfil ainda não abordado
            const { data: contact } = await supabaseAdmin
              .from("contacts")
              .select("id, nome, perfil, telefone")
              .eq("user_id", camp.user_id)
              .eq("perfil", camp.target_profile)
              .eq("status", "nao_abordado")
              .order("created_at", { ascending: true })
              .limit(1)
              .maybeSingle();
            if (!contact) {
              results.push({ campaign: camp.id, result: "sem contatos disponíveis" });
              continue;
            }

            // gera primeira mensagem
            let opener = "";
            if (integ.anthropic_api_key) {
              try {
                opener = await generateAgentReply({
                  anthropicApiKey: integ.anthropic_api_key,
                  agent,
                  contact: { nome: contact.nome, perfil: contact.perfil },
                  userId: camp.user_id,
                  history: [
                    {
                      sender: "cliente",
                      body: "[sistema] inicie a abordagem com uma saudação curta e amigável.",
                    },
                  ],
                });
              } catch (e) {
                console.error("opener generation failed", e);
              }
            }
            if (!opener) {
              const script =
                contact.perfil === "ativo"
                  ? agent.script_ativo
                  : contact.perfil === "inativo"
                    ? agent.script_inativo
                    : agent.script_frio;
              opener = (script || "Oi {nome}, tudo bem?").replace(/\{nome\}/gi, contact.nome);
            }

            // envia
            let status: "enviado" | "falha" = "enviado";
            try {
              await uazapiSendText(
                { uazapi_url: integ.uazapi_url, uazapi_token: integ.uazapi_token },
                contact.telefone,
                opener,
              );
            } catch (e) {
              console.error("uazapi send failed", e);
              status = "falha";
            }

            // log
            await supabaseAdmin.from("campaign_logs").insert({
              user_id: camp.user_id,
              campaign_id: camp.id,
              contact_id: contact.id,
              contact_name: contact.nome,
              message_preview: opener.slice(0, 160),
              status,
            });

            if (status === "enviado") {
              // cria/atualiza conversation + message
              let { data: conv } = await supabaseAdmin
                .from("conversations")
                .select("id")
                .eq("user_id", camp.user_id)
                .eq("contact_id", contact.id)
                .maybeSingle();
              if (!conv) {
                const ins = await supabaseAdmin
                  .from("conversations")
                  .insert({
                    user_id: camp.user_id,
                    contact_id: contact.id,
                    status: "aguardando",
                  })
                  .select("id")
                  .single();
                conv = ins.data;
              }
              if (conv) {
                const nowIso = new Date().toISOString();
                await supabaseAdmin.from("messages").insert({
                  user_id: camp.user_id,
                  conversation_id: conv.id,
                  sender: "agente",
                  kind: "texto",
                  body: opener,
                });
                await supabaseAdmin
                  .from("conversations")
                  .update({
                    last_message_preview: opener.slice(0, 120),
                    last_message_at: nowIso,
                    status: "aguardando",
                  })
                  .eq("id", conv.id);
              }
              await supabaseAdmin
                .from("contacts")
                .update({ status: "em_conversa", last_interaction_at: new Date().toISOString() })
                .eq("id", contact.id);
            }

            results.push({ campaign: camp.id, result: `enviado para ${contact.nome} (${status})` });
          } catch (e) {
            results.push({ campaign: camp.id, result: `erro: ${(e as Error).message}` });
          }
        }

        return Response.json({ ran: results.length, results });
      },
    },
  },
});