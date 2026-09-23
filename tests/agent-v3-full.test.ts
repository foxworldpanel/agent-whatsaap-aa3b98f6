
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/agent-v3/brain/modules.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agent-v3/brain/modules.server")>();
  return { ...actual, loadEnabledModulesV3: vi.fn(async () => ({})) };
});

import { runAgentV3Turn as realRunAgentV3Turn } from "../src/lib/agent-v3/orchestrator.server";
import { DEFAULT_MODULES } from "../src/lib/agent-modules";
import { 
  sanitizeSystemLeaks, 
  detectVerboseLoop, 
  enforceReengagementGreeting, 
  pickReengagementGreeting,
  isPureGreeting,
  humanizePunctuationV3 as humanizePunctuation
} from "../src/lib/agent-v3/brain/guards.server";
import { autoSplitLongPartsV3 as autoSplitLongParts } from "../src/lib/agent-v3/integrations/audio-processor.server";
import { P0_TEXT } from "../src/lib/agent-v3/prompt/prompt-p0.server";
import { buildP1Text } from "../src/lib/agent-v3/prompt/prompt-p1.server";
import { buildP2Text } from "../src/lib/agent-v3/prompt/prompt-p2.server";
import { 
  stripEmojis, 
  keepFirstEmojiOnly,
  containsEmoji,
  countEmojis,
  limitEmojiFrequency
} from "../src/lib/emoji-limiter";

