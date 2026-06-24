import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Settings, Save, Check, Gift } from "lucide-react";
import { getIntegrations, saveIntegrations } from "@/lib/agent.functions";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  ssr: false,
  head: () => ({ meta: [{ title: "Configurações · ZapAgent" }] }),
  component: ConfiguracoesPage,
});

type SmmCfg = {
  smm_panel_url: string;
  smm_api_key: string;
  smm_service_id: string;
  free_trial_enabled: boolean;
};

const blank: SmmCfg = {
  smm_panel_url: "https://mindsmmpanel.com/smmpanel/api/v1",
  smm_api_key: "",
  smm_service_id: "",
  free_trial_enabled: false,
};

function ConfiguracoesPage() {
  const qc = useQueryClient();
  const fetchInt = useServerFn(getIntegrations);
  const saveInt = useServerFn(saveIntegrations);
  const intQ = useQuery({ queryKey: ["integrations"], queryFn: () => fetchInt() });

  const [cfg, setCfg] = useState<SmmCfg>(blank);

  useEffect(() => {
    if (intQ.data) {
      const d = intQ.data as Partial<SmmCfg>;
      setCfg({
        smm_panel_url: d.smm_panel_url ?? blank.smm_panel_url,
        smm_api_key: d.smm_api_key ?? "",
        smm_service_id: d.smm_service_id ?? "",
        free_trial_enabled: !!d.free_trial_enabled,
      });
    }
  }, [intQ.data]);

  const saveMut = useMutation({
    mutationFn: () => saveInt({ data: { ...(intQ.data ?? {}), ...cfg } as any }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["integrations"] }),
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Provedor SMM & Teste Grátis</p>
          <h1 className="text-3xl font-bold tracking-tight">Configurações</h1>
        </div>
        <button
          onClick={() => saveMut.mutate()}
          disabled={saveMut.isPending}
          className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-transform hover:scale-[1.02] disabled:opacity-60"
          style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-glow)" }}
        >
          {saveMut.isSuccess && !saveMut.isPending ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {saveMut.isPending ? "Salvando…" : saveMut.isSuccess ? "Salvo!" : "Salvar"}
        </button>
      </header>

      <div className="rounded-xl border border-border p-6 space-y-5" style={{ background: "var(--gradient-card)" }}>
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">API do Provedor MIND SMM</h2>
        </div>

        <Field
          label="URL do painel (API)"
          value={cfg.smm_panel_url}
          onChange={(v) => setCfg({ ...cfg, smm_panel_url: v })}
          placeholder="https://mindsmmpanel.com/smmpanel/api/v1"
        />
        <Field
          label="API Key do provedor"
          value={cfg.smm_api_key}
          onChange={(v) => setCfg({ ...cfg, smm_api_key: v })}
          placeholder="Sua chave da API MIND SMM"
          secret
        />
        <Field
          label="ID do serviço (views YouTube/Instagram)"
          value={cfg.smm_service_id}
          onChange={(v) => setCfg({ ...cfg, smm_service_id: v })}
          placeholder="ex: 1"
        />

        <div className="border-t border-border pt-5">
          <div className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">Teste Grátis</h2>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Quando ativo, o agente envia automaticamente 100 views grátis para clientes que mandarem link do Instagram/YouTube.
          </p>
          <button
            type="button"
            onClick={() => setCfg({ ...cfg, free_trial_enabled: !cfg.free_trial_enabled })}
            className={`mt-4 flex h-7 w-12 items-center rounded-full transition ${cfg.free_trial_enabled ? "bg-primary" : "bg-muted"}`}
          >
            <span className={`block h-5 w-5 rounded-full bg-white transition-transform ${cfg.free_trial_enabled ? "translate-x-6" : "translate-x-1"}`} />
          </button>
          <p className="mt-2 text-xs text-muted-foreground">
            {cfg.free_trial_enabled ? "Ativado — envia testes grátis automaticamente" : "Desativado"}
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, placeholder, secret,
}: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; secret?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      <input
        type={secret ? "password" : "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary"
      />
    </label>
  );
}