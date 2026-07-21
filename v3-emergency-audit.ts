import { loadEnabledModulesV3 } from './src/lib/agent-v3/modules.server';
import { runAgentV3Turn } from './src/lib/agent-v3/orchestrator.server';

async function audit() {
  const workspaceId = 'bd59fa41-d68d-4ac8-b995-e09ae48f52aa';
  const userId = 'f8da521a-e8db-4efe-8c9b-9bd69749c0a7';
  
  console.log('--- DIAGNÓSTICO V3 ---');
  try {
    const modules = await loadEnabledModulesV3(workspaceId);
    console.log('Módulos carregados:', Object.keys(modules).length);
    const invalidModules = Object.entries(modules).filter(([k, v]) => !v.content);
    if (invalidModules.length > 0) console.log('MÓDULOS INVÁLIDOS:', invalidModules.map(([k]) => k));
  } catch (e) {
    console.error('ERRO NO LOADER:', e);
  }

  try {
    const result = await runAgentV3Turn({
      userId,
      message: 'Bom dia',
      history: [],
      anthropicApiKey: process.env.ANTHROPIC_API_KEY || ''
    });
    console.log('STATUS: SUCESSO');
    console.log('REPLIES:', result.replies);
  } catch (e) {
    console.log('STATUS: FALHA');
    console.log('ERRO:', e.message);
    console.log('STACK:', e.stack);
  }
}
audit();
