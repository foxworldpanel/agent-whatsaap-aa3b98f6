import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL!
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
  const { data: v2, error: v2Error } = await supabase
    .from('agent_modules_v2')
    .select('*')
  
  if (v2Error) console.error('V2 Error:', v2Error)
  console.log('---AGENT_MODULES_V2---')
  console.log(JSON.stringify(v2, null, 2))
}

run()
