import subprocess
import json
import os

tables = [
    "agent_logs_v2", "price_table", "contact_groups", "conversations", "whatsapp_numbers", 
    "auto_campaigns", "contact_categories", "welcome_funnel_runs", "extraction_logs", 
    "campaign_logs", "agent_v2_turn_analytics", "messages", "agent_v2_conversation_analytics", 
    "test_numbers", "agent_modules_v2", "agent_modules_v2_history", "contacts", "blast_logs", 
    "contact_lists", "forbidden_rules", "panel_guide", "blast_contacts", "agent_logs", 
    "contact_group_members", "free_trials", "knowledge_base", "opening_templates", 
    "integrations", "agent_identity", "playlist_sales", "agent_daily_promo", "prompt_modules", 
    "welcome_funnels", "blast_flows", "free_test_services", "meta_ads_trigger_rules", 
    "agent_config", "catalog_cache", "blast_campaigns", "auto_campaign_runs", "campaigns"
]

results = {}

for table in tables:
    query = f"SELECT count(*) FROM public.{table} WHERE workspace_id IS NULL;"
    try:
        output = subprocess.check_output(["psql", "-d", os.environ["DB_URL"], "-t", "-c", query], text=True).strip()
        results[table] = int(output)
    except Exception as e:
        results[table] = f"Error: {e}"

print(json.dumps(results, indent=2))
