-- BioTrack v4.8: cierre de seguridad multiusuario.

BEGIN;

-- El rol historico "user" representa al operador. Renombrarlo conserva el
-- valor interno del enum y actualiza las filas existentes sin reescritura.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'app_role' AND e.enumlabel = 'user'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'app_role' AND e.enumlabel = 'operator'
  ) THEN
    ALTER TYPE public.app_role RENAME VALUE 'user' TO 'operator';
  END IF;
END
$$;

ALTER TABLE public.organization_invites
  ALTER COLUMN role SET DEFAULT 'operator'::public.app_role;

-- La membresia es la fuente de verdad. profiles.organization_id queda como
-- dato sincronizado para compatibilidad, pero no decide permisos.
CREATE OR REPLACE FUNCTION public.get_my_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ur.organization_id
  FROM public.user_roles ur
  WHERE ur.user_id = auth.uid()
    AND ur.status = 'active'
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_org_member()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.status = 'active'
      AND ur.organization_id IS NOT NULL
  )
$$;

CREATE OR REPLACE FUNCTION public.is_org_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.status = 'active'
      AND ur.role = 'admin'
      AND ur.organization_id IS NOT NULL
  )
$$;

CREATE OR REPLACE FUNCTION public.is_org_operator()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.status = 'active'
      AND ur.role = 'operator'
      AND ur.organization_id IS NOT NULL
  )
$$;

REVOKE ALL ON FUNCTION public.get_my_org_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_org_member() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_org_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_org_operator() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_org_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_member() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_operator() TO authenticated;

-- Solo se permiten cambios de perfil no privilegiados desde el cliente.
DROP POLICY IF EXISTS "profile_self_update" ON public.profiles;
CREATE POLICY "profile_self_update"
ON public.profiles
FOR UPDATE
USING (
  id = auth.uid()
  AND public.is_org_member()
)
WITH CHECK (
  id = auth.uid()
  AND organization_id = public.get_my_org_id()
);

REVOKE UPDATE ON TABLE public.profiles FROM authenticated;
GRANT UPDATE (full_name, preferred_theme) ON TABLE public.profiles TO authenticated;

-- Defensa adicional: estas tablas solo cambian mediante RPCs o funciones de
-- servidor revisadas. RLS sigue controlando sus lecturas.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.user_roles FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.organization_invites FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.audit_log FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.lot_events FROM authenticated;

-- Asignar organizacion y propietario usando la membresia activa.
CREATE OR REPLACE FUNCTION public.set_org_and_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org UUID := public.get_my_org_id();
BEGIN
  IF auth.uid() IS NULL OR _org IS NULL OR NOT public.is_org_member() THEN
    RAISE EXCEPTION 'No existe una membresia activa para crear datos.';
  END IF;

  NEW.owner_id := auth.uid();
  NEW.organization_id := _org;
  RETURN NEW;
END;
$$;

-- La autorizacion y la creacion de la invitacion ocurren juntas en la base.
CREATE OR REPLACE FUNCTION public.create_organization_invite(
  _email TEXT,
  _role public.app_role DEFAULT 'operator'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _org UUID;
  _normalized_email TEXT := lower(trim(_email));
  _invite public.organization_invites%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'No autenticado.';
  END IF;

  SELECT ur.organization_id
  INTO _org
  FROM public.user_roles ur
  WHERE ur.user_id = _uid
    AND ur.role = 'admin'
    AND ur.status = 'active'
  FOR UPDATE;

  IF _org IS NULL THEN
    RAISE EXCEPTION 'Acceso denegado: se requiere un administrador activo.';
  END IF;

  IF _role <> 'operator'::public.app_role THEN
    RAISE EXCEPTION 'Las invitaciones nuevas solo pueden crear operadores.';
  END IF;

  IF length(_normalized_email) > 320
     OR _normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'Correo electronico no valido.';
  END IF;

  INSERT INTO public.organization_invites (
    organization_id, email, role, status, invited_by
  ) VALUES (
    _org, _normalized_email, 'operator', 'pending', _uid
  )
  RETURNING * INTO _invite;

  INSERT INTO public.audit_log (
    organization_id, actor_user_id, action, target_table, target_id, payload
  ) VALUES (
    _org, _uid, 'invite_sent', 'organization_invites', _invite.id,
    jsonb_build_object('email', _normalized_email, 'role', 'operator')
  );

  RETURN jsonb_build_object(
    'token', _invite.token,
    'email', _normalized_email,
    'organization_id', _org,
    'role', 'operator'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_organization_invite(TEXT, public.app_role)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_organization_invite(TEXT, public.app_role)
  TO authenticated;

COMMIT;
