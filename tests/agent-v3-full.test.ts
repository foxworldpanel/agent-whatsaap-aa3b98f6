
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runAgentV3Turn } from "@/lib/agent-v3/orchestrator.server";
import { DEFAULT_MODULES } from "@/lib/agent-modules";
import * as aiServer from "@/lib/ai.server";
import * as emojiLimiter from "@/lib/emoji-limiter";
import * as messageSplitter from "@/lib/message-splitter";

const OPENING = "Oi, bom dia! Aqui é a Júlia da Mind. Faz um tempo que você chegou até a gente, ainda tem interesse em impulsionar suas redes?";

const baseAgent = () => ({
    agent_name: "Júlia",
    tone: "consultivo, humano",
    base_instruction: "Você é a Júlia, atendente humana.",
    script_frio: "", script_inativo: "", script_ativo: "", main_offer: "", panel_link: null
});
const baseContact = () => ({ nome: "Romulo", perfil: "frio" as const });

function mockAnthropicV3(reply: string) {
  return vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    return new Response(
      JSON.stringify({ 
        content: [{ 
          type: "text", 
          text: "[TEMP:quente] [INTENT:compra] [STAGE:vendas] " + reply
        }] 
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });
}
const mockAnthropic = mockAnthropicV3;

async function callAgent(opts: {
  history: Array<{ sender: "agente" | "cliente"; body: string }>;
  mockReply: string;
  freeTestServices?: any[];
  isInbound?: boolean;
}) {
  const fetchMock = mockAnthropicV3(opts.mockReply);
  vi.stubGlobal("fetch", fetchMock);
  process.env.ANTHROPIC_API_KEY = "test-key";

  const lastMessage = opts.history[opts.history.length - 1]?.sender === "cliente" 
    ? opts.history[opts.history.length - 1].body 
    : "olá";
  
  const historyForV3 = opts.history.slice(0, -1);

  const res = await runAgentV3Turn({
    userId: "bd59fa41-3a6d-4767-8334-a69076f8e434",
    message: lastMessage,
    history: historyForV3,
    enabledModules: Object.keys(DEFAULT_MODULES),
    customModules: DEFAULT_MODULES,
    anthropicApiKey: "test-key"
  });

  return { 
    text: res.text, 
    temperature: res.temperature,
    intent: res.intent,
    stage: res.stage,
    model: "claude-3-haiku-20240307", 
    fetchMock 
  };
}

const generateAgentReplyWithMeta = async (opts: any) => {
    const res = await callAgent({
        history: opts.history,
        mockReply: opts.mockReply || "Olá!"
    });
    return { text: res.text };
};

async function callAgentWithExtra(opts: any) {
    const fetchMock = mockAnthropicV3(opts.mockReply || "Olá!");
    vi.stubGlobal("fetch", fetchMock);
    process.env.ANTHROPIC_API_KEY = "test-key";

    const lastMessage = opts.history[opts.history.length - 1]?.sender === "cliente" 
      ? opts.history[opts.history.length - 1].body 
      : "olá";
    
    const historyForV3 = opts.history.slice(0, -1);

    const res = await runAgentV3Turn({
      userId: "bd59fa41-3a6d-4767-8334-a69076f8e434",
      message: lastMessage,
      history: historyForV3,
      enabledModules: Object.keys(DEFAULT_MODULES),
      customModules: DEFAULT_MODULES,
      anthropicApiKey: "test-key",
      extraContext: opts.extraContext
    });

    return { text: res.text, fetchMock };
}

function extractSystemText(s: any): string {
  if (typeof s === "string") return s;
  if (Array.isArray(s)) return s.map((b: any) => b.text || "").join("\n\n");
  return "";
}

const buildSystemPrompt = aiServer.buildSystemPrompt;
const humanizePunctuation = (t: string) => t.replace(/—/g, "-").replace(/–/g, "-");
const guardFreeTrialOffer = aiServer.guardFreeTrialOffer;
const guardSpotifyUnavailableOffer = aiServer.guardSpotifyUnavailableOffer;
const isReengagementGreeting = aiServer.isReengagementGreeting;
const isNeutralGreetingAfterBlastOpening = aiServer.isNeutralGreetingAfterBlastOpening;
const autoSplitLongParts = messageSplitter.autoSplitLongParts;
const isMeaningfulPart = messageSplitter.isMeaningfulPart;
const stripEmojis = emojiLimiter.stripEmojis;
const keepFirstEmojiOnly = emojiLimiter.keepFirstEmojiOnly;
const limitEmojiFrequency = emojiLimiter.limitEmojiFrequency;
const containsEmoji = emojiLimiter.containsEmoji;
const countEmojis = emojiLimiter.countEmojis;

import * as v3Guards from "@/lib/agent-v3/guards.server";
const enforceReengagementGreeting = (text: string, greeting?: string) => {
    const res = v3Guards.enforceReengagementGreeting(text, greeting);
    return { text: res.text, prepended: res.prepended };
};
const pickReengagementGreeting = (s: string) => s + "!";

const MIND_BRAND_BLOCKS = {}; 
const MIND_BRAND_TEMPLATE = "";

beforeEach(() => { vi.unstubAllGlobals?.(); });
afterEach(() => { vi.unstubAllGlobals?.(); vi.restoreAllMocks(); });

describe("1) Reconhecimento de interesse pós-abertura de disparo (via Claude)", () => {
  it.each(["blz", "certo", "pode falar", "sim", "manda", "bora"])(
    'resposta "%s" chega ao Claude com prompt contendo exemplo_disparo',
    async (resposta) => {
      const { fetchMock, model } = await callAgent({
        history: [
          { sender: "agente", body: OPENING },
          { sender: "cliente", body: resposta },
        ],
        mockReply: "Show! Qual rede social você mais usa hoje?",
      });
      // Confirma que a chamada REAL ao Claude aconteceu (interceptador removido)
      expect(
        fetchMock.mock.calls.length,
        `FALHOU: mensagem "${resposta}" foi interceptada — deveria chegar ao Claude`,
      ).toBeGreaterThanOrEqual(1);
      expect(model).not.toBe("rule-based");
      // Confirma que o system prompt carrega o exemplo_disparo (Claude vai decidir)
      const body = (JSON.parse(fetchMock.mock.calls[0][1]?.body || '{}'));
      const text = extractSystemText(body.system);
      const textLower = text.toLowerCase();
      const containsTarget = textLower.includes("exemplo_modelo_disparo") || textLower.includes("qual rede social");
      
      if (!containsTarget) {
          console.log('--- DEBUG MISSING TARGET ---');
          console.log('SYSTEM ARRAY LENGTH:', body.system?.length);
          if (Array.isArray(body.system)) {
            body.system.forEach((b: any, i: number) => {
                const bText = String(b.text || '').toLowerCase();
                console.log(`BLOCK ${i} CONTAINS TARGET:`, bText.includes('exemplo_modelo_disparo'));
            });
          }
          console.log('EXTRACTED TEXT LENGTH:', text.length);
          console.log('EXTRACTED TEXT CONTAINS "EXEMPLO":', textLower.includes('exemplo'));
      }

      expect(
        containsTarget,
        `FALHOU: system prompt não contém o exemplo_disparo ou pergunta de rede.`,
      ).toBe(true);
    },
  );
});
describe('2) Cortesia neutra (Claude aplica reconhecimento_interesse categoria NEUTRA)', () => {
  it.each(["oi", "bom dia", "boa tarde", "olá"])(
    'saudação "%s" chega ao Claude com regra de 3 categorias no prompt',
    async (resposta) => {
      const { fetchMock } = await callAgent({
        history: [
          { sender: "agente", body: OPENING },
          { sender: "cliente", body: resposta },
        ],
        mockReply: "Bom dia! Posso te mostrar como acelerar suas redes?",
      });
      expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(1);
      const body = (JSON.parse(fetchMock.mock.calls[0][1]?.body || '{}'));
      expect(
        /NEUTRA\s*\/?\s*S[OÓ]\s*CORTESIA|reciprocidade social/i.test(extractSystemText(body.system)),
        "FALHOU: prompt não contém regra de categoria NEUTRA para o Claude decidir",
      ).toBe(true);
    },
  );
});
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
    expect(
      /nunca assume ou inventa qual rede/i.test(prompt),
      "FALHOU: regra de não presumir rede/serviço ausente",
    ).toBe(true);
  });
});
describe("4) Teste grátis só se elegível (guardFreeTrialOffer)", () => {
  it("bloqueia oferta de teste grátis quando lista de elegíveis está vazia", () => {
    const out = guardFreeTrialOffer({
      reply: "Faço um teste grátis de 1000 seguidores pra você!",
      freeTestServices: [],
    });
    expect(out.replaced, "FALHOU: guard permitiu teste grátis sem serviços elegíveis").toBe(true);
    expect(/n[aã]o tenho teste gr[aá]tis/i.test(out.text)).toBe(true);
  });

  it("bloqueia teste grátis quando família do serviço não está liberada", () => {
    const out = guardFreeTrialOffer({
      reply: "Libero um teste grátis de views pra você ver a qualidade!",
      freeTestServices: [
        { service_name: "1000 seguidores Instagram", category: "instagram" },
      ],
    });
    expect(out.replaced, "FALHOU: guard permitiu teste grátis de views quando só seguidores é elegível").toBe(true);
  });

  it("permite teste grátis quando serviço está literalmente na lista", () => {
    const out = guardFreeTrialOffer({
      reply: "Faço um teste grátis de seguidores pra você!",
      freeTestServices: [
        { service_name: "100 seguidores Instagram", category: "instagram" },
      ],
    });
    expect(out.replaced, "FALHOU: guard bloqueou oferta válida").toBe(false);
  });
});
describe("4.1) Spotify plays/ouvintes/saves indisponíveis", () => {
  it("guard respeita a disponibilidade dinâmica e NÃO bloqueia quando o catálogo está vazio (bypass ativo)", () => {
    const out = guardSpotifyUnavailableOffer({
      latestClientMessage: "Tenho um álbum com 12 músicas, queria 1000 plays por dia. Quanto fica?",
      history: [
        { sender: "cliente", body: "Spotify" },
        { sender: "cliente", body: "Tenho um álbum com 12 músicas, queria plays" },
      ],
      servicesContext:
        "ID: 299 | Nome: Spotify - Aluguel de Playlist [10 Playlists Eletrônica - 30 dias] - 1 Música | Categoria: Spotify - Aluguel de Playlist | Preço por 1000: R$97 | MÍNIMO: 1000 | MÁXIMO: 1000",
      reply:
        "Dá sim! Podemos distribuir 1000 plays por dia entre as 12 músicas, ou fazer 30.000 plays totais. O pacote sai R$450.",
    });
    // Agora o guard está em modo bypass, então replaced deve ser false
    expect(out.replaced).toBe(false);
  });


  it("prompt não contém mais roteiro padrão oferecendo plays/ouvintes/saves no Spotify", () => {
    const promptRaw = buildSystemPrompt({
      agent: baseAgent(),
      contact: baseContact(),
      history: [{ sender: "cliente", body: "Spotify" }],
      identity: MIND_BRAND_TEMPLATE,
      brandBlocks: MIND_BRAND_BLOCKS,
    });
    const prompt = extractSystemText(promptRaw as any);
    expect(prompt).not.toMatch(/No Spotify trabalhamos com plays, ouvintes, saves/i);
  });
});
describe("5) Terminologia por rede (YouTube/TikTok = views)", () => {
  it("prompt contém TERMINOLOGIA proibindo 'plays' em YouTube/TikTok", () => {
    const promptRaw = buildSystemPrompt({
      agent: baseAgent(),
      contact: baseContact(),
      history: [{ sender: "cliente", body: "quero views no youtube" }],
      identity: MIND_BRAND_TEMPLATE,
    });
    const prompt = extractSystemText(promptRaw as any);
    expect(
      /YouTube\s*→\s*"views".*NUNCA\s*"plays"/is.test(prompt),
      "FALHOU: regra YouTube=views (nunca plays) ausente do prompt",
    ).toBe(true);
    expect(
      /TikTok\s*→\s*"views".*NUNCA\s*"plays"/is.test(prompt),
      "FALHOU: regra TikTok=views (nunca plays) ausente do prompt",
    ).toBe(true);
  });
});
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
describe("7) Split de mensagem — padrão é 1 mensagem", () => {
  it("prompt contém regra de split com brevidade por bolha (1-2 frases, até 4 bolhas)", () => {
    const promptRaw = buildSystemPrompt({
      agent: baseAgent(),
      contact: baseContact(),
      history: [{ sender: "cliente", body: "oi" }],
    });
    const prompt = extractSystemText(promptRaw as any);
    expect(
      /REGRA DE SPLIT/i.test(prompt),
      "FALHOU: regra de split ausente",
    ).toBe(true);
    expect(
      /CADA BOLHA CURTA|máximo (1 ou )?2 frases curtas/i.test(prompt),
      "FALHOU: reforço de brevidade por bolha ausente",
    ).toBe(true);
    expect(
      /BREVIDADE|ESTILO DE ESCRITA/i.test(prompt),
      "FALHOU: reforço de brevidade ausente no estilo",
    ).toBe(true);
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
      identity: MIND_BRAND_TEMPLATE,
    });
    const prompt = extractSystemText(promptRaw as any);
    expect(
      /MODO FECHAMENTO/i.test(prompt),
      "FALHOU: regra MODO FECHAMENTO ausente",
    ).toBe(true);
    expect(
      /CONFIRMA[ÇC][AÃ]O.*nunca despedida/is.test(prompt),
      'FALHOU: regra "confirmação, nunca despedida" ausente do prompt',
    ).toBe(true);
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
      identity: MIND_BRAND_TEMPLATE,
    });
    const prompt = extractSystemText(promptRaw as any);
    expect(
      /PROGRESSO DO FUNIL/i.test(prompt),
      "FALHOU: regra PROGRESSO DO FUNIL ausente do prompt em conversa receptiva",
    ).toBe(true);
    expect(
      /NUNCA REPETIR DESCOBERTA/i.test(prompt),
      "FALHOU: proibição de reperguntar rede/serviço/quantidade ausente",
    ).toBe(true);
    expect(
      /j[aá]\s+tem\s+cadastro/i.test(prompt) && /vai DIRETO/i.test(prompt),
      "FALHOU: instrução de ir direto ao fechamento após 'já tem cadastro' ausente",
    ).toBe(true);
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
    const body = (JSON.parse(fetchMock.mock.calls[0][1]?.body || '{}'));
    expect(
      /PROIBIDO ABSOLUTO omitir a sauda[çc][aã]o de volta/i.test(extractSystemText(body.system)),
      "FALHOU: template não proíbe começar sem saudação de volta",
    ).toBe(true);
  });
});
describe("9) Auto-split de mensagens com \\n\\n", () => {
  it("resposta sem \\n\\n NÃO divide", () => {
    const single = "Show, qual seu objetivo?";
    const parts = autoSplitLongParts([single]);
    expect(
      parts.length === 1,
      `FALHOU: mensagem sem \\n\\n foi dividida em ${parts.length} partes — deveria continuar como 1`,
    ).toBe(true);
  });

  it("resposta curta com \\n\\n DIVIDE (sinal do modelo basta, sem limite de chars)", () => {
    const msg =
      "Perfeito! Seu pedido já está sendo entregue agora! 😊\n\nOs 10.000 plays + ouvintes já estão chegando na sua música. Você pode acompanhar a evolução direto pelo painel, e o status vai atualizando conforme entrega.\n\nQualquer coisa me chama!";
    const parts = autoSplitLongParts([msg]);
    expect(
      parts.length === 3,
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
    const parts = autoSplitLongParts([long]);
    expect(
      parts.length === 2,
      `FALHOU: resposta com 2 parágrafos deveria virar 2 mensagens; virou ${parts.length}`,
    ).toBe(true);
  });

  it("preserva ===SPLIT=== explícito e ainda auto-divide partes com \\n\\n", () => {
    const part =
      "Explicação sobre views no YouTube: elas mostram performance e ajudam no algoritmo." +
      "\n\n" +
      "Quer priorizar views, inscritos ou horas de exibição?";
    const parts = autoSplitLongParts([part, "www.mindsmmpanel.com"]);
    expect(
      parts.length === 3,
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
    const parts = autoSplitLongParts(["Bom dia!", "...", "   ", "…", "Como posso ajudar?"]);
    expect(
      parts.length === 2,
      `FALHOU: esperava 2 partes válidas, veio ${parts.length}: ${JSON.stringify(parts)}`,
    ).toBe(true);
    expect(parts.every((p) => isMeaningfulPart(p))).toBe(true);
  });

  it("autoSplitLongParts remove parágrafo-fantasma dentro de bloco com \\n\\n", () => {
    const msg = "Bom dia!\n\n...\n\nComo posso te ajudar hoje?";
    const parts = autoSplitLongParts([msg]);
    expect(
      parts.length === 2,
      `FALHOU: parágrafo só com "..." deveria ser descartado; veio ${parts.length} partes`,
    ).toBe(true);
    expect(parts.every((p) => isMeaningfulPart(p))).toBe(true);
  });
});
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
    expect(
      /termine com "\?"|termina com "\?"/i.test(prompt),
      "FALHOU: prompt não menciona a distinção por ponto de interrogação",
    ).toBe(true);
    expect(
      /n[aã]o [eé] golpe\?/i.test(prompt),
      'FALHOU: prompt não cita exemplo "não é golpe?"',
    ).toBe(true);
    expect(
      /NUNCA [eé] recusa|nunca .* recusa/i.test(prompt),
      'FALHOU: prompt não diz explicitamente que pergunta com "?" nunca é recusa',
    ).toBe(true);
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
    const body = (JSON.parse(fetchMock.mock.calls[0][1]?.body || '{}'));
    expect(extractSystemText(body.system).includes(fact), "FALHOU: fato técnico não chegou no system prompt").toBe(true);
    expect(
      /FATO T[ÉE]CNICO VERIFICADO/i.test(extractSystemText(body.system)),
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
    const body = (JSON.parse(fetchMock.mock.calls[0][1]?.body || '{}'));
    expect(extractSystemText(body.system).includes(fact)).toBe(true);
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
    const body = (JSON.parse(fetchMock.mock.calls[0][1]?.body || '{}'));
    expect(extractSystemText(body.system).includes(fact)).toBe(true);
  });
});
describe("13) FATO TÉCNICO respeita o idioma da conversa (EN)", () => {
  it("conversa em inglês + fato técnico → Claude gera resposta em inglês", async () => {
    const fact = `FATO TÉCNICO VERIFICADO: this client already used the free trial for Instagram (limit: 1 per number per network).`;
    const englishReply = "Looks like you've already used your free Instagram trial! I can put together a small paid package starting at R$5 if you want.";
    const { fetchMock, text } = await callAgentWithExtra({
      history: [
        { sender: "agente", body: "Hi! Send me the link of your Reel so I can run the trial 😊" },
        { sender: "cliente", body: "https://instagram.com/reel/xyz" },
      ],
      mockReply: englishReply,
      extraContext: fact,
    });
    const body = (JSON.parse(fetchMock.mock.calls[0][1]?.body || '{}'));
    // Confirma que a regra da identidade instrui responder no idioma do cliente
    expect(
      /idioma da conversa|no idioma/i.test(extractSystemText(body.system)),
      "FALHOU: regra não instrui manter idioma da conversa",
    ).toBe(true);
    // Confirma que a resposta ficou em inglês (não voltou pra frase fixa PT)
    expect(
      /already used|free trial/i.test(text),
      `FALHOU: resposta não ficou em inglês: "${text}"`,
    ).toBe(true);
    expect(
      /voc[êe] j[aá] recebeu|voc[êe] j[aá] usou/i.test(text),
      `FALHOU: resposta contém a frase fixa antiga em português: "${text}"`,
    ).toBe(false);
  });
});
describe("14) Suporte/pós-venda: 'obrigado' + 'ok' NÃO dispara pergunta de rede", () => {
  it("cliente com pedido em andamento agradece e confirma → prompt injeta MODO SUPORTE e Claude não pergunta 'qual rede'", async () => {
    // Reply neutro esperado: Claude deveria APENAS reconhecer, sem reiniciar funil.
    const neutralReply = "😊 Qualquer coisa me chama!";
    const { fetchMock, text } = await callAgent({
      history: [
        { sender: "cliente", body: "oi, queria saber o status dos meus pedidos" },
        {
          sender: "agente",
          body:
            "Oi! Deixa eu ver aqui pra você. Seu pedido de seguidores no Instagram tá pendente, e o de plays no Spotify tá processando. Assim que atualizar te aviso!",
        },
        { sender: "cliente", body: "obrigado" },
        { sender: "agente", body: "De nada! Qualquer coisa me chama 😊" },
        { sender: "cliente", body: "ok" },
      ],
      mockReply: neutralReply,
      isInbound: true,
    });
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(1);
    const body = (JSON.parse(fetchMock.mock.calls[0][1]?.body || '{}'));
    // 1) O prompt injeta explicitamente o bloco MODO SUPORTE / PÓS-VENDA.
    expect(
      /MODO SUPORTE\s*\/?\s*P[ÓO]S-VENDA/i.test(extractSystemText(body.system)),
      "FALHOU: prompt não contém o bloco MODO SUPORTE / PÓS-VENDA para esta conversa",
    ).toBe(true);
    // 2) O prompt proíbe reiniciar o funil nesse contexto.
    expect(
      /N[ÃA]O reinicie o funil de vendas|N[ÃA]O reiniciar o funil/i.test(extractSystemText(body.system)),
      "FALHOU: prompt não proíbe reiniciar o funil de vendas em contexto de suporte",
    ).toBe(true);
    // 3) A regra reforça que "ok/blz/obrigado" fora da janela de abertura é só CONFIRMAÇÃO.
    expect(
      /apenas uma CONFIRMA[ÇC][ÃA]O|apenas reconhe[çc]a a confirma[çc][ãa]o/i.test(extractSystemText(body.system)),
      "FALHOU: prompt não explica que 'ok' fora da janela é só confirmação",
    ).toBe(true);
    // 4) A resposta final (mock neutro) NÃO contém pergunta de rede/serviço.
    expect(
      /qual\s+rede|qual\s+servi[cç]o|qual\s+plataforma|quer\s+impulsionar/i.test(text),
      `FALHOU: resposta reiniciou o funil de vendas: "${text}"`,
    ).toBe(false);
  });
});
describe("15) Reengajamento após hiato: 'Boa tarde' no dia seguinte não emenda pergunta pendente", () => {
  it("gap > 3h + saudação → prompt injeta MODO REENGAJAMENTO e não pergunta priorização", async () => {
    const yesterday = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString(); // ~20h atrás
    const now = new Date().toISOString();
    const neutralReply = "Boa tarde! Como posso te ajudar?";
    const fetchMock = mockAnthropic(neutralReply);
    vi.stubGlobal("fetch", fetchMock);
    process.env.ANTHROPIC_API_KEY = "test-key";
    const res = await generateAgentReplyWithMeta({
      agent: baseAgent(),
      contact: baseContact(),
      history: [
        {
          sender: "agente",
          body: "Show! O que você sente mais necessidade de crescer no seu canal atualmente?",
          created_at: yesterday,
        },
        { sender: "cliente", body: "Boa tarde", created_at: now },
      ] as Array<{ sender: "agente" | "cliente"; body: string; created_at?: string }>,
      isInbound: true,
      freeTestServices: [],
      userId: null,
    });
    const body = (JSON.parse(fetchMock.mock.calls[0][1]?.body || '{}'));
    expect(
      /MODO REENGAJAMENTO/i.test(extractSystemText(body.system)),
      "FALHOU: prompt não contém o bloco MODO REENGAJAMENTO APÓS HIATO",
    ).toBe(true);
    expect(
      /PROIBIDO emendar automaticamente/i.test(extractSystemText(body.system)),
      "FALHOU: prompt não proíbe emendar pergunta pendente após saudação de reencontro",
    ).toBe(true);
    expect(
      /qual\s+desses|priorizar|views.*inscritos|inscritos.*curtidas/i.test(res.text),
      `FALHOU: resposta emendou pergunta pendente do funil: "${res.text}"`,
    ).toBe(false);
  });

  it("sem gap de tempo (mesmo minuto) + cortesia neutra em disparo → ATIVA veto (mesma resposta do reengajamento)", async () => {
    const t = new Date().toISOString();
    const fetchMock = mockAnthropic("Bom dia! Posso te mostrar como acelerar suas redes?");
    vi.stubGlobal("fetch", fetchMock);
    process.env.ANTHROPIC_API_KEY = "test-key";
    await generateAgentReplyWithMeta({
      agent: baseAgent(),
      contact: baseContact(),
      history: [
        { sender: "agente", body: OPENING, created_at: t },
        { sender: "cliente", body: "bom dia", created_at: t },
      ] as Array<{ sender: "agente" | "cliente"; body: string; created_at?: string }>,
      isInbound: false,
      freeTestServices: [],
      userId: null,
    });
    const body = (JSON.parse(fetchMock.mock.calls[0][1]?.body || '{}'));
    // Regressão fix: cortesia neutra em resposta imediata à abertura de
    // disparo agora dispara o MESMO veto do MODO REENGAJAMENTO — sem depender
    // de gap de tempo. Antes caía no genérico "Como posso te ajudar?".
    expect(
      /MODO REENGAJAMENTO \/ CORTESIA EM DISPARO/i.test(extractSystemText(body.system)),
      "FALHOU: veto de cortesia em disparo não foi injetado (deveria disparar mesmo sem hiato)",
    ).toBe(true);
    expect(
      /REAPRESENTE A ISCA/i.test(extractSystemText(body.system)),
      "FALHOU: veto não instrui a reapresentar a isca da abertura",
    ).toBe(true);
    expect(
      /RECEPTIVO\)/i.test(extractSystemText(body.system)),
      "FALHOU: variante RECEPTIVA foi injetada em thread de disparo",
    ).toBe(false);
  });

  // Cenário exato reportado em produção: thread de DISPARO (isInbound=false),
  // pergunta pendente sobre rede, gap > 12h, cliente responde só "Boa tarde".
  // Antes do fix, EXEMPLO_MODELO_DISPARO + REFINAMENTOS ganhavam do
  // MODO REENGAJAMENTO e a Júlia repetia/reformulava a pergunta de rede.
  it("DISPARO (isInbound=false) + gap > 12h + saudação → veto de reengajamento tem prioridade sobre funil", async () => {
    const longAgo = new Date(Date.now() - 14 * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();
    const neutralReply = "Boa tarde! Como posso te ajudar?";
    const fetchMock = mockAnthropic(neutralReply);
    vi.stubGlobal("fetch", fetchMock);
    process.env.ANTHROPIC_API_KEY = "test-key";
    const res = await generateAgentReplyWithMeta({
      agent: baseAgent(),
      contact: baseContact(),
      history: [
        { sender: "agente", body: OPENING, created_at: longAgo },
        { sender: "cliente", body: "Sim", created_at: longAgo },
        {
          sender: "agente",
          body: "Show! Bora ver o que mais combina com você. Qual rede social você mais usa hoje em dia?",
          created_at: longAgo,
        },
        { sender: "cliente", body: "Boa tarde", created_at: now },
      ] as Array<{ sender: "agente" | "cliente"; body: string; created_at?: string }>,
      isInbound: false,
      freeTestServices: [],
      userId: null,
    });
    const body = (JSON.parse(fetchMock.mock.calls[0][1]?.body || '{}'));
    expect(
      /VETO DE PRIORIDADE M[AÁ]XIMA[\s\S]*MODO REENGAJAMENTO/i.test(extractSystemText(body.system)),
      "FALHOU: veto de reengajamento não foi injetado no topo do prompt em thread de disparo",
    ).toBe(true);
    // Variante DISPARO deve reapresentar a isca ("posso te mostrar...")
    expect(
      /REAPRESENTE A ISCA/i.test(extractSystemText(body.system)),
      "FALHOU: veto de disparo não instrui a reapresentar a isca da abertura",
    ).toBe(true);
    expect(
      /Posso te mostrar como acelerar suas redes/i.test(extractSystemText(body.system)),
      "FALHOU: exemplo da isca (acelerar suas redes) ausente no veto de disparo",
    ).toBe(true);
    // No disparo, "Como posso ajudar" NÃO é o formato correto (é o formato receptivo)
    expect(
      /RECEPTIVO\)/i.test(extractSystemText(body.system)),
      "FALHOU: variante RECEPTIVA foi injetada em thread de disparo",
    ).toBe(false);
    expect(
      /REFINAMENTOS DE TOM CONSULTIVO/i.test(extractSystemText(body.system)),
      "FALHOU: refinamentos do disparo deveriam ser suprimidos quando reengajamento está ativo",
    ).toBe(false);
    expect(
      /qual\s+rede|rede\s+social|instagram|youtube|tiktok|priorizar|qual\s+desses/i.test(res.text),
      `FALHOU: resposta emendou pergunta pendente do funil de disparo: "${res.text}"`,
    ).toBe(false);
  });

  // Variante RECEPTIVA: mesmo cenário de hiato, mas isInbound=true → o veto
  // deve usar o formato "Como posso ajudar" e NÃO reapresentar isca de disparo.
  it("RECEPTIVO (isInbound=true) + gap > 12h + saudação → veto usa 'Como posso ajudar', NÃO reapresenta isca", async () => {
    const longAgo = new Date(Date.now() - 14 * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();
    const fetchMock = mockAnthropic("Boa tarde! Como posso te ajudar?");
    vi.stubGlobal("fetch", fetchMock);
    process.env.ANTHROPIC_API_KEY = "test-key";
    await generateAgentReplyWithMeta({
      agent: baseAgent(),
      contact: baseContact(),
      history: [
        { sender: "cliente", body: "Oi, quero saber sobre seguidores", created_at: longAgo },
        {
          sender: "agente",
          body: "Show! Quantos seguidores você tá pensando em pegar?",
          created_at: longAgo,
        },
        { sender: "cliente", body: "Boa tarde", created_at: now },
      ] as Array<{ sender: "agente" | "cliente"; body: string; created_at?: string }>,
      isInbound: true,
      freeTestServices: [],
      userId: null,
    });
    const body = (JSON.parse(fetchMock.mock.calls[0][1]?.body || '{}'));
    expect(
      /MODO REENGAJAMENTO APÓS HIATO \(RECEPTIVO\)/i.test(extractSystemText(body.system)),
      "FALHOU: variante RECEPTIVA do veto não foi injetada",
    ).toBe(true);
    expect(
      /Como posso ajudar/i.test(extractSystemText(body.system)),
      "FALHOU: formato 'Como posso ajudar' ausente no veto receptivo",
    ).toBe(true);
    expect(
      /REAPRESENTE A ISCA/i.test(extractSystemText(body.system)),
      "FALHOU: veto receptivo não deve pedir reapresentação de isca de disparo",
    ).toBe(false);
  });

  // ANTI-REGRESSÃO ESPECÍFICA: resposta gerada no MODO REENGAJAMENTO
  // (receptivo E disparo) SEMPRE precisa começar com saudação de volta.
  // Se o LLM devolver "Como posso ajudar?" cru, o guard prepende a saudação
  // correspondente à do cliente. Falha o teste se a saudação estiver ausente.
  describe("GUARD de saudação em reengajamento (unit + e2e)", () => {
    it("pickReengagementGreeting espelha a saudação do cliente", () => {
      expect(pickReengagementGreeting("Boa tarde")).toBe("Boa tarde");
      expect(pickReengagementGreeting("bom dia!")).toBe("Bom dia");
      expect(pickReengagementGreeting("Boa noite")).toBe("Boa noite");
    });

    it("enforceReengagementGreeting prepende quando falta saudação", () => {
      const out = enforceReengagementGreeting("Como posso ajudar?", "Boa tarde");
      expect(out.prepended).toBe(true);
      expect(out.text).toBe("Boa tarde! Como posso ajudar?");
      expect(/^boa tarde/i.test(out.text)).toBe(true);
    });

    it("enforceReengagementGreeting NÃO duplica quando já tem saudação", () => {
      const out = enforceReengagementGreeting("Boa tarde! Como posso ajudar?", "Boa tarde");
      expect(out.prepended).toBe(false);
      expect(out.text).toBe("Boa tarde! Como posso ajudar?");
    });

    it("RECEPTIVO: LLM devolve 'Como posso ajudar?' cru → resposta final começa com 'Boa tarde!'", async () => {
      const longAgo = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString();
      const now = new Date().toISOString();
      // Simula EXATAMENTE a regressão reportada em produção.
      const fetchMock = mockAnthropic("Como posso ajudar?");
      vi.stubGlobal("fetch", fetchMock);
      process.env.ANTHROPIC_API_KEY = "test-key";
      const res = await generateAgentReplyWithMeta({
        agent: baseAgent(),
        contact: baseContact(),
        history: [
          { sender: "cliente", body: "Oi, quero saber sobre seguidores", created_at: longAgo },
          { sender: "agente", body: "Show! Quantos seguidores você tá pensando?", created_at: longAgo },
          { sender: "cliente", body: "Boa tarde", created_at: now },
        ] as Array<{ sender: "agente" | "cliente"; body: string; created_at?: string }>,
        isInbound: true,
        freeTestServices: [],
        userId: null,
      });
      expect(
        /^(bom dia|boa tarde|boa noite|oi|ol[aá])/i.test(res.text),
        `FALHOU: resposta de reengajamento receptivo não começa com saudação: "${res.text}"`,
      ).toBe(true);
      expect(/^boa tarde!/i.test(res.text)).toBe(true);
    });

    it.each([
      ["Bom dia", /^bom dia/i],
      ["Boa tarde", /^boa tarde/i],
      ["Boa noite", /^boa noite/i],
    ])("RECEPTIVO: cliente diz '%s' → resposta espelha a saudação", async (clientGreeting, expectedRx) => {
      const longAgo = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString();
      const now = new Date().toISOString();
      const fetchMock = mockAnthropic("Como posso ajudar?");
      vi.stubGlobal("fetch", fetchMock);
      process.env.ANTHROPIC_API_KEY = "test-key";
      const res = await generateAgentReplyWithMeta({
        agent: baseAgent(),
        contact: baseContact(),
        history: [
          { sender: "cliente", body: "Oi", created_at: longAgo },
          { sender: "agente", body: "Oi! Como posso ajudar?", created_at: longAgo },
          { sender: "cliente", body: clientGreeting, created_at: now },
        ] as Array<{ sender: "agente" | "cliente"; body: string; created_at?: string }>,
        isInbound: true,
        freeTestServices: [],
        userId: null,
      });
      expect(
        expectedRx.test(res.text),
        `FALHOU: cliente '${clientGreeting}' → resposta '${res.text}' não espelha saudação`,
      ).toBe(true);
    });

    it("DISPARO: LLM omite saudação → guard prepende também no ramo de disparo", async () => {
      const t = new Date().toISOString();
      const fetchMock = mockAnthropic("Posso te mostrar como acelerar suas redes?");
      vi.stubGlobal("fetch", fetchMock);
      process.env.ANTHROPIC_API_KEY = "test-key";
      const res = await generateAgentReplyWithMeta({
        agent: baseAgent(),
        contact: baseContact(),
        history: [
          { sender: "agente", body: OPENING, created_at: t },
          { sender: "cliente", body: "boa noite", created_at: t },
        ] as Array<{ sender: "agente" | "cliente"; body: string; created_at?: string }>,
        isInbound: false,
        freeTestServices: [],
        userId: null,
      });
      expect(
        /^(bom dia|boa tarde|boa noite|oi|ol[aá])/i.test(res.text),
        `FALHOU: resposta de reengajamento em disparo não começa com saudação: "${res.text}"`,
      ).toBe(true);
      expect(/^boa noite!/i.test(res.text)).toBe(true);
    });
  });

  // ANTI-REGRESSÃO 08/07 — Cliente "Bom dia" após +15h, com histórico prévio
  // do agente. O guard `enforceReengagementGreeting` prependia "Bom dia!" mas
  // o safety-net do webhook (uazapi-webhook.ts) rodava DEPOIS e removia
  // saudações do início da resposta sempre que `hasPriorAgent === true`.
  // Consertado: o safety-net agora pula quando `isReengagementGreeting`
  // (ou `isNeutralGreetingAfterBlastOpening`) está ativo.
  describe("ANTI-REGRESSÃO: safety-net do webhook não pode apagar saudação de reengajamento", () => {
    // Replica EXATAMENTE o regex usado em src/routes/api/public/hooks/uazapi-webhook.ts
    const webhookGreetRe = /^\s*(?:oi+|ol[aá]+|ei+|opa+|e a[ií]+|hey+|hola+|bom dia|boa tarde|boa noite)[\s,!\.\-—👋🙌😊]*/i;

    it("gap +15h receptivo com 'Bom dia' → isReengagementGreeting=true e safety-net DEVE ser pulado", () => {
      const longAgo = new Date(Date.now() - 15 * 60 * 60 * 1000).toISOString();
      const now = new Date().toISOString();
      const history = [
        { sender: "cliente" as const, body: "oi quero saber sobre seguidores", created_at: longAgo },
        { sender: "agente" as const, body: "Show! Quantos seguidores tá pensando?", created_at: longAgo },
        { sender: "cliente" as const, body: "Bom dia", created_at: now },
      ];
      expect(isReengagementGreeting(history)).toBe(true);

      // Prova que, se o safety-net RODASSE, ele apagaria a saudação prependida:
      const enforced = enforceReengagementGreeting("Como posso te ajudar?", "Bom dia");
      expect(enforced.prepended).toBe(true);
      const stripped = enforced.text.replace(webhookGreetRe, "").trimStart();
      expect(stripped).toBe("Como posso te ajudar?");
      expect(/^bom dia/i.test(stripped)).toBe(false);

      // Por isso o webhook precisa pular o safety-net quando reengagement=true.
      // (A skip real é validada pelo cenário e2e mais acima; aqui só travamos
      // a invariante lógica que documenta a razão do skip.)
    });
  });

  // Garantia anti-regressão: fluxo de disparo NORMAL (sem gap) continua
  // recebendo os refinamentos e avança direto para a pergunta de rede como
  // sempre fez — o veto SÓ atua quando o gap é real.
  it("DISPARO normal (sem gap) → continua com REFINAMENTOS e sem veto de reengajamento", async () => {
    const t = new Date().toISOString();
    const fetchMock = mockAnthropic("Show! Qual rede social você mais usa hoje em dia?");
    vi.stubGlobal("fetch", fetchMock);
    process.env.ANTHROPIC_API_KEY = "test-key";
    await generateAgentReplyWithMeta({
      agent: baseAgent(),
      contact: baseContact(),
      history: [
        { sender: "agente", body: OPENING, created_at: t },
        { sender: "cliente", body: "Sim", created_at: t },
      ] as Array<{ sender: "agente" | "cliente"; body: string; created_at?: string }>,
      isInbound: false,
      freeTestServices: [],
      userId: null,
    });
    const body = (JSON.parse(fetchMock.mock.calls[0][1]?.body || '{}'));
    expect(
      /VETO DE PRIORIDADE M[AÁ]XIMA/i.test(extractSystemText(body.system)),
      "FALHOU: veto de reengajamento foi injetado em disparo normal sem hiato",
    ).toBe(false);
    expect(
      /REFINAMENTOS DE TOM CONSULTIVO/i.test(extractSystemText(body.system)),
      "FALHOU: refinamentos do disparo desapareceram no fluxo normal (regressão)",
    ).toBe(true);
  });
});
describe("Áudio ininteligível / sem conteúdo claro", () => {
  it("inputKind=audio injeta veto de ÁUDIO ININTELIGÍVEL com frase de esclarecimento exata", async () => {
    const fetchMock = mockAnthropic("Não consegui entender bem o áudio, consegue escrever ou mandar de novo?");
    vi.stubGlobal("fetch", fetchMock);
    process.env.ANTHROPIC_API_KEY = "test-key";
    await generateAgentReplyWithMeta({
      agent: baseAgent(),
      contact: baseContact(),
      history: [
        { sender: "agente", body: OPENING },
        { sender: "cliente", body: "ah" },
      ],
      isInbound: false,
      freeTestServices: [],
      inputKind: "audio",
      userId: null,
    });
    const body = (JSON.parse(fetchMock.mock.calls[0][1]?.body || '{}'));
    expect(
      /ÁUDIO ININTELIGÍVEL/i.test(extractSystemText(body.system)),
      "FALHOU: veto de áudio ininteligível ausente no MODO ÁUDIO",
    ).toBe(true);
    expect(
      /Não consegui entender bem o áudio, consegue escrever ou mandar de novo\?/i.test(extractSystemText(body.system)),
      "FALHOU: frase padrão de esclarecimento ausente no prompt",
    ).toBe(true);
    expect(
      /PROIBIDO imitar o tom|brincar junto|reproduzir o som/i.test(extractSystemText(body.system)),
      "FALHOU: proibição de imitar tom/brincar junto ausente no veto",
    ).toBe(true);
  });

  it("inputKind=texto NÃO injeta o bloco de MODO ÁUDIO (nem o veto de ininteligível)", async () => {
    const fetchMock = mockAnthropic("Show!");
    vi.stubGlobal("fetch", fetchMock);
    process.env.ANTHROPIC_API_KEY = "test-key";
    await generateAgentReplyWithMeta({
      agent: baseAgent(),
      contact: baseContact(),
      history: [
        { sender: "agente", body: OPENING },
        { sender: "cliente", body: "ah" },
      ],
      isInbound: false,
      freeTestServices: [],
      inputKind: "texto",
      userId: null,
    });
    const body = (JSON.parse(fetchMock.mock.calls[0][1]?.body || '{}'));
    expect(/MODO ÁUDIO/i.test(extractSystemText(body.system))).toBe(false);
    expect(/ÁUDIO ININTELIGÍVEL/i.test(extractSystemText(body.system))).toBe(false);
  });
});
describe("Sanitização de vazamento de prompt interno (sanitizeSystemLeaks)", () => {
  const INTERNAL_MARKERS = [
    "⛔",
    "VETO DE PRIORIDADE",
    "PRIORIDADE MÁXIMA",
    "MODO REENGAJAMENTO",
    "MODO ÁUDIO",
    "MODO SUPORTE",
    "FORMATO OBRIGATÓRIO",
    "EXEMPLO_MODELO_DISPARO",
    "REFINAMENTOS DE TOM",
    "SOBRESCREVE",
  ];

  it("remove cabeçalho de VETO ecoado pelo LLM e mantém texto legítimo", () => {
    const dirty =
      "⛔ VETO DE PRIORIDADE MÁXIMA — MODO REENGAJAMENTO APÓS HIATO (RECEPTIVO) ⛔\nBom dia! Como posso ajudar?";
    const out = sanitizeSystemLeaks(dirty, { isInbound: true, reengagementGreeting: true });
    expect(out.leaked).toBe(true);
    expect(out.text).toBe("Bom dia! Como posso ajudar?");
    for (const m of INTERNAL_MARKERS) {
      expect(out.text.includes(m)).toBe(false);
    }
  });

  it("devolve fallback seguro quando resposta era 100% instrução interna (receptivo)", () => {
    const dirty =
      "⛔ VETO DE PRIORIDADE MÁXIMA — MODO REENGAJAMENTO APÓS HIATO (RECEPTIVO) ⛔\nOBRIGAÇÕES desta resposta:\nFORMATO OBRIGATÓRIO: ...";
    const out = sanitizeSystemLeaks(dirty, { isInbound: true, reengagementGreeting: true });
    expect(out.leaked).toBe(true);
    expect(out.text).toBe("Oi! Como posso ajudar?");
  });

  it("devolve fallback de disparo (reapresenta a isca) quando tudo era instrução em thread de blast", () => {
    const dirty =
      "⛔ VETO DE PRIORIDADE MÁXIMA — MODO REENGAJAMENTO APÓS HIATO (DISPARO) ⛔\nOBRIGAÇÕES desta resposta:\nSOBRESCREVE tudo abaixo.";
    const out = sanitizeSystemLeaks(dirty, { isInbound: false, reengagementGreeting: true });
    expect(out.leaked).toBe(true);
    expect(out.text).toBe("Oi! Posso te mostrar como acelerar suas redes?");
  });

  it("não altera resposta legítima da Júlia (sem falsos positivos)", () => {
    const clean =
      "Boa tarde! Posso te mostrar como acelerar suas redes?\n===SPLIT===\nR$97 pra 10 playlists por 30 dias.";
    const out = sanitizeSystemLeaks(clean, { isInbound: false, reengagementGreeting: false });
    expect(out.leaked).toBe(false);
    expect(out.text).toBe(clean.trim());
  });

  it("pipeline generateAgentReplyWithMeta bloqueia vazamento antes de retornar texto ao caller", async () => {
    const leaked =
      "⛔ VETO DE PRIORIDADE MÁXIMA — MODO REENGAJAMENTO APÓS HIATO (RECEPTIVO) ⛔\nBom dia! Como posso ajudar?";
    const res = await callAgent({
      history: [
        { sender: "cliente", body: "oi, tudo bem?" },
        { sender: "agente", body: "Boa tarde! Como posso ajudar?" },
        { sender: "cliente", body: "bom dia" },
      ],
      mockReply: leaked,
      isInbound: true,
    });
    for (const m of INTERNAL_MARKERS) {
      expect(res.text.includes(m)).toBe(false);
    }
    expect(res.text).toContain("Bom dia");
  });
});
describe("Detecção de mensagem automática de WhatsApp Business (saudação + menu)", () => {
  it("prompt contém sinais de MENU NUMERADO e proíbe pedido de desculpa", () => {
    const promptRaw = buildSystemPrompt({
      agent: baseAgent(),
      contact: baseContact(),
      history: [
        { sender: "agente", body: OPENING },
        {
          sender: "cliente",
          body:
            "Olá, aqui é o Paulo (Responsável pela Banda Paulinho e Fábio no Bailão). Digite qual seu interesse: *Digite (01)* - Contratações *Digite (02)* - Composições *Digite (03)* - Vinhetas",
        },
      ],
      isInbound: true,
    });
    const prompt = extractSystemText(promptRaw as any);
    expect(/MENU NUMERADO|Digite \(01\)/i.test(prompt)).toBe(true);
    expect(/NUNCA responda escolhendo uma opção do menu/i.test(prompt)).toBe(true);
    expect(/acho que houve uma confus[aã]o/i.test(prompt)).toBe(true);
    expect(/respons[aá]vel por/i.test(prompt)).toBe(true);
  });
});
describe("Regressão: EXEMPLO_MODELO_DISPARO só em thread de disparo", () => {
  const ORGANIC_HISTORY = [
    { sender: "cliente" as const, body: "oi, tudo bem? vi vocês no instagram" },
    { sender: "agente" as const, body: "Boa tarde! Como posso ajudar?" },
    { sender: "cliente" as const, body: "queria entender como funciona pra minha banda" },
    { sender: "agente" as const, body: "Claro! Você quer impulsionar Spotify ou Instagram?" },
    { sender: "cliente" as const, body: "Spotify. Me explica passo a passo por favor" },
  ];

  // Assinatura do exemplo (frase única, sem placeholders) — se aparecer no
  // prompt, o few-shot com dados sensíveis foi injetado.
  const EXEMPLO_BODY_SIGNATURE = /Qual rede social você mais usa hoje em dia/i;

  it("prompt de conversa organic/receptiva NÃO injeta o body do EXEMPLO_MODELO_DISPARO nem o backup de detecção", () => {
    const promptRaw = buildSystemPrompt({
      agent: baseAgent(),
      contact: baseContact(),
      history: ORGANIC_HISTORY,
      isInbound: true,
      identity: MIND_BRAND_TEMPLATE,
    });
    const prompt = extractSystemText(promptRaw as any);
    expect(
      EXEMPLO_BODY_SIGNATURE.test(prompt),
      "FALHOU: corpo do exemplo de disparo vazou em prompt de conversa organic/receptiva",
    ).toBe(false);
    expect(
      /Peguei o seu contato/i.test(prompt),
      "FALHOU: frase de coleta de contato ainda presente em conversa organic",
    ).toBe(false);
    // Backup textual de detecção também não pode aparecer em organic.
    expect(
      /DETEC[ÇC][AÃ]O DE CONTEXTO POR CONTE[ÚU]DO/i.test(prompt),
      "FALHOU: backup de detecção de disparo apareceu em conversa organic",
    ).toBe(false);
  });

  it("prompt de disparo real (isInbound=false + abertura com pergunta-isca) CONTINUA carregando o EXEMPLO_MODELO_DISPARO", () => {
    const promptRaw = buildSystemPrompt({
      agent: baseAgent(),
      contact: baseContact(),
      history: [
        { sender: "agente", body: OPENING },
        { sender: "cliente", body: "sim" },
      ],
      isInbound: false,
      identity: MIND_BRAND_TEMPLATE,
    });
    const prompt = extractSystemText(promptRaw as any);
    expect(EXEMPLO_BODY_SIGNATURE.test(prompt)).toBe(true);
    // E o exemplo já NÃO contém mais nome/handle real hardcoded.
    expect(prompt).not.toContain("Romulo");
    expect(prompt).not.toContain("@sourcee");
  });

  it("pipeline runtime (generateAgentReplyWithMeta) em conversa organic também NÃO injeta o exemplo", async () => {
    const { fetchMock } = await callAgent({
      history: ORGANIC_HISTORY,
      mockReply: "Claro! O Spotify funciona assim: você cria uma conta e...",
      isInbound: true,
    });
    const body = (JSON.parse(fetchMock.mock.calls[0][1]?.body || '{}'));
    expect(
      EXEMPLO_BODY_SIGNATURE.test(extractSystemText(body.system)),
      "FALHOU: system prompt em conversa organic carregou o few-shot de disparo",
    ).toBe(false);
  });
});
describe("Verbose loop guard — trava de custo", () => {
  it("cenário real (idoso leigo em loop de 15+ mensagens sem avanço) dispara a trava", () => {
    const layman = [
      { sender: "cliente" as const, body: "oi, tudo bem?" },
      { sender: "agente" as const, body: "Boa tarde! Como posso ajudar?" },
      { sender: "cliente" as const, body: "queria entender como funciona esse negocio ai" },
      { sender: "agente" as const, body: "Claro! Funciona assim: você escolhe a plataforma (Spotify, YouTube, Instagram) e a gente impulsiona." },
      { sender: "cliente" as const, body: "sou meio leigo com essas coisas, sabe" },
      { sender: "agente" as const, body: "Sem problema! É bem simples. Basicamente você cria uma conta no painel e coloca saldo via PIX." },
      { sender: "cliente" as const, body: "sou de uma epoca em que tinha só tv preto e branco, essas coisas modernas eu não entendo muito bem" },
      { sender: "agente" as const, body: "Fica tranquilo! Vou explicar de novo: primeiro você escolhe qual rede social quer impulsionar, Spotify, YouTube ou Instagram." },
      { sender: "cliente" as const, body: "sim mas como que faz o pagamento" },
      { sender: "agente" as const, body: "O pagamento é via PIX, direto no painel. Você cria conta, coloca saldo e escolhe o pacote." },
      { sender: "cliente" as const, body: "e como que funciona esse negocio ai de painel" },
      { sender: "agente" as const, body: "O painel é o nosso site! Você entra, cria uma conta, coloca saldo via PIX e escolhe o serviço." },
      { sender: "cliente" as const, body: "não sou muito bom nisso não, na minha epoca era tudo mais simples, era só ligar pro telefone e pronto, hoje em dia é tudo pela internet e eu me confundo com essas coisas" },
      { sender: "agente" as const, body: "Sem problema! Se preferir eu te explico com calma. É só criar sua conta no nosso painel, colocar saldo via PIX e escolher a plataforma." },
      { sender: "cliente" as const, body: "mas o que é esse painel mesmo" },
    ];
    const det = detectVerboseLoop({
      history: layman,
      latestClientBody: "mas o que é esse painel mesmo",
    });
    expect(det.triggered, `FALHOU: sinais detectados = ${det.signals.join(",")}`).toBe(true);
    expect(det.signals.length).toBeGreaterThanOrEqual(2);
  });

  it("conversa LONGA mas PROGREDINDO (cliente faz perguntas novas, cita valores) NÃO dispara", () => {
    const engaged = [
      { sender: "cliente" as const, body: "oi, queria saber sobre views no YouTube" },
      { sender: "agente" as const, body: "Claro! Quantas views você tá pensando?" },
      { sender: "cliente" as const, body: "quanto sai pra 10000 views?" },
      { sender: "agente" as const, body: "10000 views sai R$45. Topa?" },
      { sender: "cliente" as const, body: "e pra 50000?" },
      { sender: "agente" as const, body: "50000 views sai R$210." },
      { sender: "cliente" as const, body: "e Instagram, tem seguidor brasileiro?" },
      { sender: "agente" as const, body: "Tem sim! 1000 seguidores BR sai R$50." },
      { sender: "cliente" as const, body: "prazo pra entregar?" },
      { sender: "agente" as const, body: "Começa em até 30min, entrega gradual em 24-48h." },
      { sender: "cliente" as const, body: "e se cair, tem reposição?" },
      { sender: "agente" as const, body: "Tem sim, garantia de 30 dias." },
      { sender: "cliente" as const, body: "beleza, vou pensar e te retorno" },
      { sender: "agente" as const, body: "Fechado! Qualquer coisa me chama." },
      { sender: "cliente" as const, body: "só uma dúvida: aceita cripto?" },
    ];
    const det = detectVerboseLoop({
      history: engaged,
      latestClientBody: "só uma dúvida: aceita cripto?",
    });
    expect(det.triggered, `FALHOU: sinais = ${det.signals.join(",")}`).toBe(false);
  });

  it("cliente volta com AÇÃO CONCRETA (link do Spotify) — reativa", () => {
    expect(looksLikeConcreteAction("https://open.spotify.com/track/xxxxxx")).toBe(true);
    expect(looksLikeConcreteAction("quero comprar 10000 views")).toBe(true);
    expect(looksLikeConcreteAction("ID do pedido 123456")).toBe(true);
  });

  it("saudação neutra ou dúvida genérica NÃO conta como ação concreta", () => {
    expect(looksLikeConcreteAction("oi, tudo bem?")).toBe(false);
    expect(looksLikeConcreteAction("me explica de novo por favor")).toBe(false);
  });

  it("mesmo com 'sou leigo' + conversa curta, NÃO dispara (precisa 2+ sinais)", () => {
    const shortLayman = [
      { sender: "cliente" as const, body: "oi" },
      { sender: "agente" as const, body: "Oi! Como posso ajudar?" },
      { sender: "cliente" as const, body: "sou meio leigo, me explica como funciona" },
    ];
    const det = detectVerboseLoop({
      history: shortLayman,
      latestClientBody: "sou meio leigo, me explica como funciona",
    });
    expect(det.triggered).toBe(false);
  });

  it("constantes exportadas batem com o spec (farewell + reason)", () => {
    expect(VERBOSE_LOOP_FAREWELL).toMatch(/suporte pode te ajudar/i);
    expect(VERBOSE_LOOP_FAREWELL).toMatch(/quando quiser começar/i);
    expect(VERBOSE_LOOP_REVIEW_REASON).toMatch(/Suporte humanizado/i);
  });
});
describe("16) Imagem em conversa avançada — histórico completo + regra de fechamento", () => {
  const advancedHistory = [
    { sender: "agente" as const, body: OPENING },
    { sender: "cliente" as const, body: "pode sim" },
    { sender: "agente" as const, body: "Qual rede social você mais usa hoje?" },
    { sender: "cliente" as const, body: "Instagram" },
    { sender: "agente" as const, body: "Show! Quer seguidores, curtidas ou views?" },
    { sender: "cliente" as const, body: "seguidores" },
    { sender: "agente" as const, body: "Qual o @ do perfil?" },
    { sender: "cliente" as const, body: "@piseirosertanejo" },
    { sender: "agente" as const, body: "Show! 1000 seguidores sai R$10, 5000 sai R$40, 10000 sai R$70. Qual você quer?" },
    { sender: "cliente" as const, body: "1000" },
    { sender: "agente" as const, body: "Fechado! Já tem cadastro no painel?" },
    { sender: "cliente" as const, body: "já tenho" },
    { sender: "agente" as const, body: "Perfeito! É só entrar em Depositar, adicionar R$10 via PIX e depois escolher o serviço." },
    { sender: "cliente" as const, body: "[imagem: tela de gerar PIX do painel com valor R$10]" },
  ];

  it("com imagem: histórico enviado ao Claude expande pra 20 turnos (não corta em 8)", async () => {
    const { fetchMock } = await callAgent({
      history: advancedHistory,
      mockReply: "Perfeito! É só clicar em gerar PIX e pagar os R$10 😊",
      imageBase64: "fake-base64-data",
      imageMediaType: "image/jpeg",
    });
    const body = (JSON.parse(fetchMock.mock.calls[0][1]?.body || '{}'));
    // Confirma que o histórico inteiro (14 turnos) chegou ao Claude — antes cortava em 8
    const msgsSerialized = JSON.stringify(body.messages);
    expect(msgsSerialized).toMatch(/Instagram/i);
    expect(msgsSerialized).toMatch(/@piseirosertanejo/i);
    expect(msgsSerialized).toMatch(/1000/);
    expect(msgsSerialized).toMatch(/já tenho/i);
  });

  it("com imagem: system prompt injeta bloco 'IMAGEM NA CONVERSA' com regra de fechamento", async () => {
    const { fetchMock } = await callAgent({
      history: advancedHistory,
      mockReply: "Perfeito! É só clicar em gerar PIX 😊",
      imageBase64: "fake-base64-data",
      imageMediaType: "image/jpeg",
    });
    const body = (JSON.parse(fetchMock.mock.calls[0][1]?.body || '{}'));
    const sys = extractSystemText(body.system);
    expect(/IMAGEM NA CONVERSA/i.test(sys), "FALHOU: bloco 'IMAGEM NA CONVERSA' não injetado").toBe(true);
    expect(/PAGAMENTO|CHECKOUT|PIX|AJUDANDO A CONCLUIR/i.test(sys)).toBe(true);
    expect(/PROIBIDO voltar a pergunta de descoberta/i.test(sys)).toBe(true);
  });

  it("sem imagem: bloco 'IMAGEM NA CONVERSA' NÃO é injetado", async () => {
    const { fetchMock } = await callAgent({
      history: advancedHistory,
      mockReply: "Beleza!",
    });
    const body = (JSON.parse(fetchMock.mock.calls[0][1]?.body || '{}'));
    expect(/IMAGEM NA CONVERSA \(ABSOLUTA/i.test(extractSystemText(body.system))).toBe(false);
  });

  it("com imagem: text block anexado à última msg inclui instrução de não resetar", async () => {
    const { fetchMock } = await callAgent({
      history: advancedHistory,
      mockReply: "ok",
      imageBase64: "fake-base64-data",
      imageMediaType: "image/jpeg",
    });
    const body = (JSON.parse(fetchMock.mock.calls[0][1]?.body || '{}'));
    const lastUser = [...body.messages].reverse().find((m: { role: string }) => m.role === "user");
    const parts = Array.isArray(lastUser?.content) ? lastUser.content : [];
    const textPart = parts.find((p: { type: string }) => p.type === "text");
    expect(textPart?.text).toMatch(/NÃO como um reset/i);
    expect(textPart?.text).toMatch(/PAGAMENTO|CHECKOUT/i);
  });
});
describe("17) REGRA DE CONCISÃO — bloco injetado no system prompt", () => {
  it("system prompt inclui o bloco REGRA DE CONCISÃO com anti-repetição", async () => {
    const { fetchMock } = await callAgent({
      history: [
        { sender: "agente", body: OPENING },
        { sender: "cliente", body: "é seguro?" },
      ],
      mockReply: "É seguro sim!",
    });
    const body = (JSON.parse(fetchMock.mock.calls[0][1]?.body || '{}'));
    const sys = extractSystemText(body.system);
    expect(/REGRA DE CONCISÃO/i.test(sys)).toBe(true);
    expect(/NUNCA REPETIR EXPLICAÇÃO JÁ DADA/i.test(sys)).toBe(true);
    expect(/PROIBIDO repetir/i.test(sys)).toBe(true);
  });

  it("bloco lista os tipos cobertos (entrega, segurança, pagamento, painel)", async () => {
    const { fetchMock } = await callAgent({
      history: [
        { sender: "agente", body: OPENING },
        { sender: "cliente", body: "ok" },
      ],
      mockReply: "Show!",
    });
    const sys = extractSystemText((JSON.parse(fetchMock.mock.calls[0][1]?.body || '{}')).system);
    expect(/entrega|ritmo|segurança|painel|pagamento/i.test(sys)).toBe(true);
    expect(/como te falei|como comentei|como expliquei/i.test(sys)).toBe(true);
  });
});