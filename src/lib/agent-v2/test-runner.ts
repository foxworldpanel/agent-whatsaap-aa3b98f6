import { runRouterTests } from './router.test';
import { runBuilderTests } from './prompt-builder.test';

async function main() {
  await runRouterTests();
  await runBuilderTests();
}

main().catch(console.error);
