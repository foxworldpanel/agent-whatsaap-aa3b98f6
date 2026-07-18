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
        Preciso confirmar se o custo de $0,04 dessa chamada específica ("1 música, qual valor?" → resposta sobre os 2 pacotes) foi por causa da invalidação de cache pela troca de modelo, ou é outra coisa.Pega o log real dessa chamada específica (contato 5511970116430, por volta das 15:59-16:00) e mostra:- Modelo usado- input_tokens totais- cache_creation_input_tokens (cache sendo criado do zero — mais caro)- cache_read_input_tokens (cache reaproveitado — barato)- output_tokensSe cache_creation for alto e cache_read for zero, confirma minha suspeita: foi a primeira chamada depois da troca de modelo recriando o cache do zero, e as próximas chamadas (mesma conversa, poucos minutos depois) devem já vir muito mais baratas.Testa isso na prática: pede pra eu (ou você mesmo simula) mandar mais uma mensagem NESSA MESMA conversa agora, e mostra o cache_read_input_tokens dessa segunda chamada — se vier alto (reaproveitando o cache), confirma que o problema era só o "aquecimento" pontual, não um bug novo.
        
        Redirecionando para /conversas em 15 segundos...
      </div>
    );
  },
});
