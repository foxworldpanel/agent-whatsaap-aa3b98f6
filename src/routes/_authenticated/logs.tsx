import { createFileRoute, ErrorComponent, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [phoneFilter, setPhoneFilter] = useState<string>("");
  const [dateFilter, setDateFilter] = useState<string>("");
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const fetchLogs = async () => {
    setLoading(true);
    let q = supabase.from("agent_logs").select("*").order("created_at", { ascending: false }).limit(500);
    if (onlyErrors) q = q.eq("level", "error");
    if (typeFilter !== "all") q = q.eq("type", typeFilter);
    if (phoneFilter.trim()) q = q.ilike("phone", `%${phoneFilter.trim()}%`);
    if (dateFilter) {
      const start = new Date(`${dateFilter}T00:00:00`).toISOString();
      const end = new Date(`${dateFilter}T23:59:59.999`).toISOString();
      q = q.gte("created_at", start).lte("created_at", end);
    }
    const { data, error } = await q;
    if (!error) setLogs((data ?? []) as AgentLog[]);
    setLoading(false);
  };

  useEffect(() => {
    void fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeFilter, phoneFilter, dateFilter, onlyErrors]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel("agent_logs_stream")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "agent_logs" }, (payload) => {
        const row = payload.new as AgentLog;
        if (onlyErrors && row.level !== "error") return;
        if (typeFilter !== "all" && row.type !== typeFilter) return;
        if (phoneFilter.trim() && !(row.phone ?? "").includes(phoneFilter.trim())) return;
        setLogs((prev) => [row, ...prev].slice(0, 500));
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [onlyErrors, typeFilter, phoneFilter]);

  const types = useMemo(() => {
    const set = new Set<string>(["message_received", "claude_reply", "whisper_transcribe", "elevenlabs_tts", "free_trial", "smm_services", "duplicate_blocked", "send_failed"]);
    logs.forEach((l) => set.add(l.type));
    return Array.from(set);
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
        {loading && logs.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">Carregando…</p>
        ) : logs.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">Nenhum log encontrado.</p>
        ) : (
          <ul className="divide-y divide-border">
            {logs.map((l) => {
              const open = expanded.has(l.id);
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
                    <Badge variant="secondary" className="shrink-0">{l.type}</Badge>
                    <span className="flex-1 text-sm">{l.summary}</span>
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