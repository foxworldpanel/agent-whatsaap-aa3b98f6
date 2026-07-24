# Checkpoint — módulos novos aparecem no menu

Causa: a versão anterior dependia da migration SQL. Atualizar o GitHub não garante
que o Supabase execute migrations, então os cards não eram criados no banco.

Correção: ao abrir a página Agente, `getFullAgentV3Config` executa um bootstrap
idempotente dos submódulos ausentes no workspace atual. Depois lista a tabela e os
cards aparecem imediatamente.

- preserva módulos já editados;
- copia o conteúdo real de YouTube para `youtube_servicos`;
- não usa UUID fixo;
- não injeta conteúdo em workspace sem Spotify/YouTube;
- desativa os monolíticos apenas após os substitutos existirem.
