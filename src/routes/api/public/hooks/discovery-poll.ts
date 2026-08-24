import { createFileRoute } from "@tanstack/react-router";
import { assertCronAuthorized } from "@/lib/cron-auth.server";

// AUDITORIA 001 — Problema 5: Discovery não devia depender da
// interface aberta. Antes, era o navegador (via polling no frontend)
// quem salvava cada lead encontrado — se a aba fechasse no meio de uma
// busca de vários minutos, tudo que o Worker encontrasse depois se
// perdia, sem nunca virar registro no banco.
//
// Essa rota roda de fundo (chamada por pg_cron a cada minuto),
// independente de qualquer navegador aberto. Ela é agora a fonte de
// verdade de persistência — o frontend só consulta pra mostrar
// progresso, não é mais quem decide o que fica salvo.

export const Route = createFileRoute("/api/public/hooks/discovery-poll")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = assertCronAuthorized(request);
        if (unauth) return unauth;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { InstagramWorkerClient } = await import("@/lib/instagram-worker/instagram-worker");

        // Busca todos os jobs que ainda estão rodando de verdade
        // (tem worker_job_id e ainda não foi marcado como concluído).
        const { data: jobs, error } = await supabaseAdmin
          .from("lead_finder_jobs")
          .select("*")
          .not("worker_job_id", "is", null)
          .is("finished_at", null)
          .limit(20);

        if (error) return new Response(error.message, { status: 500 });
        if (!jobs || jobs.length === 0) return new Response("no active jobs");

        const client = new InstagramWorkerClient();
        let processedJobs = 0;

        for (const job of jobs) {
          try {
            const status = await client.discoveryStatus(job.worker_job_id);
            if (!status?.success) continue;

            const config = (job.config as any) || {};
            const hashtag = config.hashtag || "";

            let leadsCount = 0;
            let duplicatesCount = 0;
            let errorsCount = 0;

            for (const result of status.results || []) {
              const username = result.profile.username;

              // Evita reprocessar perfil já registrado nesse job —
              // idempotente mesmo que a rota rode de novo antes do
              // job terminar (pg_cron chama a cada minuto).
              const { data: jaVisitado } = await supabaseAdmin
                .from("lead_finder_visited_profiles")
                .select("id")
                .eq("job_id", job.id)
                .eq("username", username)
                .maybeSingle();

              if (jaVisitado) {
                duplicatesCount++;
                continue;
              }

              const temContato = !!(result.contacts?.phone || result.contacts?.email);

              // AUDITORIA 002 — usa o motivo de rejeição real que o
              // Worker já calculou (mais específico que só NO_CONTACT).
              //
              // Achado real em 23/08/2026 — pedido do usuário: o
              // histórico precisa ser autossuficiente, com telefone,
              // email, país, segmento e hashtag direto na própria
              // linha, sem precisar cruzar com outra tabela.
              await supabaseAdmin.from("lead_finder_visited_profiles").insert({
                job_id: job.id,
                username,
                url: result.profile.url,
                has_contact: temContato,
                rejection_reason: (result.metadata as any)?.rejectionReason || (temContato ? null : "NO_CONTACT"),
                contact_source: (result.metadata as any)?.contactSource || null,
                phone: result.contacts?.phone || null,
                raw_phone: (result.contacts as any)?.phoneOriginal || null,
                email: result.contacts?.email || null,
                country: result.metadata?.country || null,
                country_confidence: (result.metadata as any)?.countryConfidence || null,
                segment: result.metadata?.segment || null,
                hashtag,
                created_by: job.created_by,
              });

              if (temContato) {
                // Achado real em 24/08/2026 — bug confirmado: essa
                // tabela NÃO tem colunas "country" nem "created_by"
                // (só "country_code") — o insert vinha silenciosamente
                // caindo em erro nesses campos. Corrigido pros nomes
                // reais do schema.
                const { error: saveError, data: leadSalvo } = await supabaseAdmin
                  .from("lead_finder_leads")
                  .upsert(
                    {
                      platform: result.profile.platform.toLowerCase(),
                      profile_username: username.toLowerCase(),
                      display_name: username,
                      profile_url: result.profile.url,
                      bio: result.profile.bio,
                      phone: result.contacts?.phone || null,
                      raw_phone: (result.contacts as any)?.phoneOriginal || null,
                      email: result.contacts?.email || null,
                      segment: result.metadata?.segment || null,
                      country_code: (result.metadata as any)?.countryCode || null,
                      country_confidence: (result.metadata as any)?.countryConfidence || null,
                      language: (result.metadata as any)?.language || null,
                      contact_source: (result.metadata as any)?.contactSource || null,
                      lead_origin: "hashtag",
                      lead_origin_value: hashtag,
                      pipeline_stage: "DISCOVERED",
                      sales_status: "NEW",
                    },
                    { onConflict: "platform,profile_username", ignoreDuplicates: true },
                  )
                  .select();
                // Achado real em 24/08/2026 — pedido do usuário: leads
                // com contato não estavam chegando na tabela de leads,
                // sem erro visível. Log detalhado do erro real (não só
                // truthy/falsy) e confirmação de quantas linhas
                // realmente foram afetadas pelo upsert.
                if (saveError) {
                  errorsCount++;
                  console.error(`[discovery-poll] ERRO ao salvar lead @${username}:`, JSON.stringify(saveError));
                } else {
                  leadsCount++;
                  console.log(`[discovery-poll] Lead @${username} — upsert OK, linhas afetadas: ${leadSalvo?.length ?? "desconhecido"}`);
                }
              }
            }

            // Atualiza estatísticas do job — fonte de verdade fica no
            // banco, não em estado do navegador (Problema 1 e 5).
            const statsAtualizadas = {
              leads: leadsCount,
              duplicates: duplicatesCount,
              profiles_analyzed: (status.results || []).length,
              errors: errorsCount,
            };

            // O Worker usa RUNNING/COMPLETED/ERROR internamente, mas o
            // enum job_status do banco é RUNNING/FINISHED/FAILED —
            // precisa mapear, não são os mesmos valores.
            const statusMap: Record<string, string> = {
              RUNNING: "RUNNING",
              COMPLETED: "FINISHED",
              ERROR: "FAILED",
            };
            const dbStatus = statusMap[status.status] || "RUNNING";

            const patch: Record<string, unknown> = {
              status: dbStatus,
              stats: statsAtualizadas,
            };
            if (dbStatus === "FINISHED" || dbStatus === "FAILED") {
              patch.finished_at = new Date().toISOString();
            }

            await supabaseAdmin.from("lead_finder_jobs").update(patch).eq("id", job.id);
            processedJobs++;
          } catch (err: any) {
            console.error(`[discovery-poll] erro processando job ${job.id}:`, err.message);
          }
        }

        return new Response(`processed ${processedJobs} jobs`);
      },
    },
  },
});
