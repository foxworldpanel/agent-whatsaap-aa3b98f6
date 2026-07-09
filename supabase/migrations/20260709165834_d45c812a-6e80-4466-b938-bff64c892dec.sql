
CREATE OR REPLACE FUNCTION public.seed_default_categories()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.contact_categories (user_id, nome, cor, icone, slug, is_system)
  VALUES
    (NEW.id, 'Meta ADS [Geral]', 'blue', '📣', 'meta_ads',       true),
    (NEW.id, 'Instagram CSV',    'pink', '📷', 'lead_instagram', true)
  ON CONFLICT (user_id, slug) DO NOTHING;
  RETURN NEW;
END;
$function$;
