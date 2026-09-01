-- BioTrack: RPC idempotentes para eventos biologicos y operativos estructurados.

BEGIN;

CREATE OR REPLACE FUNCTION public.register_mortality_event_tx(
  _request_id uuid,
  _lot_id uuid,
  _males int DEFAULT 0,
  _females int DEFAULT 0,
  _unsexed int DEFAULT 0,
  _mass_grams numeric DEFAULT 0,
  _event_at timestamptz DEFAULT now(),
  _cause text DEFAULT NULL,
  _observations text DEFAULT NULL,
  _evidence_url text DEFAULT NULL,
  _reference_type text DEFAULT NULL,
  _reference_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _result jsonb;
  _event_id uuid;
BEGIN
  IF _cause IS NULL OR trim(_cause) = '' THEN
    RAISE EXCEPTION 'La causa de mortalidad es obligatoria.';
  END IF;
  IF _event_at < timestamptz '2000-01-01 00:00:00+00' OR _event_at > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'La fecha del evento de mortalidad no es valida.';
  END IF;
  IF _evidence_url IS NOT NULL AND _evidence_url !~* '^https?://' THEN
    RAISE EXCEPTION 'La evidencia debe ser una URL http o https valida.';
  END IF;

  PERFORM set_config('app.inventory_event_type', 'mortality_out', true);
  PERFORM set_config('app.inventory_cause', trim(_cause), true);
  PERFORM set_config('app.inventory_observations', COALESCE(trim(_observations), ''), true);
  PERFORM set_config('app.inventory_evidence_url', COALESCE(trim(_evidence_url), ''), true);
  PERFORM set_config('app.inventory_reference_type', COALESCE(trim(_reference_type), ''), true);
  PERFORM set_config('app.inventory_reference_id', COALESCE(trim(_reference_id), ''), true);
  PERFORM set_config('app.inventory_request_id', _request_id::text, true);

  _result := public.register_mortality_tx(
    _request_id, _lot_id, _males, _females, _unsexed, _mass_grams, _observations
  );
  _event_id := (_result->>'event_id')::uuid;

  UPDATE public.lot_events
  SET event_at = _event_at,
      cause = trim(_cause),
      observations = NULLIF(trim(_observations), ''),
      evidence_url = NULLIF(trim(_evidence_url), ''),
      reference_type = NULLIF(trim(_reference_type), ''),
      reference_id = NULLIF(trim(_reference_id), ''),
      request_id = _request_id,
      metadata = metadata || jsonb_build_object('cause', trim(_cause))
  WHERE id = _event_id;

  UPDATE public.inventory_events
  SET event_at = _event_at
  WHERE request_id = _request_id AND lot_id = _lot_id AND event_type = 'mortality_out';

  RETURN _result || jsonb_build_object('event_at', _event_at, 'cause', trim(_cause));
END;
$$;

CREATE OR REPLACE FUNCTION public.register_birth_event_tx(
  _request_id uuid,
  _kind public.kind_type,
  _box_id uuid,
  _species_id uuid,
  _line_id uuid DEFAULT NULL,
  _parent_lot_id uuid DEFAULT NULL,
  _reproduction_event_id uuid DEFAULT NULL,
  _lot_code text DEFAULT NULL,
  _unsexed int DEFAULT 0,
  _males int DEFAULT 0,
  _females int DEFAULT 0,
  _mass_grams numeric DEFAULT 0,
  _event_at timestamptz DEFAULT now(),
  _observations text DEFAULT NULL,
  _evidence_url text DEFAULT NULL,
  _reference_type text DEFAULT NULL,
  _reference_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org uuid := public.get_my_org_id();
  _result jsonb;
  _lot_id uuid;
  _event_id uuid;
BEGIN
  IF _event_at < timestamptz '2000-01-01 00:00:00+00' OR _event_at > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'La fecha del nacimiento no es valida.';
  END IF;
  IF _parent_lot_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.lots
    WHERE id = _parent_lot_id AND organization_id = _org AND kind = _kind
      AND species_id = _species_id AND line_id IS NOT DISTINCT FROM _line_id
  ) THEN
    RAISE EXCEPTION 'El lote progenitor no corresponde a la organizacion, especie o linea.';
  END IF;
  IF _reproduction_event_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.reproduction_events
    WHERE id = _reproduction_event_id AND organization_id = _org AND species_id = _species_id
  ) THEN
    RAISE EXCEPTION 'El evento reproductivo no corresponde a la organizacion o especie.';
  END IF;

  PERFORM set_config('app.inventory_event_type', 'birth_in', true);
  PERFORM set_config('app.inventory_observations', COALESCE(trim(_observations), ''), true);
  PERFORM set_config('app.inventory_evidence_url', COALESCE(trim(_evidence_url), ''), true);
  PERFORM set_config('app.inventory_reference_type', COALESCE(trim(_reference_type), 'reproduction_event'), true);
  PERFORM set_config(
    'app.inventory_reference_id',
    COALESCE(trim(_reference_id), _reproduction_event_id::text, ''), true
  );
  PERFORM set_config('app.inventory_request_id', _request_id::text, true);

  _result := public.register_birth_tx(
    _request_id, _kind, _box_id, _species_id, _line_id, _lot_code,
    _unsexed, _males, _females, _mass_grams, _observations
  );
  _lot_id := (_result->>'lot_id')::uuid;

  UPDATE public.lots SET parent_lot_id = _parent_lot_id
  WHERE id = _lot_id AND parent_lot_id IS DISTINCT FROM _parent_lot_id;

  SELECT id INTO _event_id
  FROM public.lot_events
  WHERE organization_id = _org AND lot_id = _lot_id AND event_type = 'birth'
  ORDER BY created_at DESC LIMIT 1;

  UPDATE public.lot_events
  SET event_at = _event_at,
      observations = NULLIF(trim(_observations), ''),
      evidence_url = NULLIF(trim(_evidence_url), ''),
      reference_type = COALESCE(NULLIF(trim(_reference_type), ''),
        CASE WHEN _reproduction_event_id IS NOT NULL THEN 'reproduction_event' END),
      reference_id = COALESCE(NULLIF(trim(_reference_id), ''), _reproduction_event_id::text),
      related_lot_id = _parent_lot_id,
      request_id = _request_id
  WHERE id = _event_id;

  UPDATE public.inventory_events SET event_at = _event_at
  WHERE request_id = _request_id AND lot_id = _lot_id AND event_type = 'birth_in';

  IF _reproduction_event_id IS NOT NULL THEN
    UPDATE public.reproduction_events SET offspring_lot_id = _lot_id
    WHERE id = _reproduction_event_id AND offspring_lot_id IS NULL;
  END IF;

  RETURN _result || jsonb_build_object('event_id', _event_id, 'parent_lot_id', _parent_lot_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.move_lot_event_tx(
  _request_id uuid,
  _lot_id uuid,
  _destination_box_id uuid,
  _event_at timestamptz DEFAULT now(),
  _cause text DEFAULT NULL,
  _observations text DEFAULT NULL,
  _evidence_url text DEFAULT NULL,
  _reference_type text DEFAULT NULL,
  _reference_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org uuid := public.get_my_org_id();
  _source_box_id uuid;
  _result jsonb;
BEGIN
  SELECT box_id INTO _source_box_id FROM public.lots
  WHERE id = _lot_id AND organization_id = _org;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lote no encontrado en la organizacion.'; END IF;
  IF _event_at < timestamptz '2000-01-01 00:00:00+00' OR _event_at > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'La fecha del movimiento no es valida.';
  END IF;

  _result := public.move_lot_tx(
    _request_id, _lot_id, _destination_box_id, COALESCE(_cause, _observations)
  );

  UPDATE public.lot_events
  SET event_at = _event_at,
      cause = NULLIF(trim(_cause), ''),
      observations = NULLIF(trim(_observations), ''),
      source_box_id = _source_box_id,
      destination_box_id = _destination_box_id,
      evidence_url = NULLIF(trim(_evidence_url), ''),
      reference_type = NULLIF(trim(_reference_type), ''),
      reference_id = NULLIF(trim(_reference_id), ''),
      request_id = _request_id
  WHERE organization_id = _org AND lot_id = _lot_id AND event_type = 'move'
    AND created_at = (
      SELECT max(created_at) FROM public.lot_events
      WHERE organization_id = _org AND lot_id = _lot_id AND event_type = 'move'
    );
  RETURN _result;
END;
$$;

CREATE OR REPLACE FUNCTION public.adjust_lot_event_tx(
  _request_id uuid,
  _lot_id uuid,
  _males int DEFAULT NULL,
  _females int DEFAULT NULL,
  _unsexed int DEFAULT NULL,
  _mass_grams numeric DEFAULT NULL,
  _tags text[] DEFAULT NULL,
  _reason text DEFAULT NULL,
  _event_at timestamptz DEFAULT now(),
  _evidence_url text DEFAULT NULL,
  _reference_type text DEFAULT NULL,
  _reference_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cached jsonb;
  _result jsonb;
BEGIN
  _cached := public.begin_transaction_request(_request_id, 'adjust_lot');
  IF _cached IS NOT NULL THEN RETURN _cached; END IF;
  IF _reason IS NULL OR trim(_reason) = '' THEN
    RAISE EXCEPTION 'El motivo del ajuste es obligatorio.';
  END IF;
  IF _event_at < timestamptz '2000-01-01 00:00:00+00' OR _event_at > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'La fecha del ajuste no es valida.';
  END IF;

  PERFORM set_config('app.inventory_event_type', 'adjustment', true);
  PERFORM set_config('app.inventory_cause', trim(_reason), true);
  PERFORM set_config('app.inventory_evidence_url', COALESCE(trim(_evidence_url), ''), true);
  PERFORM set_config('app.inventory_reference_type', COALESCE(trim(_reference_type), ''), true);
  PERFORM set_config('app.inventory_reference_id', COALESCE(trim(_reference_id), ''), true);
  PERFORM set_config('app.inventory_request_id', _request_id::text, true);

  PERFORM public.adjust_lot(
    _lot_id, _males, _females, _unsexed, _mass_grams, _tags, _reason
  );
  UPDATE public.inventory_events SET event_at = _event_at
  WHERE request_id = _request_id AND lot_id = _lot_id AND event_type = 'adjustment';

  _result := jsonb_build_object('success', true, 'lot_id', _lot_id, 'event_at', _event_at);
  PERFORM public.finish_transaction_request(_request_id, 'adjust_lot', _result);
  RETURN _result;
END;
$$;

CREATE OR REPLACE FUNCTION public.register_reproduction_event_tx(
  _request_id uuid,
  _event_type public.reproduction_event_type,
  _primary_lot_id uuid,
  _secondary_lot_id uuid DEFAULT NULL,
  _offspring_lot_id uuid DEFAULT NULL,
  _event_at timestamptz DEFAULT now(),
  _quantity int DEFAULT NULL,
  _mass_grams numeric DEFAULT NULL,
  _cause text DEFAULT NULL,
  _observations text DEFAULT NULL,
  _evidence_url text DEFAULT NULL,
  _reference_type text DEFAULT NULL,
  _reference_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org uuid := public.get_my_org_id();
  _cached jsonb;
  _primary public.lots%ROWTYPE;
  _secondary public.lots%ROWTYPE;
  _offspring public.lots%ROWTYPE;
  _event_id uuid;
  _result jsonb;
BEGIN
  _cached := public.begin_transaction_request(_request_id, 'register_reproduction');
  IF _cached IS NOT NULL THEN RETURN _cached; END IF;
  IF _org IS NULL OR NOT public.is_org_member() THEN
    RAISE EXCEPTION 'Se requiere membresia activa para registrar reproduccion.';
  END IF;
  IF _event_at < timestamptz '2000-01-01 00:00:00+00' OR _event_at > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'La fecha del evento reproductivo no es valida.';
  END IF;

  SELECT * INTO _primary FROM public.lots
  WHERE id = _primary_lot_id AND organization_id = _org FOR UPDATE;
  IF NOT FOUND OR _primary.status <> 'active' OR _primary.lot_type <> 'breeder' THEN
    RAISE EXCEPTION 'El lote reproductor principal no existe o no esta activo.';
  END IF;

  IF _secondary_lot_id IS NOT NULL THEN
    SELECT * INTO _secondary FROM public.lots
    WHERE id = _secondary_lot_id AND organization_id = _org FOR UPDATE;
    IF NOT FOUND OR _secondary.status <> 'active' OR _secondary.lot_type <> 'breeder'
       OR _secondary.kind <> _primary.kind
       OR _secondary.species_id <> _primary.species_id
       OR _secondary.line_id IS DISTINCT FROM _primary.line_id THEN
      RAISE EXCEPTION 'Los lotes reproductores deben compartir organizacion, tipo, especie y linea.';
    END IF;
  ELSIF _primary.kind = 'rodent' AND _event_type = 'mating' THEN
    RAISE EXCEPTION 'El apareamiento de roedores requiere dos lotes reproductores.';
  END IF;

  IF _offspring_lot_id IS NOT NULL THEN
    SELECT * INTO _offspring FROM public.lots
    WHERE id = _offspring_lot_id AND organization_id = _org;
    IF NOT FOUND OR _offspring.kind <> _primary.kind
       OR _offspring.species_id <> _primary.species_id
       OR _offspring.line_id IS DISTINCT FROM _primary.line_id THEN
      RAISE EXCEPTION 'El lote descendiente no corresponde a los progenitores.';
    END IF;
  END IF;

  INSERT INTO public.reproduction_events (
    organization_id, actor_user_id, event_type, event_at,
    primary_lot_id, secondary_lot_id, offspring_lot_id,
    species_id, line_id, box_id, quantity, mass_grams,
    cause, observations, evidence_url, reference_type, reference_id, request_id
  ) VALUES (
    _org, auth.uid(), _event_type, _event_at,
    _primary_lot_id, _secondary_lot_id, _offspring_lot_id,
    _primary.species_id, _primary.line_id, _primary.box_id, _quantity, _mass_grams,
    NULLIF(trim(_cause), ''), NULLIF(trim(_observations), ''),
    NULLIF(trim(_evidence_url), ''), NULLIF(trim(_reference_type), ''),
    NULLIF(trim(_reference_id), ''), _request_id
  ) RETURNING id INTO _event_id;

  _result := jsonb_build_object('success', true, 'event_id', _event_id, 'event_type', _event_type);
  PERFORM public.finish_transaction_request(_request_id, 'register_reproduction', _result);
  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.register_mortality_event_tx(uuid, uuid, int, int, int, numeric, timestamptz, text, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.register_birth_event_tx(uuid, public.kind_type, uuid, uuid, uuid, uuid, uuid, text, int, int, int, numeric, timestamptz, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.move_lot_event_tx(uuid, uuid, uuid, timestamptz, text, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.adjust_lot_event_tx(uuid, uuid, int, int, int, numeric, text[], text, timestamptz, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.register_reproduction_event_tx(uuid, public.reproduction_event_type, uuid, uuid, uuid, timestamptz, int, numeric, text, text, text, text, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.register_mortality_event_tx(uuid, uuid, int, int, int, numeric, timestamptz, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_birth_event_tx(uuid, public.kind_type, uuid, uuid, uuid, uuid, uuid, text, int, int, int, numeric, timestamptz, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.move_lot_event_tx(uuid, uuid, uuid, timestamptz, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_lot_event_tx(uuid, uuid, int, int, int, numeric, text[], text, timestamptz, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_reproduction_event_tx(uuid, public.reproduction_event_type, uuid, uuid, uuid, timestamptz, int, numeric, text, text, text, text, text) TO authenticated;

COMMIT;
