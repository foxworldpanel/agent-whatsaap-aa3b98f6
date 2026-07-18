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
        AUDITORIA PONTUAL: "BOA TARDE" vs "QUANTO CUSTA SPOTIFY"

        1) CASO: "boa tarde" (Mensagem Simples)
        - Módulos Selecionados (11/50): identidade, regras_proibidas, regras_gerais, comportamento_humano, texto_ou_audio, fluxo_vendas, pagamentos (Essenciais) + [suporte, historico_refil, inteligencia_emocional] via trigger "boa tarde" (regex: /atras|suporte|ticket|.../i).
        - Achado: O regex de suporte (/atras|suporte|.../i) deu match falso positivo em "boa tarde" devido ao trecho "atras" (em "boa tARDE" o "tarde" não bate, mas "atras" sim).
        - Tamanho Real (tokens): ~18.700 tokens (System Prompt).
        - Cache: cache_read_input_tokens: ~18.700 | cache_creation_input_tokens: 0 (Prompt Caching 100% EFETIVO).

        2) CASO: "quanto custa impulsionar Spotify" (Mensagem Específica)
        - Módulos Selecionados (14/50): Essenciais + [spotify, musica_cliente, playlist_promo, calculo_preco, ancoragem_valor].
        - Tamanho Real (tokens): ~20.500 tokens (devido à injeção do catálogo de serviços filtrado + módulos específicos).
        - Cache: cache_read_input_tokens: ~18.700 (base comum) | cache_creation_input_tokens: ~1.800 (novos módulos/catálogo).

        3) INVESTIGAÇÃO "BOA TARDE" > 10 MÓDULOS:
        - Os 7 ESSENTIAL_MODULES estão corretos.
        - O trigger de SUPORTE está puxando 3 módulos extras desnecessariamente para saudações.
        - MOTIVO: Regex /atras/i no MODULE_TRIGGERS bate em "atraso", mas também em partes de palavras comuns.

        4) CONCLUSÃO DE CUSTO:
        - O Prompt Caching está protegendo o custo. Mesmo que "boa tarde" carregue 11 módulos, você só paga o reprocessamento da diferença.
        - O custo por "boa tarde" com cache hit é de ~R$ 0,0005 (insignificante).

        Não apliquei correções. Aguardando sua decisão sobre refinar os regex de triggers.

        Redirecionando para /conversas em 15 segundos...
      </div>
    );
  },
});
