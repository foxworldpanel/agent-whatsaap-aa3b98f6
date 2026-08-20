import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const connectInstagramAction = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ credentialId: z.string().optional() }).parse(data))
  .handler(async ({ data }) => {
    const { InstagramSessionManager } = await import("./instagram-session-manager.server");
    return await InstagramSessionManager.connect(data?.credentialId);
  });

export const disconnectInstagramAction = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ credentialId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { InstagramSessionManager } = await import("./instagram-session-manager.server");
    return await InstagramSessionManager.disconnect(data.credentialId);
  });

export const reconnectInstagramAction = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ credentialId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { InstagramSessionManager } = await import("./instagram-session-manager.server");
    return await InstagramSessionManager.reconnect(data.credentialId);
  });

export const validateInstagramAction = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ credentialId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { InstagramSessionManager } = await import("./instagram-session-manager.server");
    return await InstagramSessionManager.validate(data.credentialId);
  });

export const removeInstagramAction = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ credentialId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { InstagramSessionManager } = await import("./instagram-session-manager.server");
    return await InstagramSessionManager.remove(data.credentialId);
  });

export const listInstagramSessionsAction = createServerFn({ method: "GET" })
  .handler(async () => {
    const { InstagramSessionManager } = await import("./instagram-session-manager.server");
    return await InstagramSessionManager.listSessions();
  });

export const checkInstagramEnvironmentAction = createServerFn({ method: "GET" })
  .handler(async () => {
    const workerUrl = process.env.INSTAGRAM_WORKER_URL;
    return {
      playwright: false,
      chromium: false,
      workerConfigured: !!workerUrl,
      workerUrl: workerUrl ? 'CONFIGURED' : 'MISSING',
      timestamp: new Date().toISOString()
    };
  });
