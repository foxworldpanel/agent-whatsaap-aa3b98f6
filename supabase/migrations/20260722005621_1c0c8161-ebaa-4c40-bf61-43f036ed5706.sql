-- Relax blast_campaigns RLS for Mind single-tenant multi-admin access
DROP POLICY IF EXISTS workspace_scoped ON public.blast_campaigns;

CREATE POLICY "mind_authenticated_all" ON public.blast_campaigns
  FOR ALL
  TO authenticated
  USING (workspace_id = 'bd59fa41-d68d-4ac8-b995-e09ae48f52aa'::uuid)
  WITH CHECK (workspace_id = 'bd59fa41-d68d-4ac8-b995-e09ae48f52aa'::uuid AND user_id = auth.uid());