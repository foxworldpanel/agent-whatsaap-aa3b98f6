import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL!
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
  const { data: identities } = await supabase
    .from('agent_identity')
    .select('user_id, persona')
    .limit(10)

  console.log('---IDENTITIES---')
  console.log(JSON.stringify(identities, null, 2))
}

run()
