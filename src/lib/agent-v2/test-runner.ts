import { runRouterTests } from './router.test';
import { runBuilderTests } from './prompt-builder.test';
import { runSpotifyTests } from './spotify.test';
import { runFullHomologationSuite } from './homologation.test';
import { runModelRouterTests } from './model-router.test';

async function main() {
  // Testes de Unidade e Lógica
  await runRouterTests();
  await runBuilderTests();
  await runSpotifyTests();
  await runModelRouterTests();
  
  // Testes de Homologação (Fluxos Completos)
  await runFullHomologationSuite();
}

main().catch(console.error);

