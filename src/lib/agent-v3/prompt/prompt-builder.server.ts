import type { LoadedModuleV3 } from "../brain/modules.server";

export function buildPromptFromModules(
  keys: string[],
  modules: Record<string, string | LoadedModuleV3>,
): string {
  return keys
    .map((key) => {
      const module = modules[key];
      if (!module) return "";
      const content = typeof module === "string" ? module : module.content;
      const source = typeof module === "string" ? "custom" : module.source;
      const version = typeof module === "string" ? "custom" : module.version;
      return `[MODULE: ${key} | source: ${source} | version: ${version}]\n${content.trim()}`;
    })
    .filter(Boolean)
    .join("\n\n");
}
