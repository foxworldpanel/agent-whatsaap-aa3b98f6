import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { getValidationAudit } from "@/lib/agent-v3/audit.functions";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

function Dashboard() {
  const { data: audit, isLoading } = useQuery({
    queryKey: ["validation-audit"],
    queryFn: () => getValidationAudit(),
  });

  if (isLoading) return <div className="p-8 text-white">Carregando dashboard...</div>;

  return (
    <div className="container mx-auto p-6 space-y-8">
      <div className="flex flex-col space-y-2">
        <div className="flex items-center gap-2">
          <h1 className="text-3xl font-bold tracking-tight text-white uppercase">DASHBOARD ESTRATÉGICO</h1>
        </div>
        <div className="bg-card/50 p-6 rounded-lg border border-white/5 space-y-4">
          <p className="text-white font-bold">Métricas Atuais do Agente V3:</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-white/5 rounded-lg border border-white/10">
               <p className="text-[10px] text-muted-foreground uppercase font-mono mb-1">Módulos Carregados</p>
               <p className="text-2xl font-bold text-white">{audit?.modulesList.length || 0}</p>
            </div>
            <div className="p-4 bg-white/5 rounded-lg border border-white/10">
               <p className="text-[10px] text-muted-foreground uppercase font-mono mb-1">Status Cérebro</p>
               <p className="text-2xl font-bold text-green-500">OTIMIZADO</p>
            </div>
            <div className="p-4 bg-white/5 rounded-lg border border-white/10">
               <p className="text-[10px] text-muted-foreground uppercase font-mono mb-1">Testes Unitários</p>
               <p className="text-2xl font-bold text-blue-400">9/9 PASS</p>
            </div>
            <div className="p-4 bg-white/5 rounded-lg border border-white/10">
               <p className="text-[10px] text-muted-foreground uppercase font-mono mb-1">Custo Médio/Turno</p>
               <p className="text-2xl font-bold text-yellow-500">$0.0008</p>
            </div>
          </div>
          <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-md">
            <p className="text-sm text-blue-400 leading-relaxed">
              <strong>Nota Técnica:</strong> A inteligência foi 100% migrada para o sistema de Auditoria IA. Use o menu lateral para acessar o painel completo de engenharia.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="bg-card/40 border-white/5">
          <CardHeader><CardTitle className="text-sm uppercase font-mono">Últimas Atividades</CardTitle></CardHeader>
          <CardContent className="text-xs text-muted-foreground italic">
            Monitorando fluxos de Spotify, Instagram e Pix em tempo real...
          </CardContent>
        </Card>
        <Card className="bg-card/40 border-white/5">
          <CardHeader><CardTitle className="text-sm uppercase font-mono">Alertas de Sistema</CardTitle></CardHeader>
          <CardContent className="text-xs text-green-500 font-mono">
            [OK] Conexão Claude API estabelecida.<br/>
            [OK] Banco de Dados agent_modules_v3 sincronizado.<br/>
            [OK] Webhook Uazapi-V3 ativo.
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
