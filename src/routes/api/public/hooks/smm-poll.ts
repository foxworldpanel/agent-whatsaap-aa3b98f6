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
        if (!trials || trials.length === 0) return new Response("no pending");

        const userIds = Array.from(new Set(trials.map((t) => t.user_id)));
        const { data: integs } = await supabaseAdmin
          .from("integrations")
          .select(
            "user_id, uazapi_url, uazapi_token, smm_api_key, smm_panel_url",
          )
          .in("user_id", userIds);
        const integByUser = new Map((integs ?? []).map((i) => [i.user_id, i]));

        let processed = 0;
        for (const trial of trials) {
          const integ = integByUser.get(trial.user_id);
          if (!integ?.smm_api_key) continue;

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
              const msg =
                "🎉 Pronto! Suas 100 visualizações gratuitas foram entregues! Vai lá conferir no seu vídeo 😊\n\nGostou? Imagina com 1.000 views — tenho um pacote por só R$5! Quer aproveitar? 🚀";
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
                  upsell_offered: true,
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

        return Response.json({ processed });
      },
    },
  },
});