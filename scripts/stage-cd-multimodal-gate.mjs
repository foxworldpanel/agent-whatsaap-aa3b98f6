import { execFileSync } from "node:child_process";
import fs from "node:fs";
const root="C:/mind-agent-v3-stage-b";
const run=(cmd,args)=>execFileSync(cmd,args,{cwd:root,stdio:"inherit",shell:false});
const runCmd=(args)=>execFileSync("cmd.exe",["/d","/s","/c",...args],{cwd:root,stdio:"inherit",shell:false});
const read=(p)=>fs.readFileSync(`${root}/${p}`,"utf8");
const media=read("src/lib/agent-v3/customer-turn-media.server.ts");
const runtime=read("src/lib/agent-v3/customer-turn-runtime.server.ts");
const vision=read("src/lib/agent-v3/integrations/image-processor.server.ts");
for(const [label,ok] of [
 ["image resolver",media.includes('member.input_kind === "image"')&&media.includes("processImageV3")],
 ["sticker safe path",media.includes('member.input_kind === "sticker"')],
 ["vision credentials",runtime.includes("anthropicApiKey")&&runtime.includes("anthropic_api_key")],
 ["payment proof guard",vision.includes("nunca afirme que o pagamento foi confirmado")],
 ["image mime guard",vision.includes("ALLOWED_IMAGE_MIME")],
]) if(!ok) throw new Error(`Stage D multimodal invariant failed: ${label}`);
run("node",[`${root}/scripts/stage-cd-verify.mjs`]);
runCmd(["npm.cmd","run","build"]);
let output="";
try{output=execFileSync("cmd.exe",["/d","/s","/c","npx.cmd","tsc","--noEmit","--pretty","false"],{cwd:root,encoding:"utf8",stdio:["ignore","pipe","pipe"]})||"";}catch(e){output=`${e.stdout||""}\n${e.stderr||""}`;}
fs.writeFileSync(`${root}/stage-cd-typecheck-full.log`,output,"utf8");
const protectedLines=output.split(/\r?\n/).filter(line=>/src[\\/]lib[\\/]agent-v3[\\/](runtime|customer-turn|inbound-|integrations[\\/]image-processor)|src[\\/]routes[\\/]api[\\/]public[\\/]hooks[\\/](uazapi-webhook|agent-inbound-dispatcher)/i.test(line));
if(protectedLines.length){console.error(protectedLines.join("\n"));throw new Error("Stage C+D protected TypeScript errors remain");}
run("git",["diff","--check"]);
console.log("STAGE_CD_MULTIMODAL_GATE_OK");