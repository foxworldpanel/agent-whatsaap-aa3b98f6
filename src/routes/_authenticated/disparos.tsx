import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Play, Pause, Square, Send, CheckCircle2, XCircle, MessageCircle } from "lucide-react";
import { mockLogs } from "@/lib/mock-data";

export const Route = createFileRoute("/disparos")({
  head: () => ({ meta: [{ title: "Disparos · ZapAgent" }] }),
  component: Disparos,
});

function Disparos() {
  const [status, setStatus] = useState<"parado" | "rodando" | "pausado">("rodando");

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Campanhas</p>
          <h1 className="text-3xl font-bold tracking-tight">Disparos</h1>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium ${
              status === "rodando"
                ? "bg-success/20 text-success"
                : status === "pausado"
                ? "bg-warning/20 text-warning"
                : "bg-muted text-muted-foreground"
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {status === "rodando" ? "Em execução" : status === "pausado" ? "Pausado" : "Parado"}
          </span>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div
          className="space-y-5 rounded-xl border border-border p-6"
          style={{ background: "var(--gradient-card)" }}
        >
          <h2 className="font-semibold">Configuração</h2>

          <Field label="Perfil alvo">
            <select className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none">
              <option className="bg-card">Lead Frio (412)</option>
              <option className="bg-card">Cliente Inativo (89)</option>
              <option className="bg-card">Cliente Ativo (203)</option>
            </select>
          </Field>

          <Field label="Volume por dia">
            <input
              type="number"
              defaultValue={30}
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none"
            />
          </Field>

          <Field label="Intervalo entre mensagens (min)">
            <input
              type="number"
              defaultValue={3}
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Início">
              <input
                type="time"
                defaultValue="09:00"
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none"
              />
            </Field>
            <Field label="Fim">
              <input
                type="time"
                defaultValue="20:00"
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none"
              />
            </Field>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={() => setStatus("rodando")}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-primary-foreground transition-transform hover:scale-[1.02]"
              style={{ background: "var(--gradient-primary)" }}
            >
              <Play className="h-4 w-4" /> Iniciar
            </button>
            <button
              onClick={() => setStatus("pausado")}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 text-sm font-medium transition hover:bg-muted"
            >
              <Pause className="h-4 w-4" />
            </button>
            <button
              onClick={() => setStatus("parado")}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm font-medium text-destructive transition hover:bg-destructive/20"
            >
              <Square className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div
          className="lg:col-span-2 rounded-xl border border-border"
          style={{ background: "var(--gradient-card)" }}
        >
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <div className="flex items-center gap-2">
              <Send className="h-4 w-4 text-primary" />
              <h2 className="font-semibold">Log em tempo real</h2>
            </div>
            <span className="text-xs text-muted-foreground">atualização automática</span>
          </div>
          <ul className="max-h-[600px] divide-y divide-border overflow-y-auto">
            {mockLogs.map((log) => (
              <li key={log.id} className="flex items-start gap-4 px-6 py-4 transition hover:bg-muted/20">
                <span className="w-12 text-xs text-muted-foreground tabular-nums pt-0.5">{log.hora}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{log.contato}</p>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{log.mensagem}</p>
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
            ))}
          </ul>
        </div>
      </div>
    </div>
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