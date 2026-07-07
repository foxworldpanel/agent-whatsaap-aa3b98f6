import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendAgentTextGuarded } from "@/lib/send-agent-guarded.server";
import { containsEmoji } from "@/lib/emoji-limiter";

// Mock uazapi.server: captura o texto final enviado sem chamar HTTP.
const sent: Array<{ phone: string; text: string }> = [];
vi.mock("@/lib/uazapi.server", () => ({
  uazapiSendText: vi.fn(async (_creds: unknown, phone: string, text: string) => {
    sent.push({ phone, text });
    return { messageId: "mock", status: "sent", raw: {} };
  }),
}));

// Mock supabaseAdmin: helper busca histórico de agente daqui.
let mockRecentAgentBodies: string[] = [];
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () => ({
              limit: async () => ({
                // Simula ordem DESC — helper faz .reverse() internamente.
                data: [...mockRecentAgentBodies].reverse().map((body) => ({ body })),
                error: null,
              }),
            }),
          }),
        }),
      }),
    }),
  },
}));

const CREDS = { uazapi_url: "x", uazapi_token: "y" } as never;

beforeEach(() => {
  sent.length = 0;
  mockRecentAgentBodies = [];
});

describe("sendAgentTextGuarded — guards centralizados em todos os caminhos canned", () => {
  it("remove emoji quando a última mensagem do agente já tinha emoji (canned path)", async () => {
    mockRecentAgentBodies = ["Como posso ajudar? 😊"]; // ex: reply anterior do Claude
    const res = await sendAgentTextGuarded(
      CREDS,
      "5511999",
      "Ótimo! Qualquer dúvida durante o processo é só me chamar que eu te ajudo 😊",
      { conversationId: "conv-1", source: "welcome_funnel_panel_text" },
    );
    expect(res.strippedEmoji).toBe(true);
    expect(containsEmoji(res.transformed)).toBe(false);
    expect(sent[0].text).toBe(res.transformed);
    expect(sent[0].text).toContain("Qualquer dúvida");
  });

  it("permite emoji quando o histórico está limpo", async () => {
    mockRecentAgentBodies = ["Ok, valeu!", "Sem problema."];
    const res = await sendAgentTextGuarded(
      CREDS,
      "5511999",
      "Show! Bora fechar 😊",
      { conversationId: "conv-2", source: "free_trial_success" },
    );
    expect(res.strippedEmoji).toBe(false);
    expect(containsEmoji(sent[0].text)).toBe(true);
  });

  it("respeita isBlastOpening (não mexe no emoji na abertura de disparo)", async () => {
    mockRecentAgentBodies = ["Msg anterior 😊"];
    const res = await sendAgentTextGuarded(
      CREDS,
      "5511999",
      "Oi! 😊 Peguei seu contato...",
      { conversationId: "conv-3", source: "blast_opening", isBlastOpening: true },
    );
    expect(res.strippedEmoji).toBe(false);
    expect(containsEmoji(sent[0].text)).toBe(true);
  });

  it("applyHumanize normaliza en/em-dash (opt-in para LLM output)", async () => {
    mockRecentAgentBodies = [];
    const res = await sendAgentTextGuarded(
      CREDS,
      "5511999",
      "Beleza — vou te mandar o link agora.",
      { conversationId: "conv-4", source: "test", applyHumanize: true },
    );
    expect(res.transformed).not.toContain("—");
    expect(sent[0].text).toBe(res.transformed);
  });

  it("SEM applyHumanize (default canned): preserva pontuação do texto do usuário", async () => {
    mockRecentAgentBodies = [];
    const original = "Beleza — vou te mandar o link agora.";
    const res = await sendAgentTextGuarded(
      CREDS,
      "5511999",
      original,
      { conversationId: "conv-5", source: "welcome_funnel_welcome_text" },
    );
    expect(res.transformed).toBe(original);
  });

  it("recentAgentBodiesOverride permite injetar histórico (testes)", async () => {
    const res = await sendAgentTextGuarded(
      CREDS,
      "5511999",
      "Fechou! 👍",
      {
        conversationId: "conv-6",
        source: "verbose_loop_farewell",
        recentAgentBodiesOverride: ["Antes 😊"],
      },
    );
    expect(res.strippedEmoji).toBe(true);
    expect(containsEmoji(sent[0].text)).toBe(false);
  });

  it("REGRESSÃO REAL 17:00→17:06 reproduzida via helper canned path", async () => {
    // 17:00 msg foi enviada (Claude flow) → armazenada no DB com emoji.
    // 17:06 uma msg canned (ex: welcome_funnel_panel_text) tenta enviar
    // outra com emoji → guard remove porque o histórico agora reflete a
    // msg anterior, INDEPENDENTE de qual caminho a gerou.
    mockRecentAgentBodies = ["Como posso ajudar? 😊"];
    const res = await sendAgentTextGuarded(
      CREDS,
      "5511999",
      "Ótimo! Qualquer dúvida é só me chamar que eu te ajudo 😊",
      { conversationId: "conv-regressao", source: "welcome_funnel_panel_text" },
    );
    expect(containsEmoji(res.transformed)).toBe(false);
    // Par consecutivo não pode ter emoji:
    expect(
      containsEmoji(mockRecentAgentBodies[0]) && containsEmoji(sent[0].text),
      `FALHOU: 2 msgs consecutivas com emoji após helper: "${sent[0].text}"`,
    ).toBe(false);
  });
});