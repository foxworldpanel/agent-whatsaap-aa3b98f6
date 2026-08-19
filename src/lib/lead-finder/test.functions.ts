import { createServerFn } from "@tanstack/react-start";
import { runPhase1IntegrationTest } from "./test-integration";
import { z } from "zod";

export const runLeadFinderTest = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({}).parse(data))
  .handler(async () => {
    return await runPhase1IntegrationTest();
  });
