import { Link, Outlet, useRouterState, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, Users, Bot, Send, MessagesSquare, Gift, Settings, Zap, LogOut, Phone, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { ThemeToggle } from "./ThemeToggle";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAgentConfig, setAgentGlobalEnabled, countConversationsToReview } from "@/lib/agent.functions";
import { toast } from "sonner";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/contatos", label: "Contatos", icon: Users },
  { to: "/agente", label: "Agente IA", icon: Bot },
  { to: "/disparos", label: "Disparos", icon: Send },
  { to: "/conversas", label: "Conversas", icon: MessagesSquare },
  { to: "/numeros", label: "Números", icon: Phone },
  { to: "/teste-gratis", label: "Teste Grátis", icon: Gift },
  { to: "/logs", label: "Logs", icon: FileText },
  { to: "/configuracoes", label: "Configurações", icon: Settings },
] as const;

export function AppShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchAgent = useServerFn(getAgentConfig);
  const toggleGlobal = useServerFn(setAgentGlobalEnabled);
  const fetchReviewCount = useServerFn(countConversationsToReview);
  const agentQ = useQuery({ queryKey: ["agent_config"], queryFn: () => fetchAgent() });
  const reviewQ = useQuery({
    queryKey: ["conversations_review_count"],
    queryFn: () => fetchReviewCount(),
    refetchInterval: 10000,
  });
  const reviewCount = (reviewQ.data as { count?: number } | undefined)?.count ?? 0;
  const errorCountQ = useQuery({
    queryKey: ["agent_logs_error_count"],
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count } = await supabase
        .from("agent_logs")
        .select("id", { count: "exact", head: true })
        .eq("level", "error")
        .gte("created_at", since);
      return count ?? 0;
    },
    refetchInterval: 15000,
  });
  const errorCount = errorCountQ.data ?? 0;
  const enabled = (agentQ.data as { agent_enabled?: boolean } | null | undefined)?.agent_enabled !== false;
  const toggleMut = useMutation({
    mutationFn: (next: boolean) => toggleGlobal({ data: { enabled: next } }),
    onMutate: async (next: boolean) => {
      await qc.cancelQueries({ queryKey: ["agent_config"] });
      const previous = qc.getQueryData(["agent_config"]);
      qc.setQueryData(["agent_config"], (old: unknown) => ({ ...((old as object | null) ?? {}), agent_enabled: next }));
      return { previous };
    },
    onError: (err, _next, ctx) => {
      qc.setQueryData(["agent_config"], ctx?.previous);
      toast.error((err as Error).message || "Falha ao alterar o status do agente");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["agent_config"] }),
  });

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
        <div className="flex items-center gap-2 px-6 py-6">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-lg"
            style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-glow)" }}
          >
            <Zap className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <p className="text-sm font-semibold text-sidebar-foreground">ZapAgent</p>
            <p className="text-xs text-muted-foreground">Vendedor IA</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {nav.map((item) => {
            const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
                {item.to === "/conversas" && reviewCount > 0 && (
                  <span className="ml-auto inline-flex min-w-[20px] items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    {reviewCount > 99 ? "99+" : reviewCount}
                  </span>
                )}
                {item.to === "/logs" && errorCount > 0 && (
                  <span className="ml-auto inline-flex min-w-[20px] items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    {errorCount > 99 ? "99+" : errorCount}
                  </span>
                )}
                {active && item.to !== "/conversas" && (
                  <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />
                )}
                {active && item.to === "/conversas" && reviewCount === 0 && (
                  <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />
                )}
              </Link>
            );
          })}
        </nav>
        <div className="space-y-2 p-4">
          <div
            className="rounded-lg border border-border/50 p-3 text-xs"
            style={{ background: "var(--gradient-card)" }}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium text-foreground">Status do Agente</p>
              <button
                type="button"
                onClick={() => toggleMut.mutate(!enabled)}
                disabled={toggleMut.isPending || agentQ.isLoading}
                aria-pressed={enabled}
                className={cn(
                  "relative inline-flex h-5 w-9 items-center rounded-full transition",
                  enabled ? "bg-success" : "bg-muted",
                )}
              >
                <span
                  className={cn(
                    "inline-block h-4 w-4 transform rounded-full bg-white shadow transition",
                    enabled ? "translate-x-4" : "translate-x-0.5",
                  )}
                />
              </button>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                {enabled && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                )}
                <span
                  className={cn(
                    "relative inline-flex h-2 w-2 rounded-full",
                    enabled ? "bg-success" : "bg-muted-foreground",
                  )}
                />
              </span>
              <span className="text-muted-foreground">
                {enabled ? "Online · respondendo" : "Desligado · não responde"}
              </span>
            </div>
          </div>
          <ThemeToggle />
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sair
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-x-hidden">
        <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}