import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { 
  Bot, Save, Check, RotateCcw, AlertTriangle, Eye, 
  Search, FileText, Settings, Database, 
  Zap, Info, ExternalLink, RefreshCw, Plus, Trash2, Copy, Layers, GripVertical
} from "lucide-react";
import { 
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToVerticalAxis, restrictToFirstScrollableAncestor } from '@dnd-kit/modifiers';
import { getFullAgentV3Config, updateV3Module, deleteV3Module, getCompiledPromptV3 } from "@/lib/agent-v3/admin/admin.functions";
import { updateV3ModulesOrder } from "@/lib/agent-v3/admin/reorder.functions";
import { seedModulesToDb } from "@/lib/agent-v3/admin/seed.functions";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/agente")({
  ssr: false,
  head: () => ({ meta: [{ title: "Admin Agente V3 · ZapAgent" }] }),
  component: AgenteV3AdminPage,
});

const CATEGORIES = ["Núcleo", "Comercial", "Redes Sociais", "Pagamentos", "Suporte", "Outros"];

function AgenteV3AdminPage() {
  const qc = useQueryClient();
  const fetchConfig = useServerFn(getFullAgentV3Config);
  const updateModule = useServerFn(updateV3Module);
  const reorderModules = useServerFn(updateV3ModulesOrder);
  const removeModule = useServerFn(deleteV3Module);
  const getPrompt = useServerFn(getCompiledPromptV3);
  const seedModules = useServerFn(seedModulesToDb);

  const configQ = useQuery({
    queryKey: ["agent_v3_config"],
    queryFn: () => fetchConfig(),
  });

  const [activeTab, setActiveTab] = useState<string>("modules");
  const [activeModuleKey, setActiveModuleKey] = useState<string | null>(null);
  const [moduleContent, setModuleContent] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [isNewModuleOpen, setIsNewModuleOpen] = useState(false);
  
  // Local state for categories to allow reordering
  const [localModules, setLocalModules] = useState<any[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const modules = configQ.data?.modules || {};
  
  // Update local modules when query data changes
  useEffect(() => {
    if (configQ.data?.modules) {
      const all = Object.entries(configQ.data.modules).map(([key, data]: [string, any]) => ({
        ...data,
        key
      }));
      // Sort by priority initially
      all.sort((a, b) => (b.priority || 0) - (a.priority || 0));
      setLocalModules(all);
    }
  }, [configQ.data?.modules]);

  const modulesByCategory = useMemo(() => {
    const grouped: Record<string, any[]> = {};
    CATEGORIES.forEach(cat => grouped[cat] = []);
    
    localModules.forEach((m) => {
      const cat = m.category || "Outros";
      if (!grouped[cat]) {
        if (!grouped["Outros"]) grouped["Outros"] = [];
        grouped["Outros"].push(m);
      } else {
        grouped[cat].push(m);
      }
    });

    // Filter by search
    if (searchTerm) {
      Object.keys(grouped).forEach(cat => {
        grouped[cat] = grouped[cat].filter(m => 
          m.key.toLowerCase().includes(searchTerm.toLowerCase()) || 
          m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          m.content.toLowerCase().includes(searchTerm.toLowerCase())
        );
      });
    }

    return grouped;
  }, [localModules, searchTerm]);

  useEffect(() => {
    if (activeModuleKey && modules[activeModuleKey]) {
      setModuleContent(modules[activeModuleKey].content);
    }
  }, [activeModuleKey, modules]);

  const saveMut = useMutation({
    mutationFn: (data: { moduleKey: string; content: string; name?: string; category?: string }) => updateModule({ data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agent_v3_config"] });
      toast.success("Módulo atualizado com sucesso!");
    },
    onError: (err: any) => toast.error(err.message || "Falha ao salvar módulo"),
  });

  const reorderMut = useMutation({
    mutationFn: (orders: { key: string; priority: number }[]) => reorderModules({ data: { orders } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agent_v3_config"] });
    },
    onError: (err: any) => toast.error("Falha ao salvar ordem: " + err.message),
  });

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      const activeModule = localModules.find(m => m.key === active.id);
      const overModule = localModules.find(m => m.key === over.id);
      
      if (activeModule && overModule && activeModule.category === overModule.category) {
        setLocalModules((items) => {
          const oldIndex = items.findIndex(m => m.key === active.id);
          const newIndex = items.findIndex(m => m.key === over.id);
          
          const newItems = arrayMove(items, oldIndex, newIndex);
          
          // Recalculate priorities based on new order within the category
          // Higher index (lower in list) = lower priority
          // But we only want to update priorities for the items that changed
          const orders = newItems.map((m, idx) => ({
            key: m.key,
            priority: (newItems.length - idx) * 10
          }));
          
          reorderMut.mutate(orders);
          return newItems;
        });
      }
    }
  }, [localModules, reorderMut]);

  const createMut = useMutation({
    mutationFn: (data: typeof newModule) => updateModule({ data: { 
      moduleKey: data.key, 
      content: data.content || "Instruções iniciais...",
      name: data.name,
      category: data.category
    } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agent_v3_config"] });
      setIsNewModuleOpen(false);
      setActiveModuleKey(newModule.key);
      setNewModule({ key: "", name: "", category: "Outros", content: "" });
      toast.success("Módulo criado!");
    },
    onError: (err: any) => toast.error(err.message || "Falha ao criar módulo"),
  });

  const deleteMut = useMutation({
    mutationFn: (moduleKey: string) => removeModule({ data: { moduleKey } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agent_v3_config"] });
      setActiveModuleKey(null);
      toast.success("Módulo excluído");
    },
  });

  if (configQ.isLoading && localModules.length === 0) {
    return (
      <div className="flex h-[400px] flex-col items-center justify-center gap-4">
        <RefreshCw className="h-8 w-8 animate-spin text-primary/40" />
        <div className="text-sm text-muted-foreground animate-pulse font-medium">Sincronizando biblioteca modular...</div>
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
              Arquitetura V3 · CMS Modular
            </Badge>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
            <Bot className="h-8 w-8 text-primary" />
            Configuração do Agente
          </h1>
          <p className="text-muted-foreground mt-1 text-sm max-w-2xl">
            Gerenciamento completo do cérebro da IA. Crie, edite e organize módulos por categoria.
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <Button 
            variant="outline" 
            className="gap-2 border-primary/20 text-primary hover:bg-primary/5"
            onClick={() => activeTab === "modules" ? setActiveTab("audit") : setActiveTab("modules")}
          >
            <Search className="h-4 w-4" />
            {activeTab === "audit" ? "Ver Módulos" : "Auditar Cérebro"}
          </Button>

          <Dialog open={isNewModuleOpen} onOpenChange={setIsNewModuleOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Plus className="h-4 w-4" /> Novo Módulo
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Criar Novo Módulo</DialogTitle>
                <DialogDescription>Adicione uma nova entidade de inteligência ao cérebro da Júlia.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <label className="text-sm font-medium">Chave Única (slug)</label>
                  <Input 
                    placeholder="ex: spotify_vendas" 
                    value={newModule.key}
                    onChange={e => setNewModule({...newModule, key: e.target.value.toLowerCase().replace(/\s+/g, '_')})}
                  />
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-medium">Nome de Exibição</label>
                  <Input 
                    placeholder="ex: Spotify Vendas" 
                    value={newModule.name}
                    onChange={e => setNewModule({...newModule, name: e.target.value})}
                  />
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-medium">Categoria</label>
                  <Select value={newModule.category} onValueChange={v => setNewModule({...newModule, category: v})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione uma categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map(cat => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => createMut.mutate()} disabled={createMut.isPending || !newModule.key}>
                  {createMut.isPending ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
                  Criar Módulo
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Button
            onClick={() => activeModuleKey && saveMut.mutate({ moduleKey: activeModuleKey, content: moduleContent })}
            disabled={saveMut.isPending || !activeModuleKey}
            className="gap-2 shadow-lg shadow-primary/20"
          >
            {saveMut.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar Alterações
          </Button>
        </div>
      </header>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-[400px]">
          <TabsTrigger value="modules" className="gap-2">
            <Layers className="h-4 w-4" /> Módulos
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-2">
            <Search className="h-4 w-4" /> Auditoria
          </TabsTrigger>
        </TabsList>

        <TabsContent value="modules" className="pt-4">
          <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
            <aside className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Pesquisar biblioteca..." 
                  className="pl-9"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <ScrollArea className="h-[calc(100vh-320px)] pr-4">
                <div className="space-y-6">
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                    modifiers={[restrictToVerticalAxis, restrictToFirstScrollableAncestor]}
                  >
                    {Object.entries(modulesByCategory).map(([category, items]) => (
                      <div key={category} className="space-y-2">
                        <h3 className="text-[10px] font-bold uppercase tracking-wider text-primary flex items-center gap-2 px-2">
                          <Layers className="h-3 w-3" />
                          {category}
                          <Badge variant="secondary" className="ml-auto text-[8px] h-3 px-1">{items.length}</Badge>
                        </h3>
                        
                        <SortableContext 
                          items={items.map(m => m.key)} 
                          strategy={verticalListSortingStrategy}
                        >
                          <div className="space-y-1">
                            {items.map((m) => (
                              <SortableModuleItem 
                                key={m.key} 
                                m={m} 
                                isActive={activeModuleKey === m.key}
                                onClick={() => setActiveModuleKey(m.key)}
                              />
                            ))}
                          </div>
                        </SortableContext>
                      </div>
                    ))}
                  </DndContext>
                </div>
              </ScrollArea>
            </aside>

            <main className="space-y-6">
              {activeModuleKey && currentModule ? (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <Card className="bg-card border-border overflow-hidden">
                    <CardHeader className="p-4 bg-muted/20 border-b flex flex-row items-center justify-between space-y-0">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                          <Zap className="h-5 w-5" />
                        </div>
                        <div>
                          <CardTitle className="text-lg font-bold">{currentModule.name || activeModuleKey}</CardTitle>
                          <CardDescription className="text-[10px] font-mono">key: {activeModuleKey} · v{currentModule.version || 1}</CardDescription>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-muted-foreground hover:text-white"
                          title="Duplicar"
                          onClick={() => {
                            const newKey = `${activeModuleKey}_copy`;
                            setNewModule({
                              key: newKey,
                              name: `${currentModule.name} (Cópia)`,
                              category: currentModule.category || "Outros",
                              content: moduleContent
                            });
                            setIsNewModuleOpen(true);
                          }}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Excluir Módulo</DialogTitle>
                              <DialogDescription>
                                Tem certeza que deseja excluir o módulo <strong>{activeModuleKey}</strong>? Esta ação removerá permanentemente essa inteligência do cérebro da Júlia.
                              </DialogDescription>
                            </DialogHeader>
                            <DialogFooter>
                              <Button variant="destructive" onClick={() => deleteMut.mutate(activeModuleKey)}>Confirmar Exclusão</Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0 relative">
                      <div className="absolute top-3 right-4 z-10">
                         <Badge variant="outline" className="bg-background/80 backdrop-blur-md text-[10px] font-mono">
                           {moduleContent.length} chars
                         </Badge>
                      </div>
                      <textarea
                        value={moduleContent}
                        onChange={(e) => setModuleContent(e.target.value)}
                        placeholder="Defina aqui as instruções, preços e regras deste módulo..."
                        className="min-h-[500px] w-full bg-transparent p-6 font-mono text-sm leading-relaxed outline-none focus:ring-0 resize-none text-foreground border-none"
                        spellCheck={false}
                      />
                    </CardContent>
                  </Card>

                  {activeModuleKey.includes('spotify') || activeModuleKey.includes('instagram') || activeModuleKey.includes('youtube') ? (
                    <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 flex items-start gap-3">
                      <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <h4 className="text-sm font-bold text-primary">Módulo de Rede Social</h4>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Este módulo é independente. Adicione aqui os **preços**, **serviços** e **observações** específicos para {activeModuleKey.split('_')[0]}. O roteador V3 carregará estas instruções apenas quando o cliente demonstrar interesse nesta rede.
                        </p>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="h-[500px] flex flex-col items-center justify-center text-center p-12 bg-card/20 border border-dashed border-border rounded-2xl">
                   <Bot className="h-16 w-16 text-primary/10 mb-4" />
                   <h3 className="text-xl font-bold text-muted-foreground">Biblioteca Modular Ativa</h3>
                   <p className="text-sm text-muted-foreground/60 max-w-sm mt-2">
                     Selecione um módulo na biblioteca à esquerda para gerenciar sua inteligência ou crie uma nova entidade de cérebro.
                   </p>
                   <Button variant="outline" className="mt-6 gap-2" onClick={() => setIsNewModuleOpen(true)}>
                     <Plus className="h-4 w-4" /> Criar Primeiro Módulo
                   </Button>
                </div>
              )}
            </main>
          </div>
        </TabsContent>

        <TabsContent value="audit" className="pt-4">
           <Card className="bg-card border-border">
             <CardHeader>
               <CardTitle className="text-lg flex items-center gap-2">
                 <Search className="h-5 w-5 text-primary" />
                 Auditoria Completa do Cérebro
               </CardTitle>
               <CardDescription>
                 Comparação em tempo real entre o CMS e o conteúdo carregado no Runtime V3.
               </CardDescription>
             </CardHeader>
             <CardContent>
               <div className="space-y-4">
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                   <div className="p-4 rounded-lg bg-muted/50 border border-border">
                     <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider mb-1">Total de Módulos</div>
                     <div className="text-2xl font-bold">{Object.keys(modules).length}</div>
                   </div>
                   <div className="p-4 rounded-lg bg-muted/50 border border-border">
                     <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider mb-1">Módulos no Banco</div>
                     <div className="text-2xl font-bold text-primary">{Object.values(modules).filter((m: any) => m.isOverride).length}</div>
                   </div>
                   <div className="p-4 rounded-lg bg-muted/50 border border-border">
                     <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider mb-1">Módulos em Fallback</div>
                     <div className="text-2xl font-bold text-yellow-500">{Object.values(modules).filter((m: any) => !m.isOverride).length}</div>
                   </div>
                 </div>

                 <div className="mt-6">
                   <h4 className="text-sm font-bold mb-4 flex items-center gap-2">
                     <Database className="h-4 w-4 text-primary" />
                     Inventário de Fontes
                   </h4>
                   <div className="border border-border rounded-lg overflow-hidden">
                     <table className="w-full text-sm">
                       <thead className="bg-muted text-muted-foreground text-xs uppercase font-bold">
                         <tr>
                           <th className="px-4 py-3 text-left">Chave</th>
                           <th className="px-4 py-3 text-left">Origem</th>
                           <th className="px-4 py-3 text-left">Versão</th>
                           <th className="px-4 py-3 text-left">Conteúdo</th>
                           <th className="px-4 py-3 text-center">Status</th>
                         </tr>
                       </thead>
                       <tbody className="divide-y divide-border">
                         {Object.entries(modules).map(([key, data]: [string, any]) => (
                           <tr key={key} className="hover:bg-muted/30">
                             <td className="px-4 py-3 font-mono text-xs">{key}</td>
                             <td className="px-4 py-3">
                               {data.isOverride ? (
                                 <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">DATABASE</Badge>
                               ) : (
                                 <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">CODE FALLBACK</Badge>
                               )}
                             </td>
                             <td className="px-4 py-3 font-mono text-xs">v{data.version || 1}</td>
                             <td className="px-4 py-3 text-muted-foreground italic truncate max-w-[200px]">
                               {data.content?.slice(0, 40)}...
                             </td>
                             <td className="px-4 py-3 text-center">
                               {data.content?.trim() ? (
                                 <div className="h-2 w-2 rounded-full bg-green-500 mx-auto" />
                               ) : (
                                 <AlertTriangle className="h-4 w-4 text-destructive mx-auto" />
                               )}
                             </td>
                           </tr>
                         ))}
                       </tbody>
                     </table>
                   </div>
                   <div className="mt-8">
                     <h4 className="text-sm font-bold mb-4 flex items-center gap-2">
                       <Zap className="h-4 w-4 text-primary" />
                       Visualização do Prompt Final (Simulação: "Olá")
                     </h4>
                     <PromptPreview getPrompt={getPrompt} />
                   </div>
                 </div>
               </div>
             </CardContent>
           </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PromptPreview({ getPrompt }: { getPrompt: any }) {
  const [promptData, setPromptData] = useState<{ prompt: string; selectedModules: string[] } | null>(null);
  const [loading, setLoading] = useState(false);

  const loadPrompt = async () => {
    setLoading(true);
    try {
      const res = await getPrompt({ data: { message: "Olá" } });
      setPromptData(res);
    } catch (err) {
      toast.error("Falha ao gerar preview do prompt");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Button variant="outline" size="sm" onClick={loadPrompt} disabled={loading} className="gap-2">
        {loading ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
        Gerar Preview do Prompt
      </Button>

      {promptData && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {promptData.selectedModules.map(m => (
              <Badge key={m} variant="secondary" className="text-[10px]">{m}</Badge>
            ))}
          </div>
          <textarea
            readOnly
            value={promptData.prompt}
            className="w-full h-[400px] bg-black/40 border border-border rounded-lg p-4 font-mono text-[11px] leading-relaxed resize-none text-muted-foreground focus:outline-none"
          />
        </div>
      )}
    </div>
  );
}

function SortableModuleItem({ m, isActive, onClick }: { m: any, isActive: boolean, onClick: () => void }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: m.key });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      className="group relative"
    >
      <button
        onClick={onClick}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all text-left ${
          isActive 
            ? "bg-primary text-primary-foreground font-semibold shadow-md" 
            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground border border-transparent"
        }`}
      >
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing hover:text-white transition-colors">
          <GripVertical className={`h-4 w-4 shrink-0 ${isActive ? 'text-primary-foreground' : 'text-primary/40'}`} />
        </div>
        <FileText className={`h-4 w-4 shrink-0 ${isActive ? 'text-primary-foreground' : 'text-primary/40'}`} />
        <span className="truncate flex-1">{m.name || m.key}</span>
        {m.isOverride && <div className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-white' : 'bg-primary'}`} title="Override" />}
      </button>
    </div>
  );
}

function ScrollArea({ children, className }: { children: React.ReactNode, className?: string }) {
  return (
    <div className={`overflow-y-auto scrollbar-thin scrollbar-thumb-primary/20 hover:scrollbar-thumb-primary/40 ${className}`}>
      {children}
    </div>
  );
}
