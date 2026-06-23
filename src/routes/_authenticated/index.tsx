import { createFileRoute } from "@tanstack/react-router";
import { Users, MessagesSquare, TrendingUp, DollarSign, Send, Activity } from "lucide-react";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Dashboard · ZapAgent" },
      { name: "description", content: "Painel do agente vendedor de WhatsApp" },
    ],
  }),
  component: Index,
});

const stats = [
  { label: "Contatos cadastrados", value: "1.284", delta: "+24 hoje", icon: Users, color: "text-primary" },
  { label: "Conversas ativas", value: "37", delta: "12 aguardando", icon: MessagesSquare, color: "text-warning" },
  { label: "Taxa de resposta", value: "68%", delta: "+5% vs ontem", icon: TrendingUp, color: "text-success" },
  { label: "Vendas geradas", value: "R$ 842", delta: "23 conversões", icon: DollarSign, color: "text-success" },
];

const recentActivity = [
  { hora: "14:32", texto: "Lucas Silva respondeu — oferta enviada", tipo: "respondido" },
  { hora: "14:28", texto: "Mariana Costa convertida (+R$5)", tipo: "convertido" },
  { hora: "14:22", texto: "Disparo enviado para 3 leads frios", tipo: "enviado" },
  { hora: "14:15", texto: "Rafael Mendes aceitou upsell (+R$18)", tipo: "convertido" },
  { hora: "14:08", texto: "Pedro Almeida não respondeu — follow-up 2/3", tipo: "alerta" },
];

function Index() {
  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Visão geral</p>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        </div>
        <Link
          to="/disparos"
          className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-transform hover:scale-[1.02]"
          style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-glow)" }}
        >
          <Send className="h-4 w-4" />
          Iniciar campanha
        </Link>
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
              <p className="mt-3 text-3xl font-bold">{s.value}</p>
              <p className={`mt-1 text-xs ${s.color}`}>{s.delta}</p>
            </div>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div
          className="lg:col-span-2 rounded-xl border border-border p-6"
          style={{ background: "var(--gradient-card)" }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              <h2 className="font-semibold">Atividade em tempo real</h2>
            </div>
            <span className="text-xs text-muted-foreground">últimas 30 min</span>
          </div>
          <ul className="mt-4 divide-y divide-border">
            {recentActivity.map((a, i) => (
              <li key={i} className="flex items-center gap-4 py-3 text-sm">
                <span className="w-12 text-xs text-muted-foreground tabular-nums">{a.hora}</span>
                <span
                  className={`h-2 w-2 rounded-full ${
                    a.tipo === "convertido"
                      ? "bg-success"
                      : a.tipo === "respondido"
                      ? "bg-primary"
                      : a.tipo === "alerta"
                      ? "bg-warning"
                      : "bg-muted-foreground"
                  }`}
                />
                <span className="text-foreground">{a.texto}</span>
              </li>
            ))}
          </ul>
        </div>

        <div
          className="rounded-xl border border-border p-6"
          style={{ background: "var(--gradient-card)" }}
        >
          <h2 className="font-semibold">Performance hoje</h2>
          <div className="mt-5 space-y-4">
            {[
              { label: "Mensagens enviadas", value: 87, max: 120, color: "bg-primary" },
              { label: "Respostas recebidas", value: 59, max: 87, color: "bg-success" },
              { label: "Vendas fechadas", value: 23, max: 59, color: "bg-warning" },
            ].map((m) => (
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
