/**
 * Suíte de simulação de conversa da Júlia.
 *
 * Cada teste monta um histórico e valida se a resposta atende regras
 * críticas que já causaram regressões em produção. Os testes que
 * chamam `generateAgentReplyWithMeta` mockam `global.fetch` — assim
 * NÃO gastam créditos da Anthropic e rodam em milissegundos.
 *
 * Rodar: `bunx vitest run tests/agent-conversation.test.ts`
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  generateAgentReplyWithMeta,
  guardFreeTrialOffer,
  humanizePunctuation,
  getInitialBlastInterestReply,
  buildSystemPrompt,
} from "@/lib/ai.server";
import { autoSplitLongParts, LONG_MESSAGE_THRESHOLD } from "@/lib/message-splitter";

const OPENING =
  "Oi, bom dia Romulo! Peguei o seu contato no perfil @sourcee, achei muito bom o conteúdo! Posso te mostrar algo que pode acelerar o crescimento das suas redes?";

const FAREWELL_PATTERNS = [
  /de\s+nada/i,
  /qualquer\s+coisa\s+me\s+chama/i,
  /fico\s+(no\s+)?aguardo/i,
  /at[eé]\s+mais/i,
  /at[eé]\s+logo/i,
  /at[eé]\s+j[aá]/i,
  /obrigad[ao].*!$/i,
];

function hasFarewell(text: string): boolean {
  return FAREWELL_PATTERNS.some((rx) => rx.test(text));
}

function baseAgent() {
  return {
    agent_name: "Júlia",
    tone: "consultivo, humano",
    base_instruction: "Você é a Júlia, atendente humana.",
    script_frio: "",
    script_inativo: "",
    script_ativo: "",
    main_offer: "",
    panel_link: null,
  };
}

function baseContact() {
  return { nome: "Romulo", perfil: "frio" as const };
}

/** Mock do fetch da Anthropic — devolve `reply` como resposta canônica. */
function mockAnthropic(reply: string) {
  return vi.fn(async (url: RequestInfo | URL) => {
    const u = typeof url === "string" ? url : (url as URL).toString();
    if (!u.includes("api.anthropic.com")) {
      throw new Error(`Unexpected fetch in test: ${u}`);
    }
    return new Response(
      JSON.stringify({ content: [{ type: "text", text: reply }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });
}

async function callAgent(opts: {
  history: Array<{ sender: "agente" | "cliente"; body: string }>;
  mockReply: string;
  freeTestServices?: Array<{ service_id: string; service_name: string; category: string; quantity: number }>;
  isInbound?: boolean;
}) {
  const fetchMock = mockAnthropic(opts.mockReply);
  vi.stubGlobal("fetch", fetchMock);
  process.env.ANTHROPIC_API_KEY = "test-key";
  const res = await generateAgentReplyWithMeta({
    agent: baseAgent(),
    contact: baseContact(),
    history: opts.history,
    isInbound: opts.isInbound ?? false,
    freeTestServices: opts.freeTestServices ?? [],
    userId: null,
  });
  return { ...res, fetchMock };
}

beforeEach(() => {
  vi.unstubAllGlobals();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// 1) Reconhecimento de interesse amplo — agora via Claude (sem interceptador)
// ---------------------------------------------------------------------------
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
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(
        /EXEMPLO_MODELO_DISPARO|Qual rede social/i.test(body.system),
        "FALHOU: system prompt não contém o exemplo_disparo para o Claude aplicar",
      ).toBe(true);
    },
  );
});

// ---------------------------------------------------------------------------
// 2) Cortesia neutra ("oi", "bom dia") — também passa pelo Claude
// ---------------------------------------------------------------------------
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
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(
        /NEUTRA\s*\/?\s*S[OÓ]\s*CORTESIA|reciprocidade social/i.test(body.system),
        "FALHOU: prompt não contém regra de categoria NEUTRA para o Claude decidir",
      ).toBe(true);
    },
  );
});

