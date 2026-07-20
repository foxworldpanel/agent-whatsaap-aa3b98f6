
import { loadAgentIdentity } from "./src/lib/agent-identity.server";
import { loadAgentConfigV3 } from "./src/lib/agent-v3/config.server";
import { selectRelevantModules, buildPromptFromModules } from "./src/lib/agent-v3/module-selector.server";

async function checkData() {
  const userId = "f8da521a-e8db-4efe-8c9b-9bd69749c0a7";
  const identity = await loadAgentIdentity(userId);
  const config = await loadAgentConfigV3(userId);
  
  console.log("IDENTITY PERSONA:", identity.persona);
  console.log("MODULES ENABLED:", config.modules_enabled);
  
  const modules = selectRelevantModules("quero comprar plays", Object.keys(config.modules_enabled).filter(k => config.modules_enabled[k]));
  console.log("SELECTED MODULES FOR 'plays':", modules);
  
  const prompt = buildPromptFromModules(modules, config.brand_blocks);
  console.log("PROMPT CONTENT FOR SPOTIFY:", prompt.includes("SPOTIFY") ? "YES" : "NO");
}

checkData().catch(console.error);
