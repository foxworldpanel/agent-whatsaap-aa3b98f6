import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Phone, Plus, RefreshCw, Trash2, QrCode, X, Pencil, Check, Sparkles, ChevronDown } from "lucide-react";
import {
  listNumbers,
  createNumber,
  connectNumber,
  refreshNumberStatus,
  disconnectNumber,
  deleteNumber,
  updateNumberToggles,
} from "@/lib/numbers.functions";
import {
  listWelcomeFunnels,
  createWelcomeFunnel,
  updateWelcomeFunnel,
  deleteWelcomeFunnel,
} from "@/lib/welcome-funnels.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/numeros")({
  ssr: false,
  head: () => ({ meta: [{ title: "Números · ZapAgent" }] }),
  component: NumerosPage,
});

type Num = {
  id: string;
  nome: string;
  uazapi_url: string | null;
  status: string;
  meta_ads_enabled: boolean;
  disparos_mode: boolean;
  last_connected_at: string | null;
};

type FunnelSteps = {
  welcome_text?: { enabled?: boolean; text?: string; delay_seconds?: number };
  audio?: { enabled?: boolean; url?: string; delay_seconds?: number };
  panel_text?: { enabled?: boolean; text?: string; delay_seconds?: number };
  video?: { enabled?: boolean; url?: string; caption?: string; delay_seconds?: number };
  services_text?: { enabled?: boolean; text?: string; delay_seconds?: number };
};

type Funnel = {
  id: string;
  name: string;
  enabled: boolean;
  delay_seconds: number;
  trigger_keywords: string;
  steps: FunnelSteps | null;
  sort_order: number;
};

function StatusDot({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    conectado: { cls: "bg-emerald-500", label: "Conectado" },
    connected: { cls: "bg-emerald-500", label: "Conectado" },
    desconectado: { cls: "bg-neutral-400", label: "Desconectado" },
    disconnected: { cls: "bg-neutral-400", label: "Desconectado" },
    pendente: { cls: "bg-amber-500", label: "Pendente" },
    connecting: { cls: "bg-amber-500", label: "Conectando" },
  };
  const m = map[status] ?? { cls: "bg-neutral-300", label: status || "—" };
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-neutral-600">
      <span className={`h-2 w-2 rounded-full ${m.cls}`} />
      {m.label}
    </span>
  );
}

