import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Eye,
  Filter,
  LoaderCircle,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  TimerReset,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  getFunnelControlOverview,
  getFunnelRunEvents,
  pauseFunnelRun,
  resumeFunnelRun,
  retryAllFailedFunnelRuns,
  retryFunnelRun,
} from "@/lib/funnel-control.functions";
import { useWorkspace } from "@/contexts/workspace-context";

export const Route = createFileRoute("/_authenticated/funis")({
  ssr: false,
  head: () => ({ meta: [{ title: "Central do Funil · ZapAgent" }] }),
  component: FunnelControlCenter,
});

type FunnelStatus = "running" | "completed" | "failed" | "paused";

type Run = {
  funnel_id: string;
  contact_id: string;
  status: FunnelStatus;
  fired_at: string;
  completed_at?: string | null;
  last_step?: string | null;
  last_step_index?: number | null;
  error_message?: string | null;
  updated_at?: string | null;
  paused_at?: string | null;
  resumed_at?: string | null;
  retry_count?: number | null;
  last_error_at?: string | null;
  initiated_by?: string | null;
  error_category?: string | null;
  stale?: boolean;
  funnel?: {
    id: string;
    name: string;
    whatsapp_number_id?: string | null;
    enabled?: boolean;
  } | null;
  contact?: {
    id: string;
    nome?: string | null;
    telefone?: string | null;
    photo_url?: string | null;
  } | null;
  number?: {
    id: string;
    nome?: string | null;
    status?: string | null;
  } | null;
  conversation?: {
    id: string;
    agent_enabled?: boolean;
    needs_review?: boolean;
  } | null;
};

type Overview = {
  counts: {
    total: number;
    running: number;
    completed: number;
    failed: number;
    paused: number;
    stale: number;
  };
  success_rate_24h: number | null;
  completed_24h: number;
  failed_24h: number;
  runs: Run[];
  generated_at: string;
};

