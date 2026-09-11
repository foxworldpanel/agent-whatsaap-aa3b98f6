import fs from "node:fs";
const root="C:\\mind-agent-v3-stage-b";
const path=`${root}\\src\\routes\\api\\public\\hooks\\uazapi-webhook.ts`;
const lf=s=>s.replace(/\r\n/g,"\n");
function once(s,a,b,label){const i=s.indexOf(a);if(i<0)throw new Error(`${label}: anchor not found`);if(s.indexOf(a,i+a.length)>=0)throw new Error(`${label}: anchor not unique`);return s.slice(0,i)+b+s.slice(i+a.length);}
let s=lf(fs.readFileSync(path,"utf8"));
s=once(s,
`        if (runtimeOwnershipResult.status !== "claimed") {
          console.log("[AGENT-INBOUND] runtime não adquirido no fast path", {
            messageId: persistedMessageId,
            status: runtimeOwnershipResult.status,
          });
          return new Response("ok (agent queued)");
        }
        runtimeOwnership = runtimeOwnershipResult.ownership;

        try {
          const runtimeResult = await executeAgentV3Runtime(supabaseAdmin, {`,
`        if (runtimeOwnershipResult.status === "queued_turn") {
          console.log("[AGENT-CUSTOMER-TURN] inbound anexado ao turno durável", {
            messageId: persistedMessageId,
            jobId: runtimeOwnershipResult.jobId,
            turnId: runtimeOwnershipResult.turnId,
            duplicate: runtimeOwnershipResult.duplicate,
          });
          return new Response("ok (agent customer turn queued)");
        }

        try {
          const runtimeResult = await executeAgentV3Runtime(supabaseAdmin, {`,"webhook runtime cutover");
fs.writeFileSync(path,s,"utf8");
console.log("STAGE_CD_WEBHOOK_CUTOVER_OK");
