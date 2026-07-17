/**
 * Serviços de IA Compartilhados (Camada Neutra).
 * Transcrição, TTS, Visão e Classificação desacoplados da V1.
 */

import { Buffer } from "buffer";

/**
 * Transcrição de áudio via Whisper (OpenAI).
 */
export async function transcribeAudioUrl(audioUrl: string, openaiApiKey?: string): Promise<string> {
  const key = openaiApiKey || process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY ausente");

  const audio = await fetch(audioUrl);
  if (!audio.ok) throw new Error(`Falha ao baixar áudio (${audio.status})`);
  const blob = await audio.blob();
  const headerMime = (blob.type || "").split(";")[0].trim().toLowerCase();
  
  const ext =
    headerMime.includes("mpeg") ? "mp3" :
    headerMime.includes("mp4") || headerMime.includes("m4a") ? "m4a" :
    headerMime.includes("wav") ? "wav" :
    headerMime.includes("webm") ? "webm" :
    headerMime.includes("flac") ? "flac" : "ogg";

  const form = new FormData();
  form.append("model", "whisper-1");
  form.append("file", blob, `audio.${ext}`);

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Whisper falhou (${res.status}): ${t.slice(0, 300)}`);
  }
  const json = (await res.json()) as { text?: string };
  return (json.text ?? "").trim();
}

/**
 * Geração de Voz via ElevenLabs.
 */
export async function ttsElevenLabsBase64(params: {
  apiKey: string;
  voiceId: string;
  text: string;
}): Promise<string> {
  const { apiKey, voiceId, text } = params;
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.4, use_speaker_boost: true },
      }),
    },
  );
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`ElevenLabs falhou (${res.status}): ${t.slice(0, 300)}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  return `data:audio/mpeg;base64,${buf.toString("base64")}`;
}

/**
 * Visão: Descreve uma tela do painel.
 */
export async function describePanelScreen(params: {
  imageUrl: string;
  name: string;
  description?: string | null;
}): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY ausente");

  const img = await fetch(params.imageUrl);
  if (!img.ok) throw new Error(`Falha ao baixar imagem (${img.status})`);
  const mediaType = img.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
  const b64 = Buffer.from(await img.arrayBuffer()).toString("base64");

  const userText = `Esta é uma tela do painel Mind SMM chamada "${params.name}".${
    params.description ? ` Contexto do dono: ${params.description}.` : ""
  }\n\nDescreva minuciosamente o que aparece na tela: todos os botões (com o texto exato), campos de formulário, menus, abas, links, valores, mensagens visíveis e a ordem visual dos elementos. Inclua um passo a passo claro de como o usuário deve agir nessa tela (onde clicar primeiro, o que preencher, qual botão final). Seja específico — outra IA vai usar essa descrição para guiar clientes sem ver a imagem.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 1500,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: b64 } },
            { type: "text", text: userText },
          ],
        },
      ],
    }),
  });
  
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Claude Vision falhou (${res.status}): ${t.slice(0, 300)}`);
  }
  const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  return (json.content?.find((c) => c.type === "text")?.text ?? "").trim();
}

/**
 * Classifica a temperatura do lead.
 */
export type LeadTemperatura = "quente" | "morno" | "frio" | "cliente" | "bloqueado";

export async function classifyLeadTemperature(params: {
  history: Array<{ sender: "agente" | "cliente"; body: string }>;
}): Promise<LeadTemperatura | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const transcript = params.history
    .slice(-12)
    .map((m) => `${m.sender === "cliente" ? "CLIENTE" : "AGENTE"}: ${m.body}`)
    .join("\n");
  if (!transcript.trim()) return null;

  const system =
    'Você classifica leads de vendas no WhatsApp. Responda APENAS com um JSON {"temperatura":"quente"|"morno"|"frio"|"cliente"|"bloqueado"}. Critérios: ' +
    'quente = perguntou preço, pediu link, disse que quer comprar, perguntou como pagar. ' +
    'morno = demonstrou interesse mas tem dúvidas, pediu mais informações, perguntou se funciona. ' +
    'frio = respostas curtas/monossilábicas, pouco engajamento, não perguntou nada. ' +
    'cliente = confirmou compra/pagamento, enviou comprovante, mencionou PIX feito, disse "paguei"/"fechei", confirmou pedido. ' +
    'bloqueado = pediu para parar, disse que não tem interesse, xingou.';

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-3-haiku-20240307",
        max_tokens: 64,
        system,
        messages: [{ role: "user", content: `Histórico:\n${transcript}\n\nResponda apenas com o JSON.` }],
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const raw = json.content?.find((c) => c.type === "text")?.text ?? "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as { temperatura?: string };
    const t = (parsed.temperatura ?? "").toLowerCase();
    if (t === "quente" || t === "morno" || t === "frio" || t === "cliente" || t === "bloqueado") return t;
    return null;
  } catch {
    return null;
  }
}

/**
 * Extrai fatos persistentes de uma análise de imagem.
 */
export async function extractDurableContextFromImageReply(params: {
  imageReply: string;
  clientMessage?: string | null;
}): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return "";
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-3-haiku-20240307",
        max_tokens: 200,
        system:
          'Você extrai FATOS PERSISTENTES de uma análise de imagem feita por outro agente em uma conversa de vendas SMM. Esses fatos serão lembrados pelo agente nas próximas mensagens, então só inclua o que for útil para evitar perguntas repetidas (ex.: cliente já tem cadastro no painel, cliente tem saldo de R$X, cliente enviou comprovante de R$X via PIX, pedido ID Y está em status Z, link do vídeo do cliente é tal). Ignore opiniões, instruções e cortesia. Responda APENAS com 0 a 2 linhas no formato "- <fato curto>". Se não houver fato relevante, responda exatamente "NONE".',
        messages: [
          {
            role: "user",
            content: `Última mensagem do cliente: ${params.clientMessage ?? "(sem texto)"}\n\nResposta gerada após analisar a imagem:\n${params.imageReply}`,
          },
        ],
      }),
    });
    if (!res.ok) return "";
    const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const txt = (json.content?.find((c) => c.type === "text")?.text ?? "").trim();
    if (!txt || /^none$/i.test(txt)) return "";
    return txt;
  } catch {
    return "";
  }
}
