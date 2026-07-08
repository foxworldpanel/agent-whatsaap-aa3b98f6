-- 1) Global dedupe rule: one row per (user_id, telefone) across ALL campaigns/lists.
--    Table currently has zero duplicates (verified), so we can add the constraint directly.
ALTER TABLE public.blast_contacts
  ADD CONSTRAINT blast_contacts_user_phone_unique UNIQUE (user_id, telefone);

-- 2) Rename the system Instagram category label.
UPDATE public.contact_categories
   SET nome = 'Instagram (CSV)',
       icone = '📱'
 WHERE slug = 'lead_instagram';