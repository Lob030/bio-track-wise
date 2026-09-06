-- 20260721000005_security_hardening_v4_5.sql
BEGIN;

CREATE OR REPLACE FUNCTION public.adjust_lot(
  _lot_id     UUID,
  _males      INT     DEFAULT NULL,
  _females    INT     DEFAULT NULL,
  _unsexed    INT     DEFAULT NULL,
  _mass_grams NUMERIC DEFAULT NULL,
  _notes      TEXT    DEFAULT ''
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org         UUID := public.get_my_org_id();
  _uid         UUID := auth.uid();
  _lot         RECORD;
  _old_males   INT;
  _old_females INT;
  _old_unsexed INT;
  _old_mass    NUMERIC;
  _new_males   INT;
  _new_females INT;
  _new_unsexed INT;
  _new_mass    NUMERIC;
BEGIN
  IF _org IS NULL OR NOT public.is_org_member() THEN
    RAISE EXCEPTION 'Acceso denegado: Se requiere ser miembro activo de la organización.';
  END IF;

  IF _notes IS NULL OR trim(_notes) = '' THEN
    RAISE EXCEPTION 'Se requiere un motivo (notes) para el ajuste administrativo.';
  END IF;

  SELECT * INTO _lot
    FROM public.lots
   WHERE id = _lot_id
     AND organization_id = _org
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote no encontrado en su organización.';
  END IF;

  IF _lot.status <> 'active' THEN
    RAISE EXCEPTION 'Solo se pueden ajustar lotes activos. Estado actual: %', _lot.status;
  END IF;

  _old_males   := COALESCE(_lot.males, 0);
  _old_females := COALESCE(_lot.females, 0);
  _old_unsexed := COALESCE(_lot.unsexed, 0);
  _old_mass    := COALESCE(_lot.mass_grams, 0);

  _new_males   := COALESCE(_males,      _old_males);
  _new_females := COALESCE(_females,    _old_females);
  _new_unsexed := COALESCE(_unsexed,    _old_unsexed);
  _new_mass    := COALESCE(_mass_grams, _old_mass);

  IF _new_males < 0 OR _new_females < 0 OR _new_unsexed < 0 THEN
    RAISE EXCEPTION 'Los valores de población no pueden ser negativos.';
  END IF;

  IF _new_mass < 0 OR _new_mass = 'NaN'::numeric
     OR _new_mass = 'Infinity'::numeric OR _new_mass = '-Infinity'::numeric THEN
    RAISE EXCEPTION 'La masa debe ser un número finito no negativo.';
  END IF;

  IF _new_males = _old_males AND _new_females = _old_females
     AND _new_unsexed = _old_unsexed AND _new_mass = _old_mass THEN
    RETURN;
  END IF;

  UPDATE public.lots SET
    males      = _new_males,
    females    = _new_females,
    unsexed    = _new_unsexed,
    mass_grams = _new_mass,
    notes      = COALESCE(NULLIF(trim(_notes), ''), _lot.notes)
  WHERE id = _lot_id;

  INSERT INTO public.lot_events (
    organization_id, lot_id, actor_user_id, event_type,
    males_delta, females_delta, unsexed_delta, mass_delta,
    notes, metadata
  ) VALUES (
    _org, _lot_id, _uid, 'finalize'::public.lot_event_type,
    _new_males - _old_males,
    _new_females - _old_females,
    _new_unsexed - _old_unsexed,
    _new_mass - _old_mass,
    _notes,
    jsonb_build_object(
      'type', 'admin_adjustment',
      'old', jsonb_build_object('males', _old_males, 'females', _old_females, 'unsexed', _old_unsexed, 'mass_grams', _old_mass),
      'new', jsonb_build_object('males', _new_males, 'females', _new_females, 'unsexed', _new_unsexed, 'mass_grams', _new_mass)
    )
  );

  INSERT INTO public.audit_log (
    organization_id, actor_user_id, action, target_table, target_id,
    old_values, new_values, reason
  ) VALUES (
    _org, _uid, 'inventory_adjustment'::public.audit_action, 'lots', _lot_id,
    jsonb_build_object('males', _old_males, 'females', _old_females, 'unsexed', _old_unsexed, 'mass_grams', _old_mass),
    jsonb_build_object('males', _new_males, 'females', _new_females, 'unsexed', _new_unsexed, 'mass_grams', _new_mass),
    _notes
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.adjust_lot(UUID, INT, INT, INT, NUMERIC, TEXT) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.adjust_lot(UUID, INT, INT, INT, NUMERIC, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.fifo_consume_insects(
  _species UUID,
  _size    TEXT,
  _grams   NUMERIC
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org         UUID := public.get_my_org_id();
  _sp          RECORD;
  _lot         RECORD;
  _needed      NUMERIC := _grams;
  _take        NUMERIC;
  _allocations JSONB := '[]'::jsonb;
  _unfulfilled NUMERIC := 0;
  _filter_size BOOLEAN;
BEGIN
  IF _org IS NULL OR NOT public.is_org_member() THEN
    RAISE EXCEPTION 'Unauthorized: Must be an active member of an organization.';
  END IF;

  IF _grams IS NULL OR _grams <= 0
     OR _grams = 'NaN'::numeric
     OR _grams = 'Infinity'::numeric
     OR _grams = '-Infinity'::numeric THEN
    RAISE EXCEPTION 'Grams must be a positive finite number greater than zero. Received: %', _grams;
  END IF;

  SELECT * INTO _sp FROM public.species WHERE id = _species AND organization_id = _org AND kind = 'insect';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insect species % not found in your organization.', _species;
  END IF;

  _filter_size := _size IS NOT NULL AND _size <> '' AND lower(_size) <> 'all';

  IF _filter_size THEN
    IF _sp.size_rules IS NULL
       OR jsonb_typeof(_sp.size_rules) <> 'array'
       OR jsonb_array_length(_sp.size_rules) = 0 THEN
      RAISE EXCEPTION 'La especie no tiene reglas de talla (size_rules) configuradas. No se puede filtrar por talla "%".', _size;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(_sp.size_rules) AS rule
       WHERE lower(rule->>'label') = lower(_size)
    ) THEN
      RAISE EXCEPTION 'Talla "%" no encontrada en las reglas de talla de la especie.', _size;
    END IF;

    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(_sp.size_rules) AS rule
       WHERE lower(rule->>'label') = lower(_size)
         AND (
           (rule->>'min_days') IS NULL
           OR (rule->>'max_days') IS NULL
           OR NOT (rule->>'min_days') ~ '^\d+$'
           OR NOT (rule->>'max_days') ~ '^\d+$'
         )
    ) THEN
      RAISE EXCEPTION 'Regla de talla "%" tiene min_days o max_days inválidos.', _size;
    END IF;
  END IF;

  FOR _lot IN
    SELECT l.*,
           (CURRENT_DATE - l.started_at)::int AS age_days
      FROM public.lots l
     WHERE l.organization_id = _org
       AND l.species_id = _species
       AND l.kind = 'insect'
       AND l.status = 'active'
       AND COALESCE(l.mass_grams,0) > 0
       AND l.started_at <= CURRENT_DATE
       AND (
         NOT _filter_size
         OR EXISTS (
           SELECT 1
             FROM jsonb_array_elements(_sp.size_rules) AS rule
            WHERE lower(rule->>'label') = lower(_size)
              AND (CURRENT_DATE - l.started_at)::int >= (rule->>'min_days')::int
              AND (CURRENT_DATE - l.started_at)::int <= (rule->>'max_days')::int
         )
       )
     ORDER BY l.started_at ASC, l.created_at ASC
     FOR UPDATE OF l
  LOOP
    EXIT WHEN _needed <= 0;

    _take := LEAST(_needed, COALESCE(_lot.mass_grams, 0));
    _needed := _needed - _take;

    UPDATE public.lots SET
      mass_grams = COALESCE(mass_grams,0) - _take,
      status = CASE WHEN (COALESCE(mass_grams,0) - _take) <= 0 THEN 'finalizado'::public.lot_status ELSE status END,
      finalized_at = CASE WHEN (COALESCE(mass_grams,0) - _take) <= 0 THEN now() ELSE finalized_at END
    WHERE id = _lot.id;

    _allocations := _allocations || jsonb_build_object(
      'lot_id', _lot.id,
      'grams', _take,
      'age_days', _lot.age_days,
      'size_label', _size,
      'finalized', (COALESCE(_lot.mass_grams,0) - _take) <= 0
    );
  END LOOP;

  _unfulfilled := _needed;

  INSERT INTO public.audit_log (organization_id, actor_user_id, action, target_table, payload)
  VALUES (_org, auth.uid(), 'inventory_adjustment'::public.audit_action, 'lots', jsonb_build_object(
    'species_id', _species,
    'size', _size,
    'requested_grams', _grams,
    'allocations', _allocations,
    'unfulfilled', _unfulfilled
  ));

  RETURN jsonb_build_object('allocations', _allocations, 'unfulfilled', _unfulfilled);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fifo_consume_insects(UUID, TEXT, NUMERIC) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fifo_consume_insects(UUID, TEXT, NUMERIC) TO authenticated;

CREATE OR REPLACE FUNCTION public.fifo_consume_rodents(
  _species UUID,
  _size    TEXT,
  _qty     INT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org         UUID := public.get_my_org_id();
  _sp          RECORD;
  _lot         RECORD;
  _needed      INT := _qty;
  _take        INT;
  _allocations JSONB := '[]'::jsonb;
  _unfulfilled INT := 0;
  _filter_size BOOLEAN;
BEGIN
  IF _org IS NULL OR NOT public.is_org_member() THEN
    RAISE EXCEPTION 'Unauthorized: Must be an active member of an organization.';
  END IF;

  IF _qty IS NULL OR _qty <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than zero.';
  END IF;

  SELECT * INTO _sp FROM public.species WHERE id = _species AND organization_id = _org AND kind = 'rodent';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rodent species % not found in your organization.', _species;
  END IF;

  _filter_size := _size IS NOT NULL AND _size <> '' AND lower(_size) <> 'all';

  IF _filter_size THEN
    IF _sp.size_rules IS NULL
       OR jsonb_typeof(_sp.size_rules) <> 'array'
       OR jsonb_array_length(_sp.size_rules) = 0 THEN
      RAISE EXCEPTION 'La especie no tiene reglas de talla (size_rules) configuradas. No se puede filtrar por talla "%".', _size;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(_sp.size_rules) AS rule
       WHERE lower(rule->>'label') = lower(_size)
    ) THEN
      RAISE EXCEPTION 'Talla "%" no encontrada en las reglas de talla de la especie.', _size;
    END IF;

    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(_sp.size_rules) AS rule
       WHERE lower(rule->>'label') = lower(_size)
         AND (
           (rule->>'min_days') IS NULL
           OR (rule->>'max_days') IS NULL
           OR NOT (rule->>'min_days') ~ '^\d+$'
           OR NOT (rule->>'max_days') ~ '^\d+$'
         )
    ) THEN
      RAISE EXCEPTION 'Regla de talla "%" tiene min_days o max_days inválidos.', _size;
    END IF;
  END IF;

  FOR _lot IN
    SELECT l.*,
           (CURRENT_DATE - l.started_at)::int AS age_days
      FROM public.lots l
     WHERE l.organization_id = _org
       AND l.species_id = _species
       AND l.kind = 'rodent'
       AND l.status = 'active'
       AND (COALESCE(l.males,0) + COALESCE(l.females,0) + COALESCE(l.unsexed,0)) > 0
       AND l.started_at <= CURRENT_DATE
       AND (
         NOT _filter_size
         OR EXISTS (
           SELECT 1
             FROM jsonb_array_elements(_sp.size_rules) AS rule
            WHERE lower(rule->>'label') = lower(_size)
              AND (CURRENT_DATE - l.started_at)::int >= (rule->>'min_days')::int
              AND (CURRENT_DATE - l.started_at)::int <= (rule->>'max_days')::int
         )
       )
     ORDER BY l.started_at ASC, l.created_at ASC
     FOR UPDATE OF l
  LOOP
    EXIT WHEN _needed <= 0;

    DECLARE
      _avail INT := COALESCE(_lot.unsexed,0) + COALESCE(_lot.males,0) + COALESCE(_lot.females,0);
      _new_unsexed INT := COALESCE(_lot.unsexed,0);
      _new_males INT := COALESCE(_lot.males,0);
      _new_females INT := COALESCE(_lot.females,0);
      _sub_take INT;
      _rem INT;
    BEGIN
      _take := LEAST(_needed, _avail);
      _rem := _take;

      IF _new_unsexed > 0 THEN
        _sub_take := LEAST(_rem, _new_unsexed);
        _new_unsexed := _new_unsexed - _sub_take;
        _rem := _rem - _sub_take;
      END IF;
      IF _rem > 0 AND _new_males > 0 THEN
        _sub_take := LEAST(_rem, _new_males);
        _new_males := _new_males - _sub_take;
        _rem := _rem - _sub_take;
      END IF;
      IF _rem > 0 AND _new_females > 0 THEN
        _sub_take := LEAST(_rem, _new_females);
        _new_females := _new_females - _sub_take;
        _rem := _rem - _sub_take;
      END IF;

      _needed := _needed - _take;

      UPDATE public.lots SET
        unsexed = _new_unsexed,
        males = _new_males,
        females = _new_females,
        status = CASE WHEN (_new_unsexed + _new_males + _new_females) = 0 THEN 'finalizado'::public.lot_status ELSE status END,
        finalized_at = CASE WHEN (_new_unsexed + _new_males + _new_females) = 0 THEN now() ELSE finalized_at END
      WHERE id = _lot.id;

      _allocations := _allocations || jsonb_build_object(
        'lot_id', _lot.id,
        'qty', _take,
        'age_days', _lot.age_days,
        'size_label', _size,
        'finalized', (_new_unsexed + _new_males + _new_females) = 0
      );
    END;
  END LOOP;

  _unfulfilled := _needed;

  INSERT INTO public.audit_log (organization_id, actor_user_id, action, target_table, payload)
  VALUES (_org, auth.uid(), 'inventory_adjustment'::public.audit_action, 'lots', jsonb_build_object(
    'species_id', _species,
    'size', _size,
    'requested_qty', _qty,
    'allocations', _allocations,
    'unfulfilled', _unfulfilled
  ));

  RETURN jsonb_build_object('allocations', _allocations, 'unfulfilled', _unfulfilled);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fifo_consume_rodents(UUID, TEXT, INT) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fifo_consume_rodents(UUID, TEXT, INT) TO authenticated;

COMMIT;