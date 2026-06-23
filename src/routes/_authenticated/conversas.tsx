import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Send, Bot } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { listConversations, listMessages, sendManualMessage } from "@/lib/whatsapp.functions";

export const Route = createFileRoute("/_authenticated/conversas")({
  ssr: false,
  head: () => ({ meta: [{ title: "Conversas · ZapAgent" }] }),
  component: Conversas,
});

const profileLabel: Record<string, string> = {
  frio: "Lead frio",
  inativo: "Cliente inativo",
  ativo: "Cliente ativo",
};

type Conv = {
  id: string;
  status: "agente_respondendo" | "aguardando" | "convertido";
  last_message_preview: string | null;
  last_message_at: string | null;
  contact: { id: string; nome: string; telefone: string; perfil: "frio" | "inativo" | "ativo" } | null;
};

function formatTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function Conversas() {
  const qc = useQueryClient();
  const fetchConvs = useServerFn(listConversations);
  const fetchMsgs = useServerFn(listMessages);
  const sendFn = useServerFn(sendManualMessage);

  const convsQ = useQuery({ queryKey: ["conversations"], queryFn: () => fetchConvs() });
  const conversations = (convsQ.data ?? []) as unknown as Conv[];

  const [activeId, setActiveId] = useState<string | null>(null);
  useEffect(() => {
    if (!activeId && conversations.length) setActiveId(conversations[0].id);
  }, [activeId, conversations]);

  const active = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId],
  );

  const msgsQ = useQuery({
    queryKey: ["messages", activeId],
    queryFn: () => fetchMsgs({ data: { conversationId: activeId! } }),
    enabled: !!activeId,
  });

  const [text, setText] = useState("");
  const sendMut = useMutation({
    mutationFn: (body: string) => sendFn({ data: { conversationId: activeId!, text: body } }),
    onSuccess: () => {
      setText("");
      qc.invalidateQueries({ queryKey: ["messages", activeId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });

  // Realtime: refresh on insert/update
  useEffect(() => {
    const ch = supabase
      .channel("conv-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
        qc.invalidateQueries({ queryKey: ["messages", activeId] });
        qc.invalidateQueries({ queryKey: ["conversations"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => {
        qc.invalidateQueries({ queryKey: ["conversations"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc, activeId]);

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
          {convsQ.isLoading && (
            <p className="p-4 text-sm text-muted-foreground">Carregando…</p>
          )}
          {!convsQ.isLoading && conversations.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">
              Nenhuma conversa ainda. Quando um contato responder no WhatsApp, ela aparece aqui.
            </p>
          )}
          {conversations.map((c) => {
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
                  <span className="font-medium text-sm">{c.contact?.nome ?? "—"}</span>
                  <span className="text-xs text-muted-foreground">{formatTime(c.last_message_at)}</span>
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {c.last_message_preview ?? ""}
                </p>
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
              <h2 className="font-semibold">{active?.contact?.nome ?? "Selecione uma conversa"}</h2>
              <p className="text-xs text-muted-foreground">
                {active?.contact ? profileLabel[active.contact.perfil] : ""}
              </p>
            </div>
            <button className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium transition hover:bg-muted">
              <Bot className="h-3.5 w-3.5" /> Intervir manualmente
            </button>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto px-6 py-5">
            {!active && (
              <p className="text-sm text-muted-foreground">Nada selecionado.</p>
            )}
            {(msgsQ.data ?? []).map((m) => (
              <div
                key={m.id}
                className={`flex ${m.sender === "agente" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${
                    m.sender === "agente"
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-muted text-foreground rounded-bl-sm"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{m.body}</p>
                  <p
                    className={`mt-1 text-[10px] ${
                      m.sender === "agente" ? "text-primary-foreground/70" : "text-muted-foreground"
                    }`}
                  >
                    {formatTime(m.created_at)}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-border bg-background/60 p-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!activeId || !text.trim() || sendMut.isPending) return;
                sendMut.mutate(text.trim());
              }}
              className="flex items-center gap-2"
            >
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={!activeId || sendMut.isPending}
                placeholder="Digite uma mensagem para enviar manualmente…"
                className="flex-1 rounded-lg border border-border bg-card px-4 py-2.5 text-sm outline-none transition focus:border-primary disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={!activeId || !text.trim() || sendMut.isPending}
                className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-transform hover:scale-[1.02] disabled:opacity-60"
                style={{ background: "var(--gradient-primary)" }}
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
            {sendMut.isError && (
              <p className="mt-2 text-xs text-destructive">{(sendMut.error as Error).message}</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}