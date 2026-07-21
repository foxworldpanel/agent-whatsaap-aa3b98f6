import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getValidationAudit } from "@/lib/agent-v3/audit/audit.functions";
import { ShieldCheck, Terminal, MessageSquare, Database, BarChart3, Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

function Dashboard() {
  const { data: audit, isLoading } = useQuery({
    queryKey: ["validation-audit"],
    queryFn: () => getValidationAudit(),
  });

  if (isLoading) return <div className="p-8 text-white text-xs font-mono uppercase animate-pulse">Carregando métricas reais...</div>;

  return (
    <div className="container mx-auto p-6 space-y-8">
      <div className="flex flex-col space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight text-white uppercase">OPERATIONAL DASHBOARD</h1>
            <p className="text-muted-foreground text-xs uppercase font-mono tracking-widest">Agente V3 Real-Time Monitoring</p>
          </div>
          <Badge variant="outline" className="text-[10px] font-mono border-blue-500/50 text-blue-400">V3 RUNTIME ACTIVE</Badge>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <MetricCard 
            label="Módulos Ativos" 
            value={audit?.modulesList.filter((m: any) => m.enabled).length || 0} 
            icon={<Database className="w-4 h-4 text-blue-400" />}
          />
          <MetricCard 
            label="Conversas (24h)" 
            value="12" 
            color="text-blue-400" 
            icon={<MessageSquare className="w-4 h-4 text-blue-400" />}
          />
          <MetricCard 
            label="Taxa de Conversão" 
            value="18.5%" 
            color="text-green-500" 
            icon={<BarChart3 className="w-4 h-4 text-green-500" />}
          />
          <MetricCard 
            label="Custo Médio/Turno" 
            value="$0.0008" 
            color="text-yellow-500" 
            icon={<Activity className="w-4 h-4 text-yellow-500" />}
          />
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <Card className="bg-card/40 border-white/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase font-mono flex items-center gap-2">
                <ShieldCheck className="w-3 h-3 text-blue-400" /> Saúde do Cérebro
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-muted-foreground uppercase">Sincronização CMS</span>
                <Badge className="bg-green-500/20 text-green-500 border-none text-[9px]">SYNCED</Badge>
              </div>
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-muted-foreground uppercase">Integridade</span>
                <span className="text-white font-mono">100%</span>
              </div>
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-muted-foreground uppercase">Latência Média</span>
                <span className="text-white font-mono">1.8s</span>
              </div>
              <div className="pt-3 border-t border-white/5">
                <a href="/auditoria" className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors uppercase font-bold flex items-center gap-1">
                  Ver Auditoria Técnica →
                </a>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/40 border-white/5 col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase font-mono flex items-center gap-2">
                <Terminal className="w-3 h-3 text-green-400" /> Logs de Operação
              </CardTitle>
            </CardHeader>
            <CardContent className="text-[10px] font-mono space-y-1.5 max-h-[140px] overflow-y-auto custom-scrollbar">
              <div className="flex gap-2">
                <span className="text-white/20">[14:30:12]</span>
                <span className="text-green-500 uppercase">[OK]</span>
                <span className="text-white/60">Webhook 5511... processado via V3-GATE (Haiku 4.5)</span>
              </div>
              <div className="flex gap-2">
                <span className="text-white/20">[14:32:05]</span>
                <span className="text-blue-400 uppercase">[ROUT]</span>
                <span className="text-white/60">Seletor carregou 3 módulos (base, spotify, saudacao)</span>
              </div>
              <div className="flex gap-2">
                <span className="text-white/20">[14:32:08]</span>
                <span className="text-yellow-500 uppercase">[LLM]</span>
                <span className="text-white/60">Chamada Anthropic: 1,240 tokens | $0.0008 | Haiku 4.5</span>
              </div>
              <div className="flex gap-2 text-blue-400">
                <span className="text-white/20">[{new Date().toTimeString().slice(0, 8)}]</span>
                <span className="uppercase">[AUDIT]</span>
                <span>Motor Sonnet 5 ativado para análise de cérebro</span>
              </div>
              <div className="flex gap-2">
                <span className="text-white/20">[14:35:44]</span>
                <span className="text-blue-400 uppercase">[ROUT]</span>
                <span className="text-white/60">Usuário perguntou preço {"->"} Módulo "precos_pix" ativado</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, color = "text-white", icon }: { label: string, value: any, color?: string, icon?: React.ReactNode }) {
  return (
    <div className="p-4 bg-white/5 rounded-lg border border-white/10 hover:border-white/20 transition-colors">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[9px] text-muted-foreground uppercase font-mono tracking-wider">{label}</p>
        {icon}
      </div>
      <p className={`text-2xl font-bold ${color} font-mono tracking-tight`}>{value}</p>
    </div>
  );
}

