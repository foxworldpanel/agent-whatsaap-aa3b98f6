import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useQuery } from "@tanstack/react-query";
import { getBrainQualityAudit } from "@/lib/agent-v3/brain-audit.functions";
import { 
  Activity, Database, Layout, Search, PlayCircle, BarChart3, History, ShieldCheck, Terminal, FileCode, Zap, Star, AlertTriangle, TrendingUp
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/auditoria")({
  component: AuditoriaIA,
});

function AuditoriaIA() {
  const { data: audit, isLoading } = useQuery({
    queryKey: ["brain-audit"],
    queryFn: () => getBrainQualityAudit(),
  });

  if (isLoading) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background text-white gap-4">
      <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      <div className="text-center">
        <p className="text-lg font-bold uppercase tracking-widest">Executando Auditoria Inteligente</p>
        <p className="text-xs text-muted-foreground animate-pulse">Claude Sonnet 5 analisando o Cérebro V3...</p>
      </div>
    </div>
  );

  return (
    <div className="container mx-auto p-6 space-y-8 min-h-screen bg-background text-foreground">
      <div className="flex justify-between items-center border-b border-white/10 pb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-500/10 rounded-lg">
            <ShieldCheck className="w-8 h-8 text-blue-500" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white uppercase flex items-center gap-2">
              🧪 Auditoria IA
              <Badge variant="outline" className="text-[10px] font-mono border-blue-500/50 text-blue-400">SONNET 5 ENGINE</Badge>
            </h1>
            <p className="text-muted-foreground text-sm flex items-center gap-2">
              Inspeção dinâmica de modularização, redundância e conflitos.
              {audit?.auditTelemetry && (
                <span className="text-[10px] bg-white/5 px-2 py-0.5 rounded border border-white/10 text-white/50">
                  Modelo: {audit.auditTelemetry.model}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex gap-4 items-center">
          <button 
            onClick={() => {
              const auditData = JSON.stringify(audit, null, 2);
              const blob = new Blob([auditData], { type: 'text/plain' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `auditoria_v3_${new Date().toISOString().split('T')[0]}.txt`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold uppercase rounded-lg transition-colors shadow-lg shadow-blue-500/20"
          >
            <FileCode className="w-4 h-4" /> Exportar para ChatGPT
          </button>
          <Card className="bg-blue-600/10 border-blue-600/20">
            <CardHeader className="py-2 px-4"><CardTitle className="text-xs uppercase font-mono text-blue-400">Qualidade Geral</CardTitle></CardHeader>
            <CardContent className="py-2 px-4 text-center">
              <span className={`text-4xl font-bold ${Number(audit?.globalScore) > 7 ? 'text-green-500' : 'text-yellow-500'}`}>
                {Number(audit?.globalScore).toFixed(1)}/10
              </span>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <HealthIndicator label="Total Módulos" value={audit?.healthIndicators.totalModules} />
        <HealthIndicator label="Tokens Totais" value={Math.ceil(audit?.healthIndicators.totalTokens || 0)} />
        <HealthIndicator label="Duplicações" value={audit?.duplications.length} color="text-yellow-500" />
        <HealthIndicator label="Conflitos" value={audit?.conflicts.length} color="text-red-500" />
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="bg-black/40 border border-white/5 p-1 flex-wrap h-auto gap-1">
          <TabsTrigger value="overview" className="gap-2 data-[state=active]:bg-white/10"><Activity className="w-4 h-4" /> Visão Geral</TabsTrigger>
          <TabsTrigger value="modules" className="gap-2 data-[state=active]:bg-white/10"><Database className="w-4 h-4" /> Módulos</TabsTrigger>
          <TabsTrigger value="duplications" className="gap-2 data-[state=active]:bg-white/10"><Zap className="w-4 h-4" /> Duplicações</TabsTrigger>
          <TabsTrigger value="conflicts" className="gap-2 data-[state=active]:bg-white/10"><AlertTriangle className="w-4 h-4" /> Conflitos</TabsTrigger>
          <TabsTrigger value="improvements" className="gap-2 data-[state=active]:bg-white/10"><TrendingUp className="w-4 h-4" /> Melhorias</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-4 md:grid-cols-4 lg:grid-cols-7 text-xs font-mono uppercase">
            {audit?.composition && Object.entries(audit.composition).map(([key, val]) => (
              <Card key={key} className="bg-card/40 border-white/5">
                <CardHeader className="py-2 px-3 text-[9px] text-muted-foreground">{key}</CardHeader>
                <CardContent className="py-2 px-3 text-lg font-bold text-white">{Number(val).toFixed(1)}/10</CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="modules">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {audit?.modulesAudit.map((m: any) => (
              <Card key={m.key} className="bg-card/30 border-white/5 text-[11px] font-mono">
                <CardHeader className="py-3 bg-white/5 flex flex-row items-center justify-between">
                  <CardTitle className="text-xs font-mono uppercase truncate">{m.name || m.key}</CardTitle>
                  <div className="flex gap-0.5">
                    <span className="text-yellow-500 font-bold">{m.score}/10</span>
                  </div>
                </CardHeader>
                <CardContent className="py-3 space-y-2">
                  <p><span className="text-muted-foreground">OBJETIVO:</span> {m.objective}</p>
                  <p><span className="text-muted-foreground">ÚTIL:</span> {m.usefulContent}</p>
                  <p><span className="text-muted-foreground">GENÉRICO:</span> {m.genericContent}</p>
                  <p><span className="text-muted-foreground">RISCO:</span> <span className={m.risk && m.risk !== "baixo" ? "text-red-400" : "text-green-400"}>{m.risk}</span></p>
                  <div className="pt-2 border-t border-white/5">
                    <p className="text-blue-400 font-bold uppercase">AÇÃO: {m.recommendedAction}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="duplications">
          <Card className="bg-card/50 border-white/5">
            <CardContent className="pt-6">
              <Table>
                <TableHeader><TableRow className="border-white/5 uppercase text-[10px] text-muted-foreground"><TableHead>Regra</TableHead><TableHead>Módulo A</TableHead><TableHead>Módulo B</TableHead><TableHead>Tipo</TableHead><TableHead>Sugestão</TableHead></TableRow></TableHeader>
                <TableBody>
                  {audit?.duplications.map((d: any, i: number) => (
                    <TableRow key={i} className="border-white/5 text-xs">
                      <TableCell className="text-white">{d.rule}</TableCell>
                      <TableCell className="font-mono text-blue-400">{d.moduleA}</TableCell>
                      <TableCell className="font-mono text-blue-400">{d.moduleB}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{d.type}</Badge></TableCell>
                      <TableCell className="text-muted-foreground italic">{d.suggestion}</TableCell>
                    </TableRow>
                  ))}
                  {audit?.duplications.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground italic">Nenhuma duplicação encontrada.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="conflicts">
          <Card className="bg-card/50 border-white/5">
            <CardContent className="pt-6">
              <Table>
                <TableHeader><TableRow className="border-white/5 uppercase text-[10px] text-muted-foreground"><TableHead>Conflito</TableHead><TableHead>Módulo A</TableHead><TableHead>Módulo B</TableHead><TableHead>Detalhes</TableHead></TableRow></TableHeader>
                <TableBody>
                  {audit?.conflicts.map((c: any, i: number) => (
                    <TableRow key={i} className="border-white/5 text-xs">
                      <TableCell className="text-red-400">{c.conflict}</TableCell>
                      <TableCell className="font-mono text-blue-400">{c.moduleA}</TableCell>
                      <TableCell className="font-mono text-blue-400">{c.moduleB}</TableCell>
                      <TableCell className="text-muted-foreground italic">{c.details}</TableCell>
                    </TableRow>
                  ))}
                  {audit?.conflicts.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground italic">Nenhum conflito encontrado.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="improvements">
          <div className="grid gap-4 md:grid-cols-2">
            {audit?.improvements.map((imp: any, i: number) => (
              <Card key={i} className="bg-card/40 border-white/5 border-l-4 border-l-blue-500">
                <CardHeader className="py-3 px-4 flex flex-row items-center justify-between">
                  <Badge className="bg-blue-500/10 text-blue-400 uppercase text-[10px]">{imp.type}</Badge>
                  <Badge variant="outline" className="text-[10px] uppercase">{imp.impact} IMPACTO</Badge>
                </CardHeader>
                <CardContent className="py-3 px-4">
                  <p className="text-sm text-white">{imp.suggestion}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

      </Tabs>
    </div>
  );
}

function HealthIndicator({ label, value, color = "text-white" }: { label: string, value: any, color?: string }) {
  return (
    <Card className="bg-card/40 border-white/5">
      <CardHeader className="py-2 px-4"><CardTitle className="text-[10px] font-mono text-muted-foreground uppercase">{label}</CardTitle></CardHeader>
      <CardContent className="py-2 px-4"><span className={`text-xl font-bold ${color}`}>{value ?? 0}</span></CardContent>
    </Card>
  );
}
