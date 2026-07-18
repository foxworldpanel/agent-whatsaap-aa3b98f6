import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bot, Save, Check, RotateCcw, AlertTriangle } from "lucide-react";
import { getAgentConfig, saveAgentModules } from "@/lib/agent.functions";
import { MODULE_LIST } from "@/lib/agent-modules";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/agente")({
  ssr: false,
  head: () => ({ meta: [{ title: "Agente IA · ZapAgent" }] }),
  component: AgentePage,
});

function AgentePage() {
  const qc = useQueryClient();
  const fetchConfig = useServerFn(getAgentConfig);
  const saveModules = useServerFn(saveAgentModules);

  const configQ = useQuery({
    queryKey: ["agent_config"],
    queryFn: () => fetchConfig(),
  });

  const [modules, setModules] = useState<Record<string, string>>({});
  const [activeModule, setActiveModule] = useState<string | null>(null);

  useEffect(() => {
    if (configQ.data?.modules) {
      const rawModules = configQ.data.modules as Record<string, any>;
      const normalizedModules: Record<string, string> = {};
      
      // Map modules from agent_config (which can be string or {content: string})
      Object.entries(rawModules).forEach(([key, value]) => {
        if (typeof value === "string") {
          normalizedModules[key] = value;
        } else if (value && typeof value === "object" && "content" in value) {
          normalizedModules[key] = String(value.content);
        } else if (value && typeof value === "object" && "text" in value) {
          normalizedModules[key] = String(value.text);
        } else if (value && typeof value === "object" && "instrucoes" in value) {
          normalizedModules[key] = String(value.instrucoes);
        }
      });

      setModules(normalizedModules);
    }



  }, [configQ.data]);

  const saveMut = useMutation({
    mutationFn: (data: { modules: Record<string, string> }) => saveModules({ data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agent_config"] });
      toast.success("Configurações do agente salvas com sucesso!");
    },
    onError: (err: any) => {
      toast.error(err.message || "Falha ao salvar configurações");
    },
  });

  if (configQ.isLoading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <div className="text-sm text-muted-foreground animate-pulse">Carregando módulos do agente...</div>
      </div>
    );
  }

  const currentActive = activeModule || MODULE_LIST[0].key;


  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Instruções e Regras de Negócio</p>
          <h1 className="text-3xl font-bold tracking-tight">Agente IA</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => saveMut.mutate({ modules })}
            disabled={saveMut.isPending}
            className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-transform hover:scale-[1.02] disabled:opacity-60"
            style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-glow)" }}
          >
            {saveMut.isPending ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : saveMut.isSuccess ? (
              <Check className="h-4 w-4" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {saveMut.isPending ? "Salvando..." : saveMut.isSuccess ? "Salvo!" : "Salvar Agente"}
          </button>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-1">
          <p className="px-2 pb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Módulos Ativos ({MODULE_LIST.length})
          </p>
          <nav className="space-y-0.5 overflow-y-auto max-h-[calc(100vh-250px)] pr-2 scrollbar-thin">
            {MODULE_LIST.map((info) => {
              const key = info.key;

              const isActive = currentActive === key;
              const hasCustom = !!modules[key];

              
              return (
                <button
                  key={key}
                  onClick={() => setActiveModule(key)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
                    isActive 
                      ? "bg-primary/10 text-primary" 
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <span className="text-base">{info.emoji}</span>
                  <span className="flex-1 truncate">{info.title}</span>
                  {hasCustom && (
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" title="Modulo personalizado" />
                  )}
                </button>
              );
            })}
          </nav>
        </aside>

        <main className="space-y-4">
          {currentActive && (
            <div className="rounded-xl border border-border p-6" style={{ background: "var(--gradient-card)" }}>
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{MODULE_LIST.find(m => m.key === currentActive)?.emoji}</span>
                  <div>
                    <h2 className="text-lg font-bold">{MODULE_LIST.find(m => m.key === currentActive)?.title}</h2>
                    <p className="text-xs text-muted-foreground">ID do módulo: {currentActive}</p>

                  </div>
                </div>
              </div>


              <div className="relative">
                <textarea
                  value={modules[currentActive] === undefined ? "" : modules[currentActive]}
                  onChange={(e) => setModules({ ...modules, [currentActive]: e.target.value })}
                  placeholder="Este módulo está usando as instruções padrão. Digite aqui para personalizar..."
                  className="min-h-[400px] w-full rounded-lg border border-border bg-background/50 p-4 font-mono text-sm leading-relaxed outline-none focus:border-primary/50"
                  spellCheck={false}
                />
                {!modules[currentActive] && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-background/20 backdrop-blur-[1px] rounded-lg border border-dashed border-border/50">
                    <div className="text-center p-6">
                      <Bot className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                      <p className="text-sm font-medium text-muted-foreground/60">Instruções Padrão de Fábrica</p>
                      <p className="text-xs text-muted-foreground/40 mt-1">Clique para começar a editar e criar regras exclusivas</p>
                    </div>
                  </div>
                )}
              </div>

              {currentActive === "tabela_precos" && (
                <div className="mt-4 flex items-center gap-2 rounded-lg bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-500 border border-red-500/20">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <p>
                    <strong>⚠️ ATENÇÃO:</strong> Este é o ÚNICO lugar de onde os preços do agente vêm. 
                    O catálogo dinâmico está desativado. Sempre que mudar algo no painel real, 
                    atualize este módulo manualmente para evitar alucinações de preço.
                  </p>
                </div>
              )}

              <div className="mt-4 flex items-center gap-2 rounded-lg bg-yellow-500/10 p-3 text-xs text-yellow-600 dark:text-yellow-500">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <p>
                  Alterar estes módulos afeta diretamente como a Júlia responde aos clientes. 
                  Sempre clique em <strong>Salvar Agente</strong> após as edições para aplicar as mudanças no runtime.
                </p>
              </div>

            </div>
          )}
        </main>
      </div>
    </div>
  );
}
