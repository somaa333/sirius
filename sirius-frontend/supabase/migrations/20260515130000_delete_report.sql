-- Hard-delete a report history row (owner enforced via auth.uid()).
-- Mirrors delete_risk_assessment / delete_cdm_event RPC pattern.

CREATE OR REPLACE FUNCTION public.delete_report(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_deleted int;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.reports
  WHERE id = p_id
    AND created_by = v_user;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', p_id::text);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_reports(p_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_id uuid;
  v_ids uuid[];
  v_result jsonb;
  v_deleted int := 0;
  v_requested int := 0;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_ids IS NULL OR cardinality(p_ids) = 0 THEN
    RETURN jsonb_build_object('ok', true, 'deleted', 0, 'requested', 0);
  END IF;

  SELECT ARRAY_AGG(DISTINCT x)
  INTO v_ids
  FROM unnest(p_ids) AS x
  WHERE x IS NOT NULL;

  IF v_ids IS NULL OR cardinality(v_ids) = 0 THEN
    RETURN jsonb_build_object('ok', true, 'deleted', 0, 'requested', 0);
  END IF;

  v_requested := cardinality(v_ids);

  FOREACH v_id IN ARRAY v_ids
  LOOP
    v_result := public.delete_report(v_id);
    IF COALESCE((v_result->>'ok')::boolean, false) THEN
      v_deleted := v_deleted + 1;
    END IF;
  END LOOP;

  IF v_deleted = 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'not_found',
      'deleted', 0,
      'requested', v_requested
    );
  END IF;

  IF v_deleted < v_requested THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'partial',
      'deleted', v_deleted,
      'requested', v_requested
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'deleted', v_deleted,
    'requested', v_requested
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_report(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_reports(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_report(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_reports(uuid[]) TO authenticated;
