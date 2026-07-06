import { createServerFn } from "@tanstack/react-start";
import { withWorkspaceScope } from "@/lib/workspace-scope-middleware";
import { z } from "zod";

const PLAYLIST_COLS =
  "playlist_pix_key, playlist_pix_holder, playlist_price, playlist_ecletica_service_id, playlist_eletronica_service_id, playlist_ecletica_links, playlist_eletronica_links";

export const getPlaylistPackageConfig = createServerFn({ method: "GET" })
  .middleware([withWorkspaceScope])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("agent_config")
      .select(PLAYLIST_COLS)
      .eq("user_id", context.userId)
      .eq("workspace_id", context.workspaceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (
      data ?? {
        playlist_pix_key: "24981222957",
        playlist_pix_holder: "Eliseu Mendes Oliveira",
        playlist_price: 49.9,
        playlist_ecletica_service_id: null,
        playlist_eletronica_service_id: null,
        playlist_ecletica_links: [] as string[],
        playlist_eletronica_links: [] as string[],
      }
    );
  });

const schema = z.object({
  playlist_pix_key: z.string().min(1).max(200),
  playlist_pix_holder: z.string().min(1).max(200),
  playlist_price: z.number().positive().max(10000),
  playlist_ecletica_service_id: z.string().max(50).nullable(),
  playlist_eletronica_service_id: z.string().max(50).nullable(),
  playlist_ecletica_links: z.array(z.string().url()).max(50),
  playlist_eletronica_links: z.array(z.string().url()).max(50),
});

export const savePlaylistPackageConfig = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) => schema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("agent_config")
      .upsert(
        {
          user_id: context.userId,
          workspace_id: context.workspaceId,
          ...data,
        },
        { onConflict: "user_id,workspace_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listPlaylistSales = createServerFn({ method: "GET" })
  .middleware([withWorkspaceScope])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("playlist_sales")
      .select("id, telefone, pacote, music_link, smm_order_id, amount_paid, status, status_message, created_at, completed_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });