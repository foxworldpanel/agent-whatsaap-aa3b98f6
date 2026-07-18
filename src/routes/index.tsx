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
        Preciso do detalhamento REAL da chamada mais recente: primeira mensagem do contato 5511970116430 depois da limpeza de histórico, "Boa tarde" → "Boa tarde! 😊 Como posso te ajudar?", custou $0,07 segundo o relatado.

Isso é MUITO mais caro que o esperado — ontem uma saudação simples custou $0,0005, e essa chamada aqui é ainda mais cara que várias mensagens complexas de hoje sobre Spotify/plays.

Mostra os dados reais dessa chamada específica:
1) Modelo usado
2) input_tokens totais
3) cache_creation_input_tokens
4) cache_read_input_tokens
5) output_tokens
6) Quantos módulos foram selecionados pra essa mensagem (deveria ser só os essenciais, já que é uma saudação pura sem menção a nenhum serviço)
7) Confirma se o bug do regex /atras/i (que fizemos carregar módulo de suporte à toa em saudações) foi realmente corrigido, ou se ainda está causando módulo extra carregado sem necessidade

Não aplica correção ainda — só traz o detalhamento real pra eu entender de onde veio esse custo desproporcional.
        
        Redirecionando para /conversas em 15 segundos...
      </div>
    );
  },
});
