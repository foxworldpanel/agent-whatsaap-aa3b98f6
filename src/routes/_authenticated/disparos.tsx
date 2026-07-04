import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Play, Pause, Square, Send, CheckCircle2, XCircle, MessageCircle, Plus, Trash2, Sparkles, AlertTriangle, Check, Repeat, Eye, BarChart3, History, Zap, Megaphone, Instagram, Users, Ban, Search, SkipForward, ShieldOff, Clock, ShoppingBag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  SAUDACOES,
  CORPOS_MENSAGEM,
  DEFAULT_TEMPLATES,
  DEFAULT_DDI_LANGUAGE_MAP,
  EN_DEFAULT,
  ES_DEFAULT,
  type OpeningTemplates,
  type LangTemplates,
  type Language,
} from "@/lib/blast-variations";
import { getOpeningTemplates, saveOpeningTemplates } from "@/lib/opening-templates.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  listCampaigns,
  createCampaign,
  updateCampaignState,
  deleteCampaign,
  listCampaignLogs,
} from "@/lib/campaigns.functions";
import { getAgentConfig, saveAgentConfig } from "@/lib/agent.functions";
import { listNumbers, updateNumberToggles } from "@/lib/numbers.functions";
import { listAutoCampaigns, updateAutoCampaign } from "@/lib/auto-campaigns.functions";
import {
  listBlastCampaigns,
  updateBlastCampaign,
  setBlastCampaignState,
  importBlastContacts,
  listBlastContacts,
  clearBlastContacts,
  testBlastCampaign,
  getNumberHealth,
  skipBlastContact,
  blockBlastContact,
  bulkBlastAction,
} from "@/lib/blast.functions";
import {
  listContactLists,
  importContactsToList,
  clearContactList,
  clearAllBlastContacts,
  exportContactList,
} from "@/lib/contact-lists.functions";
import { listCategories } from "@/lib/categories.functions";
import { profileLabel, type ContactProfile } from "@/lib/mock-data";
import { BlastFlowBuilder } from "@/components/BlastFlowBuilder";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/disparos")({
  ssr: false,
  head: () => ({ meta: [{ title: "Disparos · ZapAgent" }] }),
  component: Disparos,
});

type CampaignState = "parado" | "rodando" | "pausado";

function fmtTime(t: string) {
  return t.slice(0, 5);
}

