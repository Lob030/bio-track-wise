-- 20260721000004_security_hardening_v4_4.sql
-- v4.4: Correcciones de columnas lot_events, cálculo de edad FIFO, y validación de integridad.
--
-- Problemas corregidos:
--   1. register_insect_birth usaba columnas inexistentes (mass_grams → mass_delta, created_by → actor_user_id)
--   2. move_lot usaba created_by → actor_user_id, event_type 'lot_move' → 'move' (enum correcto)
--   3. move_lot no validaba status = 'active'
--   4. move_lot no registraba metadata JSONB con cajas anterior/nueva
--   5. FIFO usaba EXTRACT(DAY FROM ...) sobre DATE; correcto es (CURRENT_DATE - started_at)::int
--   6. register_insect_birth no validaba _line_id pertenencia a org/especie/kind
--   7. register_insect_birth no rechazaba Infinity/-Infinity
--   8. Parámetro _destination_box_id → alineado con types.ts _destination_box_id

BEGIN;

-------------------------------------------------------------------
-- 1. register_insect_birth CORREGIDA
-------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_insect_birth(
  _box_id     UUID,
  _species_id UUID,
  _line_id    UUID DEFAULT NULL,
  _lot_code   TEXT DEFAULT NULL,
  _mass_grams NUMERIC DEFAULT 0,
  _notes      TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org        UUID := public.get_my_org_id();
  _uid        UUID := auth.uid();
  _box_kind   public.kind_type;
  _new_lot_id UUID;
BEGIN
  IF _org IS NULL OR NOT public.is_org_member() THEN
    RAISE EXCEPTION 'Acceso denegado: Se requiere ser miembro activo de la organización.';
  END IF;

  -- Validar biomasa: rechazar NULL, <= 0, NaN, Infinity, -Infinity
  IF _mass_grams IS NULL
     OR _mass_grams <= 0
     OR _mass_grams = 'NaN'::numeric
     OR _mass_grams = 'Infinity'::numeric
     OR _mass_grams = '-Infinity'::numeric THEN
    RAISE EXCEPTION 'La biomasa debe ser un número positivo finito mayor a 0 g. Recibido: %', _mass_grams;
  END IF;

  -- Validar que la caja exista en la organización y sea de tipo insect
  SELECT kind INTO _box_kind
    FROM public.boxes
   WHERE id = _box_id
     AND organization_id = _org;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Caja no encontrada en su organización.';
  END IF;

  IF _box_kind <> 'insect' THEN
    RAISE EXCEPTION 'La caja seleccionada no es de tipo insecto (tipo actual: %).', _box_kind;
  END IF;

  -- Validar especie de insectos en la organización
  IF NOT EXISTS (
    SELECT 1 FROM public.species
     WHERE id = _species_id
       AND organization_id = _org
       AND kind = 'insect'
  ) THEN
    RAISE EXCEPTION 'Especie de insectos no encontrada en su organización.';
  END IF;

  -- Validar _line_id si se proporciona: debe pertenecer a la misma org, especie y la especie debe ser insecto
  IF _line_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.genetic_lines gl
        JOIN public.species s ON gl.species_id = s.id
       WHERE gl.id = _line_id
         AND gl.organization_id = _org
         AND gl.species_id = _species_id
         AND s.kind = 'insect'
    ) THEN
      RAISE EXCEPTION 'Línea genética no encontrada o no pertenece a la especie/organización indicada.';
    END IF;
  END IF;

  -- Insertar lote de nacimiento de insectos
  INSERT INTO public.lots (
    organization_id, kind, lot_code, lot_type, species_id, line_id, box_id,
    mass_grams, males, females, unsexed, notes, started_at, status
  ) VALUES (
    _org, 'insect', _lot_code, 'birth', _species_id, _line_id, _box_id,
    _mass_grams, 0, 0, 0, _notes, CURRENT_DATE, 'active'
  ) RETURNING id INTO _new_lot_id;

  -- Registro de historial en lot_events con columnas REALES
  INSERT INTO public.lot_events (
    organization_id, lot_id, actor_user_id, event_type,
    males_delta, females_delta, unsexed_delta, mass_delta,
    notes, metadata
  ) VALUES (
    _org, _new_lot_id, _uid, 'birth'::public.lot_event_type,
    0, 0, 0, _mass_grams,
    COALESCE(_notes, 'Nacimiento/Eclosión de lote de insectos'),
    jsonb_build_object('box_id', _box_id, 'species_id', _species_id, 'line_id', _line_id)
  );

  -- Registro de auditoría
  INSERT INTO public.audit_log (
    organization_id, actor_user_id, action, target_table, target_id, new_values
  ) VALUES (
    _org, _uid, 'birth'::public.audit_action, 'lots', _new_lot_id,
    jsonb_build_object('kind', 'insect', 'mass_grams', _mass_grams, 'box_id', _box_id)
  );

  RETURN _new_lot_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.register_insect_birth(UUID, UUID, UUID, TEXT, NUMERIC, TEXT) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.register_insect_birth(UUID, UUID, UUID, TEXT, NUMERIC, TEXT) TO authenticated;

