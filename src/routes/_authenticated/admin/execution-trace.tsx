import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { 
  Activity, 
  Search, 
  Clock, 
  Phone, 
  Hash, 
  AlertTriangle, 
  AlertCircle,
  Info,
  CheckCircle2,
  XCircle,
  ChevronRight,
  RefreshCw,
  Cpu,
  Coins,
  ShieldCheck,
  Zap,
  ArrowRight
} from "lucide-react";
import { getExecutionTraces, getTraceDetails } from "@/lib/agent-v3/admin/trace-viewer.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/admin/execution-trace")({
  component: ExecutionTracePage,
});

function ExecutionTracePage() {
  const [phone, setPhone] = useState("");
  const [traceId, setTraceId] = useState("");
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  
  const fetchTraces = useServerFn(getExecutionTraces);
  const fetchDetails = useServerFn(getTraceDetails);

  const { data: traces, isLoading, refetch } = useQuery({
    queryKey: ["execution_traces", { phone, traceId }],
    queryFn: () => fetchTraces({ data: { phone, traceId, limit: 50 } }),
  });

  const { data: details, isLoading: detailsLoading } = useQuery({
    queryKey: ["trace_details", selectedTraceId],
    queryFn: () => fetchDetails({ data: { traceId: selectedTraceId as string } }),
    enabled: !!selectedTraceId,
  });

  // Derived Summary Data
  const summary = useMemo(() => {
    if (!details || details.length === 0) return null;
    
    const claudeCalls = details.filter(d => d.step === "claude_call_start").length;
    const whatsappSends = details.filter(d => d.step === "whatsapp_send").length;
    const errors = details.filter(d => d.status === "error").length;
    
    const pipelineStart = details.find(d => d.step === "pipeline_start");
    const pipelineEnd = details.find(d => d.step === "pipeline_end") || details[details.length - 1];
    const totalDuration = pipelineStart && pipelineEnd 
      ? new Date(pipelineEnd.created_at as string).getTime() - new Date(pipelineStart.created_at as string).getTime()
      : 0;

    let totalTokens = 0;
    let totalCost = 0;
    let promptTokens = 0;
    let completionTokens = 0;
    
    details.forEach(d => {
      const detailsObj = d.details as any;
      if (d.step === "claude_call_end" && detailsObj?.usage) {
        totalTokens += (detailsObj.usage.total_tokens || 0);
        promptTokens += (detailsObj.usage.input_tokens || 0);
        completionTokens += (detailsObj.usage.output_tokens || 0);
        totalCost += (detailsObj.totalCost?.total_usd || 0);
      }
    });

    const outputGuardModified = details.some(d => (d.details as any)?.modified === true && d.step === "output_guard_end");

    return {
      claudeCalls,
      whatsappSends,
      errors,
      totalDuration,
      totalTokens,
      promptTokens,
      completionTokens,
      totalCost,
      outputGuardModified
    };
  }, [details]);

  return (
    <div className="container mx-auto p-4 space-y-6 max-w-7xl">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
            <Activity className="h-8 w-8 text-primary" />
            Execution Trace Viewer
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Inspeção visual em tempo real do pipeline do Agent V3.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className={cn("h-4 w-4 mr-2", isLoading && "animate-spin")} />
            Atualizar
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Sidebar: Execution List */}
        <div className="lg:col-span-4 space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="p-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Search className="h-4 w-4" /> Filtros
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="phone-filter" className="text-[10px] uppercase font-bold text-muted-foreground">Telefone</Label>
                <Input 
                  id="phone-filter"
                  placeholder="Ex: 55119..." 
                  value={phone} 
                  onChange={e => setPhone(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="trace-filter" className="text-[10px] uppercase font-bold text-muted-foreground">Trace ID</Label>
                <Input 
                  id="trace-filter"
                  placeholder="trc_..." 
                  value={traceId} 
                  onChange={e => setTraceId(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </CardContent>
          </Card>

          <ScrollArea className="h-[calc(100vh-400px)] rounded-md border border-border/50">
            <div className="p-1 space-y-1">
              {traces?.map(trace => (
                <button
                  key={trace.id}
                  onClick={() => setSelectedTraceId(trace.trace_id)}
                  className={cn(
                    "w-full text-left p-3 rounded-md transition-all border border-transparent hover:bg-accent/50 group",
                    selectedTraceId === trace.trace_id ? "bg-accent border-primary/20" : "bg-card/30"
                  )}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-[10px] font-mono text-primary group-hover:underline">
                      {trace.trace_id}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {format(new Date(trace.created_at as string), "HH:mm:ss", { locale: ptBR })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-medium text-foreground mb-1">
                    <Phone className="h-3 w-3 text-muted-foreground" />
                    {trace.phone || "Desconhecido"}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {trace.duration_ms && (
                      <Badge variant="outline" className="text-[9px] h-4 bg-background/50">
                        {trace.duration_ms}ms
                      </Badge>
                    )}
                    {trace.status === "error" && (
                      <Badge variant="destructive" className="text-[9px] h-4">Error</Badge>
                    )}
                  </div>
                </button>
              ))}
              {traces?.length === 0 && (
                <div className="text-center py-10 text-muted-foreground text-sm">
                  Nenhum trace encontrado.
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Main: Timeline & Details */}
        <div className="lg:col-span-8 space-y-6">
          {!selectedTraceId ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed border-border/50 rounded-lg p-12">
              <Activity className="h-12 w-12 mb-4 opacity-20" />
              <p>Selecione uma execução para ver os detalhes</p>
            </div>
          ) : (
            <>
              {/* Summary Panel */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="bg-card/40 border-border/50 overflow-hidden relative">
                  <div className="absolute top-0 left-0 w-1 h-full bg-blue-500/50" />
                  <CardContent className="p-4">
                    <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Duração Total</p>
                    <div className="flex items-baseline gap-1">
                      <span className="text-xl font-bold">{(summary?.totalDuration || 0) / 1000}</span>
                      <span className="text-xs text-muted-foreground">s</span>
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-card/40 border-border/50 overflow-hidden relative">
                  <div className="absolute top-0 left-0 w-1 h-full bg-purple-500/50" />
                  <CardContent className="p-4">
                    <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Claude Calls</p>
                    <div className="flex items-baseline gap-1">
                      <span className="text-xl font-bold">{summary?.claudeCalls}</span>
                      {summary?.claudeCalls && summary.claudeCalls > 1 && (
                        <AlertTriangle className="h-3 w-3 text-amber-500 ml-1" />
                      )}
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-card/40 border-border/50 overflow-hidden relative">
                  <div className="absolute top-0 left-0 w-1 h-full bg-green-500/50" />
                  <CardContent className="p-4">
                    <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Total Tokens</p>
                    <div className="flex items-baseline gap-1">
                      <span className="text-xl font-bold">{summary?.totalTokens.toLocaleString()}</span>
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-card/40 border-border/50 overflow-hidden relative">
                  <div className="absolute top-0 left-0 w-1 h-full bg-amber-500/50" />
                  <CardContent className="p-4">
                    <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Custo Est.</p>
                    <div className="flex items-baseline gap-1">
                      <span className="text-xs text-muted-foreground">$</span>
                      <span className="text-xl font-bold">{summary?.totalCost.toFixed(4)}</span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Alerts */}
              <div className="space-y-2">
                {summary?.claudeCalls && summary.claudeCalls > 1 && (
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-md p-3 flex items-center gap-3 text-amber-500 text-sm">
                    <AlertTriangle className="h-4 w-4" />
                    <span className="font-medium">⚠ Multiple Claude Executions detected</span>
                  </div>
                )}
                {summary?.whatsappSends && summary.whatsappSends > 1 && (
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-md p-3 flex items-center gap-3 text-amber-500 text-sm">
                    <AlertTriangle className="h-4 w-4" />
                    <span className="font-medium">⚠ Multiple WhatsApp Messages sent</span>
                  </div>
                )}
                {summary?.totalDuration && summary.totalDuration > 10000 && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-md p-3 flex items-center gap-3 text-red-500 text-sm">
                    <Clock className="h-4 w-4" />
                    <span className="font-medium">⚠ High Latency: Pipeline took {summary.totalDuration / 1000}s</span>
                  </div>
                )}
                {summary?.outputGuardModified && (
                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-md p-3 flex items-center gap-3 text-blue-400 text-sm">
                    <Info className="h-4 w-4" />
                    <span className="font-medium">ℹ Response Modified by Output Guard before sending</span>
                  </div>
                )}
                {summary?.errors && summary.errors > 0 && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-md p-3 flex items-center gap-3 text-red-500 text-sm">
                    <XCircle className="h-4 w-4" />
                    <span className="font-medium">❌ Pipeline Error occurred in one or more steps</span>
                  </div>
                )}
              </div>

              {/* Timeline */}
              <Card className="bg-card/30 border-border/50">
                <CardHeader className="p-4 border-b border-border/50 flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-semibold">Timeline da Execução</CardTitle>
                    <CardDescription className="text-[10px]">Sequência cronológica de eventos</CardDescription>
                  </div>
                  <Badge variant="outline" className="font-mono text-[10px]">{selectedTraceId}</Badge>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="relative space-y-0">
                    {/* Vertical Line */}
                    <div className="absolute left-[7px] top-2 bottom-2 w-[2px] bg-border/50" />
                    
                    {details?.map((step, idx) => (
                      <div key={step.id} className="relative pl-8 pb-8 last:pb-0 group">
                        {/* Dot */}
                        <div className={cn(
                          "absolute left-0 top-1.5 w-4 h-4 rounded-full border-2 border-background z-10",
                          step.status === "error" ? "bg-red-500" : "bg-primary"
                        )} />
                        
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-bold text-foreground capitalize">
                              {step.step.replace(/_/g, " ")}
                            </span>
                            <span className="text-[10px] font-mono text-muted-foreground bg-accent/30 px-1.5 py-0.5 rounded">
                              {format(new Date(step.created_at as string), "HH:mm:ss.SSS", { locale: ptBR })}
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-3">
                            {step.duration_ms && (
                              <span className="text-[10px] text-primary font-medium flex items-center gap-1">
                                <Clock className="h-3 w-3" /> {step.duration_ms}ms
                              </span>
                            )}
                            {step.status && (
                              <Badge variant={step.status === "error" ? "destructive" : "secondary"} className="text-[9px] h-4 py-0">
                                {step.status}
                              </Badge>
                            )}
                          </div>

                          {step.details && Object.keys(step.details).length > 0 && (
                            <div className="mt-2 p-3 rounded bg-accent/20 border border-border/30 text-[11px] font-mono text-muted-foreground overflow-x-auto">
                              <pre>{JSON.stringify(step.details, null, 2)}</pre>
                            </div>
                          )}
                        </div>

                        {idx < details.length - 1 && (
                          <div className="absolute left-[7px] top-6 bottom-0 w-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                             <ArrowRight className="h-3 w-3 rotate-90 text-primary/30" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}



