-- BioTrack: tipos de caja, sustratos y costos de produccion trazables.

BEGIN;

CREATE TABLE public.box_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  code text NOT NULL,
  name text NOT NULL,
  kind public.kind_type NOT NULL,
  length_cm numeric(10,2),
  width_cm numeric(10,2),
  height_cm numeric(10,2),
  usable_volume_liters numeric(10,2),
  material text,
  max_population int,
  max_biomass_grams numeric(12,2),
  life_stages text[] NOT NULL DEFAULT '{}',
  ventilation text,
  lid_type text,
  temperature_min_c numeric(5,2),
  temperature_max_c numeric(5,2),
  humidity_min_pct numeric(5,2),
  humidity_max_pct numeric(5,2),
  cleaning_interval_days int,
  useful_life_days int,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT box_types_code_not_blank CHECK (trim(code) <> ''),
  CONSTRAINT box_types_name_not_blank CHECK (trim(name) <> ''),
  CONSTRAINT box_types_dimensions_positive CHECK (
    (length_cm IS NULL OR length_cm > 0) AND
    (width_cm IS NULL OR width_cm > 0) AND
    (height_cm IS NULL OR height_cm > 0) AND
    (usable_volume_liters IS NULL OR usable_volume_liters > 0)
  ),
  CONSTRAINT box_types_capacity_valid CHECK (
    (kind = 'rodent' AND max_population IS NOT NULL AND max_population > 0 AND max_biomass_grams IS NULL)
    OR
    (kind = 'insect' AND max_biomass_grams IS NOT NULL AND max_biomass_grams > 0 AND max_population IS NULL)
  ),
  CONSTRAINT box_types_environment_valid CHECK (
    (temperature_min_c IS NULL OR temperature_max_c IS NULL OR temperature_min_c <= temperature_max_c)
    AND (humidity_min_pct IS NULL OR humidity_min_pct BETWEEN 0 AND 100)
    AND (humidity_max_pct IS NULL OR humidity_max_pct BETWEEN 0 AND 100)
    AND (humidity_min_pct IS NULL OR humidity_max_pct IS NULL OR humidity_min_pct <= humidity_max_pct)
  ),
  CONSTRAINT box_types_intervals_positive CHECK (
    (cleaning_interval_days IS NULL OR cleaning_interval_days > 0)
    AND (useful_life_days IS NULL OR useful_life_days > 0)
  ),
  CONSTRAINT box_types_org_id_uidx UNIQUE (organization_id, id),
  CONSTRAINT box_types_org_id_kind_uidx UNIQUE (organization_id, id, kind)
);

CREATE UNIQUE INDEX box_types_org_code_uidx
  ON public.box_types (organization_id, lower(trim(code)));
CREATE INDEX box_types_org_kind_active_idx
  ON public.box_types (organization_id, kind, active, name);

CREATE TABLE public.substrates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  code text NOT NULL,
  name text NOT NULL,
  stock_grams numeric(14,2) NOT NULL DEFAULT 0,
  minimum_stock_grams numeric(14,2) NOT NULL DEFAULT 0,
  average_cost_per_kg numeric(14,4) NOT NULL DEFAULT 0,
  supplier text,
  batch_code text,
  expires_at date,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT substrates_code_not_blank CHECK (trim(code) <> ''),
  CONSTRAINT substrates_name_not_blank CHECK (trim(name) <> ''),
  CONSTRAINT substrates_stock_nonnegative CHECK (stock_grams >= 0),
  CONSTRAINT substrates_minimum_nonnegative CHECK (minimum_stock_grams >= 0),
  CONSTRAINT substrates_cost_nonnegative CHECK (average_cost_per_kg >= 0),
  CONSTRAINT substrates_org_id_uidx UNIQUE (organization_id, id)
);

CREATE UNIQUE INDEX substrates_org_code_uidx
  ON public.substrates (organization_id, lower(trim(code)));
CREATE INDEX substrates_org_active_idx
  ON public.substrates (organization_id, active, name);

