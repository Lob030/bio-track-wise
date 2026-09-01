-- BioTrack: costeo completo, consumos reales y rentabilidad por lote.

BEGIN;

ALTER TABLE public.lot_cost_allocations DROP CONSTRAINT lot_cost_category_valid;
ALTER TABLE public.lot_cost_allocations ADD CONSTRAINT lot_cost_category_valid CHECK (
  category IN (
    'purchase', 'substrate', 'feed', 'labor', 'veterinary', 'cleaning',
    'utilities', 'packaging', 'transport', 'depreciation', 'mortality', 'other'
  )
);

DROP POLICY IF EXISTS lot_cost_select_member ON public.lot_cost_allocations;
CREATE POLICY lot_cost_select_admin ON public.lot_cost_allocations FOR SELECT
  USING (organization_id = public.get_my_org_id() AND public.is_org_admin());

CREATE UNIQUE INDEX IF NOT EXISTS warehouse_food_org_id_uidx
  ON public.warehouse_food (organization_id, id);

CREATE TABLE public.cost_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  category text NOT NULL,
  description text NOT NULL,
  incurred_at timestamptz NOT NULL DEFAULT now(),
  quantity numeric(14,4),
  unit text,
  unit_cost numeric(14,4),
  total_amount numeric(14,4) NOT NULL,
  vendor text,
  reference_type text,
  reference_id text,
  notes text,
  evidence_url text,
  request_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cost_entries_category_valid CHECK (
    category IN (
      'purchase', 'substrate', 'feed', 'labor', 'veterinary', 'cleaning',
      'utilities', 'packaging', 'transport', 'depreciation', 'mortality', 'other'
    )
  ),
  CONSTRAINT cost_entries_description_not_blank CHECK (trim(description) <> ''),
  CONSTRAINT cost_entries_amount_positive CHECK (total_amount > 0),
  CONSTRAINT cost_entries_quantity_positive CHECK (quantity IS NULL OR quantity > 0),
  CONSTRAINT cost_entries_unit_cost_nonnegative CHECK (unit_cost IS NULL OR unit_cost >= 0),
  CONSTRAINT cost_entries_evidence_url_valid CHECK (evidence_url IS NULL OR evidence_url ~* '^https?://'),
  CONSTRAINT cost_entries_org_id_uidx UNIQUE (organization_id, id),
  CONSTRAINT cost_entries_request_uidx UNIQUE (organization_id, actor_user_id, request_id)
);

CREATE INDEX cost_entries_org_date_idx
  ON public.cost_entries (organization_id, incurred_at DESC, category);
CREATE UNIQUE INDEX cost_entries_purchase_source_uidx
  ON public.cost_entries (organization_id, reference_type, reference_id)
  WHERE reference_type IN ('warehouse_purchase', 'cost_asset_period');

