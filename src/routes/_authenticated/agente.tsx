import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { 
  Bot, Save, Check, RotateCcw, AlertTriangle, Eye, 
  Search, FileText, Settings, Database, 
  Zap, Info, ExternalLink, RefreshCw, Plus, Trash2, Copy, Layers, GripVertical
} from "lucide-react";
import { getFullAgentV3Config, updateV3Module, deleteV3Module, getCompiledPromptV3 } from "@/lib/agent-v3/admin.functions";
import { seedModulesToDb } from "@/lib/agent-v3/seed.functions";
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
  
  // Form for new module
  const [newModule, setNewModule] = useState({
    key: "",
    name: "",
    category: "Outros",
    content: ""
  });

  const modules = configQ.data?.modules || {};
  
  const modulesByCategory = useMemo(() => {
    const grouped: Record<string, any[]> = {};
    CATEGORIES.forEach(cat => grouped[cat] = []);
    
    Object.entries(modules).forEach(([key, data]: [string, any]) => {
      const cat = data.category || "Outros";
      if (!grouped[cat]) grouped["Outros"].push({ ...data, key });
      else grouped[cat].push({ ...data, key });
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
  }, [modules, searchTerm]);

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

  const createMut = useMutation({
    mutationFn: () => updateModule({ data: { 
      moduleKey: newModule.key, 
      content: newModule.content || "Instruções iniciais...",
      name: newModule.name,
      category: newModule.category
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

  if (configQ.isLoading) {
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

          <ScrollArea className="h-[calc(100vh-280px)] pr-4">
            <div className="space-y-6">
              {Object.entries(modulesByCategory).map(([category, items]) => (
                <div key={category} className="space-y-2">
                  <h3 className="text-[10px] font-bold uppercase tracking-wider text-primary flex items-center gap-2 px-2">
                    <Layers className="h-3 w-3" />
                    {category}
                    <Badge variant="secondary" className="ml-auto text-[8px] h-3 px-1">{items.length}</Badge>
                  </h3>
                  <div className="space-y-1">
                    {items.map((m) => (
                      <div key={m.key} className="group relative">
                        <button
                          onClick={() => setActiveModuleKey(m.key)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all text-left ${
                            activeModuleKey === m.key 
                              ? "bg-primary text-primary-foreground font-semibold shadow-md" 
                              : "text-muted-foreground hover:bg-muted/50 hover:text-foreground border border-transparent"
                          }`}
                        >
                          <FileText className={`h-4 w-4 shrink-0 ${activeModuleKey === m.key ? 'text-primary-foreground' : 'text-primary/40'}`} />
                          <span className="truncate flex-1">{m.name || m.key}</span>
                          {m.isOverride && <div className={`h-1.5 w-1.5 rounded-full ${activeModuleKey === m.key ? 'bg-white' : 'bg-primary'}`} title="Override" />}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
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
                    className="min-h-[600px] w-full bg-transparent p-6 font-mono text-sm leading-relaxed outline-none focus:ring-0 resize-none text-foreground"
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
