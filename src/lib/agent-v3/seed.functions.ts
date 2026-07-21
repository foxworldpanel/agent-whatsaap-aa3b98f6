import { createServerFn } from "@tanstack/react-start";
import { withWorkspaceScope } from "@/lib/workspace-scope-middleware";

/**
 * A V3 não semeia conhecimento pelo código. Os módulos devem ser criados e
 * mantidos no CMS, que é a fonte única da verdade.
 */
export const seedModulesToDb = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .handler(async () => ({
    ok: false,
    disabled: true,
    message: "Seed por código desativado. Cadastre e edite os módulos diretamente no CMS V3.",
  }));
