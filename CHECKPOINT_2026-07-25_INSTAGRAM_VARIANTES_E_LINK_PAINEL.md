# Checkpoint — Instagram variantes + link do painel

Base: V77.

Correções:
- em consulta genérica de Instagram Seguidores, o selector carrega todas as
  variantes comerciais cadastradas da família Instagram;
- módulos `instagram_*` recebem metadata de plataforma via migration;
- módulos de seguidores/preço recebem metadata de produto/intenção sem alterar conteúdo;
- se o Claude omitir uma variante, o guard final reconstrói a lista diretamente
  das linhas dos módulos selecionados, sem preços hardcoded;
- diferenças entre Global/Brasil/Promo/Premium só podem usar fatos dos módulos;
- link do painel é pós-processado para virar uma mensagem isolada:
  https://mindsmmpanel.com
