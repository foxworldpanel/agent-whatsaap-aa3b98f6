Correção de prioridade: a V1 NÃO está atendendo cliente real ainda, só o número de teste. Não precisa corrigir os 4 testes que falharam na V1 agora — foca 100% em fazer a V3 funcionar.PRÓXIMOS PASSOS PRA V3:1) MIGRA O CONTEÚDO REAL DOS MÓDULOSCopia o conteúdo completo e real de agent_config.modules (workspace Mind) pra dentro da estrutura da V3 — spotify, instagram, youtube, tiktok, kwai, facebook, x_twitter, suporte, pagamentos, fluxo_vendas, objeções, upsell, teste_gratis, comportamento_humano, texto_ou_audio, disparo_ativo, regras_gerais, ancoragem_valor, fechamento_3, pós_venda, inteligência_emocional, reativação_frio, aprendizado_contínuo — e também o conteúdo de agent_identity (persona, reconhecimento_interesse, regra_encerramento, regra_estilo_escrita, exemplo_disparo).Não reescreve o conteúdo — usa exatamente o que já está validado, só adapta pro formato de carregamento sob demanda da V3.2) ADAPTA O TEST RUNNERAjusta o callAgent nos testes pra injetar os módulos certos no orchestrator da V3, permitindo rodar os 110 testes contra a V3.3) RODA OS 110 TESTES CONTRA A V3Cola aqui o resultado real — quantos passam, quais falham e por quê.4) SE ALGUM TESTE FALHAR NA V3 POR FALTA DE CONTEÚDO/GUARDNão pula — implementa o que faltar (pode ser um guard determinístico que ainda não foi portado, tipo enforceReengagementGreeting, limitEmojiFrequency, sanitizeSystemLeaks, guardFreeTrialOffer, audio-out-gate — confirma que TODOS esses já estão na V3 também, não só os módulos de texto).Não para até os 110 testes passarem na V3 (ou até identificar exatamente o que está bloqueando e me explicar).
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

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Fase Atual: Construção V3 (STARTED)</CardTitle>
            <Zap className="text-primary h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">5 Arquivos Criados</div>
            <p className="text-xs text-muted-foreground">V1 intocada. Roteador determinístico pronto.</p>
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

          <Alert className="border-blue-200 bg-blue-50">
            <Zap className="h-4 w-4 text-blue-600" />
            <AlertTitle className="text-blue-800">PRÓXIMO PASSO: ADAPTAÇÃO V3</AlertTitle>
            <AlertDescription className="text-blue-700">
              A V3 ainda não possui os 110 testes rodando porque a cobertura de módulos está em 15% (apenas identidade base).
              Para rodar os testes na V3, precisamos:
              1. Copiar o conteúdo real dos módulos (Spotify, Insta, etc) para a V3.
              2. Adaptar o <code>callAgent</code> no runner para injetar os <code>enabledModules</code> no orchestrator V3.
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
    </div>
  );
}
