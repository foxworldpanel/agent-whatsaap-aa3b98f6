import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Bot, Save, Mic, Link2, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/agente")({
  head: () => ({ meta: [{ title: "Agente IA · ZapAgent" }] }),
  component: AgentePage,
});

function AgentePage() {
  const [audio, setAudio] = useState(true);
  const [activeTab, setActiveTab] = useState<"ativo" | "frio" | "inativo">("frio");

  const scripts: Record<typeof activeTab, string> = {
    ativo:
      "Oi {nome}! Suas views foram entregues certinho? 😊\n\nTenho um pacote de 2.000 views por R$18 pra você turbinar mais. Quer?",
    frio:
      "Oi {nome}! Tudo bem? 😊\n\nVi seu canal e curti o conteúdo! Tenho uma promo testando — 500 views por R$5 só pra dar aquele empurrão. Topa?",
    inativo:
      "Oi {nome}! Sumiu hein 😄 Tudo bem?\n\nTenho uma oferta especial pra te trazer de volta — 500 views por R$5. Topa testar?",
  };

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-muted-foreground">Cérebro do agente</p>
        <h1 className="text-3xl font-bold tracking-tight">Agente IA</h1>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div
          className="lg:col-span-2 space-y-6 rounded-xl border border-border p-6"
          style={{ background: "var(--gradient-card)" }}
        >
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">Personalidade</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Nome do agente" defaultValue="Júlia" />
            <Field label="Tom de voz" defaultValue="Amigável e informal" />
          </div>

          <Field
            label="Instrução base"
            multiline
            defaultValue="Você é a Júlia, vendedora do painel SMM. Aborde clientes como humano, mensagens curtas (máx 2 linhas), usa emojis com moderação. Nunca oferece produto na primeira mensagem."
          />

          <div className="border-t border-border pt-6">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">Scripts por perfil</h2>
            </div>

            <div className="mt-4 flex gap-2">
              {(["frio", "inativo", "ativo"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setActiveTab(t)}
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                    activeTab === t
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t === "ativo" ? "Cliente Ativo" : t === "frio" ? "Lead Frio" : "Cliente Inativo"}
                </button>
              ))}
            </div>

            <textarea
              key={activeTab}
              defaultValue={scripts[activeTab]}
              rows={6}
              className="mt-4 w-full rounded-lg border border-border bg-background p-3 text-sm font-mono outline-none transition focus:border-primary"
            />
          </div>

          <div className="border-t border-border pt-6">
            <div className="flex items-center gap-2">
              <Link2 className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">Oferta & Painel</h2>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field label="Link do painel SMM" defaultValue="https://painel.smm.com/u/123" />
              <Field label="Oferta principal" defaultValue="500 views por R$5" />
            </div>
          </div>

          <button
            className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-transform hover:scale-[1.02]"
            style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-glow)" }}
          >
            <Save className="h-4 w-4" />
            Salvar configurações
          </button>
        </div>

        <div className="space-y-6">
          <div
            className="rounded-xl border border-border p-6"
            style={{ background: "var(--gradient-card)" }}
          >
            <div className="flex items-center gap-2">
              <Mic className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">Resposta por áudio</h2>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Quando o cliente mandar áudio, o agente responde por áudio via ElevenLabs.
            </p>
            <button
              onClick={() => setAudio(!audio)}
              className={`mt-4 flex h-7 w-12 items-center rounded-full transition ${
                audio ? "bg-primary" : "bg-muted"
              }`}
            >
              <span
                className={`block h-5 w-5 rounded-full bg-white transition-transform ${
                  audio ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
            <p className="mt-2 text-xs text-muted-foreground">{audio ? "Ativado" : "Desativado"}</p>
          </div>

          <IntegrationCard title="Evolution API" fields={["URL", "API Key", "Instância"]} status="conectado" />
          <IntegrationCard title="Claude (Anthropic)" fields={["API Key"]} status="conectado" />
          <IntegrationCard title="ElevenLabs" fields={["API Key", "Voice ID"]} status="conectado" />
          <IntegrationCard title="Whisper (OpenAI)" fields={["API Key"]} status="desconectado" />
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  defaultValue,
  multiline,
}: {
  label: string;
  defaultValue?: string;
  multiline?: boolean;
}) {
  const cls = "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary";
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      {multiline ? (
        <textarea defaultValue={defaultValue} rows={3} className={cls} />
      ) : (
        <input defaultValue={defaultValue} className={cls} />
      )}
    </label>
  );
}

function IntegrationCard({
  title,
  fields,
  status,
}: {
  title: string;
  fields: string[];
  status: "conectado" | "desconectado";
}) {
  return (
    <div
      className="rounded-xl border border-border p-5"
      style={{ background: "var(--gradient-card)" }}
    >
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">{title}</h3>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs ${
            status === "conectado" ? "bg-success/20 text-success" : "bg-muted text-muted-foreground"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${status === "conectado" ? "bg-success" : "bg-muted-foreground"}`} />
          {status}
        </span>
      </div>
      <div className="mt-3 space-y-2">
        {fields.map((f) => (
          <input
            key={f}
            placeholder={f}
            type={f.toLowerCase().includes("key") ? "password" : "text"}
            className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs outline-none transition focus:border-primary"
          />
        ))}
      </div>
    </div>
  );
}