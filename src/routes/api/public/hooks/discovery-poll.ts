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

              // Problema 2 — registra TODO perfil visitado, não só
              // quem virou lead.
              await supabaseAdmin.from("lead_finder_visited_profiles").insert({
                job_id: job.id,
                username,
                url: result.profile.url,
                has_contact: temContato,
                rejection_reason: temContato ? null : "NO_CONTACT",
                created_by: job.created_by,
              });

              if (temContato) {
                const { error: saveError } = await supabaseAdmin
                  .from("lead_finder_leads")
                  .upsert(
                    {
                      platform: result.profile.platform.toLowerCase(),
                      profile_username: username.toLowerCase(),
                      profile_url: result.profile.url,
                      bio: result.profile.bio,
                      phone: result.contacts?.phone || null,
                      email: result.contacts?.email || null,
                      segment: result.metadata?.segment || null,
                      country: result.metadata?.country || null,
                      lead_origin: "hashtag",
                      lead_origin_value: hashtag,
                      pipeline_stage: "DISCOVERED",
                      sales_status: "NEW",
                      created_by: job.created_by,
                    },
                    { onConflict: "platform,profile_username", ignoreDuplicates: true },
                  );
                if (saveError) errorsCount++;
                else leadsCount++;
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
