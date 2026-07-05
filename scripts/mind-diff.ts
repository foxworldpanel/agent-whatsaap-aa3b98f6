import { buildSharedRules, loadAgentIdentity, loadBrandBlocks, MIND_BRAND_BLOCKS } from "@/lib/agent-identity.server";

const MIND_USER_ID = "09f4dee9-0a1b-4c43-b083-75cc64feb99d";

const [ident, dbBlocks] = await Promise.all([
  loadAgentIdentity(MIND_USER_ID),
  loadBrandBlocks(MIND_USER_ID),
]);

// Pre-Passo-3 (blocos hardcoded via MIND_BRAND_BLOCKS)
const pre  = buildSharedRules(ident, { brandBlocks: MIND_BRAND_BLOCKS });
// Post-Passo-3 runtime (blocos vindos do DB)
const post = buildSharedRules(ident, { brandBlocks: dbBlocks });

console.log(JSON.stringify({
  preLen: pre.length,
  postLen: post.length,
  identical: pre === post,
  dbBlockKeys: Object.keys(dbBlocks).sort(),
  templateKeys: Object.keys(MIND_BRAND_BLOCKS).sort(),
  perBlockEqual: {
    respostas_padrao: dbBlocks.respostas_padrao === MIND_BRAND_BLOCKS.respostas_padrao,
    regra_mq_hq:      dbBlocks.regra_mq_hq      === MIND_BRAND_BLOCKS.regra_mq_hq,
    regra_autoridade: dbBlocks.regra_autoridade === MIND_BRAND_BLOCKS.regra_autoridade,
  },
}));
if (pre !== post) {
  let i = 0;
  while (i < Math.min(pre.length, post.length) && pre[i] === post[i]) i++;
  console.log("first diff at", i);
  console.log("PRE :", JSON.stringify(pre.slice(Math.max(0, i - 80), i + 80)));
  console.log("POST:", JSON.stringify(post.slice(Math.max(0, i - 80), i + 80)));
}
