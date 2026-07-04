import { createFileRoute, ErrorComponent, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState } from "react";
import { listAgentLogs } from "@/lib/agent.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ChevronDown, ChevronRight, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

type AgentLog = {
  id: string;
  phone: string | null;
  conversation_id: string | null;
  type: string;
  level: "info" | "warn" | "error";
  summary: string;
  prompt: string | null;
  response: string | null;
  error: string | null;
  duration_ms: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export const Route = createFileRoute("/_authenticated/logs")({
  component: LogsPage,
  errorComponent: ErrorComponent,
  notFoundComponent: () => <p>Não encontrado</p>,
});

function LogsPage() {
  const router = useRouter();
  const listLogs = useServerFn(listAgentLogs);
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [origemFilter, setOrigemFilter] = useState<"all" | "meta_ads" | "disparo" | "conversas" | "sistema">("all");
  const [phoneFilter, setPhoneFilter] = useState<string>("");
  const [dateFilter, setDateFilter] = useState<string>("");
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Mapeia tipo de log → origem canônica
  const inferOrigem = (l: AgentLog): "meta_ads" | "disparo" | "conversas" | "sistema" => {
    const meta = (l.metadata ?? {}) as Record<string, unknown>;
    const explicit = typeof meta.origem === "string" ? (meta.origem as string) : null;
    if (explicit === "meta_ads" || explicit === "disparo" || explicit === "conversas" || explicit === "sistema") return explicit;
    const t = l.type ?? "";
    if (t.startsWith("blast_") || t === "campaign_dispatch") return "disparo";
    if (t === "meta_ads_lead" || t.includes("meta_ads")) return "meta_ads";
    if (t === "message_from_client" || t === "message_sent_manual" || t === "message_received" || t === "claude_reply" || t === "agent_reply_sent" || t === "whisper_transcribe" || t === "elevenlabs_tts") return "conversas";
    return "sistema";
  };

  const inferDirecao = (l: AgentLog): "enviado" | "recebido" | null => {
    const meta = (l.metadata ?? {}) as Record<string, unknown>;
    if (meta.direcao === "enviado" || meta.direcao === "recebido") return meta.direcao;
    if (l.type === "message_from_client") return "recebido";
    if (l.type === "claude_reply" || l.type === "agent_reply_sent" || l.type === "message_sent_manual" || l.type === "blast_sent") return "enviado";
    return null;
  };

  const inferTipo = (l: AgentLog): string => {
    const meta = (l.metadata ?? {}) as Record<string, unknown>;
    if (typeof meta.tipo === "string") return meta.tipo.replace(/_/g, " ");
    if (l.type === "blast_sent") return "Abertura/Follow-up";
    if (l.type === "agent_reply_sent" || l.type === "claude_reply") return "Resposta do agente";
    if (l.type === "message_from_client") return "Mensagem do cliente";
    if (l.level === "error" || l.type.includes("failed")) return "Erro";
    return l.type;
  };

  const getContactLabel = (l: AgentLog): string => {
    const meta = (l.metadata ?? {}) as Record<string, unknown>;
    const nome = typeof meta.contato_nome === "string" ? meta.contato_nome : "";
    return [nome, l.phone].filter(Boolean).join(" · ") || "—";
  };

  const contentSummary = (l: AgentLog): string => (l.response || l.summary || l.error || "").slice(0, 140);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const data = await listLogs({
        data: {
          onlyErrors,
          type: typeFilter !== "all" ? typeFilter : undefined,
          phone: phoneFilter.trim() || undefined,
          date: dateFilter || undefined,
        },
      });
      setLogs((data ?? []) as AgentLog[]);
    } catch (e) {
      setErrorMessage((e as Error)?.message ?? "Falha ao carregar logs");
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [dateFilter, listLogs, onlyErrors, phoneFilter, typeFilter]);

  useEffect(() => {
    void fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void fetchLogs();
    }, 7000);
    return () => {
      window.clearInterval(interval);
    };
  }, [fetchLogs]);

  const types = useMemo(() => {
    const set = new Set<string>(["message_received", "message_from_client", "message_sent_manual", "claude_reply", "whisper_transcribe", "elevenlabs_tts", "free_trial", "smm_services", "duplicate_blocked", "send_failed", "blast_sent", "blast_failed", "meta_ads_lead"]);
    logs.forEach((l) => set.add(l.type));
    return Array.from(set);
  }, [logs]);

  const filteredLogs = useMemo(() => {
    if (origemFilter === "all") return logs;
    return logs.filter((l) => inferOrigem(l) === origemFilter);
  }, [logs, origemFilter]);

  // Contagem Haiku vs Sonnet nos logs carregados (últimos claude_reply).
  const modelCounts = useMemo(() => {
    let haiku = 0, sonnet = 0, other = 0;
    for (const l of logs) {
      if (l.type !== "claude_reply" || l.level === "error") continue;
      const m = (l.metadata ?? {}) as Record<string, unknown>;
      const model = typeof m.model === "string" ? m.model : null;
      if (model?.includes("haiku")) haiku += 1;
      else if (model?.includes("sonnet")) sonnet += 1;
      else if (model) other += 1;
    }
    return { haiku, sonnet, other, total: haiku + sonnet + other };
  }, [logs]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Logs do Agente</h1>
          <p className="text-sm text-muted-foreground">Atualiza em tempo real. Retenção de 7 dias.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { void fetchLogs(); router.invalidate(); }}>
          <RefreshCw className="mr-2 h-4 w-4" /> Atualizar
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-4">
        <div className="flex w-full flex-wrap items-center gap-2">
          {([
            { id: "all", label: "Todos" },
            { id: "meta_ads", label: "📣 Meta Ads" },
            { id: "disparo", label: "🚀 Disparo" },
            { id: "conversas", label: "💬 Conversas" },
            { id: "sistema", label: "⚙️ Sistema/Erros" },
          ] as const).map((o) => (
            <Button
              key={o.id}
              size="sm"
              variant={origemFilter === o.id ? "default" : "outline"}
              onClick={() => setOrigemFilter(o.id)}
            >
              {o.label}
            </Button>
          ))}
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Tipo</label>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              {types.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Telefone</label>
          <Input value={phoneFilter} onChange={(e) => setPhoneFilter(e.target.value)} placeholder="55119..." className="w-48" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Data</label>
          <Input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="w-44" />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm">Apenas erros</span>
          <Switch checked={onlyErrors} onCheckedChange={setOnlyErrors} />
        </div>
      </div>

      <div className="rounded-lg border border-border">
        {errorMessage ? (
          <p className="p-6 text-sm text-red-600">Erro ao carregar logs: {errorMessage}</p>
        ) : loading && filteredLogs.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">Carregando…</p>
        ) : filteredLogs.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">Nenhum log encontrado.</p>
        ) : (
          <ul className="divide-y divide-border">
            {filteredLogs.map((l) => {
              const open = expanded.has(l.id);
              const origem = inferOrigem(l);
              const direcao = inferDirecao(l);
              const origemLabel = origem === "meta_ads" ? "📣 Meta Ads" : origem === "disparo" ? "🚀 Disparo" : origem === "conversas" ? "💬 Conversas" : "⚙️ Sistema";
              const statusLabel = l.level === "error" ? "❌ Falha" : "✅ Sucesso";
              return (
                <li key={l.id} className="p-3">
                  <button onClick={() => toggle(l.id)} className="flex w-full items-start gap-3 text-left">
                    {open ? <ChevronDown className="mt-1 h-4 w-4 text-muted-foreground" /> : <ChevronRight className="mt-1 h-4 w-4 text-muted-foreground" />}
                    <Badge variant="outline" className={cn(
                      "shrink-0",
                      l.level === "error" && "border-red-500 text-red-600",
                      l.level === "warn" && "border-yellow-500 text-yellow-600",
                      l.level === "info" && "border-emerald-500 text-emerald-600",
                    )}>{l.level}</Badge>
                    <Badge variant="secondary" className="shrink-0">{origemLabel}</Badge>
                    {direcao && (
                      <Badge variant="outline" className="shrink-0">
                        {direcao === "enviado" ? "📤 Enviado" : "📥 Recebido"}
                      </Badge>
                    )}
                    <Badge variant="secondary" className="shrink-0">{inferTipo(l)}</Badge>
                    <Badge variant={l.level === "error" ? "destructive" : "outline"} className="shrink-0">{statusLabel}</Badge>
                    <span className="w-44 shrink-0 truncate text-xs text-muted-foreground">{getContactLabel(l)}</span>
                    <span className="flex-1 text-sm">{contentSummary(l)}</span>
                    {l.duration_ms !== null && <span className="text-xs text-muted-foreground">{l.duration_ms}ms</span>}
                    {l.phone && <span className="text-xs text-muted-foreground">{l.phone}</span>}
                    <span className="text-xs text-muted-foreground">{new Date(l.created_at).toLocaleString()}</span>
                  </button>
                  {open && (
                    <div className="mt-3 ml-7 space-y-2 text-xs">
                      {l.prompt && (
                        <div>
                          <p className="mb-1 font-semibold text-muted-foreground">Prompt enviado ao Claude</p>
                          <pre className="max-h-80 overflow-auto rounded bg-muted p-2 whitespace-pre-wrap">{l.prompt}</pre>
                        </div>
                      )}
                      {l.response && (
                        <div>
                          <p className="mb-1 font-semibold text-muted-foreground">Resposta</p>
                          <pre className="max-h-80 overflow-auto rounded bg-muted p-2 whitespace-pre-wrap">{l.response}</pre>
                        </div>
                      )}
                      {l.error && (
                        <div>
                          <p className="mb-1 font-semibold text-red-600">Erro</p>
                          <pre className="max-h-80 overflow-auto rounded bg-red-500/10 p-2 whitespace-pre-wrap text-red-700">{l.error}</pre>
                        </div>
                      )}
                      {l.metadata && (
                        <div>
                          <p className="mb-1 font-semibold text-muted-foreground">Metadata</p>
                          <pre className="max-h-60 overflow-auto rounded bg-muted p-2 whitespace-pre-wrap">{JSON.stringify(l.metadata, null, 2)}</pre>
                        </div>
                      )}
                      {l.conversation_id && (
                        <p className="text-muted-foreground">Conversa: {l.conversation_id}</p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}