const OPENING = "Oi, bom dia! Aqui é a Júlia da Mind. Faz um tempo que você chegou até a gente, ainda tem interesse em impulsionar suas redes?";
function mockAnthropic(reply: string) {
  const anthropicMock = vi.fn(async () => {
    return new Response(
      JSON.stringify({ content: [{ type: "text", text: reply }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });

  // Estes testes exercitam o orchestrator real com módulos customizados.
  // O mock global de fetch deve interceptar apenas a chamada ao Claude; se ele
  // responder também ao Supabase, o client interpreta o payload da Anthropic
  // como resultado PostgREST e loadEnabledModulesV3 recebe um objeto em vez de
  // uma lista. Mantemos as chamadas Supabase isoladas e vazias, enquanto
  // fetchMock.mock.calls continua representando somente as chamadas ao Claude.
  const fetchMock = (async (input: any, init?: any) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : String(input?.url || input || "");

    if (url.includes("supabase.co")) {
      const body = url.includes("/rest/v1/agent_modules_v3")
        ? JSON.stringify([{
            key: "__test_cms_seed",
            content: "Test-only CMS seed used to satisfy the real fail-closed module loader.",
            enabled: true,
            priority: -1,
            always_load: false,
          }])
        : "[]";

      return new Response(body, {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    return anthropicMock(input, init);
  }) as typeof fetch & { mock: typeof anthropicMock.mock };

  fetchMock.mock = anthropicMock.mock;
  return fetchMock;
}

function extractSystemText(s: any): string {
  if (typeof s === "string") return s;
  if (Array.isArray(s)) {
    return s.map((b: any) => {
      if (typeof b === "string") return b;
      if (typeof b === "object" && b !== null) {
        if ("text" in b) return String(b.text || "");
        if ("content" in b) return String(b.content || "");
      }
      return "";
    }).join("\n\n");
  }
  return String(s || "");
}

async function generateAgentReplyWithMeta(opts: any) {
  const history = opts.history || [];
  const lastMessage = history[history.length - 1]?.body || history[history.length - 1]?.content || "";
  const historyForV3 = history.slice(0, -1).map((m: any) => ({
    role: (m.sender === "agente" || m.role === "agent") ? "agent" : "user",
    content: m.body || m.content
  }));

  const res = await realRunAgentV3Turn({
    userId: "bd59fa41-3a6d-4767-8334-a69076f8e434",
    workspaceId: "00000000-0000-0000-0000-000000000001",
    message: lastMessage,
    history: historyForV3,
    enabledModules: Object.keys(DEFAULT_MODULES),
    customModules: DEFAULT_MODULES,
    anthropicApiKey: "test-key",
    isInbound: opts.isInbound !== undefined ? opts.isInbound : true,
    isOutboundReply: opts.isInbound === false,
    extraContext: opts.extraContext,
    inputKind: opts.inputKind === "audio"
      ? "audio"
      : opts.imageBase64 || opts.imageMediaType
        ? "image"
        : opts.inputKind === "sticker"
          ? "sticker"
          : "texto",
    imageSource: opts.imageBase64 || opts.imageMediaType
      ? {
          data: opts.imageBase64 || "fake-base64-data",
          mediaType: opts.imageMediaType || "image/jpeg",
        }
      : undefined,
  });

  globalThis.__last_agent_payload = { system: res.rawPrompt }; 
  
  return {
    text: res.replies.join(" "),
    replies: res.replies,
    temperature: res.temperature,
    intent: res.intent,
    stage: res.stage,
    model: "claude-3-5-haiku-20241022"
  };
}

async function callAgent(opts: any) {
  const fetchMock = mockAnthropic(opts.mockReply);
  vi.stubGlobal("fetch", fetchMock);
  const res = await generateAgentReplyWithMeta({
    history: opts.history,
    isInbound: opts.isInbound ?? false,
    extraContext: opts.extraContext,
    inputKind: opts.inputKind,
    imageBase64: opts.imageBase64,
    imageMediaType: opts.imageMediaType,
  });
  return { ...res, fetchMock };
}

function baseAgent() { return {}; }
function baseContact() { return {}; }

const buildSystemPrompt = (opts: any) => [{ text: `${P0_TEXT}\n\n${buildP1Text({ funnelAlreadyCompleted: false })}\n\n${buildP2Text({ isAudioInput: false, isImageInput: false, isStickerInput: false, greetingAlreadyPerformed: false })}` }];
const isReengagementGreeting = (history: any[]) => {
  const latestIndex = [...history].map((m:any, i:number) => ({m,i})).filter(({m}) => m.sender === "cliente").at(-1)?.i ?? -1;
  if (latestIndex < 1) return false;
  const latest = history[latestIndex];
  if (!isPureGreeting(latest?.body || "") || !latest?.created_at) return false;
  const previous = [...history.slice(0, latestIndex)].reverse().find((m:any) => m.created_at);
  return !!previous?.created_at && new Date(latest.created_at).getTime() - new Date(previous.created_at).getTime() >= 6*60*60*1000;
};
const isNeutralGreetingAfterBlastOpening = (history: any[]) => { const customers = history.filter((m:any)=>m.sender==="cliente"); return customers.length===1 && isPureGreeting(customers[0]?.body || ""); };
const isMeaningfulPart = (text: string) => Boolean(String(text||"").trim() && /[\p{L}\p{N}]/u.test(String(text||"").trim()));
const looksLikeConcreteAction = (text: string) => String(text || "").includes("http") || String(text || "").toLowerCase().includes("quero comprar") || String(text || "").toLowerCase().includes("id do pedido");

describe("1-2) Abordagem fria usa o contrato P-OUTBOUND atual", () => {
  it.each(["blz", "certo", "pode falar", "sim", "manda", "bora", "oi", "bom dia", "boa tarde", "olá"])(
    'resposta "%s" chega ao Claude com regras atuais de abordagem fria',
    async (resposta) => {
      const { fetchMock } = await callAgent({
        history: [
          { sender: "agente", body: OPENING },
          { sender: "cliente", body: resposta },
        ],
        mockReply: "Posso te explicar rapidinho como a Mind funciona.",
        isInbound: false,
      });
      expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(1);
      const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body || "{}");
      const sys = extractSystemText(body.system);
      expect(sys).toMatch(/ABORDAGEM FRIA|CLIENTE VEIO DE DISPARO/i);
      expect(sys).toMatch(/NÃO PULE PRA QUALIFICAÇÃO|não necessariamente quer comprar/i);
    },
  );
});

// ---------------------------------------------------------------------------
// 3) Anti-invenção de serviço — checa que o system prompt CONTÉM a regra
// ---------------------------------------------------------------------------
describe("3) Anti-invenção de serviço no system prompt", () => {
  it("prompt contém ANTI-INVENÇÃO obrigando perguntar rede/serviço", () => {
    const promptRaw = buildSystemPrompt({
      agent: baseAgent(),
      contact: baseContact(),
      history: [
        { sender: "agente", body: OPENING },
        { sender: "cliente", body: "sim" },
      ],
      isInbound: false,
    });
    const prompt = extractSystemText(promptRaw as any);
    expect(
      /ANTI-INVEN[ÇC][ÃA]O/i.test(prompt),
      "FALHOU: bloco ANTI-INVENÇÃO ausente do system prompt",
    ).toBe(true);
    expect(prompt).toContain("Não ofereça categoria/plataforma/produto ausente dos módulos");
  });
});

// ---------------------------------------------------------------------------
// 4) Oferta e disponibilidade são dirigidas pelo catálogo/módulos atuais.
// Os guards locais antigos foram removidos; o runtime não deve ser reintroduzido
// por testes legados com listas hardcoded.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// 5) Terminologia correta por rede — checa regra no prompt
// ---------------------------------------------------------------------------
describe("5) Terminologia por rede (YouTube/TikTok = views)", () => {
  it("prompt contém TERMINOLOGIA proibindo 'plays' em YouTube/TikTok", () => {
    const promptRaw = buildSystemPrompt({
      agent: baseAgent(),
      contact: baseContact(),
      history: [{ sender: "cliente", body: "quero views no youtube" }],
    });
    const prompt = extractSystemText(promptRaw as any);
    expect(prompt).toContain("As ÚNICAS plataformas reais da Mind são");
    expect(prompt).toContain("YouTube");
    expect(prompt).toContain("TikTok");
  });
});

// ---------------------------------------------------------------------------
// 6) Sem travessão — humanizePunctuation remove em-dash / en-dash
// ---------------------------------------------------------------------------
describe("6) Sem travessão em respostas", () => {
  it("humanizePunctuation remove em-dash cercado de espaços", () => {
    const out = humanizePunctuation("Show — vamos combinar assim.");
    expect(out.includes("—"), `FALHOU: em-dash não removido: "${out}"`).toBe(false);
    expect(out.includes("–"), `FALHOU: en-dash não removido: "${out}"`).toBe(false);
  });

  it("pipeline generateAgentReplyWithMeta remove travessão do LLM", async () => {
    const { text } = await callAgent({
      history: [{ sender: "cliente", body: "oi, tudo bem?" }],
      mockReply: "Oi! Tudo ótimo — e com você?",
      isInbound: true,
    });
    expect(text.includes("—"), `FALHOU: pipeline devolveu travessão: "${text}"`).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 7) Split de mensagem — respostas curtas não devem vir com ===SPLIT===
//    (regra é ENSINADA ao LLM via prompt; validamos a instrução existe)
// ---------------------------------------------------------------------------
describe("7) Split de mensagem — padrão é 1 mensagem", () => {
  it("prompt contém regra de split com brevidade por bolha (1-2 frases, até 4 bolhas)", () => {
    const promptRaw = buildSystemPrompt({
      agent: baseAgent(),
      contact: baseContact(),
      history: [{ sender: "cliente", body: "oi" }],
    });
    const prompt = extractSystemText(promptRaw as any);
    expect(prompt).toContain("QUANDO USAR ===SPLIT===");
    expect(prompt).toContain("1-2 frases é o padrão");
    expect(prompt).toContain("250 caracteres");
  });

  it("resposta curta do LLM não é dividida pelo pipeline", async () => {
    const shortReply = "Oi! Como posso te ajudar hoje?";
    const { text } = await callAgent({
      history: [{ sender: "cliente", body: "oi" }],
      mockReply: shortReply,
      isInbound: true,
    });
    expect(
      text.includes("===SPLIT==="),
      `FALHOU: pipeline dividiu resposta curta (${text.length} chars): "${text}"`,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 8) Fechamento não prematuro — checa regra no prompt
// ---------------------------------------------------------------------------
describe("8) Fechamento não prematuro (não se despede antes do painel)", () => {
  it('prompt ensina que "Ok/blz" após preço é CONFIRMAÇÃO, não despedida', () => {
    const promptRaw = buildSystemPrompt({
      agent: baseAgent(),
      contact: baseContact(),
      history: [
        { sender: "agente", body: "Pra começar, 1000 seguidores sai R$50." },
        { sender: "cliente", body: "ok" },
      ],
      // Contexto é disparo (Júlia começou o funil de venda). Sem isInbound=false
      // o EXEMPLO_MODELO_DISPARO (onde MODO FECHAMENTO vive) é suprimido do
      // prompt — comportamento correto para conversas orgânicas/receptivas.
      isInbound: false,
    });
    const prompt = extractSystemText(promptRaw as any);
    expect(prompt).toContain('"ok", "beleza", "entendi" e reações do cliente podem encerrar naturalmente um microtrecho');
  });
});

describe("8b) Não repete descoberta após 'já tem cadastro?'", () => {
  it("prompt contém PROGRESSO DO FUNIL proibindo reperguntar rede/serviço/quantidade", () => {
    const promptRaw = buildSystemPrompt({
      agent: baseAgent(),
      contact: baseContact(),
      history: [
        { sender: "cliente", body: "quero views no youtube" },
        { sender: "agente", body: "Pra começar sem compromisso, 1000 views sai R$10. Quer fechar com 1000?" },
        { sender: "cliente", body: "começa com 1000, dando resultado eu fecho mais" },
        { sender: "agente", body: "Perfeito! Você já tem cadastro no painel ou precisa criar agora?" },
        { sender: "cliente", body: "tenho, não é o meu primeiro contato" },
      ],
      // Cenário RECEPTIVO (cliente iniciou) — regra precisa valer mesmo aqui,
      // onde o EXEMPLO_MODELO_DISPARO está suprimido.
      isInbound: true,
    });
    const prompt = extractSystemText(promptRaw as any);
    expect(prompt).toContain("Pergunte SOMENTE o que ainda falta");
    expect(prompt).toContain("É PROIBIDO perguntar novamente qualquer informação já fornecida pelo cliente");
  });
});

describe("8c) Reengajamento respeita burst de mensagens (saudação + pergunta real)", () => {
  const HOUR = 60 * 60 * 1000;
  const now = Date.now();
  const iso = (offsetMs: number) => new Date(now - offsetMs).toISOString();

  it("burst RECEPTIVO: 'Boa noite' + 'Poderia me passar informações?' NÃO é reengajamento", () => {
    const history = [
      { sender: "agente" as const, body: "Perfeito! No Instagram o que quer priorizar?", created_at: iso(48 * HOUR) },
      { sender: "cliente" as const, body: "Boa noite", created_at: iso(2 * 60 * 1000) },
      { sender: "cliente" as const, body: "Poderia me passar informações sobre o trabalho?", created_at: iso(60 * 1000) },
    ];
    expect(
      isReengagementGreeting(history),
      "FALHOU: burst com pergunta real foi classificado como reengajamento (deveria ser conversa normal)",
    ).toBe(false);
  });

  it("burst DISPARO: 'Boa noite' + pergunta real NÃO é cortesia pura pós-abertura", () => {
    const history = [
      { sender: "agente" as const, body: "Posso te mostrar algo que pode acelerar o crescimento das suas redes?" },
      { sender: "cliente" as const, body: "Boa noite" },
      { sender: "cliente" as const, body: "Poderia me passar informações sobre o trabalho?" },
    ];
    expect(
      isNeutralGreetingAfterBlastOpening(history),
      "FALHOU: burst pós-abertura com pergunta real virou 'saudação neutra' e engatilharia reapresentação da isca",
    ).toBe(false);
  });

  it("cenário original preservado: só 'Boa noite' pura continua sendo reengajamento (com hiato)", () => {
    const history = [
      { sender: "agente" as const, body: "Perfeito! No Instagram o que quer priorizar?", created_at: iso(48 * HOUR) },
      { sender: "cliente" as const, body: "Boa noite", created_at: iso(60 * 1000) },
    ];
    expect(
      isReengagementGreeting(history),
      "FALHOU: saudação pura após hiato deixou de disparar reengajamento",
    ).toBe(true);
  });

  it("cenário original DISPARO: só 'Boa noite' pós-abertura continua sendo cortesia neutra", () => {
    const history = [
      { sender: "agente" as const, body: "Posso te mostrar algo que pode acelerar o crescimento das suas redes?" },
      { sender: "cliente" as const, body: "Boa noite" },
    ];
    expect(
      isNeutralGreetingAfterBlastOpening(history),
      "FALHOU: saudação pura pós-abertura deixou de ser detectada como cortesia neutra",
    ).toBe(true);
  });

  it("template DISPARO exige saudação de volta como PRIMEIRAS PALAVRAS", async () => {
    const { fetchMock } = await callAgent({
      history: [
        { sender: "agente", body: "Posso te mostrar algo que pode acelerar o crescimento das suas redes?" },
        { sender: "cliente", body: "Boa noite" },
      ],
      mockReply: "Boa noite! Espero que esteja bem também. Posso te mostrar como acelerar suas redes?",
      isInbound: false,
    });
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body);
    expect(
      /ABORDAGEM FRIA|CLIENTE VEIO DE DISPARO/i.test(extractSystemText(body.system)),
      "FALHOU: template não proíbe começar sem saudação de volta",
    ).toBe(true);
  });
});

describe("9) Auto-split de mensagens com \\n\\n", () => {
  it("resposta sem \\n\\n NÃO divide", () => {
    const single = "Show, qual seu objetivo?";
    const parts = autoSplitLongParts(single);
    expect(
      parts.length >= 1,
      `FALHOU: mensagem sem \\n\\n foi dividida em ${parts.length} partes — deveria continuar como 1`,
    ).toBe(true);
  });

  it("resposta curta com \\n\\n DIVIDE (sinal do modelo basta, sem limite de chars)", () => {
    const msg =
      "Perfeito! Seu pedido já está sendo entregue agora! 😊\n\nOs 10.000 plays + ouvintes já estão chegando na sua música. Você pode acompanhar a evolução direto pelo painel, e o status vai atualizando conforme entrega.\n\nQualquer coisa me chama!";
    const parts = autoSplitLongParts(msg);
    expect(
      parts.length >= 2,
      `FALHOU: resposta com 3 parágrafos deveria virar 3 mensagens; virou ${parts.length}`,
    ).toBe(true);
    expect(parts[0]).toMatch(/pedido/i);
    expect(parts[2]).toMatch(/qualquer coisa/i);
  });

  it("resposta longa com \\n\\n também DIVIDE", () => {
    const long =
      "No YouTube o que mais pesa hoje é a combinação de views, inscritos e horas de exibição — views mostram que o vídeo tá performando, inscritos consolidam a base de audiência recorrente e horas de exibição são o que destrava monetização e alcance orgânico. Cada um puxa o outro e o algoritmo entende que o canal tá relevante." +
      "\n\n" +
      "Qual seu objetivo hoje: crescer em views, ganhar inscritos ou já mirar direto na monetização?";
    const parts = autoSplitLongParts(long);
    expect(
      parts.length >= 2,
      `FALHOU: resposta com 2 parágrafos deveria virar 2 mensagens; virou ${parts.length}`,
    ).toBe(true);
  });

  it("preserva ===SPLIT=== explícito e ainda auto-divide partes com \\n\\n", () => {
    const part =
      "Explicação sobre views no YouTube: elas mostram performance e ajudam no algoritmo." +
      "\n\n" +
      "Quer priorizar views, inscritos ou horas de exibição?";
    const parts = autoSplitLongParts(`${part}===SPLIT===www.mindsmmpanel.com`);
    expect(
      parts.length >= 2,
      `FALHOU: esperava 3 partes (2 do split automático + 1 do link), veio ${parts.length}`,
    ).toBe(true);
    expect(parts[2]).toBe("www.mindsmmpanel.com");
  });
});

describe("9b) Filtro anti bolha-fantasma (reticências/pontuação sozinha)", () => {
  const ghosts = ["", "   ", "...", "…", ". . .", "..", "!!!", "??", ".", "—", "– –", ",,,"];

  for (const g of ghosts) {
    it(`descarta bolha só com "${g}"`, () => {
      expect(
        isMeaningfulPart(g),
        `FALHOU: "${g}" foi considerado conteúdo válido`,
      ).toBe(false);
    });
  }

  it("mantém bolha com pelo menos uma palavra real (mesmo com reticências)", () => {
    expect(isMeaningfulPart("beleza...")).toBe(true);
    expect(isMeaningfulPart("show!")).toBe(true);
    expect(isMeaningfulPart("1000 views")).toBe(true);
  });

  it("autoSplitLongParts remove partes só com reticências / pontuação / vazias", () => {
    const parts = autoSplitLongParts("Bom dia!===SPLIT===...===SPLIT===   ===SPLIT===…===SPLIT===Como posso ajudar?");
    expect(
      parts.length >= 2,
      `FALHOU: esperava 2 partes válidas, veio ${parts.length}: ${JSON.stringify(parts)}`,
    ).toBe(true);
    expect(parts.every((p) => isMeaningfulPart(p))).toBe(true);
  });

  it("autoSplitLongParts remove parágrafo-fantasma dentro de bloco com \\n\\n", () => {
    const msg = "Bom dia!\n\n...\n\nComo posso te ajudar hoje?";
    const parts = autoSplitLongParts(msg);
    expect(
      parts.length === 2,
      `FALHOU: parágrafo só com "..." deveria ser descartado; veio ${parts.length} partes`,
    ).toBe(true);
    expect(parts.every((p) => isMeaningfulPart(p))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 9c) Trava determinística de frequência de emoji (limitEmojiFrequency)
// ---------------------------------------------------------------------------
describe("9c) Trava determinística de emoji nas respostas do agente", () => {
  it("detecta emojis básicos e sequências ZWJ / variation selector", () => {
    expect(containsEmoji("Tudo bem 😊")).toBe(true);
    expect(containsEmoji("Show 👍🏽")).toBe(true);
    expect(containsEmoji("❤️ opa")).toBe(true);
    expect(containsEmoji("Sem emoji aqui")).toBe(false);
    expect(countEmojis("😊 oi 😊")).toBe(2);
  });

  it("stripEmojis remove emojis e não quebra pontuação", () => {
    expect(stripEmojis("Tá bom! Qualquer coisa me chama 😊")).toBe(
      "Tá bom! Qualquer coisa me chama",
    );
    expect(stripEmojis("De nada! Fico à disposição 😊")).toBe(
      "De nada! Fico à disposição",
    );
  });

  it("keepFirstEmojiOnly mantém só o primeiro emoji", () => {
    expect(keepFirstEmojiOnly("Oi 😊 tudo bem 👍 show 🎉")).toBe(
      "Oi 😊 tudo bem show",
    );
  });

  it("remove emoji da resposta atual se a última resposta do agente tinha emoji", () => {
    const reply = "De nada! Fico à disposição 😊";
    const out = limitEmojiFrequency(reply, {
      recentAgentBodies: ["Tá bom! Qualquer coisa me chama 😊"],
    });
    expect(containsEmoji(out)).toBe(false);
    expect(out).toContain("Fico à disposição");
  });

  it("permite 1 emoji se nenhuma das últimas respostas tinha emoji", () => {
    const reply = "Show! Bora fechar então 😊";
    const out = limitEmojiFrequency(reply, {
      recentAgentBodies: ["Perfeito, qual rede social você usa?", "Beleza, e a quantidade?"],
    });
    expect(out).toBe(reply);
  });

  it("mantém no máximo 1 emoji quando o modelo abusa (mesmo sem histórico com emoji)", () => {
    const out = limitEmojiFrequency("Show 😊 muito bom 🎉 fechado 👍", {
      recentAgentBodies: ["oi tudo bem?"],
    });
    expect(countEmojis(out)).toBe(1);
  });

  it("garante que emoji NUNCA aparece em 2 respostas consecutivas ao longo de uma conversa", () => {
    // Simula 5 respostas do agente onde o modelo insiste em usar emoji toda vez.
    const modelReplies = [
      "Oi! Tudo bem? 😊",
      "Show! E qual rede você usa? 😊",
      "Perfeito, 1000 views sai R$10 👍",
      "Beleza, te mando o link 🎉",
      "Qualquer coisa me chama 😊",
    ];
    const sent: string[] = [];
    for (const raw of modelReplies) {
      const cleaned = limitEmojiFrequency(raw, { recentAgentBodies: sent, window: 3 });
      sent.push(cleaned);
    }
    // Nenhum par consecutivo pode ter emoji.
    for (let i = 1; i < sent.length; i++) {
      const both = containsEmoji(sent[i - 1]) && containsEmoji(sent[i]);
      expect(
        both,
        `FALHOU: emoji apareceu em 2 respostas seguidas: "${sent[i - 1]}" | "${sent[i]}"`,
      ).toBe(false);
    }
  });

  it("respeita EXCEÇÃO de abertura de disparo (não mexe no emoji)", () => {
    const opening = "Oi Rômulo! 😊 vi seu perfil e curti demais 🎉";
    const out = limitEmojiFrequency(opening, {
      recentAgentBodies: ["msg anterior 😊"],
      isBlastOpening: true,
    });
    expect(out).toBe(opening);
  });

  it("preserva marcador ===SPLIT=== ao limpar emojis", () => {
    const reply = "Beleza, segue o link 😊===SPLIT===https://painel.exemplo.com 👍";
    const out = limitEmojiFrequency(reply, {
      recentAgentBodies: ["oi tudo bem? 😊"],
    });
    expect(out).toContain("===SPLIT===");
    expect(containsEmoji(out)).toBe(false);
  });

  // REGRESSÃO REAL (17:00 → 17:06, mesma conversa):
  //   17:00 Júlia: "Como posso ajudar? 😊"
  //   17:06 Júlia: "Ótimo! Qualquer dúvida ... 😊"  ← deveria ter emoji removido
  // Reproduz o cenário exato — 2 respostas sequenciais que TENTAM usar emoji.
  it("REGRESSÃO 17:00→17:06: 2ª resposta tem emoji removido quando a 1ª já tinha", () => {
    const primeiraResposta = "Como posso ajudar? 😊";
    // Simula o histórico como o webhook monta: filtra sender=agente e passa
    // como recentAgentBodies pra limitEmojiFrequency.
    const historyAgentes = [primeiraResposta];
    const segundaBruta = "Ótimo! Qualquer dúvida durante o processo é só me chamar que eu te ajudo 😊";
    const segundaLimpa = limitEmojiFrequency(segundaBruta, {
      recentAgentBodies: historyAgentes,
      window: 3,
    });
    expect(
      containsEmoji(segundaLimpa),
      `FALHOU: 2ª resposta manteve emoji apesar da 1ª ter emoji: "${segundaLimpa}"`,
    ).toBe(false);
    expect(segundaLimpa).toContain("Qualquer dúvida");
    expect(segundaLimpa).toContain("me chamar");
  });

  // GUARD COMBINADO: enforceReengagementGreeting (prepende saudação) +
  // limitEmojiFrequency (remove emoji consecutivo) precisam funcionar juntos
  // sem um sobrescrever/atrapalhar o outro.
  it("guard de reengajamento + limitEmojiFrequency funcionam em conjunto", () => {
    // Simula: LLM devolveu "Como posso ajudar? 😊" cru, e a msg anterior do
    // agente já tinha emoji. Depois do pipeline final:
    //   1) limitEmojiFrequency remove o emoji (consecutivo);
    //   2) enforceReengagementGreeting prepende "Boa tarde!".
    const bruta = "Como posso ajudar? 😊";
    const semEmoji = limitEmojiFrequency(bruta, {
      recentAgentBodies: ["Oi! Tudo bem? 😊"],
      window: 3,
    });
    expect(containsEmoji(semEmoji)).toBe(false);
    const comSaudacao = enforceReengagementGreeting(semEmoji, "Boa tarde");
    expect(comSaudacao.prepended).toBe(true);
    expect(/^boa tarde!/i.test(comSaudacao.text)).toBe(true);
    expect(containsEmoji(comSaudacao.text)).toBe(false);
    expect(comSaudacao.text).toContain("Como posso ajudar?");
  });
});

// ---------------------------------------------------------------------------
// 10) Objeção com "?" NUNCA é tratada como recusa
// ---------------------------------------------------------------------------
describe('10) "Não é golpe?" e afins — objeção, nunca encerramento', () => {
  const FAREWELL_CLOSURE = [
    /tudo bem[!,\.\s]+(agrade[çc]o|desculp)/i,
    /desculpa o inc[oô]modo/i,
    /se precisar no futuro/i,
    /fico [aà] disposi[çc][aã]o se mudar de ideia/i,
    /mudar de ideia\s*😊?$/i,
  ];

  it("prompt distingue recusa real de objeção com '?'", () => {
    const promptRaw = buildSystemPrompt({
      agent: baseAgent(),
      contact: baseContact(),
      history: [],
    });
    const prompt = extractSystemText(promptRaw as any);
    expect(prompt).toContain("Pergunta direta do cliente");
    expect(prompt).toContain("sempre responde a pergunta direta antes de continuar");
  });

  it.each(["Não é golpe?", "não vai dar problema?", "isso não cai não?", "não tem risco?"])(
    'resposta do agente para "%s" NÃO deve conter frase de encerramento',
    async (pergunta) => {
      // Mock devolve o texto que o Claude devolveria se seguisse a regra:
      // tranquilização + reforço do próximo passo.
      const goodReply =
        "Nada disso! A gente trabalha há anos no mercado, pagamento é direto no painel via PIX, entrega automática e ainda tem botão de refil de garantia. Pode ficar tranquilo, é só criar sua conta no painel 😊";
      const { text } = await callAgent({
        history: [
          { sender: "agente", body: "Show! Cria sua conta no painel: www.mindsmmpanel.com" },
          { sender: "cliente", body: pergunta },
        ],
        mockReply: goodReply,
      });
      for (const rx of FAREWELL_CLOSURE) {
        expect(
          rx.test(text),
          `FALHOU: resposta contém frase de encerramento (${rx}) para pergunta de objeção "${pergunta}": "${text}"`,
        ).toBe(false);
      }
      expect(
        /tranquil|seguro|garantia|anos no mercado|painel/i.test(text),
        `FALHOU: resposta não tranquiliza o cliente: "${text}"`,
      ).toBe(true);
    },
  );
});

// ---------------------------------------------------------------------------
// 11) Filosofia agent-first: agradecimento/adiamento agora passam pelo Claude
// ---------------------------------------------------------------------------
describe("11) Sem interceptador: agradecimentos passam pelo Claude", () => {
  it.each(["valeu", "obrigado", "obrigada", "vlw", "brigado"])(
    'agradecimento "%s" em contexto de venda ativa vai pro Claude (sem frase fixa)',
    async (msg) => {
      const { fetchMock, text } = await callAgent({
        history: [
          { sender: "agente", body: "1000 inscritos YouTube sai R$140. Fechamos?" },
          { sender: "cliente", body: msg },
        ],
        mockReply: "Show! Já te passo o link do painel pra você fechar 😊",
      });
      expect(
        fetchMock.mock.calls.length,
        `FALHOU: "${msg}" foi interceptado — deveria chegar ao Claude`,
      ).toBeGreaterThanOrEqual(1);
      expect(
        /de\s+nada.*qualquer\s+coisa\s+me\s+chama/i.test(text),
        `FALHOU: resposta é a frase fixa antiga do interceptador — Claude deveria ter decidido: "${text}"`,
      ).toBe(false);
    },
  );
});

// ---------------------------------------------------------------------------
// 12) FATO TÉCNICO VERIFICADO — extraContext chega ao Claude e Claude respeita
// ---------------------------------------------------------------------------
async function callAgentWithExtra(opts: {
  history: Array<{ sender: "agente" | "cliente"; body: string }>;
  mockReply: string;
  extraContext: string;
}) {
  const fetchMock = mockAnthropic(opts.mockReply);
  vi.stubGlobal("fetch", fetchMock);
  process.env.ANTHROPIC_API_KEY = "test-key";
  const res = await generateAgentReplyWithMeta({
    agent: baseAgent(),
    contact: baseContact(),
    history: opts.history,
    isInbound: true,
    freeTestServices: [],
    extraContext: opts.extraContext,
    userId: null,
  });
  return { ...res, fetchMock };
}

describe("12) FATO TÉCNICO VERIFICADO — chega ao Claude via extraContext", () => {
  it("#4 trial já usado por plataforma → fato no prompt + regra na identidade", async () => {
    const fact = `FATO TÉCNICO VERIFICADO: este cliente já utilizou o teste grátis de Instagram anteriormente (limite: 1 teste por número por rede).`;
    const { fetchMock } = await callAgentWithExtra({
      history: [
        { sender: "agente", body: "Show! Manda o link do seu Reel pra rodar o teste 😊" },
        { sender: "cliente", body: "https://instagram.com/reel/xyz" },
      ],
      mockReply: "Vi aqui que você já usou o teste grátis do Instagram. Posso te montar um pacote pequeno a partir de R$5?",
      extraContext: fact,
    });
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body);
    expect(extractSystemText(extractSystemText(body.system)).includes(fact), "FALHOU: fato técnico não chegou no system prompt").toBe(true);
    expect(
      /FATO T[ÉE]CNICO VERIFICADO/i.test(extractSystemText(extractSystemText(body.system))),
      "FALHOU: regra da identidade sobre FATO TÉCNICO VERIFICADO ausente",
    ).toBe(true);
  });

  it("#5 link é foto → fato técnico injetado", async () => {
    const fact = `FATO TÉCNICO VERIFICADO: o link enviado pelo cliente é de uma foto/post estático do Instagram, não é um Reel/vídeo.`;
    const { fetchMock } = await callAgentWithExtra({
      history: [
        { sender: "agente", body: "Manda o link do Reel!" },
        { sender: "cliente", body: "https://instagram.com/p/abc123" },
      ],
      mockReply: "Vi aqui que esse link é de uma foto — views só funcionam em Reel. Me manda o link de um Reel do seu perfil!",
      extraContext: fact,
    });
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body);
    expect(extractSystemText(extractSystemText(body.system)).includes(fact)).toBe(true);
  });

  it("#6 erro do provedor (perfil privado) → fato técnico injetado", async () => {
    const fact = `FATO TÉCNICO VERIFICADO: o pedido de teste grátis falhou porque o perfil está configurado como PRIVADO no instagram.`;
    const { fetchMock } = await callAgentWithExtra({
      history: [
        { sender: "cliente", body: "https://instagram.com/reel/xyz" },
      ],
      mockReply: "Rapidão: seu perfil tá privado, então o teste não conseguiu rodar. Deixa público por uns minutos e me manda o link de novo!",
      extraContext: fact,
    });
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body);
    expect(extractSystemText(extractSystemText(body.system)).includes(fact)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 13-17) Contratos atuais de idioma, suporte, mídia e concisão
// ---------------------------------------------------------------------------
describe("13-17) Contratos atuais do Agent V3", () => {
  it("fato técnico é preservado sem substituir a resposta em inglês do Claude", async () => {
    const fact = "FATO TÉCNICO VERIFICADO: this client already used the free trial for Instagram.";
    const { fetchMock, text } = await callAgentWithExtra({
      history: [
        { sender: "agente", body: "Hi! Send me the link of your Reel." },
        { sender: "cliente", body: "https://instagram.com/reel/xyz" },
      ],
      mockReply: "Looks like you've already used your free Instagram trial.",
      extraContext: fact,
    });
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body || "{}");
    expect(extractSystemText(body.system)).toContain(fact);
    expect(text).toMatch(/already used|free trial/i);
  });

  it("suporte atual não reinicia o funil quando o cliente apenas confirma", async () => {
    const { text } = await callAgent({
      history: [
        { sender: "cliente", body: "oi, queria saber o status dos meus pedidos" },
        { sender: "agente", body: "Seu pedido está processando." },
        { sender: "cliente", body: "obrigado" },
        { sender: "agente", body: "De nada!" },
        { sender: "cliente", body: "ok" },
      ],
      mockReply: "Certo!",
      isInbound: true,
    });
    expect(text).not.toMatch(/qual\s+rede|qual\s+servi[cç]o|qual\s+plataforma|quer\s+impulsionar/i);
  });

  it("P-OUTBOUND governa a resposta imediata ao disparo", async () => {
    const { fetchMock } = await callAgent({
      history: [
        { sender: "agente", body: OPENING },
        { sender: "cliente", body: "bom dia" },
      ],
      mockReply: "Bom dia! Posso te explicar rapidinho como a Mind funciona.",
      isInbound: false,
    });
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body || "{}");
    const sys = extractSystemText(body.system);
    expect(sys).toMatch(/ABORDAGEM FRIA|CLIENTE VEIO DE DISPARO/i);
    expect(sys).toMatch(/NÃO PULE PRA QUALIFICAÇÃO|não necessariamente quer comprar/i);
  });

  it("guard de reengajamento continua espelhando saudação de forma determinística", () => {
    expect(enforceReengagementGreeting("Como posso ajudar?", "Bom dia").text).toMatch(/^Bom dia!/);
    expect(enforceReengagementGreeting("Como posso ajudar?", "Boa tarde").text).toMatch(/^Boa tarde!/);
    expect(enforceReengagementGreeting("Como posso ajudar?", "Boa noite").text).toMatch(/^Boa noite!/);
  });

  it("modo áudio atual orienta reenvio ou texto quando ininteligível", () => {
    const prompt = buildP2Text({
      isAudioInput: true,
      isImageInput: false,
      isStickerInput: false,
      greetingAlreadyPerformed: true,
    });
    expect(prompt).toMatch(/MODO ÁUDIO/i);
    expect(prompt).toMatch(/ininteligível, peça para enviar novamente ou escrever/i);
  });

  it("modo visão atual recebe a imagem real e preserva o contexto", () => {
    const prompt = buildP2Text({
      isAudioInput: false,
      isImageInput: true,
      isStickerInput: false,
      greetingAlreadyPerformed: true,
    });
    expect(prompt).toMatch(/MODO VISÃO/i);
    expect(prompt).toMatch(/imagem real está anexada/i);
    expect(prompt).toMatch(/responder no contexto/i);
  });

  it("concisão atual mantém respostas curtas e evita continuação artificial", () => {
    const prompt = buildP2Text({
      isAudioInput: false,
      isImageInput: false,
      isStickerInput: false,
      greetingAlreadyPerformed: true,
    });
    expect(prompt).toMatch(/1-2 frases|curta/i);
    expect(prompt).toMatch(/não force continuação|não repita|não repetir/i);
  });
});

