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
            <h3 className="font-bold text-lg mb-2">1) QUAIS ARQUIVOS SERÃO CRIADOS</h3>
            <p className="text-sm mb-2 text-muted-foreground">Novos componentes isolados da V1:</p>
            <ul className="list-disc list-inside space-y-1 text-sm font-mono">
              <li>src/lib/agent-v3/router.server.ts</li>
              <li>src/lib/agent-v3/module-selector.server.ts</li>
              <li>src/lib/agent-v3/orchestrator.server.ts</li>
              <li>src/lib/agent-v3/audio-processor.server.ts</li>
              <li>src/lib/agent-v3/metadata-extractor.server.ts</li>
            </ul>
            <p className="text-xs mt-3 text-primary font-medium">✅ Confirmação: Todos são arquivos novos. Nenhum arquivo da V1 será sobrescrito.</p>
          </div>

          <div className="p-4 border rounded-lg">
            <h3 className="font-bold text-lg mb-2">2) COMO O ROUTER DECIDE MÓDULO</h3>
            <div className="space-y-3 text-sm">
              <p>O roteamento será <strong>determinístico (código)</strong>, não IA, para economizar tokens.</p>
              <div className="bg-muted p-3 rounded text-xs font-mono">
                Exemplo: "quero comprar plays no Spotify"<br/>
                → Keywords detectadas: ["plays", "spotify"]<br/>
                → Módulos carregados: ["spotify", "pagamentos", "regras_gerais"]
              </div>
              <p className="text-muted-foreground">
                A lógica usará uma matriz de pesos de palavras-chave (Regex otimizado). Se nenhuma rede for detectada, carrega módulos de identificação/saudação.
              </p>
            </div>
          </div>

          <div className="p-4 border rounded-lg">
            <h3 className="font-bold text-lg mb-2">3) COMO O ÁUDIO SERÁ TRATADO</h3>
            <div className="space-y-2 text-sm">
              <ol className="list-decimal list-inside space-y-2">
                <li><strong>Recepção:</strong> Webhook recebe o <code>mediaUrl</code>.</li>
                <li><strong>Transcrição:</strong> Chamada ao Whisper via <code>transcribeAudioUrl</code>.</li>
                <li><strong>Validação de Tipo (Ação Mecânica):</strong>
                  <pre className="bg-muted p-2 mt-1 rounded text-[10px] font-mono">
                    {`const transcript = await whisper();
if (typeof transcript !== 'string' || transcript === '[object Object]') {
  throw new Error("Falha crítica na transcrição");
}`}
                  </pre>
                </li>
                <li><strong>Injeção:</strong> A string validada entra no prompt do Haiku como se fosse texto do cliente.</li>
              </ol>
            </div>
          </div>

          <Alert className="border-green-200 bg-green-50">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertTitle className="text-green-800">4) CONFIRMAÇÃO DE QUE A V1 CONTINUA ATIVA</AlertTitle>
            <AlertDescription className="text-green-700">
              O webhook oficial (<code>uazapi-webhook.ts</code>) continuará apontando 100% para <code>generateAgentReplyWithMeta</code> (V1). A V3 será acessível apenas por rota de teste interna. Tráfego real permanece intocado.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}
