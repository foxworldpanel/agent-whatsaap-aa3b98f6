import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { 
  ChevronDown, Save, AlertTriangle, Cpu, History, 
  CheckCircle2, Search, Filter, Edit3, Eye, 
  RotateCcw, X, ArrowLeft, Clock, User, ShieldAlert
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, 
  DialogFooter, DialogDescription 
} from "@/components/ui/dialog";
import { 
  Tabs, TabsContent, TabsList, TabsTrigger 
} from "@/components/ui/tabs";
import { 
  getAgentConfig, saveAgentModules, setServicesRealtime, 
  saveBehavior, savePanelScreenshots, listModulesV2, 
  updateModuleV2, getModuleHistoryV2 
} from "@/lib/agent.functions";
import { seedBrandFromMindTemplate } from "@/lib/seed-mind-brand.functions";
import { useWorkspace } from "@/contexts/workspace-context";
import { motion, AnimatePresence } from "framer-motion";

export const Route = createFileRoute("/_authenticated/agente")({
  ssr: false,
  head: () => ({ meta: [{ title: "Configuração do Agente IA (V2) · ZapAgent" }] }),
  component: AgentePage,
});

function AgentePage() {
  const qc = useQueryClient();
  const { activeWorkspaceId, isLoading: isWsLoading } = useWorkspace();
  const fetchCfg = useServerFn(getAgentConfig);
  const fetchModulesV2 = useServerFn(listModulesV2);
  const updateModuleV2Fn = useServerFn(updateModuleV2);
  const getHistoryFn = useServerFn(getModuleHistoryV2);
  const seedTplFn = useServerFn(seedBrandFromMindTemplate);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selectedModule, setSelectedModule] = useState<any>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editData, setEditData] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [activeTab, setActiveTab] = useState("edit");

  const { data: v2ModulesData, isLoading: isV2ModulesLoading } = useQuery({
    queryKey: ["agent_modules_v2", activeWorkspaceId],
    queryFn: () => fetchModulesV2(),
    enabled: !!activeWorkspaceId
  });

  const v2Modules = v2ModulesData ?? [];

  const filteredModules = v2Modules.filter((m: any) => {
    const matchesSearch = m.title.toLowerCase().includes(search.toLowerCase()) || 
                          m.id.toLowerCase().includes(search.toLowerCase()) ||
                          m.description.toLowerCase().includes(search.toLowerCase());
    
    if (filter === "all") return matchesSearch;
    if (filter === "core") return matchesSearch && m.is_core;
    if (filter === "active") return matchesSearch && m.is_active;
    if (filter === "inactive") return matchesSearch && !m.is_active;
    if (filter === "receptive") return matchesSearch && m.modes.includes("receptive");
    if (filter === "outbound") return matchesSearch && m.modes.includes("outbound");
    if (filter === "vendas") return matchesSearch && m.category === "Vendas";
    
    return matchesSearch;
  });

  const updateMut = useMutation({
    mutationFn: (data: any) => updateModuleV2Fn({ data }),
    onSuccess: () => {
      toast.success("Módulo atualizado com sucesso!");
      qc.invalidateQueries({ queryKey: ["agent_modules_v2"] });
      setIsEditDialogOpen(false);
    },
    onError: (e: Error) => toast.error(e.message)
  });

  const handleEdit = (m: any) => {
    setEditData({ ...m });
    setSelectedModule(m);
    setIsEditDialogOpen(true);
    setActiveTab("edit");
    loadHistory(m.id);
  };

  const loadHistory = async (id: string) => {
    setIsLoadingHistory(true);
    try {
      const data = await getHistoryFn({ data: { id } } as any);
      setHistory(data);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleSave = () => {
    if (!editData.title.trim() || !editData.content.trim()) {
      toast.error("Nome e conteúdo são obrigatórios.");
      return;
    }
    updateMut.mutate(editData);
  };

  if (isWsLoading || isV2ModulesLoading) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <div className="text-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto"></div>
          <p className="mt-4 text-sm text-muted-foreground font-medium">Carregando módulos V2...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 p-6 pb-20">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Cpu className="h-8 w-8 text-primary" />
            Configuração do Agente IA (V2)
          </h1>
          <p className="text-muted-foreground mt-1 text-sm max-w-2xl">
            Gerencie o cérebro modular da Júlia. Alterações aqui impactam o comportamento real em produção.
          </p>
        </div>
        <div className="flex gap-2">
          {/* Outras ações podem vir aqui */}
        </div>
      </header>

      <section className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Buscar por nome, ID ou descrição..." 
            className="pl-10 h-11"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {[
            { id: "all", label: "Tudo" },
            { id: "core", label: "Core" },
            { id: "active", label: "Ativos" },
            { id: "inactive", label: "Inativos" },
            { id: "vendas", label: "Vendas" },
            { id: "receptive", label: "Receptivo" },
            { id: "outbound", label: "Outbound" },
          ].map((f) => (
            <Button 
              key={f.id}
              variant={filter === f.id ? "default" : "outline"}
              size="sm"
              className="h-11 px-4"
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        <AnimatePresence mode="popLayout">
          {filteredModules.map((m: any) => (
            <motion.div
              key={m.id}
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
            >
              <Card 
                className={`group relative flex flex-col h-full overflow-hidden border-2 transition-all hover:shadow-xl cursor-pointer ${
                  m.is_active ? "border-primary/10 hover:border-primary/40" : "border-muted opacity-60 grayscale hover:grayscale-0"
                }`}
                onClick={() => handleEdit(m)}
              >
                {m.is_core && (
                  <div className="absolute top-0 right-0 p-1">
                    <Badge variant="secondary" className="text-[9px] uppercase tracking-tighter font-bold bg-primary/20 text-primary border-none rounded-sm">
                      CORE
                    </Badge>
                  </div>
                )}
                
                <div className="p-5 flex-1 flex flex-col">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-3xl filter drop-shadow-sm">{m.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-lg truncate leading-none mb-1">{m.title}</h3>
                      <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest">{m.id}</p>
                    </div>
                  </div>

                  <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed flex-1 italic mb-4">
                    {m.description || "Sem descrição disponível."}
                  </p>

                  <div className="space-y-4">
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="outline" className="text-[10px] bg-muted/50 font-medium">
                        PRIO: {m.priority}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] bg-muted/50 font-medium uppercase">
                        {m.category}
                      </Badge>
                      {m.modes.map((mode: string) => (
                        <Badge key={mode} variant="outline" className="text-[10px] bg-primary/5 text-primary border-primary/20 font-bold uppercase">
                          {mode}
                        </Badge>
                      ))}
                    </div>

                    <div className="bg-muted/30 rounded-lg p-3 relative overflow-hidden group-hover:bg-muted/50 transition-colors">
                      <p className="text-[11px] font-mono text-muted-foreground break-all line-clamp-2">
                        {m.contentPreview}
                      </p>
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-primary/10 backdrop-blur-[1px] transition-all">
                        <Button variant="ghost" size="sm" className="font-bold text-xs h-8">
                          Gerenciar Módulo
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="px-5 py-3 bg-muted/20 border-t flex items-center justify-between text-[10px] font-medium text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    {m.is_active ? (
                      <>
                        <div className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                        <span className="text-success font-bold uppercase">Ativo</span>
                      </>
                    ) : (
                      <>
                        <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
                        <span className="uppercase">Inativo</span>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    v{m.version}
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0 overflow-hidden">
          {editData && (
            <>
              <DialogHeader className="p-6 pb-0 border-b bg-muted/20">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4 mb-2">
                    <span className="text-4xl">{editData.emoji}</span>
                    <div>
                      <DialogTitle className="text-2xl font-bold">{editData.title}</DialogTitle>
                      <DialogDescription className="font-mono text-[10px] uppercase tracking-widest mt-0.5">
                        Módulo V2: {editData.id}
                      </DialogDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={editData.is_active ? "default" : "secondary"}>
                      {editData.is_active ? "ATIVO" : "INATIVO"}
                    </Badge>
                    {editData.is_core && <Badge className="bg-primary/20 text-primary border-none font-bold">CORE</Badge>}
                  </div>
                </div>
                
                <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
                  <TabsList className="bg-transparent border-b rounded-none w-full justify-start h-12 p-0 gap-6">
                    <TabsTrigger value="edit" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-2 h-12 font-bold text-sm">
                      <Edit3 className="h-4 w-4 mr-2" /> Edição
                    </TabsTrigger>
                    <TabsTrigger value="history" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-2 h-12 font-bold text-sm">
                      <History className="h-4 w-4 mr-2" /> Histórico (v{editData.version})
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </DialogHeader>

              <div className="flex-1 overflow-hidden">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full">
                  <TabsContent value="edit" className="m-0 h-full flex flex-col overflow-y-auto p-6 gap-6">
                    {editData.is_core && (
                      <Alert className="bg-primary/5 border-primary/20 text-primary">
                        <ShieldAlert className="h-4 w-4 text-primary" />
                        <AlertTitle className="font-bold">Módulo do Sistema (CORE)</AlertTitle>
                        <AlertDescription className="text-xs">
                          Este módulo é essencial para o funcionamento básico. Não pode ser excluído, mas você pode ajustar o prompt para refinar o comportamento.
                        </AlertDescription>
                      </Alert>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label className="text-xs font-bold uppercase text-muted-foreground">Nome Amigável</Label>
                          <Input 
                            value={editData.title} 
                            onChange={(e) => setEditData({...editData, title: e.target.value})}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs font-bold uppercase text-muted-foreground">Descrição</Label>
                          <Textarea 
                            value={editData.description} 
                            onChange={(e) => setEditData({...editData, description: e.target.value})}
                            rows={3}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase text-muted-foreground">Prioridade</Label>
                            <select 
                              className="w-full h-10 px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                              value={editData.priority}
                              onChange={(e) => setEditData({...editData, priority: e.target.value})}
                            >
                              <option value="Baixa">Baixa</option>
                              <option value="Normal">Normal</option>
                              <option value="Alta">Alta</option>
                              <option value="Urgente">Crítica</option>
                            </select>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase text-muted-foreground">Categoria</Label>
                            <select 
                              className="w-full h-10 px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                              value={editData.category}
                              onChange={(e) => setEditData({...editData, category: e.target.value})}
                            >
                              <option value="Core">Core</option>
                              <option value="Modo">Modo</option>
                              <option value="Redes">Redes</option>
                              <option value="Vendas">Vendas</option>
                              <option value="Ferramentas">Ferramentas</option>
                            </select>
                          </div>
                        </div>
                        <div className="flex items-center justify-between p-3 bg-muted/20 rounded-lg border border-dashed">
                          <div className="flex flex-col">
                            <span className="text-xs font-bold uppercase">Status de Execução</span>
                            <span className="text-[10px] text-muted-foreground">O runtime ignorará este módulo se desativado.</span>
                          </div>
                          <Switch 
                            checked={editData.is_active} 
                            onCheckedChange={(v) => setEditData({...editData, is_active: v})}
                          />
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label className="text-xs font-bold uppercase text-muted-foreground flex items-center justify-between">
                            Conteúdo do Prompt
                            <Badge variant="outline" className="text-[9px] font-mono">{(editData.content || "").length} chars</Badge>
                          </Label>
                          <Textarea 
                            className="font-mono text-[11px] leading-relaxed resize-none h-[280px]"
                            value={editData.content}
                            onChange={(e) => setEditData({...editData, content: e.target.value})}
                            placeholder="Insira as instruções do sistema para este módulo..."
                          />
                          <p className="text-[10px] text-muted-foreground italic">
                            Dica: Use variáveis como {"{NOME_CLIENTE}"} se aplicável ao contexto do runtime.
                          </p>
                        </div>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="history" className="m-0 h-full p-6 overflow-y-auto">
                    {isLoadingHistory ? (
                      <div className="flex h-40 items-center justify-center">
                        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                      </div>
                    ) : history.length === 0 ? (
                      <div className="text-center py-20 bg-muted/10 rounded-xl border border-dashed">
                        <History className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-20" />
                        <p className="text-sm text-muted-foreground">Nenhuma alteração registrada ainda.</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {history.map((h) => (
                          <Card key={h.id} className="p-4 bg-muted/10 hover:bg-muted/20 transition-colors border-l-4 border-l-primary/40">
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex items-center gap-3">
                                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                                  <Clock className="h-4 w-4 text-primary" />
                                </div>
                                <div>
                                  <p className="text-sm font-bold">Versão {h.version}</p>
                                  <p className="text-[10px] text-muted-foreground">
                                    {new Date(h.created_at).toLocaleString('pt-BR')}
                                  </p>
                                </div>
                              </div>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="h-8 text-xs font-bold"
                                onClick={() => {
                                  if (confirm("Deseja restaurar este conteúdo para o editor?")) {
                                    setEditData({...editData, content: h.content});
                                    setActiveTab("edit");
                                    toast.info("Conteúdo restaurado no editor. Clique em Salvar para aplicar.");
                                  }
                                }}
                              >
                                <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Restaurar
                              </Button>
                            </div>
                            <ScrollArea className="h-32 bg-background border rounded-md p-3">
                              <pre className="text-[10px] font-mono whitespace-pre-wrap text-muted-foreground">
                                {h.content}
                              </pre>
                            </ScrollArea>
                          </Card>
                        ))}
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </div>

              <DialogFooter className="p-6 border-t bg-muted/20 gap-2 flex-col sm:flex-row">
                <Button 
                  variant="ghost" 
                  onClick={() => setIsEditDialogOpen(false)}
                  className="font-bold"
                >
                  Descartar
                </Button>
                <Button 
                  onClick={handleSave}
                  className="font-bold min-w-[140px]"
                  disabled={updateMut.isPending}
                >
                  {updateMut.isPending ? (
                    <>
                      <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent mr-2"></div>
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" /> Salvar Alterações
                    </>
                  )}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

type AgentConfigUi = {
  modules?: Record<string, string>;
  modules_enabled?: Record<string, boolean>;
  services_realtime?: boolean;
  response_delay_min_sec?: number;
  response_delay_max_sec?: number;
  typing_indicator_enabled?: boolean;
};