ALTER TABLE public.lot_cost_allocations
  ADD COLUMN cost_entry_id uuid,
  ADD COLUMN allocation_basis text NOT NULL DEFAULT 'direct',
  ADD COLUMN allocation_weight numeric(14,6),
  ADD CONSTRAINT lot_cost_entry_fkey FOREIGN KEY (organization_id, cost_entry_id)
    REFERENCES public.cost_entries (organization_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT lot_cost_allocation_basis_valid CHECK (
    allocation_basis IN ('direct', 'equal', 'population', 'biomass', 'active_days', 'manual')
  ),
  ADD CONSTRAINT lot_cost_allocation_weight_positive CHECK (
    allocation_weight IS NULL OR allocation_weight > 0
  );

CREATE INDEX lot_cost_entry_idx ON public.lot_cost_allocations (cost_entry_id)
  WHERE cost_entry_id IS NOT NULL;

CREATE TABLE public.feed_inventory_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  food_id uuid NOT NULL,
  event_type text NOT NULL,
  event_at timestamptz NOT NULL DEFAULT now(),
  grams_delta numeric(14,2) NOT NULL,
  balance_before_grams numeric(14,2) NOT NULL,
  balance_after_grams numeric(14,2) NOT NULL,
  unit_cost_per_kg numeric(14,4) NOT NULL,
  total_cost numeric(14,4) NOT NULL,
  cost_entry_id uuid,
  observations text,
  request_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT feed_events_food_fkey FOREIGN KEY (organization_id, food_id)
    REFERENCES public.warehouse_food (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT feed_events_cost_entry_fkey FOREIGN KEY (organization_id, cost_entry_id)
    REFERENCES public.cost_entries (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT feed_events_type_valid CHECK (event_type IN ('opening', 'purchase', 'consumption', 'waste', 'adjustment')),
  CONSTRAINT feed_events_balances_valid CHECK (balance_before_grams >= 0 AND balance_after_grams >= 0),
  CONSTRAINT feed_events_cost_valid CHECK (unit_cost_per_kg >= 0 AND total_cost >= 0),
  CONSTRAINT feed_events_request_uidx UNIQUE (organization_id, actor_user_id, request_id),
  CONSTRAINT feed_events_org_id_uidx UNIQUE (organization_id, id)
);

CREATE INDEX feed_events_org_date_idx
  ON public.feed_inventory_events (organization_id, event_at DESC, event_type);

CREATE TABLE public.cost_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  code text NOT NULL,
  name text NOT NULL,
  asset_type text NOT NULL,
  box_id uuid,
  acquisition_cost numeric(14,2) NOT NULL,
  residual_value numeric(14,2) NOT NULL DEFAULT 0,
  useful_life_months int NOT NULL,
  in_service_date date NOT NULL,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cost_assets_code_not_blank CHECK (trim(code) <> ''),
  CONSTRAINT cost_assets_name_not_blank CHECK (trim(name) <> ''),
  CONSTRAINT cost_assets_type_valid CHECK (asset_type IN ('box', 'equipment', 'facility', 'vehicle', 'other')),
  CONSTRAINT cost_assets_cost_valid CHECK (acquisition_cost > 0 AND residual_value >= 0 AND residual_value < acquisition_cost),
  CONSTRAINT cost_assets_life_positive CHECK (useful_life_months > 0),
  CONSTRAINT cost_assets_box_fkey FOREIGN KEY (organization_id, box_id)
    REFERENCES public.boxes (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT cost_assets_org_id_uidx UNIQUE (organization_id, id)
);

CREATE UNIQUE INDEX cost_assets_org_code_uidx
  ON public.cost_assets (organization_id, lower(trim(code)));

CREATE TABLE public.asset_depreciation_postings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  asset_id uuid NOT NULL,
  period_start date NOT NULL,
  amount numeric(14,4) NOT NULL,
  cost_entry_id uuid NOT NULL,
  request_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT depreciation_asset_fkey FOREIGN KEY (organization_id, asset_id)
    REFERENCES public.cost_assets (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT depreciation_cost_entry_fkey FOREIGN KEY (organization_id, cost_entry_id)
    REFERENCES public.cost_entries (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT depreciation_amount_positive CHECK (amount > 0),
  CONSTRAINT depreciation_period_first_day CHECK (period_start = date_trunc('month', period_start)::date),
  CONSTRAINT depreciation_asset_period_uidx UNIQUE (organization_id, asset_id, period_start),
  CONSTRAINT depreciation_request_uidx UNIQUE (organization_id, request_id)
);

ALTER TABLE public.cost_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_inventory_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_depreciation_postings ENABLE ROW LEVEL SECURITY;

CREATE POLICY cost_entries_select_admin ON public.cost_entries FOR SELECT
  USING (organization_id = public.get_my_org_id() AND public.is_org_admin());
CREATE POLICY feed_events_select_member ON public.feed_inventory_events FOR SELECT
  USING (organization_id = public.get_my_org_id() AND public.is_org_member());
CREATE POLICY cost_assets_select_admin ON public.cost_assets FOR SELECT
  USING (organization_id = public.get_my_org_id() AND public.is_org_admin());
CREATE POLICY cost_assets_admin_all ON public.cost_assets FOR ALL
  USING (organization_id = public.get_my_org_id() AND public.is_org_admin())
  WITH CHECK (organization_id = public.get_my_org_id() AND public.is_org_admin());
CREATE POLICY depreciation_select_admin ON public.asset_depreciation_postings FOR SELECT
  USING (organization_id = public.get_my_org_id() AND public.is_org_admin());

GRANT SELECT ON public.cost_entries, public.feed_inventory_events, public.cost_assets,
  public.asset_depreciation_postings TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.cost_assets TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.cost_entries, public.feed_inventory_events,
  public.asset_depreciation_postings FROM authenticated, anon;

CREATE TRIGGER set_org_and_owner_trg BEFORE INSERT ON public.cost_assets
  FOR EACH ROW EXECUTE FUNCTION public.set_org_and_owner();
CREATE TRIGGER prevent_org_and_owner_change_trg BEFORE UPDATE ON public.cost_assets
  FOR EACH ROW EXECUTE FUNCTION public.prevent_org_and_owner_change();

CREATE OR REPLACE FUNCTION public.prevent_cost_record_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'El libro de costos es inmutable: no se permite %.', TG_OP;
END;
$$;

CREATE TRIGGER prevent_cost_entry_mutation_trg BEFORE UPDATE OR DELETE ON public.cost_entries
  FOR EACH ROW EXECUTE FUNCTION public.prevent_cost_record_mutation();
CREATE TRIGGER prevent_feed_event_mutation_trg BEFORE UPDATE OR DELETE ON public.feed_inventory_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_cost_record_mutation();
CREATE TRIGGER prevent_depreciation_mutation_trg BEFORE UPDATE OR DELETE ON public.asset_depreciation_postings
  FOR EACH ROW EXECUTE FUNCTION public.prevent_cost_record_mutation();

CREATE OR REPLACE FUNCTION public.protect_food_balance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF coalesce(auth.role(), '') = 'service_role' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND (
    NEW.quantity_grams IS DISTINCT FROM OLD.quantity_grams
    OR NEW.unit_cost IS DISTINCT FROM OLD.unit_cost
  ) AND current_setting('app.feed_inventory_write', true) IS DISTINCT FROM 'allowed' THEN
    RAISE EXCEPTION 'El saldo y costo del alimento solo pueden cambiar mediante una operacion transaccional.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_food_balance_trg BEFORE UPDATE ON public.warehouse_food
  FOR EACH ROW EXECUTE FUNCTION public.protect_food_balance();

CREATE OR REPLACE FUNCTION public.capture_food_opening_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.quantity_grams > 0 THEN
    INSERT INTO public.feed_inventory_events (
      organization_id, actor_user_id, food_id, event_type, event_at, grams_delta,
      balance_before_grams, balance_after_grams, unit_cost_per_kg, total_cost, observations
    ) VALUES (
      NEW.organization_id, auth.uid(), NEW.id, 'opening', NEW.created_at, NEW.quantity_grams,
      0, NEW.quantity_grams, COALESCE(NEW.unit_cost, 0),
      round(NEW.quantity_grams * COALESCE(NEW.unit_cost, 0) / 1000, 4),
      'Saldo inicial del alimento'
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER capture_food_opening_event_trg AFTER INSERT ON public.warehouse_food
  FOR EACH ROW EXECUTE FUNCTION public.capture_food_opening_event();

INSERT INTO public.feed_inventory_events (
  organization_id, actor_user_id, food_id, event_type, event_at, grams_delta,
  balance_before_grams, balance_after_grams, unit_cost_per_kg, total_cost, observations
)
SELECT f.organization_id, f.owner_id, f.id, 'opening', f.created_at, f.quantity_grams,
       0, f.quantity_grams, COALESCE(f.unit_cost, 0),
       round(f.quantity_grams * COALESCE(f.unit_cost, 0) / 1000, 4),
       'Saldo inicial al habilitar costeo completo'
FROM public.warehouse_food f
WHERE f.quantity_grams > 0;

CREATE OR REPLACE FUNCTION public.allocate_cost_entry(
  _entry_id uuid,
  _allocations jsonb,
  _basis text DEFAULT 'direct'
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _org uuid := public.get_my_org_id();
  _entry public.cost_entries%ROWTYPE;
  _allocation jsonb;
  _sum numeric := 0;
  _amount numeric;
  _lot_id uuid;
  _weight numeric;
BEGIN
  SELECT * INTO _entry FROM public.cost_entries
  WHERE id = _entry_id AND organization_id = _org;
  IF NOT FOUND THEN RAISE EXCEPTION 'Entrada de costo no encontrada.'; END IF;
  IF _allocations IS NULL OR jsonb_typeof(_allocations) <> 'array' OR jsonb_array_length(_allocations) = 0 THEN
    RAISE EXCEPTION 'Se requiere al menos una asignacion a lote.';
  END IF;

  FOR _allocation IN SELECT * FROM jsonb_array_elements(_allocations) LOOP
    _lot_id := (_allocation->>'lot_id')::uuid;
    _amount := (_allocation->>'amount')::numeric;
    _weight := NULLIF(_allocation->>'weight', '')::numeric;
    IF _amount <= 0 OR NOT EXISTS (
      SELECT 1 FROM public.lots WHERE id = _lot_id AND organization_id = _org
    ) THEN RAISE EXCEPTION 'Asignacion de costo invalida o lote ajeno.'; END IF;
    _sum := _sum + _amount;
    INSERT INTO public.lot_cost_allocations (
      organization_id, lot_id, category, amount, source_table, source_id,
      incurred_at, description, cost_entry_id, allocation_basis, allocation_weight
    ) VALUES (
      _org, _lot_id, _entry.category, _amount, 'cost_entries', _entry.id,
      _entry.incurred_at, _entry.description, _entry.id, _basis, _weight
    );
  END LOOP;
  IF abs(_sum - _entry.total_amount) > 0.01 THEN
    RAISE EXCEPTION 'Las asignaciones (%) no coinciden con el costo total (%).', _sum, _entry.total_amount;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.allocate_cost_entry(uuid, jsonb, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.register_lot_cost_tx(
  _request_id uuid,
  _category text,
  _description text,
  _total_amount numeric,
  _allocations jsonb,
  _allocation_basis text DEFAULT 'direct',
  _incurred_at timestamptz DEFAULT now(),
  _quantity numeric DEFAULT NULL,
  _unit text DEFAULT NULL,
  _unit_cost numeric DEFAULT NULL,
  _vendor text DEFAULT NULL,
  _reference_type text DEFAULT NULL,
  _reference_id text DEFAULT NULL,
  _notes text DEFAULT NULL,
  _evidence_url text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _org uuid := public.get_my_org_id();
  _cached jsonb;
  _entry_id uuid;
  _result jsonb;
BEGIN
  _cached := public.begin_transaction_request(_request_id, 'cost:register');
  IF _cached IS NOT NULL THEN RETURN _cached; END IF;
  IF _org IS NULL OR NOT public.is_org_admin() THEN RAISE EXCEPTION 'Solo un administrador puede registrar costos.'; END IF;
  IF _category NOT IN ('labor','veterinary','cleaning','utilities','packaging','transport','other') THEN
    RAISE EXCEPTION 'Categoria no disponible para captura manual.';
  END IF;
  IF _description IS NULL OR trim(_description) = '' OR _total_amount IS NULL OR _total_amount <= 0 THEN
    RAISE EXCEPTION 'Descripcion y monto positivo son obligatorios.';
  END IF;
  IF _incurred_at < timestamptz '2000-01-01' OR _incurred_at > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'Fecha de costo no valida.';
  END IF;

  INSERT INTO public.cost_entries (
    organization_id, actor_user_id, category, description, incurred_at,
    quantity, unit, unit_cost, total_amount, vendor, reference_type,
    reference_id, notes, evidence_url, request_id
  ) VALUES (
    _org, auth.uid(), _category, trim(_description), _incurred_at,
    _quantity, NULLIF(trim(_unit), ''), _unit_cost, _total_amount,
    NULLIF(trim(_vendor), ''), NULLIF(trim(_reference_type), ''),
    NULLIF(trim(_reference_id), ''), NULLIF(trim(_notes), ''),
    NULLIF(trim(_evidence_url), ''), _request_id
  ) RETURNING id INTO _entry_id;

  PERFORM public.allocate_cost_entry(_entry_id, _allocations, _allocation_basis);
  _result := jsonb_build_object('success', true, 'cost_entry_id', _entry_id, 'amount', _total_amount);
  PERFORM public.finish_transaction_request(_request_id, 'cost:register', _result);
  RETURN _result;
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_feed_tx(
  _request_id uuid,
  _food_id uuid,
  _allocations jsonb,
  _event_at timestamptz DEFAULT now(),
  _observations text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _org uuid := public.get_my_org_id();
  _cached jsonb;
  _food public.warehouse_food%ROWTYPE;
  _item jsonb;
  _grams numeric := 0;
  _cost numeric;
  _entry_id uuid;
  _event_id uuid;
  _cost_allocations jsonb := '[]'::jsonb;
  _result jsonb;
BEGIN
  _cached := public.begin_transaction_request(_request_id, 'feed:consume');
  IF _cached IS NOT NULL THEN RETURN _cached; END IF;
  IF _org IS NULL OR NOT public.is_org_member() THEN RAISE EXCEPTION 'Se requiere una membresia activa.'; END IF;
  IF _allocations IS NULL OR jsonb_typeof(_allocations) <> 'array' OR jsonb_array_length(_allocations) = 0 THEN
    RAISE EXCEPTION 'Se requiere al menos un lote y sus gramos consumidos.';
  END IF;
  SELECT * INTO _food FROM public.warehouse_food
  WHERE id = _food_id AND organization_id = _org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Alimento no encontrado.'; END IF;

  FOR _item IN SELECT * FROM jsonb_array_elements(_allocations) LOOP
    IF COALESCE((_item->>'grams')::numeric, 0) <= 0 OR NOT EXISTS (
      SELECT 1 FROM public.lots WHERE id = (_item->>'lot_id')::uuid
        AND organization_id = _org AND status = 'active'
    ) THEN RAISE EXCEPTION 'Lote o cantidad de alimento invalida.'; END IF;
    _grams := _grams + (_item->>'grams')::numeric;
  END LOOP;
  IF _food.quantity_grams < _grams THEN
    RAISE EXCEPTION 'Alimento insuficiente: disponible % g, solicitado % g.', _food.quantity_grams, _grams;
  END IF;
  IF COALESCE(_food.unit_cost, 0) <= 0 THEN
    RAISE EXCEPTION 'El alimento requiere un costo por kilogramo mayor a cero antes de consumirse.';
  END IF;
  _cost := round(_grams * COALESCE(_food.unit_cost, 0) / 1000, 4);
  IF _cost <= 0 THEN RAISE EXCEPTION 'El consumo es demasiado pequeno para generar un costo registrable.'; END IF;

  INSERT INTO public.cost_entries (
    organization_id, actor_user_id, category, description, incurred_at,
    quantity, unit, unit_cost, total_amount, reference_type, reference_id, notes, request_id
  ) VALUES (
    _org, auth.uid(), 'feed', 'Consumo de ' || _food.name, _event_at,
    _grams, 'g', COALESCE(_food.unit_cost, 0) / 1000, _cost,
    'warehouse_food', _food.id::text, NULLIF(trim(_observations), ''), _request_id
  ) RETURNING id INTO _entry_id;

  FOR _item IN SELECT * FROM jsonb_array_elements(_allocations) LOOP
    _cost_allocations := _cost_allocations || jsonb_build_array(jsonb_build_object(
      'lot_id', _item->>'lot_id',
      'amount', round((_item->>'grams')::numeric * COALESCE(_food.unit_cost, 0) / 1000, 4),
      'weight', _item->>'grams'
    ));
  END LOOP;
  -- Ajustar centavos de redondeo en la ultima asignacion no es necesario para
  -- costos normales; allocate_cost_entry tolera una diferencia de un centavo.
  PERFORM public.allocate_cost_entry(_entry_id, _cost_allocations, 'manual');

  PERFORM set_config('app.feed_inventory_write', 'allowed', true);
  UPDATE public.warehouse_food SET quantity_grams = quantity_grams - _grams WHERE id = _food.id;
  INSERT INTO public.feed_inventory_events (
    organization_id, actor_user_id, food_id, event_type, event_at, grams_delta,
    balance_before_grams, balance_after_grams, unit_cost_per_kg, total_cost,
    cost_entry_id, observations, request_id
  ) VALUES (
    _org, auth.uid(), _food.id, 'consumption', _event_at, -_grams,
    _food.quantity_grams, _food.quantity_grams - _grams, COALESCE(_food.unit_cost, 0),
    _cost, _entry_id, NULLIF(trim(_observations), ''), _request_id
  ) RETURNING id INTO _event_id;

  _result := jsonb_build_object('success', true, 'event_id', _event_id,
    'cost_entry_id', _entry_id, 'grams', _grams, 'cost', _cost,
    'remaining_grams', _food.quantity_grams - _grams);
  PERFORM public.finish_transaction_request(_request_id, 'feed:consume', _result);
  RETURN _result;
END;
$$;

CREATE OR REPLACE FUNCTION public.post_asset_depreciation_tx(
  _request_id uuid,
  _asset_id uuid,
  _period_start date,
  _allocations jsonb,
  _allocation_basis text DEFAULT 'equal'
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _org uuid := public.get_my_org_id();
  _cached jsonb;
  _asset public.cost_assets%ROWTYPE;
  _amount numeric;
  _entry_id uuid;
  _posting_id uuid;
  _result jsonb;
BEGIN
  _cached := public.begin_transaction_request(_request_id, 'asset:depreciate');
  IF _cached IS NOT NULL THEN RETURN _cached; END IF;
  IF _org IS NULL OR NOT public.is_org_admin() THEN RAISE EXCEPTION 'Solo un administrador puede contabilizar depreciacion.'; END IF;
  IF _period_start <> date_trunc('month', _period_start)::date THEN RAISE EXCEPTION 'El periodo debe iniciar el primer dia del mes.'; END IF;
  SELECT * INTO _asset FROM public.cost_assets
  WHERE id = _asset_id AND organization_id = _org AND active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Activo no encontrado o inactivo.'; END IF;
  IF _period_start < date_trunc('month', _asset.in_service_date)::date THEN RAISE EXCEPTION 'El periodo precede la fecha de puesta en servicio.'; END IF;
  IF _period_start >= (date_trunc('month', _asset.in_service_date) + make_interval(months => _asset.useful_life_months))::date THEN
    RAISE EXCEPTION 'El activo ya termino su vida util para este periodo.';
  END IF;
  _amount := round((_asset.acquisition_cost - _asset.residual_value) / _asset.useful_life_months, 4);

  INSERT INTO public.cost_entries (
    organization_id, actor_user_id, category, description, incurred_at,
    quantity, unit, unit_cost, total_amount, reference_type, reference_id, request_id
  ) VALUES (
    _org, auth.uid(), 'depreciation', 'Depreciacion de ' || _asset.name,
    _period_start::timestamptz, 1, 'mes', _amount, _amount,
    'cost_asset_period', _asset.id::text || ':' || _period_start::text, _request_id
  ) RETURNING id INTO _entry_id;
  PERFORM public.allocate_cost_entry(_entry_id, _allocations, _allocation_basis);
  INSERT INTO public.asset_depreciation_postings (
    organization_id, asset_id, period_start, amount, cost_entry_id, request_id
  ) VALUES (_org, _asset.id, _period_start, _amount, _entry_id, _request_id)
  RETURNING id INTO _posting_id;
  _result := jsonb_build_object('success', true, 'posting_id', _posting_id,
    'cost_entry_id', _entry_id, 'amount', _amount);
  PERFORM public.finish_transaction_request(_request_id, 'asset:depreciate', _result);
  RETURN _result;
END;
$$;

-- Las compras convertidas a lote se reconocen automaticamente como costo directo.
CREATE OR REPLACE FUNCTION public.allocate_purchase_cost()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _entry_id uuid;
BEGIN
  IF NEW.converted_to_lot_id IS NULL OR COALESCE(NEW.total_cost, 0) <= 0 THEN RETURN NEW; END IF;
  INSERT INTO public.cost_entries (
    organization_id, actor_user_id, category, description, incurred_at,
    total_amount, vendor, reference_type, reference_id, notes
  ) VALUES (
    NEW.organization_id, auth.uid(), 'purchase', 'Compra inicial del lote', NEW.created_at,
    NEW.total_cost, NEW.provider, 'warehouse_purchase', NEW.id::text, NEW.notes
  ) ON CONFLICT DO NOTHING
  RETURNING id INTO _entry_id;
  IF _entry_id IS NOT NULL THEN
    INSERT INTO public.lot_cost_allocations (
      organization_id, lot_id, category, amount, source_table, source_id,
      incurred_at, description, cost_entry_id, allocation_basis
    ) VALUES (
      NEW.organization_id, NEW.converted_to_lot_id, 'purchase', NEW.total_cost,
      'cost_entries', _entry_id, NEW.created_at, 'Compra inicial del lote', _entry_id, 'direct'
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER allocate_purchase_cost_trg
AFTER INSERT OR UPDATE OF converted_to_lot_id ON public.warehouse_purchases
FOR EACH ROW EXECUTE FUNCTION public.allocate_purchase_cost();

INSERT INTO public.cost_entries (
  organization_id, actor_user_id, category, description, incurred_at,
  total_amount, vendor, reference_type, reference_id, notes
)
SELECT p.organization_id, p.owner_id, 'purchase', 'Compra inicial del lote', p.created_at,
       p.total_cost, p.provider, 'warehouse_purchase', p.id::text, p.notes
FROM public.warehouse_purchases p
WHERE p.converted_to_lot_id IS NOT NULL AND COALESCE(p.total_cost, 0) > 0
ON CONFLICT DO NOTHING;

INSERT INTO public.lot_cost_allocations (
  organization_id, lot_id, category, amount, source_table, source_id,
  incurred_at, description, cost_entry_id, allocation_basis
)
SELECT p.organization_id, p.converted_to_lot_id, 'purchase', p.total_cost,
       'cost_entries', e.id, p.created_at, 'Compra inicial del lote', e.id, 'direct'
FROM public.warehouse_purchases p
JOIN public.cost_entries e ON e.organization_id = p.organization_id
  AND e.reference_type = 'warehouse_purchase' AND e.reference_id = p.id::text
WHERE p.converted_to_lot_id IS NOT NULL AND COALESCE(p.total_cost, 0) > 0
ON CONFLICT (organization_id, source_table, source_id, lot_id) DO NOTHING;

CREATE OR REPLACE VIEW public.lot_financial_summary
WITH (security_invoker = true)
AS
WITH costs AS (
  SELECT organization_id, lot_id, sum(amount) AS total_cost,
    sum(amount) FILTER (WHERE category = 'purchase') AS purchase_cost,
    sum(amount) FILTER (WHERE category = 'feed') AS feed_cost,
    sum(amount) FILTER (WHERE category = 'substrate') AS substrate_cost,
    sum(amount) FILTER (WHERE category = 'labor') AS labor_cost,
    sum(amount) FILTER (WHERE category = 'veterinary') AS veterinary_cost,
    sum(amount) FILTER (WHERE category = 'utilities') AS utilities_cost,
    sum(amount) FILTER (WHERE category = 'depreciation') AS depreciation_cost
  FROM public.lot_cost_allocations GROUP BY organization_id, lot_id
), sales AS (
  SELECT a.organization_id, a.lot_id, sum(a.qty_taken) AS sold_quantity,
    sum(a.qty_taken * i.unit_price) AS revenue
  FROM public.order_item_allocations a
  JOIN public.order_items i ON i.organization_id = a.organization_id AND i.id = a.order_item_id
  GROUP BY a.organization_id, a.lot_id
), mortality AS (
  SELECT organization_id, lot_id,
    sum(abs(males_delta) + abs(females_delta) + abs(unsexed_delta)) FILTER (WHERE event_type = 'mortality_out') AS dead_population,
    sum(abs(mass_delta)) FILTER (WHERE event_type = 'mortality_out') AS dead_mass
  FROM public.inventory_events GROUP BY organization_id, lot_id
), base AS (
  SELECT l.organization_id, l.id AS lot_id, l.lot_code, l.kind, l.status,
    COALESCE(l.males,0) + COALESCE(l.females,0) + COALESCE(l.unsexed,0) AS current_population,
    COALESCE(l.mass_grams,0) AS current_mass,
    COALESCE(s.sold_quantity,0) AS sold_quantity, COALESCE(s.revenue,0) AS revenue,
    COALESCE(m.dead_population,0) AS dead_population, COALESCE(m.dead_mass,0) AS dead_mass,
    COALESCE(c.total_cost,0) AS total_cost, COALESCE(c.purchase_cost,0) AS purchase_cost,
    COALESCE(c.feed_cost,0) AS feed_cost, COALESCE(c.substrate_cost,0) AS substrate_cost,
    COALESCE(c.labor_cost,0) AS labor_cost, COALESCE(c.veterinary_cost,0) AS veterinary_cost,
    COALESCE(c.utilities_cost,0) AS utilities_cost, COALESCE(c.depreciation_cost,0) AS depreciation_cost
  FROM public.lots l
  LEFT JOIN costs c ON c.organization_id = l.organization_id AND c.lot_id = l.id
  LEFT JOIN sales s ON s.organization_id = l.organization_id AND s.lot_id = l.id
  LEFT JOIN mortality m ON m.organization_id = l.organization_id AND m.lot_id = l.id
)
SELECT *,
  CASE WHEN kind = 'rodent' THEN current_population + sold_quantity + dead_population
       ELSE current_mass + sold_quantity + dead_mass END AS produced_quantity,
  CASE WHEN (CASE WHEN kind = 'rodent' THEN current_population + sold_quantity + dead_population
                  ELSE current_mass + sold_quantity + dead_mass END) > 0
       THEN round(total_cost / (CASE WHEN kind = 'rodent' THEN current_population + sold_quantity + dead_population
                                    ELSE current_mass + sold_quantity + dead_mass END), 4) END AS cost_per_unit,
  CASE WHEN (CASE WHEN kind = 'rodent' THEN current_population + sold_quantity + dead_population
                  ELSE current_mass + sold_quantity + dead_mass END) > 0
       THEN round(total_cost * sold_quantity / (CASE WHEN kind = 'rodent' THEN current_population + sold_quantity + dead_population
                                                     ELSE current_mass + sold_quantity + dead_mass END), 4)
       ELSE 0 END AS recognized_cogs,
  CASE WHEN (CASE WHEN kind = 'rodent' THEN current_population + sold_quantity + dead_population
                  ELSE current_mass + sold_quantity + dead_mass END) > 0
       THEN round(total_cost * (CASE WHEN kind = 'rodent' THEN current_population ELSE current_mass END) /
         (CASE WHEN kind = 'rodent' THEN current_population + sold_quantity + dead_population
               ELSE current_mass + sold_quantity + dead_mass END), 4)
       ELSE 0 END AS inventory_value,
  CASE WHEN (CASE WHEN kind = 'rodent' THEN current_population + sold_quantity + dead_population
                  ELSE current_mass + sold_quantity + dead_mass END) > 0
       THEN round(total_cost * (CASE WHEN kind = 'rodent' THEN dead_population ELSE dead_mass END) /
         (CASE WHEN kind = 'rodent' THEN current_population + sold_quantity + dead_population
               ELSE current_mass + sold_quantity + dead_mass END), 4)
       ELSE 0 END AS mortality_loss,
  revenue - CASE WHEN (CASE WHEN kind = 'rodent' THEN current_population + sold_quantity + dead_population
                            ELSE current_mass + sold_quantity + dead_mass END) > 0
    THEN total_cost * sold_quantity / (CASE WHEN kind = 'rodent' THEN current_population + sold_quantity + dead_population
                                            ELSE current_mass + sold_quantity + dead_mass END)
    ELSE 0 END AS gross_margin
FROM base;

GRANT SELECT ON public.lot_financial_summary TO authenticated;

REVOKE ALL ON FUNCTION public.register_lot_cost_tx(uuid,text,text,numeric,jsonb,text,timestamptz,numeric,text,numeric,text,text,text,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.consume_feed_tx(uuid,uuid,jsonb,timestamptz,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.post_asset_depreciation_tx(uuid,uuid,date,jsonb,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_lot_cost_tx(uuid,text,text,numeric,jsonb,text,timestamptz,numeric,text,numeric,text,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_feed_tx(uuid,uuid,jsonb,timestamptz,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_asset_depreciation_tx(uuid,uuid,date,jsonb,text) TO authenticated;

CREATE TRIGGER audit_row_change_trg AFTER INSERT OR UPDATE OR DELETE ON public.cost_assets
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
CREATE TRIGGER audit_row_change_trg AFTER INSERT ON public.cost_entries
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

ALTER FUNCTION public.export_organization_data() RENAME TO export_organization_data_base;
REVOKE ALL ON FUNCTION public.export_organization_data_base() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.export_organization_data()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _org uuid := public.get_my_org_id();
  _base jsonb;
BEGIN
  IF _org IS NULL OR NOT public.is_org_admin() THEN
    RAISE EXCEPTION 'OPERATIONAL_EXPORT_ADMIN_REQUIRED';
  END IF;
  _base := public.export_organization_data_base();
  RETURN _base || jsonb_build_object(
    'schema_version', '20260808000001',
    'cost_entries', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.cost_entries t WHERE t.organization_id = _org),
    'feed_inventory_events', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.feed_inventory_events t WHERE t.organization_id = _org),
    'cost_assets', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.cost_assets t WHERE t.organization_id = _org),
    'asset_depreciation_postings', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.asset_depreciation_postings t WHERE t.organization_id = _org)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.export_organization_data() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.export_organization_data() TO authenticated;

COMMIT;
