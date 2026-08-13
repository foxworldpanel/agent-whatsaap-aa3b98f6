import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Gift, ExternalLink } from "lucide-react";
import { listFreeTrials } from "@/lib/free-trials.functions";
import { getIntegrations, saveIntegrations } from "@/lib/agent.functions";
import { TesteGratisCard } from "@/components/agente/TesteGratisCard";

export const Route = createFileRoute("/_authenticated/teste-gratis")({
  ssr: false,
  head: () => ({ meta: [{ title: "Teste Grátis · ZapAgent" }] }),
  component: TesteGratisPage,
});

const statusStyle: Record<string, string> = {
  pending: "bg-warning/20 text-warning",
  processing: "bg-primary/20 text-primary",
  in_progress: "bg-primary/20 text-primary",
  completed: "bg-success/20 text-success",
  partial: "bg-warning/20 text-warning",
  failed: "bg-destructive/20 text-destructive",
  canceled: "bg-muted text-muted-foreground",
  timeout: "bg-destructive/20 text-destructive",
};

function TesteGratisPage() {
  const qc = useQueryClient();
  const list = useServerFn(listFreeTrials);
  const { data: trials = [], isLoading } = useQuery({
    queryKey: ["free-trials"],
    queryFn: () => list(),
    refetchInterval: 30000,
  });

  const fetchInt = useServerFn(getIntegrations);
  const saveInt = useServerFn(saveIntegrations);
  const intQ = useQuery({ queryKey: ["integrations"], queryFn: () => fetchInt() });
  const [masterEnabled, setMasterEnabled] = useState(false);

  useEffect(() => {
    if (intQ.data) {
      setMasterEnabled(!!(intQ.data as any).free_trial_enabled);
    }
  }, [intQ.data]);

  const saveMasterMut = useMutation({
    mutationFn: (next: boolean) =>
      saveInt({ data: { ...(intQ.data ?? {}), free_trial_enabled: next } as any }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["integrations"] }),
  });

  const total = trials.length;
  const completed = trials.filter((t) => t.status === "completed").length;
  const pending = trials.filter((t) => ["pending", "processing", "in_progress"].includes(t.status)).length;

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Integração MIND SMM Panel</p>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Gift className="h-7 w-7 text-primary" />
            Teste Grátis
          </h1>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total" value={total} />
        <StatCard label="Em andamento" value={pending} />
        <StatCard label="Completos" value={completed} />
      </div>

      <div className="rounded-xl border border-border p-5" style={{ background: "var(--gradient-card)" }}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold">Teste grátis ativo no agente</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Chave-mestra: se desligado, a Júlia nunca cria teste grátis nenhum, mesmo que os serviços abaixo estejam configurados. Use pra desligar rápido se algo der errado.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              const next = !masterEnabled;
              setMasterEnabled(next);
              saveMasterMut.mutate(next);
            }}
            disabled={saveMasterMut.isPending}
            className={`flex h-7 w-12 shrink-0 items-center rounded-full transition ${masterEnabled ? "bg-primary" : "bg-muted"}`}
          >
            <span className={`block h-5 w-5 rounded-full bg-white transition-transform ${masterEnabled ? "translate-x-6" : "translate-x-1"}`} />
          </button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {saveMasterMut.isPending
            ? "Salvando…"
            : masterEnabled
              ? "✅ Ativado — a Júlia pode criar testes grátis automaticamente"
              : "⛔ Desativado — nenhum teste grátis novo será criado"}
        </p>
      </div>

      <TesteGratisCard />

      <div className="rounded-xl border border-border p-4 text-sm text-muted-foreground" style={{ background: "var(--gradient-card)" }}>
        Configure a API SMM em <a href="/agente" className="text-primary underline">Agente IA → Integrações</a>.
        Escolha acima quais serviços entram no teste grátis e a quantidade de cada um.
        <br />
        <strong className="text-foreground">Status atual:</strong> a criação automática do teste grátis pela Júlia durante a conversa ainda não está conectada — essa tela hoje serve pra configurar e acompanhar, a criação automática é o próximo passo.
      </div>

      <div className="overflow-hidden rounded-xl border border-border" style={{ background: "var(--gradient-card)" }}>
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-5 py-3 text-left font-medium">Telefone</th>
              <th className="px-5 py-3 text-left font-medium">Link</th>
              <th className="px-5 py-3 text-left font-medium">Order ID</th>
              <th className="px-5 py-3 text-left font-medium">Qtd</th>
              <th className="px-5 py-3 text-left font-medium">Status</th>
              <th className="px-5 py-3 text-left font-medium">Criado em</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {trials.map((t) => (
              <tr key={t.id} className="transition hover:bg-muted/20">
                <td className="px-5 py-3 tabular-nums">{t.telefone}</td>
                <td className="px-5 py-3 max-w-[280px] truncate">
                  {t.link_enviado ? (
                    <a href={t.link_enviado} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                      {t.link_enviado} <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : "—"}
                </td>
                <td className="px-5 py-3 text-muted-foreground tabular-nums">{t.order_id ?? "—"}</td>
                <td className="px-5 py-3 tabular-nums">{t.quantidade ?? 100}</td>
                <td className="px-5 py-3">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs ${statusStyle[t.status] ?? "bg-muted text-muted-foreground"}`}>
                    {t.status}
                  </span>
                </td>
                <td className="px-5 py-3 text-muted-foreground">
                  {t.criado_em ? new Date(t.criado_em).toLocaleString("pt-BR") : "—"}
                </td>
              </tr>
            ))}
            {!isLoading && trials.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-12 text-center text-muted-foreground">Nenhum teste grátis ainda</td></tr>
            )}
            {isLoading && (
              <tr><td colSpan={6} className="px-5 py-12 text-center text-muted-foreground">Carregando…</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border p-4" style={{ background: "var(--gradient-card)" }}>
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}
