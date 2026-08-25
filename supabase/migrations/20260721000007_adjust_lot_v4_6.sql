-- 20260721000007_adjust_lot_v4_6.sql
-- v4.6: RPC adjust_lot endurecida (Admin only, kind-checked, finalización atómica, sin alterar notes, tags auditable)
--       y RPC de diagnóstico get_fifo_signatures restringida a service_role.

BEGIN;

-------------------------------------------------------------------
-- 1. RPC adjust_lot v4.6
-------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.adjust_lot(
  _lot_id     UUID,
  _males      INT     DEFAULT NULL,
  _females    INT     DEFAULT NULL,
  _unsexed    INT     DEFAULT NULL,
  _mass_grams NUMERIC DEFAULT NULL,
  _tags       TEXT[]  DEFAULT NULL,
  _notes      TEXT    DEFAULT ''
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org              UUID := public.get_my_org_id();
  _uid              UUID := auth.uid();
  _lot              RECORD;
  _old_males        INT;
  _old_females      INT;
  _old_unsexed      INT;
  _old_mass         NUMERIC;
  _old_tags         TEXT[];
  _new_males        INT;
  _new_females      INT;
  _new_unsexed      INT;
  _new_mass         NUMERIC;
  _new_tags         TEXT[];
  _new_status       public.lot_status;
  _new_finalized_at TIMESTAMPTZ;
BEGIN
  -- 1. Permisos: Requiere ser Administrador activo de la organización
  IF _org IS NULL OR NOT public.is_org_admin() THEN
    RAISE EXCEPTION 'Acceso denegado: Se requiere ser Administrador activo de la organización.';
  END IF;

  -- 2. Motivo obligatorio
  IF _notes IS NULL OR trim(_notes) = '' THEN
    RAISE EXCEPTION 'Se requiere un motivo (_notes) para el ajuste administrativo.';
  END IF;

  -- 3. Bloqueo del lote
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

  -- 4. Guardar valores anteriores
  _old_males   := COALESCE(_lot.males, 0);
  _old_females := COALESCE(_lot.females, 0);
  _old_unsexed := COALESCE(_lot.unsexed, 0);
  _old_mass    := COALESCE(_lot.mass_grams, 0);
  _old_tags    := COALESCE(_lot.tags, '{}'::text[]);

  -- 5. Validaciones estrictas por tipo de bioterio (kind)
  IF _lot.kind = 'rodent' THEN
    IF _mass_grams IS NOT NULL AND _mass_grams <> _old_mass THEN
      RAISE EXCEPTION 'No se permite modificar la masa en lotes de roedores (kind: rodent).';
    END IF;
  ELSIF _lot.kind = 'insect' THEN
    IF (_males IS NOT NULL AND _males <> _old_males)
       OR (_females IS NOT NULL AND _females <> _old_females)
       OR (_unsexed IS NOT NULL AND _unsexed <> _old_unsexed) THEN
      RAISE EXCEPTION 'No se permite modificar conteos de población en lotes de insectos (kind: insect).';
    END IF;
  END IF;

  -- 6. Calcular nuevos valores
  _new_males   := COALESCE(_males,      _old_males);
  _new_females := COALESCE(_females,    _old_females);
  _new_unsexed := COALESCE(_unsexed,    _old_unsexed);
  _new_mass    := COALESCE(_mass_grams, _old_mass);
  _new_tags    := COALESCE(_tags,       _old_tags);

  -- Validar no negativos y finitud de masa
  IF _new_males < 0 OR _new_females < 0 OR _new_unsexed < 0 THEN
    RAISE EXCEPTION 'Los valores de población no pueden ser negativos.';
  END IF;

  IF _new_mass < 0 OR _new_mass = 'NaN'::numeric
     OR _new_mass = 'Infinity'::numeric OR _new_mass = '-Infinity'::numeric THEN
    RAISE EXCEPTION 'La masa debe ser un número finito no negativo.';
  END IF;

  -- 7. Determinar estado de inventario en cero (Finalización atómica)
  _new_status       := _lot.status;
  _new_finalized_at := _lot.finalized_at;

  IF _lot.kind = 'rodent' AND (_new_males + _new_females + _new_unsexed) = 0 THEN
    _new_status       := 'finalizado'::public.lot_status;
    _new_finalized_at := now();
  ELSIF _lot.kind = 'insect' AND _new_mass = 0 THEN
    _new_status       := 'finalizado'::public.lot_status;
    _new_finalized_at := now();
  END IF;

  -- 8. Actualizar lote (CONSERVA lots.notes ORIGINAL)
  UPDATE public.lots SET
    males        = _new_males,
    females      = _new_females,
    unsexed      = _new_unsexed,
    mass_grams   = _new_mass,
    tags         = _new_tags,
    status       = _new_status,
    finalized_at = _new_finalized_at
  WHERE id = _lot_id;

  -- 9. Registrar evento de historial con event_type = 'adjustment'
  INSERT INTO public.lot_events (
    organization_id, lot_id, actor_user_id, event_type,
    males_delta, females_delta, unsexed_delta, mass_delta,
    notes, metadata
  ) VALUES (
    _org, _lot_id, _uid, 'adjustment'::public.lot_event_type,
    _new_males - _old_males,
    _new_females - _old_females,
    _new_unsexed - _old_unsexed,
    _new_mass - _old_mass,
    _notes,
    jsonb_build_object(
      'type', 'admin_adjustment',
      'old_values', jsonb_build_object('males', _old_males, 'females', _old_females, 'unsexed', _old_unsexed, 'mass_grams', _old_mass, 'tags', _old_tags),
      'new_values', jsonb_build_object('males', _new_males, 'females', _new_females, 'unsexed', _new_unsexed, 'mass_grams', _new_mass, 'tags', _new_tags),
      'reason', _notes,
      'finalized', (_new_status = 'finalizado')
    )
  );

  -- 10. Registrar en audit_log con audit_action = 'inventory_adjustment'
  INSERT INTO public.audit_log (
    organization_id, actor_user_id, action, target_table, target_id,
    old_values, new_values, reason
  ) VALUES (
    _org, _uid, 'inventory_adjustment'::public.audit_action, 'lots', _lot_id,
    jsonb_build_object('males', _old_males, 'females', _old_females, 'unsexed', _old_unsexed, 'mass_grams', _old_mass, 'tags', _old_tags),
    jsonb_build_object('males', _new_males, 'females', _new_females, 'unsexed', _new_unsexed, 'mass_grams', _new_mass, 'tags', _new_tags),
    _notes
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.adjust_lot(UUID, INT, INT, INT, NUMERIC, TEXT[], TEXT) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.adjust_lot(UUID, INT, INT, INT, NUMERIC, TEXT[], TEXT) TO authenticated;

-------------------------------------------------------------------
-- 2. RPC de Diagnóstico get_fifo_signatures (service_role ONLY)
-------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_fifo_signatures()
RETURNS TABLE (
  proname TEXT,
  identity_args TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT p.proname::text, pg_get_function_identity_arguments(p.oid)::text
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('fifo_consume_rodents', 'fifo_consume_insects');
$$;

REVOKE EXECUTE ON FUNCTION public.get_fifo_signatures() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_fifo_signatures() TO service_role;

COMMIT;
