import { createFileRoute } from "@tanstack/react-router";

// Disparos ativos. Chamado por pg_cron a cada minuto.
// Para cada campanha 'rodando', dentro do horário e respeitando o limite diário,
// envia próxima mensagem (abertura, follow-up D3 ou D7) ao próximo contato elegível,
// respeitando os toggles globais (agent_enabled), contatos bloqueados/convertidos e
// contatos que já responderam.

export const Route = createFileRoute("/api/public/hooks/blast-dispatcher")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { uazapiSendText } = await import("@/lib/uazapi.server");

        const { data: camps, error } = await supabaseAdmin
          .from("blast_campaigns")
          .select("*")
          .eq("state", "rodando");
        if (error) return new Response(error.message, { status: 500 });

        const results: Array<{ campaign: string; sent: number; skipped?: string }> = [];

        for (const camp of camps ?? []) {
          try {
            const now = new Date();
            const hhmm = now.toTimeString().slice(0, 8);
            if (hhmm < camp.start_time || hhmm > camp.end_time) {
              results.push({ campaign: camp.name, sent: 0, skipped: "fora do horário" });
              continue;
            }

            // Delay aleatório entre disparos por campanha
            if (camp.last_dispatch_at) {
              const since = Date.now() - new Date(camp.last_dispatch_at).getTime();
              const minMs = (camp.delay_min_sec ?? 45) * 1000;
              const maxMs = (camp.delay_max_sec ?? 90) * 1000;
              const required = minMs + Math.random() * (maxMs - minMs);
              if (since < required) {
                results.push({ campaign: camp.name, sent: 0, skipped: "delay" });
                continue;
              }
            }

            // Limite diário
            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);
            const { count: sentToday } = await supabaseAdmin
              .from("blast_logs")
              .select("id", { count: "exact", head: true })
              .eq("campaign_id", camp.id)
              .eq("status", "sent")
              .gte("created_at", startOfDay.toISOString());
            if ((sentToday ?? 0) >= camp.daily_limit) {
              results.push({ campaign: camp.name, sent: 0, skipped: "limite diário" });
              continue;
            }

            // Kill switches
            const { data: agent } = await supabaseAdmin
              .from("agent_config")
              .select("agent_enabled")
              .eq("user_id", camp.user_id)
              .maybeSingle();
            if (agent?.agent_enabled === false) {
              results.push({ campaign: camp.name, sent: 0, skipped: "agente desativado" });
              continue;
            }

            // Credenciais: número da campanha ou fallback para integrations
            let url: string | undefined;
            let token: string | undefined;
            if (camp.whatsapp_number_id) {
              const { data: num } = await supabaseAdmin
                .from("whatsapp_numbers")
                .select("uazapi_url, uazapi_token")
                .eq("id", camp.whatsapp_number_id)
                .maybeSingle();
              url = num?.uazapi_url;
              token = num?.uazapi_token;
            }
            if (!url || !token) {
              const { data: integ } = await supabaseAdmin
                .from("integrations")
                .select("uazapi_url, uazapi_token")
                .eq("user_id", camp.user_id)
                .maybeSingle();
              url = integ?.uazapi_url ?? undefined;
              token = integ?.uazapi_token ?? undefined;
            }
            if (!url || !token) {
              results.push({ campaign: camp.name, sent: 0, skipped: "uazapi não configurado" });
              continue;
            }

            // Escolher próximo contato e estágio
            const next = await pickNext(supabaseAdmin, camp);
            if (!next) {
              results.push({ campaign: camp.name, sent: 0, skipped: "sem contatos elegíveis" });
              continue;
            }

            const message = renderTemplate(next.template, next.contact);

            let status: "sent" | "failed" = "sent";
            let errMsg: string | undefined;
            try {
              await uazapiSendText({ uazapi_url: url, uazapi_token: token }, next.contact.telefone, message);
            } catch (e) {
              status = "failed";
              errMsg = (e as Error).message;
            }

            await supabaseAdmin.from("blast_logs").insert({
              user_id: camp.user_id,
              campaign_id: camp.id,
              blast_contact_id: next.contact.id,
              stage: next.stage,
              status,
              error: errMsg,
            });

            if (status === "sent") {
              const newStatus =
                next.stage === "opening"
                  ? "enviado_abertura"
                  : next.stage === "d3"
                    ? "enviado_d3"
                    : "enviado_d7";
              await supabaseAdmin
                .from("blast_contacts")
                .update({ status: newStatus, last_sent_at: new Date().toISOString() })
                .eq("id", next.contact.id);
              await supabaseAdmin
                .from("blast_campaigns")
                .update({ last_dispatch_at: new Date().toISOString() })
                .eq("id", camp.id);
              results.push({ campaign: camp.name, sent: 1 });
            } else {
              results.push({ campaign: camp.name, sent: 0, skipped: `falhou: ${errMsg}` });
            }
          } catch (e) {
            results.push({ campaign: camp.name, sent: 0, skipped: (e as Error).message });
          }
        }

        return Response.json({ ran: results.length, results });
      },
    },
  },
});

