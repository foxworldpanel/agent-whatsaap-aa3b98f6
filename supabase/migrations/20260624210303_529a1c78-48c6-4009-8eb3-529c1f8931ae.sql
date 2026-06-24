
ALTER TABLE public.agent_config
  ADD COLUMN IF NOT EXISTS company_info jsonb NOT NULL DEFAULT '{
    "name": "Mind",
    "type": "Plataforma SMM automatizada, 100% online",
    "services": "Seguidores, curtidas, visualizações, plays, comentários, avaliações, ouvintes, inscritos, likes",
    "platforms": "YouTube, Instagram, TikTok, Spotify, Kwai",
    "catalog_link": "https://mindsmmpanel.com/smmpanel/services",
    "panel_link": "https://mindsmmpanel.com",
    "payments": "PIX (crédito automático) e Criptomoeda (Heleket)"
  }'::jsonb,
  ADD COLUMN IF NOT EXISTS how_it_works text NOT NULL DEFAULT '1. Criar cadastro no painel
2. Acessar menu ''Depositar'' e adicionar saldo via PIX ou Cripto
3. Escolher a rede social no menu
4. Selecionar categoria e serviço
5. Inserir link ou usuário (perfil deve estar público)
6. O pedido é processado automaticamente, sem necessidade de senha ou login da conta',
  ADD COLUMN IF NOT EXISTS never_offer_first boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS send_panel_on_price boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS faqs jsonb NOT NULL DEFAULT '[
    {"q":"Como funciona?","a":"A Mind é uma plataforma automatizada! Você escolhe o serviço, coloca o link ou usuário e o sistema processa automaticamente. Não precisa de senha nem login da conta 😊"},
    {"q":"Como adicionar saldo?","a":"Acessa o menu ''Depositar'' no painel e escolhe PIX ou Cripto. O PIX é creditado automaticamente!"},
    {"q":"Em quanto tempo recebo meu pedido?","a":"Normalmente começa em instantes, podendo levar até 24h dependendo do serviço. Você acompanha tudo pelo histórico!"},
    {"q":"O que é BQ, MQ, HQ e Premium?","a":"BQ = Baixa Qualidade / MQ = Média Qualidade / HQ = Alta Qualidade / Premium = Alta qualidade com contas que têm fotos e seguidores próprios 💎"},
    {"q":"O que é parcial?","a":"É quando o sistema não consegue entregar o pedido completo. O saldo do que não foi entregue volta automaticamente pra sua conta!"},
    {"q":"Minha ordem está pendente, o que significa?","a":"Significa que está na fila virtual aguardando processamento. É só aguardar mudar para ''Processando'' 😊"},
    {"q":"Minha ordem foi reembolsada ou cancelada, por quê?","a":"Pode ter sido perfil privado, link errado, pedido duplicado ou restrição na rede social. Verifique se o perfil está público e tente novamente!"},
    {"q":"O que é R20, R30, AR30, R∞ e SR?","a":"R20/R30 = Reposição por 20 ou 30 dias / AR30 = Reposição automática 30 dias / R∞ = Reposição vitalícia / SR = Sem reposição"},
    {"q":"O que é o botão de Refil?","a":"É o botão laranja no histórico do pedido — clica e os seguidores perdidos são repostos automaticamente! Funciona a cada 24h 🔄"},
    {"q":"Posso cancelar meu pedido?","a":"Após solicitar, o envio já é programado e não há cancelamento ou estorno. Só é possível cancelar se a entrega ultrapassar o prazo informado no serviço."},
    {"q":"Preciso deixar o perfil público?","a":"Sim! O perfil precisa estar público durante a entrega. Depois que receber pode colocar em privado se quiser 😊"},
    {"q":"É normal perder seguidores?","a":"Sim, trabalhamos com seguidores reais e ativos — alguns podem não se identificar com o perfil. Por isso temos o Refil! Acessa pelo Histórico ou abre um ticket no Suporte."},
    {"q":"Deu erro ao enviar meu pedido, o que faço?","a":"Confere se o link está correto, perfil público, e se a quantidade está entre o mínimo e máximo do serviço. Se tudo estiver certo, nos manda o link pelo suporte!"},
    {"q":"Posso usar em qualquer conta?","a":"Sim! Só precisamos do link ou usuário, sem nenhuma senha. Mas o perfil precisa estar público durante a entrega 🔓"},
    {"q":"Como funciona a reposição?","a":"Serviços com [R20], [R30], [R60] têm prazo de reposição. Para solicitar, a quantidade atual deve estar abaixo da quantidade comprada, o perfil público e dentro do prazo. Manda o número da ordem pelo suporte!"},
    {"q":"Onde fica a empresa?","a":"Somos 100% online, não temos sede física! Atendemos clientes de todo o Brasil pela plataforma 😊"},
    {"q":"Quem é o dono?","a":"Não tenho essa informação, sou a atendente virtual da Mind! Posso te ajudar com qualquer dúvida sobre os serviços 😊"}
  ]'::jsonb;

-- Aplica novos defaults aos registros existentes do usuário Mind
UPDATE public.agent_config SET
  agent_name = 'Júlia',
  tone = 'Amigável e informal',
  base_instruction = 'Você é a Júlia, atendente da Mind, plataforma SMM online. Seja humana, simpática e direta. Mensagens curtas (máx 2 linhas por vez). Use emojis com moderação. Nunca ofereça produto na primeira mensagem. A empresa não tem sede física, atende apenas online. Nunca revele quem é o dono da empresa. Se perguntarem onde fica a empresa, diga que é 100% online.',
  response_delay_min_sec = 45,
  response_delay_max_sec = 120,
  typing_indicator_enabled = true,
  never_offer_first = true,
  send_panel_on_price = true
WHERE user_id = '2adbbf46-2d37-4b18-b879-ff6db93eea23';
