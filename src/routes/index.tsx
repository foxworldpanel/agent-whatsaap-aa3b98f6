import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle, AlertCircle, Database, Code } from "lucide-react";
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

  if (isLoading) return <div className="p-8 text-white">Carregando auditoria...</div>;

  return (
    <div className="container mx-auto p-6 space-y-8">
      <div className="flex flex-col space-y-2">
        <div className="flex items-center gap-2">
          <h1 className="text-3xl font-bold tracking-tight text-white uppercase">INICIAR REVISÃO TÉCNICA E DE CONTEÚDO DO AGENTE V3</h1>
        </div>
        <div className="bg-card/50 p-6 rounded-lg border border-white/5 space-y-4">
          <p className="text-white font-bold">Objetivos desta etapa:</p>
          <ol className="list-decimal list-inside text-muted-foreground space-y-1 ml-4">
            <li>revisar individualmente os 20 módulos do CMS;</li>
            <li>encontrar duplicações, contradições e conteúdo fraco;</li>
            <li>verificar se o seletor carrega somente os módulos necessários;</li>
            <li>validar definitivamente métricas, custos, tokens, latência e persistência.</li>
          </ol>
          <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-md">
            <p className="text-yellow-500 font-bold mb-2 text-sm uppercase">IMPORTANTE</p>
            <p className="text-sm text-yellow-500/80 leading-relaxed">
              Nesta primeira execução, <strong>NÃO</strong> reescrever automaticamente os módulos.
              Primeiro gerar o diagnóstico completo e mostrar o conteúdo existente. Não inventar regras, preços, prazos ou garantias.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-12">
        <section className="space-y-4">
          <h2 className="text-xl font-mono text-blue-400 border-b border-blue-400/20 pb-2">ETAPA 1 — EXTRAIR OS 20 MÓDULOS</h2>
          <Card className="bg-card/50 border-white/5">
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/5">
                    <TableHead>key</TableHead>
                    <TableHead>title</TableHead>
                    <TableHead>enabled</TableHead>
                    <TableHead>content_length</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {audit?.modulesList.map((m) => (
                    <TableRow key={m.key} className="border-white/5">
                      <TableCell className="font-mono text-blue-400">{m.key}</TableCell>
                      <TableCell>{m.title}</TableCell>
                      <TableCell>{m.enabled ? "SIM" : "NÃO"}</TableCell>
                      <TableCell>{m.content_length}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