function renderTemplate(tpl: string, c: { nome: string; instagram: string }): string {
  return (tpl ?? "")
    .replace(/\{nome\}/gi, c.nome ?? "")
    .replace(/\{instagram\}/gi, c.instagram ?? "");
}

type Camp = {
  id: string;
  user_id: string;
  opening_message: string;
  followup_day3_message: string;
  followup_day7_message: string;
};
type BlastContact = {
  id: string;
  nome: string;
  telefone: string;
  instagram: string;
  status: string;
  last_sent_at: string | null;
};

async function pickNext(
  admin: Awaited<ReturnType<typeof getAdmin>>,
  camp: Camp,
): Promise<{ contact: BlastContact; stage: "opening" | "d3" | "d7"; template: string } | null> {
  // 1) Pendentes (abertura)
  const { data: pend } = await admin
    .from("blast_contacts")
    .select("id, nome, telefone, instagram, status, last_sent_at")
    .eq("campaign_id", camp.id)
    .eq("status", "pendente")
    .order("created_at", { ascending: true })
    .limit(20);

  for (const c of pend ?? []) {
    if (await shouldSkip(admin, camp.user_id, c.telefone, c.id)) continue;
    return { contact: c as BlastContact, stage: "opening", template: camp.opening_message };
  }

  // 2) Follow-up D3 (3 dias após abertura)
  const d3Cutoff = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
  const { data: d3 } = await admin
    .from("blast_contacts")
    .select("id, nome, telefone, instagram, status, last_sent_at")
    .eq("campaign_id", camp.id)
    .eq("status", "enviado_abertura")
    .lte("last_sent_at", d3Cutoff)
    .order("last_sent_at", { ascending: true })
    .limit(20);
  for (const c of d3 ?? []) {
    if (await shouldSkip(admin, camp.user_id, c.telefone, c.id)) continue;
    return { contact: c as BlastContact, stage: "d3", template: camp.followup_day3_message };
  }

  // 3) Follow-up D7 (4 dias após D3 = 7 totais)
  const d7Cutoff = new Date(Date.now() - 4 * 24 * 3600 * 1000).toISOString();
  const { data: d7 } = await admin
    .from("blast_contacts")
    .select("id, nome, telefone, instagram, status, last_sent_at")
    .eq("campaign_id", camp.id)
    .eq("status", "enviado_d3")
    .lte("last_sent_at", d7Cutoff)
    .order("last_sent_at", { ascending: true })
    .limit(20);
  for (const c of d7 ?? []) {
    if (await shouldSkip(admin, camp.user_id, c.telefone, c.id)) continue;
    return { contact: c as BlastContact, stage: "d7", template: camp.followup_day7_message };
  }

  return null;
}

async function shouldSkip(
  admin: Awaited<ReturnType<typeof getAdmin>>,
  userId: string,
  phone: string,
  blastContactId: string,
): Promise<boolean> {
  const { data: ct } = await admin
    .from("contacts")
    .select("id, status")
    .eq("user_id", userId)
    .eq("telefone", phone)
    .maybeSingle();
  if (ct && (ct.status === "bloqueado" || ct.status === "convertido")) {
    await admin
      .from("blast_contacts")
      .update({ status: "pulado", skip_reason: `contato ${ct.status}` })
      .eq("id", blastContactId);
    return true;
  }
  return false;
}

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}