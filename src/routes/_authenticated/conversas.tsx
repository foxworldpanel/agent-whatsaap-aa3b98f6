import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Send, Bot } from "lucide-react";
import { mockConversations, profileLabel } from "@/lib/mock-data";

export const Route = createFileRoute("/_authenticated/conversas")({
  head: () => ({ meta: [{ title: "Conversas · ZapAgent" }] }),
  component: Conversas,
});

function Conversas() {
  const [activeId, setActiveId] = useState(mockConversations[0].id);
  const active = mockConversations.find((c) => c.id === activeId)!;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-muted-foreground">Histórico</p>
        <h1 className="text-3xl font-bold tracking-tight">Conversas</h1>
      </header>

      <div
        className="grid h-[calc(100vh-220px)] grid-cols-1 overflow-hidden rounded-xl border border-border md:grid-cols-[320px_1fr]"
        style={{ background: "var(--gradient-card)" }}
      >
        <aside className="border-r border-border overflow-y-auto">
          {mockConversations.map((c) => {
            const sel = c.id === activeId;
            return (
              <button
                key={c.id}
                onClick={() => setActiveId(c.id)}
                className={`flex w-full flex-col gap-1 border-b border-border px-4 py-3 text-left transition ${
                  sel ? "bg-primary/10" : "hover:bg-muted/30"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{c.nome}</span>
                  <span className="text-xs text-muted-foreground">{c.horario}</span>
                </div>
                <p className="truncate text-xs text-muted-foreground">{c.ultimaMensagem}</p>
                <div className="flex items-center gap-1.5 mt-1">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      c.status === "convertido"
                        ? "bg-success"
                        : c.status === "agente_respondendo"
                        ? "bg-primary"
                        : "bg-warning"
                    }`}
                  />
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {c.status === "convertido"
                      ? "Convertido"
                      : c.status === "agente_respondendo"
                      ? "Agente respondendo"
                      : "Aguardando"}
                  </span>
                </div>
              </button>
            );
          })}
        </aside>

        <section className="flex flex-col bg-background/40">
          <header className="flex items-center justify-between border-b border-border px-6 py-4">
            <div>
              <h2 className="font-semibold">{active.nome}</h2>
              <p className="text-xs text-muted-foreground">{profileLabel[active.perfil]}</p>
            </div>
            <button className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium transition hover:bg-muted">
              <Bot className="h-3.5 w-3.5" /> Intervir manualmente
            </button>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto px-6 py-5">
            {active.mensagens.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.de === "agente" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${
                    m.de === "agente"
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-muted text-foreground rounded-bl-sm"
                  }`}
                >
                  <p>{m.texto}</p>
                  <p
                    className={`mt-1 text-[10px] ${
                      m.de === "agente" ? "text-primary-foreground/70" : "text-muted-foreground"
                    }`}
                  >
                    {m.hora}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-border bg-background/60 p-4">
            <div className="flex items-center gap-2">
              <input
                placeholder="Digite uma mensagem para enviar manualmente…"
                className="flex-1 rounded-lg border border-border bg-card px-4 py-2.5 text-sm outline-none transition focus:border-primary"
              />
              <button
                className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-transform hover:scale-[1.02]"
                style={{ background: "var(--gradient-primary)" }}
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}