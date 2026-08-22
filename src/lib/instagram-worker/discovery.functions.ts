import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Server functions que conversam com os endpoints de descoberta do
// Instagram Worker (VPS) — /api/instagram/discover e seu status. O
// worker só navega e devolve dado bruto — quem persiste no banco é o
// LeadService, chamado pela tela a cada consulta de status.

export const startDiscoveryAction = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        credentialId: z.string(),
        hashtag: z.string().min(1),
        maxLeads: z.number().min(1).max(200).default(20),
        minDelaySec: z.number().min(1).max(60).default(5),
        maxDelaySec: z.number().min(1).max(60).default(12),
        excludeUsernames: z.array(z.string()).default([]),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { InstagramWorkerClient } = await import("@/lib/instagram-worker/instagram-worker");
    const client = new InstagramWorkerClient();
    return await client.discover(data.credentialId, data.hashtag, data.maxLeads, {
      minDelaySec: data.minDelaySec,
      maxDelaySec: data.maxDelaySec,
      excludeUsernames: data.excludeUsernames,
    });
  });

export const getDiscoveryStatusAction = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ jobId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { InstagramWorkerClient } = await import("@/lib/instagram-worker/instagram-worker");
    const client = new InstagramWorkerClient();
    return await client.discoveryStatus(data.jobId);
  });
