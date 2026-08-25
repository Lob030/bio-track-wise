-- 20260721000002_security_hardening_v4_2.sql
-- Fase de Seguridad Multiusuario v4.2: Endurecimiento de Concurrencia, Expiraciones y Limpieza de Sobrecargas

-- 1. Eliminar completamente las sobrecargas viejas de FIFO que recibían _owner
DROP FUNCTION IF EXISTS public.fifo_consume_rodents(NUMERIC, TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS public.fifo_consume_rodents(NUMERIC, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.fifo_consume_rodents(INT, TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS public.fifo_consume_rodents(INT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.fifo_consume_insects(NUMERIC, TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS public.fifo_consume_insects(NUMERIC, TEXT, TEXT, TEXT);

-- 2. manage_team_member Seguro ante Concurrencia (Bloqueo SELECT FOR UPDATE sobre organizations)
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
  _org_row RECORD;
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

  -- 2. BLOQUEO CONCURRENTE: Bloquear la fila de la organización para serializar conteos de administradores
  SELECT * INTO _org_row
    FROM public.organizations
   WHERE id = _caller_org
   FOR UPDATE;

  -- 3. Buscar al usuario objetivo en la misma organización con FOR UPDATE
  SELECT * INTO _target
    FROM public.user_roles
   WHERE user_id = _target_user_id
     AND organization_id = _caller_org
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El usuario objetivo no pertenece a su organización.';
  END IF;

  -- 4. Auto-protección
  IF _target_user_id = _caller_uid AND _action IN ('suspend', 'revoke') THEN
    RAISE EXCEPTION 'No puede suspenderse ni revocarse a sí mismo.';
  END IF;

  -- 5. Protección del último administrador activo
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

  -- 6. Ejecutar la acción solicitada
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

-- 3. accept_invite Seguro ante Concurrencia, Idempotente e Integridad de Expiración
CREATE OR REPLACE FUNCTION public.accept_invite(_token UUID)
RETURNS VOID
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
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;

  -- 1. Bloqueo FOR UPDATE de la invitación
  SELECT * INTO _invite
    FROM public.organization_invites
   WHERE token = _token
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Token de invitación inválido.';
  END IF;

  -- IDEMPOTENCIA: Si la invitación ya fue aceptada por este mismo usuario, terminar con éxito silencioso
  IF _invite.status = 'accepted' AND _invite.accepted_by = _uid THEN
    RETURN;
  END IF;

  -- Manejo de Expiración
  IF _invite.expires_at <= now() THEN
    UPDATE public.organization_invites
       SET status = 'expired'
     WHERE id = _invite.id;
    RAISE EXCEPTION 'La invitación ha expirado.';
  END IF;

  IF _invite.status <> 'pending' THEN
    RAISE EXCEPTION 'La invitación ya no está pendiente (Estado: %).', _invite.status;
  END IF;

  IF _email IS NULL OR lower(_email) <> lower(_invite.email) THEN
    RAISE EXCEPTION 'El correo autenticado (%) no coincide con el correo invitado (%).', COALESCE(_email, 'desconocido'), _invite.email;
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
    RAISE EXCEPTION 'El usuario ya pertenece a otra organización activa.';
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
END;
$$;

REVOKE EXECUTE ON FUNCTION public.accept_invite(UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.accept_invite(UUID) TO authenticated;

-- 4. FIFO Sales Functions con filtrado explícito de Kind y Especie
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
  _sp RECORD;
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

  SELECT * INTO _sp FROM public.species WHERE id = _species AND organization_id = _org AND kind = 'rodent';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rodent species % not found in your organization.', _species;
  END IF;

  FOR _lot IN
    SELECT * FROM public.lots
     WHERE organization_id = _org
       AND species_id = _species
       AND kind = 'rodent'
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
  _org UUID := public.get_my_org_id();
  _sp RECORD;
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

  SELECT * INTO _sp FROM public.species WHERE id = _species AND organization_id = _org AND kind = 'insect';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insect species % not found in your organization.', _species;
  END IF;

  FOR _lot IN
    SELECT * FROM public.lots
     WHERE organization_id = _org
       AND species_id = _species
       AND kind = 'insect'
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
