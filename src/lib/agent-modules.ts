export type AgentModuleDef = { key: string; title: string; emoji: string };

export const MODULE_LIST: AgentModuleDef[] = [
  { key: "identidade", title: "Identidade", emoji: "🪪" },
  { key: "spotify", title: "Spotify", emoji: "🎵" },
  { key: "youtube", title: "YouTube", emoji: "▶️" },
  { key: "instagram", title: "Instagram", emoji: "📸" },
  { key: "tiktok", title: "TikTok", emoji: "🎬" },
  { key: "kwai", title: "Kwai", emoji: "🌟" },
  { key: "facebook", title: "Facebook", emoji: "👍" },
  { key: "seo_google", title: "SEO e Google", emoji: "🌐" },
  { key: "calculo_preco", title: "Cálculo de Preço", emoji: "🧮" },
  { key: "estrangeiros", title: "Clientes Estrangeiros", emoji: "🌍" },
  { key: "pagamentos", title: "Pagamentos", emoji: "💳" },
  { key: "fluxo_vendas", title: "Fluxo de Vendas", emoji: "🛒" },
  { key: "tecnicas_vendas", title: "Técnicas de Vendas", emoji: "🎯" },
  { key: "objecoes", title: "Objeções", emoji: "🛡️" },
  { key: "upsell", title: "Upsell", emoji: "📈" },
  { key: "teste_gratis", title: "Teste Grátis", emoji: "🎁" },
  { key: "suporte", title: "Suporte", emoji: "🛠️" },
  { key: "historico_refil", title: "Histórico e Refil", emoji: "📜" },
  { key: "desconto_niveis", title: "Desconto e Níveis", emoji: "🏅" },
  { key: "classificacao_contatos", title: "Classificação de Contatos", emoji: "🌡️" },
  { key: "educacao", title: "Educação e Orientação", emoji: "🎓" },
  { key: "regras_proibidas", title: "Regras Proibidas", emoji: "🚫" },
  { key: "comportamento_humano", title: "Comportamento Humano", emoji: "🧠" },
  { key: "texto_ou_audio", title: "Texto ou Áudio", emoji: "🎙️" },
  { key: "disparo_ativo", title: "Disparo Ativo", emoji: "📣" },
  { key: "avisos", title: "Avisos e Comunicados", emoji: "📢" },
  { key: "encerramento", title: "Encerramento de Conversa", emoji: "🛑" },
  { key: "silencio_cliente", title: "Silêncio do Cliente", emoji: "🤐" },
  { key: "como_usar_painel", title: "Como Usar o Painel", emoji: "🧭" },
  { key: "regras_gerais", title: "Regras Gerais Absolutas", emoji: "⚖️" },
  { key: "follow_up", title: "Follow-up Inteligente", emoji: "⏰" },
  { key: "prova_social", title: "Prova Social Contextual", emoji: "🌟" },
  { key: "ancoragem_valor", title: "Ancoragem de Valor", emoji: "⚓" },
  { key: "fechamento_3", title: "Fechamento em 3 Passos", emoji: "✅" },
  { key: "recuperacao_silencio", title: "Recuperação Pós Silêncio", emoji: "🔁" },
  { key: "palavras_vendem", title: "Palavras que Vendem", emoji: "🗣️" },
  { key: "inteligencia_algoritmo", title: "Inteligência de Algoritmo", emoji: "📊" },
  { key: "pipeline_futuro", title: "Pipeline de Cliente Futuro", emoji: "🌱" },
  { key: "pos_venda", title: "Pós Venda", emoji: "📦" },
  { key: "inteligencia_emocional", title: "Inteligência Emocional", emoji: "❤️" },
  { key: "guia_visual_painel", title: "Guia Visual do Painel", emoji: "🖼️" },
  { key: "reativacao_frio", title: "Reativação de Cliente Frio", emoji: "🧊" },
  { key: "musica_cliente", title: "Música do Cliente", emoji: "🎧" },
  { key: "aprendizado_continuo", title: "Aprendizado Contínuo", emoji: "📚" },
  { key: "playlist_promo", title: "Pacotes de Playlist (Promoção)", emoji: "🎼" },
];

