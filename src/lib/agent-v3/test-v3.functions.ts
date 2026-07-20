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
    const userId = "bd59fa41-a6e5-4e3a-97a6-663c6c06a4b1"; // Mind SMM Workspace ID ou User ID
    
    const result = await runAgentV3Turn({
      userId,
      message: data.message,
      history: data.history,
      enabledModules: [], // Deixa o orquestrador carregar dinamicamente do banco
      anthropicApiKey: process.env.ANTHROPIC_API_KEY || ""
    });

    return result;
  });
