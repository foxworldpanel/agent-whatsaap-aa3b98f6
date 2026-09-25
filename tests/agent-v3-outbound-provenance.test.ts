import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  normalizeOutboundLeadContext,
  outboundLeadPromptContext,
} from "../src/lib/agent-v3/outbound-lead-context.server";
import { buildOutboundBaseApproach } from "../src/lib/agent-v3/prompt/prompt-outbound.server";
import { decideSharedPreExecution } from "../src/lib/agent-v3/core/pre-execution-decision.server";

describe("Agent V3 outbound provenance end-to-end contract", () => {
  it("normalizes factual Lead Finder provenance without a contact name", () => {
    const ctx = normalizeOutboundLeadContext({
      profile_username: "@joaomusico",
      segment: "música",
    });
    expect(ctx).toEqual({
      source: "lead_finder",
      instagram: "joaomusico",
      segment: "música",
    });
    expect(buildOutboundBaseApproach({
      instagram: ctx!.instagram,
      segment: ctx!.segment,
    })).toBe(
      "Oi! Tudo bem? Encontrei seu contato através do Instagram @joaomusico. Vi que você trabalha com música e queria te apresentar uma solução da Mind que pode ajudar na divulgação. Tem interesse em conhecer?",
    );
  });

  it("fails closed when Instagram or segment is missing", () => {
    expect(normalizeOutboundLeadContext({ instagram: "@joao", segment: "" })).toBeNull();
    expect(normalizeOutboundLeadContext({ instagram: "", segment: "música" })).toBeNull();
    expect(() => buildOutboundBaseApproach({ instagram: "", segment: "música" })).toThrow();
  });

  it("keeps exact Instagram provenance available to the shared brain", () => {
    const ctx = normalizeOutboundLeadContext({ instagram: "@joaomusico", segmento: "artista" });
    const prompt = outboundLeadPromptContext(ctx);
    expect(prompt).toContain("origem: Lead Finder");
    expect(prompt).toContain("Instagram de origem: @joaomusico");
    expect(prompt).toContain("segmento: artista");
  });

  it("answers source questions deterministically from the stored handle", () => {
    const result = decideSharedPreExecution({
      message: "de onde vocês conseguiram meu contato?",
      history: [],
      inputKind: "texto",
      isOutboundReply: true,
      outboundInstagram: "@joaomusico",
    });
    expect(result).toEqual({
      kind: "outbound_source",
      reply: "Encontrei seu contato através do Instagram @joaomusico.",
    });
  });

  it("does not fabricate a source answer when the handle is unavailable", () => {
    const result = decideSharedPreExecution({
      message: "de onde vocês conseguiram meu contato?",
      history: [],
      inputKind: "texto",
      isOutboundReply: true,
      outboundInstagram: null,
    });
    expect(result.kind).not.toBe("outbound_source");
  });

  it("wires the same provenance through production and Playground", () => {
    const runtime = readFileSync(join(process.cwd(), "src/lib/agent-v3/runtime.server.ts"), "utf8");
    const dispatcher = readFileSync(join(process.cwd(), "src/routes/api/public/hooks/blast-dispatcher.ts"), "utf8");
    const playground = readFileSync(join(process.cwd(), "src/lib/agent-v3/admin/playground.functions.ts"), "utf8");
    const orchestrator = readFileSync(join(process.cwd(), "src/lib/agent-v3/orchestrator.server.ts"), "utf8");

    expect(runtime).toContain('from("lead_finder_leads")');
    expect(runtime).toContain("outboundLeadContext,");
    expect(runtime).toContain('source_data: {');
    expect(dispatcher).toContain("buildOutboundBaseApproach");
    expect(dispatcher).toContain('from("lead_finder_leads")');
    expect(dispatcher).toContain("disparo sem @Instagram/segmento factual do Lead Finder");
    expect(dispatcher).toContain('source: "disparo"');
    expect(playground).toContain("buildOutboundBaseApproach");
    expect(playground).toContain("outboundLeadContext");
    expect(playground).not.toContain('montarMensagemDisparo("Teste"');
    expect(orchestrator).toContain("outboundLeadPromptContext(outboundLeadContext)");
  });
});
