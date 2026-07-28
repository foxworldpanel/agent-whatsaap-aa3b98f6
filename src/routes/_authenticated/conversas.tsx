import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Send, Trash2, RefreshCw, Ban, ShieldCheck, Search, X, Copy, BrainCircuit, Flame, Megaphone, UserCheck } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { listConversations, listMessages, sendManualMessage, clearConversation } from "@/lib/whatsapp.functions";
import { setConversationAgentEnabled, reactivateConversation, blockConversation } from "@/lib/agent.functions";
import { updateContactFields } from "@/lib/contacts-crm.functions";
import { listNumbers } from "@/lib/numbers.functions";
import { syncWhatsappMessages } from "@/lib/sync.functions";
import { useWorkspace } from "@/contexts/workspace-context";

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
  needs_review?: boolean;
  review_reason?: string | null;
  auto_paused_at?: string | null;
  internal_note?: string | null;
  is_test?: boolean;
  customer_memory?: {
    lifecycle?: "novo_lead" | "interessado" | "negociacao" | "pronto_para_comprar" | "cliente" | "cliente_recorrente" | string;
    converted_at?: string | null;
    purchase_count?: number;
    preferred_platform?: string | null;
    preferred_product?: string | null;
    next_opportunity?: string | null;
    repurchase_potential?: "baixo" | "medio" | "alto" | string;
    updated_at?: string | null;
  } | null;
  business_state?: {
    state?: string;
    risk_level?: string;
    reason?: string | null;
    next_action?: string | null;
    summary?: string | null;
    updated_at?: string | null;
  } | null;
  lead_intelligence?: {
    temperature?: "frio" | "morno" | "quente" | string;
    confidence?: string;
    intent?: string;
    stage?: string;
    purchase_probability?: number;
    sentiment?: string;
    urgency?: string;
    recommended_action?: string;
    reasoning?: string;
    updated_at?: string;
  } | null;
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

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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

function digitsOnly(value: string | null | undefined): string {
  return String(value || "").replace(/\D/g, "");
}

function isLikelyInternalWhatsAppId(value: string | null | undefined): boolean {
  const raw = String(value || "").trim();
  if (!raw) return true;
  if (/@(?:lid|s\.whatsapp\.net|g\.us)$/i.test(raw)) return true;

  const digits = digitsOnly(raw);
  // Telefones BR com DDI normalmente têm 12–13 dígitos. IDs LID costumam ser
  // sequências maiores/sem formato telefônico.
  return /^\d+$/.test(raw) && (digits.length > 13 || digits.length < 10);
}

function formatPhone(value: string | null | undefined): string {
  let digits = digitsOnly(value);
  if (!digits) return "—";

  // Remove sufixos acidentalmente persistidos como JID quando possível.
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    const ddd = digits.slice(2, 4);
    const local = digits.slice(4);
    if (local.length === 9) {
      return `+55 ${ddd} ${local.slice(0, 5)}-${local.slice(5)}`;
    }
    if (local.length === 8) {
      return `+55 ${ddd} ${local.slice(0, 4)}-${local.slice(4)}`;
    }
  }

  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }

  if (digits.length > 13 || digits.length < 10) {
    return "Telefone não identificado";
  }

  return digits;
}

function contactPrimaryLabel(contact: Conv["contact"]): string {
  if (!contact) return "Contato";
  const name = String(contact.nome || "").trim();
  const phone = formatPhone(contact.telefone);

  if (
    name &&
    !isLikelyInternalWhatsAppId(name) &&
    digitsOnly(name) !== digitsOnly(contact.telefone)
  ) {
    return name;
  }

  return phone !== "—" ? phone : "Contato";
}

