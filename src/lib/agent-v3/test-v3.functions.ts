import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { runAgentV3Turn } from "./orchestrator.server";

export const testV3Agent = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({
    message: z.string(),
    history: z.array(z.object({
      role: z.enum(["agent", "customer"]),
      content: z.string()
    })).default([])
  }).parse(data))
  .handler(async ({ data }) => {
    // Usamos um ID de usuário fixo para o teste do painel ou buscamos o primeiro admin
    // Para simplificar o teste manual agora, usamos um fallback
    const userId = "f8da521a-e8db-4efe-8c9b-9bd69749c0a7"; // Mind SMM Workspace User ID
    
    const result = await runAgentV3Turn({
      userId,
      message: data.message,
      history: data.history,
      enabledModules: [], // Deixa o orquestrador carregar dinamicamente do banco
      anthropicApiKey: process.env.ANTHROPIC_API_KEY || ""
    });

    return result;
  });
