import { createServerFn } from "@tanstack/react-start";
import { withWorkspaceScope } from "@/lib/workspace-scope-middleware";
import { z } from "zod";

// SECURITY: token-based cross-tenant sharing removed. See agent-shared.server.ts.
async function getSharedUazapiUserIds(context: { supabase: any; userId: string }) {
  return [context.userId];
}

// List conversations with contact info + latest Agent V3 intelligence.
// Pagina explicitamente para não depender do limite padrão de 1.000 linhas do Supabase.
export const listConversations = createServerFn({ method: "GET" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) =>
    z.object({ numberId: z.string().uuid().nullable().optional() }).optional().parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const rows: any[] = [];
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      let q = supabaseAdmin
        .from("conversations")
        .select(
          "id, status, last_message_preview, last_message_at, agent_enabled, whatsapp_number_id, needs_review, review_reason, auto_paused_at, internal_note, contact:contacts(id, nome, telefone, perfil, temperatura, source, source_ref, source_url, source_headline, photo_url)",
        )
        .eq("workspace_id", context.workspaceId)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .range(from, from + pageSize - 1);

      if (data?.numberId) q = q.eq("whatsapp_number_id", data.numberId);

      const { data: page, error } = await q;
      if (error) throw new Error(error.message);
      rows.push(...(page || []));
      if (!page || page.length < pageSize) break;
    }

    if (rows.length === 0) return [];

    const conversationIds = rows.map((row) => row.id);

    // Busca logs recentes do V3 em blocos para anexar a inteligência mais atual.
    const latestIntelligence = new Map<string, any>();
    const chunkSize = 200;
    for (let i = 0; i < conversationIds.length; i += chunkSize) {
      const ids = conversationIds.slice(i, i + chunkSize);
      const { data: logs, error: logsError } = await supabaseAdmin
        .from("agent_logs")
        .select("conversation_id, metadata, created_at")
        .eq("type", "agent_v3_turn")
        .in("conversation_id", ids)
        .order("created_at", { ascending: false })
        .limit(Math.max(1000, ids.length * 8));

      if (logsError) {
        console.warn("[conversas] Falha ao carregar Lead Intelligence:", logsError);
        continue;
      }

      for (const log of logs || []) {
        if (!log.conversation_id || latestIntelligence.has(log.conversation_id)) continue;
        const metadata = (log.metadata || {}) as Record<string, any>;
        const intelligence = metadata.intelligence;
        if (intelligence && typeof intelligence === "object") {
          latestIntelligence.set(log.conversation_id, {
            ...intelligence,
            updated_at: log.created_at,
          });
        }
      }
    }

    const businessState = new Map<string, any>();
    try {
      const { loadBusinessStateV3 } = await import(
        "@/lib/agent-v3/memory/business-state-memory.server"
      );
      const loadedBusinessState = await loadBusinessStateV3({
        supabaseAdmin,
        workspaceId: context.workspaceId,
        conversationIds,
      });
      for (const [conversationId, row] of loadedBusinessState.entries()) {
        businessState.set(conversationId, row);
      }
    } catch (businessStateError) {
      console.warn("[conversas] Estado comercial V3 indisponível:", businessStateError);
    }

    const commercialMemory = new Map<string, any>();
    try {
      const contactIds = rows
        .map((row: any) => row.contact?.id)
        .filter(Boolean);

      for (let i = 0; i < contactIds.length; i += 200) {
        const ids = contactIds.slice(i, i + 200);
        const { data: memoryRows, error: memoryError } = await (supabaseAdmin as any)
          .from("customer_commercial_memory")
          .select(
            "contact_id, lifecycle, converted_at, purchase_count, preferred_platform, preferred_product, next_opportunity, repurchase_potential, updated_at",
          )
          .eq("workspace_id", context.workspaceId)
          .in("contact_id", ids);

        if (memoryError) {
          console.warn("[conversas] Memória comercial indisponível:", memoryError);
          break;
        }

        for (const memory of memoryRows || []) {
          commercialMemory.set(memory.contact_id, memory);
        }
      }
    } catch (memoryError) {
      console.warn("[conversas] Falha ao carregar memória comercial:", memoryError);
    }

    const { data: testRows } = await supabaseAdmin
      .from("test_numbers")
      .select("phone")
      .eq("workspace_id", context.workspaceId);

    const testSet = new Set((testRows ?? []).map((r) => r.phone));

    return rows.map((r: any) => ({
      ...r,
      is_test: r.contact?.telefone ? testSet.has(r.contact.telefone) : false,
      lead_intelligence: latestIntelligence.get(r.id) ?? null,
      business_state: businessState.get(r.id) ?? null,
      customer_memory: r.contact?.id
        ? commercialMemory.get(r.contact.id) ?? null
        : null,
    }));
  });

