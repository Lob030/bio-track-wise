-- 20260721000001_security_hardening_v4.sql
-- Fase de Seguridad Multiusuario: RPCs Transaccionales, FIFO sin owner, Validaciones e Integridad

-- 1. Diagnóstico de Datos Inválidos (Abortar si existen valores negativos que requieren intervención humana)
DO $$
DECLARE
  _invalid_lots INT;
BEGIN
  SELECT COUNT(*) INTO _invalid_lots
    FROM public.lots
   WHERE males < 0 OR females < 0 OR unsexed < 0 OR mass_grams < 0 OR total_deaths < 0;

  IF _invalid_lots > 0 THEN
    RAISE EXCEPTION 'MIGRATION_ABORT: Found % lot(s) with negative values in population or mass. Human decision required.', _invalid_lots;
  END IF;
END $$;

-- 2. RPC Transaccional de Gestión de Equipo (manage_team_member)
CREATE OR REPLACE FUNCTION public.manage_team_member(
  _target_user_id UUID,
  _action         TEXT,
  _new_role       public.app_role DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller_uid UUID := auth.uid();
  _caller_org UUID;
  _target RECORD;
  _active_admins INT;
BEGIN
  IF _caller_uid IS NULL THEN
    RAISE EXCEPTION 'No autenticado.';
  END IF;

  -- 1. Verificar que el caller sea un Admin activo
  SELECT organization_id INTO _caller_org
    FROM public.user_roles
   WHERE user_id = _caller_uid
     AND role = 'admin'
     AND status = 'active';

  IF _caller_org IS NULL THEN
    RAISE EXCEPTION 'Acceso denegado: Se requiere ser Administrador activo de la organización.';
  END IF;

  -- 2. Buscar al usuario objetivo en la misma organización con FOR UPDATE
  SELECT * INTO _target
    FROM public.user_roles
   WHERE user_id = _target_user_id
     AND organization_id = _caller_org
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El usuario objetivo no pertenece a su organización.';
  END IF;

  -- 3. Auto-protección
  IF _target_user_id = _caller_uid AND _action IN ('suspend', 'revoke') THEN
    RAISE EXCEPTION 'No puede suspenderse ni revocarse a sí mismo.';
  END IF;

  -- 4. Protección del último administrador activo
  IF _target.role = 'admin' AND _target.status = 'active' AND _action IN ('suspend', 'revoke', 'change_role') THEN
    SELECT count(*) INTO _active_admins
      FROM public.user_roles
     WHERE organization_id = _caller_org
       AND role = 'admin'
       AND status = 'active';

    IF _active_admins <= 1 AND (_action IN ('suspend', 'revoke') OR (_action = 'change_role' AND _new_role <> 'admin')) THEN
      RAISE EXCEPTION 'No se puede modificar ni revocar al único administrador activo de la organización.';
    END IF;
  END IF;

  -- 5. Ejecutar la acción solicitada
  IF _action = 'suspend' THEN
    IF _target.status = 'revoked' THEN
      RAISE EXCEPTION 'No se puede suspender a un usuario con acceso revocado.';
    END IF;

    UPDATE public.user_roles
       SET status = 'suspended',
           status_changed_at = now(),
           status_changed_by = _caller_uid
     WHERE user_id = _target_user_id;

    INSERT INTO public.audit_log (organization_id, actor_user_id, action, target_table, target_id)
    VALUES (_caller_org, _caller_uid, 'member_suspended', 'user_roles', _target_user_id);

  ELSIF _action = 'reinstate' THEN
    IF _target.status = 'revoked' THEN
      RAISE EXCEPTION 'No se puede reinstaurar directamente a un usuario revocado.';
    END IF;

    UPDATE public.user_roles
       SET status = 'active',
           status_changed_at = now(),
           status_changed_by = _caller_uid
     WHERE user_id = _target_user_id;

    UPDATE public.profiles
       SET organization_id = _caller_org
     WHERE id = _target_user_id;

    INSERT INTO public.audit_log (organization_id, actor_user_id, action, target_table, target_id)
    VALUES (_caller_org, _caller_uid, 'member_reinstated', 'user_roles', _target_user_id);

  ELSIF _action = 'revoke' THEN
    UPDATE public.user_roles
       SET status = 'revoked',
           status_changed_at = now(),
           status_changed_by = _caller_uid
     WHERE user_id = _target_user_id;

    UPDATE public.profiles
       SET organization_id = NULL
     WHERE id = _target_user_id;

    INSERT INTO public.audit_log (organization_id, actor_user_id, action, target_table, target_id, old_values, new_values)
    VALUES (_caller_org, _caller_uid, 'member_revoked', 'user_roles', _target_user_id, jsonb_build_object('status', _target.status), jsonb_build_object('status', 'revoked'));

  ELSIF _action = 'change_role' THEN
    IF _new_role IS NULL THEN
      RAISE EXCEPTION 'Debe especificar el nuevo rol.';
    END IF;

    UPDATE public.user_roles
       SET role = _new_role
     WHERE user_id = _target_user_id;

    INSERT INTO public.audit_log (organization_id, actor_user_id, action, target_table, target_id)
    VALUES (_caller_org, _caller_uid, 'role_change', 'user_roles', _target_user_id);

  ELSE
    RAISE EXCEPTION 'Acción no válida: %', _action;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.manage_team_member(UUID, TEXT, public.app_role) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.manage_team_member(UUID, TEXT, public.app_role) TO authenticated;

-- 3. RPC Aceptación de Invitaciones (accept_invite)
CREATE OR REPLACE FUNCTION public.accept_invite(_token UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid    UUID := auth.uid();
  _email  TEXT := auth.email();
  _invite RECORD;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;

  SELECT * INTO _invite
    FROM public.organization_invites
   WHERE token = _token
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Token de invitación inválido.';
  END IF;

  IF _invite.status <> 'pending' THEN
    RAISE EXCEPTION 'La invitación ya no está pendiente (Estado: %).', _invite.status;
  END IF;

  IF _invite.expires_at <= now() THEN
    UPDATE public.organization_invites
       SET status = 'expired'
     WHERE id = _invite.id;
    RAISE EXCEPTION 'La invitación ha expirado.';
  END IF;

  IF _email IS NULL OR lower(_email) <> lower(_invite.email) THEN
    RAISE EXCEPTION 'El correo autenticado (%) no coincide con el correo invitado (%).', COALESCE(_email, 'desconocido'), _invite.email;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = _uid
       AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'El usuario ya pertenece a una organización activa.';
  END IF;

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
END;
$$;

REVOKE EXECUTE ON FUNCTION public.accept_invite(UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.accept_invite(UUID) TO authenticated;

-- 4. Trigger Registro de Nuevo Usuario (handle_new_user)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _has_pending_invite BOOLEAN;
  _org_id UUID;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.organization_invites
     WHERE lower(email) = lower(NEW.email)
       AND status = 'pending'
       AND expires_at > now()
  ) INTO _has_pending_invite;

  IF _has_pending_invite THEN
    INSERT INTO public.profiles (id, email, full_name, organization_id)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1)),
      NULL
    )
    ON CONFLICT (id) DO NOTHING;
  ELSE
    INSERT INTO public.organizations (name, created_by)
    VALUES ('Mi Bioterio', NEW.id)
    RETURNING id INTO _org_id;

    INSERT INTO public.profiles (id, email, full_name, organization_id)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1)),
      _org_id
    )
    ON CONFLICT (id) DO UPDATE SET organization_id = EXCLUDED.organization_id;

    INSERT INTO public.user_roles (user_id, role, organization_id, status)
    VALUES (NEW.id, 'admin', _org_id, 'active')
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- 5. RPC FIFO Venta de Roedores (fifo_consume_rodents) sin _owner
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
  _org UUID := public.get_my_org_id();
  _lot RECORD;
  _needed INT := _qty;
  _take INT;
  _allocations JSONB := '[]'::jsonb;
  _unfulfilled INT := 0;
