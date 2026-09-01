-- BioTrack: union transaccional, idempotente y trazable de lotes compatibles.

BEGIN;

CREATE OR REPLACE FUNCTION public.merge_lots_tx(
  _request_id UUID,
  _source_lot_ids UUID[],
  _destination_box_id UUID,
  _lot_code TEXT DEFAULT NULL,
  _reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org UUID := public.get_my_org_id();
  _uid UUID := auth.uid();
  _cached JSONB;
  _lot RECORD;
  _baseline RECORD;
  _destination RECORD;
  _new_lot public.lots%ROWTYPE;
  _source_count INT := 0;
  _distinct_count INT;
  _males INT := 0;
  _females INT := 0;
  _unsexed INT := 0;
  _mass NUMERIC := 0;
  _oldest_start DATE;
  _source_snapshot JSONB := '[]'::JSONB;
  _result JSONB;
BEGIN
  _cached := public.begin_transaction_request(_request_id, 'merge_lots');
  IF _cached IS NOT NULL THEN RETURN _cached; END IF;

  IF _org IS NULL OR _uid IS NULL OR NOT public.is_org_member() THEN
    RAISE EXCEPTION 'Se requiere una membresia activa para unir lotes.';
  END IF;
  IF _source_lot_ids IS NULL OR cardinality(_source_lot_ids) < 2 THEN
    RAISE EXCEPTION 'Se requieren al menos dos lotes fuente.';
  END IF;

  SELECT count(DISTINCT id) INTO _distinct_count
  FROM unnest(_source_lot_ids) AS source(id);
  IF _distinct_count <> cardinality(_source_lot_ids) THEN
    RAISE EXCEPTION 'La lista de lotes fuente contiene identificadores duplicados.';
  END IF;

  FOR _lot IN
    SELECT *
    FROM public.lots
    WHERE id = ANY(_source_lot_ids)
      AND organization_id = _org
      AND status = 'active'
    ORDER BY id
    FOR UPDATE
  LOOP
    _source_count := _source_count + 1;

    IF _source_count = 1 THEN
      _baseline := _lot;
      _oldest_start := _lot.started_at;
    ELSIF _lot.kind IS DISTINCT FROM _baseline.kind
       OR _lot.species_id IS DISTINCT FROM _baseline.species_id
       OR _lot.line_id IS DISTINCT FROM _baseline.line_id THEN
      RAISE EXCEPTION 'Los lotes deben compartir tipo, especie y linea genetica.';
    END IF;

    _males := _males + COALESCE(_lot.males, 0);
    _females := _females + COALESCE(_lot.females, 0);
    _unsexed := _unsexed + COALESCE(_lot.unsexed, 0);
    _mass := _mass + COALESCE(_lot.mass_grams, 0);
    _oldest_start := LEAST(_oldest_start, _lot.started_at);
    _source_snapshot := _source_snapshot || jsonb_build_array(jsonb_build_object(
      'id', _lot.id,
      'lot_code', _lot.lot_code,
      'box_id', _lot.box_id,
      'males', COALESCE(_lot.males, 0),
      'females', COALESCE(_lot.females, 0),
      'unsexed', COALESCE(_lot.unsexed, 0),
      'mass_grams', COALESCE(_lot.mass_grams, 0)
    ));
  END LOOP;

  IF _source_count <> cardinality(_source_lot_ids) THEN
    RAISE EXCEPTION 'Uno o mas lotes no existen, no estan activos o pertenecen a otra organizacion.';
  END IF;

  SELECT * INTO _destination
  FROM public.boxes
  WHERE id = _destination_box_id
    AND organization_id = _org;
  IF NOT FOUND OR _destination.kind IS DISTINCT FROM _baseline.kind THEN
    RAISE EXCEPTION 'La caja destino no existe o no es compatible con los lotes.';
  END IF;

  IF _baseline.kind = 'rodent' AND (_males + _females + _unsexed) <= 0 THEN
    RAISE EXCEPTION 'Los lotes de roedores no contienen poblacion para unir.';
  END IF;
  IF _baseline.kind = 'insect' AND _mass <= 0 THEN
    RAISE EXCEPTION 'Los lotes de insectos no contienen biomasa para unir.';
  END IF;

  INSERT INTO public.lots (
    owner_id, organization_id, kind, lot_code, lot_type, species_id, line_id,
    box_id, males, females, unsexed, mass_grams, notes, started_at, status
  ) VALUES (
    _uid, _org, _baseline.kind, NULLIF(trim(_lot_code), ''), 'engorda',
    _baseline.species_id, _baseline.line_id, _destination_box_id,
    CASE WHEN _baseline.kind = 'rodent' THEN _males ELSE 0 END,
    CASE WHEN _baseline.kind = 'rodent' THEN _females ELSE 0 END,
    CASE WHEN _baseline.kind = 'rodent' THEN _unsexed ELSE 0 END,
    CASE WHEN _baseline.kind = 'insect' THEN _mass ELSE 0 END,
    NULLIF(trim(_reason), ''), COALESCE(_oldest_start, CURRENT_DATE), 'active'
  )
  RETURNING * INTO _new_lot;

  UPDATE public.lots
  SET males = 0,
      females = 0,
      unsexed = 0,
      mass_grams = 0,
      status = 'finalizado',
      finalized_at = now()
  WHERE id = ANY(_source_lot_ids);

  FOR _lot IN SELECT * FROM jsonb_array_elements(_source_snapshot)
  LOOP
    INSERT INTO public.lot_events (
      organization_id, lot_id, actor_user_id, event_type,
      males_delta, females_delta, unsexed_delta, mass_delta, notes, metadata
    ) VALUES (
      _org, (_lot.value->>'id')::UUID, _uid, 'merge',
      -COALESCE((_lot.value->>'males')::INT, 0),
      -COALESCE((_lot.value->>'females')::INT, 0),
      -COALESCE((_lot.value->>'unsexed')::INT, 0),
      -COALESCE((_lot.value->>'mass_grams')::NUMERIC, 0),
      NULLIF(trim(_reason), ''),
      jsonb_build_object('merged_into_lot_id', _new_lot.id)
    );
  END LOOP;

  INSERT INTO public.lot_events (
    organization_id, lot_id, actor_user_id, event_type,
    males_delta, females_delta, unsexed_delta, mass_delta, notes, metadata
  ) VALUES (
    _org, _new_lot.id, _uid, 'merge',
    CASE WHEN _baseline.kind = 'rodent' THEN _males ELSE 0 END,
    CASE WHEN _baseline.kind = 'rodent' THEN _females ELSE 0 END,
    CASE WHEN _baseline.kind = 'rodent' THEN _unsexed ELSE 0 END,
    CASE WHEN _baseline.kind = 'insect' THEN _mass ELSE 0 END,
    NULLIF(trim(_reason), ''),
    jsonb_build_object('source_lot_ids', to_jsonb(_source_lot_ids))
  );

  PERFORM public.write_audit_event(
    _org,
    'lot_merge',
    'lots',
    _new_lot.id,
    jsonb_build_object('source_lots', _source_snapshot),
    to_jsonb(_new_lot),
    _reason,
    NULL,
    _request_id,
    jsonb_build_object('source_lot_ids', to_jsonb(_source_lot_ids)),
    'merge_lots'
  );

  _result := jsonb_build_object(
    'success', true,
    'lot_id', _new_lot.id,
    'source_lot_ids', to_jsonb(_source_lot_ids),
    'kind', _new_lot.kind
  );
  PERFORM public.finish_transaction_request(_request_id, 'merge_lots', _result);
  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.merge_lots_tx(UUID, UUID[], UUID, TEXT, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_lots_tx(UUID, UUID[], UUID, TEXT, TEXT)
  TO authenticated;

COMMIT;
