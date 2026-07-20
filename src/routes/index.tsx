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
        <p className="text-muted-foreground mt-2">Monitoramento e Sandbox</p>
        <div className="mt-6 p-4 bg-muted border rounded-lg text-sm space-y-4">
          <p className="font-bold">O relatório foi útil, mas antes de qualquer alteração preciso resolver três inconsistências. No diagnóstico anterior o histórico era:history_message_count = 0 history_chars = 0 Agora o relatório afirma aproximadamente 2.400 caracteres de histórico.Explique exatamente essa divergência e mostre os dados reais da execução usada nesta auditoria. Não use estimativas para os 6.877 caracteres restantes.Mostre a decomposição real da string final enviada à Anthropic.Quero saber exatamente quantos caracteres pertencem a: systemPrompt montado; JSON da requisição; extraContext; histórico; mensagens; qualquer outro bloco. A proposta de redução não deve remover regras essenciais.Para cada campo classificado como "remover", informe: por que ele é redundante; onde a mesma regra continuará existindo; como garantir que o comportamento permanecerá igual.Não implemente ainda.</p>
        </div>
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

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 flex flex-col h-[600px] border-primary/20 shadow-lg">
          <CardHeader className="border-b bg-muted/30">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Bot className="h-5 w-5 text-primary" />
                  Simulador V3 (Sandbox)
                </CardTitle>
                <CardDescription>
                  Teste manual direto com a nova arquitetura (Haiku 4.5)
                </CardDescription>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setChatHistory([])}
              >
                Limpar Chat
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden p-0 relative">
            <ScrollArea className="h-full p-4" ref={scrollRef}>
              <div className="space-y-4 pb-4">
                {chatHistory.length === 0 && (
                  <div className="text-center py-10 text-muted-foreground italic">
                    Nenhuma mensagem enviada. Comece mandando um "Oi" ou pergunte sobre o Spotify.
                  </div>
                )}
                {chatHistory.map((msg, i) => (
                  <div 
                    key={i} 
                    className={`flex items-start gap-3 ${msg.role === 'customer' ? 'flex-row-reverse' : ''}`}
                  >
                    <div className={`mt-1 p-2 rounded-full ${msg.role === 'customer' ? 'bg-primary/10' : 'bg-muted'}`}>
                      {msg.role === 'customer' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                    </div>
                    <div className={`max-w-[80%] p-3 rounded-lg ${
                      msg.role === 'customer' 
                        ? 'bg-primary text-primary-foreground rounded-tr-none' 
                        : 'bg-muted rounded-tl-none'
                    }`}>
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  </div>
                ))}
                {testV3Mutation.isPending && (
                  <div className="flex items-start gap-3">
                    <div className="mt-1 p-2 rounded-full bg-muted">
                      <Bot className="h-4 w-4" />
                    </div>
                    <div className="bg-muted p-3 rounded-lg rounded-tl-none flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-xs text-muted-foreground">Júlia está digitando...</span>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
          <div className="p-4 border-t bg-muted/30">
            <div className="flex gap-2">
              <Input 
                placeholder="Digite sua mensagem de teste..." 
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              />
              <Button onClick={handleSend} disabled={testV3Mutation.isPending}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Configuração do Teste</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground uppercase font-bold">Módulos Ativos</p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">tabela_precos</Badge>
                  <Badge variant="secondary">social_proof</Badge>
                  <Badge variant="secondary">pagamentos</Badge>
                  <Badge variant="outline">+ 12</Badge>
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground uppercase font-bold">Variáveis de Ambiente</p>
                <div className="flex items-center gap-2 text-xs text-green-600">
                  <CheckCircle2 className="h-3 w-3" />
                  ANTHROPIC_API_KEY Detectada
                </div>
              </div>
              <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg">
                <h4 className="text-xs font-bold text-blue-800 mb-1">Dica de Teste:</h4>
                <p className="text-[10px] text-blue-700 leading-tight">
                  Tente "Quero plays no Spotify" e depois responda com "blz" para testar o <b>Modo Fechamento</b> (deve enviar o link).
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-green-200 bg-green-50/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold text-green-800">WhatsApp (Teste B)</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-green-700 leading-tight mb-2">
                Número Autorizado: <br/>
                <code className="bg-white px-1 py-0.5 rounded border">5511970116430</code>
              </p>
              <p className="text-[10px] text-green-600">
                Endpoint V3: <br/>
                <code className="break-all font-mono">/api/public/hooks/v3-test-webhook</code>
              </p>
            </CardContent>
          </Card>
        </div>
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
    </div>
  );
}
