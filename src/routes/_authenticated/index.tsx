import { createFileRoute } from "@tanstack/react-router";
import { Users, MessagesSquare, TrendingUp, CheckCircle2, Activity, Megaphone, Flame, Thermometer, Snowflake } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDashboardStats } from "@/lib/dashboard.functions";

import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/")({
  beforeLoad: () => {
    throw redirect({
      to: "/agente",
    });
  },

  ssr: false,
  head: () => ({
    meta: [
      { title: "Dashboard · ZapAgent" },
      { name: "description", content: "Painel do agente vendedor de WhatsApp" },
    ],
  }),
  component: Index,
});

function Index() {
  const getStats = useServerFn(getDashboardStats);
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: () => getStats(),
    refetchInterval: 15000,
  });

  const stats = [
    { label: "Contatos cadastrados", value: data?.totalContacts ?? 0, delta: "total", icon: Users, color: "text-primary" },
    { label: "Conversas ativas hoje", value: data?.activeConversations ?? 0, delta: `${data?.receivedToday ?? 0} respostas`, icon: MessagesSquare, color: "text-warning" },
    { label: "Taxa de resposta", value: `${data?.responseRate ?? 0}%`, delta: `${data?.sentToday ?? 0} enviadas hoje`, icon: TrendingUp, color: "text-success" },
    { label: "Convertidos", value: data?.converted ?? 0, delta: "contatos fechados", icon: CheckCircle2, color: "text-success" },
  ];

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Visão geral</p>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div
              key={s.label}
              className="rounded-xl border border-border p-5"
              style={{ background: "var(--gradient-card)", boxShadow: "var(--shadow-card)" }}
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {s.label}
                </p>
                <Icon className={`h-4 w-4 ${s.color}`} />
              </div>
              <p className="mt-3 text-3xl font-bold">{isLoading ? "—" : s.value}</p>
              <p className={`mt-1 text-xs ${s.color}`}>{s.delta}</p>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {([
          { label: "Quentes hoje", value: data?.tempToday?.quente ?? 0, Icon: Flame,       color: "text-destructive", bg: "bg-destructive/10" },
          { label: "Mornos hoje",  value: data?.tempToday?.morno  ?? 0, Icon: Thermometer, color: "text-warning",     bg: "bg-warning/10" },
          { label: "Frios hoje",   value: data?.tempToday?.frio   ?? 0, Icon: Snowflake,   color: "text-primary",     bg: "bg-primary/10" },
        ] as const).map((t) => (
          <div
            key={t.label}
            className="flex items-center gap-4 rounded-xl border border-border p-5"
            style={{ background: "var(--gradient-card)", boxShadow: "var(--shadow-card)" }}
          >
            <div className={`grid h-12 w-12 place-items-center rounded-lg ${t.bg}`}>
              <t.Icon className={`h-6 w-6 ${t.color}`} />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t.label}</p>
              <p className="mt-1 text-2xl font-bold">{isLoading ? "—" : t.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div
          className="lg:col-span-3 rounded-xl border border-border p-6"
          style={{ background: "var(--gradient-card)" }}
        >
          <div className="flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">Origem dos leads</h2>
          </div>
          {(data?.leadsBySource ?? []).length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              Nenhum lead ainda. Quando alguém clicar no seu anúncio do Meta Ads, a origem aparece aqui.
            </p>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {(data?.leadsBySource ?? []).map((s) => {
                const label =
                  s.source === "meta_ads"
                    ? "Meta Ads"
                    : s.source === "organico"
                      ? "Orgânico"
                      : s.source === "importado"
                        ? "Importado"
                        : s.source === "manual"
                          ? "Manual"
                          : s.source;
                const conv = s.total > 0 ? Math.round((s.convertidos / s.total) * 100) : 0;
                return (
                  <div key={s.source} className="rounded-lg border border-border bg-background/40 p-4">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
                    <p className="mt-2 text-2xl font-bold">{s.total}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {s.convertidos} convertidos · {conv}%
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div
          className="lg:col-span-2 rounded-xl border border-border p-6"
          style={{ background: "var(--gradient-card)" }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              <h2 className="font-semibold">Últimos disparos</h2>
            </div>
            <span className="text-xs text-muted-foreground">atualiza a cada 15s</span>
          </div>
          <ul className="mt-4 divide-y divide-border">
            {(data?.recentLogs ?? []).length === 0 && (
              <li className="py-6 text-center text-sm text-muted-foreground">
                Nenhuma atividade ainda.
              </li>
            )}
            {(data?.recentLogs ?? []).map((a) => {
              const hora = new Date(a.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
              return (
                <li key={a.id} className="flex items-center gap-4 py-3 text-sm">
                  <span className="w-12 text-xs text-muted-foreground tabular-nums">{hora}</span>
                  <span
                    className={`h-2 w-2 rounded-full ${
                      a.status === "respondido"
                        ? "bg-primary"
                        : a.status === "enviado"
                          ? "bg-success"
                          : "bg-destructive"
                    }`}
                  />
                  <span className="flex-1 truncate text-foreground">
                    <b>{a.contact_name}</b> — {a.message_preview}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <div
          className="rounded-xl border border-border p-6"
          style={{ background: "var(--gradient-card)" }}
        >
          <h2 className="font-semibold">Performance hoje</h2>
          <div className="mt-5 space-y-4">
            {(() => {
              const sent = data?.sentToday ?? 0;
              const recv = data?.receivedToday ?? 0;
              const conv = data?.converted ?? 0;
              const maxSent = Math.max(sent, 10);
              return [
                { label: "Mensagens enviadas", value: sent, max: maxSent, color: "bg-primary" },
                { label: "Respostas recebidas", value: recv, max: Math.max(sent, 1), color: "bg-success" },
                { label: "Convertidos (total)", value: conv, max: Math.max(data?.totalContacts ?? 1, 1), color: "bg-warning" },
              ];
            })().map((m) => (
              <div key={m.label}>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{m.label}</span>
                  <span className="font-medium">{m.value}/{m.max}</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${m.color}`}
                    style={{ width: `${(m.value / m.max) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
