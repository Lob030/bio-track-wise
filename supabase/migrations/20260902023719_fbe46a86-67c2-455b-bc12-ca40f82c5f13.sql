-- 20260720000004_rpcs_triggers.sql
-- Fase 4: Triggers de Seguridad, RPCs Transaccionales e Integridad

-- 1. Trigger BEFORE INSERT: Forzar organization_id y owner_id en escrituras de clientes
CREATE OR REPLACE FUNCTION public.set_org_and_owner()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _org UUID;
BEGIN
  _org := (SELECT organization_id FROM public.profiles WHERE id = auth.uid());
  IF _org IS NULL THEN
    RAISE EXCEPTION 'El usuario no pertenece a ninguna organización activa.';
  END IF;
  NEW.owner_id := auth.uid();
  NEW.organization_id := _org;
  RETURN NEW;
END; $$;

-- 2. Trigger BEFORE UPDATE: Impedir cambios directos a organization_id y owner_id
CREATE OR REPLACE FUNCTION public.prevent_org_and_owner_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
      RAISE EXCEPTION 'No se permite modificar organization_id desde el cliente.';
    END IF;
    IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
      RAISE EXCEPTION 'No se permite modificar owner_id desde el cliente.';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

-- 3. Trigger en organizations: Proteger tier y ownership
CREATE OR REPLACE FUNCTION public.prevent_organization_privilege_escalation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    IF NEW.tier IS DISTINCT FROM OLD.tier
       OR NEW.tier_renewed_at IS DISTINCT FROM OLD.tier_renewed_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
      RAISE EXCEPTION 'No se permite modificar el plan o propietario de la organización desde el cliente.';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS prevent_organization_privilege_escalation_trg ON public.organizations;
CREATE TRIGGER prevent_organization_privilege_escalation_trg
BEFORE UPDATE ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.prevent_organization_privilege_escalation();

