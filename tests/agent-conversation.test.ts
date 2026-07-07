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
  buildSystemPrompt,
  sanitizeSystemLeaks,
} from "@/lib/ai.server";
import { MIND_BRAND_TEMPLATE } from "@/lib/agent-identity.server";
import { autoSplitLongParts } from "@/lib/message-splitter";
import {
  detectVerboseLoop,
  looksLikeConcreteAction,
  VERBOSE_LOOP_REVIEW_REASON,
  VERBOSE_LOOP_FAREWELL,
} from "@/lib/verbose-loop-guard.server";

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
      identity: MIND_BRAND_TEMPLATE,
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
  it("prompt contém regra de split com brevidade por bolha (1-2 frases, até 4 bolhas)", () => {
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
      /CADA BOLHA CURTA|no m[aá]ximo 2 frases curtas/i.test(prompt),
      "FALHOU: reforço de brevidade por bolha ausente",
    ).toBe(true);
    expect(
      /BREVIDADE|Haiku e Sonnet/i.test(prompt),
      "FALHOU: reforço explícito Haiku/Sonnet ausente no estilo",
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
      // Contexto é disparo (Júlia começou o funil de venda). Sem isInbound=false
      // o EXEMPLO_MODELO_DISPARO (onde MODO FECHAMENTO vive) é suprimido do
      // prompt — comportamento correto para conversas orgânicas/receptivas.
      isInbound: false,
      identity: MIND_BRAND_TEMPLATE,
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

describe("8b) Não repete descoberta após 'já tem cadastro?'", () => {
  it("prompt contém PROGRESSO DO FUNIL proibindo reperguntar rede/serviço/quantidade", () => {
    const prompt = buildSystemPrompt({
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
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.system.includes(fact), "FALHOU: fato técnico não chegou no system prompt").toBe(true);
    expect(
      /FATO T[ÉE]CNICO VERIFICADO/i.test(body.system),
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
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.system.includes(fact)).toBe(true);
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
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.system.includes(fact)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 13) Validação de idioma — FATO TÉCNICO respeita o idioma da conversa
// ---------------------------------------------------------------------------
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
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    // Confirma que a regra da identidade instrui responder no idioma do cliente
    expect(
      /idioma da conversa|no idioma/i.test(body.system),
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

// ---------------------------------------------------------------------------
// 14) Suporte / pós-venda — "ok" após consulta de status NÃO reinicia funil
// ---------------------------------------------------------------------------
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
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    // 1) O prompt injeta explicitamente o bloco MODO SUPORTE / PÓS-VENDA.
    expect(
      /MODO SUPORTE\s*\/?\s*P[ÓO]S-VENDA/i.test(body.system),
      "FALHOU: prompt não contém o bloco MODO SUPORTE / PÓS-VENDA para esta conversa",
    ).toBe(true);
    // 2) O prompt proíbe reiniciar o funil nesse contexto.
    expect(
      /N[ÃA]O reinicie o funil de vendas|N[ÃA]O reiniciar o funil/i.test(body.system),
      "FALHOU: prompt não proíbe reiniciar o funil de vendas em contexto de suporte",
    ).toBe(true);
    // 3) A regra reforça que "ok/blz/obrigado" fora da janela de abertura é só CONFIRMAÇÃO.
    expect(
      /apenas uma CONFIRMA[ÇC][ÃA]O|apenas reconhe[çc]a a confirma[çc][ãa]o/i.test(body.system),
      "FALHOU: prompt não explica que 'ok' fora da janela é só confirmação",
    ).toBe(true);
    // 4) A resposta final (mock neutro) NÃO contém pergunta de rede/serviço.
    expect(
      /qual\s+rede|qual\s+servi[cç]o|qual\s+plataforma|quer\s+impulsionar/i.test(text),
      `FALHOU: resposta reiniciou o funil de vendas: "${text}"`,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 15) Reengajamento após hiato — saudação no dia seguinte NÃO retoma funil
// ---------------------------------------------------------------------------
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
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(
      /MODO REENGAJAMENTO/i.test(body.system),
      "FALHOU: prompt não contém o bloco MODO REENGAJAMENTO APÓS HIATO",
    ).toBe(true);
    expect(
      /PROIBIDO emendar automaticamente/i.test(body.system),
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
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    // Regressão fix: cortesia neutra em resposta imediata à abertura de
    // disparo agora dispara o MESMO veto do MODO REENGAJAMENTO — sem depender
    // de gap de tempo. Antes caía no genérico "Como posso te ajudar?".
    expect(
      /MODO REENGAJAMENTO \/ CORTESIA EM DISPARO/i.test(body.system),
      "FALHOU: veto de cortesia em disparo não foi injetado (deveria disparar mesmo sem hiato)",
    ).toBe(true);
    expect(
      /REAPRESENTE A ISCA/i.test(body.system),
      "FALHOU: veto não instrui a reapresentar a isca da abertura",
    ).toBe(true);
    expect(
      /RECEPTIVO\)/i.test(body.system),
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
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(
      /VETO DE PRIORIDADE M[AÁ]XIMA[\s\S]*MODO REENGAJAMENTO/i.test(body.system),
      "FALHOU: veto de reengajamento não foi injetado no topo do prompt em thread de disparo",
    ).toBe(true);
    // Variante DISPARO deve reapresentar a isca ("posso te mostrar...")
    expect(
      /REAPRESENTE A ISCA/i.test(body.system),
      "FALHOU: veto de disparo não instrui a reapresentar a isca da abertura",
    ).toBe(true);
    expect(
      /Posso te mostrar como acelerar suas redes/i.test(body.system),
      "FALHOU: exemplo da isca (acelerar suas redes) ausente no veto de disparo",
    ).toBe(true);
    // No disparo, "Como posso ajudar" NÃO é o formato correto (é o formato receptivo)
    expect(
      /RECEPTIVO\)/i.test(body.system),
      "FALHOU: variante RECEPTIVA foi injetada em thread de disparo",
    ).toBe(false);
    expect(
      /REFINAMENTOS DE TOM CONSULTIVO/i.test(body.system),
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
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(
      /MODO REENGAJAMENTO APÓS HIATO \(RECEPTIVO\)/i.test(body.system),
      "FALHOU: variante RECEPTIVA do veto não foi injetada",
    ).toBe(true);
    expect(
      /Como posso ajudar/i.test(body.system),
      "FALHOU: formato 'Como posso ajudar' ausente no veto receptivo",
    ).toBe(true);
    expect(
      /REAPRESENTE A ISCA/i.test(body.system),
      "FALHOU: veto receptivo não deve pedir reapresentação de isca de disparo",
    ).toBe(false);
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
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(
      /VETO DE PRIORIDADE M[AÁ]XIMA/i.test(body.system),
      "FALHOU: veto de reengajamento foi injetado em disparo normal sem hiato",
    ).toBe(false);
    expect(
      /REFINAMENTOS DE TOM CONSULTIVO/i.test(body.system),
      "FALHOU: refinamentos do disparo desapareceram no fluxo normal (regressão)",
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Áudio ininteligível: prompt de MODO ÁUDIO precisa carregar veto que impede
// a Júlia de imitar tom/brincar junto quando a transcrição vem vazia, curta
// ou é só uma interjeição solta. Deve responder UMA vez pedindo esclarecimento.
// ---------------------------------------------------------------------------
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
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(
      /ÁUDIO ININTELIGÍVEL/i.test(body.system),
      "FALHOU: veto de áudio ininteligível ausente no MODO ÁUDIO",
    ).toBe(true);
    expect(
      /Não consegui entender bem o áudio, consegue escrever ou mandar de novo\?/i.test(body.system),
      "FALHOU: frase padrão de esclarecimento ausente no prompt",
    ).toBe(true);
    expect(
      /PROIBIDO imitar o tom|brincar junto|reproduzir o som/i.test(body.system),
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
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(/MODO ÁUDIO/i.test(body.system)).toBe(false);
    expect(/ÁUDIO ININTELIGÍVEL/i.test(body.system)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Guard determinístico contra vazamento de PROMPT INTERNO para o cliente.
// Cabeçalhos de blocos de sistema (⛔ VETO, MODO REENGAJAMENTO, etc.) nunca
// podem virar mensagem real no WhatsApp, aconteça o que acontecer na geração.
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Menu numerado de WhatsApp Business — regra deve estar ativa no prompt
// ---------------------------------------------------------------------------
describe("Detecção de mensagem automática de WhatsApp Business (saudação + menu)", () => {
  it("prompt contém sinais de MENU NUMERADO e proíbe pedido de desculpa", () => {
    const prompt = buildSystemPrompt({
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
    expect(/MENU NUMERADO|Digite \(01\)/i.test(prompt)).toBe(true);
    expect(/NUNCA responda escolhendo uma opção do menu/i.test(prompt)).toBe(true);
    expect(/acho que houve uma confus[aã]o/i.test(prompt)).toBe(true);
    expect(/respons[aá]vel por/i.test(prompt)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Regressão: conversa ORGÂNICA/receptiva NÃO deve receber o
// EXEMPLO_MODELO_DISPARO no prompt. Regressão real: cliente falando sobre
// a banda dele, no meio da conversa apareceu "Oi, bom dia Romulo!" +
// "Peguei o seu contato no perfil @sourcee" (few-shot literal do exemplo).
// ---------------------------------------------------------------------------
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
    const prompt = buildSystemPrompt({
      agent: baseAgent(),
      contact: baseContact(),
      history: ORGANIC_HISTORY,
      isInbound: true,
      identity: MIND_BRAND_TEMPLATE,
    });
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
    const prompt = buildSystemPrompt({
      agent: baseAgent(),
      contact: baseContact(),
      history: [
        { sender: "agente", body: OPENING },
        { sender: "cliente", body: "sim" },
      ],
      isInbound: false,
      identity: MIND_BRAND_TEMPLATE,
    });
    expect(EXEMPLO_BODY_SIGNATURE.test(prompt)).toBe(true);
    // E o exemplo já NÃO contém mais nome/handle real hardcoded.
    expect(/Romulo/.test(prompt), "FALHOU: nome real 'Romulo' hardcoded no exemplo").toBe(false);
    expect(/@sourcee/.test(prompt), "FALHOU: handle real '@sourcee' hardcoded no exemplo").toBe(false);
  });

  it("pipeline runtime (generateAgentReplyWithMeta) em conversa organic também NÃO injeta o exemplo", async () => {
    const { fetchMock } = await callAgent({
      history: ORGANIC_HISTORY,
      mockReply: "Claro! O Spotify funciona assim: você cria uma conta e...",
      isInbound: true,
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(
      EXEMPLO_BODY_SIGNATURE.test(body.system),
      "FALHOU: system prompt em conversa organic carregou o few-shot de disparo",
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Trava de custo: cliente muito leigo em loop de reexplicação sem avanço
// (verbose-loop-guard). Cenário real: idoso, leigo, repetindo a mesma
// dúvida por 15+ mensagens — antes queimava chamadas Anthropic infinitas.
// ---------------------------------------------------------------------------
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
