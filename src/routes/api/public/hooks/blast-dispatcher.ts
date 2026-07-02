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
        const {
          montarMensagemDisparo,
          DEFAULT_TEMPLATES,
          saudacaoIdxFromKey,
          detectLanguageFromPhone,
          DEFAULT_DDI_LANGUAGE_MAP,
        } = await import("@/lib/blast-variations");
        const { _toTemplates } = await import("@/lib/opening-templates.functions");

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
            // No primeiro envio da campanha, não pula por distribuição natural
            // (para dar feedback imediato ao usuário quando clicar em Iniciar).
            if (camp.last_dispatch_at && Math.random() > tickWeight) {
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

            // Carregar pool de números ativos para rotação round-robin.
            // Elegível: disparos_mode=true, status conectado, risco != danger,
            // e (se auto_pause_on_risk desligado) qualquer risco aceito.
            type NumberRow = {
              id: string;
              uazapi_url: string | null;
              uazapi_token: string | null;
              warmup_started_at: string | null;
              warmup_enabled: boolean | null;
              auto_pause_on_risk: boolean | null;
              risk_level: string | null;
              disparos_mode: boolean | null;
              meta_ads_enabled: boolean | null;
              status: string | null;
              nome: string | null;
            };
            const { data: allNums } = await supabaseAdmin
              .from("whatsapp_numbers")
              .select("id, uazapi_url, uazapi_token, warmup_started_at, warmup_enabled, auto_pause_on_risk, risk_level, disparos_mode, meta_ads_enabled, status, nome")
              .eq("user_id", camp.user_id);
            const allNumbers = (allNums as unknown as NumberRow[] | null) ?? [];
            const isConnected = (s: string | null | undefined) => {
              const v = (s ?? "").toLowerCase();
              return v === "connected" || v === "conectado" || v === "online";
            };
            const pool = allNumbers
              .filter((n) => n.disparos_mode === true)
              .filter((n) => n.uazapi_url && n.uazapi_token)
              .filter((n) => isConnected(n.status))
              .filter((n) => !(n.auto_pause_on_risk && n.risk_level === "danger"))
              .sort((a, b) => a.id.localeCompare(b.id));

            // Se campanha aponta um número fixo e ele está no pool, mantém preferência,
            // caso contrário usa round-robin baseado no total enviado hoje.
            let numberRow: NumberRow | null = null;
            if (pool.length === 0) {
              // Fallback ao número da campanha (mesmo desconectado) para não travar
              // silenciosamente antes: prefere skipar com mensagem clara.
              results.push({ campaign: camp.name, sent: 0, skipped: "nenhum número em Modo Disparos ativo/conectado" });
              continue;
            }

            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);
            const { count: sentToday } = await supabaseAdmin
              .from("blast_logs")
              .select("id", { count: "exact", head: true })
              .eq("campaign_id", camp.id)
              .eq("status", "sent")
              .gte("created_at", startOfDay.toISOString());

            // Round-robin: escolhe pool[(sentToday) % pool.length]
            const rrIndex = (sentToday ?? 0) % pool.length;
            numberRow = pool[rrIndex];

            // Limite diário (com aquecimento progressivo) baseado no número escolhido
            const effectiveLimit = computeEffectiveLimit(
              numberRow?.warmup_enabled ?? true,
              numberRow?.warmup_started_at ?? null,
              camp.daily_limit,
            );
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

            // Credenciais do número escolhido no round-robin
            const url = numberRow.uazapi_url!;
            const token = numberRow.uazapi_token!;

            // Escolher próximo contato e estágio
            const next = await pickNext(supabaseAdmin, camp);
            if (!next) {
              console.log(`[blast-dispatcher] ${camp.name}: sem contatos elegíveis (list_id=${camp.contact_list_id ?? "null"})`);
              results.push({ campaign: camp.name, sent: 0, skipped: "sem contatos elegíveis" });
              continue;
            }
            console.log(`[blast-dispatcher] ${camp.name}: enviando para ${next.contact.nome} ${next.contact.telefone} (stage=${next.stage})`);

            // Variação de saudação por horário SÓ vale para disparo ativo puro:
            // número em "Modo Disparos" e SEM "Receber leads Meta Ads".
            // Para qualquer outro caso (Meta Ads, receptivo, funil, régua),
            // usa o template configurado da campanha, sem forçar saudação.
            const isModoDisparo = numberRow?.disparos_mode === true;
            const isMetaAds = numberRow?.meta_ads_enabled === true;
            const useVariacao = isModoDisparo && !isMetaAds && next.stage === "opening";

            // Carrega templates editáveis do usuário
            let templates = DEFAULT_TEMPLATES;
            if (useVariacao) {
              const { data: tplRow } = await supabaseAdmin
                .from("opening_templates")
                .select(
                  "saudacoes_manha, saudacoes_tarde, saudacoes_noite, linha2, perguntas, templates_en, templates_es, ddi_language_map",
                )
                .eq("user_id", camp.user_id)
                .maybeSingle();
              templates = _toTemplates(
                tplRow as Parameters<typeof _toTemplates>[0] ?? null,
              );
            }

            // Anti-repetição da saudação: pega saudação do último envio da campanha
            let avoidSaudacaoIdx: number | null = null;
            if (useVariacao && camp.last_dispatch_at) {
              const { data: lastSent } = await supabaseAdmin
                .from("blast_contacts")
                .select("last_variation_key")
                .eq("campaign_id", camp.id)
                .not("last_variation_key", "is", null)
                .order("last_sent_at", { ascending: false })
                .limit(1);
              avoidSaudacaoIdx = saudacaoIdxFromKey(lastSent?.[0]?.last_variation_key ?? null);
            }

            const language = useVariacao
              ? detectLanguageFromPhone(
                  next.contact.telefone,
                  templates.ddiMap ?? DEFAULT_DDI_LANGUAGE_MAP,
                )
              : "pt";
            const pick = useVariacao
              ? montarMensagemDisparo(next.contact.nome, next.contact.instagram, {
                  avoidKey: next.contact.last_variation_key,
                  avoidSaudacaoIdx,
                  templates,
                  language,
                })
              : null;
            const messageParts: string[] = pick
              ? pick.parts
              : [renderTemplate(next.template, next.contact)];

            let status: "sent" | "failed" = "sent";
            let errMsg: string | undefined;
            try {
              for (let i = 0; i < messageParts.length; i++) {
                await uazapiSendText(
                  { uazapi_url: url, uazapi_token: token },
                  next.contact.telefone,
                  messageParts[i],
                );
                if (i < messageParts.length - 1) {
                  // Delay natural entre linhas (2.5s–5s) simulando digitação
                  const wait = 2500 + Math.random() * 2500;
                  await new Promise((r) => setTimeout(r, wait));
                }
              }
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
              sent_via_number_id: numberRow.id,
            });

            if (status === "sent") {
              console.log(`[blast-dispatcher] ${camp.name}: enviado com sucesso para ${next.contact.nome}`);
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
                  sent_via_number_id: numberRow.id,
                })
                .eq("id", next.contact.id);
              await supabaseAdmin
                .from("blast_campaigns")
                .update({ last_dispatch_at: new Date().toISOString() })
                .eq("id", camp.id);
              // Primeiro envio do número → inicia aquecimento
              if (!numberRow.warmup_started_at) {
                await supabaseAdmin
                  .from("whatsapp_numbers")
                  .update({ warmup_started_at: new Date().toISOString() })
                  .eq("id", numberRow.id);
              }
              results.push({ campaign: camp.name, sent: 1, skipped: `via ${numberRow.nome ?? numberRow.id.slice(0, 6)}` });
            } else {
              console.log(`[blast-dispatcher] ${camp.name}: erro ao enviar para ${next.contact.nome}: ${errMsg}`);
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