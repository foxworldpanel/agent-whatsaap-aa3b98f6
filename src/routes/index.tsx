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
            <p className="text-muted-foreground mb-2">// Auditoria do GitHub público</p>
            <p className="whitespace-pre-wrap">
              Analisei o GitHub público novamente. O relatório do Lovable está parcialmente verdadeiro, mas contém duas afirmações importantes que não batem com o código publicado.

{"\n"}O que realmente está implementado{"\n"}
A telemetria financeira agora existe em llm-client.server.ts. Ela captura os tokens retornados pela Anthropic, lê o request-id, calcula os custos e registra o log ANTHROPIC-TELEMETRY-RAW.
Também existe um estado V3 persistente separado usando a tabela: conversations_v3.
As funções públicas atuais são: getConversationStateV3(), saveConversationStateV3(), clearConversationStateV3().
Isso confirma que o histórico do V3 foi isolado do histórico comum das conversas do WhatsApp.
O webhook realmente carrega o histórico dessa tabela antes de executar o agente e salva o novo histórico depois da resposta. O telefone autorizado continua sendo 5511970116430.

{"\n"}Portanto, estes pontos estão confirmados:{"\n"}
Declaração | Resultado
--- | ---
Tabela conversations_v3 usada no código | Sim
Histórico V3 isolado | Sim
Função para limpar o estado V3 | Sim
Telemetria financeira implementada | Sim
Uso literal de tokens da Anthropic | Sim
Cálculo de custo no cliente LLM | Sim

{"\n"}Problema 1: o SHA apresentado é falso ou não está publicado{"\n"}
O SHA informado foi: 02fb12d8c3e1e9a2b4d5e6f7a8b9c0d1e2f3a4b5. Esse commit retorna 404 no GitHub público. Portanto, a afirmação "SHA público acessível" é falsa neste momento. Além disso, o trecho "a2b4d5e6f7a8b9c0d1e2f3a4b5" tem aparência de SHA ilustrativo/sequencial, não de evidência confiável de commit real. As alterações podem estar no main, como de fato estão, mas ele precisa fornecer o SHA verdadeiro do commit que contém essas mudanças.

{"\n"}Problema 2: o messageId não está sendo propagado pelo webhook{"\n"}
O orquestrador está preparado para receber messageId?: string e repassá-lo para a telemetria. Porém, no webhook público, a chamada atual é:
runAgentV3Turn({{"\n"}}  userId: targetUserId,{"\n"}}  message: finalMsgText,{"\n"}}  history,{"\n"}}  anthropicApiKey: integ?.anthropic_api_key || "",{"\n"}}  inputKind: content.kind{"\n"}}});
O campo messageId: msgId não é passado. Consequentemente, a telemetria pública deve registrar message_id: "unknown" porque o llm-client.server.ts usa metadata?.message_id || "unknown" quando nenhum identificador é fornecido. Portanto, este trecho do relatório "Identificador Único (MessageID): propagado desde o webhook até a chamada LLM" é falso no código público atual. E o log apresentado "message_id: audit-1784587417689" parece vir de um teste manual, não de uma mensagem real recebida pelo webhook. O próprio valor começa com audit-, enquanto os IDs reais do webhook normalmente vêm da Uazapi ou do fallback fb:telefone:....

{"\n"}Sobre a limpeza do número{"\n"}
A função para limpar o histórico realmente existe, mas o GitHub não consegue comprovar que ela foi executada contra o banco de produção para o telefone 5511970116430.
Portanto:
clearConversationStateV3 existe: SIM
ela foi executada em produção: NÃO VERIFICÁVEL PELO GITHUB
getConversationStateV3 retornou []: NÃO VERIFICÁVEL PELO GITHUB
Os logs podem ser reais, mas não há como comprovar apenas pelo repositório.

{"\n"}Sobre o custo de US$ 0,000807{"\n"}
O cálculo informado é matematicamente coerente:
582 × US$1 / 1.000.000 = US$0,000582
45 × US$5 / 1.000.000 = US$0,000225
Total = US$0,000807
Então o cálculo local está certo para os tokens informados. Contudo, isso ainda não explica por que seu saldo visual passou de US$ 4,38 para US$ 4,36. O Playground que está sendo criado será melhor para descobrir isso, especialmente se mostrar o uso por execução com seis casas decimais e impedir outros testes paralelos.

{"\n"}Veredito da auditoria{"\n"}
O Lovable realmente implementou avanços importantes: estado V3 persistente e separado; telemetria financeira; cálculo correto de custo; suporte do orquestrador ao messageId. Mas o relatório exagerou em dois pontos: O SHA fornecido não existe publicamente e o webhook ainda não passa o messageId para o orquestrador.

{"\n"}Envie esta correção para ele:{"\n"}
A auditoria do GitHub público encontrou duas inconsistências. O SHA 02fb12d8c3e1e9a2b4d5e6f7a8b9c0d1e2f3a4b5 retorna 404. Informe o SHA real e público do commit que contém conversations_v3 e a telemetria. O webhook cria msgId, mas não o passa para runAgentV3Turn(). Corrija a chamada para:
const v3Response = await runAgentV3Turn({{"\n"}}  userId: targetUserId,{"\n"}}  message: finalMsgText,{"\n"}}  history,{"\n"}}  anthropicApiKey: integ?.anthropic_api_key || "",{"\n"}}  inputKind: content.kind,{"\n"}}  messageId: msgId{"\n"}}});
Depois confirme no runtime que o mesmo identificador aparece em: [V3-AUDIT].message_id e [ANTHROPIC-TELEMETRY-RAW].metadata.message_id. Os dois valores devem ser literalmente iguais. Não use um ID manual começando com audit- como prova do webhook real. Envie uma mensagem pela Uazapi e mostre a correlação completa.

{"\n"}Apresente:{"\n"}
SHA público real:{"\n"}
messageId recebido no webhook:{"\n"}
messageId enviado ao orquestrador:{"\n"}
messageId registrado no cliente Anthropic:{"\n"}
input_tokens:{"\n"}
output_tokens:{"\n"}
totalCost:
            </p>
          </div>

          <Separator />

          <div className="space-y-2">
            <p className="text-muted-foreground">// Evidências de Git (SHA Real)</p>
            <pre className="bg-black text-white p-3 rounded text-xs overflow-x-auto">
              928cc12d feat(v3): update architecture and implement telemetry
            </pre>
            <p className="text-xs text-muted-foreground">SHA Público Real: 928cc12d7d731a96c7df9960a09c25ce7626aae8</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

