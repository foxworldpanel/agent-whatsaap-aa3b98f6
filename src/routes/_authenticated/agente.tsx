import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bot, Save, Mic, Link2, Sparkles, Check, Play, Clock } from "lucide-react";
import { getAgentConfig, saveAgentConfig, getIntegrations, saveIntegrations, previewVoice } from "@/lib/agent.functions";

export const Route = createFileRoute("/_authenticated/agente")({
  ssr: false,
  head: () => ({ meta: [{ title: "Agente IA · ZapAgent" }] }),
  component: AgentePage,
});

const defaultConfig = {
  agent_name: "Júlia",
  tone: "Amigável e informal",
  base_instruction: "Você é a Júlia, vendedora do painel SMM. Aborde clientes como humano, mensagens curtas (máx 2 linhas), usa emojis com moderação. Nunca oferece produto na primeira mensagem.",
  script_frio: "Oi {nome}! Tudo bem? 😊\n\nVi seu canal e curti o conteúdo! Tenho uma promo testando — 500 views por R$5 só pra dar aquele empurrão. Topa?",
  script_inativo: "Oi {nome}! Sumiu hein 😄 Tudo bem?\n\nTenho uma oferta especial pra te trazer de volta — 500 views por R$5. Topa testar?",
  script_ativo: "Oi {nome}! Suas views foram entregues certinho? 😊\n\nTenho um pacote de 2.000 views por R$18 pra você turbinar mais. Quer?",
  panel_link: "https://painel.smm.com/u/123",
  main_offer: "500 views por R$5",
  audio_enabled: true,
  response_delay_min_sec: 30,
  response_delay_max_sec: 180,
  typing_indicator_enabled: true,
};

type Cfg = typeof defaultConfig;