function Disparos() {
  const qc = useQueryClient();
  const listC = useServerFn(listCampaigns);
  const createC = useServerFn(createCampaign);
  const updateC = useServerFn(updateCampaignState);
  const delC = useServerFn(deleteCampaign);
  const listL = useServerFn(listCampaignLogs);
  const listN = useServerFn(listNumbers);

  const [showAdd, setShowAdd] = useState(false);
  const [activeTab, setActiveTab] = useState<"ativo" | "regua" | "historico">("ativo");

  const { data: campaigns = [] } = useQuery({ queryKey: ["campaigns"], queryFn: () => listC() });
  const { data: logs = [] } = useQuery({ queryKey: ["campaign_logs"], queryFn: () => listL() });
  const { data: numbers = [] } = useQuery({ queryKey: ["whatsapp_numbers"], queryFn: () => listN() });
  const disparosActive = numbers.some((n: { disparos_mode?: boolean }) => n.disparos_mode);

  useEffect(() => {
    const ch = supabase
      .channel("campaign_logs_rt")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "campaign_logs" }, () => {
        qc.invalidateQueries({ queryKey: ["campaign_logs"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const createMut = useMutation({
    mutationFn: (input: {
      target_profile: ContactProfile;
      daily_volume: number;
      interval_minutes: number;
      start_time: string;
      end_time: string;
    }) => createC({ data: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      setShowAdd(false);
    },
  });
  const stateMut = useMutation({
    mutationFn: ({ id, state }: { id: string; state: CampaignState }) => updateC({ data: { id, state } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["campaigns"] }),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => delC({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["campaigns"] }),
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Campanhas</p>
          <h1 className="text-3xl font-bold tracking-tight">Disparos</h1>
        </div>
        {activeTab === "ativo" && (
          <button
            onClick={() => setShowAdd((s) => !s)}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-transform hover:scale-[1.02]"
            style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-glow)" }}
          >
            <Plus className="h-4 w-4" /> Nova campanha
          </button>
        )}
      </header>

      <div className="flex gap-2 border-b border-border">
        {[
          { id: "ativo" as const, label: "Disparo Ativo", icon: Zap },
          { id: "regua" as const, label: "Régua Automática", icon: Repeat },
          { id: "historico" as const, label: "Histórico e Métricas", icon: History },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition ${
              activeTab === t.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      {activeTab === "ativo" && (
        <div className="space-y-6">
          <NumbersCard />
          <ContactListsSection />
          <BlastSection />

          {showAdd && (
            <AddForm
              pending={createMut.isPending}
              onCancel={() => setShowAdd(false)}
              onSubmit={(v) => createMut.mutate(v)}
            />
          )}
        </div>
      )}

      {activeTab === "regua" && <AutoCampaignsSection />}

      {activeTab === "historico" && <HistorySection />}
    </div>
  );
}

type PanelListRow = {
  id: string;
  name: string;
  origem: string;
  total: number;
  contatados: number;
  respondeu: number;
  convertido: number;
};

type PanelContactRow = {
  id: string;
  nome: string;
  telefone: string;
  instagram: string | null;
  status: string;
  last_sent_at: string | null;
  replied_at: string | null;
  converted_at: string | null;
  ultima_interacao: string | null;
  error_message: string | null;
  sent_via_number_id: string | null;
  categoria_id: string | null;
  skip_reason: string | null;
  created_at: string | null;
};

type PanelCampaign = {
  id: string;
  name: string;
  contact_list_id: string | null;
  state: string;
  daily_limit: number | null;
  delay_min_sec: number | null;
  delay_max_sec: number | null;
  last_dispatch_at: string | null;
  opening_message?: string | null;
};

type PanelFilter = "all" | "aguardando" | "enviados" | "responderam" | "converteram" | "nao_quer" | "falhou";

const PANEL_STATUS: Record<string, { label: string; cls: string; icon: string }> = {
  pendente:          { label: "Aguardando", cls: "bg-muted text-muted-foreground",          icon: "⬜" },
  na_fila:           { label: "Na fila",    cls: "bg-amber-500/15 text-amber-500",          icon: "🟡" },
  enviado_abertura:  { label: "Enviado",    cls: "bg-emerald-500/15 text-emerald-500",      icon: "✅" },
  enviado_d3:        { label: "Follow-up 3d", cls: "bg-emerald-500/15 text-emerald-500",    icon: "✅" },
  enviado_d7:        { label: "Follow-up 7d", cls: "bg-emerald-500/15 text-emerald-500",    icon: "✅" },
  respondeu:         { label: "Respondeu",  cls: "bg-blue-500/15 text-blue-500",            icon: "💬" },
  convertido:        { label: "Converteu",  cls: "bg-purple-500/15 text-purple-500",        icon: "🛍️" },
  failed:            { label: "Falhou",     cls: "bg-red-500/15 text-red-500",              icon: "❌" },
  pulado:            { label: "Pulado",     cls: "bg-muted/60 text-muted-foreground",       icon: "⏭️" },
  bloqueado:         { label: "Não quer",   cls: "bg-red-500/15 text-red-500",              icon: "🚫" },
};

function isNaoQuer(status: string, skipReason: string | null): boolean {
  if (status === "bloqueado") return true;
  if (status === "pulado" && skipReason && /bloque|não quer|nao quer|stop|para/i.test(skipReason)) return true;
  return false;
}

function panelStatusMatches(status: string, f: PanelFilter): boolean {
  return panelStatusMatchesFull(status, null, f);
}

function panelStatusMatchesFull(status: string, skipReason: string | null, f: PanelFilter): boolean {
  if (f === "all") return true;
  if (f === "aguardando") return status === "pendente" || status === "na_fila";
  if (f === "enviados") return status === "enviado_abertura" || status === "enviado_d3" || status === "enviado_d7";
  if (f === "responderam") return status === "respondeu";
  if (f === "converteram") return status === "convertido";
  if (f === "nao_quer") return isNaoQuer(status, skipReason);
  if (f === "falhou") return status === "failed";
  return true;
}

function SummaryCard({ emoji, label, value, tone }: { emoji: string; label: string; value: number; tone: "primary" | "success" | "warn" | "danger" }) {
  const toneCls =
    tone === "success" ? "text-emerald-500" :
    tone === "warn" ? "text-amber-500" :
    tone === "danger" ? "text-red-500" : "text-primary";
  return (
    <div className="rounded-lg border border-border bg-card/60 p-3">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
        <span className="text-base leading-none">{emoji}</span>{label}
      </div>
      <div className={`mt-1 text-2xl font-semibold ${toneCls}`}>{value.toLocaleString("pt-BR")}</div>
    </div>
  );
}

function initials(name: string): string {
  const parts = (name || "?").trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

function fmtDT(iso: string | null): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("pt-BR"); } catch { return "—"; }
}

function ListsContactsPanel({ lists }: { lists: PanelListRow[] }) {
  const qc = useQueryClient();
  const skipFn = useServerFn(skipBlastContact);
  const blockFn = useServerFn(blockBlastContact);
  const bulkFn = useServerFn(bulkBlastAction);
  const setStateFn = useServerFn(setBlastCampaignState);

  // Sistema unificado: uma única visão com todos os contatos de todas as listas do usuário.
  const listIds = lists.map((l) => l.id);
  const totalContatos = lists.reduce((acc, l) => acc + l.total, 0);

  const [filter, setFilter] = useState<PanelFilter>("all");
  const [q, setQ] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const listCatsFn = useServerFn(listCategories);
  const { data: categories = [] } = useQuery({ queryKey: ["contact_categories"], queryFn: () => listCatsFn() });

  const { data: rows = [] } = useQuery({
    queryKey: ["panel_contacts", "unified", listIds.join(",")],
    enabled: listIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("blast_contacts")
        .select("id, nome, telefone, instagram, status, last_sent_at, replied_at, converted_at, ultima_interacao, error_message, sent_via_number_id, categoria_id, skip_reason, created_at")
        .in("contact_list_id", listIds)
        .order("updated_at", { ascending: false })
        .limit(2000);
      return (data ?? []) as PanelContactRow[];
    },
  });

  // Números do ZapAgent — nome usado na coluna "Abordado por"
  const { data: allNumbers = [] } = useQuery({
    queryKey: ["panel_numbers_list"],
    queryFn: async () => {
      const { data } = await supabase
        .from("whatsapp_numbers")
        .select("id, nome")
        .order("nome", { ascending: true });
      return (data ?? []) as Array<{ id: string; nome: string | null }>;
    },
  });
  const numbersMap: Record<string, string> = {};
  for (const n of allNumbers) numbersMap[n.id] = n.nome ?? "—";

  const { data: campaign } = useQuery({
    queryKey: ["panel_campaign_unified"],
    queryFn: async () => {
      // Busca a campanha mais recente do usuário (RLS já filtra por user_id).
      // Prioriza "rodando" → "pausado" → "parado".
      const { data } = await supabase
        .from("blast_campaigns")
        .select("id, name, contact_list_id, state, daily_limit, delay_min_sec, delay_max_sec, last_dispatch_at, opening_message")
        .order("updated_at", { ascending: false })
        .limit(20);
      const list = (data ?? []) as PanelCampaign[];
      const priority: Record<string, number> = { rodando: 0, pausado: 1, parado: 2 };
      list.sort((a, b) => (priority[a.state] ?? 9) - (priority[b.state] ?? 9));
      return list[0] ?? null;
    },
  });

  // Realtime — atualiza card de progresso quando a campanha mudar
  useEffect(() => {
    const ch = supabase
      .channel("panel_campaign_unified")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "blast_campaigns" },
        () => qc.invalidateQueries({ queryKey: ["panel_campaign_unified"] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  // Realtime — atualiza sem reload
  useEffect(() => {
    if (listIds.length === 0) return;
    const ch = supabase
      .channel(`panel_contacts_unified`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "blast_contacts" },
        () => qc.invalidateQueries({ queryKey: ["panel_contacts", "unified"] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [listIds.join(","), qc]);

  // Filtro + busca
  const term = q.trim().toLowerCase();
  const filtered = rows.filter((r) => {
    if (categoryFilter !== "all" && r.categoria_id !== categoryFilter) return false;
    if (!panelStatusMatchesFull(r.status, r.skip_reason, filter)) return false;
    if (!term) return true;
    return (
      r.nome?.toLowerCase().includes(term) ||
      r.telefone?.toLowerCase().includes(term) ||
      (r.instagram ?? "").toLowerCase().includes(term)
    );
  });

  // Contadores por categoria
  const countByCategory: Record<string, number> = {};
  for (const r of rows) {
    if (!r.categoria_id) continue;
    countByCategory[r.categoria_id] = (countByCategory[r.categoria_id] ?? 0) + 1;
  }

  const isActive = campaign?.state === "rodando";
  const dailyLimit = campaign?.daily_limit ?? 0;
  const sentToday = rows.filter((r) => {
    if (!r.last_sent_at) return false;
    const d = new Date(r.last_sent_at);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  }).length;
  const enviados = rows.filter((r) => r.status.startsWith("enviado_")).length;
  const responderam = rows.filter((r) => r.status === "respondeu").length;
  const converteram = rows.filter((r) => r.status === "convertido").length;
  const totalBase = rows.length;
  const faltamEnviar = rows.filter((r) => r.status === "pendente" || r.status === "na_fila").length;
  const naoQuer = rows.filter((r) => isNaoQuer(r.status, r.skip_reason)).length;
  const totalEnviados = rows.filter((r) => r.status.startsWith("enviado_") || r.status === "respondeu" || r.status === "convertido").length;
  const pct = dailyLimit > 0 ? Math.min(100, Math.round((sentToday / dailyLimit) * 100)) : 0;

  // Próximo na fila (primeiro "pendente")
  const nextInLine = rows.find((r) => r.status === "pendente") ?? null;
  const avgDelay = ((campaign?.delay_min_sec ?? 45) + (campaign?.delay_max_sec ?? 90)) / 2;
  const [nowTs, setNowTs] = useState(() => Date.now());
  useEffect(() => {
    if (!isActive) return;
    const t = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [isActive]);
  const nextInSec = (() => {
    if (!isActive || !campaign?.last_dispatch_at) return null;
    const eta = new Date(campaign.last_dispatch_at).getTime() + avgDelay * 1000;
    return Math.max(0, Math.round((eta - nowTs) / 1000));
  })();

  const conclusaoEta = (() => {
    if (!isActive || dailyLimit <= 0) return null;
    const restam = rows.filter((r) => r.status === "pendente").length;
    if (restam === 0) return null;
    const dias = Math.max(1, Math.ceil(restam / dailyLimit));
    const d = new Date();
    d.setDate(d.getDate() + (dias - 1));
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  })();

  const filterBtn = (v: PanelFilter, label: string) => (
    <button
      key={v}
      onClick={() => setFilter(v)}
      className={`rounded-full px-3 py-1 text-xs border ${
        filter === v
          ? "bg-primary text-primary-foreground border-primary"
          : "border-border bg-card text-muted-foreground hover:bg-muted"
      }`}
    >
      {label}
    </button>
  );

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };
  const allVisibleSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.id));
  const toggleAll = () => {
    setSelected((prev) => {
      if (allVisibleSelected) {
        const n = new Set(prev);
        for (const r of filtered) n.delete(r.id);
        return n;
      }
      const n = new Set(prev);
      for (const r of filtered) n.add(r.id);
      return n;
    });
  };
  const clearSelection = () => setSelected(new Set());

  async function runBulk(action: "queue" | "blacklist" | "delete") {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (action === "delete" && !confirm(`Excluir ${ids.length} contatos definitivamente?`)) return;
    if (action === "blacklist" && !confirm(`Mover ${ids.length} contatos para a blacklist?`)) return;
    setBulkBusy(true);
    try {
      const res = await bulkFn({ data: { ids, action } });
      toast.success(`${res.affected} contatos atualizados`);
      clearSelection();
      qc.invalidateQueries({ queryKey: ["panel_contacts", "unified"] });
    } catch (e) { toast.error((e as Error).message); }
    finally { setBulkBusy(false); }
  }

  function exportSelectedCsv(rowsToExport: PanelContactRow[], filename: string) {
    const header = "nome,telefone,instagram,status,skip_reason,last_sent_at,replied_at";
    const body = rowsToExport.map((r) =>
      [r.nome, r.telefone, r.instagram ?? "", r.status, r.skip_reason ?? "", r.last_sent_at ?? "", r.replied_at ?? ""]
        .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","),
    ).join("\n");
    const blob = new Blob([header + "\n" + body], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  async function startDispatchNow() {
    if (!campaign) { toast.error("Nenhuma campanha configurada para essa base"); return; }
    try {
      await setStateFn({ data: { id: campaign.id, state: "rodando" } });
      toast.success("Disparo iniciado — os contatos da fila serão abordados");
      qc.invalidateQueries({ queryKey: ["blast_campaigns"] });
      qc.invalidateQueries({ queryKey: ["panel_contacts", "unified"] });
    } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <div className="rounded-xl border border-border p-5 space-y-4" style={{ background: "var(--gradient-card)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Base de Contatos</h3>
        </div>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Tempo real</span>
      </div>

      {/* Cards de resumo (spec) */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryCard emoji="📋" label="Total na base" value={totalBase} tone="primary" />
        <SummaryCard emoji="📨" label="Enviados" value={totalEnviados} tone="success" />
        <SummaryCard emoji="⏳" label="Faltam enviar" value={faltamEnviar} tone="warn" />
        <SummaryCard emoji="🚫" label="Não quer receber" value={naoQuer} tone="danger" />
      </div>

      {/* Progresso da campanha */}
      {campaign && (
        <div
          className="relative overflow-hidden rounded-2xl border border-border/60 p-5 shadow-sm"
          style={{ background: "var(--gradient-card)" }}
        >
          {isActive && (
            <div className="pointer-events-none absolute -top-16 -right-16 h-40 w-40 rounded-full bg-emerald-500/20 blur-3xl" />
          )}
          <div className="relative space-y-4">
            {/* Header status */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span
                  className={`inline-flex h-2.5 w-2.5 rounded-full ${
                    isActive
                      ? "bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.15)] animate-pulse"
                      : campaign.state === "pausado"
                        ? "bg-amber-500"
                        : "bg-muted-foreground/50"
                  }`}
                />
                <span className="text-sm font-semibold tracking-tight">
                  {isActive ? "🚀 Disparando…" : campaign.state === "pausado" ? "⏸ Pausado" : "⏹ Parado"}
                </span>
                {campaign.state === "pausado" && (
                  <button
                    onClick={startDispatchNow}
                    className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold text-primary-foreground"
                    style={{ background: "var(--gradient-primary)" }}
                  >
                    <Play className="h-3 w-3" /> Retomar
                  </button>
                )}
              </div>
            </div>

            {/* Progresso — Limite diário */}
            <div>
              <div className="mb-1 flex items-center justify-between text-[11px]">
                <span className="font-medium text-muted-foreground">Limite diário</span>
                <span className="font-mono tabular-nums text-muted-foreground">
                  <span className="text-foreground font-bold">{sentToday}</span>
                  <span className="mx-1">de</span>
                  <span>{dailyLimit}</span>
                  <span className="ml-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">{pct}%</span>
                </span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted/60 ring-1 ring-inset ring-border/40">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${pct}%`,
                    background: "var(--gradient-primary)",
                    boxShadow: isActive ? "0 0 12px color-mix(in oklab, var(--primary) 50%, transparent)" : undefined,
                  }}
                />
              </div>
            </div>

            {/* Progresso — Base total abordada */}
            {(() => {
              const basePct = totalBase > 0 ? Math.min(100, Math.round((totalEnviados / totalBase) * 100)) : 0;
              return (
                <div>
                  <div className="mb-1 flex items-center justify-between text-[11px]">
                    <span className="font-medium text-muted-foreground">Base total abordada</span>
                    <span className="font-mono tabular-nums text-muted-foreground">
                      <span className="text-foreground font-bold">{totalEnviados}</span>
                      <span className="mx-1">de</span>
                      <span>{totalBase}</span>
                      <span className="ml-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-500">{basePct}%</span>
                    </span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted/60 ring-1 ring-inset ring-border/40">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                      style={{ width: `${basePct}%` }}
                    />
                  </div>
                </div>
              );
            })()}

            {/* Métricas em linha */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg border border-border/40 bg-background/40 py-2">
                <div className="text-sm font-bold text-emerald-500">✅ {totalEnviados}</div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Enviados</div>
              </div>
              <div className="rounded-lg border border-border/40 bg-background/40 py-2">
                <div className="text-sm font-bold text-sky-500">💬 {responderam}</div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Responderam</div>
              </div>
              <div className="rounded-lg border border-border/40 bg-background/40 py-2">
                <div className="text-sm font-bold text-primary">🎯 {converteram}</div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Converteram</div>
              </div>
            </div>

            {/* Rodapé com ETA */}
            {isActive && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-3 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  ⏱️ Próximo disparo em:
                  <span className="font-mono font-semibold text-foreground tabular-nums">
                    {nextInSec !== null ? `${Math.floor(nextInSec / 60)}m ${nextInSec % 60}s` : "—"}
                  </span>
                </span>
                {conclusaoEta && (
                  <span className="inline-flex items-center gap-1.5">
                    📅 Previsão de conclusão:
                    <span className="font-semibold text-foreground">{conclusaoEta}</span>
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Filtros por categoria */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setCategoryFilter("all")}
          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
            categoryFilter === "all"
              ? "border-primary/40 bg-primary/5 text-primary"
              : "border-border bg-card text-muted-foreground hover:bg-muted"
          }`}
        >
          <Users className="h-4 w-4" /> Todas as categorias
          <span className="ml-1 text-[10px] opacity-80">({rows.length || totalContatos})</span>
        </button>
        {categories.length === 0 && (
          <span className="text-[11px] text-muted-foreground">Nenhuma categoria cadastrada.</span>
        )}
        {categories.filter((c) => !c.slug?.startsWith("debug_")).map((c) => (
          <button
            key={c.id}
            onClick={() => setCategoryFilter(c.id)}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
              categoryFilter === c.id
                ? "border-primary/40 bg-primary/5 text-primary"
                : "border-border bg-card text-muted-foreground hover:bg-muted"
            }`}
          >
            {c.icone} {c.nome}
            <span className="ml-1 text-[10px] opacity-80">({countByCategory[c.id] ?? 0})</span>
          </button>
        ))}
      </div>

      {/* Próximo na fila */}
      {nextInLine && (
        <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-primary/5 p-4 shadow-sm">
          <div className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-primary via-primary/60 to-transparent" />
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold shadow-md">
              {initials(nextInLine.nome)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">Próximo</span>
                <span className="text-sm font-semibold">{nextInLine.nome}</span>
                {nextInLine.instagram && (
                  <span className="text-xs text-muted-foreground">@{String(nextInLine.instagram).replace(/^@/, "")}</span>
                )}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                ⏱️ Enviando em{" "}
                <span className="font-mono font-semibold text-foreground tabular-nums">
                  {nextInSec !== null ? `${Math.floor(nextInSec / 60)}m ${nextInSec % 60}s` : "aguardando janela"}
                </span>
              </div>
              {campaign?.opening_message && (
                <div className="mt-2 rounded-lg border border-border/40 bg-background/60 p-2.5 text-[11px] italic text-muted-foreground line-clamp-3">
                  "{campaign.opening_message.slice(0, 180)}{campaign.opening_message.length > 180 ? "…" : ""}"
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Filtros + busca */}
      <div className="flex flex-wrap items-center gap-2">
        {filterBtn("all", "Todos")}
        {filterBtn("aguardando", `⏳ Fila (${faltamEnviar})`)}
        {filterBtn("enviados", `✅ Enviados (${totalEnviados})`)}
        {filterBtn("responderam", `💬 Responderam (${responderam})`)}
        {filterBtn("converteram", `🛍️ Converteram (${converteram})`)}
        {filterBtn("nao_quer", `🚫 Não quer (${naoQuer})`)}
        {filterBtn("falhou", "❌ Falhou")}
        <div className="ml-auto relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar nome ou telefone"
            className="w-64 rounded-lg border border-border bg-background pl-7 pr-2 py-1.5 text-xs outline-none focus:border-primary"
          />
        </div>
      </div>

      {/* Ações por aba */}
      {filter === "aguardando" && faltamEnviar > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs">
          <Zap className="h-4 w-4 text-primary" />
          <span>{faltamEnviar} contatos aguardando abordagem.</span>
          <button
            onClick={startDispatchNow}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-primary-foreground"
            style={{ background: "var(--gradient-primary)" }}
          >
            <Play className="h-3.5 w-3.5" /> Iniciar disparo para esses contatos
          </button>
        </div>
      )}
      {filter === "nao_quer" && naoQuer > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs">
          <ShieldOff className="h-4 w-4 text-destructive" />
          <span>Blacklist com {naoQuer} contatos — nunca receberão mensagem.</span>
          <button
            onClick={() => exportSelectedCsv(rows.filter((r) => isNaoQuer(r.status, r.skip_reason)), `blacklist-${new Date().toISOString().slice(0,10)}.csv`)}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs hover:bg-muted"
          >
            <BarChart3 className="h-3.5 w-3.5" /> Exportar blacklist
          </button>
        </div>
      )}

      {/* Barra de ações em massa */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 p-2 text-xs">
          <span className="font-medium">{selected.size} selecionados</span>
          <button disabled={bulkBusy} onClick={() => runBulk("queue")} className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 hover:bg-muted disabled:opacity-50"><Repeat className="h-3.5 w-3.5" /> Mover para fila</button>
          <button disabled={bulkBusy} onClick={() => runBulk("blacklist")} className="inline-flex items-center gap-1 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1 text-destructive hover:bg-destructive/20 disabled:opacity-50"><ShieldOff className="h-3.5 w-3.5" /> Blacklist</button>
          <button disabled={bulkBusy} onClick={() => exportSelectedCsv(filtered.filter((r) => selected.has(r.id)), `contatos-selecionados-${Date.now()}.csv`)} className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 hover:bg-muted disabled:opacity-50"><BarChart3 className="h-3.5 w-3.5" /> Exportar</button>
          <button disabled={bulkBusy} onClick={() => runBulk("delete")} className="inline-flex items-center gap-1 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1 text-destructive hover:bg-destructive/20 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" /> Excluir</button>
          <button onClick={clearSelection} className="ml-auto text-muted-foreground hover:text-foreground">Limpar seleção</button>
        </div>
      )}

      {/* Tabela */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="w-8 px-2 py-2">
                <input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} className="accent-primary" />
              </th>
              <th className="px-3 py-2 text-left">Contato</th>
              <th className="px-3 py-2 text-left">Telefone</th>
              <th className="px-3 py-2 text-left">Instagram</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Abordado por</th>
              <th className="px-3 py-2 text-left">Enviado em</th>
              <th className="px-3 py-2 text-left">Última interação</th>
              <th className="px-3 py-2 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">
                  {rows.length === 0 ? "Nenhum contato na lista ainda." : "Nenhum contato corresponde aos filtros."}
                </td>
              </tr>
            )}
            {filtered.map((r) => {
              const meta = PANEL_STATUS[r.status] ?? { label: r.status, cls: "bg-muted text-muted-foreground", icon: "•" };
              const naoq = isNaoQuer(r.status, r.skip_reason);
              const displayMeta = naoq ? PANEL_STATUS.bloqueado : meta;
              const last = r.ultima_interacao ?? r.replied_at ?? r.converted_at ?? r.last_sent_at;
              return (
                <tr key={r.id} className="group border-t border-border hover:bg-muted/30">
                  <td className="px-2 py-2">
                    <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleOne(r.id)} className="accent-primary" />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-foreground">
                        {initials(r.nome)}
                      </div>
                      <span className="font-medium">{r.nome || "—"}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px]">{r.telefone}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.instagram || "—"}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ${displayMeta.cls}`} title={r.error_message ?? r.skip_reason ?? undefined}>
                      <span>{displayMeta.icon}</span>{displayMeta.label}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {r.sent_via_number_id ? (
                      <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[10px]">
                        📱 {numbersMap[r.sent_via_number_id] ?? "—"}
                      </span>
                    ) : (
                      <span className="text-[10px]">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{fmtDT(r.last_sent_at)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{fmtDT(last)}</td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1 opacity-0 transition group-hover:opacity-100">
                      <Link
                        to="/conversas"
                        title="Ver conversa"
                        className="rounded-md border border-border p-1 hover:bg-muted"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Link>
                      <button
                        title="Pular esse contato"
                        onClick={async () => {
                          try {
                            await skipFn({ data: { id: r.id } });
                            toast.success("Contato pulado");
                            qc.invalidateQueries({ queryKey: ["panel_contacts", "unified"] });
                          } catch (e) { toast.error((e as Error).message); }
                        }}
                        className="rounded-md border border-border p-1 hover:bg-muted"
                      >
                        <SkipForward className="h-3.5 w-3.5" />
                      </button>
                      <button
                        title="Bloquear"
                        onClick={async () => {
                          if (!confirm(`Bloquear ${r.nome || r.telefone}?`)) return;
                          try {
                            await blockFn({ data: { id: r.id, telefone: r.telefone } });
                            toast.success("Contato bloqueado");
                            qc.invalidateQueries({ queryKey: ["panel_contacts", "unified"] });
                          } catch (e) { toast.error((e as Error).message); }
                        }}
                        className="rounded-md border border-destructive/40 bg-destructive/10 p-1 text-destructive hover:bg-destructive/20"
                      >
                        <ShieldOff className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
        <ShoppingBag className="h-3 w-3" /> Status atualiza em tempo real conforme os disparos e respostas acontecem.
      </p>
    </div>
  );
}

function AddForm({
  onCancel,
  onSubmit,
  pending,
}: {
  onCancel: () => void;
  onSubmit: (v: {
    target_profile: ContactProfile;
    daily_volume: number;
    interval_minutes: number;
    start_time: string;
    end_time: string;
  }) => void;
  pending: boolean;
}) {
  const [target_profile, setProfile] = useState<ContactProfile>("frio");
  const [daily_volume, setVolume] = useState(30);
  const [interval_minutes, setInterval] = useState(3);
  const [start_time, setStart] = useState("09:00");
  const [end_time, setEnd] = useState("20:00");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ target_profile, daily_volume, interval_minutes, start_time, end_time });
      }}
      className="grid gap-3 rounded-xl border border-border p-5 md:grid-cols-5"
      style={{ background: "var(--gradient-card)" }}
    >
      <Field label="Perfil alvo">
        <select value={target_profile} onChange={(e) => setProfile(e.target.value as ContactProfile)}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none">
          {Object.entries(profileLabel).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </Field>
      <Field label="Volume/dia">
        <input type="number" min={1} max={1000} value={daily_volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none" />
      </Field>
      <Field label="Intervalo (min)">
        <input type="number" min={1} max={1440} value={interval_minutes}
          onChange={(e) => setInterval(Number(e.target.value))}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none" />
      </Field>
      <Field label="Início">
        <input type="time" value={start_time} onChange={(e) => setStart(e.target.value)}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none" />
      </Field>
      <Field label="Fim">
        <input type="time" value={end_time} onChange={(e) => setEnd(e.target.value)}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none" />
      </Field>
      <div className="md:col-span-5 flex gap-2">
        <button type="submit" disabled={pending}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          style={{ background: "var(--gradient-primary)" }}>
          {pending ? "Salvando…" : "Criar campanha"}
        </button>
        <button type="button" onClick={onCancel}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-muted">
          Cancelar
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function AutoCampaignsSection() {
  const qc = useQueryClient();
  const listAC = useServerFn(listAutoCampaigns);
  const updateAC = useServerFn(updateAutoCampaign);
  const { data: items = [] } = useQuery({ queryKey: ["auto_campaigns"], queryFn: () => listAC() });

  const updateMut = useMutation({
    mutationFn: (input: { id: string; enabled?: boolean; message_template?: string; trigger_hours?: number }) =>
      updateAC({ data: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["auto_campaigns"] }),
  });

  return (
    <section
      className="rounded-xl border border-border p-5"
      style={{ background: "var(--gradient-card)" }}
    >
      <div className="flex items-center gap-2">
        <Repeat className="h-5 w-5 text-primary" />
        <h2 className="font-semibold">Régua de relacionamento automática</h2>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Follow-ups automáticos após compra, inatividade e teste grátis. Use <code>{`{nome}`}</code> para personalizar.
      </p>
      <div className="mt-4 space-y-3">
        {items.map((c) => (
          <AutoCampaignRow
            key={c.id}
            item={c}
            onSave={(payload) => updateMut.mutate({ id: c.id, ...payload })}
          />
        ))}
      </div>
    </section>
  );
}

type AutoCampaignItem = {
  id: string;
  key: string;
  name: string;
  trigger_type: string;
  trigger_hours: number;
  message_template: string;
  enabled: boolean;
};

function AutoCampaignRow({
  item,
  onSave,
}: {
  item: AutoCampaignItem;
  onSave: (payload: { enabled?: boolean; message_template?: string; trigger_hours?: number }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState(item.message_template);
  const [hours, setHours] = useState(item.trigger_hours);
  useEffect(() => {
    setMsg(item.message_template);
    setHours(item.trigger_hours);
  }, [item.message_template, item.trigger_hours]);

  return (
    <div className="rounded-lg border border-border bg-background/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">{item.name}</h3>
          <p className="text-xs text-muted-foreground">
            Dispara {item.trigger_hours}h após {labelForTrigger(item.trigger_type)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setOpen((o) => !o)}
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs hover:bg-muted"
          >
            {open ? "Fechar" : "Editar"}
          </button>
          <label className="inline-flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={item.enabled}
              onChange={(e) => onSave({ enabled: e.target.checked })}
              className="h-4 w-4"
            />
            <span className={item.enabled ? "text-success" : "text-muted-foreground"}>
              {item.enabled ? "Ativa" : "Inativa"}
            </span>
          </label>
        </div>
      </div>
      {open && (
        <div className="mt-3 space-y-2">
          <Field label="Disparar após (horas)">
            <input
              type="number"
              min={1}
              max={24 * 365}
              value={hours}
              onChange={(e) => setHours(Number(e.target.value))}
              className="w-32 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
            />
          </Field>
          <Field label="Mensagem">
            <textarea
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-border bg-background p-3 text-sm outline-none focus:border-primary"
            />
          </Field>
          <PreviewButton template={msg} />
          <button
            onClick={() => onSave({ message_template: msg, trigger_hours: hours })}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-primary-foreground"
            style={{ background: "var(--gradient-primary)" }}
          >
            Salvar
          </button>
        </div>
      )}
    </div>
  );
}

function labelForTrigger(t: string): string {
  if (t === "after_purchase") return "a compra";
  if (t === "inactive") return "última interação (inatividade)";
  if (t === "after_free_trial") return "o teste grátis entregue";
  return t;
}

type BlastCampaign = {
  id: string;
  name: string;
  whatsapp_number_id: string | null;
  contact_list_id: string | null;
  categoria_ids?: string[] | null;
  start_time: string;
  end_time: string;
  daily_limit: number;
  delay_min_sec: number;
  delay_max_sec: number;
  opening_message: string;
  followup_day3_message: string;
  followup_day7_message: string;
  state: "parado" | "rodando" | "pausado";
  dispatch_mode?: "agente_livre" | "fluxo_visual" | null;
};

type CsvRow = {
  nome: string;
  telefone: string;
  instagram: string;
  prioridade?: number;
  ultima_interacao?: string;
};

function parseCsv(text: string): CsvRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const delim = lines[0].includes(";") && !lines[0].includes(",") ? ";" : ",";
  const header = lines[0].split(delim).map((h) => h.trim().toLowerCase());
  const iNome = header.indexOf("nome");
  const iTel = header.indexOf("telefone");
  const iIg = header.indexOf("instagram");
  const iPrio = header.indexOf("prioridade");
  const iUlt = header.indexOf("ultima_interacao");
  const start = iNome >= 0 || iTel >= 0 ? 1 : 0;
  const rows: CsvRow[] = [];
  for (let i = start; i < lines.length; i++) {
    const cols = lines[i].split(delim).map((c) => c.trim());
    const nome = (iNome >= 0 ? cols[iNome] : cols[0]) ?? "";
    const telefone = (iTel >= 0 ? cols[iTel] : cols[1]) ?? "";
    const instagram = (iIg >= 0 ? cols[iIg] : cols[2]) ?? "";
    const prioRaw = iPrio >= 0 ? cols[iPrio] : "";
    const ultRaw = iUlt >= 0 ? cols[iUlt] : "";
    const prioridade = prioRaw && /^\d+$/.test(prioRaw) ? Number(prioRaw) : undefined;
    const ultima_interacao = /^\d{4}-\d{2}-\d{2}$/.test(ultRaw) ? ultRaw : undefined;
    if (nome && telefone) rows.push({ nome, telefone, instagram, prioridade, ultima_interacao });
  }
  return rows;
}

function BlastSection() {
  const qc = useQueryClient();
  const listBC = useServerFn(listBlastCampaigns);
  const listN = useServerFn(listNumbers);
  const { data: blastCampaigns = [] } = useQuery({
    queryKey: ["blast_campaigns"],
    queryFn: () => listBC(),
  });
  const { data: numbers = [] } = useQuery({ queryKey: ["whatsapp_numbers"], queryFn: () => listN() });

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <Send className="h-5 w-5 text-primary" />
        <h2 className="font-semibold">Disparos Ativos</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Campanhas de outbound com follow-ups automáticos D3 e D7. Quando o lead responder, o agente Júlia
        assume a conversa normalmente.
      </p>
      {blastCampaigns.map((c) => (
        <BlastCampaignCard
          key={c.id}
          camp={c as BlastCampaign}
          numbers={numbers as Array<{ id: string; nome: string }>}
          onChanged={() => qc.invalidateQueries({ queryKey: ["blast_campaigns"] })}
        />
      ))}
    </section>
  );
}

function BlastCampaignCard({
  camp,
  numbers,
  onChanged,
}: {
  camp: BlastCampaign;
  numbers: Array<{ id: string; nome: string; warmup_started_at?: string | null; warmup_enabled?: boolean | null; disparos_mode?: boolean | null }>;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateBlastCampaign);
  const stateFn = useServerFn(setBlastCampaignState);
  const importFn = useServerFn(importBlastContacts);
  const listContactsFn = useServerFn(listBlastContacts);
  const clearFn = useServerFn(clearBlastContacts);
  const testFn = useServerFn(testBlastCampaign);

  const [whatsapp_number_id, setNum] = useState<string>(camp.whatsapp_number_id ?? "");
  const [contact_list_id, setListId] = useState<string>(camp.contact_list_id ?? "");
  const listListsFn = useServerFn(listContactLists);
  const { data: lists = [] } = useQuery({ queryKey: ["contact_lists"], queryFn: () => listListsFn() });
  const listCatsFn = useServerFn(listCategories);
  const { data: categories = [] } = useQuery({ queryKey: ["contact_categories"], queryFn: () => listCatsFn() });
  const [categoria_ids, setCategoriaIds] = useState<string[]>(camp.categoria_ids ?? []);
  const toggleCategoria = (id: string) =>
    setCategoriaIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const [start_time, setStart] = useState(camp.start_time.slice(0, 5));
  const [end_time, setEnd] = useState(camp.end_time.slice(0, 5));
  const [daily_limit, setLimit] = useState(camp.daily_limit);
  const [delay_min_sec, setMin] = useState(camp.delay_min_sec);
  const [delay_max_sec, setMax] = useState(camp.delay_max_sec);
  const [opening_message, setOpening] = useState(camp.opening_message);
  const [followup_day3_message, setD3] = useState(camp.followup_day3_message);
  const [followup_day7_message, setD7] = useState(camp.followup_day7_message);
  const [dispatch_mode, setDispatchMode] = useState<"agente_livre" | "fluxo_visual">(
    (camp.dispatch_mode as "agente_livre" | "fluxo_visual") ?? "agente_livre",
  );
  const [csvRows, setCsvRows] = useState<CsvRow[]>([]);
  const [csvName, setCsvName] = useState<string>("");
  const [testPhone, setTestPhone] = useState("");
  const [importSummary, setImportSummary] = useState<
    { inserted: number; removed: { duplicates: number; invalid: number; blocked: number } } | null
  >(null);

  const { data: contacts = [] } = useQuery({
    queryKey: ["blast_contacts", camp.id],
    queryFn: () => listContactsFn({ data: { campaignId: camp.id } }),
  });
  // Realtime: refresca lista de contatos quando o dispatcher atualiza qualquer status
  useEffect(() => {
    const ch = supabase
      .channel(`blast_contacts_rt_${camp.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "blast_contacts", filter: `campaign_id=eq.${camp.id}` },
        () => {
          qc.invalidateQueries({ queryKey: ["blast_contacts", camp.id] });
          qc.invalidateQueries({ queryKey: ["blast_report", camp.id] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [camp.id, qc]);

  const saveMut = useMutation({
    mutationFn: () =>
      updateFn({
        data: {
          id: camp.id,
          whatsapp_number_id: whatsapp_number_id || null,
          contact_list_id: contact_list_id || null,
          categoria_ids,
          start_time,
          end_time,
          daily_limit,
          delay_min_sec,
          delay_max_sec,
          opening_message,
          followup_day3_message,
          followup_day7_message,
          dispatch_mode,
        },
      }),
    onSuccess: onChanged,
  });
  const stateMut = useMutation({
    mutationFn: (state: "rodando" | "pausado" | "parado") =>
      stateFn({ data: { id: camp.id, state } }),
    onSuccess: onChanged,
  });
  const importMut = useMutation({
    mutationFn: () => importFn({ data: { campaignId: camp.id, rows: csvRows } }),
    onSuccess: (res) => {
      setCsvRows([]);
      setCsvName("");
      setImportSummary(res as never);
      qc.invalidateQueries({ queryKey: ["blast_contacts", camp.id] });
      qc.invalidateQueries({ queryKey: ["blast_report", camp.id] });
    },
  });
  const testMut = useMutation({
    mutationFn: () => testFn({ data: { campaignId: camp.id, phone: testPhone } }),
    onSuccess: () => {
      alert("Mensagem de teste enviada com sucesso! Verifique o WhatsApp do número informado.");
    },
    onError: (e: Error) => alert(`Falhou: ${e.message}`),
  });
  const clearMut = useMutation({
    mutationFn: () => clearFn({ data: { campaignId: camp.id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["blast_contacts", camp.id] });
      qc.invalidateQueries({ queryKey: ["blast_report", camp.id] });
    },
  });

  const selectedNumber = numbers.find((n) => n.id === whatsapp_number_id);
  const pendingContacts = contacts.filter((c) => c.status === "pendente").length;

  function effectiveLimitFromNumber(): number {
    const cfg = Math.max(1, Math.min(daily_limit ?? 200, 200));
    if (!selectedNumber?.warmup_enabled || !selectedNumber?.warmup_started_at) return cfg;
    const day = Math.floor((Date.now() - new Date(selectedNumber.warmup_started_at).getTime()) / 86400000) + 1;
    if (day === 1) return Math.min(50, cfg);
    if (day === 2) return Math.min(100, cfg);
    if (day === 3) return Math.min(150, cfg);
    return Math.min(200, cfg);
  }

  function handleStart() {
    if (pendingContacts >= 100) {
      const limit = effectiveLimitFromNumber();
      const days = Math.max(1, Math.ceil(pendingContacts / Math.max(1, limit)));
      const ok = confirm(
        `Você está prestes a disparar para ${pendingContacts} contatos.\n` +
          `Isso será feito ao longo de ~${days} dia(s) respeitando o limite diário (${limit}/dia).\n\n` +
          `Confirma o início?`,
      );
      if (!ok) return;
    }
    // Validações pré-disparo (feedback imediato ao usuário)
    if (!selectedNumber) {
      toast.error("Selecione um número de WhatsApp antes de iniciar.");
      return;
    }
    if (pendingContacts === 0) {
      toast.error("Nenhum contato com status 'pendente' na lista vinculada. Importe contatos antes de iniciar.");
      return;
    }
    console.log(`[Disparo] Iniciando disparo para ${pendingContacts} contatos — campanha "${camp.name}" via ${selectedNumber.nome ?? selectedNumber.id.slice(0, 6)}`);
    updateFn({
      data: {
        id: camp.id,
        whatsapp_number_id: whatsapp_number_id || null,
        contact_list_id: contact_list_id || null,
        categoria_ids,
        start_time,
        end_time,
        daily_limit,
        delay_min_sec,
        delay_max_sec,
        opening_message,
        followup_day3_message,
        followup_day7_message,
        dispatch_mode,
      },
    }).then(() => stateMut.mutate("rodando", {
      onSuccess: async () => {
        // Dispara imediatamente sem esperar o cron (1 min).
        try {
          console.log("[Disparo] Chamando dispatcher agora…");
          const r = await fetch("/api/public/hooks/blast-dispatcher", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ campaignId: camp.id, now: true }),
          });
          if (!r.ok) throw new Error(await r.text());
          const j = (await r.json().catch(() => null)) as { results?: Array<{ campaign: string; sent: number; skipped?: string; error?: string }> } | null;
          const mine = j?.results?.find((x) => x.campaign === camp.name);
          if (mine?.sent) {
            console.log(`[Disparo] Enviado com sucesso via dispatcher (${mine.skipped ?? ""})`);
            toast.success("Primeira mensagem enviada!");
          } else {
            console.log(`[Disparo] Dispatcher retornou sem envio: ${mine?.skipped ?? "sem detalhes"}`);
            toast.error(`Disparo não enviado: ${mine?.error ?? mine?.skipped ?? "sem detalhes"}. Veja Logs → 🚀 Disparo.`);
          }
          qc.invalidateQueries({ queryKey: ["blast_contacts", camp.id] });
          qc.invalidateQueries({ queryKey: ["blast_report", camp.id] });
          qc.invalidateQueries({ queryKey: ["panel_contacts"] });
        } catch (e) {
          console.error("[Disparo] Falha ao chamar dispatcher:", e);
          toast.error(`Falha ao iniciar: ${(e as Error).message}`);
        }
      },
    })).catch((e: Error) => toast.error(`Falha ao salvar campanha antes de iniciar: ${e.message}`));
  }

  async function handleStartNow() {
    console.log("[Disparo Agora] clique registrado", { campId: camp.id, whatsapp_number_id, contact_list_id });
    if (!selectedNumber) {
      toast.error("Selecione um número de WhatsApp antes de disparar.");
      return;
    }
    // OBS: não usamos window.confirm() aqui — o preview do Lovable roda em
    // iframe cross-origin e o Chrome bloqueia dialogs modais nesse contexto
    // (o confirm retorna false silenciosamente e o botão parecia "não fazer nada").
    toast.message("Disparando agora…", { description: "Enviando 1 mensagem para o próximo contato elegível." });
    try {
      await updateFn({
        data: {
          id: camp.id,
          whatsapp_number_id: whatsapp_number_id || null,
          contact_list_id: contact_list_id || null,
          categoria_ids,
          start_time,
          end_time,
          daily_limit,
          delay_min_sec,
          delay_max_sec,
          opening_message,
          followup_day3_message,
          followup_day7_message,
          dispatch_mode,
        },
      });
      // Garante que a campanha esteja rodando (senão dispatcher ignora).
      await stateFn({ data: { id: camp.id, state: "rodando" } });
      const r = await fetch("/api/public/hooks/blast-dispatcher", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: camp.id, now: true }),
      });
      if (!r.ok) throw new Error(await r.text());
      const j = (await r.json().catch(() => null)) as { results?: Array<{ campaign: string; sent: number; skipped?: string; error?: string }> } | null;
      const mine = j?.results?.find((x) => x.campaign === camp.name);
      if (mine?.sent) toast.success(`Enviado agora! (${mine.skipped ?? ""})`);
      else toast.error(`Disparo não enviado: ${mine?.error ?? mine?.skipped ?? "sem detalhes"}. Veja Logs → 🚀 Disparo.`);
      onChanged();
      qc.invalidateQueries({ queryKey: ["blast_contacts", camp.id] });
      qc.invalidateQueries({ queryKey: ["panel_contacts"] });
    } catch (e) {
      toast.error(`Falha ao disparar agora: ${(e as Error).message}`);
    }
  }

  return (
    <div className="rounded-xl border border-border p-5 space-y-5" style={{ background: "var(--gradient-card)" }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-lg">{camp.name}</h3>
          <p className="text-xs text-muted-foreground">
            Estado:{" "}
            <span
              className={
                camp.state === "rodando"
                  ? "text-success font-medium"
                  : camp.state === "pausado"
                    ? "text-warning font-medium"
                    : "text-muted-foreground"
              }
            >
              {camp.state}
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleStart}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-primary-foreground"
            style={{ background: "var(--gradient-primary)" }}
          >
            <Play className="h-3.5 w-3.5" /> Iniciar
          </button>
          <button
            type="button"
            onClick={handleStartNow}
            className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20"
            title="Dispara AGORA ignorando horário, distribuição natural e delay entre envios"
          >
            ⚡ Disparar Agora
          </button>
          <button
            type="button"
            onClick={() => stateMut.mutate("pausado")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs hover:bg-muted"
          >
            <Pause className="h-3.5 w-3.5" /> Pausar
          </button>
          <button
            type="button"
            onClick={() => stateMut.mutate("parado")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs hover:bg-muted"
          >
            <Square className="h-3.5 w-3.5" /> Parar
          </button>
        </div>
      </div>

      {whatsapp_number_id && <NumberHealthCard numberId={whatsapp_number_id} />}

      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        <Field label="Número">
          <select
            value={whatsapp_number_id}
            onChange={(e) => setNum(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
          >
            <option value="">Selecione…</option>
            {numbers.map((n) => (
              <option key={n.id} value={n.id}>
                {n.nome}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Início">
          <input
            type="time"
            value={start_time}
            onChange={(e) => setStart(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
          />
        </Field>
        <Field label="Fim">
          <input
            type="time"
            value={end_time}
            onChange={(e) => setEnd(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
          />
        </Field>
        <Field label="Limite/dia">
          <input
            type="number"
            value={daily_limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
          />
        </Field>
        <Field label="Delay min (s)">
          <input
            type="number"
            value={delay_min_sec}
            onChange={(e) => setMin(Number(e.target.value))}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
          />
        </Field>
        <Field label="Delay max (s)">
          <input
            type="number"
            value={delay_max_sec}
            onChange={(e) => setMax(Number(e.target.value))}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
          />
        </Field>
      </div>

      {/* Base de contatos (categorias) — full width para não quebrar o grid */}
      <div className="rounded-lg border border-border bg-card/40 p-3 space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <p className="text-sm font-medium">Base de contatos</p>
            <p className="text-[11px] text-muted-foreground">
              Selecione uma ou mais categorias que serão abordadas por esta campanha.
            </p>
          </div>
          {categoria_ids.length > 0 && (
            <span className="text-[11px] text-muted-foreground">
              {categoria_ids.length} selecionada{categoria_ids.length > 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {categories.length === 0 && (
            <span className="text-xs text-muted-foreground px-1 py-1">
              Nenhuma categoria cadastrada.
            </span>
          )}
          {categories.map((c) => {
            const on = categoria_ids.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggleCategoria(c.id)}
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition ${
                  on
                    ? "border-primary bg-primary/15 text-foreground"
                    : "border-border bg-card text-muted-foreground hover:bg-muted"
                }`}
              >
                <span>{c.icone}</span>
                <span>{c.nome}</span>
                {on && <span className="text-primary">✓</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        <VariationInfoCard />
        <div className="rounded-lg border border-border bg-card/50 p-4 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h4 className="font-semibold text-sm">Modo do disparo</h4>
              <p className="text-xs text-muted-foreground">
                Escolha como a campanha conduz o lead depois que ele responder à abertura.
              </p>
            </div>
            <div className="inline-flex rounded-full border border-border overflow-hidden text-xs">
              <button
                type="button"
                onClick={() => setDispatchMode("agente_livre")}
                className={`px-3 py-1.5 ${dispatch_mode === "agente_livre" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted"}`}
              >
                🎯 Agente Livre
              </button>
              <button
                type="button"
                onClick={() => setDispatchMode("fluxo_visual")}
                className={`px-3 py-1.5 border-l border-border ${dispatch_mode === "fluxo_visual" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted"}`}
              >
                🔀 Fluxo Visual
              </button>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {dispatch_mode === "agente_livre"
              ? "O sistema envia apenas a mensagem de abertura. Quando o cliente responder, a agente Júlia assume 100% e conduz a conversa livremente (entende nicho → apresenta serviço → informa preço → oferece teste → fecha venda), usando mídias apenas quando fizer sentido."
              : "Usa o construtor de fluxo visual com etapas rígidas e previsíveis. Bom quando você quer controlar exatamente cada passo após a abertura."}
          </p>
        </div>
        {dispatch_mode === "fluxo_visual" ? <BlastFlowBuilder campaignId={camp.id} /> : null}
        <button
          onClick={() => saveMut.mutate()}
          disabled={saveMut.isPending}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          style={{ background: "var(--gradient-primary)" }}
        >
          {saveMut.isPending ? "Salvando…" : "Salvar configurações"}
        </button>
      </div>


      <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-2">
        <h4 className="font-semibold text-sm">Testar com meu número</h4>
        <p className="text-xs text-muted-foreground">
          Envia apenas a mensagem de abertura (com <code>{`{nome}`}</code> = "Teste") para um número, sem contar no limite diário nem afetar a lista.
        </p>
        <div className="flex gap-2">
          <input
            value={testPhone}
            onChange={(e) => setTestPhone(e.target.value)}
            placeholder="5511999999999"
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
          />
          <button
            onClick={() => testMut.mutate()}
            disabled={testMut.isPending || testPhone.trim().length < 8}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
            style={{ background: "var(--gradient-primary)" }}
          >
            {testMut.isPending ? "Enviando…" : "Enviar teste"}
          </button>
        </div>
      </div>

    </div>
  );
}

type BlastContactRow = {
  id: string;
  nome: string;
  telefone: string;
  instagram: string | null;
  status: string;
  last_sent_at: string | null;
  replied_at: string | null;
};

type StatusFilter = "todos" | "aguardando" | "enviados" | "responderam" | "converteram" | "falhou";

const STATUS_META: Record<string, { label: string; cls: string }> = {
  pendente: { label: "⬜ Aguardando", cls: "bg-muted text-muted-foreground" },
  na_fila: { label: "🟡 Na fila", cls: "bg-warning/20 text-warning" },
  enviado_abertura: { label: "✅ Enviado", cls: "bg-success/20 text-success" },
  enviado_d3: { label: "✅ Enviado D3", cls: "bg-success/20 text-success" },
  enviado_d7: { label: "✅ Enviado D7", cls: "bg-success/20 text-success" },
  respondeu: { label: "💬 Respondeu", cls: "bg-primary/20 text-primary" },
  convertido: { label: "✅ Converteu", cls: "bg-purple-500/20 text-purple-400" },
  falhou: { label: "❌ Falhou", cls: "bg-destructive/20 text-destructive" },
  bloqueado: { label: "🚫 Bloqueado", cls: "bg-destructive/20 text-destructive" },
  pulado: { label: "⏭️ Pulado", cls: "bg-muted/60 text-muted-foreground" },
  duplicado: { label: "⏭️ Duplicado", cls: "bg-muted/60 text-muted-foreground" },
};

function matchesFilter(status: string, f: StatusFilter): boolean {
  if (f === "todos") return true;
  if (f === "aguardando") return status === "pendente" || status === "na_fila";
  if (f === "enviados") return status === "enviado_abertura" || status === "enviado_d3" || status === "enviado_d7";
  if (f === "responderam") return status === "respondeu";
  if (f === "converteram") return status === "convertido";
  if (f === "falhou") return status === "falhou" || status === "bloqueado";
  return true;
}

function ContactsRealtimeTable({ contacts }: { contacts: BlastContactRow[] }) {
  const [filter, setFilter] = useState<StatusFilter>("todos");
  const filtered = contacts.filter((c) => matchesFilter(c.status, filter));
  const filters: { id: StatusFilter; label: string }[] = [
    { id: "todos", label: "Todos" },
    { id: "aguardando", label: "Aguardando" },
    { id: "enviados", label: "Enviados" },
    { id: "responderam", label: "Responderam" },
    { id: "converteram", label: "Converteram" },
    { id: "falhou", label: "Falhou" },
  ];

  return (
    <div className="rounded-lg border border-border bg-background/50 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-semibold text-sm">Contatos em tempo real</h4>
        <div className="flex flex-wrap gap-1.5">
          {filters.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`rounded-full px-2.5 py-1 text-xs transition ${
                filter === f.id
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <div className="max-h-[420px] overflow-auto rounded-md border border-border">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 text-muted-foreground sticky top-0">
            <tr>
              <th className="px-2 py-2 text-left font-medium">Nome</th>
              <th className="px-2 py-2 text-left font-medium">Telefone</th>
              <th className="px-2 py-2 text-left font-medium">Instagram</th>
              <th className="px-2 py-2 text-left font-medium">Status</th>
              <th className="px-2 py-2 text-left font-medium">Enviado em</th>
              <th className="px-2 py-2 text-left font-medium">Respondeu</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-2 py-6 text-center text-muted-foreground">
                  Nenhum contato neste filtro.
                </td>
              </tr>
            )}
            {filtered.map((c) => {
              const meta = STATUS_META[c.status] ?? { label: c.status, cls: "bg-muted text-muted-foreground" };
              return (
                <tr key={c.id} className="border-t border-border hover:bg-muted/20">
                  <td className="px-2 py-1.5">{c.nome}</td>
                  <td className="px-2 py-1.5 tabular-nums">{c.telefone}</td>
                  <td className="px-2 py-1.5">{c.instagram ? `@${c.instagram}` : "—"}</td>
                  <td className="px-2 py-1.5">
                    <span className={`inline-flex rounded-full px-2 py-0.5 ${meta.cls}`}>{meta.label}</span>
                  </td>
                  <td className="px-2 py-1.5 tabular-nums text-muted-foreground">
                    {c.last_sent_at ? new Date(c.last_sent_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—"}
                  </td>
                  <td className="px-2 py-1.5 tabular-nums text-muted-foreground">
                    {c.replied_at ? new Date(c.replied_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReportCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-border bg-background/50 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-bold mt-1">{value}</p>
    </div>
  );
}

function NumbersCard() {
  const qc = useQueryClient();
  const listN = useServerFn(listNumbers);
  const updT = useServerFn(updateNumberToggles);
  const { data: numbers = [] } = useQuery({ queryKey: ["whatsapp_numbers"], queryFn: () => listN() });

  const toggleMut = useMutation({
    mutationFn: (input: { id: string; disparos_mode?: boolean; warmup_enabled?: boolean; auto_pause_on_risk?: boolean }) =>
      updT({ data: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["whatsapp_numbers"] }),
  });

  // Campanhas rodando (por número) — leitura pura, apenas para exibição.
  const { data: runningCampaigns = [] } = useQuery({
    queryKey: ["numbers_card_running_campaigns"],
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("blast_campaigns")
        .select("id, name, state, whatsapp_number_id")
        .eq("state", "rodando");
      return (data ?? []) as Array<{ id: string; name: string; state: string; whatsapp_number_id: string | null }>;
    },
  });
  const runningByNumber: Record<string, string> = {};
  for (const c of runningCampaigns) {
    if (c.whatsapp_number_id && !runningByNumber[c.whatsapp_number_id]) {
      runningByNumber[c.whatsapp_number_id] = c.name;
    }
  }

  // Métricas ao vivo por número (disparos hoje + última msg) — apenas leitura.
  const { data: liveStats = {} } = useQuery({
    queryKey: ["numbers_card_live_stats"],
    refetchInterval: 20_000,
    queryFn: async () => {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const { data } = await supabase
        .from("blast_contacts")
        .select("sent_via_number_id, last_sent_at")
        .not("sent_via_number_id", "is", null)
        .not("last_sent_at", "is", null)
        .gte("last_sent_at", startOfDay.toISOString())
        .order("last_sent_at", { ascending: false })
        .limit(2000);
      const stats: Record<string, { count: number; last: string | null }> = {};
      for (const r of (data ?? []) as Array<{ sent_via_number_id: string | null; last_sent_at: string | null }>) {
        if (!r.sent_via_number_id) continue;
        const s = stats[r.sent_via_number_id] ?? { count: 0, last: null };
        s.count += 1;
        if (!s.last || (r.last_sent_at && r.last_sent_at > s.last)) s.last = r.last_sent_at;
        stats[r.sent_via_number_id] = s;
      }
      return stats;
    },
  });

  const relTime = (iso: string | null): string => {
    if (!iso) return "—";
    const diff = Math.max(0, Date.now() - new Date(iso).getTime());
    const min = Math.floor(diff / 60000);
    if (min < 1) return "agora";
    if (min < 60) return `há ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `há ${h}h`;
    const d = Math.floor(h / 24);
    return `há ${d}d`;
  };

  return (
    <section
      className="rounded-xl border border-border p-5"
      style={{ background: "var(--gradient-card)" }}
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">Números do ZapAgent</h2>
          <p className="text-xs text-muted-foreground">
            Qualquer número conectado pode rodar campanhas de disparo — não há
            mais dedicação exclusiva. O rótulo "Modo Disparos" fica só como
            marcação visual (o aquecimento e o round-robin usam todos os
            números conectados).
          </p>
        </div>
      </div>
      {numbers.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
          Nenhum número cadastrado. Adicione em <strong>Números</strong>.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {numbers.map((n: {
            id: string;
            nome: string;
            status: string;
            disparos_mode?: boolean;
            warmup_started_at?: string | null;
            warmup_enabled?: boolean | null;
            auto_pause_on_risk?: boolean | null;
            risk_level?: string | null;
          }) => {
            const active = !!n.disparos_mode;
            const connected = n.status === "conectado";
            const day = n.warmup_started_at
              ? Math.floor((Date.now() - new Date(n.warmup_started_at).getTime()) / 86400000) + 1
              : 0;
            const todayLimit = !n.warmup_enabled
              ? 200
              : day <= 0
                ? 50
                : day === 1
                  ? 50
                  : day === 2
                    ? 100
                    : day === 3
                      ? 150
                      : 200;
            const runningName = runningByNumber[n.id];
            const stats = liveStats[n.id];
            return (
              <div
                key={n.id}
                className={`rounded-lg border p-4 transition-colors ${active ? "border-2 border-primary bg-primary/5" : "border border-border bg-background/40"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold truncate">{n.nome}</p>
                    <p className="text-xs mt-0.5">
                      <span className={connected ? "text-emerald-500" : "text-muted-foreground"}>
                        ● {connected ? "Conectado" : n.status}
                      </span>
                    </p>
                    {runningName ? (
                      <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-foreground">
                        <Zap className="h-3 w-3" /> Rodando: {runningName}
                      </span>
                    ) : active ? (
                      <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        Disponível
                      </span>
                    ) : null}
                  </div>
                  <Switch
                    checked={active}
                    disabled={toggleMut.isPending}
                    onCheckedChange={(v) => toggleMut.mutate({ id: n.id, disparos_mode: v })}
                    aria-label={active ? "Desativar para disparo" : "Ativar para disparo"}
                  />
                </div>
                {active && (
                  <div className="mt-3 grid grid-cols-2 gap-2 rounded-md bg-background/60 p-2 text-xs">
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Disparos hoje</p>
                      <p className="font-semibold">{stats?.count ?? 0}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Última msg</p>
                      <p className="font-semibold">{relTime(stats?.last ?? null)}</p>
                    </div>
                  </div>
                )}
                <div
                  className={`mt-3 space-y-2 border-t border-border pt-3 text-xs transition-opacity ${active ? "opacity-100" : "opacity-40 pointer-events-none"}`}
                  aria-disabled={!active}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Aquecimento</span>
                    <span className="font-medium">
                      {n.warmup_enabled ? (day === 0 ? "ainda não iniciou" : `Dia ${day} — ${todayLimit}/dia`) : "desativado"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Aquecimento progressivo</span>
                    <Switch
                      checked={!!n.warmup_enabled}
                      disabled={!active || toggleMut.isPending}
                      onCheckedChange={(v) => toggleMut.mutate({ id: n.id, warmup_enabled: v })}
                      aria-label="Aquecimento progressivo"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Pausar auto se houver risco</span>
                    <Switch
                      checked={!!n.auto_pause_on_risk}
                      disabled={!active || toggleMut.isPending}
                      onCheckedChange={(v) => toggleMut.mutate({ id: n.id, auto_pause_on_risk: v })}
                      aria-label="Pausar auto se houver risco"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function NumberHealthCard({ numberId }: { numberId: string }) {
  const healthFn = useServerFn(getNumberHealth);
  const { data: health } = useQuery({
    queryKey: ["number_health", numberId],
    queryFn: () => healthFn({ data: { numberId } }),
    refetchInterval: 60_000,
  });
  if (!health) return null;
  const danger = health.risk_level === "danger";
  const warning = health.risk_level === "warning";
  return (
    <div className="space-y-2">
      {danger && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            ⚠️ Número com sinais de risco — recomendamos pausar o disparo por algumas horas.
            {health.auto_pause_on_risk && " A pausa automática está ativada e será aplicada no próximo ciclo."}
          </p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-background/50 p-4 md:grid-cols-4">
        <div>
          <p className="text-xs text-muted-foreground">Saúde do número</p>
          <p
            className={`mt-1 text-sm font-semibold ${
              danger ? "text-destructive" : warning ? "text-warning" : "text-success"
            }`}
          >
            {danger ? "Crítica" : warning ? "Atenção" : "OK"}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Taxa de falha (24h)</p>
          <p className="mt-1 text-sm font-semibold">{health.failRate}%</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Enviadas (24h)</p>
          <p className="mt-1 text-sm font-semibold">{health.sent24h}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Falhas (24h)</p>
          <p className="mt-1 text-sm font-semibold">{health.failed24h}</p>
        </div>
      </div>
    </div>
  );
}

function renderPreview(template: string): string {
  return (template ?? "")
    .replace(/\{nome\}/gi, "João")
    .replace(/\{instagram\}/gi, "@joaomusico");
}

function PreviewButton({ template, label = "Visualizar preview" }: { template: string; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted"
      >
        <Eye className="h-3.5 w-3.5" /> {label}
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-border bg-background p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm">Preview da mensagem</h3>
              <button onClick={() => setOpen(false)} className="text-xs text-muted-foreground hover:text-foreground">Fechar</button>
            </div>
            <p className="text-[11px] text-muted-foreground mb-2">
              Substituições: <code>{`{nome}`}</code> → João · <code>{`{instagram}`}</code> → @joaomusico
            </p>
            <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-3 text-sm whitespace-pre-wrap">
              {renderPreview(template) || <span className="text-muted-foreground italic">(vazio)</span>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function HistorySection() {
  const qc = useQueryClient();
  const listL = useServerFn(listCampaignLogs);
  const listBC = useServerFn(listBlastCampaigns);
  const { data: logs = [] } = useQuery({ queryKey: ["campaign_logs"], queryFn: () => listL() });
  const { data: blastCampaigns = [] } = useQuery({
    queryKey: ["blast_campaigns"],
    queryFn: () => listBC(),
  });

  const [campaignFilter, setCampaignFilter] = useState<string>("all");
  const [periodDays, setPeriodDays] = useState<number>(7);

  useEffect(() => {
    const ch = supabase
      .channel("history_logs_rt")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "campaign_logs" }, () => {
        qc.invalidateQueries({ queryKey: ["campaign_logs"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const cutoff = Date.now() - periodDays * 86400000;
  const filtered = logs.filter((l) => {
    const ts = new Date(l.created_at).getTime();
    if (ts < cutoff) return false;
    if (campaignFilter !== "all" && (l as { campaign_id?: string }).campaign_id !== campaignFilter) return false;
    return true;
  });

  // Build per-day reply rate
  const byDay = new Map<string, { sent: number; replied: number }>();
  for (const l of filtered) {
    const d = new Date(l.created_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const row = byDay.get(key) ?? { sent: 0, replied: 0 };
    if (l.status === "enviado" || l.status === "respondido") row.sent += 1;
    if (l.status === "respondido") row.replied += 1;
    byDay.set(key, row);
  }
  const days: Array<{ key: string; sent: number; replied: number; rate: number }> = [];
  for (let i = periodDays - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const row = byDay.get(key) ?? { sent: 0, replied: 0 };
    days.push({ key, sent: row.sent, replied: row.replied, rate: row.sent ? Math.round((row.replied / row.sent) * 100) : 0 });
  }
  const maxRate = Math.max(10, ...days.map((d) => d.rate));

  return (
    <section className="space-y-5">
      <div className="rounded-xl border border-border p-5" style={{ background: "var(--gradient-card)" }}>
        <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
          <div>
            <h2 className="font-semibold flex items-center gap-2"><BarChart3 className="h-4 w-4 text-primary" /> Taxa de resposta por dia</h2>
            <p className="text-xs text-muted-foreground">Mensagens entregues e respondidas no período</p>
          </div>
          <div className="flex gap-2">
            <select
              value={campaignFilter}
              onChange={(e) => setCampaignFilter(e.target.value)}
              className="rounded-lg border border-border bg-background px-2 py-1 text-xs"
            >
              <option value="all">Todas as campanhas</option>
              {blastCampaigns.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <select
              value={periodDays}
              onChange={(e) => setPeriodDays(Number(e.target.value))}
              className="rounded-lg border border-border bg-background px-2 py-1 text-xs"
            >
              <option value={7}>Últimos 7 dias</option>
              <option value={14}>Últimos 14 dias</option>
              <option value={30}>Últimos 30 dias</option>
            </select>
          </div>
        </div>
        <div className="flex items-end gap-1 h-40">
          {days.map((d) => (
            <div key={d.key} className="flex-1 flex flex-col items-center gap-1">
              <div className="text-[10px] text-muted-foreground">{d.rate}%</div>
              <div
                className="w-full rounded-t bg-primary/70"
                style={{ height: `${(d.rate / maxRate) * 100}%`, minHeight: d.rate > 0 ? "4px" : "1px" }}
                title={`${d.sent} enviados · ${d.replied} respondidos`}
              />
              <div className="text-[10px] text-muted-foreground">{d.key.slice(5)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border" style={{ background: "var(--gradient-card)" }}>
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="font-semibold text-sm">Histórico de mensagens</h2>
          <span className="text-xs text-muted-foreground">{filtered.length} registros</span>
        </div>
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 sticky top-0">
              <tr className="text-left text-xs text-muted-foreground">
                <th className="px-4 py-2">Data</th>
                <th className="px-4 py-2">Contato</th>
                <th className="px-4 py-2">Mensagem enviada</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground text-sm">Nenhum registro no período.</td></tr>
              )}
              {filtered.map((l) => {
                const d = new Date(l.created_at);
                const data = d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
                const statusStyle =
                  l.status === "respondido"
                    ? "bg-primary/15 text-primary"
                    : l.status === "enviado"
                      ? "bg-success/15 text-success"
                      : "bg-destructive/15 text-destructive";
                const resultado = l.status === "respondido" ? "Convertido" : l.status === "enviado" ? "Sem resposta" : "Falhou";
                return (
                  <tr key={l.id} className="border-t border-border hover:bg-muted/20">
                    <td className="px-4 py-2 text-xs tabular-nums whitespace-nowrap">{data}</td>
                    <td className="px-4 py-2 text-xs">{l.contact_name}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground max-w-[360px] truncate">{l.message_preview}</td>
                    <td className="px-4 py-2">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] ${statusStyle}`}>{l.status}</span>
                    </td>
                    <td className="px-4 py-2 text-xs">{resultado}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function ContactListsSection() {
  const qc = useQueryClient();
  const listFn = useServerFn(listContactLists);
  const importFn = useServerFn(importContactsToList);
  const clearFn = useServerFn(clearContactList);
  const clearAllFn = useServerFn(clearAllBlastContacts);
  const exportFn = useServerFn(exportContactList);
  const listCatsFn = useServerFn(listCategories);
  const { data: lists = [] } = useQuery({ queryKey: ["contact_lists"], queryFn: () => listFn() });
  const { data: categories = [] } = useQuery({ queryKey: ["contact_categories"], queryFn: () => listCatsFn() });

  // Contagem por categoria (tempo real via realtime abaixo)
  const { data: catCounts = {} } = useQuery({
    queryKey: ["contact_categories_counts"],
    queryFn: async () => {
      const { data } = await supabase
        .from("blast_contacts")
        .select("categoria_id");
      const map: Record<string, number> = {};
      for (const r of data ?? []) {
        const k = (r as { categoria_id: string | null }).categoria_id;
        if (!k) continue;
        map[k] = (map[k] ?? 0) + 1;
      }
      return map;
    },
  });

  // Contagem detalhada por categoria (total / enviados / restam) — leitura pura.
  const { data: catStats = {} } = useQuery({
    queryKey: ["contact_categories_status_counts"],
    queryFn: async () => {
      const { data } = await supabase
        .from("blast_contacts")
        .select("categoria_id, status");
      const map: Record<string, { total: number; enviados: number; restam: number }> = {};
      for (const r of (data ?? []) as Array<{ categoria_id: string | null; status: string }>) {
        if (!r.categoria_id) continue;
        const s = map[r.categoria_id] ?? { total: 0, enviados: 0, restam: 0 };
        s.total += 1;
        if (r.status && r.status.startsWith("enviado_")) s.enviados += 1;
        else if (r.status === "respondeu" || r.status === "convertido") s.enviados += 1;
        else if (r.status === "pendente" || r.status === "na_fila") s.restam += 1;
        map[r.categoria_id] = s;
      }
      return map;
    },
  });

  const { data: camps = [] } = useQuery({
    queryKey: ["blast_campaigns", "active-by-list"],
    queryFn: async () => {
      const { data } = await supabase
        .from("blast_campaigns")
        .select("contact_list_id, state");
      return (data ?? []) as Array<{ contact_list_id: string | null; state: string }>;
    },
  });
  const activeListIds = new Set(
    camps.filter((c) => c.state === "rodando" && c.contact_list_id).map((c) => c.contact_list_id as string),
  );

  // Realtime: refresh listas/contagens quando blast_contacts mudar
  useEffect(() => {
    const ch = supabase
      .channel("blast_contacts_overview")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "blast_contacts" },
        () => {
          qc.invalidateQueries({ queryKey: ["contact_lists"] });
          qc.invalidateQueries({ queryKey: ["contact_categories_counts"] });
          qc.invalidateQueries({ queryKey: ["contact_categories_status_counts"] });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  // Base de disparo: NÃO inclui listas de Meta Ads.
  // Meta Ads é carregado separadamente quando o usuário decidir mudar de campanha.
  const sortedLists = [...lists].filter((l) => l.origem !== "meta_ads");

  // Visão geral agregada (Lista A + Lista B)
  const overview = sortedLists.reduce(
    (acc, l) => {
      acc.total += l.total;
      acc.contatados += l.contatados;
      acc.respondeu += l.respondeu;
      acc.convertido += l.convertido;
      return acc;
    },
    { total: 0, contatados: 0, respondeu: 0, convertido: 0 },
  );
  const semResposta = Math.max(0, overview.contatados - overview.respondeu);
  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);
  const convRate = pct(overview.convertido, overview.respondeu);
  const convTone =
    convRate >= 30 ? { text: "text-emerald-500", bg: "bg-emerald-500/10 border-emerald-500/30" }
    : convRate >= 10 ? { text: "text-amber-500", bg: "bg-amber-500/10 border-amber-500/30" }
    : { text: "text-red-500", bg: "bg-red-500/10 border-red-500/30" };
  const [openContactsFor, setOpenContactsFor] = useState<string | null>(null);

  const [csvByList, setCsvByList] = useState<Record<string, CsvRow[]>>({});
  const [summary, setSummary] = useState<Record<string, { inserted: number; ignored_existing: number; ignored_sent: number; ignored_blocked: number; invalid: number } | null>>({});
  const [importingFor, setImportingFor] = useState<string | null>(null);
  const [importCategoryId, setImportCategoryId] = useState<string>("");
  useEffect(() => {
    if (!importCategoryId && categories.length > 0) {
      const def = categories.find((c) => c.slug === "lead_instagram") ?? categories[0];
      setImportCategoryId(def.id);
    }
  }, [categories, importCategoryId]);

  async function exportCombinedReport() {
    const results = await Promise.all(sortedLists.map((l) => exportFn({ data: { listId: l.id } })));
    const header = "lista,nome,telefone,instagram,status,last_sent_at,replied_at,origem";
    const lines: string[] = [header];
    results.forEach((res, i) => {
      const listName = sortedLists[i].name;
      const body = res.csv.split("\n").slice(1).filter((r) => r.trim().length > 0);
      for (const r of body) lines.push(`"${listName.replace(/"/g, '""')}",` + r);
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `relatorio-geral-listas.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  function parseCsv(text: string): CsvRow[] {
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) return [];
    const header = lines[0].toLowerCase().split(/[,;\t]/).map((h) => h.trim());
    const iNome = header.findIndex((h) => h === "nome" || h === "name");
    const iTel = header.findIndex((h) => h === "telefone" || h === "phone" || h === "celular");
    const iIg = header.findIndex((h) => h === "instagram" || h === "ig" || h === "@");
    const out: CsvRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(/[,;\t]/).map((c) => c.replace(/^"|"$/g, "").trim());
      const nome = iNome >= 0 ? cols[iNome] : cols[0];
      const telefone = iTel >= 0 ? cols[iTel] : cols[1];
      const instagram = iIg >= 0 ? cols[iIg] : cols[2] ?? "";
      if (nome && telefone) out.push({ nome, telefone, instagram });
    }
    return out;
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-primary" />
        <h2 className="font-semibold">Listas de Contatos</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Base de contatos do número de disparo. Importe por CSV para adicionar novos leads.
        Números duplicados dentro da base são bloqueados automaticamente.
      </p>

      {/* Base de Contatos é a única fonte de verdade — os stats aparecem no painel abaixo. */}

      {(() => {
        const primary = sortedLists[0];
        if (!primary) return null;
        const rows = csvByList[primary.id] ?? [];
        const sum = summary[primary.id];
        return (
          <div
            className="relative overflow-hidden rounded-2xl border border-border/60 p-6 shadow-sm ring-1 ring-inset ring-white/5"
            style={{ background: "var(--gradient-card)" }}
          >
            {/* glow accent */}
            <div className="pointer-events-none absolute -top-16 -right-16 h-40 w-40 rounded-full bg-primary/20 blur-3xl" />

            <div className="relative flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div
                  className="flex h-11 w-11 items-center justify-center rounded-xl text-primary-foreground shadow-md"
                  style={{ background: "var(--gradient-primary)" }}
                >
                  <Plus className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold tracking-tight">Importar Contatos</h3>
                  <p className="text-xs text-muted-foreground">
                    Envie um CSV com as colunas <code className="rounded bg-muted px-1 py-0.5 text-[10px]">nome</code>, <code className="rounded bg-muted px-1 py-0.5 text-[10px]">telefone</code>, <code className="rounded bg-muted px-1 py-0.5 text-[10px]">instagram</code>.
                  </p>
                </div>
              </div>
              {rows.length > 0 && (
                <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary">
                  {rows.length} prontos para importar
                </span>
              )}
            </div>

            <div className="relative mt-5 space-y-4">
              {/* Categoria */}
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-background/40 px-3 py-2">
                <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Categoria</label>
                <select
                  value={importCategoryId}
                  onChange={(e) => setImportCategoryId(e.target.value)}
                  className="rounded-md border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  {categories.length === 0 && <option value="">Carregando…</option>}
                  {categories.filter((c) => !c.slug?.startsWith("debug_")).map((c) => (
                    <option key={c.id} value={c.id}>{c.icone} {c.nome}</option>
                  ))}
                </select>
                <span className="ml-auto text-[10px] text-muted-foreground">Aplicada a todos os contatos do CSV.</span>
              </div>

              {/* Estatísticas da categoria selecionada */}
              {importCategoryId && (() => {
                const s = catStats[importCategoryId] ?? { total: 0, enviados: 0, restam: 0 };
                return (
                  <div className="grid grid-cols-3 gap-2 rounded-xl border border-border/60 bg-background/40 p-3">
                    <div className="text-center">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Total na base</p>
                      <p className="mt-1 text-lg font-semibold">{s.total.toLocaleString("pt-BR")}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Já enviados</p>
                      <p className="mt-1 text-lg font-semibold text-emerald-500">{s.enviados.toLocaleString("pt-BR")}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Restam enviar</p>
                      <p className="mt-1 text-lg font-semibold text-primary">{s.restam.toLocaleString("pt-BR")}</p>
                    </div>
                  </div>
                );
              })()}

              {/* Dropzone */}
              <label
                htmlFor="csv-import-input"
                className="group flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border/70 bg-background/30 px-4 py-6 text-center transition-all hover:border-primary/50 hover:bg-primary/5"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary transition-transform group-hover:scale-110">
                  <Plus className="h-5 w-5" />
                </div>
                <div className="text-xs">
                  <span className="font-semibold text-foreground">Clique para selecionar</span>
                  <span className="text-muted-foreground"> ou arraste um arquivo .csv</span>
                </div>
                <span className="text-[10px] text-muted-foreground">Formato: nome, telefone, instagram</span>
                <input
                  id="csv-import-input"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const text = await f.text();
                    const parsed = parseCsv(text);
                    setCsvByList((m) => ({ ...m, [primary.id]: parsed }));
                    if (parsed.length === 0) {
                      toast.error("CSV vazio ou cabeçalho inválido. Use colunas: nome, telefone, instagram");
                    } else {
                      toast.success(`${parsed.length} linhas detectadas no CSV`);
                    }
                    e.target.value = "";
                  }}
                  className="hidden"
                />
              </label>

              {rows.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    disabled={importingFor === primary.id || !importCategoryId}
                    onClick={async () => {
                      if (!importCategoryId) { toast.error("Selecione uma categoria"); return; }
                      setImportingFor(primary.id);
                      try {
                        const res = await importFn({ data: { listId: primary.id, categoriaId: importCategoryId, rows } });
                        setSummary((m) => ({ ...m, [primary.id]: res as never }));
                        setCsvByList((m) => ({ ...m, [primary.id]: [] }));
                        qc.invalidateQueries({ queryKey: ["contact_lists"] });
                        qc.invalidateQueries({ queryKey: ["panel_contacts", "unified"] });
                        qc.invalidateQueries({ queryKey: ["contact_categories_counts"] });
                        qc.invalidateQueries({ queryKey: ["list_contacts_detail", primary.id] });
                        {
                          const r = res as { inserted: number; ignored_sent: number; ignored_blocked: number };
                          toast.success(
                            `${r.inserted} novos adicionados · ${r.ignored_sent} ignorados (já enviados) · ${r.ignored_blocked} ignorados (não quer)`,
                          );
                        }
                      } catch (err) {
                        toast.error(`Falha ao importar: ${(err as Error).message}`);
                      } finally {
                        setImportingFor(null);
                      }
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold text-primary-foreground shadow-md transition-all hover:shadow-lg hover:brightness-110 disabled:opacity-50"
                    style={{ background: "var(--gradient-primary)" }}
                  >
                    <Plus className="h-3.5 w-3.5" /> {importingFor === primary.id ? "Importando…" : `Importar ${rows.length} contatos`}
                  </button>
                </div>
              )}

              <div className="flex flex-wrap gap-2 border-t border-border/50 pt-3">
                <button
                  onClick={exportCombinedReport}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-card/70 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
                >
                  <BarChart3 className="h-3.5 w-3.5" /> Exportar relatório
                </button>
                <button
                  onClick={async () => {
                    if (!confirm("Limpar TODOS os contatos da base de disparo?")) return;
                    try {
                      const res = await clearAllFn();
                      qc.invalidateQueries({ queryKey: ["contact_lists"] });
                      qc.invalidateQueries({ queryKey: ["contact_categories_counts"] });
                      qc.invalidateQueries({ queryKey: ["panel_contacts"] });
                      alert(`Base limpa: ${res?.deleted ?? 0} contatos removidos.`);
                    } catch (e) {
                      alert("Erro ao limpar base: " + (e as Error).message);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/20"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Limpar base
                </button>
              </div>
              {sum && (
                <div className="grid grid-cols-2 gap-2 rounded-xl border border-border/50 bg-background/40 p-3 text-[11px] md:grid-cols-4">
                  <div><div className="text-emerald-500 text-sm font-bold">{sum.inserted}</div><div className="text-muted-foreground">Novos</div></div>
                  <div><div className="text-amber-500 text-sm font-bold">{sum.ignored_sent}</div><div className="text-muted-foreground">Já enviados</div></div>
                  <div><div className="text-rose-500 text-sm font-bold">{sum.ignored_blocked}</div><div className="text-muted-foreground">Não quer</div></div>
                  <div><div className="text-muted-foreground text-sm font-bold">{sum.invalid}</div><div className="text-muted-foreground">Inválidos</div></div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      <ListsContactsPanel lists={sortedLists} />
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-background/40 px-2 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}

type ListContactRow = {
  id: string;
  nome: string;
  telefone: string;
  status: string;
  ultima_interacao: string | null;
  replied_at: string | null;
  last_sent_at: string | null;
};

function ListContactsTable({ listId }: { listId: string }) {
  const { data: rows = [] } = useQuery({
    queryKey: ["list_contacts_detail", listId],
    queryFn: async () => {
      const { data } = await supabase
        .from("blast_contacts")
        .select("id, nome, telefone, status, ultima_interacao, replied_at, last_sent_at")
        .eq("contact_list_id", listId)
        .order("updated_at", { ascending: false })
        .limit(200);
      return (data ?? []) as ListContactRow[];
    },
  });

  const phones = rows.map((r) => r.telefone);
  const { data: tempMap = {} } = useQuery({
    queryKey: ["contacts_temperature", listId, phones.length],
    enabled: phones.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("contacts")
        .select("telefone, temperatura")
        .in("telefone", phones);
      const m: Record<string, string> = {};
      for (const c of (data ?? []) as Array<{ telefone: string; temperatura: string | null }>) {
        if (c.telefone) m[c.telefone] = c.temperatura ?? "";
      }
      return m;
    },
  });

  if (rows.length === 0) {
    return <p className="mt-3 text-xs text-muted-foreground">Nenhum contato ainda.</p>;
  }

  const tempStyle = (t: string) =>
    t === "quente" ? "bg-red-500/15 text-red-500"
    : t === "morno" ? "bg-amber-500/15 text-amber-500"
    : t === "frio" ? "bg-blue-500/15 text-blue-500"
    : "bg-muted text-muted-foreground";

  return (
    <div className="mt-3 overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-xs">
        <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left">Nome</th>
            <th className="px-3 py-2 text-left">Telefone</th>
            <th className="px-3 py-2 text-left">Status</th>
            <th className="px-3 py-2 text-left">Temperatura</th>
            <th className="px-3 py-2 text-left">Última interação</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const t = tempMap[r.telefone] ?? "";
            const last = r.ultima_interacao ?? r.replied_at ?? r.last_sent_at;
            return (
              <tr key={r.id} className="border-t border-border">
                <td className="px-3 py-2">{r.nome}</td>
                <td className="px-3 py-2 font-mono text-[11px]">{r.telefone}</td>
                <td className="px-3 py-2">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">{r.status}</span>
                </td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] capitalize ${tempStyle(t)}`}>
                    {t || "—"}
                  </span>
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {last ? new Date(last).toLocaleString("pt-BR") : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function OverviewStat({
  icon, label, value, hint, tone,
}: {
  icon: React.ReactNode; label: string; value: number; hint?: string;
  tone?: "primary" | "success" | "info" | "warn";
}) {
  const toneCls =
    tone === "primary" ? "text-primary"
    : tone === "success" ? "text-emerald-500"
    : tone === "info" ? "text-blue-500"
    : tone === "warn" ? "text-amber-500"
    : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-background/40 px-3 py-3">
      <div className={`flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground`}>
        <span className={toneCls}>{icon}</span>{label}
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <p className={`text-xl font-semibold ${toneCls}`}>{value}</p>
        {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
      </div>
    </div>
  );
}

function ChannelBreakdown({
  title, tone, icon, list,
}: {
  title: string; tone: "blue" | "pink"; icon: React.ReactNode;
  list?: { total: number; contatados: number; respondeu: number; convertido: number };
}) {
  const data = list ?? { total: 0, contatados: 0, respondeu: 0, convertido: 0 };
  const semResp = Math.max(0, data.contatados - data.respondeu);
  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);
  const badge = tone === "blue" ? "bg-blue-500/15 text-blue-500" : "bg-pink-500/15 text-pink-500";
  return (
    <div className="rounded-lg border border-border bg-background/40 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className={`flex h-7 w-7 items-center justify-center rounded-md ${badge}`}>{icon}</span>
        <h4 className="text-sm font-semibold">{title}</h4>
      </div>
      <div className="grid grid-cols-5 gap-2 text-center">
        <Stat label="Total" value={data.total} />
        <Stat label="Abord." value={data.contatados} />
        <Stat label="Resp." value={data.respondeu} />
        <Stat label="Conv." value={data.convertido} />
        <Stat label="S/ resp." value={semResp} />
      </div>
      <p className="text-[11px] text-muted-foreground">
        Resposta: <b>{pct(data.respondeu, data.contatados)}%</b> · Conversão: <b>{pct(data.convertido, data.contatados)}%</b>
      </p>
    </div>
  );
}

function VariationInfoCard() {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tpls, setTpls] = useState<OpeningTemplates>(DEFAULT_TEMPLATES);
  const [loaded, setLoaded] = useState(false);
  const [lang, setLang] = useState<Language>("pt");

  useEffect(() => {
    if (!editing || loaded) return;
    (async () => {
      try {
        const t = await getOpeningTemplates();
        setTpls(t as OpeningTemplates);
      } catch {
        setTpls(DEFAULT_TEMPLATES);
      } finally {
        setLoaded(true);
      }
    })();
  }, [editing, loaded]);

  // Acessa/edita o pack de idioma atual (pt = campos raiz; en/es = subobjetos).
  const getPack = (state: OpeningTemplates, l: Language): LangTemplates => {
    if (l === "en") return state.en ?? EN_DEFAULT;
    if (l === "es") return state.es ?? ES_DEFAULT;
    return { saudacoes: state.saudacoes, linha2: state.linha2, perguntas: state.perguntas };
  };
  const setPack = (state: OpeningTemplates, l: Language, pack: LangTemplates): OpeningTemplates => {
    if (l === "en") return { ...state, en: pack };
    if (l === "es") return { ...state, es: pack };
    return { ...state, saudacoes: pack.saudacoes, linha2: pack.linha2, perguntas: pack.perguntas };
  };
  const pack = getPack(tpls, lang);

  const updateList = (key: "linha2" | "perguntas", idx: number, val: string) => {
    setTpls((prev) => {
      const cur = getPack(prev, lang);
      const arr = [...cur[key]];
      arr[idx] = val;
      return setPack(prev, lang, { ...cur, [key]: arr });
    });
  };
  const updateSaud = (p: "manha" | "tarde" | "noite", idx: number, val: string) => {
    setTpls((prev) => {
      const cur = getPack(prev, lang);
      const arr = [...cur.saudacoes[p]];
      arr[idx] = val;
      return setPack(prev, lang, {
        ...cur,
        saudacoes: { ...cur.saudacoes, [p]: arr },
      });
    });
  };

  const [ddiText, setDdiText] = useState<string>(
    JSON.stringify(DEFAULT_DDI_LANGUAGE_MAP, null, 2),
  );
  const [ddiError, setDdiError] = useState<string | null>(null);
  useEffect(() => {
    if (loaded) {
      setDdiText(JSON.stringify(tpls.ddiMap ?? DEFAULT_DDI_LANGUAGE_MAP, null, 2));
    }
  }, [loaded, tpls.ddiMap]);

  const save = async () => {
    // Parse DDI map antes de salvar
    let parsedMap: Record<string, Language> | undefined;
    try {
      parsedMap = JSON.parse(ddiText);
      setDdiError(null);
    } catch {
      setDdiError("JSON inválido no mapa de DDI");
      return;
    }
    setSaving(true);
    try {
      await saveOpeningTemplates({ data: { ...tpls, ddiMap: parsedMap } });
      toast.success("Templates salvos!");
      setEditing(false);
    } catch (e) {
      toast.error("Erro ao salvar: " + (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-2">
      <div className="flex items-start gap-2">
        <Sparkles className="h-4 w-4 text-primary mt-0.5" />
        <div className="flex-1">
          <h4 className="text-sm font-semibold">Mensagem inteligente automática</h4>
          <p className="text-xs text-muted-foreground mt-1">
            O sistema envia a abordagem em 3 mensagens (saudação + linha 2 + pergunta),
            variando por período (manhã/tarde/noite, fuso Brasil). Cada disparo gera uma
            combinação diferente e não repete a mesma saudação em disparos seguidos.
          </p>
        </div>
      </div>
      <div className="flex gap-3">
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-xs font-medium text-primary hover:underline"
        >
          {open ? "Ocultar exemplos" : "Ver exemplos de variações"}
        </button>
        <button
          onClick={() => setEditing((v) => !v)}
          className="text-xs font-medium text-primary hover:underline"
        >
          {editing ? "Fechar editor" : "Ver/editar templates"}
        </button>
      </div>
      {open && (
        <div className="mt-2 space-y-3 max-h-80 overflow-y-auto rounded-md border border-border bg-background/60 p-3">
          {(["manha", "tarde", "noite"] as const).map((p) => (
            <div key={p}>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                {p === "manha" ? "Manhã (5h–12h)" : p === "tarde" ? "Tarde (12h–18h)" : "Noite (18h–5h)"}
              </div>
              <ul className="space-y-1">
                {SAUDACOES[p].map((s, i) => (
                  <li key={i} className="text-xs text-foreground/90">• {s}</li>
                ))}
              </ul>
            </div>
          ))}
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
              Corpo da mensagem
            </div>
            <ul className="space-y-1">
              {CORPOS_MENSAGEM.map((c, i) => (
                <li key={i} className="text-xs text-foreground/90">
                  • {c.replace("{instagram}", "perfil_exemplo")}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {editing && (
        <div className="mt-2 space-y-4 rounded-md border border-border bg-background/60 p-3">
          {!loaded ? (
            <p className="text-xs text-muted-foreground">Carregando templates…</p>
          ) : (
            <>
              <div className="flex gap-1 border-b border-border">
                {(
                  [
                    { id: "pt" as const, label: "🇧🇷 Português" },
                    { id: "en" as const, label: "🇺🇸 English" },
                    { id: "es" as const, label: "🇪🇸 Español" },
                  ]
                ).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setLang(t.id)}
                    className={`px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors ${
                      lang === t.id
                        ? "border-primary text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Use <code>{"{nome}"}</code> e <code>{"{instagram}"}</code> como variáveis.
              </p>
              {(["manha", "tarde", "noite"] as const).map((p) => (
                <div key={p} className="space-y-1">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Saudações — {p === "manha" ? "Manhã" : p === "tarde" ? "Tarde" : "Noite"}
                  </div>
                  {pack.saudacoes[p].map((s, i) => (
                    <Input
                      key={i}
                      value={s}
                      onChange={(e) => updateSaud(p, i, e.target.value)}
                      className="text-xs"
                    />
                  ))}
                </div>
              ))}
              <div className="space-y-1">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Linha 2 — abordagem
                </div>
                {pack.linha2.map((s, i) => (
                  <Input
                    key={i}
                    value={s}
                    onChange={(e) => updateList("linha2", i, e.target.value)}
                    className="text-xs"
                  />
                ))}
              </div>
              <div className="space-y-1">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Pergunta final
                </div>
                {pack.perguntas.map((s, i) => (
                  <Input
                    key={i}
                    value={s}
                    onChange={(e) => updateList("perguntas", i, e.target.value)}
                    className="text-xs"
                  />
                ))}
              </div>
              <div className="space-y-1 pt-2 border-t border-border">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Mapa DDI → Idioma (JSON)
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Chave = DDI (só dígitos), valor = <code>pt</code>, <code>en</code> ou <code>es</code>.
                  DDIs não listados usam <code>en</code> como padrão.
                </p>
                <textarea
                  value={ddiText}
                  onChange={(e) => setDdiText(e.target.value)}
                  className="w-full h-40 rounded-md border border-input bg-background p-2 text-xs font-mono"
                />
                {ddiError && (
                  <p className="text-[11px] text-destructive">{ddiError}</p>
                )}
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={save} disabled={saving}>
                  {saving ? "Salvando…" : "Salvar templates"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setTpls(DEFAULT_TEMPLATES);
                    setDdiText(JSON.stringify(DEFAULT_DDI_LANGUAGE_MAP, null, 2));
                  }}
                  disabled={saving}
                >
                  Restaurar padrão
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}