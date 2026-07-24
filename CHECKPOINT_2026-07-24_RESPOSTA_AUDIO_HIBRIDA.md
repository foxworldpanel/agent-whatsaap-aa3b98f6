# Checkpoint — resposta híbrida texto/áudio

Base: versão (60) enviada pelo usuário.

Nova política:
- cliente mandar áudio não força resposta em áudio;
- respostas simples continuam em texto;
- ElevenLabs/nota de voz só é usado quando a resposta é mais longa ou complexa.

Critérios atuais para áudio:
- 260+ caracteres; ou
- 4+ frases; ou
- intenção técnica/suporte/tutorial/explicação complexa; ou
- estágio de suporte/resolução/diagnóstico; ou
- linguagem de passo a passo com resposta de pelo menos 160 caracteres.

Se a resposta não atingir esses critérios, segue pelo fluxo normal de texto.

Se áudio for escolhido mas ElevenLabs/Voice ID estiver indisponível, o sistema cai para texto.
