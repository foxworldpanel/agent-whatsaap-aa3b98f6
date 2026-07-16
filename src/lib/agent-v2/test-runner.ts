import { runRouterTests } from './router.test';
import { runBuilderTests } from './prompt-builder.test';
import { runSpotifyTests } from './spotify.test';
import { runFullHomologationSuite } from './homologation.test';

async function main() {
  // Testes de Unidade e Lógica
  await runRouterTests();
  await runBuilderTests();
  await runSpotifyTests();
  
  // Testes de Homologação (Fluxos Completos)
  await runFullHomologationSuite();
}

main().catch(console.error);
