import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Play, Pause, Square, Send, CheckCircle2, XCircle, MessageCircle, Plus, Trash2, Sparkles, AlertTriangle, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  listCampaigns,
  createCampaign,
  updateCampaignState,
  deleteCampaign,
  listCampaignLogs,
} from "@/lib/campaigns.functions";
import { getAgentConfig, saveAgentConfig } from "@/lib/agent.functions";
import { listNumbers } from "@/lib/numbers.functions";
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
        <button
          onClick={() => setShowAdd((s) => !s)}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-transform hover:scale-[1.02]"
          style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-glow)" }}
        >
          <Plus className="h-4 w-4" /> Nova campanha
        </button>
      </header>

      <ScriptsSection enabled={disparosActive} />

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
          <h2 className="font-semibold">Script de abordagem</h2>
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
          <p className="mt-1 text-xs text-muted-foreground">
            Use <code>{`{nome}`}</code> para personalizar com o nome do contato.
          </p>
        </>
      )}
    </section>
  );
}