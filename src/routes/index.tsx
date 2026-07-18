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
        Preciso de uma auditoria de CONTEÚDO dos 7 módulos essenciais (identidade, pagamentos, fluxo_vendas, regras_proibidas, comportamento_humano, texto_ou_audio, regras_gerais) — que juntos estão pesando ~27k tokens mesmo numa saudação simples sem nenhum módulo extra.

NÃO aplica nenhuma mudança ainda — só investigação.

Pra CADA um dos 7 módulos essenciais, mostra:
1) Tamanho em caracteres/tokens
2) O conteúdo COMPLETO (cola aqui o texto real de cada um)

Depois de ver o conteúdo, preciso que aponte:
1) REPETIÇÃO ENTRE MÓDULOS: alguma regra/instrução aparece em mais de um módulo dos 7? (mesmo padrão do bug de emoji duplicado que já corrigimos — pode ter acontecido de novo com outras regras ao longo dos últimos dias)
2) VERBOSIDADE DESNECESSÁRIA: alguma instrução está redigida de forma mais longa do que precisa (múltiplos exemplos quando 1 bastaria, explicação repetida do mesmo conceito com palavras diferentes)?
3) CONTEÚDO QUE PODERIA SER CONDICIONAL: alguma regra dentro desses módulos "essenciais" só se aplica em situação específica (ex: só durante disparo, só quando é pagamento) e poderia sair do bloco ESSENTIAL pra virar um módulo condicional (carregado só quando o gatilho certo bater), em vez de sempre carregar pra qualquer mensagem, mesmo uma saudação pura?

Não sugere reescrever nada ainda — só traz esse mapeamento completo pra eu revisar com você antes de decidir o que cortar.
        
        Redirecionando para /conversas em 15 segundos...
      </div>
    );
  },
});