BEGIN
  IF _org IS NULL OR NOT public.is_org_member() THEN
    RAISE EXCEPTION 'Unauthorized: Must be an active member of an organization.';
  END IF;

  IF _qty IS NULL OR _qty <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than zero.';
  END IF;

  FOR _lot IN
    SELECT * FROM public.lots
     WHERE organization_id = _org
       AND species_id = _species
       AND status = 'active'
       AND (COALESCE(males,0) + COALESCE(females,0) + COALESCE(unsexed,0)) > 0
     ORDER BY started_at ASC, created_at ASC
     FOR UPDATE
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
        'finalized', (_new_unsexed + _new_males + _new_females) = 0
      );
    END;
  END LOOP;

  _unfulfilled := _needed;

  INSERT INTO public.audit_log (organization_id, actor_user_id, action, target_table, payload)
  VALUES (_org, auth.uid(), 'inventory_adjustment'::public.audit_action, 'lots', jsonb_build_object(
    'species_id', _species,
    'requested_qty', _qty,
    'allocations', _allocations,
    'unfulfilled', _unfulfilled
  ));

  RETURN jsonb_build_object('allocations', _allocations, 'unfulfilled', _unfulfilled);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fifo_consume_rodents(UUID, TEXT, INT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fifo_consume_rodents(UUID, TEXT, INT) FROM anon, PUBLIC;

-- 6. RPC FIFO Venta de Insectos (fifo_consume_insects) sin _owner
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
  _org UUID := public.get_my_org_id();
  _lot RECORD;
  _needed NUMERIC := _grams;
  _take NUMERIC;
  _allocations JSONB := '[]'::jsonb;
  _unfulfilled NUMERIC := 0;
BEGIN
  IF _org IS NULL OR NOT public.is_org_member() THEN
    RAISE EXCEPTION 'Unauthorized: Must be an active member of an organization.';
  END IF;

  IF _grams IS NULL OR _grams <= 0 THEN
    RAISE EXCEPTION 'Grams must be greater than zero.';
  END IF;

  FOR _lot IN
    SELECT * FROM public.lots
     WHERE organization_id = _org
       AND species_id = _species
       AND status = 'active'
       AND COALESCE(mass_grams,0) > 0
     ORDER BY started_at ASC, created_at ASC
     FOR UPDATE
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
      'finalized', (COALESCE(_lot.mass_grams,0) - _take) <= 0
    );
  END LOOP;

  _unfulfilled := _needed;

  INSERT INTO public.audit_log (organization_id, actor_user_id, action, target_table, payload)
  VALUES (_org, auth.uid(), 'inventory_adjustment'::public.audit_action, 'lots', jsonb_build_object(
    'species_id', _species,
    'requested_grams', _grams,
    'allocations', _allocations,
    'unfulfilled', _unfulfilled
  ));

  RETURN jsonb_build_object('allocations', _allocations, 'unfulfilled', _unfulfilled);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fifo_consume_insects(UUID, TEXT, NUMERIC) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fifo_consume_insects(UUID, TEXT, NUMERIC) FROM anon, PUBLIC;

