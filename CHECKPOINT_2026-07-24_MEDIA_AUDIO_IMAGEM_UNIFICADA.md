# Checkpoint — mídia inbound unificada

A versão 57 recebida tinha a correção de áudio parcial, mas a correção de visão não estava presente:
- não existia `imageSource`;
- não existia `claude-sonnet-5`;
- o prompt ainda mandava dizer que a Júlia não conseguia ver imagem.

Agora áudio e imagem usam a mesma camada:
1. tenta baixar pelo ID real do webhook;
2. se falhar/vier vazio, consulta `/message/find`;
3. recupera o ID canônico da mensagem de mídia;
4. tenta `/message/download` novamente.

Áudio:
Uazapi -> transcrição nativa quando disponível -> Whisper direto como fallback -> Claude -> ElevenLabs.

Imagem:
Uazapi -> bytes/base64 reais -> Anthropic content block image -> claude-sonnet-5.

Sonnet 5 usa o identificador oficial `claude-sonnet-5`.
