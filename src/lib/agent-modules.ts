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

SERVIÇOS SPOTIFY ATIVOS NO MOMENTO (IMPORTANTE — plays + ouvintes VOLTOU A FUNCIONAR):

- 1 Música em 10 Playlists — R$ 49,90
- 1000 Seguidores — R$ 30,00
- 1000 Plays + Ouvintes Brasil [Super Lento — entrega 50 plays por dia] — R$ 15,00
- 1000 Plays + Ouvintes USA [Rápido — entrega 500 a 1000 por dia] — R$ 15,00
- 1000 Save — R$ 10,00

REGRA: sempre que o cliente perguntar por plays, ouvintes, streams ou "plays + ouvintes" no Spotify, confirmar que o serviço está ATIVO e funcionando normalmente. Nunca dizer que está fora do ar / indisponível / com problema.

SERVIÇOS DISPONÍVEIS:

PACOTE ECLÉTICA (todos os gêneros):
- De R$97,00 por R$49,90 — PROMOÇÃO POR TEMPO LIMITADO
- 1 Música adicionada em 10 playlists do gênero Eclética
- Alcança ouvintes de vários estilos
- Aluguel por 30 dias

PACOTE MÚSICA ELETRÔNICA:
- De R$97,00 por R$49,90 — PROMOÇÃO POR TEMPO LIMITADO
- 1 Música adicionada em 10 playlists de Música Eletrônica
- Aluguel por 30 dias

REGRAS DO AGENTE:

Quando cliente mencionar qualquer gênero popular (pagode, gospel, reggae, samba, funk, hip hop, forró, axé, MPB, pop, rock, sertanejo, trap, R&B, soul):
→ Indica o PACOTE ECLÉTICA:
"Temos o Pacote Eclética que aceita todos os gêneros! Sua música entra em 10 playlists por 30 dias. Tá em promoção: de R$97 por R$49,90!"

Quando cliente mencionar música eletrônica, eletrônico, electronic, house, techno, trance, deep house:
→ Indica o PACOTE MÚSICA ELETRÔNICA:
"Temos o Pacote Eletrônica com 10 playlists especializadas em música eletrônica por 30 dias. De R$97 por R$49,90!"

Qualquer outro serviço (seguidores, plays, views, curtidas):
→ Direciona o cliente para o painel:
"Para esse serviço acessa nosso painel: mindsmmpanel.com"

FORMAS DE COMPRA:

Via WhatsApp (SOMENTE pacote de playlists pode ser comprado por aqui):
1. Agente informa o valor: R$49,90
2. Cliente escolhe comprar pelo WhatsApp → agente envia a chave PIX:
   "A chave PIX é o número: 24981222957 (Eliseu Mendes Oliveira)"
3. Cliente envia comprovante
4. Agente analisa o comprovante via visão (Sonnet)
5. Se comprovante válido → agente pede o link da música:
   "Recebi o pagamento! Me manda o link da sua música no Spotify que eu já processo pra você!"
6. Agente envia o link para o painel Mind para liberar nas playlists
7. Confirma para o cliente:
   "Pronto! Sua música foi enviada para as playlists. Demora até 72h para o Spotify atualizar os números de plays."
8. Após o status do pedido voltar como "completo" no painel Mind, o agente envia uma mensagem informando que o pedido foi concluído e envia o link das playlists onde a música já estará na primeira posição.

Via Painel:
- Direciona para mindsmmpanel.com
- Cliente faz o pedido diretamente

URGÊNCIA NA VENDA:
Sempre mencionar que é promoção por tempo limitado:
"Essa promoção é por tempo limitado, de R$97 por R$49,90!"

CONFIGURAÇÃO EDITÁVEL:
- Chave PIX (telefone): 24981222957
- Titular: Eliseu Mendes Oliveira
(Atualize aqui sempre que a chave PIX mudar.)
`,
};
