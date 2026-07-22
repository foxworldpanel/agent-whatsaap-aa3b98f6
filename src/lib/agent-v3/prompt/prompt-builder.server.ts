import type { LoadedModuleV3 } from "../brain/modules.server";

export type PromptBuildWarning = {
  key: string;
  reason: "missing" | "empty";
};

export type PromptBuildResult = {
  prompt: string;
  includedKeys: string[];
  warnings: PromptBuildWarning[];
};

/**
 * Monta o prompt preservando a ordem de seleção, mas protege o runtime contra
 * chaves duplicadas, módulos ausentes e conteúdos vazios.
 */
export function buildPromptFromModulesDetailed(
  keys: string[],
  modules: Record<string, string | LoadedModuleV3>,
): PromptBuildResult {
  const uniqueKeys = Array.from(
    new Set(keys.map((key) => key.trim().toLowerCase()).filter(Boolean)),
  );
  const warnings: PromptBuildWarning[] = [];
  const includedKeys: string[] = [];
  const parts: string[] = [];

  for (const key of uniqueKeys) {
    const module = modules[key];
    if (!module) {
      warnings.push({ key, reason: "missing" });
      continue;
    }

    const content = (typeof module === "string" ? module : module.content).trim();
    if (!content) {
      warnings.push({ key, reason: "empty" });
      continue;
    }

    const source = typeof module === "string" ? "custom" : module.source;
    const version = typeof module === "string" ? "custom" : module.version;
    includedKeys.push(key);
    parts.push(`[MODULE: ${key} | source: ${source} | version: ${version}]\n${content}`);
  }

  return {
    prompt: parts.join("\n\n"),
    includedKeys,
    warnings,
  };
}

export function buildPromptFromModules(
  keys: string[],
  modules: Record<string, string | LoadedModuleV3>,
): string {
  return buildPromptFromModulesDetailed(keys, modules).prompt;
}
