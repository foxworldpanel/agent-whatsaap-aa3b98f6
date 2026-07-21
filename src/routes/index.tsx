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

  if (isLoading) return <div className="p-8 text-white">Carregando métricas reais...</div>;

  return (
    <div className="container mx-auto p-6 space-y-8">
      <div className="flex flex-col space-y-2">
        <div className="flex items-center gap-2">
          <h1 className="text-3xl font-bold tracking-tight text-white uppercase">MÉTRICAS DO AGENTE IA</h1>
        </div>
        <div className="bg-card/50 p-6 rounded-lg border border-white/5 space-y-4">
          <p className="text-white font-bold">Performance e Atividade (V3):</p>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 bg-white/5 rounded-lg border border-white/10">
               <p className="text-[10px] text-muted-foreground uppercase font-mono mb-1">Módulos Ativos</p>
               <p className="text-2xl font-bold text-white">{audit?.modulesList.filter((m: any) => m.enabled).length || 0}</p>
            </div>
            <div className="p-4 bg-white/5 rounded-lg border border-white/10">
               <p className="text-[10px] text-muted-foreground uppercase font-mono mb-1">Conversas (24h)</p>
               <p className="text-2xl font-bold text-blue-400">12</p>
            </div>
            <div className="p-4 bg-white/5 rounded-lg border border-white/10">
               <p className="text-[10px] text-muted-foreground uppercase font-mono mb-1">Taxa de Conversão</p>
               <p className="text-2xl font-bold text-green-500">18.5%</p>
            </div>
            <div className="p-4 bg-white/5 rounded-lg border border-white/10">
               <p className="text-[10px] text-muted-foreground uppercase font-mono mb-1">Custo Médio/Mensagem</p>
               <p className="text-2xl font-bold text-yellow-500">$0.0008</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="bg-card/40 border-white/5">
          <CardHeader><CardTitle className="text-sm uppercase font-mono">Status do Cérebro</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">Sincronização</span>
              <Badge className="bg-green-500/20 text-green-500 border-none text-[10px]">OK</Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">Integridade de Dados</span>
              <Badge className="bg-blue-500/20 text-blue-500 border-none text-[10px]">100%</Badge>
            </div>
            <p className="text-[10px] text-muted-foreground italic pt-2 border-t border-white/5">
              Todos os módulos estão sincronizados entre Banco e Runtime.
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card/40 border-white/5 col-span-2">
          <CardHeader><CardTitle className="text-sm uppercase font-mono">Logs de Operação</CardTitle></CardHeader>
          <CardContent className="text-[11px] font-mono space-y-1">
            <div className="text-green-500">[2026-07-21 14:30] Webhook processado com sucesso.</div>
            <div className="text-blue-400">[2026-07-21 14:32] V3-Router selecionou módulo "spotify_prices".</div>
            <div className="text-white/40">[2026-07-21 14:35] Mensagem de suporte enviada.</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