// ---------------------------------------------------------------------------
// 3) Anti-invenção de serviço — checa que o system prompt CONTÉM a regra
// ---------------------------------------------------------------------------
describe("3) Anti-invenção de serviço no system prompt", () => {
  it("prompt contém ANTI-INVENÇÃO obrigando perguntar rede/serviço", () => {
    const prompt = buildSystemPrompt({
      agent: baseAgent(),
      contact: baseContact(),
      history: [
        { sender: "agente", body: OPENING },
        { sender: "cliente", body: "sim" },
      ],
      isInbound: false,
    });
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

// ---------------------------------------------------------------------------
// 4) Teste grátis só se elegível — guard bloqueia oferta indevida
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// 5) Terminologia correta por rede — checa regra no prompt
// ---------------------------------------------------------------------------
describe("5) Terminologia por rede (YouTube/TikTok = views)", () => {
  it("prompt contém TERMINOLOGIA proibindo 'plays' em YouTube/TikTok", () => {
    const prompt = buildSystemPrompt({
      agent: baseAgent(),
      contact: baseContact(),
      history: [{ sender: "cliente", body: "quero views no youtube" }],
    });
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
  it("prompt contém regra de split (padrão 1 mensagem, >350 chars pra dividir)", () => {
    const prompt = buildSystemPrompt({
      agent: baseAgent(),
      contact: baseContact(),
      history: [{ sender: "cliente", body: "oi" }],
    });
    expect(
      /REGRA DE SPLIT/i.test(prompt),
      "FALHOU: regra de split ausente",
    ).toBe(true);
    expect(
      /350/.test(prompt),
      "FALHOU: threshold de 350 caracteres ausente",
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

// ---------------------------------------------------------------------------
// 8) Fechamento não prematuro — checa regra no prompt
// ---------------------------------------------------------------------------
describe("8) Fechamento não prematuro (não se despede antes do painel)", () => {
  it('prompt ensina que "Ok/blz" após preço é CONFIRMAÇÃO, não despedida', () => {
    const prompt = buildSystemPrompt({
      agent: baseAgent(),
      contact: baseContact(),
      history: [
        { sender: "agente", body: "Pra começar, 1000 seguidores sai R$50." },
        { sender: "cliente", body: "ok" },
      ],
    });
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

describe("9) Auto-split de mensagens longas com \\n\\n", () => {
  it("resposta curta com \\n\\n NÃO divide", () => {
    const short = "Show!\n\nQual seu objetivo?";
    const parts = autoSplitLongParts([short]);
    expect(
      parts.length === 1,
      `FALHOU: mensagem curta (${short.length} chars) foi dividida em ${parts.length} partes — deveria continuar como 1`,
    ).toBe(true);
  });

  it("resposta longa (>350 chars) com \\n\\n DIVIDE em partes", () => {
    const long =
      "No YouTube o que mais pesa hoje é a combinação de views, inscritos e horas de exibição — views mostram que o vídeo tá performando, inscritos consolidam a base de audiência recorrente e horas de exibição são o que destrava monetização e alcance orgânico. Cada um puxa o outro e o algoritmo entende que o canal tá relevante." +
      "\n\n" +
      "Qual seu objetivo hoje: crescer em views, ganhar inscritos ou já mirar direto na monetização?";
    expect(long.length > LONG_MESSAGE_THRESHOLD).toBe(true);
    const parts = autoSplitLongParts([long]);
    expect(
      parts.length === 2,
      `FALHOU: resposta longa com 2 parágrafos deveria virar 2 mensagens; virou ${parts.length}`,
    ).toBe(true);
    expect(parts[0]).toContain("views");
    expect(parts[1]).toMatch(/objetivo/i);
  });

  it("preserva ===SPLIT=== explícito e ainda auto-divide partes longas", () => {
    const longPart =
      "Explicação bem completa sobre benefício de views no YouTube: views mostram que o vídeo tá performando, ajudam no algoritmo, empurram pra mais gente, aumentam retenção, geram inscritos, e assim por diante — é o motor principal de crescimento orgânico no YouTube hoje em dia sem sombra de dúvida." +
      "\n\n" +
      "Quer priorizar views, inscritos ou horas de exibição pra monetizar?";
    expect(longPart.length > LONG_MESSAGE_THRESHOLD).toBe(true);
    const parts = autoSplitLongParts([longPart, "www.mindsmmpanel.com"]);
    expect(
      parts.length === 3,
      `FALHOU: esperava 3 partes (2 do split automático + 1 do link), veio ${parts.length}`,
    ).toBe(true);
    expect(parts[2]).toBe("www.mindsmmpanel.com");
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
    const prompt = buildSystemPrompt({
      agent: baseAgent(),
      contact: baseContact(),
      history: [],
    });
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
