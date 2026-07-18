import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/")({
  component: () => {
    const navigate = useNavigate();
    
    useEffect(() => {
      const timer = setTimeout(() => {
        navigate({ to: "/conversas" });
      }, 15000);
      return () => clearTimeout(timer);
    }, [navigate]);

    return (
      <div className="p-8 font-mono text-sm whitespace-pre-wrap">
        A Anthropic atualizou a linha de modelos — o mais recente do Sonnet agora é a versão 5 (model string "claude-sonnet-5"), substituindo o "claude-sonnet-4-5" que está no código hoje. O Haiku continua na versão 4.5.Antes de trocar a string no código, confirma via API real (GET /v1/models, ou uma chamada de teste simples) que "claude-sonnet-5" é um ID válido e respondendo normalmente no ambiente atual — não troca só baseado em nome, confirma que a chamada de teste realmente funciona.Depois de confirmar:1) Atualiza TODAS as ocorrências de "claude-sonnet-4-5" no código pra "claude-sonnet-5" (nos mesmos lugares que já mapeamos: linha 779, 785, 1539, 1584, e no tipo de retorno da função de roteamento)2) Mantém "claude-haiku-4-5" como está (ainda é a versão atual)TESTE DE VALIDAÇÃO:1) Roda bun run test:agent — se algum teste tiver o model ID antigo hardcoded como expectativa, atualiza o teste também2) Testa uma imagem real (Vision, que sempre usa Sonnet) e confirma que funciona normal com o novo model ID3) Testa o cenário de reengajamento (que também usa Sonnet) e confirma que continua funcionando4) Roda a suíte completaTraz a confirmação real da chamada de teste à API antes de aplicar a troca em massa — não aceito troca "porque devia funcionar", quero prova de que o novo ID responde de verdade no ambiente.
        
        Redirecionando para /conversas em 15 segundos...
      </div>
    );
  },
});
