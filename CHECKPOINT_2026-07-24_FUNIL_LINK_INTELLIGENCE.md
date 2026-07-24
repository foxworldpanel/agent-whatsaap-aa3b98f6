# Checkpoint — funil, links e Lead Intelligence

Base: versão (66).

Correções:
1. Lead Intelligence acumula sinais das últimas 12 mensagens do cliente.
   Uma mensagem "Ok" ou novo gatilho não apaga Spotify + Plays + quantidade + fechamento.
2. Quantidade, sinais de compra e pagamento são considerados ao longo do histórico recente.
3. Links enviados espontaneamente são validados conforme serviço:
   Spotify track / artist / playlist / user; YouTube vídeo vs canal quando aplicável.
4. Spotify Plays de música não aceita orientação para usar link /user/.
5. Durante o funil, novas mensagens do cliente são verificadas entre etapas.
   Se ele disser "mais tarde", "depois falamos", "estou trabalhando" etc.,
   as etapas restantes são canceladas.
6. Cancelamento por adiamento mantém o marcador de funil executado:
   clientes normais não recebem tudo novamente ao repetir o gatilho.
7. O número pessoal de teste 5511970116430 continua sendo a exceção de repetição.
