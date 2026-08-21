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

// Consulta o status em tempo real durante uma conexão em andamento (o
// login pode levar até 20 minutos, feito manualmente pelo usuário via
// VNC). Diferente de validateInstagramAction, que só confirma sessão
// já salva em disco — esta consulta o estado em memória do worker,
// incluindo o username assim que o login é detectado.
export const getInstagramStatusAction = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ credentialId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { InstagramSessionManager } = await import("./instagram-session-manager.server");
    return await InstagramSessionManager.getStatus(data.credentialId);
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
