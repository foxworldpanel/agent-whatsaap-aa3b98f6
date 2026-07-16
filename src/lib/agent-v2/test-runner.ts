import { runRouterTests } from './router.test';
import { runBuilderTests } from './prompt-builder.test';
import { runSpotifyTests } from './spotify.test';

async function main() {
  await runRouterTests();
  await runBuilderTests();
  await runSpotifyTests();
}

main().catch(console.error);
