import { afterEach, describe, expect, it, vi } from "vitest";
import { callAnthropicV3 } from "../../../src/lib/agent-v3/integrations/llm-client.server";

describe("callAnthropicV3", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("exige chave de API antes de chamar fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(
      callAnthropicV3({ apiKey: " ", system: [], messages: [], model: "claude-test" }),
    ).rejects.toThrow("Anthropic API key is required");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("propaga o request id retornado nos headers", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          content: [{ type: "text", text: "Olá" }],
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
        { status: 200, headers: { "request-id": "req_123" } },
      ),
    );

    const result = await callAnthropicV3({
      apiKey: "test-key",
      system: [],
      messages: [],
      model: "claude-test",
    });

    expect(result.request_id).toBe("req_123");
  });

  it("repete uma chamada em erro 429 e retorna quando a tentativa seguinte funciona", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response("rate limited", { status: 429, headers: { "retry-after": "0" } }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ content: [{ type: "text", text: "ok" }] }), {
          status: 200,
        }),
      );

    const promise = callAnthropicV3({
      apiKey: "test-key",
      system: [],
      messages: [],
      model: "claude-test",
    });
    await vi.runAllTimersAsync();

    await expect(promise).resolves.toMatchObject({
      content: [{ type: "text", text: "ok" }],
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("não repete erros 4xx não recuperáveis", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("bad request", { status: 400 }));

    await expect(
      callAnthropicV3({
        apiKey: "test-key",
        system: [],
        messages: [],
        model: "claude-test",
      }),
    ).rejects.toThrow("Anthropic API Error: 400");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
