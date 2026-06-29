
CREATE POLICY "panel-guide users read own" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'panel-guide' AND (auth.uid())::text = (storage.foldername(name))[1]);
CREATE POLICY "panel-guide users insert own" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'panel-guide' AND (auth.uid())::text = (storage.foldername(name))[1]);
CREATE POLICY "panel-guide users update own" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'panel-guide' AND (auth.uid())::text = (storage.foldername(name))[1]);
CREATE POLICY "panel-guide users delete own" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'panel-guide' AND (auth.uid())::text = (storage.foldername(name))[1]);
