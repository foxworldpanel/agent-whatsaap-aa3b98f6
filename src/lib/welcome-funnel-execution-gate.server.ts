export type WelcomeFunnelExecutionClass =
  | "durable_running"
  | "durable_completed"
  | "durable_needs_review"
  | "legacy_compatible"
  | "legacy_ambiguous"
  | "unclaimed";

const VALID = new Set<WelcomeFunnelExecutionClass>([
  "durable_running","durable_completed","durable_needs_review",
  "legacy_compatible","legacy_ambiguous","unclaimed",
]);

export async function classifyWelcomeFunnelExecution(
  supabaseAdmin:any,
  funnelId:string,
  contactId:string,
):Promise<WelcomeFunnelExecutionClass>{
  const {data,error}=await supabaseAdmin.rpc("classify_welcome_funnel_execution",{
    p_funnel_id:funnelId,p_contact_id:contactId,
  });
  if(error) throw error;
  if(!VALID.has(data as WelcomeFunnelExecutionClass))
    throw new Error(`Unknown Welcome Funnel execution classification: ${String(data)}`);
  return data as WelcomeFunnelExecutionClass;
}

export function mayStartWelcomeFunnelExecution(state:WelcomeFunnelExecutionClass):boolean{
  return state==="unclaimed";
}

export function blocksAutomaticAgentAfterFunnelClassification(state:WelcomeFunnelExecutionClass):boolean{
  return state==="durable_running" || state==="durable_needs_review" || state==="legacy_ambiguous";
}

export function provesWelcomeFunnelCompleted(state:WelcomeFunnelExecutionClass):boolean{
  return state==="durable_completed";
}

export function isHistoricalWelcomeFunnelCompatibility(state:WelcomeFunnelExecutionClass):boolean{
  return state==="legacy_compatible";
}