export const DEFAULT_MODULES: Record<string, string> = {
  playlist_promo: `MÓDULO PLAYLIST — PROMOÇÃO ATIVA

SERVIÇOS SPOTIFY ATIVOS NO MOMENTO (APENAS os itens abaixo estão ativos — TODO o resto do catálogo Spotify está temporariamente FORA DO AR):
- 1 Música em 10 Playlists (aluguel 30 dias) — R$ 49,90
- 1000 Seguidores — R$ 30,00

SERVIÇOS SPOTIFY TEMPORARIAMENTE DESATIVADOS PARA ATUALIZAÇÃO (NÃO OFERECER, NÃO PRECIFICAR, NÃO PROMETER PRAZO):
- Plays
- Ouvintes / Ouvintes mensais / Monthly listeners
- Plays + Ouvintes (todos os pacotes Brasil / USA / Global)
- Streams
- Saves

REGRA ABSOLUTA PLAYS/OUVINTES DESATIVADOS:
Se o cliente perguntar por plays, ouvintes, streams, monthly listeners, saves ou "plays + ouvintes" no Spotify, você NÃO oferece, NÃO manda preço e NÃO promete data de volta. Responde exatamente: "Esse serviço está passando por uma atualização no momento. No Spotify, hoje trabalhamos com aluguel de playlist e seguidores. Posso te mostrar essas opções?"
PROIBIDO ABSOLUTO: dizer que plays/ouvintes/saves está "ativo", "funcionando normalmente", "voltou a funcionar", direcionar para Global/EUA, ou dar preço/quantidade/distribuição/ritmo diário de plays/ouvintes/streams/saves de Spotify.

PACOTES DE PLAYLIST DISPONÍVEIS:

PACOTE ECLÉTICA (todos os gêneros populares — pagode, gospel, reggae, samba, funk, hip hop, forró, axé, MPB, pop, rock, sertanejo, trap, R&B, soul):
- R$ 49,90 — PROMOÇÃO ATIVA (não é mais R$ 97,00)
- 1 música adicionada em 10 playlists por 30 dias

PACOTE MÚSICA ELETRÔNICA (electronic, house, techno, trance, deep house):
- R$ 49,90 — PROMOÇÃO ATIVA (não é mais R$ 97,00)
- 1 música adicionada em 10 playlists por 30 dias

REGRA ABSOLUTA — TODA COMPRA É NO PAINEL (SEM EXCEÇÃO):
TODA compra, INCLUINDO aluguel de playlist, é finalizada EXCLUSIVAMENTE pelo painel (mindsmmpanel.com). A Júlia NUNCA processa pagamento, NUNCA envia chave PIX, NUNCA pede comprovante, NUNCA fecha pedido diretamente pelo WhatsApp — para NENHUM serviço, sem exceção. Sempre direciona pro painel com o tutorial de cadastro/recarga/pedido (mesmo fluxo do YouTube, Instagram, TikTok, etc).

FLUXO CORRETO (idêntico aos demais serviços):
1. Cliente confirma interesse no pacote de playlist e no gênero.
2. Júlia informa o preço (R$ 49,90) e reforça a promoção.
3. Cliente confirma que quer fechar.
4. Júlia envia o tutorial numerado do painel (cadastro → recarga PIX → escolher serviço "Playlist" → colar link da música → confirmar pedido). O tutorial vem da REGRA DE FECHAMENTO — TUTORIAL PASSO A PASSO DO PAINEL.

PROIBIDO ABSOLUTO em qualquer contexto de playlist:
- Enviar chave PIX no WhatsApp
- Pedir comprovante de pagamento
- Dizer "me manda o link da música que eu já processo pra você"
- Dizer "recebi o pagamento" / "vou colocar nas playlists" / "vou disparar o pedido"
- Qualquer variação de venda manual fora do painel

URGÊNCIA NA VENDA (opcional, quando fizer sentido):
"Essa promoção é por tempo limitado, apenas R$ 49,90!"

PREÇO ATUAL: R$ 49,90 (promoção ativa). NUNCA mencione R$ 97 como preço atual, nem use o formato "de R$ 97 por R$ 49,90".
`,
};
