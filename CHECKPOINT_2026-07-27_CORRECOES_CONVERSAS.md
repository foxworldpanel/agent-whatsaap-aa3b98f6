# Checkpoint — correções das conversas reais (27/07/2026)

Base: ZIP (80).

Aplicado em lote:

- respostas comuns mais curtas (alvo 15–35 palavras; regra reforçada para 1–2 frases);
- tabela geral de preços Spotify sai limpa e isolada, montada diretamente do módulo autoritativo;
- tabela resumida Spotify: Seguidores, Plays + Ouvintes, Saves; Playlist só quando pedida;
- interpretação contextual de frases como “o que está no seu comercial?”;
- áudio/transcrição ambígua deve respeitar o contexto antes de mudar de assunto;
- pós-venda não pode usar “se tudo correr bem / se der certo / tomara”;
- proibição de inventar causas como conexão/sincronização/banco;
- alerta bancário “transação de alto risco” não pode ser normalizado como “isso é comum” sem fonte;
- “comprei ontem/hoje” confirma compra e leva ao pós-venda;
- intenção futura explícita de nova compra é persistida como oportunidade;
- cliente em pós-venda com alto potencial de recompra não volta para 20%/frio;
- funil concluído significa Júlia já apresentada, mesmo que o histórico V3 não contenha o áudio do funil;
- após funil, saudação não reapresenta “Aqui é a Júlia da Mind”;
- gatilhos genéricos “oi/olá/bom dia/boa tarde/boa noite” são ignorados como gatilho isolado;
- a frase oficial “Olá! Tenho interesse em divulgar minha música.” continua aceitando texto adicional no fim sem transformar “Oi” em gatilho.

Teste de regressão adicionado em tests/agent-v3/batch-corrections-2026-07-27.test.ts.