function NumerosPage() {
  const qc = useQueryClient();
  const fetchList = useServerFn(listNumbers);
  const createFn = useServerFn(createNumber);
  const connectFn = useServerFn(connectNumber);
  const refreshFn = useServerFn(refreshNumberStatus);
  const disconnectFn = useServerFn(disconnectNumber);
  const deleteFn = useServerFn(deleteNumber);
  const updateFn = useServerFn(updateNumberToggles);

  const numsQ = useQuery({
    queryKey: ["whatsapp_numbers"],
    queryFn: () => fetchList(),
    refetchInterval: 5000,
  });
  const nums = (numsQ.data ?? []) as Num[];

  const [showAdd, setShowAdd] = useState(false);
  const [qrFor, setQrFor] = useState<{ id: string; qr: string | null } | null>(null);

  const createMut = useMutation({
    mutationFn: (input: { nome: string; uazapi_url: string; uazapi_admin_token: string; uazapi_token: string; meta_ads_enabled: boolean; disparos_mode: boolean }) =>
      createFn({ data: input }),
    onSuccess: async (res: { id: string; linked?: boolean }) => {
      qc.invalidateQueries({ queryKey: ["whatsapp_numbers"] });
      setShowAdd(false);
      // Só pede QR quando criamos nova instância; instâncias vinculadas já estão conectadas.
      if (!res.linked) {
        const r = await connectFn({ data: { id: res.id } });
        setQrFor({ id: res.id, qr: r.qrcode });
      }
    },
  });

  const connectMut = useMutation({
    mutationFn: (id: string) => connectFn({ data: { id } }),
    onSuccess: (r, id) => setQrFor({ id, qr: r.qrcode }),
  });

  const disconnectMut = useMutation({
    mutationFn: (id: string) => disconnectFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["whatsapp_numbers"] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["whatsapp_numbers"] }),
  });

  const refreshMut = useMutation({
    mutationFn: (id: string) => refreshFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["whatsapp_numbers"] }),
  });

  const toggleMut = useMutation({
    mutationFn: (input: { id: string; meta_ads_enabled?: boolean; disparos_mode?: boolean; nome?: string }) =>
      updateFn({ data: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["whatsapp_numbers"] }),
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Configurações</p>
          <h1 className="text-3xl font-bold tracking-tight">Números</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Conecte um ou mais números de WhatsApp via Uazapi. Cada número tem suas próprias conversas e configurações de comportamento.
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> Adicionar número
        </button>
      </header>

      {numsQ.isLoading && <p className="text-sm text-neutral-500">Carregando…</p>}
      {!numsQ.isLoading && nums.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-white p-10 text-center">
          <Phone className="mx-auto h-8 w-8 text-neutral-400" />
          <p className="mt-3 text-sm text-neutral-600">Nenhum número conectado ainda.</p>
          <button
            onClick={() => setShowAdd(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> Adicionar primeiro número
          </button>
        </div>
      )}

      <div className="grid gap-3">
        {nums.map((n) => (
          <div key={n.id} className="rounded-xl border border-border bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  <Phone className="h-5 w-5" />
                </div>
                <div>
                  {editingId === n.id ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const nome = editingName.trim();
                        if (nome && nome !== n.nome) toggleMut.mutate({ id: n.id, nome });
                        setEditingId(null);
                      }}
                      className="flex items-center gap-2"
                    >
                      <input
                        autoFocus
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onBlur={() => setEditingId(null)}
                        className="rounded-md border border-border px-2 py-1 text-sm"
                      />
                      <button
                        type="submit"
                        onMouseDown={(e) => e.preventDefault()}
                        className="rounded p-1 text-emerald-600 hover:bg-emerald-50"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                    </form>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <h2 className="text-base font-semibold text-neutral-900">{n.nome}</h2>
                      <button
                        onClick={() => {
                          setEditingId(n.id);
                          setEditingName(n.nome);
                        }}
                        title="Renomear"
                        className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                  <div className="mt-0.5 flex items-center gap-3">
                    <StatusDot status={n.status} />
                    <span className="text-xs text-neutral-400">{n.uazapi_url}</span>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => refreshMut.mutate(n.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Atualizar
                </button>
                <button
                  onClick={() => connectMut.mutate(n.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                >
                  <QrCode className="h-3.5 w-3.5" /> Conectar
                </button>
                {(n.status === "conectado" || n.status === "connected") && (
                  <button
                    onClick={() => disconnectMut.mutate(n.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100"
                  >
                    Desconectar
                  </button>
                )}
                <button
                  onClick={() => {
                    if (confirm(`Excluir o número "${n.nome}"? As conversas serão mantidas, mas o número será removido.`)) {
                      deleteMut.mutate(n.id);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <Toggle
                label="Receber leads Meta Ads"
                help="Contatos que chegarem por este número serão marcados como leads de campanha."
                checked={n.meta_ads_enabled}
                onChange={(v) => toggleMut.mutate({ id: n.id, meta_ads_enabled: v })}
              />
              <Toggle
                label="Modo Disparos"
                help="Use este número para abordar contatos proativamente. O agente IA não responde inbound automaticamente."
                checked={n.disparos_mode}
                onChange={(v) => toggleMut.mutate({ id: n.id, disparos_mode: v })}
              />
            </div>

            <WelcomeFunnelsSection whatsappNumberId={n.id} />
          </div>
        ))}
      </div>

      {showAdd && (
        <AddNumberModal
          onClose={() => setShowAdd(false)}
          onCreate={(input) => createMut.mutate(input)}
          submitting={createMut.isPending}
          error={createMut.error?.message ?? null}
        />
      )}

      {qrFor && (
        <QrModal
          qr={qrFor.qr}
          onClose={() => {
            setQrFor(null);
            qc.invalidateQueries({ queryKey: ["whatsapp_numbers"] });
          }}
          onRefresh={() => refreshMut.mutate(qrFor.id)}
        />
      )}
    </div>
  );
}

function Toggle({
  label,
  help,
  checked,
  onChange,
}: {
  label: string;
  help: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-neutral-50 p-3">
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition ${
          checked ? "bg-emerald-500" : "bg-neutral-300"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
            checked ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </button>
      <div>
        <p className="text-sm font-medium text-neutral-900">{label}</p>
        <p className="text-xs text-neutral-500">{help}</p>
      </div>
    </label>
  );
}

function AddNumberModal({
  onClose,
  onCreate,
  submitting,
  error,
}: {
  onClose: () => void;
  onCreate: (input: { nome: string; uazapi_url: string; uazapi_admin_token: string; uazapi_token: string; meta_ads_enabled: boolean; disparos_mode: boolean }) => void;
  submitting: boolean;
  error: string | null;
}) {
  const [nome, setNome] = useState("");
  const [url, setUrl] = useState("https://free.uazapi.com");
  const [admin, setAdmin] = useState("");
  const [instanceToken, setInstanceToken] = useState("");
  const [meta, setMeta] = useState(false);
  const [disparos, setDisparos] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-lg">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-neutral-900">Adicionar número</h3>
          <button onClick={onClose} className="rounded p-1 hover:bg-neutral-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 space-y-3">
          <Field label="Nome" hint="Ex.: Campanha Meta, Disparos, Atendimento">
            <input value={nome} onChange={(e) => setNome(e.target.value)} className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
          </Field>
          <Field label="URL da Uazapi" hint="Ex.: https://free.uazapi.com">
            <input value={url} onChange={(e) => setUrl(e.target.value)} className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
          </Field>
          <Field label="Admin Token (opcional)" hint="Use quando quiser criar uma nova instância. Deixe vazio se já tem uma instância criada na Uazapi.">
            <input value={admin} onChange={(e) => setAdmin(e.target.value)} className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
          </Field>
          <Field label="Instance Token (opcional)" hint="Token da instância já existente na Uazapi. Se preenchido, apenas vincula — não cria nova.">
            <input value={instanceToken} onChange={(e) => setInstanceToken(e.target.value)} placeholder="ex: 16c0bb07-b3e7-4070-..." className="w-full rounded-lg border border-border px-3 py-2 text-sm font-mono" />
          </Field>
          <div className="grid gap-2 sm:grid-cols-2">
            <Toggle label="Receber leads Meta Ads" help="Marca contatos como meta_ads" checked={meta} onChange={setMeta} />
            <Toggle label="Modo Disparos" help="Não responde inbound" checked={disparos} onChange={setDisparos} />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-border px-3 py-2 text-sm">Cancelar</button>
          <button
            disabled={!nome || !url || (!admin && !instanceToken) || submitting}
            onClick={() =>
              onCreate({ nome, uazapi_url: url, uazapi_admin_token: admin, uazapi_token: instanceToken.trim(), meta_ads_enabled: meta, disparos_mode: disparos })
            }
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {submitting ? "Salvando…" : instanceToken ? "Vincular instância" : "Criar e mostrar QR"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-neutral-700">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-neutral-500">{hint}</p>}
    </div>
  );
}

function QrModal({ qr, onClose, onRefresh }: { qr: string | null; onClose: () => void; onRefresh: () => void }) {
  // re-renderiza a cada 5s pra refletir o status
  useEffect(() => {
    const i = setInterval(onRefresh, 5000);
    return () => clearInterval(i);
  }, [onRefresh]);
  const src = qr
    ? qr.startsWith("data:") || qr.startsWith("http")
      ? qr
      : `data:image/png;base64,${qr}`
    : null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-5 text-center shadow-lg">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-neutral-900">Escaneie no WhatsApp</h3>
          <button onClick={onClose} className="rounded p-1 hover:bg-neutral-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-2 text-xs text-neutral-500">Abra o WhatsApp → Aparelhos conectados → Conectar um aparelho.</p>
        {src ? (
          <img src={src} alt="QR" className="mx-auto mt-4 h-64 w-64 rounded-lg border border-border object-contain" />
        ) : (
          <p className="mt-6 text-sm text-neutral-500">QR não disponível. Clique em "Atualizar" no número.</p>
        )}
        <button onClick={onClose} className="mt-5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
          Concluir
        </button>
      </div>
    </div>
  );
}
function WelcomeFunnelsSection({ whatsappNumberId }: { whatsappNumberId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listWelcomeFunnels);
  const createFn = useServerFn(createWelcomeFunnel);
  const deleteFn = useServerFn(deleteWelcomeFunnel);
  const [open, setOpen] = useState(false);
  const key = ["welcome_funnels", whatsappNumberId];

  const q = useQuery({
    queryKey: key,
    queryFn: () => listFn({ data: { whatsapp_number_id: whatsappNumberId } }),
    enabled: open,
  });
  const funnels = (q.data ?? []) as Funnel[];

  const createMut = useMutation({
    mutationFn: () => createFn({ data: { whatsapp_number_id: whatsappNumberId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const activeCount = funnels.filter((f) => f.enabled).length;

  return (
    <div className="mt-3 rounded-lg border border-border bg-neutral-50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-violet-600" />
          <span className="text-sm font-medium text-neutral-900">Funis de boas-vindas</span>
          {open && activeCount > 0 && (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
              {activeCount} ativo{activeCount > 1 ? "s" : ""}
            </span>
          )}
        </div>
        <ChevronDown className={`h-4 w-4 text-neutral-400 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="space-y-3 border-t border-border p-3">
          <p className="text-xs text-neutral-500">
            Crie quantos funis quiser. Cada um tem seus próprios <strong>gatilhos</strong> (palavras-chave). Quando a mensagem do cliente contém um gatilho, o funil correspondente dispara — uma vez por contato.
          </p>

          {q.isLoading && <p className="text-xs text-neutral-500">Carregando funis…</p>}

          {funnels.map((f) => (
            <FunnelEditor
              key={f.id}
              funnel={f}
              onChanged={() => qc.invalidateQueries({ queryKey: key })}
              onDelete={() => {
                if (confirm(`Excluir o funil "${f.name}"?`)) deleteMut.mutate(f.id);
              }}
            />
          ))}

          <button
            type="button"
            onClick={() => createMut.mutate()}
            disabled={createMut.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border bg-white px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
          >
            <Plus className="h-3.5 w-3.5" /> Novo funil
          </button>
        </div>
      )}
    </div>
  );
}

function FunnelEditor({
  funnel,
  onChanged,
  onDelete,
}: {
  funnel: Funnel;
  onChanged: () => void;
  onDelete: () => void;
}) {
  const updateFn = useServerFn(updateWelcomeFunnel);
  const [draft, setDraft] = useState<Funnel>(funnel);

  useEffect(() => {
    setDraft(funnel);
  }, [funnel]);

  const saveMut = useMutation({
    mutationFn: () =>
      updateFn({
        data: {
          id: draft.id,
          name: draft.name?.trim() || "Novo funil",
          enabled: draft.enabled,
          delay_seconds: draft.delay_seconds,
          trigger_keywords: draft.trigger_keywords,
          steps: draft.steps ?? {},
        },
      }),
    onSuccess: onChanged,
  });

  const updateStep = <K extends keyof FunnelSteps>(key: K, patch: Partial<NonNullable<FunnelSteps[K]>>) => {
    setDraft((d) => ({
      ...d,
      steps: { ...(d.steps ?? {}), [key]: { ...((d.steps ?? {})[key] ?? {}), ...patch } },
    }));
  };

  const steps = draft.steps ?? {};

  return (
    <div className="space-y-3 rounded-lg border border-border bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <input
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          placeholder="Nome do funil"
          className="flex-1 rounded-md border border-border px-2 py-1 text-sm font-medium"
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setDraft((d) => ({ ...d, enabled: !d.enabled }))}
            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition ${
              draft.enabled ? "bg-emerald-500" : "bg-neutral-300"
            }`}
            title={draft.enabled ? "Ativo" : "Desativado"}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
                draft.enabled ? "translate-x-4" : "translate-x-0.5"
              }`}
            />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded p-1 text-red-500 hover:bg-red-50"
            title="Excluir funil"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-neutral-700">Gatilhos (palavras-chave)</label>
        <input
          value={draft.trigger_keywords}
          onChange={(e) => setDraft((d) => ({ ...d, trigger_keywords: e.target.value }))}
          placeholder="ex: spotify, playlist, plays"
          className="mt-1 w-full rounded-md border border-border px-2 py-1.5 text-sm"
        />
        <p className="mt-1 text-[11px] text-neutral-500">Separe por vírgula. A mensagem do cliente que contiver qualquer uma delas aciona este funil.</p>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-xs font-medium text-neutral-700">Delay entre mensagens (seg)</label>
        <input
          type="number"
          min={0}
          max={180}
          value={draft.delay_seconds}
          onChange={(e) => setDraft((d) => ({ ...d, delay_seconds: Math.max(0, Math.min(180, Number(e.target.value) || 0)) }))}
          className="w-20 rounded-md border border-border px-2 py-1 text-sm"
        />
      </div>

      <FunnelStep
        title="1. Texto de boas-vindas"
        enabled={!!steps.welcome_text?.enabled}
        onToggle={(v) => updateStep("welcome_text", { enabled: v })}
        delay={steps.welcome_text?.delay_seconds ?? draft.delay_seconds}
        onDelay={(v) => updateStep("welcome_text", { delay_seconds: v })}
        delayHint="Tempo entre o gatilho do cliente e esta mensagem"
      >
        <textarea
          value={steps.welcome_text?.text ?? ""}
          onChange={(e) => updateStep("welcome_text", { text: e.target.value })}
          rows={2}
          className="w-full rounded-md border border-border px-2 py-1.5 text-sm"
        />
      </FunnelStep>

      <FunnelStep
        title="2. Áudio (URL ou upload)"
        enabled={!!steps.audio?.enabled}
        onToggle={(v) => updateStep("audio", { enabled: v })}
        delay={steps.audio?.delay_seconds ?? draft.delay_seconds}
        onDelay={(v) => updateStep("audio", { delay_seconds: v })}
        delayHint="Tempo entre a mensagem anterior e este áudio"
      >
        <MediaInput
          value={steps.audio?.url ?? ""}
          onChange={(url) => updateStep("audio", { url })}
          accept="audio/mpeg,audio/mp3,audio/ogg,.mp3,.ogg"
          placeholder="https://… .mp3 / .ogg"
          kind="áudio"
        />
      </FunnelStep>

      <FunnelStep
        title="3. Texto com link do painel"
        enabled={!!steps.panel_text?.enabled}
        onToggle={(v) => updateStep("panel_text", { enabled: v })}
        delay={steps.panel_text?.delay_seconds ?? draft.delay_seconds}
        onDelay={(v) => updateStep("panel_text", { delay_seconds: v })}
        delayHint="Tempo entre a mensagem anterior e este texto"
      >
        <textarea
          value={steps.panel_text?.text ?? ""}
          onChange={(e) => updateStep("panel_text", { text: e.target.value })}
          rows={2}
          className="w-full rounded-md border border-border px-2 py-1.5 text-sm"
        />
      </FunnelStep>

      <FunnelStep
        title="4. Vídeo (URL ou upload)"
        enabled={!!steps.video?.enabled}
        onToggle={(v) => updateStep("video", { enabled: v })}
        delay={steps.video?.delay_seconds ?? draft.delay_seconds}
        onDelay={(v) => updateStep("video", { delay_seconds: v })}
        delayHint="Tempo entre a mensagem anterior e este vídeo"
      >
        <MediaInput
          value={steps.video?.url ?? ""}
          onChange={(url) => updateStep("video", { url })}
          accept="video/mp4,.mp4"
          placeholder="https://… .mp4"
          kind="vídeo"
        />
        <textarea
          value={steps.video?.caption ?? ""}
          onChange={(e) => updateStep("video", { caption: e.target.value })}
          rows={2}
          maxLength={1024}
          placeholder="Legenda do vídeo (opcional)"
          className="mt-2 w-full rounded-md border border-border px-2 py-1.5 text-sm"
        />
      </FunnelStep>

      <FunnelStep
        title="5. Texto com tabela de serviços"
        enabled={!!steps.services_text?.enabled}
        onToggle={(v) => updateStep("services_text", { enabled: v })}
        delay={steps.services_text?.delay_seconds ?? draft.delay_seconds}
        onDelay={(v) => updateStep("services_text", { delay_seconds: v })}
        delayHint="Tempo entre a mensagem anterior e este texto"
      >
        <textarea
          value={steps.services_text?.text ?? ""}
          onChange={(e) => updateStep("services_text", { text: e.target.value })}
          rows={3}
          className="w-full rounded-md border border-border px-2 py-1.5 text-sm"
        />
      </FunnelStep>

      <div className="flex justify-end">
        {saveMut.isError && (
          <p className="mr-3 self-center text-xs text-red-600">
            Erro ao salvar: {(saveMut.error as Error)?.message ?? "tente novamente"}
          </p>
        )}
        <button
          type="button"
          onClick={() => saveMut.mutate()}
          disabled={saveMut.isPending}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {saveMut.isPending ? "Salvando…" : "Salvar funil"}
        </button>
      </div>
    </div>
  );
}

function FunnelStep({
  title,
  enabled,
  onToggle,
  delay,
  onDelay,
  delayHint,
  children,
}: {
  title: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  delay?: number;
  onDelay?: (v: number) => void;
  delayHint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border bg-white p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-neutral-800">{title}</p>
        <button
          type="button"
          onClick={() => onToggle(!enabled)}
          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition ${
            enabled ? "bg-emerald-500" : "bg-neutral-300"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
              enabled ? "translate-x-4" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>
      {enabled && (
        <div className="mt-2 space-y-2">
          {onDelay && (
            <div className="flex items-center gap-2">
              <label className="text-[11px] font-medium text-neutral-600">Aguardar antes (seg)</label>
              <input
                type="number"
                min={0}
                max={180}
                value={delay ?? 3}
                onChange={(e) => onDelay(Math.max(0, Math.min(180, Number(e.target.value) || 0)))}
                className="w-20 rounded-md border border-border px-2 py-1 text-sm"
              />
              {delayHint && <span className="text-[11px] text-neutral-500">{delayHint}</span>}
            </div>
          )}
          {children}
        </div>
      )}
    </div>
  );
}

function MediaInput({
  value,
  onChange,
  accept,
  placeholder,
  kind,
}: {
  value: string;
  onChange: (url: string) => void;
  accept: string;
  placeholder: string;
  kind: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isUploaded = !!value && !value.startsWith("data:") && value.includes("/storage/v1/");
  const onFile = async (file: File) => {
    setError(null);
    setLoading(true);
    try {
      const { data: userData, error: uerr } = await supabase.auth.getUser();
      if (uerr || !userData.user) throw new Error("Sessão expirada");
      const ext = file.name.split(".").pop() || "bin";
      const path = `${userData.user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("funnel-media")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      const { data: signed, error: sErr } = await supabase.storage
        .from("funnel-media")
        .createSignedUrl(path, 60 * 60 * 24 * 365);
      if (sErr || !signed) throw sErr ?? new Error("Falha ao gerar URL");
      onChange(signed.signedUrl);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="space-y-1.5">
      <input
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          if (v.startsWith("data:")) {
            setError("Não cole o arquivo aqui — use o botão de upload abaixo");
            return;
          }
          if (v.length > 2000) {
            setError("URL muito longa");
            return;
          }
          setError(null);
          onChange(v);
        }}
        placeholder={placeholder}
        className="w-full rounded-md border border-border px-2 py-1.5 text-sm"
      />
      <div className="flex items-center gap-2">
        <input
          type="file"
          accept={accept}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
          className="text-xs"
        />
        {loading && <span className="text-xs text-neutral-500">Carregando…</span>}
        {isUploaded && !loading && (
          <span className="text-xs text-emerald-600">{kind} carregado ✓</span>
        )}
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </div>
  );
}