export const listMessages = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) => z.object({ conversationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Sem .limit(): o Supabase costuma limitar respostas a 1.000 registros.
    // Pagina até acabar para a tela de auditoria realmente exibir a conversa inteira.
    const allRows: any[] = [];
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const { data: page, error } = await supabaseAdmin
        .from("messages")
        .select("id, sender, kind, body, audio_url, created_at, external_id")
        .eq("workspace_id", context.workspaceId)
        .eq("conversation_id", data.conversationId)
        .order("created_at", { ascending: true })
        .range(from, from + pageSize - 1);

      if (error) throw new Error(error.message);
      allRows.push(...(page || []));
      if (!page || page.length < pageSize) break;
    }

    return allRows;
  });

// Manual send from the Conversas screen.
export const sendManualMessage = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) =>
    z.object({
      conversationId: z.string().uuid(),
      text: z.string().min(1).max(2000),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: conv, error: convErr } = await supabaseAdmin
      .from("conversations")
      .select("id, user_id, contact:contacts(telefone)")
      .eq("id", data.conversationId)
      .eq("workspace_id", context.workspaceId)
      .maybeSingle();
    if (convErr) throw new Error(convErr.message);
    if (!conv?.contact) throw new Error("Conversa não encontrada");

    const { data: integ, error: intErr } = await supabaseAdmin
      .from("integrations")
      .select("uazapi_url, uazapi_token")
      .eq("user_id", conv.user_id)
      .maybeSingle();
    if (intErr) throw new Error(intErr.message);
    if (!integ?.uazapi_url || !integ.uazapi_token) {
      throw new Error("Configure a Uazapi na tela do Agente.");
    }

    const contact = conv.contact as unknown as { telefone: string };
    const { uazapiSendText } = await import("./uazapi.server");
    await uazapiSendText(
      {
        uazapi_url: integ.uazapi_url,
        uazapi_token: integ.uazapi_token,
      },
      contact.telefone,
      data.text,
    );

    const now = new Date().toISOString();
    const { error: msgErr } = await supabaseAdmin.from("messages").insert({
      user_id: conv.user_id,
      workspace_id: context.workspaceId,
      conversation_id: data.conversationId,
      sender: "agente",
      kind: "texto",
      body: data.text,
    });
    if (msgErr) throw new Error(msgErr.message);

    await supabaseAdmin
      .from("conversations")
      .update({
        last_message_preview: data.text.slice(0, 120),
        last_message_at: now,
        status: "aguardando",
      })
      .eq("id", data.conversationId)
      .eq("workspace_id", context.workspaceId);

    return { ok: true };
  });

// Clear conversation history and reset agent context for that contact.
export const clearConversation = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) => z.object({ conversationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: conv, error: convErr } = await supabaseAdmin
      .from("conversations")
      .select("id, user_id")
      .eq("id", data.conversationId)
      .eq("workspace_id", context.workspaceId)
      .maybeSingle();
    if (convErr) throw new Error(convErr.message);
    if (!conv) throw new Error("Conversa não encontrada");

    const { error: delErr } = await supabaseAdmin
      .from("messages")
      .delete()
      .eq("conversation_id", data.conversationId)
      .eq("workspace_id", context.workspaceId);
    if (delErr) throw new Error(delErr.message);

    const { error: updErr } = await supabaseAdmin
      .from("conversations")
      .update({
        last_message_preview: null,
        last_message_at: null,
      })
      .eq("id", data.conversationId)
      .eq("workspace_id", context.workspaceId);
    if (updErr) throw new Error(updErr.message);

    return { ok: true };
  });