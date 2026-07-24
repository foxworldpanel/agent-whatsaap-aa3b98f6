-- Agent V3 — modularização de conhecimento por assunto.
-- Objetivo: reduzir tokens carregando somente o submódulo necessário no turno.
-- Não altera módulos de Instagram/TikTok/Kwai/Facebook.
-- Spotify usa as informações comerciais aprovadas em 24/07/2026.
-- YouTube preserva o conteúdo atual do CMS em um módulo legado de segurança;
-- os submódulos conhecidos são criados sem sobrescrever conteúdo já mais novo.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT workspace_id, user_id
    FROM public.agent_modules_v3
    WHERE workspace_id IS NOT NULL
      AND key IN ('spotify','youtube')
  LOOP

    -- =========================
    -- SPOTIFY
    -- =========================
    INSERT INTO public.agent_modules_v3
      (user_id, workspace_id, key, name, content, category, enabled, version, priority,
       always_load, selector_intents, selector_stages, selector_platforms,
       selector_products, selector_triggers, selector_dependencies, selector_conflicts)
    VALUES
    (
      r.user_id, r.workspace_id,
      'spotify_servicos', 'Spotify — Serviços', $CONTENT$
MÓDULO SPOTIFY — SERVIÇOS
Use somente para apresentar o que existe no Spotify.
Serviços: Plays + Ouvintes, Seguidores, Saves e divulgação de 1 música em 10 Playlists.
Playlists: Eclética (gêneros populares) ou Eletrônica (electronic/house/techno/trance/deep house).
Toda compra é feita no painel mindsmmpanel.com.
Não despeje detalhes de preço, prazo, garantia ou royalties se o cliente não perguntou.
$CONTENT$,
      'Spotify', true, 1, 82, false,
      '{}'::text[], '{}'::text[], ARRAY['spotify']::text[],
      '{}'::text[], '{}'::text[],
      '{}'::text[], '{}'::text[]
    ),
    (
      r.user_id, r.workspace_id,
      'spotify_precos', 'Spotify — Preços', $CONTENT$
MÓDULO SPOTIFY — PREÇOS
Fonte única de preços, mínimos, máximos e velocidades:
- Plays + Ouvintes: 1.000 = R$ 15,00 | mín 500 | máx 500.000 | aprox. 100–150/dia.
- Seguidores: 1.000 = R$ 30,00 | mín 100 | máx 500.000 | aprox. 500–1.000/dia.
- Saves: 1.000 = R$ 10,00 | mín 100 | máx 50.000 | aprox. 500/dia.
- 1 música em 10 Playlists: R$ 49,90 | permanência 30 dias | aprox. 50–100 plays/dia.
Para outra quantidade, calcule proporcionalmente ao preço base e respeite mín/máx.
Se perguntarem se pode comprar menos, informe já o mínimo e o valor correspondente.
Ex.: 500 Plays + Ouvintes = R$ 7,50.
$CONTENT$,
      'Spotify', true, 1, 95, false,
      ARRAY['consulta_preco','compra']::text[], ARRAY['negociacao','fechamento']::text[], ARRAY['spotify']::text[],
      ARRAY['plays','ouvintes','seguidores','playlist']::text[],
      ARRAY['preço','preco','valor','quanto custa','quanto fica','mínimo','minimo','500','1000','mil']::text[],
      '{}'::text[], '{}'::text[]
    ),
    (
      r.user_id, r.workspace_id,
      'spotify_prazos', 'Spotify — Prazos e Atualização', $CONTENT$
MÓDULO SPOTIFY — PRAZOS
- Início do processamento: até 24h após o pedido.
- Conclusão depende do serviço, quantidade e velocidade de entrega; velocidade é aproximada, não prazo exato.
- Após o pedido aparecer "Concluído" no painel, o Spotify pode levar até 72h adicionais para atualizar totalmente a contagem.
- O Spotify não atualiza todas as métricas em tempo real.
Se estiver concluído no painel mas ainda não atualizado no Spotify, orientar a aguardar até 72h antes de considerar problema.
$CONTENT$,
      'Spotify', true, 1, 90, false,
      ARRAY['suporte','pos_compra']::text[], ARRAY['pos_venda','suporte']::text[], ARRAY['spotify']::text[],
      '{}'::text[], ARRAY['prazo','demora','quanto tempo','concluído','concluido','atualizou','atualizar','72 horas','24 horas','não apareceu','nao apareceu']::text[],
      '{}'::text[], '{}'::text[]
    ),
    (
      r.user_id, r.workspace_id,
      'spotify_links', 'Spotify — Links e Distribuição', $CONTENT$
MÓDULO SPOTIFY — LINKS
Plays + Ouvintes aceita link de música, álbum, playlist ou artista.
- Música: entrega concentrada na faixa.
- Álbum/Playlist: quantidade é distribuída entre as faixas. Referência: 500 plays em 10 faixas ≈ 50 por faixa.
- Artista: entrega distribuída no Top 10 do artista.
Seguidores: link do perfil. Saves: link da música. Playlists: link da música.
Se quiser concentrar em uma música, recomende link direto da faixa.
Não peça link como pré-requisito para fechar a venda; o cliente informa o link ao criar o pedido no painel. Explique o tipo de link quando houver dúvida.
$CONTENT$,
      'Spotify', true, 1, 91, false,
      '{}'::text[], '{}'::text[], ARRAY['spotify']::text[],
      '{}'::text[],
      ARRAY['link','álbum','album','artista','perfil','faixa','música','musica','dividido','dividir','top 10']::text[],
      '{}'::text[], '{}'::text[]
    ),
    (
      r.user_id, r.workspace_id,
      'spotify_ouvintes', 'Spotify — Plays e Ouvintes', $CONTENT$
MÓDULO SPOTIFY — PLAYS E OUVINTES
Plays e ouvintes mensais são métricas diferentes.
- Plays permanecem contabilizados no histórico da música.
- Ouvintes mensais usam uma janela móvel de aproximadamente 28 dias e podem diminuir com o tempo.
- Nunca prometa 1 play = 1 ouvinte.
Referência aproximada: 1.000 plays podem gerar 600–900 ouvintes, pois a mesma pessoa pode ouvir mais de uma vez.
$CONTENT$,
      'Spotify', true, 1, 92, false,
      '{}'::text[], '{}'::text[], ARRAY['spotify']::text[],
      ARRAY['plays','ouvintes']::text[],
      ARRAY['ouvintes','ouvinte mensal','ouvintes mensais','28 dias','600','900','plays são ouvintes','plays sao ouvintes']::text[],
      '{}'::text[], '{}'::text[]
    ),
    (
      r.user_id, r.workspace_id,
      'spotify_garantia', 'Spotify — Garantia', $CONTENT$
MÓDULO SPOTIFY — GARANTIA
Regra geral: serviços com link que permite conferir corretamente contagem inicial e entrega possuem garantia vitalícia de reposição.
Exceção: Plays + Ouvintes com link de Artista, Álbum ou Playlist NÃO têm garantia de reposição, pois a entrega é distribuída e não é possível conferir com precisão a contagem inicial individual.
Para facilitar conferência e manter a garantia aplicável, recomende link direto da música quando possível.
Nunca diga que Artista/Álbum/Playlist possuem garantia para Plays + Ouvintes.
$CONTENT$,
      'Spotify', true, 1, 93, false,
      ARRAY['duvida_seguranca','suporte','pos_compra']::text[], '{}'::text[], ARRAY['spotify']::text[],
      '{}'::text[], ARRAY['garantia','reposição','reposicao','caiu','queda','repor','reposição vitalícia','reposicao vitalicia']::text[],
      '{}'::text[], '{}'::text[]
    ),
    (
      r.user_id, r.workspace_id,
      'spotify_playlists', 'Spotify — Playlists', $CONTENT$
MÓDULO SPOTIFY — PLAYLISTS
Pacote: 1 música em 10 playlists por R$ 49,90, permanência de 30 dias, entrega aproximada de 50–100 plays/dia.
Gêneros:
- Eclética: gêneros populares como pagode, gospel, reggae, samba, funk, hip hop, forró, axé, MPB, pop, rock, sertanejo, trap, R&B e soul.
- Eletrônica: somente electronic/house/techno/trance/deep house.
Para contratar, usa link direto da música.
$CONTENT$,
      'Spotify', true, 1, 94, false,
      '{}'::text[], '{}'::text[], ARRAY['spotify']::text[],
      ARRAY['playlist']::text[], ARRAY['playlist','playlists','eclética','ecletica','eletrônica','eletronica','gênero','genero']::text[],
      '{}'::text[], '{}'::text[]
    ),
    (
      r.user_id, r.workspace_id,
      'spotify_royalties', 'Spotify — Royalties', $CONTENT$
MÓDULO SPOTIFY — ROYALTIES
A Mind não controla monetização do Spotify nem pagamentos da distribuidora.
Nunca prometa ganhos financeiros ou royalties como resultado do serviço.
A Mind não se responsabiliza por pagamentos, retenções, elegibilidade de monetização ou decisões do Spotify/distribuidora.
Se perguntarem se receberá royalties: informe que não é possível garantir; monetização e pagamento são definidos pelo Spotify e pela distribuidora.
$CONTENT$,
      'Spotify', true, 1, 89, false,
      '{}'::text[], '{}'::text[], ARRAY['spotify']::text[],
      '{}'::text[], ARRAY['royalty','royalties','monetização','monetizacao','distribuidora','receber dinheiro','pagamento spotify','spotify paga']::text[],
      '{}'::text[], '{}'::text[]
    )
    ON CONFLICT (workspace_id, key) DO UPDATE SET
      name = EXCLUDED.name,
      content = EXCLUDED.content,
      category = EXCLUDED.category,
      enabled = EXCLUDED.enabled,
      version = public.agent_modules_v3.version + 1,
      priority = EXCLUDED.priority,
      always_load = EXCLUDED.always_load,
      selector_intents = EXCLUDED.selector_intents,
      selector_stages = EXCLUDED.selector_stages,
      selector_platforms = EXCLUDED.selector_platforms,
      selector_products = EXCLUDED.selector_products,
      selector_triggers = EXCLUDED.selector_triggers,
      selector_dependencies = EXCLUDED.selector_dependencies,
      selector_conflicts = EXCLUDED.selector_conflicts,
      updated_at = now();

    -- O módulo Spotify monolítico deixa de entrar no prompt.
    UPDATE public.agent_modules_v3
    SET enabled = false, updated_at = now()
    WHERE workspace_id = r.workspace_id AND key = 'spotify';

    -- =========================
    -- YOUTUBE
    -- =========================
    -- Módulo pequeno de plataforma: entra quando o cliente apenas diz "YouTube".
    INSERT INTO public.agent_modules_v3
      (user_id, workspace_id, key, name, content, category, enabled, version, priority,
       always_load, selector_intents, selector_stages, selector_platforms,
       selector_products, selector_triggers, selector_dependencies, selector_conflicts)
    VALUES
    (
      r.user_id, r.workspace_id,
      'youtube_geral', 'YouTube — Geral', $CONTENT$
MÓDULO YOUTUBE — GERAL
No YouTube trabalhamos com serviços de crescimento e engajamento cadastrados nos módulos específicos.
Quando o cliente apenas disser "YouTube", pergunte qual serviço procura, sem despejar tabela de preços.
Use "inscritos" para canal e "visualizações/views" para vídeos; não use "plays".
Toda compra é feita no painel mindsmmpanel.com.
$CONTENT$,
      'YouTube', true, 1, 82, false,
      '{}'::text[], '{}'::text[], ARRAY['youtube']::text[],
      '{}'::text[], '{}'::text[], '{}'::text[], '{}'::text[]
    )
    ON CONFLICT (workspace_id, key) DO NOTHING;

    -- Preserva integralmente o módulo atual como fonte comercial. Ele passa a ser
    -- "youtube_servicos" e pode ser refinado no CMS sem perder preços Premium atuais.
    INSERT INTO public.agent_modules_v3
      (user_id, workspace_id, key, name, content, category, enabled, version, priority,
       always_load, selector_intents, selector_stages, selector_platforms,
       selector_products, selector_triggers, selector_dependencies, selector_conflicts)
    SELECT
      y.user_id, y.workspace_id,
      'youtube_servicos', 'YouTube — Serviços e Preços',
      y.content, 'YouTube', true, y.version + 1, 90, false,
      ARRAY['descoberta','consulta_preco','compra']::text[],
      ARRAY['apresentacao','negociacao','fechamento']::text[],
      ARRAY['youtube']::text[],
      ARRAY['visualizacoes','inscritos','curtidas','live','horas','comentarios']::text[],
      ARRAY['youtube','yt','visualizações','visualizacoes','views','likes','inscritos','premium','global','live','horas']::text[],
      '{}'::text[], '{}'::text[]
    FROM public.agent_modules_v3 y
    WHERE y.workspace_id = r.workspace_id AND y.key = 'youtube'
    ON CONFLICT (workspace_id, key) DO NOTHING;

    INSERT INTO public.agent_modules_v3
      (user_id, workspace_id, key, name, content, category, enabled, version, priority,
       always_load, selector_intents, selector_stages, selector_platforms,
       selector_products, selector_triggers, selector_dependencies, selector_conflicts)
    VALUES
    (
      r.user_id, r.workspace_id,
      'youtube_links', 'YouTube — Links e Orientação', $CONTENT$
MÓDULO YOUTUBE — LINKS
Use o link correspondente ao conteúdo que receberá o serviço.
Não peça link antes do fechamento; o cliente informa o link no pedido do painel.
Se houver dúvida sobre vídeo, álbum ou playlist, explique somente o necessário para evitar pedido incorreto.
Não confirme que um link recebeu serviço apenas porque o cliente o enviou.
$CONTENT$,
      'YouTube', true, 1, 82, false,
      ARRAY['compra','suporte']::text[], '{}'::text[], ARRAY['youtube']::text[],
      '{}'::text[], ARRAY['link','vídeo','video','álbum','album','playlist','canal']::text[],
      '{}'::text[], '{}'::text[]
    )
    ON CONFLICT (workspace_id, key) DO NOTHING;

    -- Só desativa o monolítico se a cópia segura foi criada.
    IF EXISTS (
      SELECT 1 FROM public.agent_modules_v3
      WHERE workspace_id = r.workspace_id AND key = 'youtube_servicos' AND enabled = true
    ) THEN
      UPDATE public.agent_modules_v3
      SET enabled = false, updated_at = now()
      WHERE workspace_id = r.workspace_id AND key = 'youtube';
    END IF;

  END LOOP;
END $$;
