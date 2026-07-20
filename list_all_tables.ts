import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL!
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
  const { data: workspaces, error: workspaceError } = await supabase
    .from('workspaces')
    .select('*')
  
  if (workspaceError) console.error('Workspace Error:', workspaceError)
  console.log('---WORKSPACES---')
  console.log(JSON.stringify(workspaces, null, 2))

  const { data: numbers, error: numbersError } = await supabase
    .from('whatsapp_numbers')
    .select('*')
  
  if (numbersError) console.error('Numbers Error:', numbersError)
  console.log('---NUMBERS---')
  console.log(JSON.stringify(numbers, null, 2))
}

run()
