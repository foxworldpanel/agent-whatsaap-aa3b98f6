# Checkpoint — Menu Conversas como central de auditoria

Base: ZIP (64) enviado pelo usuário.

## Problemas encontrados

1. Lead Intelligence existia no runtime V3 e nos logs, mas a tela Conversas não consultava nem mostrava os dados.
2. `listMessages` dependia do limite padrão do Supabase; conversas muito longas podiam parar em 1.000 mensagens.
3. A sincronização manual trabalhava somente com as 50 conversas locais mais recentes e buscava só 30 mensagens por conversa.
4. A sincronização não criava automaticamente todas as conversas encontradas em `/chat/find`.
5. `photo_url` era exibido na interface, mas contatos criados pelo webhook não hidratavam a foto do WhatsApp.
6. Não havia forma prática de copiar uma conversa inteira para auditoria externa.

## Alterações

### Lead Intelligence
A lista de conversas anexa a inteligência do último `agent_v3_turn`:
- Temperatura
- Confiança
- Intenção
- Estágio
- Probabilidade de Compra
- Sentimento
- Urgência

A tela mostra esses campos em um painel compacto acima do histórico.

### Histórico completo
`listConversations` e `listMessages` passaram a paginar em lotes de 1.000 até terminar.
Assim a interface não depende mais do teto padrão de retorno do Supabase.

### Sincronização WhatsApp
O botão Sincronizar agora:
- consulta `/chat/find`;
- cria contatos/conversas ausentes;
- atualiza nome e foto;
- remove o limite local de 50 conversas;
- busca até 500 mensagens recentes por conversa para backfill;
- mantém transcrições já produzidas pelo Agent V3.

### Fotos
- sincronização usa imagem retornada por `/chat/find`;
- se faltar, tenta `GetNameAndImageURL`;
- o webhook também hidrata a foto quando chega mensagem de contato sem `photo_url`.

### Copiar conversa
Novo botão `Copiar conversa` gera texto cronológico com:
- data e hora;
- Cliente/Mind Global;
- todas as mensagens carregadas;
- marca de áudio + transcrição;
- Lead Intelligence no final.

Isso permite colar a conversa diretamente no ChatGPT para análise.