function ContactAvatar({
  contact,
  size = "md",
}: {
  contact: Conv["contact"];
  size?: "sm" | "md";
}) {
  const [failed, setFailed] = useState(false);
  const sizeCls = size === "sm" ? "h-10 w-10 text-xs" : "h-12 w-12 text-sm";
  const label = contactPrimaryLabel(contact);
  const photo = contact?.photo_url;

  if (photo && !failed) {
    return (
      <img
        src={photo}
        alt={label}
        className={`${sizeCls} shrink-0 rounded-full object-cover ring-1 ring-neutral-200`}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div
      className={`flex ${sizeCls} shrink-0 items-center justify-center rounded-full font-semibold text-white`}
      style={{ background: avatarColor(contact?.id || contact?.telefone || label) }}
      title={photo && failed ? "Foto indisponível — usando avatar local" : label}
    >
      {initials(label)}
    </div>
  );
}

function isConversationBlocked(conversation: Conv | null): boolean {
  if (!conversation) return false;
  return (
    conversation.needs_review === true ||
    conversation.contact?.temperatura === "bloqueado" ||
    conversation.review_reason?.toLowerCase().includes("bloque") === true ||
    conversation.internal_note?.toLowerCase().includes("bloque") === true
  );
}

function Conversas() {
  const qc = useQueryClient();
  const { activeWorkspaceId } = useWorkspace();
  const fetchConvs = useServerFn(listConversations);
  const fetchMsgs = useServerFn(listMessages);
  const sendFn = useServerFn(sendManualMessage);
  const toggleConvAgent = useServerFn(setConversationAgentEnabled);
  const fetchNumbers = useServerFn(listNumbers);
  const clearFn = useServerFn(clearConversation);
  const syncFn = useServerFn(syncWhatsappMessages);
  const reactivateFn = useServerFn(reactivateConversation);
  const blockFn = useServerFn(blockConversation);
  const updateContactFn = useServerFn(updateContactFields);

  const [filterNumberId, setFilterNumberId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [quickFilter, setQuickFilter] = useState<
    "all" | "human" | "payment" | "complaint" | "blocked" | "meta" | "hot"
  >("all");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const [syncStatus, setSyncStatus] = useState<"live" | "syncing" | "error">("live");

  const numbersQ = useQuery({
    queryKey: ["whatsapp_numbers", activeWorkspaceId],
    queryFn: () => fetchNumbers(),
    enabled: !!activeWorkspaceId,
  });
  const numbers = (numbersQ.data ?? []) as Array<{ id: string; nome: string; status: string }>;

  const convsQ = useQuery({
    queryKey: ["conversations", activeWorkspaceId, filterNumberId],
    queryFn: () => fetchConvs({ data: { numberId: filterNumberId } }),
    enabled: !!activeWorkspaceId,
    refetchInterval: 2000,
    refetchIntervalInBackground: true,
  });
  const conversations = (convsQ.data ?? []) as unknown as Conv[];

  const filteredConversations = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();

    return conversations.filter((c) => {
      const nome = c.contact?.nome?.toLowerCase() ?? "";
      const tel = c.contact?.telefone?.toLowerCase() ?? "";
      const prettyTel = formatPhone(c.contact?.telefone).toLowerCase();
      const preview = c.last_message_preview?.toLowerCase() ?? "";

      const searchMatches =
        !q ||
        nome.includes(q) ||
        tel.includes(q) ||
        prettyTel.includes(q) ||
        preview.includes(q);

      if (!searchMatches) return false;

      if (quickFilter === "human") {
        return (
          c.needs_review === true ||
          c.review_reason?.toLowerCase().includes("humano") === true ||
          c.internal_note?.toLowerCase().includes("humano") === true
        );
      }
      if (quickFilter === "payment") {
        return ["pagamento", "fechamento"].includes(String(c.business_state?.state || ""));
      }
      if (quickFilter === "complaint") {
        return (
          c.business_state?.state === "reclamacao" ||
          c.lead_intelligence?.intent === "Reclamação"
        );
      }
      if (quickFilter === "blocked") {
        return c.business_state?.state === "compra_bloqueada";
      }
      if (quickFilter === "meta") return c.contact?.source === "meta_ads";
      if (quickFilter === "hot") {
        return (
          c.contact?.temperatura === "quente" ||
          c.lead_intelligence?.temperature === "quente" ||
          Number(c.lead_intelligence?.purchase_probability || 0) >= 70
        );
      }

      return true;
    });
  }, [conversations, searchTerm, quickFilter]);

  const quickCounts = useMemo(
    () => ({
      all: conversations.length,
      human: conversations.filter(
        (c) =>
          c.needs_review === true ||
          c.review_reason?.toLowerCase().includes("humano") === true ||
          c.internal_note?.toLowerCase().includes("humano") === true,
      ).length,
      payment: conversations.filter((c) =>
        ["pagamento", "fechamento"].includes(String(c.business_state?.state || "")),
      ).length,
      complaint: conversations.filter(
        (c) => c.business_state?.state === "reclamacao" || c.lead_intelligence?.intent === "Reclamação",
      ).length,
      blocked: conversations.filter((c) => c.business_state?.state === "compra_bloqueada").length,
      meta: conversations.filter((c) => c.contact?.source === "meta_ads").length,
      hot: conversations.filter(
        (c) =>
          c.contact?.temperatura === "quente" ||
          c.lead_intelligence?.temperature === "quente" ||
          Number(c.lead_intelligence?.purchase_probability || 0) >= 70,
      ).length,
    }),
    [conversations],
  );

  const [activeId, setActiveId] = useState<string | null>(null);
  useEffect(() => {
    setFilterNumberId(null);
    setActiveId(null);
  }, [activeWorkspaceId]);

  useEffect(() => {
    setActiveId(null);
  }, [filterNumberId]);

  useEffect(() => {
    if (!activeId && conversations.length) setActiveId(conversations[0].id);
  }, [activeId, conversations]);

  const active = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId],
  );
  const activeBlocked = isConversationBlocked(active);

  const msgsQ = useQuery({
    queryKey: ["messages", activeWorkspaceId, activeId],
    queryFn: () => fetchMsgs({ data: { conversationId: activeId! } }),
    enabled: !!activeWorkspaceId && !!activeId,
    refetchInterval: activeId ? 2000 : false,
    refetchIntervalInBackground: true,
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [activeId, msgsQ.data?.length]);

  const copyFullConversation = async () => {
    if (!active) return;
    const messages = (msgsQ.data ?? []) as Array<{
      sender: string;
      kind: string;
      body: string;
      created_at: string;
    }>;

    const header = [
      `Conversa: ${active.contact?.nome ?? "Sem nome"}`,
      `Telefone: ${active.contact?.telefone ?? "—"}`,
      `Mensagens: ${messages.length}`,
      "",
    ];

    const lines = messages.map((m) => {
      const who = m.sender === "agente" ? "Mind Global" : (active.contact?.nome || active.contact?.telefone || "Cliente");
      const media =
        m.kind === "audio"
          ? " [ÁUDIO / TRANSCRIÇÃO]"
          : m.kind === "image"
            ? " [IMAGEM]"
            : "";
      return `[${formatDateTime(m.created_at)}] ${who}${media}: ${m.body || ""}`;
    });

    const businessState = active.business_state;
    const businessStateLines = businessState
      ? [
          "",
          "--- Estado da Conversa ---",
          `Estado: ${businessState.state ?? "—"}`,
          `Risco: ${businessState.risk_level ?? "—"}`,
          `Motivo: ${businessState.reason ?? "—"}`,
          `Próxima ação: ${businessState.next_action ?? "—"}`,
        ]
      : [];

    const intelligence = active.lead_intelligence;
    const intelligenceLines = intelligence
      ? [
          "",
          "--- Lead Intelligence ---",
          `Temperatura: ${intelligence.temperature ?? "—"}`,
          `Confiança: ${intelligence.confidence ?? "—"}`,
          `Intenção: ${intelligence.intent ?? "—"}`,
          `Estágio: ${intelligence.stage ?? "—"}`,
          `Probabilidade de Compra: ${Math.max(0, Math.min(100, Number(intelligence.purchase_probability ?? 0)))}%`,
          `Sentimento: ${intelligence.sentiment ?? "—"}`,
          `Urgência: ${intelligence.urgency ?? "—"}`,
        ]
      : [];

    await navigator.clipboard.writeText([...header, ...lines, ...businessStateLines, ...intelligenceLines].join("\n"));
    toast.success("Conversa completa copiada.");
  };

  const [text, setText] = useState("");
  const sendMut = useMutation({
    mutationFn: (body: string) => sendFn({ data: { conversationId: activeId!, text: body } }),
    onSuccess: () => {
      setText("");
      qc.invalidateQueries({ queryKey: ["messages", activeWorkspaceId, activeId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });

  const toggleMut = useMutation({
    mutationFn: (enabled: boolean) =>
      toggleConvAgent({ data: { conversationId: activeId!, enabled } }),
    onMutate: async (enabled: boolean) => {
      await qc.cancelQueries({ queryKey: ["conversations"] });
      const previous = qc.getQueriesData({ queryKey: ["conversations"] });
      qc.setQueriesData<Conv[]>({ queryKey: ["conversations"] }, (old) =>
        old?.map((c) =>
          c.id === activeId
            ? {
                ...c,
                agent_enabled: enabled,
                ...(enabled
                  ? {
                      needs_review: false,
                      review_reason: null,
                      auto_paused_at: null,
                      internal_note: null,
                      status: "aguardando" as const,
                      contact: c.contact ? { ...c.contact, temperatura: "frio" as const } : c.contact,
                    }
                  : {}),
              }
            : c,
        ) ?? old,
      );
      return { previous };
    },
    onError: (err, _enabled, ctx) => {
      ctx?.previous?.forEach(([key, data]) => qc.setQueryData(key, data));
      toast.error((err as Error).message || "Falha ao alternar o agente");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["conversations"] }),
  });

  const clearMut = useMutation({
    mutationFn: () => clearFn({ data: { conversationId: activeId! } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["messages", activeWorkspaceId, activeId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });

  const reactivateMut = useMutation({
    mutationFn: () => reactivateFn({ data: { conversationId: activeId! } }),
    onSuccess: () => {
      toast.success("Conversa desbloqueada");
      qc.setQueriesData<Conv[]>({ queryKey: ["conversations"] }, (old) =>
        old?.map((c) =>
          c.id === activeId
            ? {
                ...c,
                agent_enabled: true,
                needs_review: false,
                review_reason: null,
                auto_paused_at: null,
                internal_note: null,
                status: "aguardando" as const,
                contact: c.contact ? { ...c.contact, temperatura: "frio" as const } : c.contact,
              }
            : c,
        ) ?? old,
      );
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["conversations_review_count"] });
    },
    onError: (e) => toast.error((e as Error).message || "Falha ao desbloquear"),
  });

  const blockMut = useMutation({
    mutationFn: () => blockFn({ data: { conversationId: activeId! } }),
    onSuccess: () => {
      toast.success("Conversa bloqueada");
      qc.setQueriesData<Conv[]>({ queryKey: ["conversations"] }, (old) =>
        old?.map((c) =>
          c.id === activeId
            ? {
                ...c,
                agent_enabled: false,
                needs_review: true,
                review_reason: "bloqueado manualmente",
                auto_paused_at: new Date().toISOString(),
                internal_note: "Conversa bloqueada manualmente pelo painel.",
                contact: c.contact ? { ...c.contact, temperatura: "bloqueado" as const } : c.contact,
              }
            : c,
        ) ?? old,
      );
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["conversations_review_count"] });
    },
    onError: (e) => toast.error((e as Error).message || "Falha ao bloquear"),
  });

  const updateTempMut = useMutation({
    mutationFn: (temperatura: TempKey) =>
      updateContactFn({ data: { id: active!.contact!.id, temperatura } }),
    onMutate: async (temperatura: TempKey) => {
      await qc.cancelQueries({ queryKey: ["conversations"] });
      const previous = qc.getQueriesData({ queryKey: ["conversations"] });
      qc.setQueriesData<Conv[]>({ queryKey: ["conversations"] }, (old) =>
        old?.map((c) =>
          c.id === activeId && c.contact
            ? { ...c, contact: { ...c.contact, temperatura } }
            : c,
        ) ?? old,
      );
      return { previous };
    },
    onError: (err, _v, ctx) => {
      ctx?.previous?.forEach(([key, data]) => qc.setQueryData(key, data));
      toast.error((err as Error).message || "Falha ao atualizar temperatura");
    },
    onSuccess: () => {
      toast.success("Temperatura atualizada");
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["contacts"] });
    },
  });

  const syncMut = useMutation({
    mutationFn: () => syncFn(),
    onMutate: () => setSyncStatus("syncing"),
    onSuccess: (res: any) => {
      setLastSyncAt(new Date());
      setSyncStatus("live");

      qc.invalidateQueries({ queryKey: ["messages", activeWorkspaceId, activeId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["contacts"] });

      const parts = [
        res?.createdConversations ? `${res.createdConversations} conversa(s) nova(s)` : null,
        res?.inserted ? `${res.inserted} mensagem(ns)` : null,
        res?.photosUpdated ? `${res.photosUpdated} foto(s)` : null,
      ].filter(Boolean);

      toast.success(
        parts.length > 0
          ? `Sincronização concluída: ${parts.join(", ")}.`
          : "WhatsApp já está sincronizado.",
      );
    },
    onError: () => {
      setSyncStatus("error");
    },
  });

  // Sem polling: Realtime do Supabase entrega INSERT/UPDATE em messages e
  // conversations em tempo real. O botão "Sincronizar" continua disponível
  // para backfill manual via API do Uazapi.

  // Realtime: refresh on insert/update + reconexão automática a cada 5s
  useEffect(() => {
    if (!activeWorkspaceId) return;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (cancelled) return;
      channel = supabase
        .channel(`conv-rt-${activeWorkspaceId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
          },
          (payload) => {
            const row = (payload.new ?? {}) as { conversation_id?: string };
            qc.invalidateQueries({ queryKey: ["conversations"] });
            qc.invalidateQueries({ queryKey: ["messages", activeWorkspaceId, row.conversation_id] });
            // Auto-foca a conversa que recebeu a mensagem nova
            if (row.conversation_id) setActiveId(row.conversation_id);
            setSyncStatus("live");
            setLastSyncAt(new Date());
          },
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "conversations",
          },
          () => qc.invalidateQueries({ queryKey: ["conversations"] }),
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            setSyncStatus("live");
            setLastSyncAt(new Date());
          } else if (
            status === "CHANNEL_ERROR" ||
            status === "TIMED_OUT" ||
            status === "CLOSED"
          ) {
            setSyncStatus("error");
            // Não chame removeChannel() aqui: em CLOSED o canal já está
            // desmontando, e removeChannel() dispara unsubscribe() → callback
            // de close de novo → recursão infinita ("Maximum call stack size
            // exceeded"). Apenas descarta a referência e agenda a reconexão.
            channel = null;
            if (!cancelled) {
              retry = setTimeout(connect, 5000);
            }
          }
        });
    };

    connect();
    return () => {
      cancelled = true;
      if (retry) clearTimeout(retry);
      if (channel) supabase.removeChannel(channel);
    };
  }, [qc, activeWorkspaceId]);

  return (
    <div className="flex h-[calc(100dvh-4rem)] min-h-0 flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Histórico</p>
          <h1 className="text-3xl font-bold tracking-tight">Conversas</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-full border border-border bg-white px-3 py-1.5 text-xs">
            <span
              className={`relative inline-flex h-2 w-2 rounded-full ${
                syncStatus === "error"
                  ? "bg-red-500"
                  : syncStatus === "syncing"
                  ? "bg-amber-500"
                  : "bg-emerald-500"
              }`}
            >
              {syncStatus === "live" && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              )}
            </span>
            <span className="text-neutral-600">
              {syncStatus === "error"
                ? "Reconectando…"
                : syncStatus === "syncing"
                ? "Sincronizando…"
                : lastSyncAt
                ? `Atualizado às ${lastSyncAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
                : "Em tempo real"}
            </span>
          </div>
          <button
            type="button"
            onClick={() => syncMut.mutate()}
            disabled={syncMut.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-60"
            title="Sincroniza chats, fotos e histórico do WhatsApp para auditoria"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncMut.isPending ? "animate-spin" : ""}`} />
            {syncMut.isPending ? "Sincronizando…" : "Sincronizar"}
          </button>
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
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden rounded-xl border border-border shadow-sm md:grid-cols-[360px_minmax(0,1fr)]">
        {/* === LISTA (lado esquerdo, fundo branco) === */}
        <aside className="min-h-0 overflow-hidden border-r border-border bg-white md:flex md:flex-col">
          <div className="space-y-2 border-b border-border px-4 py-3">
            <h2 className="text-base font-semibold text-neutral-800">Conversas</h2>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por nome, telefone ou mensagem…"
                className="w-full rounded-lg border border-border bg-white py-1.5 pl-8 pr-8 text-xs text-neutral-700 outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
                  title="Limpar busca"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            <div className="flex gap-1 overflow-x-auto pb-0.5">
              {[
                { key: "all", label: "Todos", count: quickCounts.all, icon: null },
                { key: "human", label: "Setor", count: quickCounts.human, icon: UserCheck },
                { key: "payment", label: "Pagamento", count: quickCounts.payment, icon: null },
                { key: "blocked", label: "Venda bloqueada", count: quickCounts.blocked, icon: null },
                { key: "complaint", label: "Reclamações", count: quickCounts.complaint, icon: null },
                { key: "meta", label: "Meta Ads", count: quickCounts.meta, icon: Megaphone },
                { key: "hot", label: "Quentes", count: quickCounts.hot, icon: Flame },
              ].map((item) => {
                const Icon = item.icon;
                const activeFilter = quickFilter === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setQuickFilter(item.key as typeof quickFilter)}
                    className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-medium transition ${
                      activeFilter
                        ? "border-primary bg-primary text-white"
                        : "border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50"
                    }`}
                  >
                    {Icon && <Icon className="h-3 w-3" />}
                    {item.label}
                    <span className={activeFilter ? "text-white/80" : "text-neutral-400"}>
                      {item.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto md:max-h-none md:min-h-0 md:flex-1">
            {convsQ.isLoading && (
              <p className="p-4 text-sm text-neutral-500">Carregando…</p>
            )}
            {!convsQ.isLoading && conversations.length === 0 && (
              <p className="p-4 text-sm text-neutral-500">
                Nenhuma conversa ainda. Quando um contato responder no WhatsApp, ela aparece aqui.
              </p>
            )}
            {!convsQ.isLoading && conversations.length > 0 && filteredConversations.length === 0 && (
              <p className="p-4 text-sm text-neutral-500">
                {searchTerm
                  ? `Nenhuma conversa encontrada para "${searchTerm}".`
                  : "Nenhuma conversa neste filtro."}
              </p>
            )}
            {filteredConversations.map((c) => {
              const sel = c.id === activeId;
              const primaryLabel = contactPrimaryLabel(c.contact);
              const secondaryPhone =
                c.contact && primaryLabel !== formatPhone(c.contact.telefone)
                  ? formatPhone(c.contact.telefone)
                  : null;
              return (
                <button
                  key={c.id}
                  onClick={() => setActiveId(c.id)}
                  className={`flex w-full items-center gap-3 border-b border-neutral-100 px-3 py-3 text-left transition ${
                    sel ? "bg-primary/10" : "hover:bg-neutral-50"
                  }`}
                >
                  <ContactAvatar contact={c.contact} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-neutral-900">
                          {primaryLabel}
                        </span>
                        {secondaryPhone && (
                          <span className="block truncate text-[10px] text-neutral-400">
                            {secondaryPhone}
                          </span>
                        )}
                      </div>
                      <span className="shrink-0 text-[11px] text-neutral-500">
                        {formatTime(c.last_message_at)}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <p className="truncate text-xs text-neutral-500">
                        {c.last_message_preview ?? ""}
                      </p>
                      <div className="flex shrink-0 items-center gap-1">
                        {c.is_test && (
                          <span className="shrink-0 rounded-full bg-purple-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                            🧪 Teste
                          </span>
                        )}
                        {c.needs_review && (
                          <span className="shrink-0 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                            Revisar
                          </span>
                        )}
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
          className="min-h-0 overflow-hidden flex flex-col"
          style={{ backgroundColor: "#ECE5DD" }}
        >
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 bg-white px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              {active?.contact ? (
                <ContactAvatar contact={active.contact} size="sm" />
              ) : (
                <div className="h-10 w-10 rounded-full bg-neutral-200" />
              )}
              <div>
                <h2 className="max-w-[360px] truncate text-sm font-semibold text-neutral-900">
                  {active?.contact ? contactPrimaryLabel(active.contact) : "Selecione uma conversa"}
                </h2>
                {active?.contact && (
                  <p className="text-[11px] text-neutral-500">
                    {formatPhone(active.contact.telefone)}
                  </p>
                )}
                <p className="mt-0.5 text-[11px] flex items-center gap-1.5">
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
            <div className="flex flex-wrap items-center gap-2">
              {active?.contact && (
                <select
                    value={(active.contact.temperatura ?? "frio") as TempKey}
                    onChange={(e) => updateTempMut.mutate(e.target.value as TempKey)}
                    disabled={updateTempMut.isPending}
                    className={`cursor-pointer rounded-full border px-2.5 py-1 text-xs font-medium outline-none transition disabled:opacity-60 ${
                      tempTag[(active.contact.temperatura ?? "frio") as TempKey].cls
                    }`}
                    title="Alterar temperatura do contato manualmente"
                  >
                    {(Object.keys(tempTag) as TempKey[]).map((k) => (
                      <option key={k} value={k}>
                        {tempTag[k].emoji} {tempTag[k].label}
                      </option>
                    ))}
                  </select>
              )}
              {active && (
                <button
                  type="button"
                  onClick={() => void copyFullConversation()}
                  disabled={msgsQ.isLoading}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-xs font-medium text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-50"
                  title="Copiar toda a conversa com transcrições dos áudios"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copiar conversa
                </button>
              )}
              {active && (
                <button
                  type="button"
                  onClick={() => {
                    const shouldEnable = !active.agent_enabled || activeBlocked;
                    if (shouldEnable) {
                      reactivateMut.mutate();
                    } else {
                      toggleMut.mutate(false);
                    }
                  }}
                  disabled={toggleMut.isPending || reactivateMut.isPending}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    active.agent_enabled && !activeBlocked
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                      : activeBlocked
                      ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                      : "border-neutral-200 bg-neutral-100 text-neutral-500 hover:bg-neutral-200"
                  }`}
                  title={activeBlocked ? "Desbloquear conversa e reativar o agente" : "Liga ou desliga o agente IA apenas para este contato"}
                >
                  <span
                    className={`relative inline-flex h-4 w-7 items-center rounded-full transition ${
                      active.agent_enabled && !activeBlocked ? "bg-emerald-500" : activeBlocked ? "bg-red-500" : "bg-neutral-400"
                    }`}
                  >
                    <span
                      className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition ${
                        active.agent_enabled && !activeBlocked ? "translate-x-3.5" : "translate-x-0.5"
                      }`}
                    />
                  </span>
                  {activeBlocked
                    ? reactivateMut.isPending
                      ? "Desbloqueando…"
                      : "Desbloquear agente"
                    : `Agente ${active.agent_enabled ? "ativo" : "desligado"}`}
                </button>
              )}
              {active && (
                <div className="ml-1 flex items-center overflow-hidden rounded-lg border border-neutral-200 bg-white">
                  <button
                    type="button"
                    onClick={() => {
                      if (!activeId || clearMut.isPending) return;
                      if (confirm("Apagar todo o histórico desta conversa? O agente começará do zero na próxima mensagem.")) {
                        clearMut.mutate();
                      }
                    }}
                    disabled={clearMut.isPending}
                    className="inline-flex h-8 w-8 items-center justify-center border-r border-neutral-200 text-neutral-600 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-60"
                    title="Limpar conversa — apaga o histórico e reseta o contexto do agente"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                  {activeBlocked ? (
                    <button
                      type="button"
                      onClick={() => reactivateMut.mutate()}
                      disabled={reactivateMut.isPending}
                      className="inline-flex h-8 w-8 items-center justify-center text-emerald-600 transition hover:bg-emerald-50 disabled:opacity-60"
                      title="Desbloquear conversa e reativar o agente"
                    >
                      <ShieldCheck className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        if (!activeId || blockMut.isPending) return;
                        if (confirm("Bloquear esta conversa? O agente para de responder e o contato fica marcado como bloqueado.")) {
                          blockMut.mutate();
                        }
                      }}
                      disabled={blockMut.isPending}
                      className="inline-flex h-8 w-8 items-center justify-center text-neutral-600 transition hover:bg-neutral-100 disabled:opacity-60"
                      title="Bloquear conversa — pausa o agente e marca o contato como bloqueado"
                    >
                      <Ban className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>
          </header>

          {active?.customer_memory && (
            active.customer_memory.lifecycle === "cliente" ||
            active.customer_memory.lifecycle === "cliente_recorrente"
          ) && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-200 bg-emerald-50 px-4 py-2.5">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-semibold text-emerald-800">✓ Cliente convertido</span>
                <span className="text-emerald-700">
                  · {active.customer_memory.purchase_count || 1} compra(s)
                </span>
                <span className="text-emerald-700">
                  · Recompra {active.customer_memory.repurchase_potential || "médio"}
                </span>
              </div>
              {active.customer_memory.next_opportunity && (
                <span
                  className="max-w-[420px] truncate text-[11px] text-emerald-700"
                  title={active.customer_memory.next_opportunity}
                >
                  Próxima oportunidade: {active.customer_memory.next_opportunity}
                </span>
              )}
            </div>
          )}

          {active?.business_state && (
            <div className="border-b border-neutral-200 bg-neutral-50 px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                    Estado da conversa
                  </p>
                  <p className="mt-0.5 text-sm font-semibold capitalize text-neutral-900">
                    {String(active.business_state.state || "—").replace(/_/g, " ")}
                  </p>
                  {active.business_state.reason && (
                    <p className="mt-1 text-xs text-neutral-600">
                      {active.business_state.reason}
                    </p>
                  )}
                </div>
                <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase ${
                  active.business_state.risk_level === "humano_obrigatorio"
                    ? "border-red-200 bg-red-50 text-red-700"
                    : active.business_state.risk_level === "alto"
                      ? "border-orange-200 bg-orange-50 text-orange-700"
                      : active.business_state.risk_level === "atencao"
                        ? "border-amber-200 bg-amber-50 text-amber-700"
                        : "border-emerald-200 bg-emerald-50 text-emerald-700"
                }`}>
                  Risco: {String(active.business_state.risk_level || "normal").replace(/_/g, " ")}
                </span>
              </div>
              {active.business_state.next_action && (
                <div className="mt-2 rounded-lg border border-neutral-200 bg-white px-2.5 py-2">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-400">
                    Próxima ação recomendada
                  </p>
                  <p className="mt-0.5 text-xs font-medium text-neutral-800">
                    {active.business_state.next_action}
                  </p>
                </div>
              )}
            </div>
          )}

          {active && (
            active.lead_intelligence ? (
              <div className="border-b border-neutral-200 bg-white px-4 py-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <BrainCircuit className="h-4 w-4 text-primary" />
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-700">
                      Lead Intelligence
                    </h3>
                  </div>
                  {active.lead_intelligence.updated_at && (
                    <span className="text-[10px] text-neutral-400">
                      Atualizado {formatDateTime(active.lead_intelligence.updated_at)}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
                  {[
                    ["Temperatura", active.lead_intelligence.temperature ?? "—"],
                    ["Confiança", active.lead_intelligence.confidence ?? "—"],
                    ["Intenção", active.lead_intelligence.intent ?? "—"],
                    ["Estágio", active.lead_intelligence.stage ?? "—"],
                    ["Sentimento", active.lead_intelligence.sentiment ?? "—"],
                    ["Urgência", active.lead_intelligence.urgency ?? "—"],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-2">
                      <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-400">{label}</p>
                      <p className="mt-0.5 truncate text-xs font-semibold text-neutral-800">{value}</p>
                    </div>
                  ))}

                  <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-2">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-400">
                      Probabilidade de Compra
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-200">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{
                            width: `${Math.max(
                              0,
                              Math.min(100, Number(active.lead_intelligence.purchase_probability ?? 0)),
                            )}%`,
                          }}
                        />
                      </div>
                      <span className="text-xs font-bold text-neutral-800">
                        {Math.max(
                          0,
                          Math.min(100, Number(active.lead_intelligence.purchase_probability ?? 0)),
                        )}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 border-b border-neutral-200 bg-white px-4 py-2.5 text-xs text-neutral-500">
                <BrainCircuit className="h-4 w-4 text-primary" />
                <span className="font-medium text-neutral-700">Lead Intelligence</span>
                <span>· aguardando primeira análise do Agent V3</span>
              </div>
            )
          )}

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-6 py-5">
            {!active && (
              <p className="text-sm text-neutral-500">Nada selecionado.</p>
            )}
            {activeBlocked && active && (
              <div className="mb-2 flex flex-wrap items-start justify-between gap-3 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm shadow-sm">
                <div className="min-w-0">
                  <p className="font-semibold text-red-700">
                    Conversa bloqueada
                  </p>
                  <p className="mt-0.5 text-xs text-red-700/90">
                    {active.internal_note ??
                      `Motivo: ${active.review_reason ?? "conversa improdutiva detectada"}`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => reactivateMut.mutate()}
                  disabled={reactivateMut.isPending}
                  className="shrink-0 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
                >
                  {reactivateMut.isPending ? "Reativando…" : "Reativar agente"}
                </button>
              </div>
            )}
            {(msgsQ.data ?? []).map((m) => {
              const mine = m.sender === "agente";
              const hasAudio = m.kind === "audio" && !!m.audio_url;
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
                    {hasAudio && (
                      <audio
                        controls
                        preload="metadata"
                        src={m.audio_url ?? undefined}
                        className="mb-2 w-64 max-w-full"
                      />
                    )}
                    {m.kind === "audio" && (
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                        Áudio · transcrição
                      </p>
                    )}
                    <p className="whitespace-pre-wrap leading-snug">
                      {m.body === "[áudio recebido]"
                        ? "Áudio recebido — aguardando transcrição."
                        : m.body}
                    </p>
                    <p className="mt-1 text-right text-[10px] text-neutral-500">
                      {formatTime(m.created_at)}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
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