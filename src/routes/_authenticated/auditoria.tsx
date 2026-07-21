import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useQuery } from "@tanstack/react-query";
import { getBrainQualityAudit } from "@/lib/agent-v3/brain-audit.functions";
import { 
  Activity, Database, Layout, Search, PlayCircle, BarChart3, History, ShieldCheck, Terminal, FileCode, Zap, Star
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/auditoria")({
  component: AuditoriaIA,
});

function AuditoriaIA() {
  const { data: audit, isLoading } = useQuery({
    queryKey: ["brain-audit"],
    queryFn: () => getBrainQualityAudit(),
  });

  if (isLoading) return <div className="p-8 text-white">Executando auditoria inteligente no cérebro V3...</div>;

  return (
    <div className="container mx-auto p-6 space-y-8 min-h-screen bg-background text-foreground">
      <div className="flex justify-between items-start border-b border-white/10 pb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-500/10 rounded-lg">
            <ShieldCheck className="w-8 h-8 text-blue-500" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white uppercase flex items-center gap-2">
              🧪 Auditoria IA
              <Badge variant="outline" className="text-[10px] font-mono border-blue-500/50 text-blue-400">AGENTE V3</Badge>
            </h1>
            <p className="text-muted-foreground text-sm">Painel oficial de engenharia, diagnóstico e observabilidade do runtime.</p>
          </div>
        </div>
        <Card className="bg-blue-600/10 border-blue-600/20">
          <CardHeader className="py-2 px-4"><CardTitle className="text-xs uppercase font-mono text-blue-400">Qualidade do Cérebro</CardTitle></CardHeader>
          <CardContent className="py-2 px-4 text-center">
            <span className="text-4xl font-bold text-white">{audit?.globalScore}/10</span>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="bg-black/40 border border-white/5 p-1 flex-wrap h-auto gap-1">
          <TabsTrigger value="overview" className="gap-2 data-[state=active]:bg-white/10"><Activity className="w-4 h-4" /> Visão Geral</TabsTrigger>
          <TabsTrigger value="modules" className="gap-2 data-[state=active]:bg-white/10"><Database className="w-4 h-4" /> Módulos</TabsTrigger>
          <TabsTrigger value="duplications" className="gap-2 data-[state=active]:bg-white/10"><Zap className="w-4 h-4" /> Duplicações</TabsTrigger>
          <TabsTrigger value="conflicts" className="gap-2 data-[state=active]:bg-white/10"><ShieldCheck className="w-4 h-4" /> Conflitos</TabsTrigger>
          <TabsTrigger value="improvements" className="gap-2 data-[state=active]:bg-white/10"><Zap className="w-4 h-4" /> Melhorias</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-4 md:grid-cols-4 text-xs font-mono uppercase">
            {Object.entries(audit?.composition || {}).map(([key, val]) => (
              <Card key={key} className="bg-card/40 border-white/5">
                <CardHeader className="py-2 px-4 text-[10px] text-muted-foreground">{key}</CardHeader>
                <CardContent className="py-2 px-4 text-xl font-bold text-white">{Number(val).toFixed(1)}/10</CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="modules">
          <Table className="bg-card/30 border border-white/5 rounded-lg">
            <TableHeader><TableRow className="border-white/5 uppercase text-[10px] text-muted-foreground"><TableHead>Módulo</TableHead><TableHead>Score</TableHead><TableHead>Ação</TableHead></TableRow></TableHeader>
            <TableBody>
              {audit?.modulesAudit.map((m: any) => (
                <TableRow key={m.key} className="border-white/5">
                  <TableCell className="font-mono text-blue-400">{m.key}</TableCell>
                  <TableCell className="flex gap-1 text-yellow-500">
                    {Array.from({length: Math.floor(m.score / 2)}).map((_,i) => <Star key={i} className="w-3 h-3 fill-yellow-500" />)}
                    <span className="text-white text-xs">{m.score}/10</span>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs italic">{m.recommendedAction || "Nenhuma ação"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="duplications">
           <Table className="bg-card/30 border border-white/5 rounded-lg">
             <TableHeader><TableRow className="border-white/5 uppercase text-[10px] text-muted-foreground"><TableHead>Regra</TableHead><TableHead>A</TableHead><TableHead>B</TableHead><TableHead>Sugestão</TableHead></TableRow></TableHeader>
             <TableBody>
               {audit?.duplications.map((d: any, i: number) => (
                 <TableRow key={i} className="border-white/5">
                   <TableCell className="text-white text-xs">{d.rule}</TableCell>
                   <TableCell className="font-mono text-blue-400 text-xs">{d.moduleA}</TableCell>
                   <TableCell className="font-mono text-blue-400 text-xs">{d.moduleB}</TableCell>
                   <TableCell className="text-muted-foreground text-xs italic">{d.suggestion}</TableCell>
                 </TableRow>
               ))}
             </TableBody>
           </Table>
        </TabsContent>

      </Tabs>
    </div>
  );
}
