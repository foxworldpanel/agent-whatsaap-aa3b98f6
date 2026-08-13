import { createServerFn } from "@tanstack/react-start";
import { withWorkspaceScope } from "@/lib/workspace-scope-middleware";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const getExecutionTraces = createServerFn({ method: "GET" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) =>
    z.object({
      limit: z.number().default(50),
      offset: z.number().default(0),
      phone: z.string().optional(),
      traceId: z.string().optional(),
      conversationId: z.string().optional(),
    }).parse(d)
  )
  .handler(async ({ data }) => {
    let query = supabaseAdmin
      .from("agent_execution_traces")
      .select("*")
      .order("created_at", { ascending: false })
      .range(data.offset, data.offset + data.limit - 1);

    if (data.phone) query = query.ilike("phone", `%${data.phone}%`);
    if (data.traceId) query = query.eq("trace_id", data.traceId);
    if (data.conversationId) query = query.eq("conversation_id", data.conversationId);

    const { data: traces, error } = await query;
    if (error) throw error;
    return traces;
  });

export const getTraceDetails = createServerFn({ method: "GET" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) =>
    z.object({
      traceId: z.string(),
    }).parse(d)
  )
  .handler(async ({ data }) => {
    const { data: steps, error } = await supabaseAdmin
      .from("agent_execution_traces")
      .select("*")
      .eq("trace_id", data.traceId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return steps;
  });
