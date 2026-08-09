-- Migration para sistema de Diagnósticos de Schema
CREATE OR REPLACE FUNCTION public.get_schema_audit(tabelas text[])
RETURNS TABLE (
  table_name text,
  column_name text,
  data_type text,
  is_nullable text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.table_name::text,
    c.column_name::text,
    c.data_type::text,
    c.is_nullable::text
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = ANY(tabelas)
  ORDER BY c.table_name, c.ordinal_position;
$$;

CREATE OR REPLACE FUNCTION public.get_missing_tables(tabelas text[])
RETURNS TABLE (
  table_name text,
  existe boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.table_name,
    (c.table_name IS NOT NULL) AS existe
  FROM unnest(tabelas) AS t(table_name)
  LEFT JOIN (
    SELECT DISTINCT information_schema.tables.table_name
    FROM information_schema.tables
    WHERE information_schema.tables.table_schema = 'public'
  ) c ON c.table_name = t.table_name
  ORDER BY existe, t.table_name;
$$;

REVOKE ALL ON FUNCTION public.get_schema_audit(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_schema_audit(text[]) TO authenticated;

REVOKE ALL ON FUNCTION public.get_missing_tables(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_missing_tables(text[]) TO authenticated;