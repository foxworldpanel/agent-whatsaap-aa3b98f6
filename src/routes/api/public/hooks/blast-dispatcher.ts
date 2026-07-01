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
        const { montarMensagemDisparo } = await import("@/lib/blast-variations");

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

            // Distribuição natural: maior peso 10–12h e 18–20h, menor fora.
            const hour = now.getHours();
            const peakHour = (hour >= 10 && hour < 12) || (hour >= 18 && hour < 20);
            const tickWeight = peakHour ? 1 : 1 / 3;
            if (Math.random() > tickWeight) {
              results.push({ campaign: camp.name, sent: 0, skipped: "distribuição natural" });
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

            // Carregar dados do número (para aquecimento e risco)
            type NumberRow = {
              uazapi_url: string | null;
              uazapi_token: string | null;
              warmup_started_at: string | null;
              warmup_enabled: boolean | null;
              auto_pause_on_risk: boolean | null;
              risk_level: string | null;
              disparos_mode: boolean | null;
              meta_ads_enabled: boolean | null;
            };
            let numberRow: NumberRow | null = null;
            if (camp.whatsapp_number_id) {
              const { data: n } = await supabaseAdmin
                .from("whatsapp_numbers")
                .select("uazapi_url, uazapi_token, warmup_started_at, warmup_enabled, auto_pause_on_risk, risk_level, disparos_mode, meta_ads_enabled")
                .eq("id", camp.whatsapp_number_id)
                .maybeSingle();
              numberRow = (n as unknown as NumberRow | null) ?? null;
            }

            // Auto-pausa por risco
            if (numberRow?.auto_pause_on_risk && numberRow.risk_level === "danger") {
              await supabaseAdmin
                .from("blast_campaigns")
                .update({ state: "pausado" })
                .eq("id", camp.id);
              await supabaseAdmin.from("blast_logs").insert({
                user_id: camp.user_id,
                campaign_id: camp.id,
                stage: "opening",
                status: "failed",
                error: "auto_paused_risk",
              });
              results.push({ campaign: camp.name, sent: 0, skipped: "auto-pausa por risco" });
              continue;
            }

            // Limite diário (com aquecimento progressivo)
            const effectiveLimit = computeEffectiveLimit(
              numberRow?.warmup_enabled ?? true,
              numberRow?.warmup_started_at ?? null,
              camp.daily_limit,
            );
            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);
            const { count: sentToday } = await supabaseAdmin
              .from("blast_logs")
              .select("id", { count: "exact", head: true })
              .eq("campaign_id", camp.id)
              .eq("status", "sent")
              .gte("created_at", startOfDay.toISOString());
            if ((sentToday ?? 0) >= effectiveLimit) {
              results.push({ campaign: camp.name, sent: 0, skipped: `limite diário (${effectiveLimit})` });
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
            let url: string | undefined = numberRow?.uazapi_url ?? undefined;
            let token: string | undefined = numberRow?.uazapi_token ?? undefined;
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

            // Variação de saudação por horário SÓ vale para disparo ativo puro:
            // número em "Modo Disparos" e SEM "Receber leads Meta Ads".
            // Para qualquer outro caso (Meta Ads, receptivo, funil, régua),
            // usa o template configurado da campanha, sem forçar saudação.
            const isModoDisparo = numberRow?.disparos_mode === true;
            const isMetaAds = numberRow?.meta_ads_enabled === true;
            const useVariacao = isModoDisparo && !isMetaAds && next.stage === "opening";
            const pick = useVariacao
              ? montarMensagemDisparo(next.contact.nome, next.contact.instagram, {
                  avoidKey: next.contact.last_variation_key,
                })
              : null;
            const message = pick ? pick.text : renderTemplate(next.template, next.contact);

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
                .update({
                  status: newStatus,
                  last_sent_at: new Date().toISOString(),
                  last_variation_key: pick ? pick.key : next.contact.last_variation_key,
                })
                .eq("id", next.contact.id);
              await supabaseAdmin
                .from("blast_campaigns")
                .update({ last_dispatch_at: new Date().toISOString() })
                .eq("id", camp.id);
              // Primeiro envio do número → inicia aquecimento
              if (camp.whatsapp_number_id && !numberRow?.warmup_started_at) {
                await supabaseAdmin
                  .from("whatsapp_numbers")
                  .update({ warmup_started_at: new Date().toISOString() })
                  .eq("id", camp.whatsapp_number_id);
              }
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

function computeEffectiveLimit(
  warmupEnabled: boolean,
  startedAt: string | null,
  configured: number,
): number {
  const cfg = Math.max(1, Math.min(configured ?? 200, 5000));
  if (!warmupEnabled || !startedAt) return Math.min(cfg, 200);
  const day = Math.floor((Date.now() - new Date(startedAt).getTime()) / 86400000) + 1;
  if (day === 1) return Math.min(50, cfg);
  if (day === 2) return Math.min(100, cfg);
  if (day === 3) return Math.min(150, cfg);
  return Math.min(200, cfg);
}

function renderTemplate(tpl: string, c: { nome: string; instagram: string }): string {
  return (tpl ?? "")
    .replace(/\{nome\}/gi, c.nome ?? "")
    .replace(/\{instagram\}/gi, c.instagram ?? "");
}

type Camp = {
  id: string;
  user_id: string;
  contact_list_id?: string | null;
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
  last_variation_key: string | null;
};

async function pickNext(
  admin: Awaited<ReturnType<typeof getAdmin>>,
  camp: Camp,
): Promise<{ contact: BlastContact; stage: "opening" | "d3" | "d7"; template: string } | null> {
  // Carrega origem da lista (Lista A = meta_ads, Lista B = instagram)
  let listOrigem: "meta_ads" | "instagram" | null = null;
  if (camp.contact_list_id) {
    const { data: l } = await admin
      .from("contact_lists")
      .select("origem")
      .eq("id", camp.contact_list_id)
      .maybeSingle();
    listOrigem = (l?.origem as "meta_ads" | "instagram" | null) ?? null;
  }
  const listFilter = (q: ReturnType<typeof admin.from>) =>
    camp.contact_list_id
      ? q.eq("contact_list_id", camp.contact_list_id)
      : q.eq("campaign_id", camp.id);

  const SELECT = "id, nome, telefone, instagram, status, last_sent_at, last_variation_key";
  // 1) Pendentes (abertura)
  const { data: pend } = await (camp.contact_list_id
    ? admin
        .from("blast_contacts")
        .select(SELECT)
        .eq("contact_list_id", camp.contact_list_id)
    : admin
        .from("blast_contacts")
        .select(SELECT)
        .eq("campaign_id", camp.id))
    .eq("status", "pendente")
    .order("prioridade", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(20);
  void listFilter;

  for (const c of pend ?? []) {
    if (await shouldSkip(admin, camp.user_id, c.telefone, c.id, listOrigem)) continue;
    return { contact: c as BlastContact, stage: "opening", template: camp.opening_message };
  }

  // 2) Follow-up D3 (3 dias após abertura)
  const d3Cutoff = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
  const { data: d3 } = await (camp.contact_list_id
    ? admin
        .from("blast_contacts")
        .select(SELECT)
        .eq("contact_list_id", camp.contact_list_id)
    : admin
        .from("blast_contacts")
        .select(SELECT)
        .eq("campaign_id", camp.id))
    .eq("status", "enviado_abertura")
    .lte("last_sent_at", d3Cutoff)
    .order("last_sent_at", { ascending: true })
    .limit(20);
  for (const c of d3 ?? []) {
    if (await shouldSkip(admin, camp.user_id, c.telefone, c.id, listOrigem)) continue;
    return { contact: c as BlastContact, stage: "d3", template: camp.followup_day3_message };
  }

  // 3) Follow-up D7
  const d7Cutoff = new Date(Date.now() - 4 * 24 * 3600 * 1000).toISOString();
  const { data: d7 } = await (camp.contact_list_id
    ? admin
        .from("blast_contacts")
        .select(SELECT)
        .eq("contact_list_id", camp.contact_list_id)
    : admin
        .from("blast_contacts")
        .select(SELECT)
        .eq("campaign_id", camp.id))
    .eq("status", "enviado_d3")
    .lte("last_sent_at", d7Cutoff)
    .order("last_sent_at", { ascending: true })
    .limit(20);
  for (const c of d7 ?? []) {
    if (await shouldSkip(admin, camp.user_id, c.telefone, c.id, listOrigem)) continue;
    return { contact: c as BlastContact, stage: "d7", template: camp.followup_day7_message };
  }

  return null;
}

async function shouldSkip(
  admin: Awaited<ReturnType<typeof getAdmin>>,
  userId: string,
  phone: string,
  blastContactId: string,
  listOrigem: "meta_ads" | "instagram" | null = null,
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
  // Cross-list protection: ao disparar Lista B (instagram), pula se o número
  // já está na Lista A (meta_ads) ou já respondeu/foi enviado em qualquer campanha.
  if (listOrigem === "instagram") {
    const { data: cross } = await admin
      .from("blast_contacts")
      .select("id, status, origem")
      .eq("user_id", userId)
      .eq("telefone", phone);
    const rows = (cross ?? []) as Array<{ id: string; status: string; origem: string | null }>;
    const inMeta = rows.some((r) => r.origem === "meta_ads");
    if (inMeta) {
      await admin
        .from("blast_contacts")
        .update({ status: "pulado", skip_reason: "já está na Lista Meta Ads" })
        .eq("id", blastContactId);
      return true;
    }
    const responded = rows.some(
      (r) => r.id !== blastContactId && (r.status === "respondeu" || r.status === "convertido"),
    );
    if (responded) {
      await admin
        .from("blast_contacts")
        .update({ status: "pulado", skip_reason: "já respondeu em outra campanha" })
        .eq("id", blastContactId);
      return true;
    }
  }
  return false;
}

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}