function AgentePage() {
  const qc = useQueryClient();
  const fetchCfg = useServerFn(getAgentConfig);
  const fetchInt = useServerFn(getIntegrations);
  const saveCfg = useServerFn(saveAgentConfig);
  const saveInt = useServerFn(saveIntegrations);

  const cfgQ = useQuery({ queryKey: ["agent_config"], queryFn: () => fetchCfg() });
  const intQ = useQuery({ queryKey: ["integrations"], queryFn: () => fetchInt() });
  const preview = useServerFn(previewVoice);
  const previewMut = useMutation({
    mutationFn: () => preview({ data: {} }),
    onSuccess: ({ audio }) => {
      new Audio(audio).play().catch(() => {});
    },
  });

  const [cfg, setCfg] = useState<Cfg>(defaultConfig);
  const [activeTab, setActiveTab] = useState<"ativo" | "frio" | "inativo">("frio");
  const [intFields, setIntFields] = useState<IntFields | null>(null);

  useEffect(() => {
    if (cfgQ.data) {
      const d = cfgQ.data as Partial<Cfg>;
      setCfg({
        ...defaultConfig,
        ...d,
        panel_link: d.panel_link ?? "",
      });
    }
  }, [cfgQ.data]);

  const saveMut = useMutation({
    mutationFn: async () => {
      await saveCfg({ data: cfg });
      if (intFields) await saveInt({ data: intFields });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agent_config"] });
      qc.invalidateQueries({ queryKey: ["integrations"] });
    },
  });

  const scriptKey = activeTab === "frio" ? "script_frio" : activeTab === "inativo" ? "script_inativo" : "script_ativo";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Cérebro do agente</p>
          <h1 className="text-3xl font-bold tracking-tight">Agente IA</h1>
        </div>
        <button
          onClick={() => saveMut.mutate()}
          disabled={saveMut.isPending}
          className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-transform hover:scale-[1.02] disabled:opacity-60"
          style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-glow)" }}
        >
          {saveMut.isSuccess && !saveMut.isPending ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {saveMut.isPending ? "Salvando…" : saveMut.isSuccess ? "Salvo!" : "Salvar configurações"}
        </button>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6 rounded-xl border border-border p-6" style={{ background: "var(--gradient-card)" }}>
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">Personalidade</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Nome do agente" value={cfg.agent_name} onChange={(v) => setCfg({ ...cfg, agent_name: v })} />
            <Field label="Tom de voz" value={cfg.tone} onChange={(v) => setCfg({ ...cfg, tone: v })} />
          </div>

          <Field label="Instrução base" multiline value={cfg.base_instruction} onChange={(v) => setCfg({ ...cfg, base_instruction: v })} />

          <div className="border-t border-border pt-6">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">Scripts por perfil</h2>
            </div>

            <div className="mt-4 flex gap-2">
              {(["frio", "inativo", "ativo"] as const).map((t) => (
                <button key={t} onClick={() => setActiveTab(t)}
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                    activeTab === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}>
                  {t === "ativo" ? "Cliente Ativo" : t === "frio" ? "Lead Frio" : "Cliente Inativo"}
                </button>
              ))}
            </div>

            <textarea
              value={cfg[scriptKey]}
              onChange={(e) => setCfg({ ...cfg, [scriptKey]: e.target.value })}
              rows={6}
              className="mt-4 w-full rounded-lg border border-border bg-background p-3 text-sm font-mono outline-none transition focus:border-primary"
            />
            <p className="mt-1 text-xs text-muted-foreground">Use <code>{`{nome}`}</code> para personalizar com o nome do contato.</p>
          </div>

          <div className="border-t border-border pt-6">
            <div className="flex items-center gap-2">
              <Link2 className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">Oferta & Painel</h2>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field label="Link do painel SMM" value={cfg.panel_link ?? ""} onChange={(v) => setCfg({ ...cfg, panel_link: v })} />
              <Field label="Oferta principal" value={cfg.main_offer} onChange={(v) => setCfg({ ...cfg, main_offer: v })} />
            </div>
          </div>

          <div className="border-t border-border pt-6">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">Comportamento humano</h2>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Antes de responder, o agente espera um tempo aleatório entre o mínimo e o máximo. Opcionalmente envia "digitando…" no WhatsApp durante a espera.
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field
                label="Delay mínimo (segundos)"
                type="number"
                value={String(cfg.response_delay_min_sec)}
                onChange={(v) => setCfg({ ...cfg, response_delay_min_sec: Math.max(0, parseInt(v || "0", 10) || 0) })}
              />
              <Field
                label="Delay máximo (segundos)"
                type="number"
                value={String(cfg.response_delay_max_sec)}
                onChange={(v) => setCfg({ ...cfg, response_delay_max_sec: Math.max(0, parseInt(v || "0", 10) || 0) })}
              />
            </div>
            <div className="mt-4 flex items-center justify-between rounded-lg border border-border bg-background/40 p-3">
              <div>
                <p className="text-sm font-medium">Mostrar "digitando…"</p>
                <p className="text-xs text-muted-foreground">Envia o status de digitando via Uazapi durante o delay.</p>
              </div>
              <button
                onClick={() => setCfg({ ...cfg, typing_indicator_enabled: !cfg.typing_indicator_enabled })}
                className={`flex h-7 w-12 items-center rounded-full transition ${cfg.typing_indicator_enabled ? "bg-primary" : "bg-muted"}`}
              >
                <span className={`block h-5 w-5 rounded-full bg-white transition-transform ${cfg.typing_indicator_enabled ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-border p-6" style={{ background: "var(--gradient-card)" }}>
            <div className="flex items-center gap-2">
              <Mic className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">Resposta por áudio</h2>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Quando o cliente mandar áudio, o agente responde por áudio via ElevenLabs.
            </p>
            <button
              onClick={() => setCfg({ ...cfg, audio_enabled: !cfg.audio_enabled })}
              className={`mt-4 flex h-7 w-12 items-center rounded-full transition ${cfg.audio_enabled ? "bg-primary" : "bg-muted"}`}
            >
              <span className={`block h-5 w-5 rounded-full bg-white transition-transform ${cfg.audio_enabled ? "translate-x-6" : "translate-x-1"}`} />
            </button>
            <p className="mt-2 text-xs text-muted-foreground">{cfg.audio_enabled ? "Ativado" : "Desativado"}</p>
          </div>

          <IntegrationsPanel
            initial={
              intQ.data
                ? (Object.fromEntries(
                    Object.entries(intQ.data).map(([k, v]) => [k, v ?? ""]),
                  ) as Partial<IntFields>)
                : null
            }
            onChange={setIntFields}
            onSave={async (v) => {
              await saveInt({ data: v });
              qc.invalidateQueries({ queryKey: ["integrations"] });
            }}
            onPreviewVoice={() => previewMut.mutate()}
            previewing={previewMut.isPending}
            previewError={previewMut.error ? (previewMut.error as Error).message : null}
          />
        </div>
      </div>
    </div>
  );
}

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

function IntegrationsPanel({
  initial, onSave, onChange, onPreviewVoice, previewing, previewError,
}: {
  initial: Partial<IntFields> | null;
  onSave: (v: IntFields) => Promise<void>;
  onChange?: (v: IntFields) => void;
  onPreviewVoice: () => void;
  previewing: boolean;
  previewError: string | null;
}) {
  const [v, setV] = useState<IntFields>(blankInt);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (initial) {
      const next = { ...blankInt, ...Object.fromEntries(Object.entries(initial).map(([k, val]) => [k, val ?? ""])) as IntFields };
      setV(next);
      onChange?.(next);
    }
  }, [initial]);

  useEffect(() => { onChange?.(v); }, [v]);

  const groups: Array<{ title: string; status: boolean; fields: Array<[keyof IntFields, string, boolean?]> }> = [
    { title: "Uazapi", status: !!v.uazapi_url && !!v.uazapi_token, fields: [
      ["uazapi_url", "URL (ex: https://free.uazapi.com)"],
      ["uazapi_token", "Token da instância", true],
      ["uazapi_admin_token", "Admin Token (opcional)", true],
    ] },
    { title: "Claude (Anthropic)", status: !!v.anthropic_api_key, fields: [["anthropic_api_key", "API Key", true]] },
    { title: "ElevenLabs", status: !!v.elevenlabs_api_key, fields: [["elevenlabs_api_key", "API Key", true], ["elevenlabs_voice_id", "Voice ID"]] },
    { title: "Whisper (OpenAI)", status: !!v.openai_api_key, fields: [["openai_api_key", "API Key", true]] },
  ];

  return (
    <>
      {groups.map((g) => (
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
                value={v[key]}
                onChange={(e) => setV({ ...v, [key]: e.target.value })}
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
                onClick={onPreviewVoice}
                disabled={previewing || !v.elevenlabs_api_key || !v.elevenlabs_voice_id}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium transition hover:bg-muted disabled:opacity-50"
              >
                <Play className="h-3 w-3" />
                {previewing ? "Gerando…" : "Testar voz"}
              </button>
              {previewError && (
                <p className="text-xs text-destructive">{previewError}</p>
              )}
              <p className="text-[10px] text-muted-foreground">
                Salve antes de testar — usa a chave e voz salvas no servidor.
              </p>
            </div>
          )}
        </div>
      ))}
      <button
        onClick={async () => {
          setSaving(true); setSaved(false);
          try { await onSave(v); setSaved(true); } finally { setSaving(false); }
        }}
        disabled={saving}
        className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-transform hover:scale-[1.02] disabled:opacity-60"
        style={{ background: "var(--gradient-primary)" }}
      >
        {saving ? "Salvando…" : saved ? "Integrações salvas ✓" : "Salvar integrações"}
      </button>
    </>
  );
}

function Field({
  label, value, onChange, multiline,
}: { label: string; value: string; onChange: (v: string) => void; multiline?: boolean }) {
  const cls = "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary";
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      {multiline ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} className={cls} />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} className={cls} />
      )}
    </label>
  );
}
