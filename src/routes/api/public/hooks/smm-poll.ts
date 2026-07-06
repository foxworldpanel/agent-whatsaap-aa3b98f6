import { createFileRoute } from "@tanstack/react-router";

// Polls MIND SMM Panel for pending free-trial orders.
// Called by pg_cron every 5 minutes.

const TIMEOUT_HOURS = 24;

export const Route = createFileRoute("/api/public/hooks/smm-poll")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { smmOrderStatus } = await import("@/lib/smm.server");
        const { uazapiSendText } = await import("@/lib/uazapi.server");

        const { data: trials, error } = await supabaseAdmin
          .from("free_trials")
          .select("*")
          .not("status", "in", "(completed,failed,timeout)")
          .not("order_id", "is", null)
          .limit(100);
        if (error) return new Response(error.message, { status: 500 });
        console.log(`[smm-poll] Verificando status dos testes pendentes: ${trials?.length ?? 0}`);
        if (!trials || trials.length === 0) return new Response("no pending");

        const userIds = Array.from(new Set(trials.map((t) => t.user_id)));
        const { data: integs } = await supabaseAdmin
          .from("integrations")
          .select(
            "user_id, uazapi_url, uazapi_token, smm_api_key, smm_panel_url",
          )
          .in("user_id", userIds);
        const integByUser = new Map((integs ?? []).map((i) => [i.user_id, i]));

        const { data: agents } = await supabaseAdmin
          .from("agent_config")
          .select("user_id, agent_enabled")
          .in("user_id", userIds);
        const agentEnabledByUser = new Map((agents ?? []).map((a) => [a.user_id, a.agent_enabled !== false]));

        let processed = 0;
        // Helper: returns false if the conversation is paused (agent off, needs review)
        // or the contact is blocked. Used to respect the per-conversation kill switch.
        async function canSendTo(conversationId: string | null | undefined, telefone: string, userId: string) {
          if (agentEnabledByUser.get(userId) === false) return false;
          if (conversationId) {
            const { data: conv } = await supabaseAdmin
              .from("conversations")
              .select("agent_enabled, needs_review")
              .eq("id", conversationId)
              .maybeSingle();
            if (conv && (conv.agent_enabled === false || conv.needs_review === true)) return false;
          }
          const { data: ct } = await supabaseAdmin
            .from("contacts")
            .select("status")
            .eq("user_id", userId)
            .eq("telefone", telefone)
            .maybeSingle();
          if (ct?.status === "bloqueado") return false;
          return true;
        }
        for (const trial of trials) {
          const integ = integByUser.get(trial.user_id);
          if (!integ?.smm_api_key) continue;
          if (!(await canSendTo(trial.conversation_id, trial.telefone, trial.user_id))) {
            continue;
          }

          // timeout check
          const createdAt = new Date(trial.criado_em).getTime();
          const ageHours = (Date.now() - createdAt) / 36e5;
          if (ageHours > TIMEOUT_HOURS) {
            await supabaseAdmin
              .from("free_trials")
              .update({ status: "timeout", last_checked_at: new Date().toISOString() })
              .eq("id", trial.id);
            try {
              await uazapiSendText(
                { uazapi_url: integ.uazapi_url ?? "", uazapi_token: integ.uazapi_token ?? "" },
                trial.telefone,
                "Tive uma demora pra entregar seu teste grátis 😕 Já estamos verificando.",
              );
            } catch (e) {
              console.error("uazapi timeout send failed", e);
            }
            processed++;
            continue;
          }

          try {
            const res = await smmOrderStatus(
              {
                url: integ.smm_panel_url ?? "https://mindsmmpanel.com/smmpanel/api/v1",
                key: integ.smm_api_key,
              },
              trial.order_id!,
            );
            const status = res.status ?? "pending";
            const checkedAt = new Date().toISOString();

            if (status === "completed" && !trial.notified_completed) {
              const startCount = res.start_count ?? null;
              const qty = res.quantity ?? trial.quantidade ?? null;
              const viewsAtuais =
                startCount !== null && qty !== null ? startCount + qty : null;
              // Detecta plataforma pelo link para usar termo correto
              const linkLower = (trial.link_enviado ?? "").toLowerCase();
              const isYouTube = /youtube\.com|youtu\.be/.test(linkLower);
              const isTikTok = /tiktok\.com/.test(linkLower);
              const isSpotify = /spotify\.com|spotify\.link/.test(linkLower);
              const isInstagram = /instagram\.com|instagr\.am/.test(linkLower);
              const unidade = isSpotify ? "plays" : "views";
              const local = isYouTube
                ? "no seu vídeo do YouTube"
                : isTikTok
                  ? "no seu vídeo do TikTok"
                  : isSpotify
                    ? "na sua música"
                    : isInstagram
                      ? "no seu Reel"
                      : "no seu link";
              const msg =
                startCount !== null && viewsAtuais !== null
                  ? `Seu teste foi entregue! ${local[0].toUpperCase() + local.slice(1)} tinha ${startCount} ${unidade}, agora está com ${viewsAtuais} ${unidade}! Sentiu a diferença? 🚀`
                  : `Seu teste foi entregue! Dá uma olhada ${local} e me conta o que achou! 🚀`;
              try {
                await uazapiSendText(
                  {
                    uazapi_url: integ.uazapi_url ?? "",
                    uazapi_token: integ.uazapi_token ?? "",
                  },
                  trial.telefone,
                  msg,
                );
              } catch (e) {
                console.error("uazapi completed send failed", e);
              }
              await supabaseAdmin
                .from("free_trials")
                .update({
                  status: "completed",
                  last_checked_at: checkedAt,
                  notified_completed: true,
                  notified_completed_at: checkedAt,
                  upsell_offered: true,
                  start_count: startCount,
                  views_atuais: viewsAtuais,
                  raw_response: res.raw as never,
                })
                .eq("id", trial.id);
              if (trial.conversation_id) {
                await supabaseAdmin.from("messages").insert({
                  user_id: trial.user_id,
                  conversation_id: trial.conversation_id,
                  sender: "agente",
                  kind: "texto",
                  body: msg,
                });
                await supabaseAdmin
                  .from("conversations")
                  .update({
                    last_message_preview: msg.slice(0, 120),
                    last_message_at: checkedAt,
                    status: "aguardando",
                  })
                  .eq("id", trial.conversation_id);
              }
            } else {
              await supabaseAdmin
                .from("free_trials")
                .update({
                  status,
                  last_checked_at: checkedAt,
                  raw_response: res.raw as never,
                })
                .eq("id", trial.id);
            }
            processed++;
          } catch (e) {
            console.error("smm status failed", e);
          }
        }

        // ====== 10-minute follow-up after entrega ======
        const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        const { data: pendingFollowups } = await supabaseAdmin
          .from("free_trials")
          .select("id, user_id, telefone, conversation_id, notified_completed_at")
          .eq("notified_completed", true)
          .is("followup_sent_at", null)
          .not("notified_completed_at", "is", null)
          .lte("notified_completed_at", tenMinAgo)
          .limit(50);
        for (const t of pendingFollowups ?? []) {
          const integ = integByUser.get(t.user_id);
          if (!integ) continue;
          if (!(await canSendTo(t.conversation_id, t.telefone, t.user_id))) {
            await supabaseAdmin
              .from("free_trials")
              .update({ followup_sent_at: new Date().toISOString() })
              .eq("id", t.id);
            continue;
          }
          // Skip if cliente já respondeu após a notificação de entrega
          if (t.conversation_id) {
            const { data: replied } = await supabaseAdmin
              .from("messages")
              .select("id")
              .eq("conversation_id", t.conversation_id)
              .eq("sender", "cliente")
              .gt("created_at", t.notified_completed_at!)
              .limit(1);
            if (replied && replied.length > 0) {
              await supabaseAdmin
                .from("free_trials")
                .update({ followup_sent_at: new Date().toISOString() })
                .eq("id", t.id);
              continue;
            }
          }
          const followMsg =
            "Quer continuar crescendo? É só criar sua conta em www.mindsmmpanel.com, adicionar saldo via PIX e escolher a quantidade que quiser!";
          try {
            await uazapiSendText(
              { uazapi_url: integ.uazapi_url ?? "", uazapi_token: integ.uazapi_token ?? "" },
              t.telefone,
              followMsg,
            );
          } catch (e) {
            console.error("uazapi followup send failed", e);
          }
          const sentAt = new Date().toISOString();
          await supabaseAdmin
            .from("free_trials")
            .update({ followup_sent_at: sentAt })
            .eq("id", t.id);
          if (t.conversation_id) {
            await supabaseAdmin.from("messages").insert({
              user_id: t.user_id,
              conversation_id: t.conversation_id,
              sender: "agente",
              kind: "texto",
              body: followMsg,
            });
            await supabaseAdmin
              .from("conversations")
              .update({
                last_message_preview: followMsg.slice(0, 120),
                last_message_at: sentAt,
                status: "aguardando",
              })
              .eq("id", t.conversation_id);
          }
        }

        // ====== Playlist sales polling ======
        const playlistProcessed = await pollPlaylistSales();

        return Response.json({ processed, playlistProcessed });
      },
    },
  },
});

