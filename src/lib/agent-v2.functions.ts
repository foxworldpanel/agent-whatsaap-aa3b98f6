import { createServerFn } from "@tanstack/react-router";
// Este arquivo está obsoleto e deve ser removido após a limpeza de referências.
// Por enquanto, limpamos o conteúdo para evitar erros de build.
export const runAgentV2Turn = createServerFn({ method: "POST" })
  .handler(async () => {
    throw new Error("Runtime V2 desativada. Use o pipeline V1 original.");
  });
