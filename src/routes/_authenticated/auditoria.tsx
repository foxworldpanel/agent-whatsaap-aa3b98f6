import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useQuery } from "@tanstack/react-query";
import { 
  Activity, 
  Database, 
  Layout, 
  Search, 
  PlayCircle, 
  BarChart3, 
  History, 
  ShieldCheck, 
  Terminal,
  FileCode,
  Zap
} from "lucide-react";

export const Route = createFileRoute("/auditoria")({
  component: AuditoriaIA,
});

function AuditoriaIA() {
  return (
    <div className="container mx-auto p-6 space-y-8 min-h-screen bg-background text-foreground">
      <div className="flex flex-col space-y-2 border-b border-white/10 pb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-500/10 rounded-lg">
            <ShieldCheck className="w-8 h-8 text-blue-500" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white uppercase flex items-center gap-2">
              🧪 Auditoria IA
              <Badge variant="outline" className="text-[10px] font-mono border-blue-500/50 text-blue-400">AGENTE V3</Badge>
            </h1>
            <p className="text-muted-foreground text-sm">Centro oficial de engenharia, diagnóstico e observabilidade do runtime.</p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="bg-black/40 border border-white/5 p-1 flex-wrap h-auto gap-1">
          <TabsTrigger value="overview" className="gap-2 data-[state=active]:bg-white/10"><Activity className="w-4 h-4" /> Visão Geral</TabsTrigger>
          <TabsTrigger value="modules" className="gap-2 data-[state=active]:bg-white/10"><Database className="w-4 h-4" /> Módulos</TabsTrigger>
          <TabsTrigger value="prompt" className="gap-2 data-[state=active]:bg-white/10"><FileCode className="w-4 h-4" /> Prompt Builder</TabsTrigger>
          <TabsTrigger value="selector" className="gap-2 data-[state=active]:bg-white/10"><Search className="w-4 h-4" /> Seletor</TabsTrigger>
          <TabsTrigger value="executions" className="gap-2 data-[state=active]:bg-white/10"><History className="w-4 h-4" /> Execuções</TabsTrigger>
          <TabsTrigger value="metrics" className="gap-2 data-[state=active]:bg-white/10"><BarChart3 className="w-4 h-4" /> Métricas</TabsTrigger>
          <TabsTrigger value="integrity" className="gap-2 data-[state=active]:bg-white/10"><ShieldCheck className="w-4 h-4" /> Integridade</TabsTrigger>
          <TabsTrigger value="tests" className="gap-2 data-[state=active]:bg-white/10"><PlayCircle className="w-4 h-4" /> Testes</TabsTrigger>
          <TabsTrigger value="logs" className="gap-2 data-[state=active]:bg-white/10"><Terminal className="w-4 h-4" /> Logs</TabsTrigger>
          <TabsTrigger value="diff" className="gap-2 data-[state=active]:bg-white/10"><Layout className="w-4 h-4" /> Diferenças</TabsTrigger>
          <TabsTrigger value="inspection" className="gap-2 data-[state=active]:bg-white/10"><Search className="w-4 h-4" /> Inspeção</TabsTrigger>
          <TabsTrigger value="health" className="gap-2 data-[state=active]:bg-white/10"><Zap className="w-4 h-4" /> Saúde</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatusCard title="Claude API" status="Online" latency="240ms" errors="0" />
            <StatusCard title="Supabase" status="Online" latency="12ms" errors="0" />
            <StatusCard title="V3 Runtime" status="Ativo" latency="1.2s" errors="2" />
            <StatusCard title="WhatsApp" status="Conectado" latency="800ms" errors="0" />
            <StatusCard title="Prompt Builder" status="Match" latency="5ms" errors="0" />
            <StatusCard title="Module Selector" status="Ativo" latency="45ms" errors="1" />
            <StatusCard title="Persistência" status="Match" latency="150ms" errors="0" />
            <StatusCard title="Telemetria" status="Ativo" latency="10ms" errors="0" />
          </div>
        </TabsContent>

        <TabsContent value="modules">
          <Card className="bg-card/50 border-white/5">
            <CardHeader>
              <CardTitle className="text-sm font-mono uppercase">Módulos Carregados (agent_modules_v3)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center p-12 text-muted-foreground border-2 border-dashed border-white/5 rounded-lg">
                Selecione um workspace para carregar os módulos.
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="prompt">
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2 bg-card/50 border-white/5">
              <CardHeader><CardTitle className="text-sm uppercase font-mono">Prompt Final em Tempo Real</CardTitle></CardHeader>
              <CardContent>
                <div className="bg-black/60 p-4 rounded-md font-mono text-[11px] h-[500px] overflow-auto border border-white/10 text-muted-foreground leading-relaxed">
                  [SISTEMA: V3_CORE]<br/>
                  Identidade: Júlia, especialista da Mind SMM...<br/>
                  (...)
                </div>
              </CardContent>
            </Card>
            <div className="space-y-4">
              <Card className="bg-card/50 border-white/5">
                <CardHeader><CardTitle className="text-sm uppercase font-mono">Resumo de Tokens</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm font-mono">
                  <div className="flex justify-between"><span>Core:</span> <span className="text-blue-400">450</span></div>
                  <div className="flex justify-between"><span>Identidade:</span> <span className="text-blue-400">120</span></div>
                  <div className="flex justify-between"><span>Contexto:</span> <span className="text-blue-400">600</span></div>
                  <div className="border-t border-white/5 pt-2 flex justify-between font-bold">
                    <span>TOTAL:</span> <span className="text-green-500">1.170</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="selector">
          <div className="space-y-6">
            <Card className="bg-card/50 border-white/5">
              <CardHeader><CardTitle className="text-sm uppercase font-mono">Debugger do Seletor</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    placeholder="Digite uma mensagem de teste..." 
                    className="flex-1 bg-black/40 border border-white/10 rounded px-4 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                  />
                  <button className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded text-sm font-bold transition-colors">
                    EXECUTAR
                  </button>
                </div>
                <div className="p-8 text-center text-muted-foreground border border-dashed border-white/5 rounded-lg">
                  Aguardando entrada para análise...
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab contents for other tabs would follow similar structure, kept minimal for now */}
        <TabsContent value="metrics">
          <div className="grid gap-4 md:grid-cols-2">
             <Card className="bg-card/50 border-white/5 h-64 flex items-center justify-center text-muted-foreground italic text-sm">
                Gráfico de Latência (Últimas 24h)
             </Card>
             <Card className="bg-card/50 border-white/5 h-64 flex items-center justify-center text-muted-foreground italic text-sm">
                Gráfico de Consumo de Tokens
             </Card>
          </div>
        </TabsContent>

      </Tabs>
    </div>
  );
}

function StatusCard({ title, status, latency, errors }: { title: string, status: string, latency: string, errors: string }) {
  const isHealthy = status === "Online" || status === "Ativo" || status === "Match" || status === "Conectado";
  return (
    <Card className="bg-card/40 border-white/5">
      <CardHeader className="py-3 px-4 flex flex-row items-center justify-between space-y-0 border-b border-white/5">
        <CardTitle className="text-[10px] font-mono text-muted-foreground uppercase">{title}</CardTitle>
        <div className={`w-2 h-2 rounded-full ${isHealthy ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-red-500'}`} />
      </CardHeader>
      <CardContent className="py-3 px-4 space-y-1">
        <div className="flex justify-between items-center">
          <span className="text-lg font-bold text-white leading-none">{status}</span>
        </div>
        <div className="flex justify-between text-[10px] font-mono text-muted-foreground mt-2">
          <span>LATÊNCIA: {latency}</span>
          <span>ERROS: {errors}</span>
        </div>
      </CardContent>
    </Card>
  );
}
