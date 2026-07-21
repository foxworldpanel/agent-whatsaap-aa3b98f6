
import { loadEnabledModulesV3 } from './src/lib/agent-v3/modules.server';
import { runAgentV3Turn } from './src/lib/agent-v3/orchestrator.server';

async function audit() {
  const workspaceId = 'bd59fa41-2679-4a00-994f-4091a10058e5'; // ID do Mind SMM no log anterior
  const userId = 'f8da521a-e8db-4efe-8c9b-9bd69749c0a7';
  
  console.log('--- PASSO 1: AUDITORIA DE MÓDULOS ---');
  try {
    const modules = await loadEnabledModulesV3(workspaceId);
    console.log('Modules loaded:', Object.keys(modules).length);
    console.log('Sources:', Object.entries(modules).map(([k, v]) => `${k}:${v.source}`).join(', '));
  } catch (e) {
    console.error('FAILED loadEnabledModulesV3:', e);
  }

  console.log('\n--- PASSO 2: TESTE DE EXECUÇÃO ---');
  try {
    const result = await runAgentV3Turn({
      userId,
      message: 'Bom dia',
      history: [],
      anthropicApiKey: process.env.ANTHROPIC_API_KEY || ''
    });
    console.log('SUCCESS: Agent responded');
    console.log('Selected Keys:', result.selectedModules);
    console.log('Usage:', result.usage);
  } catch (e) {
    console.log('FAILED runAgentV3Turn');
    console.log('ERROR:', e.message);
    console.log('STACK:', e.stack);
  }
}

audit();
