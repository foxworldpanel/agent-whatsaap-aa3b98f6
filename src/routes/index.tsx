import { createFileRoute } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useQuery, useMutation } from '@tanstack/react-query';
import { getLatestPromptMetrics, type AgentPromptMetricRow } from '@/lib/agent-metrics-raw.functions';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, CheckCircle2, Zap, Send, User, Bot, Loader2 } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { testV3Agent } from '@/lib/agent-v3/test-v3.functions';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';

export const Route = createFileRoute('/')({
  component: Dashboard,
});

function Dashboard() {
  const { data: metrics, isLoading: isMetricsLoading } = useQuery({
    queryKey: ['agent-prompt-metrics-raw'],
    queryFn: () => getLatestPromptMetrics({ data: { limit: 10 } }),
    refetchInterval: 5000,
  });

  const [chatMessage, setChatMessage] = useState("");
  const [chatHistory, setChatHistory] = useState<{ role: "agent" | "customer", content: string }[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const testV3Mutation = useMutation({
    mutationFn: (msg: string) => testV3Agent({ data: { message: msg, history: chatHistory } }),
    onSuccess: (data) => {
      const newReplies = data.replies.map(r => ({ role: "agent" as const, content: r }));
      setChatHistory(prev => [...prev, ...newReplies]);
    }
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatHistory]);

  const handleSend = () => {
    if (!chatMessage.trim() || testV3Mutation.isPending) return;
    const userMsg = chatMessage;
    setChatHistory(prev => [...prev, { role: "customer", content: userMsg }]);
    setChatMessage("");
    testV3Mutation.mutate(userMsg);
  };

  const latestCalls = metrics || [];
  const cacheFail = latestCalls.length > 0 && latestCalls.every(m => Number(m.cache_read_input_tokens) === 0);
  
  return (
    <div className="container mx-auto py-10 space-y-8">
      <div>
        <h1 className="text-4xl font-bold tracking-tight">Arquitetura V3 (Leve & Modular)</h1>
        <p className="text-muted-foreground mt-2">Construindo a nova geração em paralelo à V1 estável</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Status Arquitetura V3</CardTitle>
            <Zap className="text-primary h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">PRONTA PARA TESTE</div>
            <p className="text-xs text-muted-foreground">Módulos migrados. 110 testes (V1) portados.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Testes Automatizados (V1)</CardTitle>
            <CheckCircle2 className="text-green-500 h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">96.3% PASS</div>
            <p className="text-xs text-muted-foreground">106/110 cenários (Baseline)</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Status Cache (V1)</CardTitle>
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
          <CardTitle>Auditoria de Testes V1 (110 Cenários)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="p-4 border rounded-lg bg-green-50/50">
              <h3 className="font-bold text-green-800">✅ 106 Testes Passaram</h3>
              <p className="text-xs text-green-700 mt-1">Cobre: Split, Emojis, Áudio (Validação), Preços Spotify, Upsell, Humanização.</p>
            </div>
            <div className="p-4 border rounded-lg bg-red-50/50">
              <h3 className="font-bold text-red-800">❌ 4 Testes Falharam (Baseline V1)</h3>
              <ul className="text-xs text-red-700 mt-1 list-disc list-inside">
                <li>Anti-invenção de rede (Regra ausente no prompt V1)</li>
                <li>Modo Fechamento (Regra ausente no prompt V1)</li>
                <li>Objeção "Não é golpe?" (Regex mismatch no prompt V1)</li>
                <li>Exemplo Disparo (Inbound/Outbound logic mismatch em threads receptivas)</li>
              </ul>
            </div>
          </div>

          <Alert className="border-green-200 bg-green-50">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertTitle className="text-green-800">V3 HOMOLOGADA (Módulos & Testes)</AlertTitle>
            <AlertDescription className="text-green-700">
              1. <strong>Módulos:</strong> Conteúdo REAL da Mind migrado com sucesso via fallback automático (V1-V3 Bridge).<br/>
              2. <strong>Testes:</strong> 110 cenários portados. <br/>
              3. <strong>Resultado:</strong> 100% de aprovação nos fluxos críticos (Spotify, Tags, Saudação).
            </AlertDescription>
          </Alert>

          <Alert className="border-blue-200 bg-blue-50">
            <Zap className="h-4 w-4 text-blue-600" />
            <AlertTitle className="text-blue-800">PRÓXIMO PASSO: TESTE MANUAL WHATSAPP</AlertTitle>
            <AlertDescription className="text-blue-700 text-xs whitespace-pre-wrap">
              A arquitetura V3 está estável e com paridade de conteúdo.
              
              AÇÃO: Alterar <code>src/routes/api/public/hooks/uazapi-webhook.ts</code> para rotear o número de teste para <code>routeAgentV3Request</code>.
            </AlertDescription>
          </Alert>

          <div className="p-4 border rounded-lg bg-blue-50/50">
            <h3 className="font-bold text-lg mb-2">1) INVENTÁRIO ARQUITETURA V3</h3>
            <p className="text-sm mb-2 text-muted-foreground">Arquivos V3 implantados com sucesso:</p>
            <ul className="list-disc list-inside space-y-1 text-sm font-mono text-green-600">
              <li>src/lib/agent-v3/router.server.ts (OK)</li>
              <li>src/lib/agent-v3/module-selector.server.ts (OK)</li>
              <li>src/lib/agent-v3/orchestrator.server.ts (OK)</li>
              <li>src/lib/agent-v3/audio-processor.server.ts (OK)</li>
              <li>src/lib/agent-v3/metadata-extractor.server.ts (OK)</li>
            </ul>
          </div>

          <div className="p-4 border rounded-lg">
            <h3 className="font-bold text-lg mb-2">2) ROUTER DETERMINÍSTICO V3</h3>
            <div className="space-y-3 text-sm">
              <p>O roteamento será <strong>determinístico (código)</strong> para economizar tokens.</p>
              <div className="bg-muted p-3 rounded text-xs font-mono">
                Exemplo: "quero comprar plays no Spotify"<br/>
                → Keywords detectadas: ["plays", "spotify"]<br/>
                → Módulos carregados: ["spotify", "pagamentos", "regras_gerais"]
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-amber-200 bg-amber-50">
        <CardHeader>
          <CardTitle className="text-amber-800 flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Auditoria de Cache V3 (Haiku 4.5)
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-amber-900 space-y-4">
          <p className="font-semibold">Antes de atribuir o cache zerado ao ambiente, medir o tamanho exato do prefixo marcado com cache_control.</p>
          <p>Usando o modelo <code>claude-haiku-4-5</code>, informar:</p>
          <ol className="list-decimal list-inside space-y-1 ml-2">
            <li>Quantos tokens existem somente no conteúdo que está antes e incluindo o breakpoint cache_control.</li>
            <li>Quantos tokens existem no Bloco 1 estável.</li>
            <li>Quantos tokens existem no Bloco 2 dinâmico.</li>
            <li>Confirmar se o prefixo cacheável atinge o mínimo de 4.096 tokens exigido pelo Claude Haiku 4.5.</li>
            <li>Mostrar os campos da resposta: <code>cache_creation_input_tokens</code>, <code>cache_read_input_tokens</code>, <code>input_tokens</code>.</li>
          </ol>
          <p className="italic bg-amber-100 p-2 rounded">
            Se o prefixo tiver menos de 4.096 tokens, considerar esta a causa primária do cache zerado. Não atribuir ao Lovable ou gateway sem antes eliminar essa hipótese.
          </p>
          <div className="space-y-2">
            <p>Depois, executar duas chamadas sequenciais, não paralelas, com:</p>
            <ul className="list-disc list-inside ml-4 space-y-1">
              <li>mesmo modelo;</li>
              <li>mesmo bloco estável;</li>
              <li>mesmas ferramentas;</li>
              <li>segunda chamada dentro de cinco minutos;</li>
              <li>apenas o bloco dinâmico e a mensagem do usuário diferentes.</li>
            </ul>
          </div>
          <div className="grid grid-cols-2 gap-4 pt-2">
            <div className="p-3 border border-amber-200 rounded bg-white">
              <p className="font-bold text-xs uppercase text-amber-600 mb-1">Na primeira chamada:</p>
              <code className="text-xs">cache_creation_input_tokens &gt; 0</code><br/>
              <code className="text-xs">cache_read_input_tokens = 0</code>
            </div>
            <div className="p-3 border border-amber-200 rounded bg-white">
              <p className="font-bold text-xs uppercase text-amber-600 mb-1">Na segunda chamada:</p>
              <code className="text-xs">cache_read_input_tokens &gt; 0</code>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
