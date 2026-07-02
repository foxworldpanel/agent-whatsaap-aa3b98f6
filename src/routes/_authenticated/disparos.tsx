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
  getBlastReport,
  clearBlastContacts,
  testBlastCampaign,
  getNumberHealth,
  skipBlastContact,
  blockBlastContact,
} from "@/lib/blast.functions";
import {
  listContactLists,
  importContactsToList,
  clearContactList,
  exportContactList,
} from "@/lib/contact-lists.functions";
import { profileLabel, type ContactProfile } from "@/lib/mock-data";
import { BlastFlowBuilder } from "@/components/BlastFlowBuilder";

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

          <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-1">
          {campaigns.length === 0 && (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Nenhuma campanha. Clique em "Nova campanha".
            </div>
          )}
          {campaigns.map((c) => (
            <div
              key={c.id}
              className="space-y-3 rounded-xl border border-border p-5"
              style={{ background: "var(--gradient-card)" }}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs text-muted-foreground">Perfil alvo</p>
                  <h3 className="font-semibold">{profileLabel[c.target_profile as ContactProfile]}</h3>
                </div>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs ${
                    c.state === "rodando"
                      ? "bg-success/20 text-success"
                      : c.state === "pausado"
                        ? "bg-warning/20 text-warning"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  {c.state}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <span>Volume/dia: <b className="text-foreground">{c.daily_volume}</b></span>
                <span>Intervalo: <b className="text-foreground">{c.interval_minutes}min</b></span>
                <span>Início: <b className="text-foreground">{fmtTime(c.start_time)}</b></span>
                <span>Fim: <b className="text-foreground">{fmtTime(c.end_time)}</b></span>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => stateMut.mutate({ id: c.id, state: "rodando" })}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-primary-foreground"
                  style={{ background: "var(--gradient-primary)" }}
                >
                  <Play className="h-3.5 w-3.5" /> Iniciar
                </button>
                <button
                  onClick={() => stateMut.mutate({ id: c.id, state: "pausado" })}
                  className="rounded-lg border border-border bg-card px-3 py-2 hover:bg-muted"
                  title="Pausar"
                >
                  <Pause className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => stateMut.mutate({ id: c.id, state: "parado" })}
                  className="rounded-lg border border-border bg-card px-3 py-2 hover:bg-muted"
                  title="Parar"
                >
                  <Square className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => delMut.mutate(c.id)}
                  className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive hover:bg-destructive/20"
                  title="Excluir"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="lg:col-span-2 rounded-xl border border-border" style={{ background: "var(--gradient-card)" }}>
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <div className="flex items-center gap-2">
              <Send className="h-4 w-4 text-primary" />
              <h2 className="font-semibold">Log em tempo real</h2>
            </div>
            <span className="text-xs text-muted-foreground">atualização automática</span>
          </div>
          <ul className="max-h-[600px] divide-y divide-border overflow-y-auto">
            {logs.length === 0 && (
              <li className="px-6 py-12 text-center text-sm text-muted-foreground">
                Nenhum disparo ainda. Inicie uma campanha para ver os logs.
              </li>
            )}
            {logs.map((log) => {
              const hora = new Date(log.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
              return (
                <li key={log.id} className="flex items-start gap-4 px-6 py-4 transition hover:bg-muted/20">
                  <span className="w-12 text-xs text-muted-foreground tabular-nums pt-0.5">{hora}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{log.contact_name}</p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{log.message_preview}</p>
                  </div>
                  <span
                    className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
                      log.status === "respondido"
                        ? "bg-primary/20 text-primary"
                        : log.status === "enviado"
                          ? "bg-success/20 text-success"
                          : "bg-destructive/20 text-destructive"
                    }`}
                  >
                    {log.status === "respondido" ? (
                      <MessageCircle className="h-3 w-3" />
                    ) : log.status === "enviado" ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : (
                      <XCircle className="h-3 w-3" />
                    )}
                    {log.status}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
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
};

type PanelFilter = "all" | "aguardando" | "enviados" | "responderam" | "converteram" | "falhou";

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
};

function panelStatusMatches(status: string, f: PanelFilter): boolean {
  if (f === "all") return true;
  if (f === "aguardando") return status === "pendente" || status === "na_fila";
  if (f === "enviados") return status === "enviado_abertura" || status === "enviado_d3" || status === "enviado_d7";
  if (f === "responderam") return status === "respondeu";
  if (f === "converteram") return status === "convertido";
  if (f === "falhou") return status === "failed";
  return true;
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

  const metaList = lists.find((l) => l.origem === "meta_ads") ?? lists[0];
  const igList = lists.find((l) => l.origem !== "meta_ads") ?? lists[1] ?? lists[0];
  const [activeTab, setActiveTab] = useState<"a" | "b">("a");
  const active = activeTab === "a" ? metaList : igList;

  const [filter, setFilter] = useState<PanelFilter>("all");
  const [q, setQ] = useState("");

  const { data: rows = [] } = useQuery({
    queryKey: ["panel_contacts", active?.id],
    enabled: !!active?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("blast_contacts")
        .select("id, nome, telefone, instagram, status, last_sent_at, replied_at, converted_at, ultima_interacao, error_message, sent_via_number_id")
        .eq("contact_list_id", active!.id)
        .order("updated_at", { ascending: false })
        .limit(500);
      return (data ?? []) as PanelContactRow[];
    },
  });

  // Nomes dos números para exibição
  const { data: numbersMap = {} } = useQuery({
    queryKey: ["panel_numbers_map"],
    queryFn: async () => {
      const { data } = await supabase
        .from("whatsapp_numbers")
        .select("id, nome");
      const map: Record<string, string> = {};
      for (const n of data ?? []) map[n.id as string] = (n.nome as string) ?? "—";
      return map;
    },
  });

  const { data: campaign } = useQuery({
    queryKey: ["panel_campaign_for_list", active?.id],
    enabled: !!active?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("blast_campaigns")
        .select("id, name, contact_list_id, state, daily_limit, delay_min_sec, delay_max_sec, last_dispatch_at")
        .eq("contact_list_id", active!.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data ?? null) as PanelCampaign | null;
    },
  });

  // Realtime — atualiza sem reload
  useEffect(() => {
    if (!active?.id) return;
    const ch = supabase
      .channel(`panel_contacts_${active.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "blast_contacts", filter: `contact_list_id=eq.${active.id}` },
        () => qc.invalidateQueries({ queryKey: ["panel_contacts", active.id] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [active?.id, qc]);

  // Filtro + busca
  const term = q.trim().toLowerCase();
  const filtered = rows.filter((r) => {
    if (!panelStatusMatches(r.status, filter)) return false;
    if (!term) return true;
    return (
      r.nome?.toLowerCase().includes(term) ||
      r.telefone?.toLowerCase().includes(term) ||
      (r.instagram ?? "").toLowerCase().includes(term)
    );
  });

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

  return (
    <div className="rounded-xl border border-border p-5 space-y-4" style={{ background: "var(--gradient-card)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Visualização de contatos</h3>
        </div>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Tempo real</span>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setActiveTab("a")}
          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
            activeTab === "a"
              ? "border-blue-500/50 bg-blue-500/10 text-blue-500"
              : "border-border bg-card text-muted-foreground hover:bg-muted"
          }`}
        >
          <Megaphone className="h-4 w-4" /> Lista A — Meta Ads
          {metaList && <span className="ml-1 text-[10px] opacity-80">({metaList.total})</span>}
        </button>
        <button
          onClick={() => setActiveTab("b")}
          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
            activeTab === "b"
              ? "border-pink-500/50 bg-pink-500/10 text-pink-500"
              : "border-border bg-card text-muted-foreground hover:bg-muted"
          }`}
        >
          <Instagram className="h-4 w-4" /> Lista B — Instagram
          {igList && <span className="ml-1 text-[10px] opacity-80">({igList.total})</span>}
        </button>
      </div>

      {/* Progresso quando campanha ativa */}
      {isActive && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Zap className="h-4 w-4 text-emerald-500" />
            <span className="font-semibold text-emerald-500">Disparando…</span>
            <span className="text-muted-foreground">
              {sentToday}/{dailyLimit || "∞"} hoje
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
            <span>✅ Enviados: <b className="text-foreground">{enviados}</b></span>
            <span>💬 Responderam: <b className="text-foreground">{responderam}</b></span>
            <span>🛍️ Converteram: <b className="text-foreground">{converteram}</b></span>
            {nextInSec !== null && (
              <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> Próximo em: <b className="text-foreground">{Math.floor(nextInSec/60)}m {nextInSec%60}s</b></span>
            )}
            {conclusaoEta && <span>📅 Previsão: <b className="text-foreground">{conclusaoEta}</b></span>}
          </div>
        </div>
      )}

      {/* Próximo na fila */}
      {isActive && nextInLine && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-primary/15 text-primary text-xs font-semibold">
              {initials(nextInLine.nome)}
            </div>
            <div className="flex-1">
              <div className="font-medium">
                Próximo: {nextInLine.nome}
                {nextInLine.instagram && <span className="ml-1 text-muted-foreground">({nextInLine.instagram})</span>}
              </div>
              <div className="text-muted-foreground">
                {nextInSec !== null ? `Enviando em ~${Math.floor(nextInSec/60)}m ${nextInSec%60}s` : "Aguardando janela de disparo"}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filtros + busca */}
      <div className="flex flex-wrap items-center gap-2">
        {filterBtn("all", "Todos")}
        {filterBtn("aguardando", "Aguardando")}
        {filterBtn("enviados", "Enviados")}
        {filterBtn("responderam", "Responderam")}
        {filterBtn("converteram", "Converteram")}
        {filterBtn("falhou", "Falhou")}
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

      {/* Tabela */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
            <tr>
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
                <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                  {rows.length === 0 ? "Nenhum contato na lista ainda." : "Nenhum contato corresponde aos filtros."}
                </td>
              </tr>
            )}
            {filtered.map((r) => {
              const meta = PANEL_STATUS[r.status] ?? { label: r.status, cls: "bg-muted text-muted-foreground", icon: "•" };
              const last = r.ultima_interacao ?? r.replied_at ?? r.converted_at ?? r.last_sent_at;
              return (
                <tr key={r.id} className="group border-t border-border hover:bg-muted/30">
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
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ${meta.cls}`} title={r.error_message ?? undefined}>
                      <span>{meta.icon}</span>{meta.label}
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
                            qc.invalidateQueries({ queryKey: ["panel_contacts", active?.id] });
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
                            qc.invalidateQueries({ queryKey: ["panel_contacts", active?.id] });
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
  const reportFn = useServerFn(getBlastReport);
  const clearFn = useServerFn(clearBlastContacts);
  const testFn = useServerFn(testBlastCampaign);

  const [whatsapp_number_id, setNum] = useState<string>(camp.whatsapp_number_id ?? "");
  const [contact_list_id, setListId] = useState<string>(camp.contact_list_id ?? "");
  const listListsFn = useServerFn(listContactLists);
  const { data: lists = [] } = useQuery({ queryKey: ["contact_lists"], queryFn: () => listListsFn() });
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
  const { data: report } = useQuery({
    queryKey: ["blast_report", camp.id],
    queryFn: () => reportFn({ data: { campaignId: camp.id } }),
    refetchInterval: 15000,
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
    if (selectedNumber.disparos_mode !== true) {
      toast.error(`O número "${selectedNumber.nome ?? "selecionado"}" está com 'Modo Disparos' desativado. Ative em Números.`);
      return;
    }
    if (pendingContacts === 0) {
      toast.error("Nenhum contato com status 'pendente' na lista vinculada. Importe contatos antes de iniciar.");
      return;
    }
    console.log(`[Disparo] Iniciando disparo para ${pendingContacts} contatos — campanha "${camp.name}" via ${selectedNumber.nome ?? selectedNumber.id.slice(0, 6)}`);
    stateMut.mutate("rodando", {
      onSuccess: async () => {
        // Dispara imediatamente sem esperar o cron (1 min).
        try {
          console.log("[Disparo] Chamando dispatcher agora…");
          const r = await fetch("/api/public/hooks/blast-dispatcher", { method: "POST" });
          const j = (await r.json().catch(() => null)) as { results?: Array<{ campaign: string; sent: number; skipped?: string }> } | null;
          const mine = j?.results?.find((x) => x.campaign === camp.name);
          if (mine?.sent) {
            console.log(`[Disparo] Enviado com sucesso via dispatcher (${mine.skipped ?? ""})`);
            toast.success("Primeira mensagem enviada!");
          } else {
            console.log(`[Disparo] Dispatcher retornou sem envio: ${mine?.skipped ?? "sem detalhes"}`);
            toast.info(`Campanha iniciada. Próximo envio: ${mine?.skipped ?? "aguardando ciclo"}`);
          }
          qc.invalidateQueries({ queryKey: ["blast_contacts", camp.id] });
          qc.invalidateQueries({ queryKey: ["panel_contacts"] });
        } catch (e) {
          console.error("[Disparo] Falha ao chamar dispatcher:", e);
          toast.error(`Falha ao iniciar: ${(e as Error).message}`);
        }
      },
    });
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
            onClick={handleStart}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-primary-foreground"
            style={{ background: "var(--gradient-primary)" }}
          >
            <Play className="h-3.5 w-3.5" /> Iniciar
          </button>
          <button
            onClick={() => stateMut.mutate("pausado")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs hover:bg-muted"
          >
            <Pause className="h-3.5 w-3.5" /> Pausar
          </button>
          <button
            onClick={() => stateMut.mutate("parado")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs hover:bg-muted"
          >
            <Square className="h-3.5 w-3.5" /> Parar
          </button>
        </div>
      </div>

      {whatsapp_number_id && <NumberHealthCard numberId={whatsapp_number_id} />}

      <div className="grid gap-3 md:grid-cols-6">
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
        <Field label="Lista de contatos">
          <select
            value={contact_list_id}
            onChange={(e) => setListId(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
          >
            <option value="">Selecione…</option>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
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

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <ReportCard label="Total disparado" value={report?.sent ?? 0} />
        <ReportCard label="Taxa de resposta" value={`${report?.replyRate ?? 0}%`} />
        <ReportCard label="Convertidos" value={report?.converted ?? 0} />
        <ReportCard label="Sem resposta" value={report?.noReply ?? 0} />
      </div>

      <CampaignProgressCard
        contacts={contacts as BlastContactRow[]}
        camp={camp}
        effectiveLimit={effectiveLimitFromNumber()}
      />

      <ContactsRealtimeTable contacts={contacts as BlastContactRow[]} />
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

function isSentStatus(s: string) {
  return s === "enviado_abertura" || s === "enviado_d3" || s === "enviado_d7" || s === "respondeu" || s === "convertido";
}

function CampaignProgressCard({
  contacts,
  camp,
  effectiveLimit,
}: {
  contacts: BlastContactRow[];
  camp: BlastCampaign;
  effectiveLimit: number;
}) {
  const total = contacts.length;
  const sentTotal = contacts.filter((c) => isSentStatus(c.status)).length;
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const sentToday = contacts.filter(
    (c) => c.last_sent_at && new Date(c.last_sent_at).getTime() >= startOfDay.getTime(),
  ).length;
  const pending = contacts.filter((c) => c.status === "pendente").length;
  const remainingToday = Math.max(0, effectiveLimit - sentToday);
  const pct = total > 0 ? Math.round((sentTotal / total) * 100) : 0;
  const days = pending > 0 ? Math.max(1, Math.ceil(pending / Math.max(1, effectiveLimit))) : 0;

  // próximo disparo estimado
  const lastSent = contacts
    .map((c) => (c.last_sent_at ? new Date(c.last_sent_at).getTime() : 0))
    .reduce((a, b) => Math.max(a, b), 0);
  const avgDelaySec = Math.round((camp.delay_min_sec + camp.delay_max_sec) / 2);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const nextEtaSec =
    camp.state === "rodando" && lastSent > 0 && pending > 0
      ? Math.max(0, Math.round((lastSent + avgDelaySec * 1000 - now) / 1000))
      : null;

  const stateBadge =
    camp.state === "rodando"
      ? { label: "Em andamento", cls: "bg-success/20 text-success" }
      : camp.state === "pausado"
        ? { label: "Pausado", cls: "bg-warning/20 text-warning" }
        : { label: "Parado", cls: "bg-muted text-muted-foreground" };

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-semibold text-sm flex items-center gap-2">
          🚀 Progresso da Campanha — {camp.name}
        </h4>
        <span className={`rounded-full px-2.5 py-0.5 text-xs ${stateBadge.cls}`}>{stateBadge.label}</span>
      </div>
      <div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${pct}%`, background: "var(--gradient-primary)" }}
          />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {sentTotal}/{total} ({pct}%)
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 text-xs">
        <div className="rounded-md border border-border bg-background/60 p-2.5">
          <p className="text-muted-foreground">✅ Enviados hoje</p>
          <p className="text-base font-semibold">{sentToday}</p>
        </div>
        <div className="rounded-md border border-border bg-background/60 p-2.5">
          <p className="text-muted-foreground">⏳ Faltam hoje</p>
          <p className="text-base font-semibold">
            {remainingToday} <span className="text-xs font-normal text-muted-foreground">(limite {effectiveLimit}/dia)</span>
          </p>
        </div>
        <div className="rounded-md border border-border bg-background/60 p-2.5">
          <p className="text-muted-foreground">📅 Total restante</p>
          <p className="text-base font-semibold">{pending}</p>
        </div>
        <div className="rounded-md border border-border bg-background/60 p-2.5">
          <p className="text-muted-foreground">⏱️ Próximo disparo em</p>
          <p className="text-base font-semibold">
            {camp.state !== "rodando"
              ? "—"
              : nextEtaSec === null
                ? "aguardando"
                : nextEtaSec > 0
                  ? `${Math.floor(nextEtaSec / 60)}m ${nextEtaSec % 60}s`
                  : "a qualquer momento"}
          </p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        📆 Previsão de conclusão: {pending === 0 ? "concluído" : `${days} dia${days > 1 ? "s" : ""}`}
      </p>
    </div>
  );
}

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

  return (
    <section
      className="rounded-xl border border-border p-5"
      style={{ background: "var(--gradient-card)" }}
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">Números do ZapAgent</h2>
          <p className="text-xs text-muted-foreground">
            Ative o modo Disparo no número que será usado para campanhas. Apenas um número costuma ficar dedicado a disparos.
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
            return (
              <div
                key={n.id}
                className={`rounded-lg border p-4 transition-colors ${active ? "border-primary bg-primary/5" : "border-border bg-background/40"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{n.nome}</p>
                    <p className="text-xs mt-0.5">
                      <span className={connected ? "text-emerald-500" : "text-muted-foreground"}>
                        ● {connected ? "Conectado" : n.status}
                      </span>
                    </p>
                  </div>
                  {active && (
                    <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                      <Check className="h-3 w-3" /> Disparo
                    </span>
                  )}
                </div>
                <button
                  onClick={() => toggleMut.mutate({ id: n.id, disparos_mode: !active })}
                  disabled={toggleMut.isPending}
                  className={`mt-3 w-full rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${active ? "bg-primary text-primary-foreground" : "border border-border hover:bg-muted"}`}
                >
                  {active ? "Ativo para disparo" : "Ativar para disparo"}
                </button>
                {active && (
                  <div className="mt-3 space-y-2 border-t border-border pt-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Aquecimento</span>
                      <span className="font-medium">
                        {n.warmup_enabled ? (day === 0 ? "ainda não iniciou" : `Dia ${day} — ${todayLimit}/dia`) : "desativado"}
                      </span>
                    </div>
                    <label className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Aquecimento progressivo</span>
                      <input
                        type="checkbox"
                        checked={!!n.warmup_enabled}
                        onChange={(e) => toggleMut.mutate({ id: n.id, warmup_enabled: e.target.checked })}
                        className="h-4 w-4"
                      />
                    </label>
                    <label className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Pausar auto se houver risco</span>
                      <input
                        type="checkbox"
                        checked={!!n.auto_pause_on_risk}
                        onChange={(e) => toggleMut.mutate({ id: n.id, auto_pause_on_risk: e.target.checked })}
                        className="h-4 w-4"
                      />
                    </label>
                  </div>
                )}
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
  const exportFn = useServerFn(exportContactList);
  const { data: lists = [] } = useQuery({ queryKey: ["contact_lists"], queryFn: () => listFn() });

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
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  // Lista A (Meta Ads) à esquerda, Lista B (Instagram) à direita
  const sortedLists = [...lists].sort((a, b) => {
    if (a.origem === b.origem) return 0;
    return a.origem === "meta_ads" ? -1 : 1;
  });

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
  const [summary, setSummary] = useState<Record<string, { inserted: number; ignored_existing: number; invalid: number } | null>>({});
  const [importingFor, setImportingFor] = useState<string | null>(null);

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
        Duas listas independentes. <b>Lista A</b> recebe leads do Meta Ads automaticamente.
        <b> Lista B</b> é abastecida por CSV de Instagram. O sistema bloqueia números duplicados em qualquer lista
        ou já presentes em Contatos.
      </p>

      {/* Visão Geral da Base — soma Lista A + Lista B, atualiza em tempo real */}
      <div className="rounded-xl border border-border p-5 space-y-4" style={{ background: "var(--gradient-card)" }}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Visão Geral da Base</h3>
          </div>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Tempo real</span>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <OverviewStat icon={<Users className="h-4 w-4" />} label="Total na base" value={overview.total} tone="primary" />
          <OverviewStat icon={<Send className="h-4 w-4" />} label="Abordados" value={overview.contatados} />
          <OverviewStat
            icon={<MessageCircle className="h-4 w-4" />}
            label="Responderam"
            value={overview.respondeu}
            hint={`${pct(overview.respondeu, overview.contatados)}%`}
            tone="info"
          />
          <OverviewStat
            icon={<CheckCircle2 className="h-4 w-4" />}
            label="Converteram"
            value={overview.convertido}
            hint={`${pct(overview.convertido, overview.contatados)}%`}
            tone="success"
          />
          <OverviewStat icon={<Ban className="h-4 w-4" />} label="Sem resposta" value={semResposta} tone="warn" />
        </div>
        <div className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 ${convTone.bg}`}>
          <div className="flex items-center gap-2 text-sm">
            <BarChart3 className={`h-4 w-4 ${convTone.text}`} />
            <span className="text-muted-foreground">Taxa de conversão:</span>
            <span className={`font-semibold ${convTone.text}`}>{convRate}%</span>
            <span className="text-xs text-muted-foreground">
              ({overview.convertido} de {overview.respondeu} que responderam compraram)
            </span>
          </div>
          <button
            onClick={exportCombinedReport}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs hover:bg-muted"
          >
            <BarChart3 className="h-3.5 w-3.5" /> Exportar relatório
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Veja os detalhes individuais de cada lista nos cards abaixo.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {sortedLists.map((l) => {
          const rows = csvByList[l.id] ?? [];
          const sum = summary[l.id];
          const isMeta = l.origem === "meta_ads";
          const isActive = activeListIds.has(l.id);
          return (
            <div key={l.id} className="rounded-xl border border-border p-5 space-y-3" style={{ background: "var(--gradient-card)" }}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${isMeta ? "bg-blue-500/15 text-blue-500" : "bg-pink-500/15 text-pink-500"}`}>
                    {isMeta ? <Megaphone className="h-5 w-5" /> : <Instagram className="h-5 w-5" />}
                  </div>
                  <div>
                    <h3 className="font-semibold">{l.name}</h3>
                    <p className="text-xs text-muted-foreground">
                      Origem: <span className="font-medium">{isMeta ? "Meta Ads" : "Instagram"}</span> · {isMeta ? "automática" : "manual"}
                    </p>
                  </div>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    isActive ? "bg-emerald-500/15 text-emerald-500" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {isActive ? "● Ativa" : "○ Parada"}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center">
                <Stat label="Total" value={l.total} />
                <Stat label="Abordados" value={l.contatados} />
                <Stat label="Respondeu" value={l.respondeu} />
                <Stat label="Converteu" value={l.convertido} />
              </div>
              {l.total > 0 && (
                <div>
                  <button
                    onClick={() => setOpenContactsFor((v) => (v === l.id ? null : l.id))}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs hover:bg-muted"
                  >
                    <Eye className="h-3.5 w-3.5" /> {openContactsFor === l.id ? "Ocultar contatos" : "Ver contatos"}
                  </button>
                  {openContactsFor === l.id && <ListContactsTable listId={l.id} />}
                </div>
              )}
              <div className="space-y-2">
                {isMeta && (
                  <div className="rounded-lg border border-border bg-background/40 p-3 text-xs text-muted-foreground">
                    Alimentada automaticamente pelos leads do Meta Ads. Você também pode importar manualmente abaixo.
                  </div>
                )}
                <label className="block text-xs text-muted-foreground">Importar CSV (nome, telefone, instagram)</label>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const text = await f.text();
                    const parsed = parseCsv(text);
                    setCsvByList((m) => ({ ...m, [l.id]: parsed }));
                    if (parsed.length === 0) {
                      toast.error("CSV vazio ou cabeçalho inválido. Use colunas: nome, telefone, instagram");
                    } else {
                      toast.success(`${parsed.length} linhas detectadas no CSV`);
                    }
                    e.target.value = "";
                  }}
                  className="block w-full text-xs"
                />
                {rows.length > 0 && (
                  <p className="text-xs text-muted-foreground">{rows.length} linhas no CSV — clique em Importar.</p>
                )}
                {rows.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  <button
                    disabled={importingFor === l.id}
                    onClick={async () => {
                      setImportingFor(l.id);
                      try {
                        const res = await importFn({ data: { listId: l.id, rows } });
                        setSummary((m) => ({ ...m, [l.id]: res as never }));
                        setCsvByList((m) => ({ ...m, [l.id]: [] }));
                        qc.invalidateQueries({ queryKey: ["contact_lists"] });
                        qc.invalidateQueries({ queryKey: ["panel_contacts", l.id] });
                        qc.invalidateQueries({ queryKey: ["list_contacts_detail", l.id] });
                        toast.success(`${(res as { inserted: number }).inserted} contatos importados`);
                      } catch (err) {
                        toast.error(`Falha ao importar: ${(err as Error).message}`);
                      } finally {
                        setImportingFor(null);
                      }
                    }}
                    className={
                      isMeta
                        ? "inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50"
                        : "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                    }
                    style={isMeta ? undefined : { background: "var(--gradient-primary)" }}
                  >
                    <Plus className="h-3.5 w-3.5" /> {importingFor === l.id ? "Importando…" : "Importar"}
                  </button>
                </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={async () => {
                      const res = await exportFn({ data: { listId: l.id } });
                      const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url; a.download = `${l.name}.csv`; a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs hover:bg-muted"
                  >
                    <BarChart3 className="h-3.5 w-3.5" /> Exportar relatório
                  </button>
                  <button
                    onClick={async () => {
                      if (!confirm(`Limpar todos os contatos de "${l.name}"?`)) return;
                      await clearFn({ data: { listId: l.id } });
                      qc.invalidateQueries({ queryKey: ["contact_lists"] });
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/20"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Limpar lista
                  </button>
                </div>
                {sum && (
                  <p className="text-xs text-muted-foreground">
                    Inseridos: <b>{sum.inserted}</b> · Ignorados (já existem no sistema): <b>{sum.ignored_existing}</b> · Inválidos: <b>{sum.invalid}</b>
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

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