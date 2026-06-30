import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Play, Pause, Square, Send, CheckCircle2, XCircle, MessageCircle, Plus, Trash2, Sparkles, AlertTriangle, Check, Repeat, Eye, BarChart3, History, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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
} from "@/lib/blast.functions";
import {
  listContactLists,
  importContactsToList,
  clearContactList,
  exportContactList,
} from "@/lib/contact-lists.functions";
import { profileLabel, type ContactProfile } from "@/lib/mock-data";

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
          <ScriptsSection enabled={disparosActive} />
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

type ScriptKey = "script_frio" | "script_inativo" | "script_ativo";
const scriptTabs: Array<{ id: ScriptKey; label: string }> = [
  { id: "script_frio", label: "Lead Frio" },
  { id: "script_inativo", label: "Cliente Inativo" },
  { id: "script_ativo", label: "Cliente Ativo" },
];

function ScriptsSection({ enabled }: { enabled: boolean }) {
  const qc = useQueryClient();
  const fetchCfg = useServerFn(getAgentConfig);
  const saveCfg = useServerFn(saveAgentConfig);
  const cfgQ = useQuery({ queryKey: ["agent_config"], queryFn: () => fetchCfg() });

  const [tab, setTab] = useState<ScriptKey>("script_frio");
  const [scripts, setScripts] = useState<Record<ScriptKey, string>>({
    script_frio: "",
    script_inativo: "",
    script_ativo: "",
  });

  useEffect(() => {
    if (cfgQ.data) {
      const d = cfgQ.data as Partial<Record<ScriptKey, string>>;
      setScripts({
        script_frio: d.script_frio ?? "",
        script_inativo: d.script_inativo ?? "",
        script_ativo: d.script_ativo ?? "",
      });
    }
  }, [cfgQ.data]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const base = (cfgQ.data ?? {}) as Record<string, unknown>;
      await saveCfg({ data: { ...base, ...scripts } as never });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agent_config"] }),
  });

  return (
    <section
      className="rounded-xl border border-border p-5"
      style={{ background: "var(--gradient-card)" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <div>
            <h2 className="font-semibold">Script do agente por perfil — usado após o cliente responder</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Quando o cliente responder a primeira mensagem, o agente Júlia usa esse script como base dependendo do perfil do contato.
            </p>
          </div>
        </div>
        {enabled && (
          <button
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
            style={{ background: "var(--gradient-primary)" }}
          >
            {saveMut.isSuccess && !saveMut.isPending ? <Check className="h-3.5 w-3.5" /> : null}
            {saveMut.isPending ? "Salvando…" : saveMut.isSuccess ? "Salvo!" : "Salvar scripts"}
          </button>
        )}
      </div>

      {!enabled ? (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Ative o Modo Disparos em pelo menos um número para configurar scripts.</p>
        </div>
      ) : (
        <>
          <div className="mt-4 flex gap-2">
            {scriptTabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                  tab === t.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <textarea
            value={scripts[tab]}
            onChange={(e) => setScripts({ ...scripts, [tab]: e.target.value })}
            rows={6}
            className="mt-4 w-full rounded-lg border border-border bg-background p-3 text-sm font-mono outline-none transition focus:border-primary"
            placeholder="Escreva o script de abordagem…"
          />
          <div className="mt-2"><PreviewButton template={scripts[tab]} /></div>
          <p className="mt-1 text-xs text-muted-foreground">
            Use <code>{`{nome}`}</code> para personalizar com o nome do contato.
          </p>
        </>
      )}
    </section>
  );
}

type BlastCampaign = {
  id: string;
  name: string;
  whatsapp_number_id: string | null;
  start_time: string;
  end_time: string;
  daily_limit: number;
  delay_min_sec: number;
  delay_max_sec: number;
  opening_message: string;
  followup_day3_message: string;
  followup_day7_message: string;
  state: "parado" | "rodando" | "pausado";
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
  numbers: Array<{ id: string; nome: string; warmup_started_at?: string | null; warmup_enabled?: boolean | null }>;
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
  const [start_time, setStart] = useState(camp.start_time.slice(0, 5));
  const [end_time, setEnd] = useState(camp.end_time.slice(0, 5));
  const [daily_limit, setLimit] = useState(camp.daily_limit);
  const [delay_min_sec, setMin] = useState(camp.delay_min_sec);
  const [delay_max_sec, setMax] = useState(camp.delay_max_sec);
  const [opening_message, setOpening] = useState(camp.opening_message);
  const [followup_day3_message, setD3] = useState(camp.followup_day3_message);
  const [followup_day7_message, setD7] = useState(camp.followup_day7_message);
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

  const saveMut = useMutation({
    mutationFn: () =>
      updateFn({
        data: {
          id: camp.id,
          whatsapp_number_id: whatsapp_number_id || null,
          start_time,
          end_time,
          daily_limit,
          delay_min_sec,
          delay_max_sec,
          opening_message,
          followup_day3_message,
          followup_day7_message,
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
    stateMut.mutate("rodando");
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
        <Field label="Primeira mensagem — enviada automaticamente pelo sistema">
          <p className="-mt-1 mb-2 text-xs text-muted-foreground">
            Essa mensagem é enviada automaticamente para cada contato da lista. Após o cliente responder, o agente Júlia assume a conversa.
          </p>
          <textarea
            value={opening_message}
            onChange={(e) => setOpening(e.target.value)}
            rows={4}
            className="w-full rounded-lg border border-border bg-background p-3 text-sm outline-none focus:border-primary"
          />
          <PreviewButton template={opening_message} />
        </Field>
        <Field label="Follow-up Dia 3">
          <textarea
            value={followup_day3_message}
            onChange={(e) => setD3(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-border bg-background p-3 text-sm outline-none focus:border-primary"
          />
          <PreviewButton template={followup_day3_message} />
        </Field>
        <Field label="Follow-up Dia 7">
          <textarea
            value={followup_day7_message}
            onChange={(e) => setD7(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-border bg-background p-3 text-sm outline-none focus:border-primary"
          />
          <PreviewButton template={followup_day7_message} />
        </Field>
        <p className="text-xs text-muted-foreground">
          Variáveis disponíveis: <code>{`{nome}`}</code> e <code>{`{instagram}`}</code>
        </p>
        <button
          onClick={() => saveMut.mutate()}
          disabled={saveMut.isPending}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          style={{ background: "var(--gradient-primary)" }}
        >
          {saveMut.isPending ? "Salvando…" : "Salvar configurações"}
        </button>
      </div>

      <div className="rounded-lg border border-border bg-background/50 p-4 space-y-3">
        <h4 className="font-semibold text-sm">Importar lista de contatos</h4>
        <p className="text-xs text-muted-foreground">
          CSV com colunas obrigatórias: <code>nome,telefone,instagram</code>. Opcionais:{" "}
          <code>prioridade</code> (número) e <code>ultima_interacao</code> (AAAA-MM-DD).
        </p>
        <div className="rounded-md border border-primary/30 bg-primary/5 p-2 text-[11px] leading-snug text-foreground/80">
          💡 <b>Dica:</b> contatos que comentaram ou curtiram seus posts recentemente têm muito mais
          chance de responder. Se tiver essa informação, adicione uma coluna{" "}
          <code>ultima_interacao</code> no CSV (formato <code>AAAA-MM-DD</code>) para priorizar
          esses contatos no disparo. Você também pode preencher <code>prioridade</code> manualmente
          (0 = normal, valores maiores disparam primeiro).
        </div>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const text = await f.text();
            setCsvRows(parseCsv(text));
            setCsvName(f.name);
            setImportSummary(null);
          }}
          className="text-sm"
        />
        {importSummary && (
          <div className="rounded-lg border border-success/40 bg-success/10 p-3 text-xs text-success">
            <b>{importSummary.inserted}</b> contatos importados.{" "}
            {(importSummary.removed.duplicates + importSummary.removed.invalid + importSummary.removed.blocked) > 0 && (
              <span className="text-warning">
                Removidos: {importSummary.removed.duplicates} duplicados, {importSummary.removed.invalid} inválidos,{" "}
                {importSummary.removed.blocked} bloqueados/clientes.
              </span>
            )}
          </div>
        )}
        {csvRows.length > 0 && (
          <>
            <p className="text-xs text-muted-foreground">
              {csvName}: <b className="text-foreground">{csvRows.length}</b> contatos detectados (preview 10 primeiros)
            </p>
            <div className="max-h-48 overflow-y-auto rounded border border-border">
              <table className="w-full text-xs">
                <thead className="bg-muted/30">
                  <tr>
                    <th className="px-2 py-1 text-left">Nome</th>
                    <th className="px-2 py-1 text-left">Telefone</th>
                    <th className="px-2 py-1 text-left">Instagram</th>
                    <th className="px-2 py-1 text-left">Prioridade</th>
                    <th className="px-2 py-1 text-left">Última interação</th>
                  </tr>
                </thead>
                <tbody>
                  {csvRows.slice(0, 10).map((r, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="px-2 py-1">{r.nome}</td>
                      <td className="px-2 py-1">{r.telefone}</td>
                      <td className="px-2 py-1">{r.instagram}</td>
                      <td className="px-2 py-1">{r.prioridade ?? "—"}</td>
                      <td className="px-2 py-1">{r.ultima_interacao ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              onClick={() => importMut.mutate()}
              disabled={importMut.isPending}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
              style={{ background: "var(--gradient-primary)" }}
            >
              {importMut.isPending ? "Importando…" : "Confirmar importação"}
            </button>
          </>
        )}
        {contacts.length > 0 && (
          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-muted-foreground">
              {contacts.length} contatos na fila desta campanha
            </span>
            <button
              onClick={() => {
                if (confirm("Remover todos os contatos desta campanha?")) clearMut.mutate();
              }}
              className="text-xs text-destructive hover:underline"
            >
              Limpar lista
            </button>
          </div>
        )}
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

  const [csvByList, setCsvByList] = useState<Record<string, CsvRow[]>>({});
  const [summary, setSummary] = useState<Record<string, { inserted: number; ignored_existing: number; invalid: number } | null>>({});

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
      <div className="grid gap-4 md:grid-cols-2">
        {lists.map((l) => {
          const rows = csvByList[l.id] ?? [];
          const sum = summary[l.id];
          const isMeta = l.origem === "meta_ads";
          return (
            <div key={l.id} className="rounded-xl border border-border p-5 space-y-3" style={{ background: "var(--gradient-card)" }}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold">{l.name}</h3>
                  <p className="text-xs text-muted-foreground">
                    Origem: <span className="font-medium">{isMeta ? "Meta Ads" : "Instagram"}</span>
                  </p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${isMeta ? "bg-blue-500/15 text-blue-500" : "bg-pink-500/15 text-pink-500"}`}>
                  {isMeta ? "automática" : "manual"}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center">
                <Stat label="Total" value={l.total} />
                <Stat label="Contatados" value={l.contatados} />
                <Stat label="Respondeu" value={l.respondeu} />
                <Stat label="Converteu" value={l.convertido} />
              </div>
              <div className="space-y-2">
                <label className="block text-xs text-muted-foreground">Importar CSV (nome, telefone, instagram)</label>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const text = await f.text();
                    setCsvByList((m) => ({ ...m, [l.id]: parseCsv(text) }));
                  }}
                  className="block w-full text-xs"
                />
                {rows.length > 0 && (
                  <p className="text-xs text-muted-foreground">{rows.length} linhas no CSV — clique em Importar.</p>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    disabled={rows.length === 0}
                    onClick={async () => {
                      const res = await importFn({ data: { listId: l.id, rows } });
                      setSummary((m) => ({ ...m, [l.id]: res as never }));
                      setCsvByList((m) => ({ ...m, [l.id]: [] }));
                      qc.invalidateQueries({ queryKey: ["contact_lists"] });
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                    style={{ background: "var(--gradient-primary)" }}
                  >
                    <Plus className="h-3.5 w-3.5" /> Importar
                  </button>
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