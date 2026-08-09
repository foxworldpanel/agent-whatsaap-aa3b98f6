import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, CheckCircle2, Database, RefreshCw } from "lucide-react";
import { getSchemaAudit } from "@/lib/schema-audit.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/diagnosticos")({
  component: DiagnosticosPage,
});

function DiagnosticosPage() {
  const fetchAudit = useServerFn(getSchemaAudit);
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["schema-audit"],
    queryFn: () => fetchAudit(),
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-lg font-bold uppercase tracking-widest text-muted-foreground">Verificando schema do banco...</p>
      </div>
    );
  }

  const tabelasAusentes = data?.tabelas_ausentes || [];

  return (
    <div className="container mx-auto p-6 space-y-8">
      <div className="flex justify-between items-center border-b border-border pb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-500/10 rounded-lg">
            <Database className="w-8 h-8 text-blue-500" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight uppercase flex items-center gap-2">
              Diagnósticos de Schema
              <Badge variant="outline" className="text-[10px] font-mono border-blue-500/50 text-blue-400">AO VIVO</Badge>
            </h1>
            <p className="text-muted-foreground text-sm">
              Consulta ao vivo do banco real — não depende de ninguém colar resultado de query aqui.
              Mostra se as {data?.total_tabelas_esperadas ?? 0} tabelas que o código usa hoje realmente existem, coluna por coluna.
            </p>
          </div>
        </div>
        <Button onClick={() => refetch()} disabled={isFetching} variant="outline" size="sm" className="gap-2">
          <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
          Atualizar agora
        </Button>
      </div>

      <Card className={tabelasAusentes.length > 0 ? "bg-red-500/5 border-red-500/20" : "bg-green-500/5 border-green-500/20"}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm uppercase">
            {tabelasAusentes.length > 0 ? (
              <><AlertTriangle className="w-5 h-5 text-red-500" /> {tabelasAusentes.length} tabela(s) usada(s) pelo código mas ausente(s) no banco</>
            ) : (
              <><CheckCircle2 className="w-5 h-5 text-green-500" /> Todas as tabelas que o código espera existem no banco</>
            )}
          </CardTitle>
        </CardHeader>
        {tabelasAusentes.length > 0 && (
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {tabelasAusentes.map((t: string) => (
                <Badge key={t} variant="destructive" className="font-mono">{t}</Badge>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Se algum código escreve/lê nessas tabelas sem tratamento de erro, isso vai quebrar em produção
              (foi exatamente esse tipo de problema que causou o bug do funil corrigido em 09/08/2026).
            </p>
          </CardContent>
        )}
      </Card>

      <div className="space-y-4">
        {(data?.tabelas || []).map((tabela: any) => (
          <Card key={tabela.table_name}>
            <CardHeader className="py-3">
              <CardTitle className="text-sm font-mono">{tabela.table_name}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Coluna</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Aceita nulo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tabela.columns.map((col: any) => (
                    <TableRow key={col.column_name}>
                      <TableCell className="font-mono text-xs">{col.column_name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{col.data_type}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{col.is_nullable}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
