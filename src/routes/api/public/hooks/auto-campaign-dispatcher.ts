import { createFileRoute } from "@tanstack/react-router";
import { assertCronAuthorized } from "@/lib/cron-auth.server";

// Régua de relacionamento automática.
// Chamado por pg_cron a cada N minutos. Para cada usuário com auto_campaigns
// habilitadas, procura contatos elegíveis (segundo trigger_type/hours) e envia
// a mensagem template (com {nome}), registrando em auto_campaign_runs.

export const Route = createFileRoute("/api/public/hooks/auto-campaign-dispatcher")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = assertCronAuthorized(request);
        if (unauth) return unauth;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { uazapiSendText } = await import("@/lib/uazapi.server");

        const { data: camps, error } = await supabaseAdmin
          .from("auto_campaigns")
          .select("*")
          .eq("enabled", true);
        if (error) return new Response(error.message, { status: 500 });

        const results: Array<{ campaign: string; sent: number; skipped?: string }> = [];

        for (const camp of camps ?? []) {
          try {
            const { data: integ } = await supabaseAdmin
              .from("integrations")
              .select("uazapi_url, uazapi_token")
              .eq("user_id", camp.user_id)
              .maybeSingle();
            if (!integ?.uazapi_url || !integ.uazapi_token) {
              results.push({ campaign: camp.key, sent: 0, skipped: "uazapi nao configurado" });
              continue;
            }
            const { data: agent } = await supabaseAdmin
              .from("agent_config")
              .select("agent_enabled")
              .eq("user_id", camp.user_id)
              .maybeSingle();
            if (agent?.agent_enabled === false) {
              results.push({ campaign: camp.key, sent: 0, skipped: "agente desativado" });
              continue;
            }

            const cutoff = new Date(Date.now() - camp.trigger_hours * 3600 * 1000).toISOString();
            const candidates = await pickCandidates(supabaseAdmin, camp, cutoff);

            let sent = 0;
            for (const c of candidates) {
              // Respeita kill switch por conversa e bloqueio do contato
              const { data: conv } = await supabaseAdmin
                .from("conversations")
                .select("agent_enabled, needs_review")
                .eq("user_id", camp.user_id)
                .eq("contact_id", c.id)
                .maybeSingle();
              if (conv && (conv.agent_enabled === false || conv.needs_review === true)) continue;
              const { data: ct } = await supabaseAdmin
                .from("contacts")
                .select("status")
                .eq("id", c.id)
                .maybeSingle();
              if (ct?.status === "bloqueado") continue;
              const message = (camp.message_template as string).replace(/\{nome\}/gi, c.nome || "");
              let status: "sent" | "failed" = "sent";
              let errMsg: string | undefined;
              try {
                await uazapiSendText(
                  { uazapi_url: integ.uazapi_url, uazapi_token: integ.uazapi_token },
                  c.telefone,
                  message,
                );
              } catch (e) {
                status = "failed";
                errMsg = (e as Error).message;
              }
              await supabaseAdmin.from("auto_campaign_runs").insert({
                user_id: camp.user_id,
                auto_campaign_id: camp.id,
                contact_id: c.id,
                campaign_key: camp.key,
                status,
                error: errMsg,
              });
              if (status === "sent") sent += 1;
            }
            results.push({ campaign: camp.key, sent });
          } catch (e) {
            results.push({ campaign: camp.key, sent: 0, skipped: (e as Error).message });
          }
        }

        return Response.json({ ran: results.length, results });
      },
    },
  },
});

type Camp = {
  id: string;
  user_id: string;
  key: string;
  trigger_type: string;
  trigger_hours: number;
};

type Candidate = { id: string; nome: string; telefone: string };

async function pickCandidates(
  admin: Awaited<ReturnType<typeof getAdmin>>,
  camp: Camp,
  cutoffIso: string,
): Promise<Candidate[]> {
  if (camp.trigger_type === "after_purchase") {
    const { data } = await admin
      .from("contacts")
      .select("id, nome, telefone, last_purchase_at")
      .eq("user_id", camp.user_id)
      .not("last_purchase_at", "is", null)
      .lte("last_purchase_at", cutoffIso)
      .limit(50);
    return await filterAlreadySent(admin, camp.key, data ?? []);
  }
  if (camp.trigger_type === "inactive") {
    const { data } = await admin
      .from("contacts")
      .select("id, nome, telefone, last_interaction_at")
      .eq("user_id", camp.user_id)
      .not("last_interaction_at", "is", null)
      .lte("last_interaction_at", cutoffIso)
      .limit(50);
    return await filterAlreadySent(admin, camp.key, data ?? []);
  }
  if (camp.trigger_type === "after_free_trial") {
    const { data: trials } = await admin
      .from("free_trials")
      .select("contact_id, telefone, updated_at")
      .eq("user_id", camp.user_id)
      .eq("status", "completed")
      .lte("updated_at", cutoffIso)
      .limit(50);
    const contactIds = (trials ?? []).map((t) => t.contact_id).filter(Boolean) as string[];
    if (contactIds.length === 0) return [];
    const { data: contacts } = await admin
      .from("contacts")
      .select("id, nome, telefone")
      .in("id", contactIds);
    return await filterAlreadySent(admin, camp.key, contacts ?? []);
  }
  return [];
}

async function filterAlreadySent(
  admin: Awaited<ReturnType<typeof getAdmin>>,
  campaignKey: string,
  list: Array<{ id: string; nome: string; telefone: string }>,
): Promise<Candidate[]> {
  if (list.length === 0) return [];
  const ids = list.map((c) => c.id);
  const { data: already } = await admin
    .from("auto_campaign_runs")
    .select("contact_id")
    .eq("campaign_key", campaignKey)
    .in("contact_id", ids);
  const sentSet = new Set((already ?? []).map((r) => r.contact_id));
  return list.filter((c) => !sentSet.has(c.id));
}

// Helper type alias for the admin client
async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}