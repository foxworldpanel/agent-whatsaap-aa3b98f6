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
        Aprovado, aplica os cortes seguros identificados na auditoria:

1) DEDUPLICA a regra "não aceitar pagamento manual / tudo pelo painel" — mantém em UM lugar só (sugiro pagamentos, que é o mais específico), remove de identidade e regras_proibidas
2) DEDUPLICA a orientação "abrir ticket no suporte" — mantém só no módulo suporte condicional, remove de dentro de identidade
3) ENCURTA a explicação da regra de split (de 3 parágrafos + 2 exemplos pra 2 linhas diretas)
4) ENCURTA "Regras Absolutas de Uso" do exemplo de disparo, removendo repetição com anti_invencao
5) MOVE pra CONDICIONAL (sai do ESSENTIAL, vira módulo com gatilho): regra de teste grátis (só carrega se cliente hesitar/perguntar amostra), regras de suporte/reclamação (só carrega com gatilho "erro"/"problema"/"caiu"/"id"), regras de cliente estrangeiro (só carrega com DDI estrangeiro/idioma detectado)

ANTES de aplicar, preciso de uma investigação SEPARADA e prioritária sobre o catálogo:
6) Pra essa MESMA chamada específica de "boa tarde" (a que gerou 27k tokens), mostra o tamanho EXATO do bloco de catálogo que foi carregado — não a faixa "15-20k dependendo", o número REAL dessa chamada específica. Confirma: o catalog_only_relevant com fallback pra "sem match" (60 serviços, ~6,6k tokens) que corrigimos há 2 dias está realmente funcionando aqui, ou regrediu e está carregando o catálogo maior de novo numa saudação pura sem nenhuma menção a serviço?

Se o catálogo regrediu, isso é a correção de MAIOR impacto de todas (pode valer mais que os 6 cortes de módulo somados) — investiga e corrige antes de mais nada.

TESTE DE VALIDAÇÃO (depois de tudo aplicado):
1) Roda bun run test:agent
2) Testa "boa tarde" de novo e mede o tamanho REAL do prompt final — compara com os 27k de antes
3) Testa um cenário que precisa de teste grátis (cliente hesitando) e confirma que o módulo condicional carrega corretamente quando precisa
4) Testa um cliente estrangeiro (DDI diferente) e confirma que a regra de conversão USD ainda funciona
5) Testa uma reclamação de pedido e confirma que ainda direciona pro ticket corretamente
        
        Redirecionando para /conversas em 15 segundos...
      </div>
    );
  },
});
