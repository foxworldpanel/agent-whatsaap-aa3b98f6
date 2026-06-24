
CREATE POLICY "funnel_media_select_own"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'funnel-media' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "funnel_media_insert_own"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'funnel-media' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "funnel_media_update_own"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'funnel-media' AND auth.uid()::text = (storage.foldername(name))[1])
WITH CHECK (bucket_id = 'funnel-media' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "funnel_media_delete_own"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'funnel-media' AND auth.uid()::text = (storage.foldername(name))[1]);
