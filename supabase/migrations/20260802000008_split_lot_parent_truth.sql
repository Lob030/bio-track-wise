-- split_lot usa exclusivamente child.parent_lot_id para la genealogia.

BEGIN;

CREATE OR REPLACE FUNCTION public.split_lot(
  _source_lot_id UUID,
  _sublots JSONB,
  _reason TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org UUID := public.get_my_org_id();
  _src RECORD;
  _dest_box RECORD;
  _item JSONB;
  _m INT; _f INT; _u INT; _mass NUMERIC; _box_id UUID;
  _tot_m INT := 0; _tot_f INT := 0; _tot_u INT := 0; _tot_mass NUMERIC := 0;
  _rem_m INT; _rem_f INT; _rem_u INT; _rem_mass NUMERIC;
  _new_ids JSONB := '[]'::jsonb;
  _new_id UUID;
BEGIN
  IF _org IS NULL OR NOT public.is_org_member() THEN
    RAISE EXCEPTION 'Unauthorized: must be an active organization member';
  END IF;
  IF _sublots IS NULL OR jsonb_typeof(_sublots) <> 'array' OR jsonb_array_length(_sublots) = 0 THEN
    RAISE EXCEPTION 'Sublots array cannot be empty';
  END IF;

  SELECT * INTO _src
  FROM public.lots
  WHERE id = _source_lot_id AND organization_id = _org AND status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source active lot not found in your organization';
  END IF;

  FOR _item IN SELECT value FROM jsonb_array_elements(_sublots) LOOP
    BEGIN
      _m := COALESCE((_item->>'males')::INT, 0);
      _f := COALESCE((_item->>'females')::INT, 0);
      _u := COALESCE((_item->>'unsexed')::INT, 0);
      _mass := COALESCE((_item->>'mass_grams')::NUMERIC, 0);
      _box_id := NULLIF(_item->>'box_id', '')::UUID;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Sublot data has an invalid format';
    END;

    IF _m < 0 OR _f < 0 OR _u < 0 OR NOT public.is_finite_nonnegative(_mass) THEN
      RAISE EXCEPTION 'Sublot quantities and mass cannot be negative or non-finite';
    END IF;
    IF (_src.kind = 'rodent' AND (_m + _f + _u) <= 0)
       OR (_src.kind = 'insect' AND _mass <= 0) THEN
      RAISE EXCEPTION 'Sublot must have a positive quantity for its animal kind';
    END IF;
    IF (_src.kind = 'rodent' AND _mass <> 0)
       OR (_src.kind = 'insect' AND (_m + _f + _u) <> 0) THEN
      RAISE EXCEPTION 'Sublot quantities are incompatible with the animal kind';
    END IF;

    IF _box_id IS NOT NULL THEN
      SELECT * INTO _dest_box
      FROM public.boxes
      WHERE id = _box_id AND organization_id = _org;
      IF NOT FOUND OR _dest_box.kind <> _src.kind THEN
        RAISE EXCEPTION 'Destination box is not in the organization or has the wrong kind';
      END IF;
    END IF;

    _tot_m := _tot_m + _m;
    _tot_f := _tot_f + _f;
    _tot_u := _tot_u + _u;
    _tot_mass := _tot_mass + _mass;
  END LOOP;

  IF _src.kind = 'rodent' AND (
    _tot_m > COALESCE(_src.males, 0)
    OR _tot_f > COALESCE(_src.females, 0)
    OR _tot_u > COALESCE(_src.unsexed, 0)
  ) THEN
    RAISE EXCEPTION 'Split population totals exceed source lot available population';
  ELSIF _src.kind = 'insect' AND _tot_mass > COALESCE(_src.mass_grams, 0) THEN
    RAISE EXCEPTION 'Split mass total exceeds source lot available mass';
  END IF;

  _rem_m := COALESCE(_src.males, 0) - _tot_m;
  _rem_f := COALESCE(_src.females, 0) - _tot_f;
  _rem_u := COALESCE(_src.unsexed, 0) - _tot_u;
  _rem_mass := COALESCE(_src.mass_grams, 0) - _tot_mass;

  FOR _item IN SELECT value FROM jsonb_array_elements(_sublots) LOOP
    _m := COALESCE((_item->>'males')::INT, 0);
    _f := COALESCE((_item->>'females')::INT, 0);
    _u := COALESCE((_item->>'unsexed')::INT, 0);
    _mass := COALESCE((_item->>'mass_grams')::NUMERIC, 0);

    INSERT INTO public.lots (
      owner_id, organization_id, kind, lot_code, lot_type, species_id,
      line_id, box_id, parent_lot_id, males, females, unsexed,
      mass_grams, started_at, status, notes
    ) VALUES (
      auth.uid(), _org, _src.kind, NULLIF(trim(_item->>'lot_code'), ''),
      COALESCE((_item->>'lot_type')::public.lot_type, _src.lot_type),
      _src.species_id, _src.line_id, NULLIF(_item->>'box_id', '')::UUID,
      _source_lot_id, _m, _f, _u, _mass, _src.started_at, 'active',
      NULLIF(trim(_item->>'notes'), '')
    ) RETURNING id INTO _new_id;

    _new_ids := _new_ids || jsonb_build_array(_new_id);
  END LOOP;

  UPDATE public.lots
  SET males = _rem_m,
      females = _rem_f,
      unsexed = _rem_u,
      mass_grams = _rem_mass,
      status = CASE
        WHEN (kind = 'rodent' AND (_rem_m + _rem_f + _rem_u) = 0)
          OR (kind = 'insect' AND _rem_mass = 0)
        THEN 'finalizado'::public.lot_status ELSE status END,
      finalized_at = CASE
        WHEN (kind = 'rodent' AND (_rem_m + _rem_f + _rem_u) = 0)
          OR (kind = 'insect' AND _rem_mass = 0)
        THEN now() ELSE finalized_at END
  WHERE id = _source_lot_id;

  INSERT INTO public.lot_events (
    organization_id, lot_id, actor_user_id, event_type, notes, metadata
  ) VALUES (
    _org, _source_lot_id, auth.uid(), 'split'::public.lot_event_type,
    _reason, jsonb_build_object('created_sublots', _new_ids)
  );

  INSERT INTO public.audit_log (
    organization_id, actor_user_id, action, target_table, target_id,
    new_values, reason, origin
  ) VALUES (
    _org, auth.uid(), 'lot_split'::public.audit_action, 'lots',
    _source_lot_id, jsonb_build_object('created_sublot_ids', _new_ids),
    _reason, 'rpc:split_lot'
  );

  RETURN jsonb_build_object('created_lots', _new_ids);
END;
$$;

GRANT EXECUTE ON FUNCTION public.split_lot(UUID, JSONB, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.split_lot(UUID, JSONB, TEXT) FROM anon, PUBLIC;

COMMIT;
