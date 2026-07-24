# Checkpoint — imagens analisadas pelo Claude Sonnet 5

Problema anterior:
- webhook classificava como `image`;
- Agent V3 recebia apenas `[imagem recebida]`;
- system prompt ainda instruía a Júlia a dizer que não conseguia ver.

Fluxo corrigido:
1. detecta imagem no WhatsApp;
2. resolve a mídia via payload ou Uazapi `/message/download`;
3. converte URL temporária para base64 quando possível;
4. passa um content block `image` real para a Anthropic Messages API;
5. usa `claude-sonnet-5` especificamente para turnos com imagem;
6. texto e áudio continuam no Haiku para preservar custo;
7. Sonnet 5 analisa print, tela, erro, comprovante, perfil, postagem ou outra imagem e responde no contexto.

O prompt agora proíbe a falsa resposta "não consigo visualizar a imagem".
