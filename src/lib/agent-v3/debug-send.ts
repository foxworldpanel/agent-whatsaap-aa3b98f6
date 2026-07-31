import { supabase } from './src/integrations/supabase/client';
import { uazapiSendText } from './src/lib/uazapi.server';

async function testSend() {
  const workspaceId = 'bd59fa41-d68d-4ac8-b995-e09ae48f52aa';
  const { data: integ } = await supabase.from('integrations').select('*').eq('workspace_id', workspaceId).maybeSingle();
  if (!integ) {
    console.log('Integração não encontrada');
    process.exit(1);
  }

  const creds = { 
    uazapi_url: (integ.uazapi_url || '').trim(), 
    uazapi_token: (integ.uazapi_admin_token || '').trim() 
  };
  
  if (!creds.uazapi_url || !creds.uazapi_token) {
    console.log('Credenciais incompletas', creds);
    process.exit(1);
  }

  const target = '5511970116430@c.us';
  console.log(`Enviando para: ${target} via ${creds.uazapi_url}`);
  
  try {
    const res = await uazapiSendText(creds, target, 'Teste técnico de conectividade V3 - Por favor ignore.');
    console.log('Resultado do envio:', JSON.stringify(res));
  } catch (err: any) {
    console.error('Erro no envio:', err.message);
  }
}
testSend();
