import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { 
  Bot, Save, Check, RotateCcw, AlertTriangle, Eye, 
  Search, FileText, Settings, Database, 
  Zap, Info, ExternalLink, RefreshCw, Plus, Trash2, Copy, Layers, GripVertical, Clock
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
import { getAgentHumanizationSettings, updateAgentHumanizationSettings } from "@/lib/agent-v3/admin/humanization.functions";
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
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

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
  const getHumanization = useServerFn(getAgentHumanizationSettings);
  const updateHumanization = useServerFn(updateAgentHumanizationSettings);

  const configQ = useQuery({
    queryKey: ["agent_v3_config"],
    queryFn: () => fetchConfig(),
  });

  const humanizationQ = useQuery({
    queryKey: ["agent_humanization_config"],
    queryFn: () => getHumanization(),
  });

  const [humanization, setHumanization] = useState({
    enabled: true,
    min_response_delay_ms: 1500,
    max_response_delay_ms: 8000,
    typing_enabled: true,
    proportional_to_length: true,
    min_part_delay_ms: 1200,
    max_part_delay_ms: 2800,
    audio_recording_enabled: true,
    playground_delay_enabled: false,
  });

  const [activeTab, setActiveTab] = useState<string>("modules");
  const [activeModuleKey, setActiveModuleKey] = useState<string | null>(null);
  const [moduleContent, setModuleContent] = useState<string>("");
  const [moduleRouting, setModuleRouting] = useState({
    enabled: true,
    alwaysLoad: false,
    priority: 50,
    intents: "",
    stages: "",
    platforms: "",
    products: "",
    triggers: "",
    dependencies: "",
    conflicts: "",
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [isNewModuleOpen, setIsNewModuleOpen] = useState(false);
  
  // Form for new module
  const [newModule, setNewModule] = useState({
    key: "",
    name: "",
    category: "Outros",
    content: ""
  });

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

  useEffect(() => {
    if (humanizationQ.data) setHumanization(humanizationQ.data);
  }, [humanizationQ.data]);

  const humanizationMut = useMutation({
    mutationFn: () => updateHumanization({ data: humanization }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agent_humanization_config"] });
      toast.success("Tempo e humanização atualizados!");
    },
    onError: (err: any) => toast.error(err.message || "Falha ao salvar humanização"),
  });

  const modules = useMemo(() => configQ.data?.modules || {}, [configQ.data?.modules]);
  
  // Update local modules when query data changes
  useEffect(() => {
    if (modules) {
      const all = Object.entries(modules).map(([key, data]: [string, any]) => ({
        ...data,
        key
      }));
      // Sort by priority initially
      all.sort((a, b) => (b.priority || 0) - (a.priority || 0));
      setLocalModules(all);
    }
  }, [modules]);


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
      const current = modules[activeModuleKey];
      setModuleContent(current.content);
      setModuleRouting({
        enabled: current.enabled ?? true,
        alwaysLoad: current.always_load ?? false,
        priority: current.priority ?? 50,
        intents: (current.selector_intents ?? []).join(", "),
        stages: (current.selector_stages ?? []).join(", "),
        platforms: (current.selector_platforms ?? []).join(", "),
        products: (current.selector_products ?? []).join(", "),
        triggers: (current.selector_triggers ?? []).join(", "),
        dependencies: (current.selector_dependencies ?? []).join(", "),
        conflicts: (current.selector_conflicts ?? []).join(", "),
      });
    }
  }, [activeModuleKey, modules]);

  const saveMut = useMutation({
    mutationFn: (data: {
      moduleKey: string;
      content: string;
      name?: string;
      category?: string;
      enabled?: boolean;
      alwaysLoad?: boolean;
      priority?: number;
      selectorIntents?: string[];
      selectorStages?: string[];
      selectorPlatforms?: string[];
      selectorProducts?: string[];
      selectorTriggers?: string[];
      selectorDependencies?: string[];
      selectorConflicts?: string[];
    }) => updateModule({ data }),
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
            onClick={() => activeTab === "audit" ? setActiveTab("modules") : setActiveTab("audit")}
          >
            <Search className="h-4 w-4" />
            {activeTab === "audit" ? "Ver Módulos" : "Abrir SQL Editor"}
          </Button>

          {activeTab === "modules" && (
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
                <Button onClick={() => createMut.mutate(newModule)} disabled={createMut.isPending || !newModule.key}>
                  {createMut.isPending ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
                  Criar Módulo
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          )}

          {activeTab === "modules" && (
          <Button
            onClick={() => {
              if (!activeModuleKey) return;
              const csv = (value: string) => value.split(",").map((item) => item.trim()).filter(Boolean);
              saveMut.mutate({
                moduleKey: activeModuleKey,
                content: moduleContent,
                enabled: moduleRouting.enabled,
                alwaysLoad: moduleRouting.alwaysLoad,
                priority: Number.isFinite(moduleRouting.priority) ? moduleRouting.priority : 50,
                selectorIntents: csv(moduleRouting.intents),
                selectorStages: csv(moduleRouting.stages),
                selectorPlatforms: csv(moduleRouting.platforms),
                selectorProducts: csv(moduleRouting.products),
                selectorTriggers: csv(moduleRouting.triggers),
                selectorDependencies: csv(moduleRouting.dependencies),
                selectorConflicts: csv(moduleRouting.conflicts),
              });
            }}
            disabled={saveMut.isPending || !activeModuleKey}
            className="gap-2 shadow-lg shadow-primary/20"
          >
            {saveMut.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar Alterações
          </Button>
          )}
        </div>
      </header>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 max-w-[620px]">
          <TabsTrigger value="modules" className="gap-2">
            <Layers className="h-4 w-4" /> Módulos
          </TabsTrigger>
          <TabsTrigger value="humanization" className="gap-2">
            <Clock className="h-4 w-4" /> Tempo e Humanização
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-2">
            <Search className="h-4 w-4" /> SQL Editor
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

                  <Card className="bg-card border-border">
                    <CardHeader className="p-4 border-b">
                      <CardTitle className="text-base">Roteamento do módulo</CardTitle>
                      <CardDescription>
                        Define quando o seletor V3 deve carregar este módulo. Separe múltiplos valores por vírgula.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="p-4 space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={moduleRouting.enabled}
                            onChange={(e) => setModuleRouting((prev) => ({ ...prev, enabled: e.target.checked }))}
                          />
                          Módulo ativo
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={moduleRouting.alwaysLoad}
                            onChange={(e) => setModuleRouting((prev) => ({ ...prev, alwaysLoad: e.target.checked }))}
                          />
                          Carregar sempre
                        </label>
                        <div className="grid gap-1">
                          <label className="text-xs text-muted-foreground">Prioridade</label>
                          <Input
                            type="number"
                            value={moduleRouting.priority}
                            onChange={(e) => setModuleRouting((prev) => ({ ...prev, priority: Number(e.target.value) }))}
                          />
                        </div>
                      </div>

                      {[
                        ["Plataformas", "platforms", "spotify, youtube, instagram"],
                        ["Intenções", "intents", "consulta_preco, compra, suporte"],
                        ["Estágios", "stages", "inicio, negociacao, fechamento"],
                        ["Produtos", "products", "plays, seguidores, visualizacoes"],
                        ["Gatilhos", "triggers", "playlist, quanto custa, pix"],
                        ["Dependências", "dependencies", "regras_gerais"],
                        ["Conflitos", "conflicts", "tabela_precos"],
                      ].map(([label, field, placeholder]) => (
                        <div className="grid gap-1" key={field}>
                          <label className="text-xs text-muted-foreground">{label}</label>
                          <Input
                            value={moduleRouting[field as keyof typeof moduleRouting] as string}
                            placeholder={placeholder}
                            onChange={(e) => setModuleRouting((prev) => ({ ...prev, [field]: e.target.value }))}
                          />
                        </div>
                      ))}
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

        <TabsContent value="humanization" className="pt-4">
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6">
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Clock className="h-5 w-5 text-primary" />
                  Tempo e Humanização
                </CardTitle>
                <CardDescription>
                  Simula o ritmo de um atendente humano no WhatsApp. O tempo gasto pela IA já conta dentro da espera.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between rounded-lg border border-border p-4">
                  <div>
                    <Label className="font-semibold">Humanização ativa</Label>
                    <p className="text-xs text-muted-foreground mt-1">Aplica atraso variável e presença de digitação no WhatsApp.</p>
                  </div>
                  <Switch
                    checked={humanization.enabled}
                    onCheckedChange={(checked) => setHumanization((prev) => ({ ...prev, enabled: checked }))}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Atraso mínimo da primeira resposta</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        max={120}
                        step={0.5}
                        value={humanization.min_response_delay_ms / 1000}
                        onChange={(e) => setHumanization((prev) => ({
                          ...prev,
                          min_response_delay_ms: Math.round(Number(e.target.value) * 1000),
                        }))}
                      />
                      <span className="text-sm text-muted-foreground">seg</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Preset: 1,5 s</p>
                  </div>

                  <div className="grid gap-2">
                    <Label>Atraso máximo da primeira resposta</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        max={120}
                        step={0.5}
                        value={humanization.max_response_delay_ms / 1000}
                        onChange={(e) => setHumanization((prev) => ({
                          ...prev,
                          max_response_delay_ms: Math.round(Number(e.target.value) * 1000),
                        }))}
                      />
                      <span className="text-sm text-muted-foreground">seg</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Preset: 8 s</p>
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-lg border border-border p-4">
                  <div>
                    <Label className="font-semibold">Tempo proporcional ao tamanho</Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Respostas curtas saem mais rápido; respostas maiores levam mais tempo, com pequena variação aleatória.
                    </p>
                  </div>
                  <Switch
                    checked={humanization.proportional_to_length}
                    onCheckedChange={(checked) => setHumanization((prev) => ({ ...prev, proportional_to_length: checked }))}
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border border-border p-4">
                  <div>
                    <Label className="font-semibold">Mostrar “digitando...”</Label>
                    <p className="text-xs text-muted-foreground mt-1">Ativa a presença de digitação pela Uazapi durante o processamento.</p>
                  </div>
                  <Switch
                    checked={humanization.typing_enabled}
                    onCheckedChange={(checked) => setHumanization((prev) => ({ ...prev, typing_enabled: checked }))}
                  />
                </div>

                <div className="border-t border-border pt-5">
                  <h3 className="text-sm font-bold mb-4">Mensagens divididas em partes</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label>Intervalo mínimo</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={0}
                          max={30}
                          step={0.1}
                          value={humanization.min_part_delay_ms / 1000}
                          onChange={(e) => setHumanization((prev) => ({
                            ...prev,
                            min_part_delay_ms: Math.round(Number(e.target.value) * 1000),
                          }))}
                        />
                        <span className="text-sm text-muted-foreground">seg</span>
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <Label>Intervalo máximo</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={0}
                          max={30}
                          step={0.1}
                          value={humanization.max_part_delay_ms / 1000}
                          onChange={(e) => setHumanization((prev) => ({
                            ...prev,
                            max_part_delay_ms: Math.round(Number(e.target.value) * 1000),
                          }))}
                        />
                        <span className="text-sm text-muted-foreground">seg</span>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">Preset: 1,2–2,8 s entre uma mensagem e outra.</p>
                </div>

                <div className="flex items-center justify-between rounded-lg border border-border p-4">
                  <div>
                    <Label className="font-semibold">Simular “gravando áudio...”</Label>
                    <p className="text-xs text-muted-foreground mt-1">Quando a resposta for por voz, mostra presença de gravação antes do envio.</p>
                  </div>
                  <Switch
                    checked={humanization.audio_recording_enabled}
                    onCheckedChange={(checked) => setHumanization((prev) => ({ ...prev, audio_recording_enabled: checked }))}
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border border-border p-4">
                  <div>
                    <Label className="font-semibold">Aplicar atraso no Playground</Label>
                    <p className="text-xs text-muted-foreground mt-1">Desligado por padrão para os testes de conversa continuarem rápidos.</p>
                  </div>
                  <Switch
                    checked={humanization.playground_delay_enabled}
                    onCheckedChange={(checked) => setHumanization((prev) => ({ ...prev, playground_delay_enabled: checked }))}
                  />
                </div>

                <Button
                  className="gap-2"
                  onClick={() => humanizationMut.mutate()}
                  disabled={humanizationMut.isPending}
                >
                  {humanizationMut.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Salvar Tempo e Humanização
                </Button>
              </CardContent>
            </Card>

            <Card className="bg-card border-border h-fit">
              <CardHeader>
                <CardTitle className="text-base">Preset Mind recomendado</CardTitle>
                <CardDescription>Já configurado como padrão.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between gap-4"><span className="text-muted-foreground">Saudação curta</span><strong>~1,5–3 s</strong></div>
                <div className="flex justify-between gap-4"><span className="text-muted-foreground">Preço / frase curta</span><strong>~2–4,5 s</strong></div>
                <div className="flex justify-between gap-4"><span className="text-muted-foreground">2–3 frases</span><strong>~3,5–6 s</strong></div>
                <div className="flex justify-between gap-4"><span className="text-muted-foreground">Resposta maior</span><strong>até ~8 s</strong></div>
                <div className="flex justify-between gap-4"><span className="text-muted-foreground">Entre partes</span><strong>1,2–2,8 s</strong></div>
                <div className="pt-3 border-t border-border text-xs text-muted-foreground leading-relaxed">
                  O cálculo considera o tamanho da resposta e uma variação aleatória. O tempo que Claude, banco e TTS já gastaram entra na conta para evitar espera artificial excessiva.
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="audit" className="pt-4 space-y-4">
          <Card className="border-primary/20 bg-card/50 backdrop-blur-sm overflow-hidden">
            <CardHeader className="border-b border-border/50 bg-primary/5">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Database className="h-5 w-5 text-primary" />
                    SQL Editor — Mind CMS
                  </CardTitle>
                  <CardDescription>
                    Execute consultas SQL diretamente na tabela agent_modules_v3
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="p-4 bg-black/40 font-mono text-sm border-b border-border/50">
                <p className="text-primary mb-2 flex items-center gap-2">
                  <Zap className="h-3 w-3" /> Query sugerida:
                </p>
                <div className="bg-black/60 p-4 rounded-lg text-primary/90 border border-primary/20 relative group">
                  <pre className="whitespace-pre-wrap">
{`SELECT
  key AS "ID",
  name AS "Nome",
  enabled AS "Ativo",
  source AS "Origem",
  priority AS "Prioridade",
  selector_triggers AS "Triggers",
  always_load AS "Always Load",
  version AS "Versao",
  created_at AS "Criado em",
  updated_at AS "Atualizado em"
FROM agent_modules_v3
WHERE workspace_id = 'bd59fa41-d68d-4ac8-b995-e09ae48f52aa'
ORDER BY priority DESC, key;`}
                  </pre>
                </div>
              </div>
              <div className="p-8 text-center">
                <Button 
                  variant="outline" 
                  className="gap-2"
                  onClick={() => window.open('https://supabase.com/dashboard/project/xayfgycnqajwrgrrjwfb/editor', '_blank')}
                >
                  <ExternalLink className="h-4 w-4" /> Abrir SQL Editor no Console
                </Button>
                <p className="text-xs text-muted-foreground mt-4 italic">
                  * Note: O editor de auditoria visual será implementado na Fase 6. Use o SQL Editor acima para extrações brutas.
                </p>
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
