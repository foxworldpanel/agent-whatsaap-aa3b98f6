import fs from "node:fs";
import { spawnSync } from "node:child_process";
const root="C:/mind-agent-v3-stage-b";
const run=(cmd,args)=>spawnSync(cmd,args,{cwd:root,encoding:"utf8",shell:false});
for(const script of ["scripts/stage-cd-runtime-imports.mjs","scripts/stage-cd-runtime-state.mjs","scripts/stage-cd-cutover-webhook.mjs","scripts/stage-cd-verify.mjs"]){const r=run(process.execPath,[`${root}/${script}`]);process.stdout.write(r.stdout||"");process.stderr.write(r.stderr||"");if(r.status!==0)process.exit(r.status||1);}
const build=run("npm.cmd",["run","build"]);process.stdout.write(build.stdout||"");process.stderr.write(build.stderr||"");if(build.status!==0)process.exit(build.status||1);
const tc=run("npx.cmd",["tsc","--noEmit","--pretty","false"]);const out=(tc.stdout||"")+"\n"+(tc.stderr||"");
const protectedPaths=["src/lib/agent-v3/runtime.server.ts","src/lib/agent-v3/customer-turn.server.ts","src/lib/agent-v3/customer-turn-runtime.server.ts","src/lib/agent-v3/customer-turn-media.server.ts","src/lib/agent-v3/customer-turn-dispatch.server.ts","src/lib/agent-v3/customer-turn-ingress.server.ts","src/lib/agent-v3/inbound-webhook-ownership.server.ts","src/routes/api/public/hooks/uazapi-webhook.ts","src/routes/api/public/hooks/agent-inbound-dispatcher.ts"];
const relevant=out.split(/\r?\n/).filter(line=>protectedPaths.some(p=>line.includes(p)));
fs.writeFileSync(`${root}/stage-cd-typecheck-full.log`,out,"utf8");
if(relevant.length){console.error("STAGE_CD_TYPECHECK_ERRORS");console.error(relevant.join("\n"));process.exit(2);}
console.log("STAGE_CD_FOCUSED_GATE_OK");
console.log(`Project-wide TypeScript exit code: ${tc.status}; full log: stage-cd-typecheck-full.log`);