-- 4. Vincular triggers en las 15 tablas operativas
DO $$
DECLARE _tbl TEXT;
BEGIN
  FOREACH _tbl IN ARRAY ARRAY[
    'species','genetic_lines','boxes','lots',
    'warehouse_food','warehouse_cleaning','warehouse_tools',
    'warehouse_packaging','warehouse_purchases',
    'clients','orders','order_items','order_item_allocations',
    'alert_rules','alerts'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_org_and_owner_trg ON public.%I', _tbl);
    EXECUTE format('CREATE TRIGGER set_org_and_owner_trg BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_org_and_owner()', _tbl);

    EXECUTE format('DROP TRIGGER IF EXISTS prevent_org_and_owner_change_trg ON public.%I', _tbl);
    EXECUTE format('CREATE TRIGGER prevent_org_and_owner_change_trg BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.prevent_org_and_owner_change()', _tbl);
  END LOOP;
END $$;

-- 5. Restricciones CHECK
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_lots_males') THEN
    ALTER TABLE public.lots ADD CONSTRAINT ck_lots_males CHECK (COALESCE(males,0) >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_lots_females') THEN
    ALTER TABLE public.lots ADD CONSTRAINT ck_lots_females CHECK (COALESCE(females,0) >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_lots_unsexed') THEN
    ALTER TABLE public.lots ADD CONSTRAINT ck_lots_unsexed CHECK (COALESCE(unsexed,0) >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_lots_mass') THEN
    ALTER TABLE public.lots ADD CONSTRAINT ck_lots_mass CHECK (COALESCE(mass_grams,0) >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_lots_deaths') THEN
    ALTER TABLE public.lots ADD CONSTRAINT ck_lots_deaths CHECK (COALESCE(total_deaths,0) >= 0);
  END IF;
END $$;

-- 6. RPC: register_mortality
CREATE OR REPLACE FUNCTION public.register_mortality(
  _lot_id   UUID,
  _males    INT DEFAULT 0,
  _females  INT DEFAULT 0,
  _unsexed  INT DEFAULT 0,
  _notes    TEXT DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _org UUID := public.get_my_org_id();
  _lot RECORD;
  _new_males INT; _new_females INT; _new_unsexed INT;
  _tot INT;
  _eventId UUID;
BEGIN
  IF _org IS NULL OR NOT public.is_org_member() THEN
    RAISE EXCEPTION 'Unauthorized: must be an active organization member';
  END IF;

  SELECT * INTO _lot FROM public.lots WHERE id = _lot_id AND organization_id = _org AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lot not found or not active';
  END IF;

  IF _males > COALESCE(_lot.males,0) OR _females > COALESCE(_lot.females,0) OR _unsexed > COALESCE(_lot.unsexed,0) THEN
    RAISE EXCEPTION 'Mortality exceeds available population';
  END IF;

  _new_males := COALESCE(_lot.males,0) - _males;
  _new_females := COALESCE(_lot.females,0) - _females;
  _new_unsexed := COALESCE(_lot.unsexed,0) - _unsexed;
  _tot := _new_males + _new_females + _new_unsexed;

  UPDATE public.lots SET
    males = _new_males, females = _new_females, unsexed = _new_unsexed,
    total_deaths = COALESCE(total_deaths,0) + (_males + _females + _unsexed),
    status = CASE WHEN _tot = 0 THEN 'finalizado'::public.lot_status ELSE status END,
    finalized_at = CASE WHEN _tot = 0 THEN now() ELSE finalized_at END
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
END; $$;

GRANT EXECUTE ON FUNCTION public.register_mortality(UUID, INT, INT, INT, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.register_mortality(UUID, INT, INT, INT, TEXT) FROM anon, PUBLIC;

-- 7. RPC: register_birth
CREATE OR REPLACE FUNCTION public.register_birth(
  _box_id     UUID,
  _species_id UUID,
  _line_id    UUID DEFAULT NULL,
  _lot_code   TEXT DEFAULT NULL,
  _unsexed    INT DEFAULT 0,
  _males      INT DEFAULT 0,
  _females    INT DEFAULT 0,
  _notes      TEXT DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _org UUID := public.get_my_org_id();
  _box RECORD;
  _newLotId UUID;
BEGIN
  IF _org IS NULL OR NOT public.is_org_member() THEN
    RAISE EXCEPTION 'Unauthorized: must be an active organization member';
  END IF;

  SELECT * INTO _box FROM public.boxes WHERE id = _box_id AND organization_id = _org;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Box not found in organization';
  END IF;

  INSERT INTO public.lots (
    owner_id, organization_id, kind, lot_code, lot_type, species_id, line_id, box_id,
    males, females, unsexed, notes, started_at, status
  ) VALUES (
    auth.uid(), _org, _box.kind, _lot_code, 'birth'::public.lot_type, _species_id, _line_id, _box_id,
    _males, _females, _unsexed, _notes, CURRENT_DATE, 'active'
  ) RETURNING id INTO _newLotId;

  INSERT INTO public.lot_events (
    organization_id, lot_id, actor_user_id, event_type, males_delta, females_delta, unsexed_delta, notes
  ) VALUES (
    _org, _newLotId, auth.uid(), 'birth'::public.lot_event_type, _males, _females, _unsexed, _notes
  );

  INSERT INTO public.audit_log (organization_id, actor_user_id, action, target_table, target_id, new_values)
  VALUES (_org, auth.uid(), 'birth'::public.audit_action, 'lots', _newLotId, jsonb_build_object('lot_code', _lot_code, 'unsexed', _unsexed));

  RETURN _newLotId;
END; $$;

GRANT EXECUTE ON FUNCTION public.register_birth(UUID, UUID, UUID, TEXT, INT, INT, INT, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.register_birth(UUID, UUID, UUID, TEXT, INT, INT, INT, TEXT) FROM anon, PUBLIC;

-- 8. RPC: move_lot
CREATE OR REPLACE FUNCTION public.move_lot(
  _lot_id UUID,
  _new_box_id UUID,
  _notes TEXT DEFAULT NULL
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _org UUID := public.get_my_org_id();
  _old_box UUID;
BEGIN
  IF _org IS NULL OR NOT public.is_org_member() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT box_id INTO _old_box FROM public.lots WHERE id = _lot_id AND organization_id = _org;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lot not found'; END IF;

  PERFORM 1 FROM public.boxes WHERE id = _new_box_id AND organization_id = _org;
  IF NOT FOUND THEN RAISE EXCEPTION 'New box not found in organization'; END IF;

  UPDATE public.lots SET box_id = _new_box_id WHERE id = _lot_id;

  INSERT INTO public.lot_events (organization_id, lot_id, actor_user_id, event_type, notes, metadata)
  VALUES (_org, _lot_id, auth.uid(), 'move'::public.lot_event_type, _notes, jsonb_build_object('old_box', _old_box, 'new_box', _new_box_id));
END; $$;

GRANT EXECUTE ON FUNCTION public.move_lot(UUID, UUID, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.move_lot(UUID, UUID, TEXT) FROM anon, PUBLIC;

-- 9. RPC: split_lot
CREATE OR REPLACE FUNCTION public.split_lot(
  _source_lot_id UUID,
  _sublots JSONB,
  _reason TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _org UUID := public.get_my_org_id();
  _src RECORD;
  _item JSONB;
  _m INT; _f INT; _u INT; _mass NUMERIC;
  _totM INT := 0; _totF INT := 0; _totU INT := 0; _totMass NUMERIC := 0;
  _newIds JSONB := '[]'::jsonb;
  _newId UUID;
BEGIN
  IF _org IS NULL OR NOT public.is_org_member() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO _src FROM public.lots WHERE id = _source_lot_id AND organization_id = _org AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Source lot not found or not active'; END IF;

  FOR _item IN SELECT * FROM jsonb_array_elements(_sublots) LOOP
    _m := COALESCE((_item->>'males')::INT, 0);
    _f := COALESCE((_item->>'females')::INT, 0);
    _u := COALESCE((_item->>'unsexed')::INT, 0);
    _mass := COALESCE((_item->>'mass_grams')::NUMERIC, 0);
    _totM := _totM + _m; _totF := _totF + _f; _totU := _totU + _u; _totMass := _totMass + _mass;
  END LOOP;

  IF _totM > COALESCE(_src.males,0) OR _totF > COALESCE(_src.females,0) OR _totU > COALESCE(_src.unsexed,0) OR _totMass > COALESCE(_src.mass_grams,0) THEN
    RAISE EXCEPTION 'Split totals exceed available population or mass';
  END IF;

  UPDATE public.lots SET
    males = COALESCE(males,0) - _totM,
    females = COALESCE(females,0) - _totF,
    unsexed = COALESCE(unsexed,0) - _totU,
    mass_grams = COALESCE(mass_grams,0) - _totMass
  WHERE id = _source_lot_id;

  FOR _item IN SELECT * FROM jsonb_array_elements(_sublots) LOOP
    INSERT INTO public.lots (
      owner_id, organization_id, kind, lot_code, lot_type, species_id, line_id, box_id, parent_lot_id,
      males, females, unsexed, mass_grams, started_at, status, notes
    ) VALUES (
      auth.uid(), _org, _src.kind, _item->>'lot_code', COALESCE((_item->>'lot_type')::public.lot_type, _src.lot_type),
      _src.species_id, _src.line_id, (_item->>'box_id')::UUID, _source_lot_id,
      COALESCE((_item->>'males')::INT,0), COALESCE((_item->>'females')::INT,0), COALESCE((_item->>'unsexed')::INT,0),
      COALESCE((_item->>'mass_grams')::NUMERIC,0), _src.started_at, 'active', _item->>'notes'
    ) RETURNING id INTO _newId;

    _newIds := _newIds || jsonb_build_array(_newId);
  END LOOP;

  INSERT INTO public.lot_events (organization_id, lot_id, actor_user_id, event_type, notes, metadata)
  VALUES (_org, _source_lot_id, auth.uid(), 'split'::public.lot_event_type, _reason, jsonb_build_object('created_sublots', _newIds));

  RETURN jsonb_build_object('created_lots', _newIds);
END; $$;

GRANT EXECUTE ON FUNCTION public.split_lot(UUID, JSONB, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.split_lot(UUID, JSONB, TEXT) FROM anon, PUBLIC;

-- 10. RPC: acknowledge_alert
CREATE OR REPLACE FUNCTION public.acknowledge_alert(_alert_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _org UUID := public.get_my_org_id();
BEGIN
  IF _org IS NULL OR NOT public.is_org_member() THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  UPDATE public.alerts SET acknowledged = true WHERE id = _alert_id AND organization_id = _org;
END; $$;

GRANT EXECUTE ON FUNCTION public.acknowledge_alert(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.acknowledge_alert(UUID) FROM anon, PUBLIC;

-- 11. Actualizar enforce_lot_tier_limits para usar organizations.tier
CREATE OR REPLACE FUNCTION public.enforce_lot_tier_limits()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _tier public.subscription_tier;
  _count int;
  _org UUID;
BEGIN
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
END; $$;