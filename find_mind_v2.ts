import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL!
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
  const { data: v2Modules } = await supabase
    .from('agent_modules_v2')
    .select('user_id, name')
    .limit(5)

  console.log('---V2_MODULES---')
  console.log(JSON.stringify(v2Modules, null, 2))
}

run()
