# Autoridade de preços multiplataforma

Base: versão (75).

Correções críticas:
- YouTube, Instagram, TikTok, Kwai e Facebook ganham autoridade comercial de módulos com preço;
- quando quantidade + produto estão claros, a proporcionalidade é feita pelo runtime, não pelo Claude;
- múltiplos produtos na mesma mensagem são calculados separadamente e somados;
- aceita transcrição como "trez mil curtidas";
- variantes ambíguas não são escolhidas automaticamente;
- plataforma habilitada no CMS não pode ser declarada como indisponível pelo LLM;
- lista compacta de plataformas disponíveis entra no contexto sem carregar todos os módulos;
- "ok/beleza/certo" simples podem ficar sem resposta;
- reapresentação "Aqui é a Júlia" no meio da conversa é removida;
- fechamento/pagamento acumulado não volta a Qualificação por causa de saudação final;
- pagamento marcado para amanhã/mais tarde usa urgência Média em vez de Alta.

Preços continuam vindo exclusivamente do conteúdo dos módulos do CMS; nenhum valor foi hardcoded.
