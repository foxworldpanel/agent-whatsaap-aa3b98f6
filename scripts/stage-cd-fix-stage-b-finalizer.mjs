import fs from "node:fs";

const root = "C:\\mind-agent-v3-stage-b";
const webhookPath = `${root}\\src\\routes\\api\\public\\hooks\\uazapi-webhook.ts`;
const normalizeLf = (value) => value.replace(/\r\n/g, "\n");
function once(source,before,after,label){const i=source.indexOf(before);if(i<0)throw new Error(`${label}: anchor not found`);if(source.indexOf(before,i+before.length)>=0)throw new Error(`${label}: anchor not unique`);return source.slice(0,i)+after+source.slice(i+before.length);}
let source=normalizeLf(fs.readFileSync(webhookPath,"utf8"));
source=once(source,
`          return new Response("ok (agent runtime — " + runtimeResult.reason + ")");
      } finally {`,
`          return new Response("ok (agent runtime — " + runtimeResult.reason + ")");
      } catch (criticalError) {
        runtimeNeedsReview = true;
        runtimeFailure = criticalError instanceof Error ? criticalError.message : String(criticalError);
        console.error("[UAZAPI WEBHOOK] Agent V3 critical error:", criticalError);
        try {
          await supabaseAdmin.from("conversations").update({ needs_review: true, updated_at: new Date().toISOString() }).eq("id", conversationId);
        } catch (flagError) {
          console.error("[UAZAPI WEBHOOK] Failed to flag conversation for review:", flagError);
        }
        return new Response("ok (AI error flagged for review)");
      } finally {`,"runtime catch");
source=once(source,
`            runtimeNeedsReview
              ? { status: "needs_review", error: \`Agent V3 critical error: \${runtimeFailure || "erro desconhecido"}\` }
              : { status: "ok" },`,
`            runtimeNeedsReview
              ? { ok: false, error: new Error(\`Agent V3 requires review: \${runtimeFailure || "erro desconhecido"}\`) }
              : { ok: true },`,"finalizer outcome");
fs.writeFileSync(webhookPath,source,"utf8");
console.log("STAGE_B_FINALIZER_REPAIR_OK");
