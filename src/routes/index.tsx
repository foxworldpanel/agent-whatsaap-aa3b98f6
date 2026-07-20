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
          <div className="bg-muted p-4 rounded-md overflow-x-auto whitespace-pre-wrap">
            A implementação apresentada está correta. Agora execute uma mensagem real pelo WhatsApp e apresente um único bloco de correlação contendo:messageId recebido no webhook:messageId enviado ao runAgentV3Turn:messageId recebido pelo callAnthropicV3:messageId registrado no ANTHROPIC-TELEMETRY-RAW:request_id Anthropic:quantidade de eventos:quantidade de chamadas Anthropic:input_tokens:output_tokens:totalCost:Todos os campos messageId precisam ser exatamente iguais. O teste deve vir de uma mensagem real da Uazapi, não de uma execução manual com ID audit-.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