CREATE TABLE public.box_substrate_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  box_type_id uuid NOT NULL,
  substrate_id uuid NOT NULL,
  setup_grams numeric(12,2) NOT NULL DEFAULT 0,
  replacement_grams numeric(12,2) NOT NULL DEFAULT 0,
  replacement_interval_days int,
  waste_pct numeric(5,2) NOT NULL DEFAULT 0,
  optional boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT box_substrate_rules_box_type_fkey FOREIGN KEY (organization_id, box_type_id)
    REFERENCES public.box_types (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT box_substrate_rules_substrate_fkey FOREIGN KEY (organization_id, substrate_id)
    REFERENCES public.substrates (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT box_substrate_rules_amount_valid CHECK (setup_grams >= 0 AND replacement_grams >= 0),
  CONSTRAINT box_substrate_rules_interval_valid CHECK (replacement_interval_days IS NULL OR replacement_interval_days > 0),
  CONSTRAINT box_substrate_rules_waste_valid CHECK (waste_pct BETWEEN 0 AND 100),
  CONSTRAINT box_substrate_rules_unique UNIQUE (organization_id, box_type_id, substrate_id)
);

ALTER TABLE public.boxes
  ADD COLUMN box_type_id uuid,
  ADD COLUMN capacity_override boolean NOT NULL DEFAULT false,
  ADD COLUMN acquired_at date,
  ADD COLUMN status text NOT NULL DEFAULT 'active',
  ADD COLUMN notes text;

ALTER TABLE public.boxes
  ADD CONSTRAINT boxes_type_same_org_kind_fkey
    FOREIGN KEY (organization_id, box_type_id, kind)
    REFERENCES public.box_types (organization_id, id, kind) ON DELETE RESTRICT,
  ADD CONSTRAINT boxes_status_valid CHECK (status IN ('active', 'maintenance', 'retired'));

CREATE INDEX boxes_box_type_idx ON public.boxes (box_type_id) WHERE box_type_id IS NOT NULL;

CREATE TABLE public.substrate_inventory_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  substrate_id uuid NOT NULL,
  event_type text NOT NULL,
  event_at timestamptz NOT NULL DEFAULT now(),
  grams_delta numeric(14,2) NOT NULL,
  balance_before_grams numeric(14,2) NOT NULL,
  balance_after_grams numeric(14,2) NOT NULL,
  unit_cost_per_kg numeric(14,4) NOT NULL,
  total_cost numeric(14,4) NOT NULL,
  box_id uuid,
  lot_id uuid,
  reason text,
  observations text,
  evidence_url text,
  reference_type text,
  reference_id text,
  request_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT substrate_events_substrate_fkey FOREIGN KEY (organization_id, substrate_id)
    REFERENCES public.substrates (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT substrate_events_box_fkey FOREIGN KEY (organization_id, box_id)
    REFERENCES public.boxes (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT substrate_events_lot_fkey FOREIGN KEY (organization_id, lot_id)
    REFERENCES public.lots (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT substrate_events_type_valid CHECK (event_type IN ('opening', 'purchase', 'setup', 'replacement', 'waste', 'adjustment')),
  CONSTRAINT substrate_events_balance_valid CHECK (balance_before_grams >= 0 AND balance_after_grams >= 0),
  CONSTRAINT substrate_events_cost_valid CHECK (unit_cost_per_kg >= 0 AND total_cost >= 0),
  CONSTRAINT substrate_events_delta_valid CHECK (grams_delta <> 0 OR event_type = 'opening'),
  CONSTRAINT substrate_events_url_valid CHECK (evidence_url IS NULL OR evidence_url ~* '^https?://'),
  CONSTRAINT substrate_events_request_uidx UNIQUE (organization_id, request_id),
  CONSTRAINT substrate_events_org_id_uidx UNIQUE (organization_id, id)
);

CREATE INDEX substrate_events_org_date_idx
  ON public.substrate_inventory_events (organization_id, event_at DESC, event_type);
CREATE INDEX substrate_events_lot_idx
  ON public.substrate_inventory_events (lot_id, event_at DESC) WHERE lot_id IS NOT NULL;

CREATE TABLE public.box_service_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  box_id uuid NOT NULL,
  lot_id uuid,
  event_type text NOT NULL,
  event_at timestamptz NOT NULL DEFAULT now(),
  substrate_event_id uuid,
  observations text,
  evidence_url text,
  request_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT box_service_box_fkey FOREIGN KEY (organization_id, box_id)
    REFERENCES public.boxes (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT box_service_lot_fkey FOREIGN KEY (organization_id, lot_id)
    REFERENCES public.lots (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT box_service_substrate_event_fkey FOREIGN KEY (organization_id, substrate_event_id)
    REFERENCES public.substrate_inventory_events(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT box_service_type_valid CHECK (event_type IN ('preparation', 'substrate_replacement', 'substrate_waste', 'cleaning', 'disinfection', 'maintenance')),
  CONSTRAINT box_service_url_valid CHECK (evidence_url IS NULL OR evidence_url ~* '^https?://'),
  CONSTRAINT box_service_request_uidx UNIQUE (organization_id, request_id)
);

CREATE INDEX box_service_org_box_date_idx
  ON public.box_service_events (organization_id, box_id, event_at DESC);

CREATE TABLE public.lot_cost_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  lot_id uuid NOT NULL,
  category text NOT NULL,
  amount numeric(14,4) NOT NULL,
  source_table text NOT NULL,
  source_id uuid NOT NULL,
  incurred_at timestamptz NOT NULL DEFAULT now(),
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lot_cost_lot_fkey FOREIGN KEY (organization_id, lot_id)
    REFERENCES public.lots (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT lot_cost_category_valid CHECK (category IN ('substrate', 'feed', 'labor', 'utilities', 'other')),
  CONSTRAINT lot_cost_amount_nonnegative CHECK (amount >= 0),
  CONSTRAINT lot_cost_source_unique UNIQUE (organization_id, source_table, source_id, lot_id)
);

CREATE INDEX lot_cost_org_lot_date_idx
  ON public.lot_cost_allocations (organization_id, lot_id, incurred_at DESC);

-- Organizacion y propietario siempre se toman de la membresia activa.
DO $$
DECLARE _table text;
BEGIN
  FOREACH _table IN ARRAY ARRAY['box_types', 'substrates', 'box_substrate_rules'] LOOP
    EXECUTE format('CREATE TRIGGER set_org_and_owner_trg BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_org_and_owner()', _table);
    EXECUTE format('CREATE TRIGGER prevent_org_and_owner_change_trg BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.prevent_org_and_owner_change()', _table);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_substrate_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(auth.role(), '') = 'service_role' THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.stock_grams <> 0 OR NEW.average_cost_per_kg <> 0 THEN
      RAISE EXCEPTION 'El saldo inicial debe ser cero; registra existencias mediante la operacion transaccional.';
    END IF;
  ELSIF (
    NEW.stock_grams IS DISTINCT FROM OLD.stock_grams
    OR NEW.average_cost_per_kg IS DISTINCT FROM OLD.average_cost_per_kg
  ) AND current_setting('app.substrate_inventory_write', true) IS DISTINCT FROM 'allowed' THEN
    RAISE EXCEPTION 'El saldo y costo del sustrato solo pueden cambiar mediante una operacion transaccional.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_substrate_balance_trg
BEFORE INSERT OR UPDATE ON public.substrates
FOR EACH ROW EXECUTE FUNCTION public.protect_substrate_balance();

REVOKE ALL ON FUNCTION public.protect_substrate_balance() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.box_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.substrates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.box_substrate_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.substrate_inventory_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.box_service_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lot_cost_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY box_types_select_member ON public.box_types FOR SELECT
  USING (organization_id = public.get_my_org_id() AND public.is_org_member());
CREATE POLICY box_types_admin_all ON public.box_types FOR ALL
  USING (organization_id = public.get_my_org_id() AND public.is_org_admin())
  WITH CHECK (organization_id = public.get_my_org_id() AND public.is_org_admin());

CREATE POLICY substrates_select_member ON public.substrates FOR SELECT
  USING (organization_id = public.get_my_org_id() AND public.is_org_member());
CREATE POLICY substrates_admin_all ON public.substrates FOR ALL
  USING (organization_id = public.get_my_org_id() AND public.is_org_admin())
  WITH CHECK (organization_id = public.get_my_org_id() AND public.is_org_admin());

CREATE POLICY box_substrate_rules_select_member ON public.box_substrate_rules FOR SELECT
  USING (organization_id = public.get_my_org_id() AND public.is_org_member());
CREATE POLICY box_substrate_rules_admin_all ON public.box_substrate_rules FOR ALL
  USING (organization_id = public.get_my_org_id() AND public.is_org_admin())
  WITH CHECK (organization_id = public.get_my_org_id() AND public.is_org_admin());

CREATE POLICY substrate_events_select_member ON public.substrate_inventory_events FOR SELECT
  USING (organization_id = public.get_my_org_id() AND public.is_org_member());
CREATE POLICY box_service_select_member ON public.box_service_events FOR SELECT
  USING (organization_id = public.get_my_org_id() AND public.is_org_member());
CREATE POLICY lot_cost_select_member ON public.lot_cost_allocations FOR SELECT
  USING (organization_id = public.get_my_org_id() AND public.is_org_member());

-- Los operadores pueden registrar y actualizar cajas fisicas. Los catalogos y
-- la eliminacion de cajas siguen siendo exclusivos de administradores.
CREATE POLICY boxes_write_member ON public.boxes FOR INSERT
  WITH CHECK (organization_id = public.get_my_org_id() AND public.is_org_member());
CREATE POLICY boxes_update_member ON public.boxes FOR UPDATE
  USING (organization_id = public.get_my_org_id() AND public.is_org_member())
  WITH CHECK (organization_id = public.get_my_org_id() AND public.is_org_member());

REVOKE INSERT, UPDATE, DELETE ON public.substrate_inventory_events, public.box_service_events, public.lot_cost_allocations FROM authenticated, anon;
GRANT SELECT ON public.box_types, public.substrates, public.box_substrate_rules, public.substrate_inventory_events, public.box_service_events, public.lot_cost_allocations TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.box_types, public.substrates, public.box_substrate_rules TO authenticated;

CREATE OR REPLACE FUNCTION public.create_box_type_tx(
  _request_id uuid,
  _data jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org uuid := public.get_my_org_id();
  _uid uuid := auth.uid();
  _cached jsonb;
  _type public.box_types%ROWTYPE;
  _substrate_id uuid := NULLIF(_data->>'substrate_id', '')::uuid;
  _result jsonb;
BEGIN
  _cached := public.begin_transaction_request(_request_id, 'box_type:create');
  IF _cached IS NOT NULL THEN RETURN _cached; END IF;
  IF _org IS NULL OR _uid IS NULL OR NOT public.is_org_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede configurar tipos de caja.';
  END IF;

  INSERT INTO public.box_types (
    organization_id, owner_id, code, name, kind,
    length_cm, width_cm, height_cm, usable_volume_liters, material,
    max_population, max_biomass_grams, life_stages, ventilation, lid_type,
    temperature_min_c, temperature_max_c, humidity_min_pct, humidity_max_pct,
    cleaning_interval_days, useful_life_days, notes
  ) VALUES (
    _org, _uid, trim(_data->>'code'), trim(_data->>'name'), (_data->>'kind')::public.kind_type,
    NULLIF(_data->>'length_cm', '')::numeric, NULLIF(_data->>'width_cm', '')::numeric,
    NULLIF(_data->>'height_cm', '')::numeric, NULLIF(_data->>'usable_volume_liters', '')::numeric,
    NULLIF(trim(_data->>'material'), ''),
    NULLIF(_data->>'max_population', '')::int, NULLIF(_data->>'max_biomass_grams', '')::numeric,
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(_data->'life_stages', '[]'::jsonb))), '{}'),
    NULLIF(trim(_data->>'ventilation'), ''), NULLIF(trim(_data->>'lid_type'), ''),
    NULLIF(_data->>'temperature_min_c', '')::numeric, NULLIF(_data->>'temperature_max_c', '')::numeric,
    NULLIF(_data->>'humidity_min_pct', '')::numeric, NULLIF(_data->>'humidity_max_pct', '')::numeric,
    NULLIF(_data->>'cleaning_interval_days', '')::int, NULLIF(_data->>'useful_life_days', '')::int,
    NULLIF(trim(_data->>'notes'), '')
  ) RETURNING * INTO _type;

  IF _substrate_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.substrates WHERE id = _substrate_id AND organization_id = _org AND active) THEN
      RAISE EXCEPTION 'El sustrato seleccionado no existe o esta inactivo.';
    END IF;
    INSERT INTO public.box_substrate_rules (
      organization_id, owner_id, box_type_id, substrate_id,
      setup_grams, replacement_grams, replacement_interval_days, waste_pct, optional
    ) VALUES (
      _org, _uid, _type.id, _substrate_id,
      COALESCE(NULLIF(_data->>'setup_grams', '')::numeric, 0),
      COALESCE(NULLIF(_data->>'replacement_grams', '')::numeric, 0),
      NULLIF(_data->>'replacement_interval_days', '')::int,
      COALESCE(NULLIF(_data->>'waste_pct', '')::numeric, 0),
      COALESCE((_data->>'substrate_optional')::boolean, false)
    );
  END IF;

  _result := jsonb_build_object('success', true, 'box_type_id', _type.id, 'code', _type.code, 'name', _type.name);
  PERFORM public.finish_transaction_request(_request_id, 'box_type:create', _result);
  RETURN _result;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_box_from_type_tx(
  _request_id uuid,
  _kind public.kind_type,
  _box_type_id uuid,
  _code text,
  _location text,
  _capacity numeric DEFAULT NULL,
  _acquired_at date DEFAULT NULL,
  _notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org uuid := public.get_my_org_id();
  _uid uuid := auth.uid();
  _cached jsonb;
  _type public.box_types%ROWTYPE;
  _box public.boxes%ROWTYPE;
  _effective_capacity int;
  _result jsonb;
BEGIN
  _cached := public.begin_transaction_request(_request_id, 'box:create_from_type');
  IF _cached IS NOT NULL THEN RETURN _cached; END IF;

  IF _org IS NULL OR _uid IS NULL OR NOT public.is_org_member() THEN
    RAISE EXCEPTION 'Se requiere una membresia activa.';
  END IF;
  IF _code IS NULL OR trim(_code) = '' OR _location IS NULL OR trim(_location) = '' THEN
    RAISE EXCEPTION 'Codigo y ubicacion son obligatorios.';
  END IF;

  SELECT * INTO _type FROM public.box_types
  WHERE id = _box_type_id AND organization_id = _org AND kind = _kind AND active
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El tipo de caja no existe, esta inactivo o pertenece a otra organizacion.'; END IF;

  IF _capacity IS NOT NULL AND (_capacity <= 0 OR _capacity <> trunc(_capacity)) THEN
    RAISE EXCEPTION 'La capacidad de la caja debe ser un entero positivo.';
  END IF;
  _effective_capacity := COALESCE(_capacity::int, _type.max_population, ceil(_type.max_biomass_grams)::int);

  INSERT INTO public.boxes (
    organization_id, owner_id, kind, code, location, capacity,
    box_type_id, capacity_override, acquired_at, notes
  ) VALUES (
    _org, _uid, _kind, trim(_code), trim(_location), _effective_capacity,
    _type.id, _capacity IS NOT NULL, _acquired_at, NULLIF(trim(_notes), '')
  ) RETURNING * INTO _box;

  _result := jsonb_build_object(
    'success', true, 'box_id', _box.id, 'code', _box.code,
    'box_type_id', _type.id, 'capacity', _box.capacity
  );
  PERFORM public.finish_transaction_request(_request_id, 'box:create_from_type', _result);
  RETURN _result;
END;
$$;

CREATE OR REPLACE FUNCTION public.register_substrate_stock_tx(
  _request_id uuid,
  _substrate_id uuid,
  _grams numeric,
  _total_cost numeric,
  _event_at timestamptz DEFAULT now(),
  _notes text DEFAULT NULL,
  _reference_type text DEFAULT NULL,
  _reference_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org uuid := public.get_my_org_id();
  _cached jsonb;
  _substrate public.substrates%ROWTYPE;
  _new_stock numeric;
  _new_cost_per_kg numeric;
  _event_id uuid;
  _result jsonb;
BEGIN
  _cached := public.begin_transaction_request(_request_id, 'substrate:stock_in');
  IF _cached IS NOT NULL THEN RETURN _cached; END IF;
  IF _org IS NULL OR NOT public.is_org_admin() THEN RAISE EXCEPTION 'Solo un administrador puede registrar entradas de sustrato.'; END IF;
  IF _grams IS NULL OR _grams <= 0 OR _total_cost IS NULL OR _total_cost < 0 THEN
    RAISE EXCEPTION 'Los gramos deben ser mayores a cero y el costo no puede ser negativo.';
  END IF;
  IF _event_at < timestamptz '2000-01-01' OR _event_at > now() + interval '5 minutes' THEN RAISE EXCEPTION 'Fecha de entrada no valida.'; END IF;

  SELECT * INTO _substrate FROM public.substrates
  WHERE id = _substrate_id AND organization_id = _org AND active
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sustrato no encontrado o inactivo.'; END IF;

  _new_stock := _substrate.stock_grams + _grams;
  _new_cost_per_kg := CASE WHEN _new_stock = 0 THEN 0 ELSE
    ((_substrate.stock_grams * _substrate.average_cost_per_kg / 1000) + _total_cost) / _new_stock * 1000 END;

  PERFORM set_config('app.substrate_inventory_write', 'allowed', true);
  UPDATE public.substrates
  SET stock_grams = _new_stock, average_cost_per_kg = _new_cost_per_kg, updated_at = now()
  WHERE id = _substrate.id;

  INSERT INTO public.substrate_inventory_events (
    organization_id, actor_user_id, substrate_id, event_type, event_at,
    grams_delta, balance_before_grams, balance_after_grams,
    unit_cost_per_kg, total_cost, observations, reference_type, reference_id, request_id
  ) VALUES (
    _org, auth.uid(), _substrate.id, 'purchase', _event_at,
    _grams, _substrate.stock_grams, _new_stock,
    CASE WHEN _grams = 0 THEN 0 ELSE _total_cost / _grams * 1000 END,
    _total_cost, NULLIF(trim(_notes), ''), NULLIF(trim(_reference_type), ''), NULLIF(trim(_reference_id), ''), _request_id
  ) RETURNING id INTO _event_id;

  _result := jsonb_build_object('success', true, 'event_id', _event_id, 'stock_grams', _new_stock, 'average_cost_per_kg', _new_cost_per_kg);
  PERFORM public.finish_transaction_request(_request_id, 'substrate:stock_in', _result);
  RETURN _result;
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_box_substrate_tx(
  _request_id uuid,
  _box_id uuid,
  _substrate_id uuid,
  _event_type text,
  _grams numeric DEFAULT NULL,
  _lot_id uuid DEFAULT NULL,
  _event_at timestamptz DEFAULT now(),
  _observations text DEFAULT NULL,
  _evidence_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org uuid := public.get_my_org_id();
  _cached jsonb;
  _box public.boxes%ROWTYPE;
  _substrate public.substrates%ROWTYPE;
  _rule public.box_substrate_rules%ROWTYPE;
  _consume numeric;
  _cost numeric;
  _event_id uuid;
  _service_id uuid;
  _result jsonb;
BEGIN
  _cached := public.begin_transaction_request(_request_id, 'substrate:consume');
  IF _cached IS NOT NULL THEN RETURN _cached; END IF;
  IF _org IS NULL OR NOT public.is_org_member() THEN RAISE EXCEPTION 'Se requiere una membresia activa.'; END IF;
  IF _event_type NOT IN ('setup', 'replacement', 'waste') THEN RAISE EXCEPTION 'Tipo de consumo no valido.'; END IF;
  IF _event_at < timestamptz '2000-01-01' OR _event_at > now() + interval '5 minutes' THEN RAISE EXCEPTION 'Fecha de consumo no valida.'; END IF;
  IF _evidence_url IS NOT NULL AND _evidence_url !~* '^https?://' THEN RAISE EXCEPTION 'La evidencia debe ser una URL HTTP(S).'; END IF;

  SELECT * INTO _box FROM public.boxes
  WHERE id = _box_id AND organization_id = _org AND status <> 'retired'
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Caja no encontrada, retirada o de otra organizacion.'; END IF;

  IF _lot_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.lots WHERE id = _lot_id AND organization_id = _org AND box_id = _box.id AND status = 'active'
  ) THEN RAISE EXCEPTION 'El lote debe estar activo y ubicado en la caja seleccionada.'; END IF;

  SELECT * INTO _substrate FROM public.substrates
  WHERE id = _substrate_id AND organization_id = _org AND active
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sustrato no encontrado o inactivo.'; END IF;

  IF _box.box_type_id IS NOT NULL THEN
    SELECT * INTO _rule FROM public.box_substrate_rules
    WHERE organization_id = _org AND box_type_id = _box.box_type_id AND substrate_id = _substrate.id;
  END IF;

  _consume := COALESCE(
    _grams,
    CASE WHEN _event_type = 'setup' THEN _rule.setup_grams ELSE _rule.replacement_grams END
  );
  IF _consume IS NULL OR _consume <= 0 THEN RAISE EXCEPTION 'Indica una cantidad mayor a cero o configura una regla para este tipo de caja.'; END IF;
  IF _substrate.stock_grams < _consume THEN RAISE EXCEPTION 'Sustrato insuficiente: disponible % g, solicitado % g.', _substrate.stock_grams, _consume; END IF;

  _cost := round(_consume * _substrate.average_cost_per_kg / 1000, 4);
  PERFORM set_config('app.substrate_inventory_write', 'allowed', true);
  UPDATE public.substrates
  SET stock_grams = stock_grams - _consume, updated_at = now()
  WHERE id = _substrate.id;

  INSERT INTO public.substrate_inventory_events (
    organization_id, actor_user_id, substrate_id, event_type, event_at,
    grams_delta, balance_before_grams, balance_after_grams,
    unit_cost_per_kg, total_cost, box_id, lot_id, observations,
    evidence_url, request_id
  ) VALUES (
    _org, auth.uid(), _substrate.id, _event_type, _event_at,
    -_consume, _substrate.stock_grams, _substrate.stock_grams - _consume,
    _substrate.average_cost_per_kg, _cost, _box.id, _lot_id,
    NULLIF(trim(_observations), ''), NULLIF(trim(_evidence_url), ''), _request_id
  ) RETURNING id INTO _event_id;

  INSERT INTO public.box_service_events (
    organization_id, actor_user_id, box_id, lot_id, event_type, event_at,
    substrate_event_id, observations, evidence_url, request_id
  ) VALUES (
    _org, auth.uid(), _box.id, _lot_id,
    CASE _event_type WHEN 'setup' THEN 'preparation' WHEN 'waste' THEN 'substrate_waste' ELSE 'substrate_replacement' END,
    _event_at, _event_id, NULLIF(trim(_observations), ''), NULLIF(trim(_evidence_url), ''), _request_id
  ) RETURNING id INTO _service_id;

  IF _lot_id IS NOT NULL THEN
    INSERT INTO public.lot_cost_allocations (
      organization_id, lot_id, category, amount, source_table, source_id, incurred_at, description
    ) VALUES (
      _org, _lot_id, 'substrate', _cost, 'substrate_inventory_events', _event_id, _event_at,
      CASE WHEN _event_type = 'setup' THEN 'Preparacion de caja' ELSE 'Reposicion de sustrato' END
    );
  END IF;

  _result := jsonb_build_object(
    'success', true, 'event_id', _event_id, 'service_event_id', _service_id,
    'grams_consumed', _consume, 'cost', _cost,
    'remaining_stock_grams', _substrate.stock_grams - _consume
  );
  PERFORM public.finish_transaction_request(_request_id, 'substrate:consume', _result);
  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.create_box_type_tx(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_box_from_type_tx(uuid, public.kind_type, uuid, text, text, numeric, date, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.register_substrate_stock_tx(uuid, uuid, numeric, numeric, timestamptz, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.consume_box_substrate_tx(uuid, uuid, uuid, text, numeric, uuid, timestamptz, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_box_type_tx(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_box_from_type_tx(uuid, public.kind_type, uuid, text, text, numeric, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_substrate_stock_tx(uuid, uuid, numeric, numeric, timestamptz, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_box_substrate_tx(uuid, uuid, uuid, text, numeric, uuid, timestamptz, text, text) TO authenticated;

CREATE OR REPLACE VIEW public.lot_production_costs
WITH (security_invoker = true)
AS
SELECT
  l.organization_id,
  l.id AS lot_id,
  l.lot_code,
  l.kind,
  l.status,
  COALESCE(sum(c.amount), 0)::numeric(14,4) AS total_cost,
  COALESCE(sum(c.amount) FILTER (WHERE c.category = 'substrate'), 0)::numeric(14,4) AS substrate_cost,
  CASE WHEN l.kind = 'rodent' AND (COALESCE(l.males, 0) + COALESCE(l.females, 0) + COALESCE(l.unsexed, 0)) > 0
    THEN round(COALESCE(sum(c.amount), 0) / (COALESCE(l.males, 0) + COALESCE(l.females, 0) + COALESCE(l.unsexed, 0)), 4)
    ELSE NULL END AS cost_per_animal,
  CASE WHEN l.kind = 'insect' AND COALESCE(l.mass_grams, 0) > 0
    THEN round(COALESCE(sum(c.amount), 0) / l.mass_grams, 4)
    ELSE NULL END AS cost_per_gram
FROM public.lots l
LEFT JOIN public.lot_cost_allocations c
  ON c.organization_id = l.organization_id AND c.lot_id = l.id
GROUP BY l.organization_id, l.id;

GRANT SELECT ON public.lot_production_costs TO authenticated;

-- Los eventos y costos son inmutables incluso ante acceso SQL directo.
CREATE TRIGGER prevent_substrate_event_mutation_trg BEFORE UPDATE OR DELETE ON public.substrate_inventory_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_operational_event_mutation();
CREATE TRIGGER prevent_box_service_mutation_trg BEFORE UPDATE OR DELETE ON public.box_service_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_operational_event_mutation();
CREATE TRIGGER prevent_lot_cost_mutation_trg BEFORE UPDATE OR DELETE ON public.lot_cost_allocations
  FOR EACH ROW EXECUTE FUNCTION public.prevent_operational_event_mutation();

-- Cambios de catalogo e inventario quedan tambien en la bitacora administrativa.
CREATE TRIGGER audit_row_change_trg AFTER INSERT OR UPDATE OR DELETE ON public.box_types
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
CREATE TRIGGER audit_row_change_trg AFTER INSERT OR UPDATE OR DELETE ON public.substrates
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
CREATE TRIGGER audit_row_change_trg AFTER INSERT OR UPDATE OR DELETE ON public.box_substrate_rules
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

CREATE OR REPLACE FUNCTION public.export_organization_data()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _org uuid := public.get_my_org_id();
BEGIN
  IF _org IS NULL OR NOT public.is_org_admin() THEN
    RAISE EXCEPTION 'OPERATIONAL_EXPORT_ADMIN_REQUIRED';
  END IF;
  RETURN jsonb_build_object(
    'schema_version', '20260803000001',
    'generated_at', now(),
    'organization', (SELECT to_jsonb(o) - 'created_by' FROM public.organizations o WHERE o.id = _org),
    'species', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.species t WHERE t.organization_id = _org),
    'genetic_lines', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.genetic_lines t WHERE t.organization_id = _org),
    'box_types', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.box_types t WHERE t.organization_id = _org),
    'boxes', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.boxes t WHERE t.organization_id = _org),
    'substrates', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.substrates t WHERE t.organization_id = _org),
    'box_substrate_rules', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.box_substrate_rules t WHERE t.organization_id = _org),
    'substrate_inventory_events', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.substrate_inventory_events t WHERE t.organization_id = _org),
    'box_service_events', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.box_service_events t WHERE t.organization_id = _org),
    'lot_cost_allocations', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.lot_cost_allocations t WHERE t.organization_id = _org),
    'lots', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.lots t WHERE t.organization_id = _org),
    'lot_events', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.lot_events t WHERE t.organization_id = _org),
    'inventory_events', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.inventory_events t WHERE t.organization_id = _org),
    'reproduction_events', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.reproduction_events t WHERE t.organization_id = _org),
    'warehouse_food', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.warehouse_food t WHERE t.organization_id = _org),
    'warehouse_cleaning', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.warehouse_cleaning t WHERE t.organization_id = _org),
    'warehouse_tools', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.warehouse_tools t WHERE t.organization_id = _org),
    'warehouse_packaging', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.warehouse_packaging t WHERE t.organization_id = _org),
    'warehouse_purchases', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.warehouse_purchases t WHERE t.organization_id = _org),
    'clients', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.clients t WHERE t.organization_id = _org),
    'orders', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.orders t WHERE t.organization_id = _org),
    'order_items', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.order_items t WHERE t.organization_id = _org),
    'order_item_allocations', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.order_item_allocations t WHERE t.organization_id = _org),
    'alert_rules', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.alert_rules t WHERE t.organization_id = _org),
    'alerts', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.alerts t WHERE t.organization_id = _org),
    'audit_log', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.audit_log t WHERE t.organization_id = _org)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.export_organization_data() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.export_organization_data() TO authenticated;

COMMIT;
