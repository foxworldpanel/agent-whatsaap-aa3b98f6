import { createServerFn } from "@tanstack/react-start";

export const runAgentV2Turn = createServerFn({ method: "POST" })
  .handler(async () => {
    throw new Error("Runtime V2 desativada. Use o pipeline V1 original.");
  });
