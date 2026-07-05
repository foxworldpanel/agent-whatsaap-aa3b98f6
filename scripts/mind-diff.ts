import { buildSharedRules, mergeIdentity, MIND_BRAND_BLOCKS, MIND_BRAND_TEMPLATE, DEFAULT_IDENTITY, loadAgentIdentity, loadBrandBlocks } from "@/lib/agent-identity.server";

const MIND_USER_ID = "09f4dee9-0a1b-4c43-b083-75cc64feb99d";

// Referência: mescla safety-defaults + MIND_BRAND_TEMPLATE + MIND_BRAND_BLOCKS.
const reference = buildSharedRules(mergeIdentity(MIND_BRAND_TEMPLATE), { brandBlocks: MIND_BRAND_BLOCKS });

// Runtime real: lê do banco.
const [ident, blocks] = await Promise.all([loadAgentIdentity(MIND_USER_ID), loadBrandBlocks(MIND_USER_ID)]);
const runtime = buildSharedRules(ident, { brandBlocks: blocks });

console.log(JSON.stringify({
  refLen: reference.length,
  runLen: runtime.length,
  identical: reference === runtime,
  brandKeys: Object.keys(blocks),
}));

if (reference !== runtime) {
  // Show first divergence
  let i = 0; while (i < Math.min(reference.length, runtime.length) && reference[i] === runtime[i]) i++;
  console.log("first diff at", i);
  console.log("REF:", JSON.stringify(reference.slice(Math.max(0,i-80), i+80)));
  console.log("RUN:", JSON.stringify(runtime.slice(Math.max(0,i-80), i+80)));
}
