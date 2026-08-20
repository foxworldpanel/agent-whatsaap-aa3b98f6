import { createServerFn } from "@tanstack/react-start";
import { InstagramSessionManager } from "./instagram-session-manager";
import { EnvironmentCheckService } from "./environment-check.service";
import { z } from "zod";

export const connectInstagramAction = createServerFn({ method: "POST" })
  .handler(async () => {
    return await InstagramSessionManager.connect();
  });

export const disconnectInstagramAction = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ credentialId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    return await InstagramSessionManager.disconnect(data.credentialId);
  });

export const reconnectInstagramAction = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ credentialId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    return await InstagramSessionManager.reconnect(data.credentialId);
  });

export const validateInstagramAction = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ credentialId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    return await InstagramSessionManager.validate(data.credentialId);
  });

export const removeInstagramAction = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ credentialId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    return await InstagramSessionManager.remove(data.credentialId);
  });

export const listInstagramSessionsAction = createServerFn({ method: "GET" })
  .handler(async () => {
    return await InstagramSessionManager.listSessions();
  });

export const checkInstagramEnvironmentAction = createServerFn({ method: "GET" })
  .handler(async () => {
    return await EnvironmentCheckService.checkEnvironment();
  });


