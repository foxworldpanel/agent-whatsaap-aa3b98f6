import { createServerFn } from "@tanstack/react-start";
import { InstagramSessionManager } from "./instagram-session-manager";
import { z } from "zod";

export const connectInstagramAction = createServerFn({ method: "POST" })
  .validator((data: { credentialId: string }) => z.object({ credentialId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    return await InstagramSessionManager.connect(data.credentialId);
  });

export const disconnectInstagramAction = createServerFn({ method: "POST" })
  .validator((data: { credentialId: string }) => z.object({ credentialId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    return await InstagramSessionManager.disconnect(data.credentialId);
  });

export const reconnectInstagramAction = createServerFn({ method: "POST" })
  .validator((data: { credentialId: string }) => z.object({ credentialId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    return await InstagramSessionManager.reconnect(data.credentialId);
  });

export const validateInstagramAction = createServerFn({ method: "POST" })
  .validator((data: { credentialId: string }) => z.object({ credentialId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    return await InstagramSessionManager.validate(data.credentialId);
  });

export const removeInstagramAction = createServerFn({ method: "POST" })
  .validator((data: { credentialId: string }) => z.object({ credentialId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    return await InstagramSessionManager.remove(data.credentialId);
  });

export const listInstagramSessionsAction = createServerFn({ method: "GET" })
  .handler(async () => {
    return await InstagramSessionManager.listSessions();
  });

