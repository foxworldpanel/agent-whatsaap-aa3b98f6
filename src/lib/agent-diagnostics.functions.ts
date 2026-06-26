import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type IntegrationStatus = { name: string; ok: boolean; detail: string };

export const runAgentDiagnostics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: cfg } = await context.supabase
      .from("agent_config").select("*").eq("user_id", context.userId).maybeSingle();
    const { data: integ } = await context.supabase
      .from("integrations").select("*").eq("user_id", context.userId).maybeSingle();
    const { data: kb } = await context.supabase
      .from("knowledge_base").select("context, content").eq("user_id", context.userId);
    const { data: panel } = await context.supabase
      .from("panel_guide").select("name, description, extracted_content").eq("user_id", context.userId);
    const { data: rules } = await context.supabase
      .from("forbidden_rules").select("rule, deflection, enabled").eq("user_id", context.userId);
    const { data: freeTests } = await context.supabase
      .from("free_test_services").select("service_id, service_name, category, quantity, enabled")
      .eq("user_id", context.userId).eq("enabled", true);

    const enabledRules = (rules ?? []).filter((r) => r.enabled !== false);

    // Fetch services (preview only)
    let servicesCount = 0;
    let servicesPreview: Array<{ service: string; name: string; rate: string; min: string; max: string }> = [];
    let servicesContext: string | null = null;
    let smmStatus: IntegrationStatus = { name: "API SMM Panel", ok: false, detail: "API Key não configurada" };
    if (integ?.smm_api_key) {
      try {
        const { smmFetchServices } = await import("@/lib/smm.server");
        const list = await smmFetchServices({
          url: integ.smm_panel_url ?? "https://mindsmmpanel.com/smmpanel/api/v2",
          key: integ.smm_api_key,
        });
        servicesCount = list.length;
        servicesPreview = list.slice(0, 3).map((s) => ({
          service: s.service, name: s.name, rate: s.rate, min: s.min, max: s.max,
        }));
        servicesContext = list.slice(0, 200)
          .map((s) => `ID: ${s.service} | Nome: ${s.name} | Categoria: ${s.category} | Preço por 1000: R$${s.rate} | MÍNIMO: ${s.min} | MÁXIMO: ${s.max}`)
          .join("\n");
        smmStatus = { name: "API SMM Panel", ok: true, detail: `${list.length} serviços carregados` };
      } catch (e) {
        smmStatus = { name: "API SMM Panel", ok: false, detail: (e as Error).message };
      }
    }

    // Test Anthropic
    let anthropicStatus: IntegrationStatus = { name: "Claude (Anthropic)", ok: false, detail: "ANTHROPIC_API_KEY ausente" };
    const anthropicKey = integ?.anthropic_api_key || process.env.ANTHROPIC_API_KEY;
    if (anthropicKey) {
      try {
        const r = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "content-type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 8, messages: [{ role: "user", content: "ping" }] }),
        });
        anthropicStatus = r.ok
          ? { name: "Claude (Anthropic)", ok: true, detail: "API key válida" }
          : { name: "Claude (Anthropic)", ok: false, detail: `HTTP ${r.status}` };
      } catch (e) { anthropicStatus = { name: "Claude (Anthropic)", ok: false, detail: (e as Error).message }; }
    }

    // Test ElevenLabs
    let elevenStatus: IntegrationStatus = { name: "ElevenLabs (voz)", ok: false, detail: "Não configurado" };
    if (integ?.elevenlabs_api_key) {
      try {
        const apiKey = integ.elevenlabs_api_key.trim();
        const r = await fetch("https://api.elevenlabs.io/v1/user", {
          method: "GET",
          headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
        });
        if (r.status === 200) {
          elevenStatus = { name: "ElevenLabs (voz)", ok: true, detail: integ.elevenlabs_voice_id ? "✅ ElevenLabs conectado" : "✅ Conectado (sem Voice ID)" };
        } else if (r.status === 401) {
          elevenStatus = { name: "ElevenLabs (voz)", ok: false, detail: "❌ API Key inválida" };
        } else {
          elevenStatus = { name: "ElevenLabs (voz)", ok: false, detail: `HTTP ${r.status}` };
        }
      } catch (e) { elevenStatus = { name: "ElevenLabs (voz)", ok: false, detail: (e as Error).message }; }
    }

    // Test OpenAI Whisper
    let openaiStatus: IntegrationStatus = { name: "OpenAI Whisper", ok: false, detail: "Não configurado" };
    const openaiKey = integ?.openai_api_key || process.env.OPENAI_API_KEY;
    if (openaiKey) {
      try {
        const r = await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${openaiKey}` } });
        openaiStatus = r.ok
          ? { name: "OpenAI Whisper", ok: true, detail: "API key válida" }
          : { name: "OpenAI Whisper", ok: false, detail: `HTTP ${r.status}` };
      } catch (e) { openaiStatus = { name: "OpenAI Whisper", ok: false, detail: (e as Error).message }; }
    }

    // Test Uazapi
    let uazapiStatus: IntegrationStatus = { name: "Uazapi (WhatsApp)", ok: false, detail: "Não configurado" };
    if (integ?.uazapi_url && integ?.uazapi_token) {
      try {
        const r = await fetch(`${integ.uazapi_url.replace(/\/$/, "")}/instance/status`, {
          headers: { token: integ.uazapi_token },
        });
        uazapiStatus = r.ok
          ? { name: "Uazapi (WhatsApp)", ok: true, detail: "Conectado" }
          : { name: "Uazapi (WhatsApp)", ok: false, detail: `HTTP ${r.status}` };
      } catch (e) { uazapiStatus = { name: "Uazapi (WhatsApp)", ok: false, detail: (e as Error).message }; }
    }

    // Build full prompt preview
    let fullPrompt = "";
    if (cfg) {
      const { buildSystemPrompt } = await import("@/lib/ai.server");
      fullPrompt = buildSystemPrompt({
        agent: cfg as never,
        contact: { nome: "Cliente Exemplo", perfil: "frio" },
        history: [{ sender: "cliente", body: "[mensagem de exemplo do cliente]" }],
        servicesContext,
        isInbound: true,
        funnelAlreadySent: false,
        knowledgeExamples: (kb ?? []) as never,
        panelScreens: (panel ?? []) as never,
        forbiddenRules: enabledRules as never,
        freeTestServices: (freeTests ?? []) as never,
      });
    }

    const ci = cfg?.company_info as Record<string, unknown> | null;
    const faqs = Array.isArray(cfg?.faqs) ? cfg!.faqs as unknown[] : [];

    return {
      sections: {
        base_instruction: { ok: !!cfg?.base_instruction, detail: cfg?.base_instruction ? `${cfg.base_instruction.length} caracteres` : "Vazio" },
        company_info: { ok: !!(ci && ci.name), detail: ci?.name ? `${ci.name}` : "Não configurado" },
        faqs: { ok: faqs.length > 0, detail: `${faqs.length} perguntas` },
        forbidden_rules: { ok: enabledRules.length > 0, detail: `${enabledRules.length} regras ativas` },
        services_catalog: { ok: servicesCount > 0, detail: `${servicesCount} serviços`, preview: servicesPreview },
        knowledge_base: { ok: (kb ?? []).length > 0, detail: `${(kb ?? []).length} exemplos` },
        panel_guide: { ok: (panel ?? []).length > 0, detail: `${(panel ?? []).length} telas` },
        free_tests: { ok: (freeTests ?? []).length > 0, detail: `${(freeTests ?? []).length} serviços de teste` },
        response_delay: {
          ok: (cfg?.response_delay_min_sec ?? 0) > 0 || (cfg?.response_delay_max_sec ?? 0) > 0,
          detail: `${cfg?.response_delay_min_sec ?? 0}s a ${cfg?.response_delay_max_sec ?? 0}s${cfg?.typing_indicator_enabled ? ` · indicador "digitando"` : ""}`,
        },
        language_rules: { ok: !!cfg?.tone, detail: cfg?.tone ?? "Tom não definido" },
      },
      integrations: [uazapiStatus, anthropicStatus, elevenStatus, openaiStatus, smmStatus],
      fullPrompt,
    };
  });