import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL!
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

const userId = 'f8da521a-e8db-4efe-8c9b-9bd69749c0a7'

async function run() {
  const { data: identity } = await supabase
    .from('agent_identity')
    .select('*')
    .eq('user_id', userId)
    .single()

  const { data: config } = await supabase
    .from('agent_config')
    .select('*')
    .eq('user_id', userId)
    .single()

  console.log('---IDENTITY---')
  console.log(JSON.stringify(identity, null, 2))
  console.log('---CONFIG---')
  console.log(JSON.stringify(config, null, 2))
}

run()