const statusMeta: Record<FunnelStatus, { label: string; cls: string }> = {
  running: {
    label: "Em andamento",
    cls: "border-blue-200 bg-blue-50 text-blue-700",
  },
  completed: {
    label: "Enviado",
    cls: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  failed: {
    label: "Falhou",
    cls: "border-red-200 bg-red-50 text-red-700",
  },
  paused: {
    label: "Pausado",
    cls: "border-amber-200 bg-amber-50 text-amber-700",
  },
};

const stepLabels: Record<string, string> = {
  welcome_text: "Texto inicial",
  audio: "Áudio",
  panel_text: "Link do painel",
  video: "Vídeo",
  services_text: "Tabela/serviços",
};

function fmtDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function FunnelControlCenter() {
  const { activeWorkspaceId } = useWorkspace();
  const qc = useQueryClient();
  const getOverview = useServerFn(getFunnelControlOverview);
  const pauseFn = useServerFn(pauseFunnelRun);
  const resumeFn = useServerFn(resumeFunnelRun);
  const retryFn = useServerFn(retryFunnelRun);
  const retryAllFn = useServerFn(retryAllFailedFunnelRuns);

  const [status, setStatus] = useState<"all" | FunnelStatus | "stale">("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Run | null>(null);

  const q = useQuery({
    queryKey: ["funnel_control_overview", activeWorkspaceId],
    queryFn: () => getOverview() as Promise<Overview>,
    refetchInterval: 5000,
  });

  const data = q.data;
  const runs = data?.runs ?? [];

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return runs.filter((run) => {
      if (status === "stale" && !run.stale) return false;
      if (status !== "all" && status !== "stale" && run.status !== status) return false;
      if (!needle) return true;
      return [
        run.contact?.nome,
        run.contact?.telefone,
        run.funnel?.name,
        run.number?.nome,
        run.error_message,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [runs, search, status]);

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["funnel_control_overview", activeWorkspaceId] });

  const pauseMut = useMutation({
    mutationFn: (run: Run) =>
      pauseFn({ data: { funnel_id: run.funnel_id, contact_id: run.contact_id } }),
    onSuccess: () => {
      toast.success("Funil pausado.");
      invalidate();
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const resumeMut = useMutation({
    mutationFn: (run: Run) =>
      resumeFn({ data: { funnel_id: run.funnel_id, contact_id: run.contact_id } }),
    onSuccess: () => {
      toast.success("Funil retomado e concluído.");
      invalidate();
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const retryMut = useMutation({
    mutationFn: (run: Run) =>
      retryFn({ data: { funnel_id: run.funnel_id, contact_id: run.contact_id } }),
    onSuccess: () => {
      toast.success("Reenvio concluído.");
      invalidate();
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const retryAllMut = useMutation({
    mutationFn: () => retryAllFn(),
    onSuccess: (result: any) => {
      toast.success(
        `Reenvio: ${result.succeeded ?? 0} concluído(s), ${result.failed ?? 0} ainda com erro.`,
      );
      invalidate();
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const busy =
    pauseMut.isPending ||
    resumeMut.isPending ||
    retryMut.isPending ||
    retryAllMut.isPending;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Operação WhatsApp</p>
          <h1 className="text-3xl font-bold tracking-tight">Central do Funil</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Acompanhe cada execução em tempo real, identifique onde parou e corrija falhas sem acessar o banco.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {(data?.counts.failed ?? 0) > 0 && (
            <button
              type="button"
              disabled={busy}
              onClick={() => retryAllMut.mutate()}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {retryAllMut.isPending ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              Reenviar falhos
            </button>
          )}

          <button
            type="button"
            onClick={() => q.refetch()}
            disabled={q.isFetching}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${q.isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <MetricCard
          title="Em andamento"
          value={data?.counts.running ?? 0}
          icon={<Activity className="h-4 w-4" />}
          hint="Executando agora"
        />
        <MetricCard
          title="Enviados"
          value={data?.counts.completed ?? 0}
          icon={<CheckCircle2 className="h-4 w-4" />}
          hint={`${data?.completed_24h ?? 0} nas últimas 24h`}
        />
        <MetricCard
          title="Falhas"
          value={data?.counts.failed ?? 0}
          icon={<AlertTriangle className="h-4 w-4" />}
          hint={`${data?.failed_24h ?? 0} nas últimas 24h`}
        />
        <MetricCard
          title="Pausados"
          value={data?.counts.paused ?? 0}
          icon={<Pause className="h-4 w-4" />}
          hint="Aguardando ação"
        />
        <MetricCard
          title="Travados"
          value={data?.counts.stale ?? 0}
          icon={<TimerReset className="h-4 w-4" />}
          hint=">15 min sem progresso"
        />
        <MetricCard
          title="Sucesso 24h"
          value={data?.success_rate_24h == null ? "—" : `${data.success_rate_24h}%`}
          icon={<Send className="h-4 w-4" />}
          hint="Concluídos x falhas"
        />
      </div>

      {(data?.counts.failed ?? 0) > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <div>
            <p className="text-sm font-semibold text-red-900">
              {data?.counts.failed} execução(ões) precisam de atenção
            </p>
            <p className="mt-0.5 text-xs text-red-700">
              Abra os detalhes para ver a etapa e o erro. O reenvio continua após a última etapa concluída, evitando repetir mensagens que já chegaram ao cliente.
            </p>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
          <div className="flex flex-wrap gap-1.5">
            <FilterButton active={status === "all"} onClick={() => setStatus("all")}>
              Todos {data?.counts.total ?? 0}
            </FilterButton>
            <FilterButton active={status === "running"} onClick={() => setStatus("running")}>
              Em andamento {data?.counts.running ?? 0}
            </FilterButton>
            <FilterButton active={status === "completed"} onClick={() => setStatus("completed")}>
              Enviados {data?.counts.completed ?? 0}
            </FilterButton>
            <FilterButton active={status === "failed"} onClick={() => setStatus("failed")}>
              Falhas {data?.counts.failed ?? 0}
            </FilterButton>
            <FilterButton active={status === "paused"} onClick={() => setStatus("paused")}>
              Pausados {data?.counts.paused ?? 0}
            </FilterButton>
            <FilterButton active={status === "stale"} onClick={() => setStatus("stale")}>
              Travados {data?.counts.stale ?? 0}
            </FilterButton>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Contato, telefone, funil ou erro..."
              className="w-full rounded-lg border border-border py-2 pl-9 pr-3 text-sm outline-none focus:border-primary"
            />
          </div>
        </div>

        {q.isLoading ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            Carregando execuções…
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-neutral-300" />
            <p className="mt-3 text-sm font-medium text-neutral-700">
              Nenhuma execução neste filtro
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] text-left text-sm">
              <thead className="border-b border-border bg-neutral-50 text-[11px] uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Cliente</th>
                  <th className="px-4 py-3 font-semibold">Funil / Número</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Progresso</th>
                  <th className="px-4 py-3 font-semibold">Atualizado</th>
                  <th className="px-4 py-3 font-semibold">Motivo / Erro</th>
                  <th className="px-4 py-3 text-right font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((run) => (
                  <RunRow
                    key={`${run.funnel_id}:${run.contact_id}`}
                    run={run}
                    busy={busy}
                    onDetails={() => setSelected(run)}
                    onPause={() => pauseMut.mutate(run)}
                    onResume={() => resumeMut.mutate(run)}
                    onRetry={() => retryMut.mutate(run)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Atualização automática a cada 5 segundos. “Travado” indica execução em andamento sem progresso há mais de 15 minutos.
      </p>

      {selected && (
        <RunDetails
          run={selected}
          onClose={() => setSelected(null)}
          onPause={() => pauseMut.mutate(selected)}
          onResume={() => resumeMut.mutate(selected)}
          onRetry={() => retryMut.mutate(selected)}
          busy={busy}
        />
      )}
    </div>
  );
}

function MetricCard({
  title,
  value,
  hint,
  icon,
}: {
  title: string;
  value: number | string;
  hint: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-white p-4">
      <div className="flex items-center justify-between text-muted-foreground">
        <p className="text-xs font-medium">{title}</p>
        {icon}
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight">{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
        active
          ? "bg-neutral-900 text-white"
          : "border border-border bg-white text-neutral-600 hover:bg-neutral-50"
      }`}
    >
      {children}
    </button>
  );
}

function RunRow({
  run,
  busy,
  onDetails,
  onPause,
  onResume,
  onRetry,
}: {
  run: Run;
  busy: boolean;
  onDetails: () => void;
  onPause: () => void;
  onResume: () => void;
  onRetry: () => void;
}) {
  const status = statusMeta[run.status] || statusMeta.failed;
  const progress = Math.max(0, Math.min(5, Number(run.last_step_index || 0)));

  return (
    <tr className="align-top hover:bg-neutral-50/60">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2.5">
          {run.contact?.photo_url ? (
            <img
              src={run.contact.photo_url}
              alt=""
              className="h-8 w-8 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-100 text-xs font-semibold text-neutral-600">
              {(run.contact?.nome || run.contact?.telefone || "?").slice(0, 1).toUpperCase()}
            </div>
          )}
          <div>
            <p className="font-medium text-neutral-900">
              {run.contact?.nome || "Sem nome"}
            </p>
            <p className="text-xs text-neutral-500">{run.contact?.telefone || "—"}</p>
          </div>
        </div>
      </td>

      <td className="px-4 py-3">
        <p className="font-medium text-neutral-800">{run.funnel?.name || "Funil"}</p>
        <p className="mt-0.5 text-xs text-neutral-500">
          {run.number?.nome || "Número não identificado"}
        </p>
      </td>

      <td className="px-4 py-3">
        <span className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold ${status.cls}`}>
          {run.stale ? "Travado" : status.label}
        </span>
        {Number(run.retry_count || 0) > 0 && (
          <p className="mt-1 text-[10px] text-neutral-400">
            {run.retry_count} tentativa(s) extra
          </p>
        )}
      </td>

      <td className="px-4 py-3">
        <div className="w-40">
          <div className="flex items-center justify-between text-[11px] text-neutral-500">
            <span>{run.status === "completed" ? "Completo" : stepLabels[run.last_step || ""] || "Aguardando"}</span>
            <span>{run.status === "completed" ? 5 : progress}/5</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-neutral-100">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${run.status === "completed" ? 100 : (progress / 5) * 100}%` }}
            />
          </div>
        </div>
      </td>

      <td className="px-4 py-3 text-xs text-neutral-600">
        {fmtDate(run.updated_at || run.fired_at)}
      </td>

      <td className="max-w-xs px-4 py-3">
        {run.error_message ? (
          <div>
            {run.error_category && (
              <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-500">
                {run.error_category}
              </p>
            )}
            <p className="line-clamp-2 text-xs text-red-700" title={run.error_message}>
              {run.error_message}
            </p>
          </div>
        ) : run.stale ? (
          <p className="text-xs text-amber-700">Sem progresso há mais de 15 min.</p>
        ) : (
          <p className="text-xs text-neutral-400">—</p>
        )}
      </td>

      <td className="px-4 py-3">
        <div className="flex justify-end gap-1.5">
          <button
            type="button"
            onClick={onDetails}
            className="rounded-md border border-border p-1.5 text-neutral-600 hover:bg-white"
            title="Ver detalhes"
          >
            <Eye className="h-4 w-4" />
          </button>

          {run.status === "running" && !run.stale && (
            <button
              type="button"
              disabled={busy}
              onClick={onPause}
              className="rounded-md border border-amber-200 bg-amber-50 p-1.5 text-amber-700 hover:bg-amber-100 disabled:opacity-50"
              title="Pausar"
            >
              <Pause className="h-4 w-4" />
            </button>
          )}

          {run.status === "paused" && (
            <button
              type="button"
              disabled={busy}
              onClick={onResume}
              className="rounded-md border border-blue-200 bg-blue-50 p-1.5 text-blue-700 hover:bg-blue-100 disabled:opacity-50"
              title="Retomar"
            >
              <Play className="h-4 w-4" />
            </button>
          )}

          {(run.status === "failed" || run.stale) && (
            <button
              type="button"
              disabled={busy}
              onClick={onRetry}
              className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
              title="Reenviar a partir da última etapa concluída"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reenviar
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

function RunDetails({
  run,
  onClose,
  onPause,
  onResume,
  onRetry,
  busy,
}: {
  run: Run;
  onClose: () => void;
  onPause: () => void;
  onResume: () => void;
  onRetry: () => void;
  busy: boolean;
}) {
  const getEvents = useServerFn(getFunnelRunEvents);
  const eventsQ = useQuery({
    queryKey: ["funnel_run_events", run.funnel_id, run.contact_id],
    queryFn: () =>
      getEvents({
        data: { funnel_id: run.funnel_id, contact_id: run.contact_id },
      }),
    refetchInterval: run.status === "running" ? 3000 : false,
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
      <div className="h-full w-full max-w-xl overflow-y-auto bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-white px-5 py-4">
          <div>
            <p className="text-xs text-muted-foreground">Execução do funil</p>
            <h2 className="text-lg font-semibold">{run.funnel?.name || "Funil"}</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 hover:bg-neutral-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          <div className="rounded-xl border border-border bg-neutral-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium">{run.contact?.nome || "Sem nome"}</p>
                <p className="text-xs text-muted-foreground">{run.contact?.telefone || "—"}</p>
              </div>
              <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusMeta[run.status].cls}`}>
                {run.stale ? "Travado" : statusMeta[run.status].label}
              </span>
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
              <div>
                <dt className="text-muted-foreground">Iniciado</dt>
                <dd className="mt-0.5 font-medium">{fmtDate(run.fired_at)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Última atualização</dt>
                <dd className="mt-0.5 font-medium">{fmtDate(run.updated_at)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Última etapa</dt>
                <dd className="mt-0.5 font-medium">{stepLabels[run.last_step || ""] || "Nenhuma"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Reenvios</dt>
                <dd className="mt-0.5 font-medium">{run.retry_count || 0}</dd>
              </div>
            </dl>

            {run.error_message && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-red-500">
                  Motivo da falha
                </p>
                <p className="mt-1 whitespace-pre-wrap text-xs text-red-800">
                  {run.error_message}
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {run.status === "running" && !run.stale && (
              <button
                disabled={busy}
                onClick={onPause}
                className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700"
              >
                <Pause className="h-4 w-4" /> Pausar
              </button>
            )}
            {run.status === "paused" && (
              <button
                disabled={busy}
                onClick={onResume}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white"
              >
                <Play className="h-4 w-4" /> Retomar
              </button>
            )}
            {(run.status === "failed" || run.stale) && (
              <button
                disabled={busy}
                onClick={onRetry}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white"
              >
                <RotateCcw className="h-4 w-4" />
                Reenviar do ponto da falha
              </button>
            )}
            {run.conversation?.id && (
              <Link
                to="/conversas"
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-neutral-700"
              >
                Abrir conversa
              </Link>
            )}
          </div>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">Linha do tempo</h3>
                <p className="text-xs text-muted-foreground">
                  Eventos e etapas desta execução.
                </p>
              </div>
              {eventsQ.isFetching && <LoaderCircle className="h-4 w-4 animate-spin text-neutral-400" />}
            </div>

            <div className="space-y-2">
              {(eventsQ.data ?? []).length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">
                  Sem eventos detalhados. Execuções anteriores à Central do Funil podem não possuir histórico de etapas.
                </div>
              ) : (
                (eventsQ.data ?? []).map((event: any) => (
                  <div key={event.id} className="flex gap-3 rounded-lg border border-border p-3">
                    <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-xs font-semibold text-neutral-800">
                          {event.event_type}
                        </p>
                        {event.step_key && (
                          <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-500">
                            {stepLabels[event.step_key] || event.step_key}
                          </span>
                        )}
                      </div>
                      {event.message && (
                        <p className="mt-1 break-words text-xs text-neutral-600">{event.message}</p>
                      )}
                      <p className="mt-1 text-[10px] text-neutral-400">{fmtDate(event.created_at)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
