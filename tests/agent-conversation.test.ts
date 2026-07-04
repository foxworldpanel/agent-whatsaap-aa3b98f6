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
// 1) Reconhecimento de interesse amplo — determinístico (rule-based)
// ---------------------------------------------------------------------------
describe("1) Reconhecimento de interesse pós-abertura de disparo", () => {
  it.each(["blz", "certo", "pode falar", "sim", "manda", "bora"])(
    'resposta "%s" deve gerar pergunta de rede, nunca despedida',
    async (resposta) => {
      const rule = getInitialBlastInterestReply([
        { sender: "agente", body: OPENING },
        { sender: "cliente", body: resposta },
      ]);
      expect(
        rule,
        `FALHOU: nenhuma resposta determinística para interesse "${resposta}"`,
      ).toBeTruthy();
      expect(
        /rede/i.test(rule!),
        `FALHOU: resposta não pergunta rede: "${rule}"`,
      ).toBe(true);
      expect(
        hasFarewell(rule!),
        `FALHOU: resposta contém despedida prematura: "${rule}"`,
      ).toBe(false);
    },
  );
});

// ---------------------------------------------------------------------------
// 2) Cortesia neutra ("oi", "bom dia") — NÃO cai na regra determinística
// ---------------------------------------------------------------------------
describe('2) Cortesia neutra (não pula pra pergunta de rede)', () => {
  it.each(["oi", "bom dia", "boa tarde", "olá"])(
    'resposta "%s" deixa o LLM aplicar a regra (sem forçar rede)',
    (resposta) => {
      const rule = getInitialBlastInterestReply([
        { sender: "agente", body: OPENING },
        { sender: "cliente", body: resposta },
      ]);
      expect(
        rule,
        `FALHOU: "${resposta}" foi tratado como interesse afirmado; deveria voltar null para o LLM aplicar a regra de retribuir saudação`,
      ).toBeNull();
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