async function pollPlaylistSales(): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { smmOrderStatus } = await import("@/lib/smm.server");
  const { uazapiSendText } = await import("@/lib/uazapi.server");

  const { data: sales, error } = await supabaseAdmin
    .from("playlist_sales")
    .select("*")
    .eq("status", "processando")
    .not("smm_order_id", "is", null)
    .limit(100);
  if (error || !sales || sales.length === 0) return 0;

  const userIds = Array.from(new Set(sales.map((s) => s.user_id)));
  const { data: integs } = await supabaseAdmin
    .from("integrations")
    .select("user_id, uazapi_url, uazapi_token, smm_api_key, smm_panel_url")
    .in("user_id", userIds);
  const integByUser = new Map((integs ?? []).map((i) => [i.user_id, i]));

  const { data: cfgs } = await supabaseAdmin
    .from("agent_config")
    .select("user_id, workspace_id, playlist_ecletica_links, playlist_eletronica_links")
    .in("user_id", userIds);
  const cfgKey = (u: string, w: string | null) => `${u}::${w ?? ""}`;
  const cfgByKey = new Map(
    (cfgs ?? []).map((c) => [cfgKey(c.user_id as string, c.workspace_id as string | null), c]),
  );

  let processed = 0;
  for (const sale of sales) {
    const integ = integByUser.get(sale.user_id);
    if (!integ?.smm_api_key) continue;
    try {
      const res = await smmOrderStatus(
        { url: integ.smm_panel_url ?? "https://mindsmmpanel.com/smmpanel/api/v1", key: integ.smm_api_key },
        sale.smm_order_id!,
      );
      const status = (res.status ?? "").toLowerCase();
      const checkedAt = new Date().toISOString();
      if (status === "completed" || status === "complete") {
        const cfg = cfgByKey.get(cfgKey(sale.user_id, sale.workspace_id as string | null));
        const links =
          sale.pacote === "eletronica"
            ? (cfg?.playlist_eletronica_links ?? [])
            : (cfg?.playlist_ecletica_links ?? []);
        const linksBlock =
          Array.isArray(links) && links.length > 0
            ? "\n" + (links as string[]).join("\n")
            : "";
        const msg =
          `Sua música foi adicionada nas playlists! 🎵\n` +
          `Ela já está disponível e aparece na primeira posição.` +
          (linksBlock ? `\n\nAqui estão os links das playlists onde sua música está:${linksBlock}` : "");
        try {
          await uazapiSendText(
            { uazapi_url: integ.uazapi_url ?? "", uazapi_token: integ.uazapi_token ?? "" },
            sale.telefone,
            msg,
          );
        } catch (e) {
          console.error("[smm-poll:playlist] uazapi send failed", e);
        }
        await supabaseAdmin
          .from("playlist_sales")
          .update({
            status: "completo",
            completed_at: checkedAt,
            playlists_sent_at: checkedAt,
            last_checked_at: checkedAt,
            raw_response: res.raw as never,
          })
          .eq("id", sale.id);
        if (sale.conversation_id) {
          await supabaseAdmin.from("messages").insert({
            user_id: sale.user_id,
            conversation_id: sale.conversation_id,
            sender: "agente",
            kind: "texto",
            body: msg,
          });
          await supabaseAdmin
            .from("conversations")
            .update({
              last_message_preview: msg.slice(0, 120),
              last_message_at: checkedAt,
              status: "aguardando",
            })
            .eq("id", sale.conversation_id);
        }
      } else {
        await supabaseAdmin
          .from("playlist_sales")
          .update({
            last_checked_at: checkedAt,
            status_message: status,
            raw_response: res.raw as never,
          })
          .eq("id", sale.id);
      }
      processed++;
    } catch (e) {
      console.error("[smm-poll:playlist] status check failed", e);
    }
  }
  return processed;
}