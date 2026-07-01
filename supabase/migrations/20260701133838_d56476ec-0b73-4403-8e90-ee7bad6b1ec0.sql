
CREATE POLICY "agent-medias owner select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'agent-medias' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "agent-medias owner insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'agent-medias' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "agent-medias owner update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'agent-medias' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "agent-medias owner delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'agent-medias' AND (storage.foldername(name))[1] = auth.uid()::text);
