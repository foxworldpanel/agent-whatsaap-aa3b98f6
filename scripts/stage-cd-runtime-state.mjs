import fs from "node:fs";
const p="C:/mind-agent-v3-stage-b/src/lib/agent-v3/runtime.server.ts";
let s=fs.readFileSync(p,"utf8");
const a="  const traceId = generateTraceId();";
if(!s.includes(a)) throw new Error("anchor missing");
if(!s.includes('let customerMemoryContext = "";')) s=s.replace(a,a+`\n\n  let contactTemperature = null;\n  let customerMemory = null;\n  let customerMemoryContext = "";\n  if (contactId) {\n    const { data: contactRow, error: contactError } = await supabaseAdmin.from("contacts").select("perfil, temperatura").eq("id", contactId).eq("workspace_id", workspaceId).maybeSingle();\n    if (contactError) console.warn("[CUSTOMER-MEMORY] contact load failed:", contactError);\n    contactTemperature = contactRow?.temperatura ?? null;\n    const memoryModule = await import("@/lib/agent-v3/memory/customer-memory.server");\n    customerMemory = await memoryModule.loadCustomerCommercialMemory({ supabaseAdmin, workspaceId, contactId, contactTemperature, contactProfile: contactRow?.perfil ?? null });\n    customerMemoryContext = memoryModule.customerMemoryPromptContext(customerMemory);\n  }`);
s=s.replace('.then(({ error }) => {','.then(({ error }: { error: any }) => {');
fs.writeFileSync(p,s,"utf8");
console.log("STAGE_CD_RUNTIME_STATE_OK");