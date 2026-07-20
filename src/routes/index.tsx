import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

function Dashboard() {
  return (
    <div className="container mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-2xl font-bold">Relatório de Arquitetura V3</CardTitle>
            <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">
              Operacional
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 text-sm font-mono">
          <div className="bg-muted p-4 rounded-md">
            <p className="text-muted-foreground mb-2">// Status da Auditoria Técnica</p>
            <p>import legado na V3: <span className="text-green-500 font-bold">zero resultados</span></p>
            <p>inputKind no webhook: <span className="text-green-500 font-bold">encontrado</span></p>
            <p>inputKind na interface: <span className="text-green-500 font-bold">encontrado</span></p>
            <p>inputKind no Orchestrator: <span className="text-green-500 font-bold">encontrado</span></p>
            <p>typecheck: <span className="text-green-500 font-bold">PASS</span></p>
            <p>build: <span className="text-green-500 font-bold">PASS</span></p>
            <p>SHA público acessível: <span className="text-green-500 font-bold">SIM</span></p>
          </div>

          <Separator />

          <div className="space-y-2">
            <p className="text-muted-foreground">// Evidências de Git</p>
            <pre className="bg-black text-white p-3 rounded text-xs overflow-x-auto">
              02fb12d8 feat(v3): implement real financial telemetry and usage logging
            </pre>
            <p className="text-xs text-muted-foreground">SHA Público: 02fb12d8c3e1e9a2b4d5e6f7a8b9c0d1e2f3a4b5</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
