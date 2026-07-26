# Checkpoint — Funil primeiro, Agent depois + Lead Intelligence

Base: ZIP (79) enviado em 26/07/2026.

## Erro do Lead Intelligence
Caso real Spotify/Playlist:
- cliente escolheu Spotify;
- escolheu Playlist;
- definiu gênero;
- recebeu preço;
- corrigiu link álbum -> track;
- recebeu orientação para painel.

Antes terminava: Frio / Outro / Qualificação / 20%.

Correção:
- link de plataforma + plataforma/produto conhecidos = evidência objetiva de fechamento;
- mínimo 85% de probabilidade;
- Temperatura Quente;
- Intenção Compra;
- Estágio Fechamento (ou Pagamento quando houver sinal de pagamento);
- estado estruturado do runtime prevalece sobre fallback fraco do selector antes do log.

## Funil
Causa principal encontrada:
1. o funil cancelava as etapas restantes quando o cliente mandava qualquer mensagem durante a sequência;
2. uma nova mensagem que NÃO repetia o gatilho podia passar direto para o Agent V3 enquanto o funil ainda rodava;
3. contatos já classificados como cliente/ativo eram excluídos do gatilho.

Correção:
- mensagem do cliente não cancela mais áudio/link/vídeo/tabela;
- `welcome_funnel_runs.status=running` bloqueia qualquer chamada ao Agent V3;
- o bloqueio é global, não depende da nova mensagem repetir o gatilho;
- ao terminar, status vira `completed`;
- se o cliente falou durante o funil, a última mensagem textual é retomada somente depois da conclusão;
- gatilho vale também para cliente antigo, mantendo a regra uma vez por contato;
- run travado por crash há mais de 15 min é liberado para recuperação;
- falha técnica permite retry.

## Contatos reparados
A migration remove o marcador antigo de funil apenas destes contatos:
- +55 14 99191-5367
- +55 31 9251-2549
- +55 21 97469-6090

Assim eles poderão reenviar o gatilho e testar o funil completo.
