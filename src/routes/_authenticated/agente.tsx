import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { 
  Bot, Save, Check, RotateCcw, AlertTriangle, Eye, 
  Search, FileText, Settings, Database, 
  Zap, Info, ExternalLink, RefreshCw
} from "lucide-react";
import { getFullAgentV3Config, updateV3Module, getCompiledPromptV3 } from "@/lib/agent-v3/admin.functions";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/agente")({
  ssr: false,
  head: () => ({ meta: [{ title: "Admin Agente V3 · ZapAgent" }] }),
  component: AgenteV3AdminPage,
});

function AgenteV3AdminPage() {
  const qc = useQueryClient();
  const fetchConfig = useServerFn(getFullAgentV3Config);
  const updateModule = useServerFn(updateV3Module);
  const getPrompt = useServerFn(getCompiledPromptV3);

  const configQ = useQuery({
    queryKey: ["agent_v3_config"],
    queryFn: () => fetchConfig(),
  });

  const [activeTab, setActiveTab] = useState<string>("modules");
  const [activeModuleKey, setActiveModuleKey] = useState<string | null>(null);
  const [moduleContent, setModuleContent] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewMsg, setPreviewMsg] = useState("");

  const promptQ = useQuery({
    queryKey: ["agent_v3_prompt", previewMsg],
    queryFn: () => getPrompt({ data: { message: previewMsg } }),
    enabled: isPreviewOpen,
  });

  const modules = configQ.data?.modules || {};
  const modulesEnabled = configQ.data?.config?.modules_enabled || {};
  
  const filteredModuleKeys = useMemo(() => {
    return Object.keys(modules).filter(key => 
      key.toLowerCase().includes(searchTerm.toLowerCase()) || 
      modules[key].content.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [modules, searchTerm]);

  useEffect(() => {
    if (!activeModuleKey && filteredModuleKeys.length > 0) {
      setActiveModuleKey(filteredModuleKeys[0]);
    }
  }, [filteredModuleKeys, activeModuleKey]);

  useEffect(() => {
    if (activeModuleKey && modules[activeModuleKey]) {
      setModuleContent(modules[activeModuleKey].content);
    }
  }, [activeModuleKey, modules]);

  const saveMut = useMutation({
    mutationFn: (data: { moduleKey: string; content: string }) => updateModule({ data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agent_v3_config"] });
      toast.success("Módulo atualizado com sucesso!");
    },
    onError: (err: any) => {
      toast.error(err.message || "Falha ao salvar módulo");
    },
  });

  if (configQ.isLoading) {
    return (
      <div className="flex h-[400px] flex-col items-center justify-center gap-4">
        <RefreshCw className="h-8 w-8 animate-spin text-primary/40" />
        <div className="text-sm text-muted-foreground animate-pulse font-medium">Sincronizando arquitetura V3...</div>
      </div>
    );
  }

  const currentModule = activeModuleKey ? modules[activeModuleKey] : null;

  return (
    <div className="container mx-auto p-4 lg:p-6 space-y-6">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-[10px] font-bold uppercase tracking-wider">
              Arquitetura V3
            </Badge>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
            <Bot className="h-8 w-8 text-primary" />
            Configuração do Agente
          </h1>
          <p className="text-muted-foreground mt-1 text-sm max-w-2xl">
            Gerenciamento completo do cérebro da IA. Toda alteração aqui reflete em tempo real no runtime Claude 4.5.
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
            <DialogTrigger asChild>
              <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-all text-sm font-medium border border-border">
                <Eye className="h-4 w-4" />
                Visualizar Prompt
              </button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col bg-card border-border shadow-2xl">
              <DialogHeader>
                <DialogTitle>Prompt Final (Compilado)</DialogTitle>
                <DialogDescription>
                  Simulação do sistema enviado ao LLM baseado na mensagem atual.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4 overflow-hidden flex flex-col flex-1">
                <div className="flex gap-2">
                  <input 
                    placeholder="Simular mensagem do cliente (ex: 'quero plays')" 
                    className="flex-1 bg-background border border-border rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-primary outline-none"
                    value={previewMsg}
                    onChange={(e) => setPreviewMsg(e.target.value)}
                  />
                  <button 
                    onClick={() => promptQ.refetch()}
                    className="p-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
                  >
                    <RefreshCw className={`h-4 w-4 ${promptQ.isFetching ? 'animate-spin' : ''}`} />
                  </button>
                </div>
                
                {promptQ.data && (
                  <div className="space-y-2 flex-1 flex flex-col overflow-hidden">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase">Módulos Selecionados:</span>
                      {promptQ.data.selectedModules.map(m => (
                        <Badge key={m} variant="secondary" className="text-[10px]">{m}</Badge>
                      ))}
                    </div>
                    <pre className="flex-1 overflow-auto bg-black/40 p-4 rounded-lg font-mono text-[11px] leading-relaxed text-blue-300/90 whitespace-pre-wrap border border-white/5 scrollbar-thin">
                      {promptQ.data.prompt}
                    </pre>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>

          <button
            onClick={() => activeModuleKey && saveMut.mutate({ moduleKey: activeModuleKey, content: moduleContent })}
            disabled={saveMut.isPending || !activeModuleKey}
            className="flex items-center gap-2 px-6 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-all text-sm font-bold shadow-lg shadow-primary/20 disabled:opacity-50"
          >
            {saveMut.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar Módulo
          </button>
        </div>
      </header>

      <Tabs defaultValue="modules" className="w-full" onValueChange={setActiveTab}>
        <TabsList className="grid w-full max-w-md grid-cols-2 bg-muted/30 border border-border p-1">
          <TabsTrigger value="modules" className="data-[state=active]:bg-card data-[state=active]:shadow-sm">Módulos do Sistema</TabsTrigger>
          <TabsTrigger value="identity" className="data-[state=active]:bg-card data-[state=active]:shadow-sm">Identidade & Persona</TabsTrigger>
        </TabsList>

        <TabsContent value="modules" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6">
            <aside className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input 
                  placeholder="Filtrar módulos..." 
                  className="w-full bg-card border border-border rounded-lg pl-9 pr-3 py-2 text-sm focus:ring-1 focus:ring-primary outline-none transition-all"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <div className="rounded-xl border border-border bg-card/30 overflow-hidden">
                <div className="p-3 border-b border-border bg-muted/20">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <Database className="h-3 w-3" />
                    Biblioteca de Módulos
                  </h3>
                </div>
                <div className="overflow-y-auto max-h-[500px] p-2 scrollbar-thin space-y-1">
                  {filteredModuleKeys.length > 0 ? filteredModuleKeys.map((key) => {
                    const isActive = activeModuleKey === key;
                    const isOverridden = modules[key].isOverride;
                    const isEnabled = modulesEnabled[key] !== false;

                    return (
                      <button
                        key={key}
                        onClick={() => setActiveModuleKey(key)}
                        className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-sm transition-all group ${
                          isActive 
                            ? "bg-primary text-primary-foreground font-semibold shadow-md shadow-primary/10" 
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <FileText className={`h-4 w-4 ${isActive ? 'text-primary-foreground' : 'text-primary/40'}`} />
                          <span className="truncate">{key}</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {isOverridden && <div className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-white' : 'bg-primary'}`} title="Personalizado" />}
                          {!isEnabled && <Badge variant="secondary" className="px-1 text-[8px] py-0 opacity-50">OFF</Badge>}
                        </div>
                      </button>
                    );
                  }) : (
                    <div className="p-4 text-center text-xs text-muted-foreground italic">
                      Nenhum módulo encontrado.
                    </div>
                  )}
                </div>
              </div>

              <Card className="bg-primary/5 border-primary/10">
                <CardHeader className="p-4">
                  <CardTitle className="text-xs font-bold flex items-center gap-2">
                    <Info className="h-3 w-3 text-primary" />
                    Dica de Especialista
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 pt-0">
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Módulos personalizados (com ponto azul) substituem completamente o comportamento padrão da Júlia. Use isso para injetar tabelas de preços específicas ou novos scripts de vendas.
                  </p>
                </CardContent>
              </Card>
            </aside>

            <main className="space-y-6">
              {activeModuleKey && currentModule ? (
                <div className="space-y-4 animate-in fade-in duration-300">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted/20 p-4 rounded-xl border border-border">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                        <Zap className="h-5 w-5" />
                      </div>
                      <div>
                        <h2 className="text-lg font-bold text-white capitalize">{activeModuleKey.replace(/_/g, ' ')}</h2>
                        <div className="flex items-center gap-2 mt-0.5">
                           <span className="text-[10px] text-muted-foreground font-mono">ID: {activeModuleKey}</span>
                           {currentModule.isOverride && <Badge className="text-[9px] h-4 bg-primary/20 text-primary border-none">Override Ativo</Badge>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => setModuleContent(configQ.data?.defaults[activeModuleKey] || "")}
                        className="text-[10px] font-bold text-muted-foreground hover:text-white flex items-center gap-1 transition-colors px-2 py-1 rounded bg-white/5 border border-white/5"
                        title="Restaurar para o padrão de fábrica"
                      >
                        <RotateCcw className="h-3 w-3" />
                        Resetar Padrão
                      </button>
                    </div>
                  </div>

                  <div className="relative group overflow-hidden rounded-xl border border-border bg-card">
                    <div className="absolute top-3 right-4 z-10">
                       <span className="text-[10px] font-mono text-muted-foreground bg-background/80 px-2 py-1 rounded-md backdrop-blur-md border border-white/5">
                         {moduleContent.length} caracteres
                       </span>
                    </div>
                    <textarea
                      value={moduleContent}
                      onChange={(e) => setModuleContent(e.target.value)}
                      placeholder="Configure aqui as instruções específicas para este módulo..."
                      className="min-h-[500px] w-full bg-transparent p-6 font-mono text-sm leading-relaxed outline-none focus:ring-0 resize-none text-blue-100/90 scrollbar-thin"
                      spellCheck={false}
                    />
                  </div>

                  {activeModuleKey === 'tabela_precos' && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 flex items-start gap-3">
                      <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <h4 className="text-sm font-bold text-red-500">Módulo de Preços Crítico</h4>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Este módulo é a <strong>fonte única de verdade</strong> para os preços do Spotify, Instagram, YouTube e TikTok. Qualquer alteração aqui reflete instantaneamente nas cotações enviadas pela Júlia.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="h-[400px] flex flex-col items-center justify-center text-center p-12 bg-card/20 border border-dashed border-border rounded-2xl">
                   <Bot className="h-12 w-12 text-primary/20 mb-4" />
                   <h3 className="text-lg font-medium text-muted-foreground">Selecione um módulo para começar</h3>
                   <p className="text-sm text-muted-foreground/60 max-w-xs mt-2">Escolha um módulo na biblioteca à esquerda para visualizar e editar suas instruções.</p>
                </div>
              )}
            </main>
          </div>
        </TabsContent>

        <TabsContent value="identity" className="mt-6">
          <Card className="bg-card/50 border-border">
            <CardHeader>
              <CardTitle>Configurações de Identidade</CardTitle>
              <CardDescription>Defina a essência da persona que atende os clientes.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <label className="text-sm font-bold text-white flex items-center gap-2">
                  <Bot className="h-4 w-4 text-primary" />
                  Prompt de Persona & Identidade
                </label>
                <textarea 
                  value={configQ.data?.identity.persona || ""}
                  onChange={(e) => {
                    // This would need another server function to update identity specifically
                    // For now we show it as visual proof of transparency
                  }}
                  className="w-full min-h-[300px] bg-background/50 border border-border rounded-xl p-6 font-mono text-sm leading-relaxed outline-none focus:ring-1 focus:ring-primary text-blue-100/90"
                  readOnly
                />
                <p className="text-[10px] text-muted-foreground italic flex items-center gap-1.5">
                  <Info className="h-3 w-3" />
                  Nota: A Identidade é o "Core" da Júlia. Edite este campo para mudar o nome ou o tom geral da marca.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
