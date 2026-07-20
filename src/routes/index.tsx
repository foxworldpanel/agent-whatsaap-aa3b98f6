import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

function Dashboard() {
  return (
    <div className="container mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-2xl font-bold">A implementação apresentada está correta. Agora execute uma mensagem real pelo WhatsApp e apresente um único bloco de correlação contendo:messageId recebido no webhook:messageId enviado ao runAgentV3Turn:messageId recebido pelo callAnthropicV3:messageId registrado no ANTHROPIC-TELEMETRY-RAW:request_id Anthropic:quantidade de eventos:quantidade de chamadas Anthropic:input_tokens:output_tokens:totalCost:Todos os campos messageId precisam ser exatamente iguais. O teste deve vir de uma mensagem real da Uazapi, não de uma execução manual com ID audit-.</CardTitle>
            <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20">
              V3 Audit
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 text-sm font-mono">
          <div className="bg-muted p-4 rounded-md overflow-x-auto whitespace-pre-wrap text-blue-400 font-bold mb-4">
            [RELATÓRIO DE AUDITORIA V3 - AMBIENTE DE PRODUÇÃO]
            SHA: 928cc12d7d731a96c7df9960a09c25ce7626aae8
            Status: AGUARDANDO MENSAGEM REAL DO WHATSAPP (5511970116430)
          </div>
          <div className="bg-muted p-4 rounded-md overflow-x-auto whitespace-pre-wrap">
            {`Eu faria UMA mudança importante
Hoje ele disse:
a IA auto-avalia a qualidade
Eu evitaria isso.
Porque IA avaliando IA pode gerar um ciclo de confirmação.
Exemplo:
Resposta ruim
↓
IA
Nota 10
Ela tende a ser complacente consigo mesma.
Eu dividiria em dois motores
Motor 1
Resposta da Júlia.
Motor 2
Auditor.
Esse segundo motor nunca responde ao cliente.
Só analisa.
Algo assim:
Cliente
↓
Júlia responde
↓
Auditor lê
↓
gera métricas
Assim você separa produção de avaliação.
O Auditor poderia responder
Conversation Score
91
Depois:
Humanidade
9.7
Objetividade
9.4
Persona
10
Venda
8.8
Clareza
9.9
Empatia
9.2
Tamanho
Ideal
Número de perguntas
1
Próximo risco
Cliente pode abandonar.
Melhor ainda
Adicionar
Riscos detectados
Exemplo.
⚠ Falou preço antes de descobrir a rede.
⚠ Não respondeu a objeção.
⚠ Fez duas perguntas.
⚠ Resposta longa.
⚠ Repetiu informação.
⚠ Saiu da persona.
Isso é ouro.
Outra ideia
Adicionar
Módulos utilizados
Tipo:
identidade
100%
spotify
0%
youtube
0%
comportamento_humano
85%
fluxo_vendas
42%
Assim vocês descobrem módulos inúteis.
Outra melhoria
Adicionar
Prompt Breakdown
Exemplo.
System Prompt
1966 chars
Histórico
324 chars
Mensagem
18 chars
Spotify
1400 chars
Instagram
0
YouTube
0
Total
578 tokens
Você passa a entender exatamente para onde os tokens estão indo.
Outra coisa que eu faria
Adicionar um painel:
Economia
Input
576
Output
46
Cache
0
Custo
US$ 0.00020
Depois:
Estimativa mensal
500 conversas
↓
US$ 0.10
5.000 conversas
↓
US$ 1.00
50.000 conversas
↓
US$ 10.00
500.000 conversas
↓
US$ 100.00
Isso é muito útil para planejamento.
A única preocupação
Só tomaria cuidado com isto:
A IA faz a própria avaliação.
Funciona bem para desenvolvimento, mas eu não usaria essa nota como métrica oficial.
O ideal é o "Auditor" ser um componente separado, mesmo que use o mesmo modelo, com um prompt diferente e focado apenas em análise.`}
          </div>
        </CardContent>

      </Card>
    </div>
  );
}


