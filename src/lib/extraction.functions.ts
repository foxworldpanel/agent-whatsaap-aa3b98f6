import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const profileEnum = z.enum(["ativo", "frio", "inativo"]);

export const extractChatsFromNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ whatsapp_number_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("whatsapp_numbers")
      .select("uazapi_url, uazapi_token")
      .eq("id", data.whatsapp_number_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row?.uazapi_url || !row.uazapi_token) throw new Error("Número sem credenciais");

    const { uazapiListChats } = await import("./uazapi.server");
    try {
      const chats = await uazapiListChats({
        uazapi_url: row.uazapi_url,
        uazapi_token: row.uazapi_token,
      });

      // Find which phones already exist for this user
      const phones = chats.map((c) => c.phone);
      const { data: existing } = await context.supabase
        .from("contacts")
        .select("telefone")
        .eq("user_id", context.userId)
        .in("telefone", phones);
      const existingSet = new Set((existing ?? []).map((r) => r.telefone));

      return {
        chats: chats.map((c) => ({ ...c, exists: existingSet.has(c.phone) })),
      };
    } catch (e) {
      await context.supabase.from("extraction_logs").insert({
        user_id: context.userId,
        whatsapp_number_id: data.whatsapp_number_id,
        total_found: 0,
        new_imported: 0,
        already_existed: 0,
        status: "error",
        error: e instanceof Error ? e.message : String(e),
      });
      throw e;
    }
  });

export const importExtractedContacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        whatsapp_number_id: z.string().uuid(),
        perfil: profileEnum.default("frio"),
        welcome_funnel_id: z.string().uuid().nullable().optional(),
        contacts: z
          .array(
            z.object({
              phone: z.string().min(5),
              name: z.string().nullable().optional(),
              last_message: z.string().nullable().optional(),
              last_message_at: z.string().nullable().optional(),
              message_count: z.number().nullable().optional(),
              image_url: z.string().nullable().optional(),
            }),
          )
          .min(1)
          .max(5000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const phones = data.contacts.map((c) => c.phone);
    const { data: existing } = await context.supabase
      .from("contacts")
      .select("id, telefone")
      .eq("user_id", context.userId)
      .in("telefone", phones);
    const existingMap = new Map((existing ?? []).map((r) => [r.telefone as string, r.id as string]));

    let newImported = 0;
    let alreadyExisted = 0;

    const toInsert: Record<string, unknown>[] = [];
    for (const c of data.contacts) {
      const sourceData = {
        last_message: c.last_message ?? null,
        message_count: c.message_count ?? null,
        welcome_funnel_id: data.welcome_funnel_id ?? null,
      };
      if (existingMap.has(c.phone)) {
        alreadyExisted++;
        const id = existingMap.get(c.phone)!;
        await context.supabase
          .from("contacts")
          .update({
            perfil: data.perfil,
            ...(c.name ? { nome: c.name } : {}),
            ...(c.image_url ? { photo_url: c.image_url } : {}),
            ...(c.last_message_at ? { last_interaction_at: c.last_message_at } : {}),
            whatsapp_number_id: data.whatsapp_number_id,
            source: "whatsapp_extract",
            source_data: sourceData,
          } as never)
          .eq("id", id)
          .eq("user_id", context.userId);
      } else {
        newImported++;
        toInsert.push({
          user_id: context.userId,
          nome: c.name?.trim() || c.phone,
          telefone: c.phone,
          perfil: data.perfil,
          status: "nao_abordado",
          photo_url: c.image_url ?? null,
          last_interaction_at: c.last_message_at ?? null,
          whatsapp_number_id: data.whatsapp_number_id,
          source: "whatsapp_extract",
          source_data: sourceData,
        });
      }
    }

    if (toInsert.length) {
      // Deduplicate by phone in case the batch contains duplicates
      const uniqueByPhone = Array.from(
        new Map(toInsert.map((c) => [c.telefone, c])).values(),
      );
      const { error } = await context.supabase
        .from("contacts")
        .upsert(uniqueByPhone as never, {
          onConflict: "user_id,telefone",
          ignoreDuplicates: false,
        });
      if (error) throw new Error(error.message);
    }

    await context.supabase.from("extraction_logs").insert({
      user_id: context.userId,
      whatsapp_number_id: data.whatsapp_number_id,
      total_found: data.contacts.length,
      new_imported: newImported,
      already_existed: alreadyExisted,
      status: "ok",
    });

    return { new_imported: newImported, already_existed: alreadyExisted };
  });

export const listExtractionLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("extraction_logs")
      .select("id, whatsapp_number_id, total_found, new_imported, already_existed, status, error, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return data ?? [];
  });