
import { describe, it } from "vitest";
import { loadAgentIdentity } from "@/lib/agent-identity.server";
import { loadAgentConfigV3 } from "@/lib/agent-v3/config.server";
import { selectRelevantModules, buildPromptFromModules } from "@/lib/agent-v3/module-selector.server";

describe("Data Integrity", () => {
  it("check Mind data", async () => {
    const userId = "f8da521a-e8db-4efe-8c9b-9bd69749c0a7";
    const identity = await loadAgentIdentity(userId);
    const config = await loadAgentConfigV3(userId);
    
    console.log("IDENTITY PERSONA:", identity.persona.substring(0, 100));
    console.log("MODULES ENABLED:", Object.keys(config.modules_enabled).filter(k => config.modules_enabled[k]));
    
    const modules = selectRelevantModules("quero comprar plays", Object.keys(config.modules_enabled).filter(k => config.modules_enabled[k]));
    console.log("SELECTED MODULES FOR 'plays':", modules);
    
    const prompt = buildPromptFromModules(modules, config.brand_blocks);
    console.log("PROMPT HAS SPOTIFY:", prompt.includes("SPOTIFY"));
    if (modules.includes("spotify")) {
        console.log("SPOTIFY MODULE CONTENT:", config.brand_blocks["spotify"]?.substring(0, 200) || "MISSING IN BRAND_BLOCKS");
    }
  });
});