-------------------------------------------------------------------
-- 2. move_lot CORREGIDA
--    - actor_user_id en lugar de created_by
--    - event_type = 'move' (no 'lot_move')
--    - Valida que el lote esté activo
--    - Registra metadata JSONB con caja anterior, caja nueva y motivo
-------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.move_lot(
  _lot_id             UUID,
  _destination_box_id UUID,
  _reason             TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org      UUID := public.get_my_org_id();
  _uid      UUID := auth.uid();
  _lot      RECORD;
  _dest_box RECORD;
BEGIN
  IF _org IS NULL OR NOT public.is_org_member() THEN
    RAISE EXCEPTION 'Acceso denegado: Se requiere ser miembro activo de la organización.';
  END IF;

  -- Bloquear lote para actualización
  SELECT * INTO _lot
    FROM public.lots
   WHERE id = _lot_id
     AND organization_id = _org
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote no encontrado en su organización.';
  END IF;

  -- Validar que el lote esté activo
  IF _lot.status <> 'active' THEN
    RAISE EXCEPTION 'Solo se pueden mover lotes con estado activo. Estado actual: %', _lot.status;
  END IF;

  -- Validar caja destino
  SELECT * INTO _dest_box
    FROM public.boxes
   WHERE id = _destination_box_id
     AND organization_id = _org;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Caja de destino no encontrada en su organización.';
  END IF;

  -- Validar compatibilidad de tipo bioterio
  IF _lot.kind <> _dest_box.kind THEN
    RAISE EXCEPTION 'El tipo de bioterio de la caja de destino (%) no coincide con el del lote (%).', _dest_box.kind, _lot.kind;
  END IF;

  -- Idempotencia: si ya está en la misma caja, no hacer nada
  IF _lot.box_id = _destination_box_id THEN
    RETURN;
  END IF;

  -- Actualizar caja del lote
  UPDATE public.lots
     SET box_id = _destination_box_id
   WHERE id = _lot_id;

  -- Registro de historial en lot_events con columnas REALES
  INSERT INTO public.lot_events (
    organization_id, lot_id, actor_user_id, event_type,
    notes, metadata
  ) VALUES (
    _org, _lot_id, _uid, 'move'::public.lot_event_type,
    COALESCE(_reason, format('Movimiento de caja %s a caja %s',
      COALESCE((SELECT code FROM public.boxes WHERE id = _lot.box_id), 'sin caja'),
      _dest_box.code
    )),
    jsonb_build_object(
      'previous_box_id', _lot.box_id,
      'new_box_id', _destination_box_id,
      'previous_box_code', (SELECT code FROM public.boxes WHERE id = _lot.box_id),
      'new_box_code', _dest_box.code,
      'reason', _reason
    )
  );

  -- Registro de auditoría (audit_action 'lot_move' es correcto para audit_log)
  INSERT INTO public.audit_log (
    organization_id, actor_user_id, action, target_table, target_id, old_values, new_values
  ) VALUES (
    _org, _uid, 'lot_move'::public.audit_action, 'lots', _lot_id,
    jsonb_build_object('box_id', _lot.box_id),
    jsonb_build_object('box_id', _destination_box_id, 'reason', _reason)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.move_lot(UUID, UUID, TEXT) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.move_lot(UUID, UUID, TEXT) TO authenticated;

-------------------------------------------------------------------
-- 3. fifo_consume_rodents CORREGIDA
--    - Cálculo de edad: (CURRENT_DATE - l.started_at)::int  (started_at es DATE)
--    - Valida que size_rules sea un arreglo JSONB no vacío cuando se filtra por talla
--    - Valida rangos numéricos en min_days/max_days
-------------------------------------------------------------------
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

  -- Determinar si se filtra por talla
  _filter_size := _size IS NOT NULL AND _size <> '' AND lower(_size) <> 'all';

  -- Validar size_rules cuando se requiere filtrado por talla
  IF _filter_size THEN
    IF _sp.size_rules IS NULL
       OR jsonb_typeof(_sp.size_rules) <> 'array'
       OR jsonb_array_length(_sp.size_rules) = 0 THEN
      RAISE EXCEPTION 'La especie no tiene reglas de talla (size_rules) configuradas. No se puede filtrar por talla "%".', _size;
    END IF;

    -- Validar que la talla solicitada exista en size_rules
    IF NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(_sp.size_rules) AS rule
       WHERE lower(rule->>'label') = lower(_size)
    ) THEN
      RAISE EXCEPTION 'Talla "%" no encontrada en las reglas de talla de la especie.', _size;
    END IF;

    -- Validar que min_days y max_days sean numéricos válidos
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

-------------------------------------------------------------------
-- 4. fifo_consume_insects CORREGIDA
--    - Mismo fix de edad: (CURRENT_DATE - l.started_at)::int
--    - Mismas validaciones de size_rules
-------------------------------------------------------------------
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

  IF _grams IS NULL OR _grams <= 0 THEN
    RAISE EXCEPTION 'Grams must be greater than zero.';
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

COMMIT;
