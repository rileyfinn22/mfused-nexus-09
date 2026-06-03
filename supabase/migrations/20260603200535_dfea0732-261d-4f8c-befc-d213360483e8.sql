
CREATE OR REPLACE FUNCTION public.exec_sql_admin(query text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  trimmed text;
  is_select boolean;
BEGIN
  trimmed := lower(ltrim(query));
  is_select := trimmed LIKE 'select%' OR trimmed LIKE 'with%' OR trimmed LIKE 'show%' OR trimmed LIKE 'explain%';

  IF is_select THEN
    EXECUTE 'SELECT COALESCE(jsonb_agg(t), ''[]''::jsonb) FROM (' || query || ') t' INTO result;
    RETURN jsonb_build_object('rows', result);
  ELSE
    EXECUTE query;
    RETURN jsonb_build_object('ok', true);
  END IF;
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error', SQLERRM, 'sqlstate', SQLSTATE);
END;
$$;

REVOKE ALL ON FUNCTION public.exec_sql_admin(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.exec_sql_admin(text) FROM anon;
REVOKE ALL ON FUNCTION public.exec_sql_admin(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.exec_sql_admin(text) TO service_role;
