
import json
import os
from supabase import create_client, Client

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
supabase: Client = create_client(url, key)

USER_ID = "bd59fa41-d68d-4ac8-b995-e09ae48f52aa"

def fetch_catalog():
    res = supabase.table("catalog_cache").select("*").eq("user_id", USER_ID).eq("hidden", False).execute()
    return res.data

def format_catalog(data):
    # Group by network/category
    networks = {
        "Spotify": [],
        "Instagram": [],
        "YouTube": [],
        "TikTok": [],
        "Facebook": [],
        "Kwai": [],
        "SEO/Google": []
    }
    
    for item in data:
        name = item.get("nome", "").lower()
        cat = item.get("categoria", "").lower()
        full = f"{name} {cat}"
        
        target = None
        if "spotify" in full or "playlist" in full: target = "Spotify"
        elif "instagram" in full or "insta" in full: target = "Instagram"
        elif "youtube" in full or "yt" in full: target = "YouTube"
        elif "tiktok" in full or "tt" in full: target = "TikTok"
        elif "facebook" in full or "fb" in full: target = "Facebook"
        elif "kwai" in full: target = "Kwai"
        elif "google" in full or "seo" in full: target = "SEO/Google"
        
        if target:
            networks[target].append(item)
            
    output = "MÓDULO TABELA DE PREÇOS MANUAL\n\n"
    for net, services in networks.items():
        if not services: continue
        output += f"*{net}*\n"
        # Sort by price or name
        services.sort(key=lambda x: x.get("nome", ""))
        for s in services:
            rate = s.get("preco_por_1000", 0)
            min_q = s.get("minimo", 0)
            # Remove inactive spotify plays/saves as requested
            if net == "Spotify" and ("plays" in s.get("nome", "").lower() or "saves" in s.get("nome", "").lower()):
                continue
            output += f"- {s.get('nome')}: R${rate}/1000 (mín {min_q})\n"
        output += "\n"
        
    return output

if __name__ == "__main__":
    data = fetch_catalog()
    print(format_catalog(data))
