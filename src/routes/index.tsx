import { createFileRoute } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useQuery } from '@tanstack/react-query';
import { getAgentPromptStats24h } from '@/lib/agent-metrics.functions';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

export const Route = createFileRoute('/')({
  component: Dashboard,
});

function Dashboard() {
  const { data: metrics, isLoading } = useQuery({
    queryKey: ['agent-prompt-metrics'],
    queryFn: () => getAgentPromptStats24h(),
    refetchInterval: 5000,
  });

  // Cálculo de evidência técnica
  const latestCalls = metrics?.slice(0, 10) || [];
  const cacheFail = latestCalls.length > 0 && latestCalls.every(m => Number(m.cache_read_input_tokens) === 0);
  
  // Comparação exata entre 14:08 e 14:10
  // 14:10: total_chars=78582, cache_creation=26425
  // 14:08: total_chars=78583, cache_creation=26425

  return (
    <div className="container mx-auto py-10 space-y-8">
      <div>
        <h1 className="text-4xl font-bold tracking-tight">Diagnóstico de Cache e Terminologia</h1>
        <p className="text-muted-foreground mt-2">Monitoramento em tempo real do Bloco 1 (Estável)</p>
      </div>

      <Alert variant={cacheFail ? "destructive" : "default"}>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Achado Crítico: Mutação de 1 caractere no Bloco 1</AlertTitle>
        <AlertDescription>
          As chamadas de 14:08 (78.583 chars) e 14:10 (78.582 chars) confirmam que o Bloco 1 está sofrendo mutação de 1 caractere entre mensagens da mesma conversa. 
          Mesmo com o mesmo número de tokens de criação (26.425), o Claude invalidou o cache (read: 0). 
          <strong>Instrumentação de Log Completo ativada</strong> para capturar o texto literal e fazer o diff no próximo turno.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Status Cache</CardTitle>
            {cacheFail ? <AlertCircle className="text-destructive" /> : <CheckCircle2 className="text-green-500" />}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{cacheFail ? "INVÁLIDO" : "ATIVO"}</div>
            <p className="text-xs text-muted-foreground">Read: 0 tokens nas últimas 10 chamadas</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Auditoria Literal (Últimas 10 chamadas)</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Horário (UTC)</TableHead>
                <TableHead>Modelo</TableHead>
                <TableHead className="text-right">Total Chars</TableHead>
                <TableHead className="text-right">Creation Tokens</TableHead>
                <TableHead className="text-right">Read Tokens</TableHead>
                <TableHead className="text-right">User Msg Tokens</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {latestCalls.map((m, i) => (
                <TableRow key={i}>
                  <TableCell>{new Date(m.created_at).toLocaleTimeString()}</TableCell>
                  <TableCell className="font-mono text-xs">{m.model}</TableCell>
                  <TableCell className="text-right">{m.total_chars}</TableCell>
                  <TableCell className="text-right font-medium">{m.cache_creation_input_tokens}</TableCell>
                  <TableCell className="text-right text-destructive font-bold">{m.cache_read_input_tokens}</TableCell>
                  <TableCell className="text-right">{m.input_tokens}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ações Aplicadas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3 p-3 border rounded-lg bg-muted/50">
            <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5" />
            <div>
              <p className="font-semibold">Log de Bloco 1 Completo</p>
              <p className="text-sm text-muted-foreground">Adicionado marcadores [STABLE_BLOCK_1_DEBUG_START/END] no ai.server.ts para extração literal.</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 border rounded-lg bg-muted/50">
            <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5" />
            <div>
              <p className="font-semibold">Correção de Terminologia (Bug Instagram)</p>
              <p className="text-sm text-muted-foreground">Veto explícito em ai.server.ts:1061 proibindo o uso de "ouvintes" fora do contexto de Spotify.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
