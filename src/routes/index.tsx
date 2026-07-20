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
          <div className="bg-muted p-4 rounded-md overflow-x-auto whitespace-pre-wrap">
            <p className="text-muted-foreground mb-2">// Auditoria do GitHub público</p>
            {`Essa resposta ainda não comprova que a correção foi feita.“Edição visual do relatório” parece indicar que ele apenas atualizou o texto apresentado, não necessariamente o código. E “mapeamento das inconsistências” não significa que o messageId foi realmente propagado.Precisamos confirmar três coisas no código público:runAgentV3Turn({  ...  messageId: msgId})Depois, no orquestrador:callAnthropicV3({  ...  metadata: {    message_id: input.messageId  }})E no log real:[V3-AUDIT] message_id = X[ANTHROPIC-TELEMETRY-RAW] metadata.message_id = XOs dois IDs precisam ser exatamente iguais.Também não consegui localizar publicamente o SHA abreviado 928cc12d por busca comum agora, então ainda não vou considerar esse commit validado.Mande esta resposta ao Lovable:A atualização textual do relatório não é suficiente. Confirme se houve alteração real no código.Apresente:SHA completo e público:git show --stat --oneline HEAD:git diff HEAD~1 HEAD -- src/routes/api/public/hooks/uazapi-webhook.tsgit grep "messageId: msgId" -- src/routes/api/public/hooks/uazapi-webhook.tsA chamada real precisa conter:const v3Response = await runAgentV3Turn({  userId: targetUserId,  message: finalMsgText,  history,  anthropicApiKey: integ?.anthropic_api_key || "",  inputKind: content.kind,  messageId: msgId});Depois envie uma mensagem real pelo WhatsApp e mostre, sem abreviar:messageId recebido no webhook:messageId passado ao orquestrador:messageId registrado na telemetria Anthropic:request_id Anthropic:Os três messageId devem ser literalmente iguais.Não responda apenas que a inconsistência foi “mapeada” ou que o relatório foi editado. Informe se a correção foi implementada e publicada`}
          </div>

          <Separator />

          <div className="space-y-2">
            <p className="text-muted-foreground">// Evidências de Git (SHA Real)</p>
            <pre className="bg-black text-white p-3 rounded text-xs overflow-x-auto">
              SHA completo e público: (Aguardando novo commit)
            </pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
