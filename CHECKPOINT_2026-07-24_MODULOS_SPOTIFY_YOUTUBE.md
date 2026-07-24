# Checkpoint — arquitetura modular Spotify/YouTube

Base: ZIP (62) enviado pelo usuário em 24/07/2026.

## Problema encontrado
O seletor V3 selecionava qualquer módulo cujo `selector_platforms` contivesse a
plataforma detectada. Se criássemos sete módulos com `spotify` em
`selector_platforms`, os sete seriam carregados em praticamente todo turno,
eliminando a economia de tokens.

## Correção do seletor
- módulo amplo de plataforma (somente `selector_platforms`) pode entrar pela rede;
- submódulo especializado, que possui intents/stages/products/triggers, NÃO entra
  somente porque pertence à plataforma;
- ele precisa corresponder ao assunto do turno;
- módulos legados de chave exata (`spotify`, `youtube`) continuam compatíveis até a migration.

## Spotify criado
- spotify_servicos
- spotify_precos
- spotify_prazos
- spotify_links
- spotify_ouvintes
- spotify_garantia
- spotify_playlists
- spotify_royalties

O conteúdo usa as informações comerciais aprovadas pelo usuário em 24/07/2026.
O antigo módulo `spotify` é desativado pela migration para evitar duplicidade.

## YouTube
- youtube_geral: pequeno, usado quando o cliente apenas escolhe YouTube;
- youtube_servicos: cópia integral do conteúdo atual do CMS, preservando inclusive
  informações Global/Premium já cadastradas;
- youtube_links: orientação específica de links.

O módulo monolítico `youtube` só é desativado se a cópia segura
`youtube_servicos` existir.

## Segurança de dados
A migration não usa UUID fixo de workspace. Ela percorre os workspaces que já
possuem Spotify/YouTube e mantém `user_id`/`workspace_id` de cada tenant.
Instagram, TikTok, Kwai e Facebook não são alterados nesta etapa.
