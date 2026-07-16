import { runRouterTests } from './router.test';

async function main() {
  await runRouterTests();
}

main().catch(console.error);
