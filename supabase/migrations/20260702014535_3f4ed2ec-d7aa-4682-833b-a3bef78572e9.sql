-- Transfer "Mind - Disparo" to active account and remove duplicate campanha
DELETE FROM public.whatsapp_numbers WHERE id = 'd7e876e2-19fd-4140-9dce-eb8f2b12f220';
UPDATE public.whatsapp_numbers SET user_id = 'f8da521a-e8db-4efe-8c9b-9bd69749c0a7' WHERE id = '7b7128f2-7177-44c8-b7cc-5e419b5c9be4';