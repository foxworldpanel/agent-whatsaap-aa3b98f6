import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { 
  Plus, 
  Trash2, 
  Send, 
  RefreshCw, 
  Copy, 
  ChevronRight, 
  Settings2, 
  Activity, 
  History, 
  Code, 
  Database,
  Search,
  AlertTriangle,
  FileJson,
  Edit2,
  GitBranch,
  CheckCircle2,
  XCircle,
  Clock,
  Coins,
  Cpu,
  ShieldCheck,
  Bot,
  Zap
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { runPlaygroundTurn, generateSimulatedCustomerReply, CUSTOMER_PERSONAS, startOutboundSimulation } from "@/lib/agent-v3/admin/playground.functions";
import { ScenarioGenerator } from "@/components/agent-playground/ScenarioGenerator";
import { HistoryEditor } from "@/components/agent-playground/HistoryEditor";

export const Route = createFileRoute("/_authenticated/admin/agent-playground")({
  component: AgentPlaygroundPage,
});

function AgentPlaygroundPage() {
  const queryClient = useQueryClient();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [isScenarioOpen, setIsScenarioOpen] = useState(false);
  const [isHistoryEditorOpen, setIsHistoryEditorOpen] = useState(false);
  const [isOutboundMode, setIsOutboundMode] = useState(false);
  const [customerPersona, setCustomerPersona] = useState("curioso");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Queries
  const { data: sessions, isLoading: sessionsLoading } = useQuery({
    queryKey: ["playground_sessions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_playground_sessions")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: messages, isLoading: messagesLoading } = useQuery({
    queryKey: ["playground_messages", activeSessionId],
    queryFn: async () => {
      if (!activeSessionId) return [];
      const { data, error } = await supabase
        .from("agent_playground_messages")
        .select("*")
        .eq("session_id", activeSessionId)
        .order("sequence", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!activeSessionId,
  });

  const { data: lastRun, refetch: refetchLastRun } = useQuery({
    queryKey: ["playground_last_run", activeSessionId],
    queryFn: async () => {
      if (!activeSessionId) return null;
      const { data, error } = await supabase
        .from("agent_playground_runs")
        .select("*")
        .eq("session_id", activeSessionId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      
      const run = data as any;
      // Normalização: conversation_feedback contém os metadados complexos
      if (run && run.conversation_feedback) {
        const meta = typeof run.conversation_feedback === 'string' 
          ? JSON.parse(run.conversation_feedback) 
          : run.conversation_feedback;
        return {
          ...run,
          derived_metadata: meta
        };
      }
      return run;
    },
    enabled: !!activeSessionId,
    refetchInterval: 1000,
  });

  const { data: sessionUsage } = useQuery({
    queryKey: ["playground_session_usage", activeSessionId],
    queryFn: async () => {
      if (!activeSessionId) {
        return {
          calls: 0,
          costUsd: 0,
          inputTokens: 0,
          outputTokens: 0,
          cacheWriteTokens: 0,
          cacheReadTokens: 0,
        };
      }

      const { data, error } = await supabase
        .from("agent_playground_runs")
        .select("cost_usd,input_tokens,output_tokens,cache_creation_input_tokens,cache_read_input_tokens")
        .eq("session_id", activeSessionId);

      if (error) throw error;

      return (data || []).reduce(
        (acc: any, run: any) => ({
          calls: acc.calls + 1,
          costUsd: acc.costUsd + Number(run.cost_usd || 0),
          inputTokens: acc.inputTokens + Number(run.input_tokens || 0),
          outputTokens: acc.outputTokens + Number(run.output_tokens || 0),
          cacheWriteTokens: acc.cacheWriteTokens + Number(run.cache_creation_input_tokens || 0),
          cacheReadTokens: acc.cacheReadTokens + Number(run.cache_read_input_tokens || 0),
        }),
        {
          calls: 0,
          costUsd: 0,
          inputTokens: 0,
          outputTokens: 0,
          cacheWriteTokens: 0,
          cacheReadTokens: 0,
        },
      );
    },
    enabled: !!activeSessionId,
    refetchInterval: 1000,
  });



  // Mutations
  const createSession = useMutation({
    mutationFn: async (name: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");
      const { data, error } = await supabase
        .from("agent_playground_sessions")
        .insert({
          user_id: user.id,
          name,
          enabled_modules: ["identidade", "regras_gerais"],
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["playground_sessions"] });
      setActiveSessionId(data.id);
      toast.success("Sessão criada!");
    },
  });

  const sendMessage = useServerFn(runPlaygroundTurn);
  const generateCustomerReply = useServerFn(generateSimulatedCustomerReply);
  const startOutbound = useServerFn(startOutboundSimulation);

  const sendMessageMutation = useMutation({
    mutationFn: async (text: string) => {
      if (!activeSessionId) return;
      return await sendMessage({
        data: {
          sessionId: activeSessionId,
          message: text,
          inputKind: "texto",
          isOutbound: isOutboundMode,
        }
      });
    },
    onMutate: () => {
      setMessage("");
    },
    onSuccess: (response) => {
      console.log("[PLAYGROUND API RESPONSE]", response);
      if (response && typeof response === 'object' && 'run' in response) {
        console.log("[PLAYGROUND RUN RECEIVED]", (response as any).run);
      }
      queryClient.invalidateQueries({ queryKey: ["playground_messages", activeSessionId] });
      queryClient.invalidateQueries({ queryKey: ["playground_last_run", activeSessionId] });
      toast.success("Resposta recebida");
    },
    onError: (err) => {
      toast.error(err.message);
    }
  });

  const generateCustomerMutation = useMutation({
    mutationFn: async () => {
      if (!activeSessionId) return;
      return await generateCustomerReply({
        data: { sessionId: activeSessionId, persona: customerPersona },
      });
    },
    onSuccess: (response) => {
      if (response?.message) {
        setMessage(response.message);
        toast.success("Cliente IA gerou uma resposta — revise e envie");
      }
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const startOutboundMutation = useMutation({
    mutationFn: async () => {
      if (!activeSessionId) return;
      return await startOutbound({
        data: { sessionId: activeSessionId, instagramHandle: testInstagramHandle || "perfilteste" },
      });
    },
    onSuccess: () => {
      setIsOutboundMode(true);
      queryClient.invalidateQueries({ queryKey: ["playground_messages", activeSessionId] });
      toast.success("Abordagem de disparo enviada — modo Outbound ativado automaticamente");
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const clearSession = useMutation({
    mutationFn: async (sid: string) => {
      const { error } = await supabase
        .from("agent_playground_messages")
        .delete()
        .eq("session_id", sid);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["playground_messages", activeSessionId] });
      toast.success("Sessão limpa");
    }
  });

  const deleteSession = useMutation({
    mutationFn: async (sid: string) => {
      const { error } = await supabase
        .from("agent_playground_sessions")
        .delete()
        .eq("id", sid);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["playground_sessions"] });
      if (activeSessionId) setActiveSessionId(null);
      toast.success("Sessão excluída");
    }
  });

  const updateSessionModules = useMutation({
    mutationFn: async ({ sid, modules }: { sid: string, modules: string[] }) => {
      const { error } = await supabase
        .from("agent_playground_sessions")
        .update({ enabled_modules: modules })
        .eq("id", sid);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["playground_sessions"] });
    }
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const activeSession = sessions?.find(s => s.id === activeSessionId);

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] gap-4 overflow-hidden">
      {/* Faixa de Ambiente de Teste */}
      <div className="bg-amber-100 border-l-4 border-amber-500 p-2 text-amber-800 text-xs font-semibold flex items-center gap-2">
        <ShieldCheck className="h-4 w-4" />
        AMBIENTE DE TESTE — nenhuma mensagem será enviada ao WhatsApp
      </div>

      <div className="flex flex-1 gap-4 overflow-hidden">
        {/* Coluna 1: Sessões e Testes */}
        <aside className="w-80 border rounded-lg bg-card flex flex-col overflow-hidden">
          <div className="p-4 border-b space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2">
                <Database className="h-4 w-4" /> Sessões
              </h3>
              <div className="flex gap-1">
                <Button size="icon" variant="outline" className="h-8 w-8" title="Criar cenário" onClick={() => setIsScenarioOpen(true)}>
                  <Zap className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => createSession.mutate(`Novo teste ${sessions?.length || 0 + 1}`)}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Filtrar sessões..." className="pl-8 h-9" />
            </div>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {sessionsLoading ? (
                <div className="p-4 text-center text-sm text-muted-foreground">Carregando...</div>
              ) : sessions?.map((session) => (
                <div
                  key={session.id}
                  onClick={() => setActiveSessionId(session.id)}
                  className={cn(
                    "group flex items-center justify-between p-3 rounded-md cursor-pointer text-sm transition-colors",
                    activeSessionId === session.id 
                      ? "bg-primary text-primary-foreground" 
                      : "hover:bg-accent"
                  )}
                >
                  <div className="flex flex-col truncate">
                    <span className="font-medium truncate">{session.name}</span>
                    <span className={cn("text-[10px]", activeSessionId === session.id ? "text-primary-foreground/70" : "text-muted-foreground")}>
                      {new Date(session.updated_at).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      className="h-7 w-7"
                      onClick={(e) => { e.stopPropagation(); deleteSession.mutate(session.id); }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </aside>

        {/* Coluna 2: Chat */}
        <div className="flex-1 flex flex-col border rounded-lg bg-card overflow-hidden">
          <header className="p-4 border-b flex items-center justify-between">
            <div>
              <h2 className="font-semibold">{activeSession?.name || "Selecione uma sessão"}</h2>
              <p className="text-xs text-muted-foreground">{activeSessionId ? `playgroundSessionId: ${activeSessionId}` : "Crie um novo teste para começar"}</p>
            </div>
            {activeSessionId && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setIsHistoryEditorOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" /> Msg manual
                </Button>
                <Button variant="outline" size="sm" onClick={() => clearSession.mutate(activeSessionId)}>
                  Limpar conversa
                </Button>
                <Button variant="outline" size="sm">
                  <GitBranch className="h-4 w-4 mr-2" /> Ramificar
                </Button>
              </div>
            )}
          </header>

          <ScrollArea className="flex-1 p-4" ref={scrollRef}>
            <div className="space-y-4 max-w-3xl mx-auto">
              {messagesLoading ? (
                <div className="flex justify-center p-8 text-muted-foreground">Carregando mensagens...</div>
              ) : messages?.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-20 text-center space-y-4 text-muted-foreground border-2 border-dashed rounded-xl mt-10">
                  <Bot className="h-12 w-12 opacity-20" />
                  <div>
                    <p className="font-medium">Nenhuma mensagem nesta sessão</p>
                    <p className="text-sm">Inicie a conversa para testar o agente V3</p>
                  </div>
                </div>
              ) : messages?.map((msg) => (
                <div key={msg.id} className={cn("flex flex-col", msg.role === "user" ? "items-end" : "items-start")}>
                  <div className={cn(
                    "max-w-[85%] p-4 rounded-2xl text-sm shadow-sm",
                    msg.role === "user" 
                      ? "bg-primary text-primary-foreground rounded-tr-none" 
                      : "bg-muted text-foreground rounded-tl-none border"
                  )}>
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                    <div className={cn("mt-2 flex items-center gap-2 text-[10px]", msg.role === "user" ? "text-primary-foreground/50" : "text-muted-foreground")}>
                      <span>{new Date(msg.created_at).toLocaleTimeString()}</span>
                      {msg.input_kind && <Badge variant="secondary" className="text-[8px] h-3 px-1">{msg.input_kind}</Badge>}
                      {msg.role === "agent" && msg.metadata && typeof msg.metadata === 'object' && !Array.isArray(msg.metadata) && (msg.metadata as any).temperature && (
                        <span className="font-semibold text-orange-400">[{(msg.metadata as any).temperature.toUpperCase()}]</span>
                      )}
                    </div>
                  </div>
                  <div className="mt-1 flex gap-2">
                     <Button size="icon" variant="ghost" className="h-6 w-6"><Copy className="h-3 w-3" /></Button>
                     <Button size="icon" variant="ghost" className="h-6 w-6"><Edit2 className="h-3 w-3" /></Button>
                  </div>
                </div>
              ))}
              {sendMessageMutation.isPending && (
                <div className="flex flex-col items-start">
                  <div className="bg-muted p-4 rounded-2xl rounded-tl-none border animate-pulse flex items-center gap-2">
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Júlia está digitando...</span>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          <footer className="p-4 border-t bg-muted/30">
            <div className="max-w-3xl mx-auto flex flex-col gap-2">
              <div className="flex items-center gap-3 text-xs bg-background/60 border rounded-lg px-3 py-2 flex-wrap">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <Checkbox
                    checked={isOutboundMode}
                    onCheckedChange={(v) => setIsOutboundMode(Boolean(v))}
                  />
                  <span className={cn("font-medium", isOutboundMode && "text-primary")}>
                    Modo Disparo
                  </span>
                </label>
                
                <Input 
                  className="h-7 w-40 text-[10px]" 
                  placeholder="@instagram teste"
                  value={testInstagramHandle}
                  onChange={(e) => setTestInstagramHandle(e.target.value)}
                />

                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1"
                  disabled={!activeSessionId || startOutboundMutation.isPending}
                  onClick={() => startOutboundMutation.mutate()}
                >
                  <Zap className="h-3.5 w-3.5" />
                  {startOutboundMutation.isPending ? "Enviando..." : "Iniciar Abordagem"}
                </Button>

                <div className="flex-1 min-w-[20px]" />

                <select
                  className="bg-background border rounded px-2 py-1 text-xs"
                  value={customerPersona}
                  onChange={(e) => setCustomerPersona(e.target.value)}
                >
                  {Object.entries(CUSTOMER_PERSONAS).map(([key, desc]) => (
                    <option key={key} value={key}>
                      {key === "curioso" && "Curioso"}
                      {key === "cetico" && "Cético"}
                      {key === "seco" && "Resposta seca"}
                      {key === "ocupado" && "Ocupado"}
                      {key === "ja_conhece" && "Já conhece a Mind"}
                      {key === "gravadora" && "Gravadora/equipe"}
                      {key === "bravo" && "Já teve experiência ruim"}
                    </option>
                  ))}
                </select>

                <Button
                  size="sm"
                  variant="secondary"
                  className="h-7 gap-1"
                  disabled={!activeSessionId || generateCustomerMutation.isPending}
                  onClick={() => generateCustomerMutation.mutate()}
                >
                  <Bot className="h-3.5 w-3.5" />
                  {generateCustomerMutation.isPending ? "Gerando..." : "Cliente IA"}
                </Button>
              </div>
              <div className="flex gap-2">
                <textarea
                  placeholder="Digite uma mensagem para testar o agente..."
                  className="flex-1 bg-background border rounded-lg p-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary min-h-[80px] resize-none shadow-inner"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (message.trim() && activeSessionId) sendMessageMutation.mutate(message);
                    }
                  }}
                  disabled={!activeSessionId || sendMessageMutation.isPending}
                />
                <Button 
                  className="h-auto px-6" 
                  disabled={!activeSessionId || !message.trim() || sendMessageMutation.isPending}
                  onClick={() => sendMessageMutation.mutate(message)}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex justify-between items-center text-[10px] text-muted-foreground px-1">
                <span>Enter para enviar, Shift + Enter para nova linha</span>
                <div className="flex gap-2">
                  <Badge variant="outline" className="text-[9px]">Input: Texto</Badge>
                  <Badge variant="outline" className="text-[9px]">Model: Haiku 4.5</Badge>
                </div>
              </div>
            </div>
          </footer>
        </div>

        {/* Coluna 3: Inspector */}
        <aside className="w-96 border rounded-lg bg-card flex flex-col overflow-hidden">
          <Tabs defaultValue="resumo" className="flex-1 flex-col">
            <div className="p-2 border-b">
              <TabsList className="w-full h-8 grid grid-cols-6">
                <TabsTrigger value="resumo" className="text-[10px]"><Activity className="h-3 w-3 mr-1" /></TabsTrigger>
                <TabsTrigger value="reasoning" className="text-[10px]"><FileJson className="h-3 w-3 mr-1" /></TabsTrigger>
                <TabsTrigger value="modulos" className="text-[10px]"><Settings2 className="h-3 w-3 mr-1" /></TabsTrigger>
                <TabsTrigger value="prompt" className="text-[10px]"><Code className="h-3 w-3 mr-1" /></TabsTrigger>
                <TabsTrigger value="custo" className="text-[10px]"><Coins className="h-3 w-3 mr-1" /></TabsTrigger>
                <TabsTrigger value="json" className="text-[10px]"><History className="h-3 w-3 mr-1" /></TabsTrigger>
              </TabsList>

            </div>

            <ScrollArea className="flex-1">
              <TabsContent value="resumo" className="p-4 m-0 space-y-4">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold flex items-center gap-2">
                      <Zap className="h-4 w-4 text-blue-500" /> Lead Intelligence
                    </h3>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <Card className="p-3 space-y-1">
                      <p className="text-[10px] text-muted-foreground uppercase">Temperatura</p>
                      <Badge 
                        variant="secondary" 
                        className={cn(
                          "w-full justify-center py-1 text-xs",
                          lastRun?.temperature === 'quente' ? "bg-red-500/10 text-red-500" :
                          lastRun?.temperature === 'morno' ? "bg-orange-500/10 text-orange-500" :
                          "bg-blue-500/10 text-blue-500"
                        )}
                      >
                        {(lastRun?.temperature || "---").toUpperCase()}
                      </Badge>
                    </Card>

                    <Card className="p-3 space-y-1">
                      <p className="text-[10px] text-muted-foreground uppercase">Confiança</p>
                      <p className="text-sm font-bold text-center">{lastRun?.confidence || "---"}</p>
                    </Card>

                    <Card className="p-3 space-y-1">
                      <p className="text-[10px] text-muted-foreground uppercase">Intenção</p>
                      <p className="text-sm font-bold text-center truncate">{lastRun?.intent || "---"}</p>
                    </Card>

                    <Card className="p-3 space-y-1">
                      <p className="text-[10px] text-muted-foreground uppercase">Estágio</p>
                      <p className="text-sm font-bold text-center truncate">{lastRun?.stage || "---"}</p>
                    </Card>
                  </div>

                  <Card className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] text-muted-foreground uppercase">Probabilidade de Compra</p>
                      <span className="text-sm font-bold text-blue-500">{lastRun?.purchase_probability || 0}%</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                      <div 
                        className="bg-blue-500 h-full transition-all duration-500" 
                        style={{ width: `${lastRun?.purchase_probability || 0}%` }}
                      />
                    </div>
                  </Card>

                  <div className="grid grid-cols-2 gap-3">
                    <Card className="p-3 space-y-1">
                      <p className="text-[10px] text-muted-foreground uppercase">Sentimento</p>
                      <p className={cn(
                        "text-sm font-bold text-center",
                        lastRun?.sentiment === 'Positivo' ? "text-green-500" :
                        lastRun?.sentiment === 'Negativo' ? "text-red-500" : "text-muted-foreground"
                      )}>
                        {lastRun?.sentiment || "---"}
                      </p>
                    </Card>

                    <Card className="p-3 space-y-1">
                      <p className="text-[10px] text-muted-foreground uppercase">Urgência</p>
                      <p className={cn(
                        "text-sm font-bold text-center",
                        lastRun?.urgency === 'Alta' ? "text-red-500" :
                        lastRun?.urgency === 'Média' ? "text-orange-500" : "text-blue-500"
                      )}>
                        {lastRun?.urgency || "---"}
                      </p>
                    </Card>
                  </div>

                  <Card className="p-3 space-y-2 bg-blue-500/5 border-blue-500/20">
                    <p className="text-[10px] text-blue-500 font-bold uppercase flex items-center gap-1">
                      <Bot className="h-3 w-3" /> Próxima Ação Recomendada
                    </p>
                    <p className="text-xs italic leading-relaxed">
                      {lastRun?.recommended_action || "Aguardando próxima interação..."}
                    </p>
                  </Card>

                  <Card className="p-4 border-dashed bg-muted/10 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] text-muted-foreground uppercase">Conversation Score</p>
                      <Badge variant="outline" className={cn(
                        "text-xs font-bold",
                        (lastRun?.conversation_score || 0) >= 80 ? "text-green-500 border-green-500/20 bg-green-500/5" :
                        (lastRun?.conversation_score || 0) >= 50 ? "text-orange-500 border-orange-500/20 bg-orange-500/5" :
                        "text-red-500 border-red-500/20 bg-red-500/5"
                      )}>
                        {lastRun?.conversation_score || 0}/100
                      </Badge>
                    </div>
                    <div className="space-y-1">
                      {(() => {
                        let feedback = [];
                        try {
                          feedback = typeof lastRun?.conversation_feedback === 'string' 
                            ? JSON.parse(lastRun.conversation_feedback) 
                            : lastRun?.conversation_feedback || [];
                        } catch(e) { feedback = []; }
                        
                        if (!Array.isArray(feedback)) feedback = [];

                        if (feedback.length === 0) return <p className="text-[10px] text-muted-foreground italic">Nenhum feedback disponível.</p>;

                        return feedback.map((f: string, i: number) => (
                          <div key={i} className="flex items-start gap-2 text-[10px]">
                            {f.startsWith('✔') || f.toLowerCase().includes('ok') || f.toLowerCase().includes('bom') ? (
                              <CheckCircle2 className="h-3 w-3 text-green-500 mt-0.5 shrink-0" />
                            ) : f.startsWith('⚠') || f.toLowerCase().includes('atenção') ? (
                              <AlertTriangle className="h-3 w-3 text-orange-500 mt-0.5 shrink-0" />
                            ) : (
                              <XCircle className="h-3 w-3 text-red-500 mt-0.5 shrink-0" />
                            )}
                            <span>{f}</span>
                          </div>
                        ));
                      })()}
                    </div>
                  </Card>
                </div>
              </TabsContent>


              <TabsContent value="reasoning" className="p-4 m-0 space-y-4">
                <div className="space-y-4">
                  <h3 className="text-sm font-bold">Por que? (Justificativa)</h3>
                  <Card className="p-4 bg-muted/20">
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">
                      {lastRun?.reasoning || "Nenhuma justificativa fornecida para esta execução."}
                    </p>
                  </Card>
                  
                  <Separator />
                  
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-muted-foreground uppercase">Timeline do Lead</h4>
                    <div className="space-y-4 relative before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[2px] before:bg-muted">
                      {/* Placeholder para timeline baseada em histórico */}
                      <div className="flex gap-4 relative">
                        <div className="w-6 h-6 rounded-full bg-blue-500 border-4 border-background z-10" />
                        <div className="flex-1 space-y-1">
                          <p className="text-[10px] text-muted-foreground">Agora</p>
                          <p className="text-xs font-medium">Estado atual: {(lastRun?.temperature || "Frio").toUpperCase()}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>


              <TabsContent value="modulos" className="p-4 m-0 space-y-4">
                <div className="space-y-4">
                  <div>
                    <h4 className="text-xs font-semibold mb-2">Impacto no Prompt</h4>
                    <div className="space-y-3">
                      {(() => {
                        const run = lastRun as any;
                        const meta = run?.derived_metadata;
                        const modules = meta?.modules;
                        const telemetry = modules?.estimated_tokens_by_module 
                          ? Object.entries(modules.estimated_tokens_by_module).map(([key, tokens]) => ({
                              key,
                              name: key.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
                              chars: Number(modules?.estimated_chars_by_module?.[key] ?? (Number(tokens) * 4)),
                              tokens: Number(tokens)
                            }))
                          : [];

                        // Estes valores são estimativas do tamanho dos módulos (chars / 4).
                        // O uso real faturável da Anthropic aparece na aba Custo, usando usage da própria API.
                        const estimatedWithCommercial = Number(
                          modules?.prompt_tokens_with_commercial ??
                          telemetry.reduce((sum: number, item: any) => sum + Number(item.tokens || 0), 0)
                        );
                        const commercialDiff = Number(modules?.commercial_tokens_added || 0);
                        const comparison = {
                          withoutCommercial: Number(
                            modules?.prompt_tokens_without_commercial ??
                            Math.max(0, estimatedWithCommercial - commercialDiff)
                          ),
                          withCommercial: estimatedWithCommercial,
                          diff: commercialDiff
                        };
                        
                        if (telemetry.length === 0) return <span className="text-[10px] text-muted-foreground italic">Nenhuma telemetria de módulos disponível.</span>;

                        return (
                          <>
                            <p className="text-[10px] font-semibold text-foreground mb-1">Módulos utilizados nesta mensagem</p>
                            <p className="text-[9px] text-muted-foreground mb-2">Telemetria real do backend — reflete exatamente o que foi enviado ao Prompt Builder nesta mensagem, não a configuração da sessão.</p>
                            <div className="grid grid-cols-1 gap-1">
                              {telemetry.map((t: any) => (
                                <div key={t.key} className="flex items-center justify-between text-[10px] bg-muted/30 p-2 rounded border border-border/50">
                                  <div className="flex items-center gap-2">
                                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                                    <span className="font-medium">{t.name}</span>
                                  </div>
                                  <div className="flex gap-2 text-muted-foreground">
                                    <span>{t.chars} chars</span>
                                    <span className="text-primary font-bold">+{t.tokens} tokens</span>
                                  </div>
                                </div>
                              ))}
                            </div>

                            <Card className="p-3 bg-primary/5 border-primary/10">
                              <p className="text-[9px] text-muted-foreground uppercase mb-1 font-bold">Comparativo de Inteligência Comercial</p>
                              <p className="text-[9px] text-muted-foreground mb-2">Estimativa do prompt dos módulos (não é o usage faturável da Anthropic).</p>
                              <div className="space-y-1">
                                <div className="flex justify-between text-[10px]">
                                  <span>Prompt sem módulos comerciais:</span>
                                  <span>{comparison.withoutCommercial} tokens</span>
                                </div>
                                <div className="flex justify-between text-[10px] font-bold">
                                  <span>Prompt com módulos comerciais:</span>
                                  <span>{comparison.withCommercial} tokens</span>
                                </div>
                                <Separator className="my-1" />
                                <div className="flex justify-between text-[10px] text-primary font-bold uppercase tracking-wider">
                                  <span>Diferença de custo:</span>
                                  <span>+{comparison.diff} tokens</span>
                                </div>
                              </div>
                            </Card>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                  <Separator />
                  <div>
                    <h4 className="text-xs font-semibold mb-2">Módulos habilitados para a sessão</h4>
                    <p className="text-[9px] text-muted-foreground mb-2">Configuração da sessão de teste — não reflete quais módulos foram enviados numa mensagem específica. Veja "Módulos utilizados nesta mensagem" acima para a telemetria real.</p>
                    <div className="space-y-2">
                      {[
                        { id: "identidade", label: "Identidade", core: true },
                        { id: "regras_gerais", label: "Regras Gerais", core: true },
                        { id: "comportamento_humano", label: "Comportamento Humano", core: false },
                        { id: "fluxo_vendas", label: "Fluxo de Vendas", core: false },
                        { id: "psicologia_vendas", label: "Psicologia de Vendas", core: false },
                        { id: "objecoes_vendas", label: "Objeções de Vendas", core: false },
                        { id: "fechamento_vendas", label: "Fechamento de Vendas", core: false },
                        { id: "qualificacao_lead", label: "Qualificação de Lead", core: false },
                        { id: "spotify", label: "Spotify", core: false },
                        { id: "instagram", label: "Instagram", core: false },
                        { id: "youtube", label: "YouTube", core: false },
                        { id: "tiktok", label: "TikTok", core: false },
                        { id: "suporte", label: "Suporte", core: false }
                      ].map(m => {
                        const isEnabled = activeSession?.enabled_modules?.includes(m.id);
                        return (
                          <div key={m.id} className="flex items-center space-x-2">
                            <Checkbox 
                              id={m.id} 
                              disabled={m.core || !activeSessionId}
                              checked={m.core || isEnabled} 
                              onCheckedChange={(checked) => {
                                if (m.core || !activeSessionId) return;
                                const current = activeSession?.enabled_modules || [];
                                const next = checked 
                                  ? [...current, m.id] 
                                  : current.filter(id => id !== m.id);
                                updateSessionModules.mutate({ sid: activeSessionId, modules: next });
                              }}
                            />
                            <label htmlFor={m.id} className="text-xs font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                              {m.label} {m.core && <span className="text-[10px] text-muted-foreground">(Core)</span>}
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                </div>
              </TabsContent>

              <TabsContent value="prompt" className="p-0 m-0">
                <div className="p-4 bg-muted/50 font-mono text-[10px] whitespace-pre-wrap break-all leading-relaxed h-[500px]">
                  {lastRun?.system_prompt_snapshot || "Nenhuma execução registrada."}
                </div>
              </TabsContent>

              <TabsContent value="custo" className="p-4 m-0 space-y-4">
                <div className="space-y-4">
                   <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <p className="text-[10px] text-muted-foreground">Input Tokens</p>
                        <p className="text-sm font-semibold">{lastRun?.input_tokens || 0}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] text-muted-foreground">Output Tokens</p>
                        <p className="text-sm font-semibold">{lastRun?.output_tokens || 0}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] text-muted-foreground">Cache Write</p>
                        <p className="text-sm font-semibold">{lastRun?.cache_creation_input_tokens || 0}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] text-muted-foreground">Cache Read</p>
                        <p className="text-sm font-semibold">{lastRun?.cache_read_input_tokens || 0}</p>
                      </div>
                   </div>
                   <Separator />
                   <div className="grid grid-cols-1 gap-3">
                     <div className="p-4 bg-primary/5 rounded-lg border border-primary/20 flex flex-col items-center">
                       <p className="text-[10px] text-muted-foreground">Custo desta execução</p>
                       <p className="text-2xl font-bold text-primary">US$ {lastRun?.cost_usd ? Number(lastRun.cost_usd).toFixed(8) : "0.00000000"}</p>
                     </div>

                     <div className="p-4 bg-muted/30 rounded-lg border space-y-3">
                       <div className="flex items-center justify-between">
                         <div>
                           <p className="text-[10px] text-muted-foreground">Custo acumulado desta conversa</p>
                           <p className="text-lg font-bold">US$ {Number(sessionUsage?.costUsd || 0).toFixed(8)}</p>
                         </div>
                         <Badge variant="outline">{sessionUsage?.calls || 0} chamadas</Badge>
                       </div>
                       <div className="grid grid-cols-2 gap-2 text-[10px]">
                         <div><span className="text-muted-foreground">Input:</span> <strong>{sessionUsage?.inputTokens || 0}</strong></div>
                         <div><span className="text-muted-foreground">Output:</span> <strong>{sessionUsage?.outputTokens || 0}</strong></div>
                         <div><span className="text-muted-foreground">Cache Write:</span> <strong>{sessionUsage?.cacheWriteTokens || 0}</strong></div>
                         <div><span className="text-muted-foreground">Cache Read:</span> <strong>{sessionUsage?.cacheReadTokens || 0}</strong></div>
                       </div>
                       <p className="text-[9px] text-muted-foreground">Valores calculados a partir do usage retornado pela Anthropic em cada chamada salva nesta sessão. O painel da Anthropic pode exibir arredondamentos ou agregações diferentes.</p>
                     </div>
                   </div>
                </div>
              </TabsContent>
            </ScrollArea>
          </Tabs>
        </aside>
      </div>

      <ScenarioGenerator 
        open={isScenarioOpen} 
        onOpenChange={setIsScenarioOpen}
        onGenerate={async (s) => {
          if (!activeSessionId) return;
          toast.info(`Gerando cenário: ${s.selectedScenario}`);
          
          const templates: Record<string, Array<{ role: 'user' | 'agent', content: string }>> = {
            novo: [{ role: 'user', content: 'Oi, boa tarde!' }],
            quente: [
              { role: 'user', content: 'Oi, vi os preços no site e quero comprar 5k de seguidores no Instagram.' },
              { role: 'agent', content: 'Olá! Perfeito, os 5k de seguidores para Instagram estão por apenas R$ 49,90. Quer que eu te envie o link para pagamento?' },
              { role: 'user', content: 'Sim, por favor.' }
            ],
            spotify: [
              { role: 'user', content: 'Vocês tem plays para spotify?' },
              { role: 'agent', content: 'Temos sim! Trabalhamos com plays mundiais e mensais. Quantas você precisa?' },
              { role: 'user', content: 'Quero 1000 plays.' }
            ]
          };

          const scenarioMessages = templates[s.selectedScenario] || [{ role: 'user', content: 'Teste de cenário' }];
          
          const { error } = await supabase.from("agent_playground_messages").insert(
            scenarioMessages.map((m, i) => ({
              session_id: activeSessionId,
              role: m.role,
              content: m.content,
              sequence: i + 1
            }))
          );

          if (error) toast.error(error.message);
          else {
            queryClient.invalidateQueries({ queryKey: ["playground_messages", activeSessionId] });
            toast.success("Cenário gerado com sucesso");
          }
          setIsScenarioOpen(false);
        }}
      />

      <HistoryEditor
        open={isHistoryEditorOpen}
        onOpenChange={setIsHistoryEditorOpen}
        onAdd={async (msg) => {
          if (!activeSessionId) return;
          const { error } = await supabase.from("agent_playground_messages").insert({
            session_id: activeSessionId,
            role: msg.role,
            content: msg.content,
            sequence: (messages?.length || 0) + 1
          });
          if (error) toast.error(error.message);
          else {
            queryClient.invalidateQueries({ queryKey: ["playground_messages", activeSessionId] });
            toast.success("Mensagem adicionada");
          }
        }}
      />
    </div>
  );
}
