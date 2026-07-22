# Correção Agent V3

Arquivos corrigidos:

- `src/lib/agent-v3/orchestrator.server.ts`
- `src/lib/agent-v3/brain/guards.server.ts`
- `src/routes/api/public/hooks/uazapi-webhook.ts`

## Correções

1. Corrige a interpolação real de `${modulePrompt}`, `${extraContext}` e modos de mídia.
2. Impede o agente de inventar serviços não presentes nos módulos selecionados.
3. Para interesse vago, pergunta somente qual rede social ou serviço o cliente procura.
4. Remove Markdown antes do envio: `**`, `__`, crases, títulos e citações.
5. Quando o cliente envia áudio, transcreve usando OpenAI e responde por áudio com ElevenLabs + Uazapi.
6. Se o envio de áudio falhar ou o ElevenLabs não estiver configurado, responde em texto como fallback.

## Commit sugerido

`Corrige fonte dos módulos, Markdown e resposta por áudio`

## Observação

O build não foi executado neste ambiente porque as dependências do projeto não estavam instaladas (`vite: not found`). Execute localmente:

```bash
npm install
npm run build
```
