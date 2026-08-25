-- 20260721000003_security_hardening_v4_3.sql
-- Fase de Seguridad Multiusuario v4.3: Eliminación estricta de sobrecargas FIFO, Filtrado real por Talla, Nacimiento de Insectos, move_lot y Aceptación de Invitaciones Estructurada.

-- 1. Eliminación estricta de TODAS las sobrecargas viejas de FIFO que recibían owner_id u otros tipos de parámetros
DROP FUNCTION IF EXISTS public.fifo_consume_rodents(UUID, UUID, TEXT, INT);
DROP FUNCTION IF EXISTS public.fifo_consume_rodents(UUID, UUID, TEXT, NUMERIC);
DROP FUNCTION IF EXISTS public.fifo_consume_rodents(NUMERIC, TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS public.fifo_consume_rodents(NUMERIC, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.fifo_consume_rodents(INT, TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS public.fifo_consume_rodents(INT, TEXT, TEXT, TEXT);

DROP FUNCTION IF EXISTS public.fifo_consume_insects(UUID, UUID, TEXT, NUMERIC);
DROP FUNCTION IF EXISTS public.fifo_consume_insects(NUMERIC, TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS public.fifo_consume_insects(NUMERIC, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.fifo_consume_insects(INT, TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS public.fifo_consume_insects(INT, TEXT, TEXT, TEXT);

-- 2. accept_invite Estructurado (Devuelve JSONB sin abortar la transacción al marcar expiración)
CREATE OR REPLACE FUNCTION public.accept_invite(_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid          UUID := auth.uid();
  _email        TEXT := auth.email();
  _invite       RECORD;
  _prof         RECORD;
  _current_role RECORD;
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'status', 'unauthenticated', 'message', 'Usuario no autenticado.');
  END IF;

  -- 1. Bloqueo FOR UPDATE de la invitación
  SELECT * INTO _invite
    FROM public.organization_invites
   WHERE token = _token
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'status', 'invalid_token', 'message', 'Token de invitación inválido.');
  END IF;

  -- IDEMPOTENCIA: Si la invitación ya fue aceptada por este mismo usuario
  IF _invite.status = 'accepted' AND _invite.accepted_by = _uid THEN
    RETURN jsonb_build_object('success', true, 'status', 'already_accepted', 'message', 'Invitación ya aceptada previamente por este usuario.');
  END IF;

  -- Manejo de Expiración Persistente (se actualiza el estado y SE COMPROMETE en la BD)
  IF _invite.expires_at <= now() THEN
    UPDATE public.organization_invites
       SET status = 'expired'
     WHERE id = _invite.id;
    RETURN jsonb_build_object('success', false, 'status', 'expired', 'message', 'La invitación ha expirado.');
  END IF;

  IF _invite.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'status', _invite.status, 'message', format('La invitación ya no está pendiente (Estado: %s).', _invite.status));
  END IF;

  IF _email IS NULL OR lower(_email) <> lower(_invite.email) THEN
    RETURN jsonb_build_object('success', false, 'status', 'email_mismatch', 'message', format('El correo autenticado (%s) no coincide con el correo invitado (%s).', COALESCE(_email, 'desconocido'), _invite.email));
  END IF;

  -- 2. Bloqueo FOR UPDATE del perfil y membresías del usuario
  SELECT * INTO _prof
    FROM public.profiles
   WHERE id = _uid
   FOR UPDATE;

  SELECT * INTO _current_role
    FROM public.user_roles
   WHERE user_id = _uid
   FOR UPDATE;

  IF _current_role.id IS NOT NULL AND _current_role.status = 'active' AND _current_role.organization_id <> _invite.organization_id THEN
    RETURN jsonb_build_object('success', false, 'status', 'conflict', 'message', 'El usuario ya pertenece a otra organización activa.');
  END IF;

  -- 3. Transición Atómica de Aceptación
  UPDATE public.profiles
     SET organization_id = _invite.organization_id
   WHERE id = _uid;

  INSERT INTO public.user_roles (user_id, role, organization_id, status)
  VALUES (_uid, _invite.role, _invite.organization_id, 'active')
  ON CONFLICT (user_id) DO UPDATE SET
    role              = EXCLUDED.role,
    organization_id   = EXCLUDED.organization_id,
    status            = 'active',
    status_changed_at = now(),
    status_changed_by = NULL;

  UPDATE public.organization_invites
     SET status      = 'accepted',
         accepted_at = now(),
         accepted_by = _uid
   WHERE id = _invite.id;

  INSERT INTO public.audit_log (
    organization_id, actor_user_id, action,
    target_table, target_id, new_values
  ) VALUES (
    _invite.organization_id, _uid, 'invite_accepted',
    'organization_invites', _invite.id,
    jsonb_build_object('role', _invite.role, 'email', _invite.email)
  );

  RETURN jsonb_build_object('success', true, 'status', 'accepted', 'message', 'Invitación aceptada con éxito.');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.accept_invite(UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.accept_invite(UUID) TO authenticated;

-- 3. RPC register_insect_birth para registrar nacimientos de insectos por BIOMASA (masa en gramos)
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
  _box_kind   public.kind_type;
  _new_lot_id UUID;
BEGIN
  IF _org IS NULL OR NOT public.is_org_member() THEN
    RAISE EXCEPTION 'Acceso denegado: Se requiere ser miembro activo de la organización.';
  END IF;

  IF _mass_grams IS NULL OR _mass_grams <= 0 OR _mass_grams = 'NaN'::numeric THEN
    RAISE EXCEPTION 'La biomasa para nacimientos de insectos debe ser un número positivo mayor a 0 g.';
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

  -- Validar especie en la organización
  IF NOT EXISTS (
    SELECT 1 FROM public.species
     WHERE id = _species_id
       AND organization_id = _org
       AND kind = 'insect'
  ) THEN
    RAISE EXCEPTION 'Especie de insectos no encontrada en su organización.';
  END IF;

  -- Insertar Lote de Nacimiento de Insectos
  INSERT INTO public.lots (
    organization_id, kind, lot_code, lot_type, species_id, line_id, box_id,
    mass_grams, males, females, unsexed, notes, started_at, status
  ) VALUES (
    _org, 'insect', _lot_code, 'birth', _species_id, _line_id, _box_id,
    _mass_grams, 0, 0, 0, _notes, CURRENT_DATE, 'active'
  ) RETURNING id INTO _new_lot_id;

  -- Registro de Historial de Eventos
  INSERT INTO public.lot_events (
    organization_id, lot_id, event_type, mass_grams, notes, created_by
  ) VALUES (
    _org, _new_lot_id, 'birth', _mass_grams, COALESCE(_notes, 'Nacimiento/Eclosión de lote de insectos'), auth.uid()
  );

  -- Registro de Auditoría
  INSERT INTO public.audit_log (
    organization_id, actor_user_id, action, target_table, target_id, new_values
  ) VALUES (
    _org, auth.uid(), 'birth', 'lots', _new_lot_id,
    jsonb_build_object('kind', 'insect', 'mass_grams', _mass_grams, 'box_id', _box_id)
  );

  RETURN _new_lot_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_insect_birth(UUID, UUID, UUID, TEXT, NUMERIC, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.register_insect_birth(UUID, UUID, UUID, TEXT, NUMERIC, TEXT) FROM anon, PUBLIC;

-- 4. RPC move_lot Fortalecida
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
  _lot      RECORD;
  _dest_box RECORD;
BEGIN
  IF _org IS NULL OR NOT public.is_org_member() THEN
    RAISE EXCEPTION 'Acceso denegado: Se requiere ser miembro activo de la organización.';
  END IF;

  SELECT * INTO _lot
    FROM public.lots
   WHERE id = _lot_id
     AND organization_id = _org
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote no encontrado en su organización.';
  END IF;

  SELECT * INTO _dest_box
    FROM public.boxes
   WHERE id = _destination_box_id
     AND organization_id = _org;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Caja de destino no encontrada en su organización.';
  END IF;

  IF _lot.kind <> _dest_box.kind THEN
    RAISE EXCEPTION 'El tipo de bioterio de la caja de destino (%) no coincide con el del lote (%).', _dest_box.kind, _lot.kind;
  END IF;

  IF _lot.box_id = _destination_box_id THEN
    RETURN;
  END IF;

  UPDATE public.lots
     SET box_id = _destination_box_id
   WHERE id = _lot_id;

  INSERT INTO public.lot_events (
    organization_id, lot_id, event_type, notes, created_by
  ) VALUES (
    _org, _lot_id, 'lot_move', COALESCE(_reason, format('Movimiento a caja %s', _dest_box.code)), auth.uid()
  );

  INSERT INTO public.audit_log (
    organization_id, actor_user_id, action, target_table, target_id, old_values, new_values
  ) VALUES (
    _org, auth.uid(), 'lot_move', 'lots', _lot_id,
    jsonb_build_object('box_id', _lot.box_id),
    jsonb_build_object('box_id', _destination_box_id)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.move_lot(UUID, UUID, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.move_lot(UUID, UUID, TEXT) FROM anon, PUBLIC;

-- 5. FIFO por Talla Real con Evaluación de species.size_rules y Edad del Lote
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

  FOR _lot IN
    SELECT l.*,
           EXTRACT(DAY FROM (CURRENT_DATE - l.started_at))::int AS age_days
      FROM public.lots l
     WHERE l.organization_id = _org
       AND l.species_id = _species
       AND l.kind = 'rodent'
       AND l.status = 'active'
       AND (COALESCE(l.males,0) + COALESCE(l.females,0) + COALESCE(l.unsexed,0)) > 0
       AND (
         _size IS NULL OR _size = '' OR lower(_size) = 'all'
         OR EXISTS (
           SELECT 1
             FROM jsonb_array_elements(_sp.size_rules) AS rule
            WHERE lower(rule->>'label') = lower(_size)
              AND EXTRACT(DAY FROM (CURRENT_DATE - l.started_at))::int >= (rule->>'min_days')::int
              AND EXTRACT(DAY FROM (CURRENT_DATE - l.started_at))::int <= (rule->>'max_days')::int
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

GRANT EXECUTE ON FUNCTION public.fifo_consume_rodents(UUID, TEXT, INT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fifo_consume_rodents(UUID, TEXT, INT) FROM anon, PUBLIC;

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

  FOR _lot IN
    SELECT l.*,
           EXTRACT(DAY FROM (CURRENT_DATE - l.started_at))::int AS age_days
      FROM public.lots l
     WHERE l.organization_id = _org
       AND l.species_id = _species
       AND l.kind = 'insect'
       AND l.status = 'active'
       AND COALESCE(l.mass_grams,0) > 0
       AND (
         _size IS NULL OR _size = '' OR lower(_size) = 'all'
         OR EXISTS (
           SELECT 1
             FROM jsonb_array_elements(_sp.size_rules) AS rule
            WHERE lower(rule->>'label') = lower(_size)
              AND EXTRACT(DAY FROM (CURRENT_DATE - l.started_at))::int >= (rule->>'min_days')::int
              AND EXTRACT(DAY FROM (CURRENT_DATE - l.started_at))::int <= (rule->>'max_days')::int
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
      'qty', _take,
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

GRANT EXECUTE ON FUNCTION public.fifo_consume_insects(UUID, TEXT, NUMERIC) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fifo_consume_insects(UUID, TEXT, NUMERIC) FROM anon, PUBLIC;