-- 7. RPC Registro de Mortandad (register_mortality)
CREATE OR REPLACE FUNCTION public.register_mortality(
  _lot_id   UUID,
  _males    INT DEFAULT 0,
  _females  INT DEFAULT 0,
  _unsexed  INT DEFAULT 0,
  _notes    TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org UUID := public.get_my_org_id();
  _lot RECORD;
  _tot_deaths INT;
  _new_males INT; _new_females INT; _new_unsexed INT; _new_tot INT;
  _eventId UUID;
BEGIN
  IF _org IS NULL OR NOT public.is_org_member() THEN
    RAISE EXCEPTION 'Unauthorized: must be an active organization member';
  END IF;

  _males   := COALESCE(_males, 0);
  _females := COALESCE(_females, 0);
  _unsexed := COALESCE(_unsexed, 0);

  IF _males < 0 OR _females < 0 OR _unsexed < 0 THEN
    RAISE EXCEPTION 'Mortality quantities cannot be negative';
  END IF;

  _tot_deaths := _males + _females + _unsexed;
  IF _tot_deaths <= 0 THEN
    RAISE EXCEPTION 'Total mortality quantity must be greater than zero';
  END IF;

  SELECT * INTO _lot
    FROM public.lots
   WHERE id = _lot_id
     AND organization_id = _org
     AND status = 'active'
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active lot not found in your organization';
  END IF;

  IF _males > COALESCE(_lot.males,0) OR _females > COALESCE(_lot.females,0) OR _unsexed > COALESCE(_lot.unsexed,0) THEN
    RAISE EXCEPTION 'Mortality exceeds current available population';
  END IF;

  _new_males   := COALESCE(_lot.males,0) - _males;
  _new_females := COALESCE(_lot.females,0) - _females;
  _new_unsexed := COALESCE(_lot.unsexed,0) - _unsexed;
  _new_tot     := _new_males + _new_females + _new_unsexed;

  UPDATE public.lots SET
    males        = _new_males,
    females      = _new_females,
    unsexed      = _new_unsexed,
    total_deaths = COALESCE(total_deaths,0) + _tot_deaths,
    status       = CASE WHEN _new_tot = 0 THEN 'finalizado'::public.lot_status ELSE status END,
    finalized_at = CASE WHEN _new_tot = 0 THEN now() ELSE finalized_at END
  WHERE id = _lot_id;

  INSERT INTO public.lot_events (
    organization_id, lot_id, actor_user_id, event_type,
    males_delta, females_delta, unsexed_delta, notes
  ) VALUES (
    _org, _lot_id, auth.uid(), 'mortality'::public.lot_event_type,
    -_males, -_females, -_unsexed, _notes
  ) RETURNING id INTO _eventId;

  INSERT INTO public.audit_log (organization_id, actor_user_id, action, target_table, target_id, new_values)
  VALUES (_org, auth.uid(), 'mortality'::public.audit_action, 'lots', _lot_id, jsonb_build_object('males', _males, 'females', _females, 'unsexed', _unsexed));

  RETURN _eventId;
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_mortality(UUID, INT, INT, INT, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.register_mortality(UUID, INT, INT, INT, TEXT) FROM anon, PUBLIC;

-- 8. RPC Registro de Nacimientos (register_birth)
CREATE OR REPLACE FUNCTION public.register_birth(
  _box_id     UUID,
  _species_id UUID,
  _line_id    UUID DEFAULT NULL,
  _lot_code   TEXT DEFAULT NULL,
  _unsexed    INT DEFAULT 0,
  _males      INT DEFAULT 0,
  _females    INT DEFAULT 0,
  _notes      TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org UUID := public.get_my_org_id();
  _box RECORD;
  _sp RECORD;
  _line RECORD;
  _tot INT;
  _newLotId UUID;
BEGIN
  IF _org IS NULL OR NOT public.is_org_member() THEN
    RAISE EXCEPTION 'Unauthorized: must be an active organization member';
  END IF;

  _males   := COALESCE(_males, 0);
  _females := COALESCE(_females, 0);
  _unsexed := COALESCE(_unsexed, 0);

  IF _males < 0 OR _females < 0 OR _unsexed < 0 THEN
    RAISE EXCEPTION 'Birth quantities cannot be negative';
  END IF;

  _tot := _males + _females + _unsexed;
  IF _tot <= 0 THEN
    RAISE EXCEPTION 'Total birth population must be greater than zero';
  END IF;

  SELECT * INTO _box FROM public.boxes WHERE id = _box_id AND organization_id = _org;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Box not found in your organization';
  END IF;

  SELECT * INTO _sp FROM public.species WHERE id = _species_id AND organization_id = _org;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Species not found in your organization';
  END IF;

  IF _box.kind <> _sp.kind THEN
    RAISE EXCEPTION 'Box kind (%) does not match species kind (%)', _box.kind, _sp.kind;
  END IF;

  IF _line_id IS NOT NULL THEN
    SELECT * INTO _line FROM public.genetic_lines WHERE id = _line_id AND organization_id = _org AND species_id = _species_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Genetic line not found or does not belong to the selected species in your organization';
    END IF;
  END IF;

  INSERT INTO public.lots (
    owner_id, organization_id, kind, lot_code, lot_type, species_id, line_id, box_id,
    males, females, unsexed, notes, started_at, status
  ) VALUES (
    auth.uid(), _org, _box.kind, NULLIF(TRIM(_lot_code), ''), 'birth'::public.lot_type, _species_id, _line_id, _box_id,
    _males, _females, _unsexed, _notes, CURRENT_DATE, 'active'
  ) RETURNING id INTO _newLotId;

  INSERT INTO public.lot_events (
    organization_id, lot_id, actor_user_id, event_type, males_delta, females_delta, unsexed_delta, notes
  ) VALUES (
    _org, _newLotId, auth.uid(), 'birth'::public.lot_event_type, _males, _females, _unsexed, _notes
  );

  INSERT INTO public.audit_log (organization_id, actor_user_id, action, target_table, target_id, new_values)
  VALUES (_org, auth.uid(), 'birth'::public.audit_action, 'lots', _newLotId, jsonb_build_object('lot_code', _lot_code, 'unsexed', _unsexed, 'males', _males, 'females', _females));

  RETURN _newLotId;
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_birth(UUID, UUID, UUID, TEXT, INT, INT, INT, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.register_birth(UUID, UUID, UUID, TEXT, INT, INT, INT, TEXT) FROM anon, PUBLIC;

-- 9. RPC Movimiento de Lotes (move_lot)
CREATE OR REPLACE FUNCTION public.move_lot(
  _lot_id UUID,
  _new_box_id UUID,
  _notes TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org UUID := public.get_my_org_id();
  _lot RECORD;
  _box RECORD;
BEGIN
  IF _org IS NULL OR NOT public.is_org_member() THEN
    RAISE EXCEPTION 'Unauthorized: must be an active organization member';
  END IF;

  SELECT * INTO _lot FROM public.lots WHERE id = _lot_id AND organization_id = _org AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active lot not found in your organization'; END IF;

  SELECT * INTO _box FROM public.boxes WHERE id = _new_box_id AND organization_id = _org;
  IF NOT FOUND THEN RAISE EXCEPTION 'Destination box not found in your organization'; END IF;

  IF _lot.kind <> _box.kind THEN
    RAISE EXCEPTION 'Destination box kind (%) does not match lot kind (%)', _box.kind, _lot.kind;
  END IF;

  UPDATE public.lots SET box_id = _new_box_id WHERE id = _lot_id;

  INSERT INTO public.lot_events (organization_id, lot_id, actor_user_id, event_type, notes, metadata)
  VALUES (_org, _lot_id, auth.uid(), 'move'::public.lot_event_type, _notes, jsonb_build_object('old_box', _lot.box_id, 'new_box', _new_box_id));

  INSERT INTO public.audit_log (organization_id, actor_user_id, action, target_table, target_id, old_values, new_values)
  VALUES (_org, auth.uid(), 'lot_move'::public.audit_action, 'lots', _lot_id, jsonb_build_object('box_id', _lot.box_id), jsonb_build_object('box_id', _new_box_id));
END;
$$;

GRANT EXECUTE ON FUNCTION public.move_lot(UUID, UUID, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.move_lot(UUID, UUID, TEXT) FROM anon, PUBLIC;

-- 10. RPC División de Lotes (split_lot)
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
  _totM INT := 0; _totF INT := 0; _totU INT := 0; _totMass NUMERIC := 0;
  _remM INT; _remF INT; _remU INT; _remMass NUMERIC;
  _newIds UUID[] := ARRAY[]::UUID[];
  _newIdsJson JSONB := '[]'::jsonb;
  _newId UUID;
BEGIN
  IF _org IS NULL OR NOT public.is_org_member() THEN
    RAISE EXCEPTION 'Unauthorized: must be an active organization member';
  END IF;

  IF _sublots IS NULL OR jsonb_array_length(_sublots) = 0 THEN
    RAISE EXCEPTION 'Sublots array cannot be empty';
  END IF;

  SELECT * INTO _src FROM public.lots WHERE id = _source_lot_id AND organization_id = _org AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Source active lot not found in your organization'; END IF;

  FOR _item IN SELECT * FROM jsonb_array_elements(_sublots) LOOP
    _m    := COALESCE((_item->>'males')::INT, 0);
    _f    := COALESCE((_item->>'females')::INT, 0);
    _u    := COALESCE((_item->>'unsexed')::INT, 0);
    _mass := COALESCE((_item->>'mass_grams')::NUMERIC, 0);
    _box_id := (_item->>'box_id')::UUID;

    IF _m < 0 OR _f < 0 OR _u < 0 OR _mass < 0 THEN
      RAISE EXCEPTION 'Sublot quantities and mass cannot be negative';
    END IF;

    IF (_m + _f + _u + _mass) <= 0 THEN
      RAISE EXCEPTION 'Sublot must have a positive population or mass';
    END IF;

    IF _box_id IS NOT NULL THEN
      SELECT * INTO _dest_box FROM public.boxes WHERE id = _box_id AND organization_id = _org;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Destination box % not found in your organization', _box_id;
      END IF;
      IF _dest_box.kind <> _src.kind THEN
        RAISE EXCEPTION 'Destination box kind (%) does not match source lot kind (%)', _dest_box.kind, _src.kind;
      END IF;
    END IF;

    _totM := _totM + _m;
    _totF := _totF + _f;
    _totU := _totU + _u;
    _totMass := _totMass + _mass;
  END LOOP;

  IF _src.kind = 'rodent' THEN
    IF _totM > COALESCE(_src.males,0) OR _totF > COALESCE(_src.females,0) OR _totU > COALESCE(_src.unsexed,0) THEN
      RAISE EXCEPTION 'Split population totals exceed source lot available population';
    END IF;
  ELSE
    IF _totMass > COALESCE(_src.mass_grams,0) THEN
      RAISE EXCEPTION 'Split mass total exceeds source lot available mass';
    END IF;
  END IF;

  _remM := COALESCE(_src.males,0) - _totM;
  _remF := COALESCE(_src.females,0) - _totF;
  _remU := COALESCE(_src.unsexed,0) - _totU;
  _remMass := COALESCE(_src.mass_grams,0) - _totMass;

  FOR _item IN SELECT * FROM jsonb_array_elements(_sublots) LOOP
    _m    := COALESCE((_item->>'males')::INT, 0);
    _f    := COALESCE((_item->>'females')::INT, 0);
    _u    := COALESCE((_item->>'unsexed')::INT, 0);
    _mass := COALESCE((_item->>'mass_grams')::NUMERIC, 0);

    INSERT INTO public.lots (
      owner_id, organization_id, kind, lot_code, lot_type, species_id, line_id, box_id, parent_lot_id,
      males, females, unsexed, mass_grams, started_at, status, notes
    ) VALUES (
      auth.uid(), _org, _src.kind, NULLIF(TRIM(_item->>'lot_code'), ''), COALESCE((_item->>'lot_type')::public.lot_type, _src.lot_type),
      _src.species_id, _src.line_id, (_item->>'box_id')::UUID, _source_lot_id,
      _m, _f, _u, _mass, _src.started_at, 'active', NULLIF(TRIM(_item->>'notes'), '')
    ) RETURNING id INTO _newId;

    _newIds := array_append(_newIds, _newId);
    _newIdsJson := _newIdsJson || jsonb_build_array(_newId);
  END LOOP;

  UPDATE public.lots SET
    males            = _remM,
    females          = _remF,
    unsexed          = _remU,
    mass_grams       = _remMass,
    children_lot_ids = array_cat(COALESCE(children_lot_ids, ARRAY[]::UUID[]), _newIds),
    status           = CASE WHEN (_src.kind = 'rodent' AND (_remM + _remF + _remU) = 0) OR (_src.kind = 'insect' AND _remMass <= 0) THEN 'finalizado'::public.lot_status ELSE status END,
    finalized_at     = CASE WHEN (_src.kind = 'rodent' AND (_remM + _remF + _remU) = 0) OR (_src.kind = 'insect' AND _remMass <= 0) THEN now() ELSE finalized_at END
  WHERE id = _source_lot_id;

  INSERT INTO public.lot_events (organization_id, lot_id, actor_user_id, event_type, notes, metadata)
  VALUES (_org, _source_lot_id, auth.uid(), 'split'::public.lot_event_type, _reason, jsonb_build_object('created_sublots', _newIdsJson));

  INSERT INTO public.audit_log (organization_id, actor_user_id, action, target_table, target_id, new_values)
  VALUES (_org, auth.uid(), 'lot_split'::public.audit_action, 'lots', _source_lot_id, jsonb_build_object('created_sublot_ids', _newIdsJson, 'reason', _reason));

  RETURN jsonb_build_object('created_lots', _newIdsJson);
END;
$$;

GRANT EXECUTE ON FUNCTION public.split_lot(UUID, JSONB, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.split_lot(UUID, JSONB, TEXT) FROM anon, PUBLIC;

-- 11. Trigger de Límites de Plan (enforce_lot_tier_limits) Corregido
CREATE OR REPLACE FUNCTION public.enforce_lot_tier_limits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tier public.subscription_tier;
  _count int;
  _org UUID;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'active' AND NEW.status = 'active' THEN
      RETURN NEW;
    END IF;
    IF NEW.status <> 'active' THEN
      RETURN NEW;
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'active' THEN
      RETURN NEW;
    END IF;
  END IF;

  _org := NEW.organization_id;
  SELECT tier INTO _tier FROM public.organizations WHERE id = _org;
  IF _tier IS NULL THEN _tier := 'bronze'::public.subscription_tier; END IF;

  SELECT count(*) INTO _count FROM public.lots WHERE organization_id = _org AND status = 'active';

  IF _tier = 'bronze' AND _count >= 5 THEN
    RAISE EXCEPTION 'TIER_LIMIT: Plan Bronze permite máximo 5 lotes activos';
  ELSIF _tier = 'silver' AND _count >= 25 THEN
    RAISE EXCEPTION 'TIER_LIMIT: Plan Silver permite máximo 25 lotes activos';
  ELSIF _tier = 'gold' AND _count >= 100 THEN
    RAISE EXCEPTION 'TIER_LIMIT: Plan Gold permite máximo 100 lotes activos';
  END IF;

  RETURN NEW;
END;
$$;
