import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL!
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
  const { data: integrations, error: intError } = await supabase
    .from('integrations')
    .select('user_id, workspace_id, uazapi_url')
  
  if (intError) console.error('Int Error:', intError)
  console.log('---INTEGRATIONS---')
  console.log(JSON.stringify(integrations, null, 2))
}

run()
