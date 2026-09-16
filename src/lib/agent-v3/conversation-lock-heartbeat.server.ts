import { refreshAgentConversationLock } from "./conversation-lock.server";

export const AGENT_CONVERSATION_LOCK_HEARTBEAT_MS=60_000;

export function startAgentConversationLockHeartbeat(params:{
  supabaseAdmin:any;conversationId:string;holder:string;onOwnershipLost?:(error:Error)=>void;
}):()=>void{
  let stopped=false;
  let inFlight=false;
  const tick=async()=>{
    if(stopped||inFlight)return;
    inFlight=true;
    try{
      const owned=await refreshAgentConversationLock(params.supabaseAdmin,params.conversationId,params.holder);
      if(!owned){
        stopped=true;
        params.onOwnershipLost?.(new Error(`Conversation lock ownership lost for ${params.conversationId}`));
      }
    }catch(error){
      stopped=true;
      params.onOwnershipLost?.(error instanceof Error?error:new Error(String(error)));
    }finally{inFlight=false;}
  };
  const timer=setInterval(()=>{void tick();},AGENT_CONVERSATION_LOCK_HEARTBEAT_MS);
  return()=>{stopped=true;clearInterval(timer);};
}
