import { describe, expect, it } from "vitest";
import {
  EMPTY_CONVERSATION_FACTS_V3,
  extractConversationFactsV3,
} from "@/lib/agent-v3/memory/conversation-facts.server";

describe("Agent V3 structured conversation facts", () => {
  it("remembers name, music, artist and objective across turns", () => {
    let facts = extractConversationFactsV3(
      "Meu nome é Lucas. Meu nome artístico é LKS.",
      EMPTY_CONVERSATION_FACTS_V3,
    );
    facts = extractConversationFactsV3(
      "Minha música se chama Noite Azul.",
      facts,
    );
    facts = extractConversationFactsV3(
      "Meu objetivo é divulgar a música no Spotify",
      facts,
    );

    expect(facts).toEqual({
      customerName: "Lucas",
      artistName: "LKS",
      musicTitle: "Noite Azul",
      objective: "divulgar a música no Spotify",
    });
  });

  it("does not erase remembered facts when the next message omits them", () => {
    const current = {
      customerName: "Ana",
      artistName: "Analu",
      musicTitle: "Horizonte",
      objective: "aumentar alcance",
    };

    expect(extractConversationFactsV3("Quanto fica?", current)).toEqual(current);
  });
});
