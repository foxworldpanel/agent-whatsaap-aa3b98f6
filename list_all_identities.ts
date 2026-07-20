import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL!
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
  const { data: identities, error: identityError } = await supabase
    .from('agent_identity')
    .select('user_id, persona')
  
  if (identityError) console.error('Identity Error:', identityError)
  console.log('---IDENTITIES---')
  console.log(JSON.stringify(identities, null, 2))

  const { data: configs, error: configError } = await supabase
    .from('agent_config')
    .select('user_id, agent_enabled')
  
  if (configError) console.error('Config Error:', configError)
  console.log('---CONFIGS---')
  console.log(JSON.stringify(configs, null, 2))
}

run()
