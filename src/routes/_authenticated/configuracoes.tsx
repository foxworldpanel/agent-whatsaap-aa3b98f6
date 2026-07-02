import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Settings, Save, Check, Gift, Play, FlaskConical, Plus, X } from "lucide-react";
import { getIntegrations, saveIntegrations, previewVoice } from "@/lib/agent.functions";
import { listTestNumbers, addTestNumber, removeTestNumber } from "@/lib/test-numbers.functions";

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

type IntFields = {
  uazapi_url: string; uazapi_token: string; uazapi_admin_token: string;
  anthropic_api_key: string; elevenlabs_api_key: string; elevenlabs_voice_id: string;
  openai_api_key: string;
};

const blankInt: IntFields = {
  uazapi_url: "", uazapi_token: "", uazapi_admin_token: "",
  anthropic_api_key: "", elevenlabs_api_key: "", elevenlabs_voice_id: "",
  openai_api_key: "",
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
  const [intFields, setIntFields] = useState<IntFields>(blankInt);
  const preview = useServerFn(previewVoice);
  const previewMut = useMutation({
    mutationFn: () => preview({ data: {} }),
    onSuccess: ({ audio }) => { new Audio(audio).play().catch(() => {}); },
  });

  const listTest = useServerFn(listTestNumbers);
  const addTest = useServerFn(addTestNumber);
  const rmTest = useServerFn(removeTestNumber);
  const testQ = useQuery({ queryKey: ["test_numbers"], queryFn: () => listTest() });
  const [newTest, setNewTest] = useState("");
  const addTestMut = useMutation({
    mutationFn: (phone: string) => addTest({ data: { phone } }),
    onSuccess: () => { setNewTest(""); qc.invalidateQueries({ queryKey: ["test_numbers"] }); },
  });
  const rmTestMut = useMutation({
    mutationFn: (id: string) => rmTest({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["test_numbers"] }),
  });

  useEffect(() => {
    if (intQ.data) {
      const d = intQ.data as Partial<SmmCfg & IntFields>;
      setCfg({
        smm_panel_url: d.smm_panel_url ?? blank.smm_panel_url,
        smm_api_key: d.smm_api_key ?? "",
        smm_service_id: d.smm_service_id ?? "",
        free_trial_enabled: !!d.free_trial_enabled,
      });
      setIntFields({
        ...blankInt,
        ...Object.fromEntries(
          (Object.keys(blankInt) as (keyof IntFields)[]).map((k) => [k, (d as any)[k] ?? ""]),
        ) as IntFields,
      });
    }
  }, [intQ.data]);

  const saveMut = useMutation({
    mutationFn: () => saveInt({ data: { ...(intQ.data ?? {}), ...intFields, ...cfg } as any }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["integrations"] }),
  });

  const intGroups: Array<{ title: string; status: boolean; fields: Array<[keyof IntFields, string, boolean?]> }> = [
    { title: "Uazapi", status: !!intFields.uazapi_url && !!intFields.uazapi_token, fields: [
      ["uazapi_url", "URL (ex: https://free.uazapi.com)"],
      ["uazapi_token", "Token da instância", true],
      ["uazapi_admin_token", "Admin Token (opcional)", true],
    ] },
    { title: "Claude (Anthropic)", status: !!intFields.anthropic_api_key, fields: [["anthropic_api_key", "API Key", true]] },
    { title: "ElevenLabs", status: !!intFields.elevenlabs_api_key, fields: [["elevenlabs_api_key", "API Key", true], ["elevenlabs_voice_id", "Voice ID"]] },
    { title: "Whisper (OpenAI)", status: !!intFields.openai_api_key, fields: [["openai_api_key", "API Key", true]] },
  ];

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

      <div className="grid gap-4 md:grid-cols-2">
        {intGroups.map((g) => (
          <div key={g.title} className="rounded-xl border border-border p-5" style={{ background: "var(--gradient-card)" }}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">{g.title}</h3>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs ${
                g.status ? "bg-success/20 text-success" : "bg-muted text-muted-foreground"
              }`}>
                <span className={`h-1.5 w-1.5 rounded-full ${g.status ? "bg-success" : "bg-muted-foreground"}`} />
                {g.status ? "conectado" : "desconectado"}
              </span>
            </div>
            <div className="mt-3 space-y-2">
              {g.fields.map(([key, label, secret]) => (
                <input
                  key={key}
                  value={intFields[key]}
                  onChange={(e) => setIntFields({ ...intFields, [key]: e.target.value })}
                  placeholder={label}
                  type={secret ? "password" : "text"}
                  className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs outline-none transition focus:border-primary"
                />
              ))}
            </div>
            {g.title === "ElevenLabs" && (
              <div className="mt-3 space-y-1">
                <button
                  type="button"
                  onClick={() => previewMut.mutate()}
                  disabled={previewMut.isPending || !intFields.elevenlabs_api_key || !intFields.elevenlabs_voice_id}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium transition hover:bg-muted disabled:opacity-50"
                >
                  <Play className="h-3 w-3" />
                  {previewMut.isPending ? "Gerando…" : "Testar voz"}
                </button>
                {previewMut.error && (
                  <p className="text-xs text-destructive">{(previewMut.error as Error).message}</p>
                )}
                <p className="text-[10px] text-muted-foreground">
                  Salve antes de testar — usa a chave e voz salvas no servidor.
                </p>
              </div>
            )}
          </div>
        ))}
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