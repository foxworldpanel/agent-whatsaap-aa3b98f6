import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Server functions que conversam com os endpoints de descoberta do
// Instagram Worker (VPS) — /api/instagram/discover e seu status. Não
// duplica lógica: o worker já faz a navegação real e salva os leads
// direto no banco (mesma tabela lead_finder_leads que o resto do
// sistema usa) — aqui só orquestra iniciar e acompanhar o progresso.

export const startDiscoveryAction = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        credentialId: z.string(),
        hashtag: z.string().min(1),
        maxLeads: z.number().min(1).max(200).default(20),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { InstagramWorkerClient } = await import("@/lib/instagram-worker/instagram-worker");
    const client = new InstagramWorkerClient();
    return await client.discover(data.credentialId, data.hashtag, data.maxLeads);
  });

export const getDiscoveryStatusAction = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ jobId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { InstagramWorkerClient } = await import("@/lib/instagram-worker/instagram-worker");
    const client = new InstagramWorkerClient();
    return await client.discoveryStatus(data.jobId);
  });
