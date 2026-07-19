import { createFileRoute } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useQuery } from '@tanstack/react-query';
import { getLatestPromptMetrics, type AgentPromptMetricRow } from '@/lib/agent-metrics-raw.functions';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, CheckCircle2, Zap } from 'lucide-react';

export const Route = createFileRoute('/')({
  component: Dashboard,
});

function Dashboard() {
  const { data: metrics, isLoading } = useQuery({
    queryKey: ['agent-prompt-metrics-raw'],
    queryFn: () => getLatestPromptMetrics({ data: { limit: 10 } }),
    refetchInterval: 5000,
  });

  const latestCalls = metrics || [];
  const cacheFail = latestCalls.length > 0 && latestCalls.every(m => Number(m.cache_read_input_tokens) === 0);
  
  return (
    <div className="container mx-auto py-10 space-y-8">
      <div>
        <h1 className="text-4xl font-bold tracking-tight">Arquitetura V3 (Leve & Modular)</h1>
        <p className="text-muted-foreground mt-2">Construindo a nova geração em paralelo à V1 estável</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Fase Atual: Planejamento V3</CardTitle>
            <Zap className="text-primary h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">100% Paralelo</div>
            <p className="text-xs text-muted-foreground">V1 intocada e respondendo normalmente.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Status Cache</CardTitle>
            {cacheFail ? <AlertCircle className="text-destructive h-4 w-4" /> : <CheckCircle2 className="text-green-500 h-4 w-4" />}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{cacheFail ? "INVÁLIDO" : "ATIVO"}</div>
            <p className="text-xs text-muted-foreground">Monitorando mutação no Bloco 1</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Lead Temperature</CardTitle>
            <CheckCircle2 className="text-green-500 h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">In-Response</div>
            <p className="text-xs text-muted-foreground">Extraído via marcador [TEMP:...]</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Métricas em Tempo Real (Últimas 10 chamadas)</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Horário (UTC)</TableHead>
                <TableHead>Modelo</TableHead>
                <TableHead className="text-right">Creation Tokens</TableHead>
                <TableHead className="text-right">Read Tokens</TableHead>
                <TableHead className="text-right">Out Tokens</TableHead>
                <TableHead className="text-right">Response Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {latestCalls.map((m: AgentPromptMetricRow, i: number) => (
                <TableRow key={i}>
                  <TableCell>{new Date(m.created_at).toLocaleTimeString()}</TableCell>
                  <TableCell className="font-mono text-xs">{m.model}</TableCell>
                  <TableCell className="text-right font-medium">{m.cache_creation_input_tokens || m.input_tokens}</TableCell>
                  <TableCell className="text-right text-destructive font-bold">{m.cache_read_input_tokens}</TableCell>
                  <TableCell className="text-right">{m.output_tokens}</TableCell>
                  <TableCell className="text-right">{m.duration_ms}ms</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Plano de Reconstrução Segura (V3)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="p-4 border rounded-lg bg-blue-50/50">
            <h3 className="font-bold text-lg mb-2">Arquivos que serão criados (NOVOS)</h3>
            <ul className="list-disc list-inside space-y-1 text-sm">
              <li><code>src/lib/agent-v3/router.server.ts</code> (Router determinístico)</li>
              <li><code>src/lib/agent-v3/orchestrator.server.ts</code> (Montagem de prompt sob demanda)</li>
              <li><code>src/lib/agent-v3/audio-processor.server.ts</code> (Whisper + validação de string)</li>
              <li><code>src/lib/agent-v3/metadata-extractor.server.ts</code> (JSON parsing da resposta)</li>
            </ul>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="p-4 border rounded-lg">
              <h4 className="font-semibold mb-2">Router Determinístico</h4>
              <p className="text-sm text-muted-foreground">
                Decide quais módulos carregar via <code>agent_config.modules</code> usando keywords e contexto da última mensagem, reduzindo o prompt fixo em ~80%.
              </p>
            </div>
            <div className="p-4 border rounded-lg">
              <h4 className="font-semibold mb-2">Tratamento de Áudio</h4>
              <p className="text-sm text-muted-foreground">
                Whisper transcreve → validação rigorosa (<code>typeof === 'string'</code>) → injeta transcrição no fluxo Haiku. Corrige o bug de <code>[object Object]</code>.
              </p>
            </div>
          </div>

          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>Garantia de Estabilidade</AlertTitle>
            <AlertDescription>
              A V1 continua ativa e intocada em <code>src/lib/ai.server.ts</code>. A troca só ocorrerá após validação de 110 testes e 6 cenários manuais críticos.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}
