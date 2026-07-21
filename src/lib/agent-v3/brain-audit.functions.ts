import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loadEnabledModulesV3 } from "./modules.server";
import { callAnthropicV3 } from "./llm-client.server";
import { createHash } from "crypto";

export const getBrainQualityAudit = createServerFn({ method: "GET" })
  .handler(async () => {
    const workspaceId = "bd59fa41-d68d-4ac8-b995-e09ae48f52aa";
    
    // 1. Load modules from DB
    const { data: dbModules, error } = await supabaseAdmin
      .from("agent_modules_v3")
      .select("*")
      .eq("workspace_id", workspaceId);

    if (error) throw error;

    // 2. Load runtime state
    const runtimeModules = await loadEnabledModulesV3(workspaceId);

    // 3. Automated Brain Audit via IA (Haiku 4.5)
    // We analyze the brain as a whole and each module.
    // To save tokens and cost, we'll do a batch analysis.
    
    const modulesToAnalyze = dbModules.map(m => ({
      key: m.key,
      name: m.name,
      content: m.content
    }));

    const auditPrompt = `Você é um Engenheiro de IA Sênior auditando o "Cérebro" de um Agente de Vendas (V3).
Analise os módulos abaixo e forneça uma auditoria técnica rigorosa.

REGRAS DE OURO DA V3:
1. Modularização Extrema: Cada módulo deve cuidar de APENAS um assunto.
2. Sem Duplicação: Se uma regra existe no Módulo A, não pode estar no B.
3. Sem Conflito: Regras não podem se contradizer.
4. Clareza Determinística: Instruções devem ser ordens diretas, sem "tente" ou "talvez".

MÓDULOS A SEREM ANALISADOS:
${JSON.stringify(modulesToAnalyze, null, 2)}

RESPONDA EXCLUSIVAMENTE EM JSON COM ESTA ESTRUTURA:
{
  "globalScore": number, // 0-10
  "composition": {
    "organization": number,
    "duplications": number,
    "clarity": number,
    "efficiency": number,
    "coverage": number,
    "modularization": number,
    "tokenUsage": number
  },
  "modulesAudit": [
    {
      "key": "string",
      "score": number,
      "objective": "string",
      "usefulContent": "string",
      "genericContent": "string",
      "duplicatedContent": "string",
      "contradictoryContent": "string",
      "vagueRules": "string",
      "outdatedInfo": "string",
      "missingInfo": "string",
      "risk": "string",
      "excessiveText": "string",
      "belongsElsewhere": "string",
      "recommendedAction": "string"
    }
  ],
  "duplications": [
    { "rule": "string", "moduleA": "string", "moduleB": "string", "type": "string", "severity": "alta" | "media" | "baixa", "suggestion": "string" }
  ],
  "conflicts": [
    { "conflict": "string", "moduleA": "string", "moduleB": "string", "details": "string" }
  ],
  "improvements": [
    { "type": "string", "suggestion": "string", "impact": "alto" | "medio" | "baixo" }
  ],
  "healthIndicators": {
    "totalModules": number,
    "totalTokens": number,
    "avgTokens": number,
    "duplicationCount": number,
    "conflictCount": number,
    "coverage": number,
    "selectorEfficiency": number
  }
}`;

    let auditResult;
    try {
      const llmResponse = await callAnthropicV3({
        model: "claude-3-haiku-20240307", // Using Haiku for cost-efficiency in audit
        system: "Você é um auditor de sistemas de IA. Responda apenas JSON.",
        messages: [{ role: "user", content: auditPrompt }]
      });

      const text = llmResponse.content?.[0]?.text || "{}";
      auditResult = JSON.parse(text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1));
    } catch (e) {
      console.error("Audit LLM Error:", e);
      // Fallback object structure if LLM fails
      auditResult = { globalScore: 0, modulesAudit: [] };
    }

    // Merge DB info with LLM Audit
    const finalModulesAudit = dbModules.map(m => {
      const llmAudit = auditResult.modulesAudit?.find((a: any) => a.key === m.key) || {};
      const dbHash = createHash("sha256").update(m.content || "").digest("hex").substring(0, 8);
      const runtimeContent = runtimeModules[m.key]?.content || "";
      const runtimeHash = createHash("sha256").update(runtimeContent).digest("hex").substring(0, 8);
      
      return {
        ...m,
        ...llmAudit,
        dbHash,
        runtimeHash,
        match: dbHash === runtimeHash,
        tokens: Math.ceil((m.content?.length || 0) / 4)
      };
    });

    return {
      globalScore: auditResult.globalScore || 0,
      composition: auditResult.composition || {},
      modulesAudit: finalModulesAudit,
      duplications: auditResult.duplications || [],
      conflicts: auditResult.conflicts || [],
      improvements: auditResult.improvements || [],
      healthIndicators: {
        ...auditResult.healthIndicators,
        totalModules: dbModules.length,
        totalTokens: dbModules.reduce((acc, m) => acc + (m.content?.length || 0) / 4, 0)
      }
    };
  });
