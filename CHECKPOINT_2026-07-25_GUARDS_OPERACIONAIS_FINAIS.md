# Checkpoint — guards operacionais finais

Base: `agent-whatsaap-aa3b98f6-main(77).zip`.

## Correções

### Cadastro
- fonte de verdade no prompt: cadastro = e-mail + senha criada pelo cliente;
- não existe reconhecimento facial, biometria, selfie ou documento no cadastro conhecido;
- guard determinístico substitui respostas que inventem essas exigências.

### Comprovante/Pix
- mantém a regra de não validar banco/recebedor/razão social pela imagem;
- adiciona guard determinístico no pós-processamento;
- se o modelo tentar rejeitar o comprovante por esses dados, a resposta é substituída por orientação segura sobre saldo/pedido.

### Lead Intelligence
- mensagem atual tem precedência;
- histórico recente caiu de 8 para 3 mensagens e serve apenas como apoio;
- "agora consegui", "deu certo", "funcionou" e nova intenção de compra neutralizam bloqueios/abandono antigos;
- abandono depende da mensagem atual, evitando contaminar novos turnos.

### Confirmação de compra
- "já consegui" não marca mais conversão;
- confirmação exige sinais inequívocos como "já paguei", "já comprei" ou "fiz o pedido".
