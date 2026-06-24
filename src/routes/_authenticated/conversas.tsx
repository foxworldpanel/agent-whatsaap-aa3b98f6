import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Send, Bot } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { listConversations, listMessages, sendManualMessage } from "@/lib/whatsapp.functions";
import { setConversationAgentEnabled } from "@/lib/agent.functions";
import { listNumbers } from "@/lib/numbers.functions";

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
  agent_enabled: boolean;
  whatsapp_number_id: string | null;
  contact: {
    id: string;
    nome: string;
    telefone: string;
    perfil: "frio" | "inativo" | "ativo";
    temperatura?: "quente" | "morno" | "frio" | "cliente" | "bloqueado" | null;
    source?: string | null;
    source_ref?: string | null;
    source_url?: string | null;
    source_headline?: string | null;
    photo_url?: string | null;
  } | null;
};

const sourceLabel: Record<string, string> = {
  meta_ads: "Meta Ads",
  organico: "Orgânico",
  importado: "Importado",
  manual: "Manual",
};

type TempKey = "quente" | "morno" | "frio" | "cliente" | "bloqueado";
const tempTag: Record<TempKey, { label: string; emoji: string; cls: string }> = {
  quente:    { label: "Quente",    emoji: "🔥", cls: "bg-red-100 text-red-700 border-red-200" },
  morno:     { label: "Morno",     emoji: "🌤", cls: "bg-orange-100 text-orange-700 border-orange-200" },
  frio:      { label: "Frio",      emoji: "❄️", cls: "bg-blue-100 text-blue-700 border-blue-200" },
  cliente:   { label: "Cliente",   emoji: "✅", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  bloqueado: { label: "Bloqueado", emoji: "🚫", cls: "bg-neutral-200 text-neutral-600 border-neutral-300" },
};
function TempBadge({ t, size = "sm" }: { t?: string | null; size?: "sm" | "xs" }) {
  if (!t || !(t in tempTag)) return null;
  const meta = tempTag[t as TempKey];
  const pad = size === "xs" ? "px-1.5 py-0 text-[10px]" : "px-2 py-0.5 text-[11px]";
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border font-medium ${pad} ${meta.cls}`}>
      <span>{meta.emoji}</span>
      {meta.label}
    </span>
  );
}

function formatTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const AVATAR_COLORS = [
  "#7C3AED", "#2563EB", "#059669", "#DB2777", "#D97706", "#0891B2", "#9333EA", "#DC2626",
];
function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function Conversas() {
  const qc = useQueryClient();
  const fetchConvs = useServerFn(listConversations);
  const fetchMsgs = useServerFn(listMessages);
  const sendFn = useServerFn(sendManualMessage);
  const toggleConvAgent = useServerFn(setConversationAgentEnabled);
  const fetchNumbers = useServerFn(listNumbers);

  const [filterNumberId, setFilterNumberId] = useState<string | null>(null);

  const numbersQ = useQuery({
    queryKey: ["whatsapp_numbers"],
    queryFn: () => fetchNumbers(),
  });
  const numbers = (numbersQ.data ?? []) as Array<{ id: string; nome: string; status: string }>;

  const convsQ = useQuery({
    queryKey: ["conversations", filterNumberId],
    queryFn: () => fetchConvs({ data: { numberId: filterNumberId } }),
    refetchInterval: 2000,
    refetchIntervalInBackground: true,
  });
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
    refetchInterval: activeId ? 2000 : false,
    refetchIntervalInBackground: true,
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

  const toggleMut = useMutation({
    mutationFn: (enabled: boolean) =>
      toggleConvAgent({ data: { conversationId: activeId!, enabled } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conversations"] }),
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
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Histórico</p>
          <h1 className="text-3xl font-bold tracking-tight">Conversas</h1>
        </div>
        {numbers.length > 0 && (
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-neutral-600">Número:</label>
            <select
              value={filterNumberId ?? ""}
              onChange={(e) => {
                setFilterNumberId(e.target.value || null);
                setActiveId(null);
              }}
              className="rounded-lg border border-border bg-white px-3 py-1.5 text-sm"
            >
              <option value="">Todos os números</option>
              {numbers.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.nome} {n.status === "conectado" ? "🟢" : "⚪"}
                </option>
              ))}
            </select>
          </div>
        )}
      </header>

      <div className="grid h-[calc(100vh-200px)] grid-cols-1 overflow-hidden rounded-xl border border-border shadow-sm md:grid-cols-[360px_1fr]">
        {/* === LISTA (lado esquerdo, fundo branco) === */}
        <aside className="flex flex-col border-r border-border bg-white">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-base font-semibold text-neutral-800">Conversas</h2>
          </div>
          <div className="flex-1 overflow-y-auto">
            {convsQ.isLoading && (
              <p className="p-4 text-sm text-neutral-500">Carregando…</p>
            )}
            {!convsQ.isLoading && conversations.length === 0 && (
              <p className="p-4 text-sm text-neutral-500">
                Nenhuma conversa ainda. Quando um contato responder no WhatsApp, ela aparece aqui.
              </p>
            )}
            {conversations.map((c) => {
              const sel = c.id === activeId;
              const name = c.contact?.nome ?? "—";
              const photo = c.contact?.photo_url;
              return (
                <button
                  key={c.id}
                  onClick={() => setActiveId(c.id)}
                  className={`flex w-full items-center gap-3 border-b border-neutral-100 px-3 py-3 text-left transition ${
                    sel ? "bg-primary/10" : "hover:bg-neutral-50"
                  }`}
                >
                  {photo ? (
                    <img
                      src={photo}
                      alt={name}
                      className="h-12 w-12 shrink-0 rounded-full object-cover"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                    />
                  ) : (
                    <div
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                      style={{ background: avatarColor(c.contact?.id ?? c.id) }}
                    >
                      {initials(name)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-neutral-900">
                        {name}
                      </span>
                      <span className="shrink-0 text-[11px] text-neutral-500">
                        {formatTime(c.last_message_at)}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <p className="truncate text-xs text-neutral-500">
                        {c.last_message_preview ?? ""}
                      </p>
                      <div className="flex shrink-0 items-center gap-1">
                        <TempBadge t={c.contact?.temperatura} size="xs" />
                        {c.contact?.source === "meta_ads" && (
                        <span className="shrink-0 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                          {sourceLabel.meta_ads}
                        </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* === CONVERSA (lado direito, fundo WhatsApp) === */}
        <section
          className="flex flex-col"
          style={{ backgroundColor: "#ECE5DD" }}
        >
          <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-3">
            <div className="flex items-center gap-3">
              {active?.contact ? (
                active.contact.photo_url ? (
                  <img
                    src={active.contact.photo_url}
                    alt={active.contact.nome}
                    className="h-10 w-10 rounded-full object-cover"
                  />
                ) : (
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold text-white"
                    style={{ background: avatarColor(active.contact.id) }}
                  >
                    {initials(active.contact.nome)}
                  </div>
                )
              ) : (
                <div className="h-10 w-10 rounded-full bg-neutral-200" />
              )}
              <div>
                <h2 className="text-sm font-semibold text-neutral-900">
                  {active?.contact?.nome ?? "Selecione uma conversa"}
                </h2>
                <p className="text-[11px] flex items-center gap-1.5">
                  {active && (
                    <>
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          active.status === "convertido"
                            ? "bg-emerald-500"
                            : active.status === "agente_respondendo"
                            ? "bg-emerald-500"
                            : "bg-amber-500"
                        }`}
                      />
                      <span
                        className={
                          active.status === "agente_respondendo" || active.status === "convertido"
                            ? "text-emerald-600 font-medium"
                            : "text-amber-600 font-medium"
                        }
                      >
                        {active.status === "convertido"
                          ? "Convertido"
                          : active.status === "agente_respondendo"
                          ? "Agente respondendo"
                          : "Aguardando"}
                      </span>
                      {active.contact?.source && (
                        <span className="text-neutral-500">
                          · {sourceLabel[active.contact.source] ?? active.contact.source}
                        </span>
                      )}
                      <TempBadge t={active.contact?.temperatura} />
                    </>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {active && (
                <button
                  type="button"
                  onClick={() => toggleMut.mutate(!active.agent_enabled)}
                  disabled={toggleMut.isPending}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    active.agent_enabled
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                      : "border-neutral-200 bg-neutral-100 text-neutral-500 hover:bg-neutral-200"
                  }`}
                  title="Liga ou desliga o agente IA apenas para este contato"
                >
                  <span
                    className={`relative inline-flex h-4 w-7 items-center rounded-full transition ${
                      active.agent_enabled ? "bg-emerald-500" : "bg-neutral-400"
                    }`}
                  >
                    <span
                      className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition ${
                        active.agent_enabled ? "translate-x-3.5" : "translate-x-0.5"
                      }`}
                    />
                  </span>
                  Agente {active.agent_enabled ? "ativo" : "desligado"}
                </button>
              )}
              <button className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition hover:bg-neutral-50">
                <Bot className="h-3.5 w-3.5" /> Intervir manualmente
              </button>
            </div>
          </header>

          <div className="flex-1 space-y-2 overflow-y-auto px-6 py-5">
            {!active && (
              <p className="text-sm text-neutral-500">Nada selecionado.</p>
            )}
            {(msgsQ.data ?? []).map((m) => {
              const mine = m.sender === "agente";
              return (
                <div
                  key={m.id}
                  className={`flex ${mine ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[75%] rounded-lg px-3 py-2 text-sm shadow-sm ${
                      mine ? "rounded-br-sm" : "rounded-bl-sm"
                    }`}
                    style={{
                      backgroundColor: mine ? "#DCF8C6" : "#FFFFFF",
                      color: "#111827",
                    }}
                  >
                    <p className="whitespace-pre-wrap leading-snug">{m.body}</p>
                    <p className="mt-1 text-right text-[10px] text-neutral-500">
                      {formatTime(m.created_at)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="border-t border-neutral-200 bg-white p-3">
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
                className="flex-1 rounded-full border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-primary focus:bg-white disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={!activeId || !text.trim() || sendMut.isPending}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground transition hover:scale-105 disabled:opacity-50"
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