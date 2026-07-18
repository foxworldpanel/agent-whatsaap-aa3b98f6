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
        Preciso confirmar se o custo de $0,04 dessa segunda chamada (contato 5511970116430, "quero comprar plays", por volta das 16:05) foi por causa do cache ter EXPIRADO (mais de 5 minutos desde a mensagem anterior das 15:59 — o cache ephemeral da Anthropic dura só 5 min), ou se é outra causa.Mostra os dados reais dessa chamada específica:- cache_creation_input_tokens- cache_read_input_tokens- Calcula o intervalo exato de tempo entre a mensagem anterior (15:59:57) e essa (16:05) Se o intervalo for maior que 5 minutos, confirma que é o comportamento NORMAL/ESPERADO do cache expirando (não é bug) — nesse caso, o "problema" não é técnico, é que conversas com intervalo maior que 5 min entre mensagens sempre vão pagar o preço de recriar o cache, e isso é uma limitação da própria Anthropic (TTL de 5 min no cache ephemeral), não algo que dá pra corrigir no nosso código.Se o intervalo for MENOR que 5 minutos e mesmo assim não teve cache_read, aí sim é bug real — investiga por que o cache não foi reaproveitado dentro da janela válida.
        
        Redirecionando para /conversas em 15 segundos...
      </div>
    );
  },
});
