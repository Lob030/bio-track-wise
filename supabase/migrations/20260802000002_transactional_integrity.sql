-- BioTrack: integridad transaccional e idempotencia de operaciones criticas.

BEGIN;

CREATE TABLE IF NOT EXISTS public.transaction_requests (
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id UUID NOT NULL,
  operation TEXT NOT NULL,
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  PRIMARY KEY (organization_id, actor_user_id, request_id)
);

ALTER TABLE public.transaction_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.transaction_requests FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.begin_transaction_request(
  _request_id UUID,
  _operation TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org UUID := public.get_my_org_id();
  _uid UUID := auth.uid();
  _existing RECORD;
BEGIN
  IF _request_id IS NULL THEN
    RAISE EXCEPTION 'request_id es obligatorio.';
  END IF;
  IF _org IS NULL OR _uid IS NULL OR NOT public.is_org_member() THEN
    RAISE EXCEPTION 'Se requiere una membresia activa.';
  END IF;
  IF _operation IS NULL OR trim(_operation) = '' THEN
    RAISE EXCEPTION 'operation es obligatoria.';
  END IF;

  INSERT INTO public.transaction_requests (
    organization_id, actor_user_id, request_id, operation
  ) VALUES (
    _org, _uid, _request_id, _operation
  )
  ON CONFLICT DO NOTHING;

  IF FOUND THEN
    RETURN NULL;
  END IF;

  SELECT operation, result
  INTO _existing
  FROM public.transaction_requests
  WHERE organization_id = _org
    AND actor_user_id = _uid
    AND request_id = _request_id;

  IF _existing.operation IS DISTINCT FROM _operation THEN
    RAISE EXCEPTION 'request_id ya fue utilizado para otra operacion.';
  END IF;
  IF _existing.result IS NULL THEN
    RAISE EXCEPTION 'La solicitud duplicada no tiene un resultado confirmado.';
  END IF;

  RETURN _existing.result;
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_transaction_request(
  _request_id UUID,
  _operation TEXT,
  _result JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _result IS NULL THEN
    RAISE EXCEPTION 'No se puede finalizar una operacion sin resultado.';
  END IF;

  UPDATE public.transaction_requests
  SET result = _result,
      completed_at = now()
  WHERE organization_id = public.get_my_org_id()
    AND actor_user_id = auth.uid()
    AND request_id = _request_id
    AND operation = _operation
    AND result IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontro la solicitud transaccional pendiente.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.begin_transaction_request(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_transaction_request(UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.register_mortality_tx(
  _request_id UUID,
  _lot_id UUID,
  _males INT DEFAULT 0,
  _females INT DEFAULT 0,
  _unsexed INT DEFAULT 0,
  _mass_grams NUMERIC DEFAULT 0,
  _notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cached JSONB;
  _org UUID := public.get_my_org_id();
  _lot RECORD;
  _event_id UUID;
  _result JSONB;
BEGIN
  _cached := public.begin_transaction_request(_request_id, 'register_mortality');
  IF _cached IS NOT NULL THEN RETURN _cached; END IF;

  SELECT * INTO _lot
  FROM public.lots
  WHERE id = _lot_id
    AND organization_id = _org
    AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote activo no encontrado en la organizacion.';
  END IF;

  _males := COALESCE(_males, 0);
  _females := COALESCE(_females, 0);
  _unsexed := COALESCE(_unsexed, 0);
  _mass_grams := COALESCE(_mass_grams, 0);

  IF _lot.kind = 'rodent' THEN
    IF _males < 0 OR _females < 0 OR _unsexed < 0
       OR (_males + _females + _unsexed) <= 0 THEN
      RAISE EXCEPTION 'Las bajas de roedores deben ser cantidades positivas.';
    END IF;
    IF _males > COALESCE(_lot.males, 0)
       OR _females > COALESCE(_lot.females, 0)
       OR _unsexed > COALESCE(_lot.unsexed, 0) THEN
      RAISE EXCEPTION 'Las bajas exceden la poblacion disponible.';
    END IF;

    UPDATE public.lots
    SET males = COALESCE(males, 0) - _males,
        females = COALESCE(females, 0) - _females,
        unsexed = COALESCE(unsexed, 0) - _unsexed,
        total_deaths = COALESCE(total_deaths, 0) + _males + _females + _unsexed,
        status = CASE
          WHEN COALESCE(males, 0) - _males
             + COALESCE(females, 0) - _females
             + COALESCE(unsexed, 0) - _unsexed = 0
          THEN 'finalizado'::public.lot_status ELSE status END,
        finalized_at = CASE
          WHEN COALESCE(males, 0) - _males
             + COALESCE(females, 0) - _females
             + COALESCE(unsexed, 0) - _unsexed = 0
          THEN now() ELSE finalized_at END
    WHERE id = _lot_id;
  ELSE
    IF _mass_grams <= 0 OR _mass_grams = 'NaN'::numeric
       OR _mass_grams = 'Infinity'::numeric OR _mass_grams = '-Infinity'::numeric THEN
      RAISE EXCEPTION 'La baja de insectos debe indicar una masa positiva y finita.';
    END IF;
    IF _mass_grams > COALESCE(_lot.mass_grams, 0) THEN
      RAISE EXCEPTION 'La baja excede la biomasa disponible.';
    END IF;

    UPDATE public.lots
    SET mass_grams = COALESCE(mass_grams, 0) - _mass_grams,
        status = CASE WHEN COALESCE(mass_grams, 0) - _mass_grams = 0
          THEN 'finalizado'::public.lot_status ELSE status END,
        finalized_at = CASE WHEN COALESCE(mass_grams, 0) - _mass_grams = 0
          THEN now() ELSE finalized_at END
    WHERE id = _lot_id;
  END IF;

  INSERT INTO public.lot_events (
    organization_id, lot_id, actor_user_id, event_type,
    males_delta, females_delta, unsexed_delta, mass_delta, notes
  ) VALUES (
    _org, _lot_id, auth.uid(), 'mortality',
    -_males, -_females, -_unsexed, -_mass_grams, _notes
  ) RETURNING id INTO _event_id;

  _result := jsonb_build_object('success', true, 'event_id', _event_id, 'lot_id', _lot_id);
  PERFORM public.finish_transaction_request(_request_id, 'register_mortality', _result);
  RETURN _result;
END;
$$;

CREATE OR REPLACE FUNCTION public.register_birth_tx(
  _request_id UUID,
  _kind public.kind_type,
  _box_id UUID,
  _species_id UUID,
  _line_id UUID DEFAULT NULL,
  _lot_code TEXT DEFAULT NULL,
  _unsexed INT DEFAULT 0,
  _males INT DEFAULT 0,
  _females INT DEFAULT 0,
  _mass_grams NUMERIC DEFAULT 0,
  _notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cached JSONB;
  _lot_id UUID;
  _result JSONB;
BEGIN
  _cached := public.begin_transaction_request(_request_id, 'register_birth');
  IF _cached IS NOT NULL THEN RETURN _cached; END IF;

  IF _kind = 'rodent' THEN
    _lot_id := public.register_birth(
      _box_id, _species_id, _line_id, _lot_code,
      _unsexed, _males, _females, _notes
    );
  ELSIF _kind = 'insect' THEN
    _lot_id := public.register_insect_birth(
      _box_id, _species_id, _line_id, _lot_code, _mass_grams, _notes
    );
  ELSE
    RAISE EXCEPTION 'Tipo de bioterio no valido.';
  END IF;

  _result := jsonb_build_object('success', true, 'lot_id', _lot_id, 'kind', _kind);
  PERFORM public.finish_transaction_request(_request_id, 'register_birth', _result);
  RETURN _result;
END;
$$;

CREATE OR REPLACE FUNCTION public.move_lot_tx(
  _request_id UUID,
  _lot_id UUID,
  _destination_box_id UUID,
  _reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cached JSONB;
  _result JSONB;
BEGIN
  _cached := public.begin_transaction_request(_request_id, 'move_lot');
  IF _cached IS NOT NULL THEN RETURN _cached; END IF;

  PERFORM public.move_lot(_lot_id, _destination_box_id, _reason);
  _result := jsonb_build_object(
    'success', true,
    'lot_id', _lot_id,
    'destination_box_id', _destination_box_id
  );
  PERFORM public.finish_transaction_request(_request_id, 'move_lot', _result);
  RETURN _result;
END;
$$;

CREATE OR REPLACE FUNCTION public.split_lot_tx(
  _request_id UUID,
  _source_lot_id UUID,
  _sublots JSONB,
  _reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cached JSONB;
  _split_result JSONB;
  _result JSONB;
BEGIN
  _cached := public.begin_transaction_request(_request_id, 'split_lot');
  IF _cached IS NOT NULL THEN RETURN _cached; END IF;

  _split_result := public.split_lot(_source_lot_id, _sublots, _reason);
  _result := jsonb_build_object('success', true) || COALESCE(_split_result, '{}'::jsonb);
  PERFORM public.finish_transaction_request(_request_id, 'split_lot', _result);
  RETURN _result;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_sale_tx(
  _request_id UUID,
  _client_id UUID,
  _items JSONB,
  _discount_pct NUMERIC DEFAULT 0,
  _notes TEXT DEFAULT NULL,
  _delivered_at TIMESTAMPTZ DEFAULT NULL,
  _consume_inventory BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org UUID := public.get_my_org_id();
  _uid UUID := auth.uid();
  _cached JSONB;
  _item JSONB;
  _kind public.kind_type;
  _species_id UUID;
  _size TEXT;
  _qty NUMERIC;
  _unit_price NUMERIC;
  _subtotal NUMERIC := 0;
  _total NUMERIC;
  _order_id UUID;
  _order_item_id UUID;
  _fifo JSONB;
  _allocation JSONB;
  _unfulfilled NUMERIC;
  _taken NUMERIC;
  _result JSONB;
BEGIN
  _cached := public.begin_transaction_request(_request_id, 'create_sale');
  IF _cached IS NOT NULL THEN RETURN _cached; END IF;

  IF _org IS NULL OR _uid IS NULL OR NOT public.is_org_admin() THEN
    RAISE EXCEPTION 'Solo un administrador activo puede crear ventas.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clients
    WHERE id = _client_id AND organization_id = _org
  ) THEN
    RAISE EXCEPTION 'Cliente no encontrado en la organizacion.';
  END IF;
  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'La venta debe contener al menos un producto.';
  END IF;
  IF _discount_pct IS NULL OR _discount_pct < 0 OR _discount_pct > 100
     OR _discount_pct = 'NaN'::numeric
     OR _discount_pct = 'Infinity'::numeric
     OR _discount_pct = '-Infinity'::numeric THEN
    RAISE EXCEPTION 'El descuento debe estar entre 0 y 100.';
  END IF;

  FOR _item IN SELECT value FROM jsonb_array_elements(_items) LOOP
    BEGIN
      _kind := (_item->>'kind')::public.kind_type;
      _species_id := (_item->>'species_id')::UUID;
      _size := trim(_item->>'size_label');
      _qty := (_item->>'quantity')::NUMERIC;
      _unit_price := (_item->>'unit_price')::NUMERIC;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Producto de venta con formato invalido.';
    END;

    IF _qty IS NULL OR _qty <= 0 OR _qty = 'NaN'::numeric
       OR _qty = 'Infinity'::numeric OR _qty = '-Infinity'::numeric THEN
      RAISE EXCEPTION 'La cantidad solicitada debe ser positiva y finita.';
    END IF;
    IF _kind = 'rodent' AND _qty <> trunc(_qty) THEN
      RAISE EXCEPTION 'La cantidad de roedores debe ser un numero entero.';
    END IF;
    IF _unit_price IS NULL OR _unit_price < 0 OR _unit_price = 'NaN'::numeric
       OR _unit_price = 'Infinity'::numeric OR _unit_price = '-Infinity'::numeric THEN
      RAISE EXCEPTION 'El precio unitario debe ser finito y no negativo.';
    END IF;
    IF _size IS NULL OR _size = '' THEN
      RAISE EXCEPTION 'La talla es obligatoria.';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.species
      WHERE id = _species_id AND organization_id = _org AND kind = _kind
    ) THEN
      RAISE EXCEPTION 'Especie no encontrada o incompatible con el tipo indicado.';
    END IF;

    _subtotal := _subtotal + (_qty * _unit_price);
  END LOOP;

  _total := round(_subtotal * (1 - (_discount_pct / 100)), 2);

  INSERT INTO public.orders (
    owner_id, organization_id, client_id, status, discount_pct,
    subtotal_mxn, total_mxn, notes, delivered_at
  ) VALUES (
    _uid, _org, _client_id, 'preparando', round(_discount_pct)::INT,
    round(_subtotal, 2), _total, NULLIF(trim(_notes), ''), _delivered_at
  ) RETURNING id INTO _order_id;

  FOR _item IN SELECT value FROM jsonb_array_elements(_items) LOOP
    _kind := (_item->>'kind')::public.kind_type;
    _species_id := (_item->>'species_id')::UUID;
    _size := trim(_item->>'size_label');
    _qty := (_item->>'quantity')::NUMERIC;
    _unit_price := (_item->>'unit_price')::NUMERIC;

    _fifo := NULL;
    IF _consume_inventory THEN
      IF _kind = 'rodent' THEN
        _fifo := public.fifo_consume_rodents(_species_id, _size, _qty::INT);
      ELSE
        _fifo := public.fifo_consume_insects(_species_id, _size, _qty);
      END IF;

      _unfulfilled := COALESCE((_fifo->>'unfulfilled')::NUMERIC, 0);
      IF _unfulfilled > 0 THEN
        RAISE EXCEPTION 'Stock insuficiente para especie %, talla %. Faltante: %.',
          _species_id, _size, _unfulfilled;
      END IF;
    END IF;

    INSERT INTO public.order_items (
      owner_id, organization_id, order_id, species_id, kind, size_label,
      requested_qty, unit_price, line_total
    ) VALUES (
      _uid, _org, _order_id, _species_id, _kind, _size,
      _qty, _unit_price, round(_qty * _unit_price, 2)
    ) RETURNING id INTO _order_item_id;

    IF _consume_inventory AND jsonb_typeof(_fifo->'allocations') = 'array' THEN
      FOR _allocation IN SELECT value FROM jsonb_array_elements(_fifo->'allocations') LOOP
        _taken := COALESCE(
          (_allocation->>'qty')::NUMERIC,
          (_allocation->>'grams')::NUMERIC
        );
        INSERT INTO public.order_item_allocations (
          owner_id, organization_id, order_item_id, lot_id, qty_taken, finalized_lot
        ) VALUES (
          _uid, _org, _order_item_id, (_allocation->>'lot_id')::UUID,
          _taken, COALESCE((_allocation->>'finalized')::BOOLEAN, false)
        );
      END LOOP;
    END IF;
  END LOOP;

  _result := jsonb_build_object(
    'success', true,
    'order_id', _order_id,
    'subtotal_mxn', round(_subtotal, 2),
    'total_mxn', _total,
    'inventory_consumed', _consume_inventory
  );
  PERFORM public.finish_transaction_request(_request_id, 'create_sale', _result);
  RETURN _result;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_purchase_tx(
  _request_id UUID,
  _kind public.kind_type,
  _species_id UUID,
  _line_id UUID DEFAULT NULL,
  _population INT DEFAULT NULL,
  _males INT DEFAULT 0,
  _females INT DEFAULT 0,
  _mass_grams NUMERIC DEFAULT NULL,
  _total_cost NUMERIC DEFAULT 0,
  _invoice_id TEXT DEFAULT NULL,
  _provider TEXT DEFAULT NULL,
  _notes TEXT DEFAULT NULL,
  _create_lot BOOLEAN DEFAULT false,
  _box_id UUID DEFAULT NULL,
  _lot_code TEXT DEFAULT NULL,
  _started_at DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org UUID := public.get_my_org_id();
  _uid UUID := auth.uid();
  _cached JSONB;
  _purchase_id UUID;
  _lot_id UUID;
  _unsexed INT;
  _result JSONB;
BEGIN
  _cached := public.begin_transaction_request(_request_id, 'create_purchase');
  IF _cached IS NOT NULL THEN RETURN _cached; END IF;

  IF _org IS NULL OR _uid IS NULL OR NOT public.is_org_admin() THEN
    RAISE EXCEPTION 'Solo un administrador activo puede registrar compras.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.species
    WHERE id = _species_id AND organization_id = _org AND kind = _kind
  ) THEN
    RAISE EXCEPTION 'Especie no encontrada o incompatible con el tipo de compra.';
  END IF;
  IF _line_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.genetic_lines
    WHERE id = _line_id AND organization_id = _org AND species_id = _species_id
  ) THEN
    RAISE EXCEPTION 'Linea genetica no encontrada para la especie y organizacion.';
  END IF;
  IF _total_cost IS NULL OR _total_cost < 0 OR _total_cost = 'NaN'::numeric
     OR _total_cost = 'Infinity'::numeric OR _total_cost = '-Infinity'::numeric THEN
    RAISE EXCEPTION 'El costo debe ser finito y no negativo.';
  END IF;

  IF _kind = 'rodent' THEN
    IF _population IS NULL OR _population <= 0
       OR COALESCE(_males, 0) < 0 OR COALESCE(_females, 0) < 0
       OR COALESCE(_males, 0) + COALESCE(_females, 0) > _population THEN
      RAISE EXCEPTION 'La poblacion de roedores y su distribucion son invalidas.';
    END IF;
    _unsexed := _population - COALESCE(_males, 0) - COALESCE(_females, 0);
  ELSE
    IF _mass_grams IS NULL OR _mass_grams <= 0 OR _mass_grams = 'NaN'::numeric
       OR _mass_grams = 'Infinity'::numeric OR _mass_grams = '-Infinity'::numeric THEN
      RAISE EXCEPTION 'La masa de insectos debe ser positiva y finita.';
    END IF;
  END IF;

  IF _create_lot THEN
    IF _box_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.boxes
      WHERE id = _box_id AND organization_id = _org AND kind = _kind
    ) THEN
      RAISE EXCEPTION 'Caja no encontrada o incompatible con la compra.';
    END IF;
    IF _started_at IS NULL OR _started_at > CURRENT_DATE THEN
      RAISE EXCEPTION 'La fecha inicial del lote no puede estar en el futuro.';
    END IF;
  END IF;

  INSERT INTO public.warehouse_purchases (
    owner_id, organization_id, invoice_id, kind, species_id, line_id,
    population, mass_grams, total_cost, provider, notes
  ) VALUES (
    _uid, _org, NULLIF(trim(_invoice_id), ''), _kind, _species_id, _line_id,
    CASE WHEN _kind = 'rodent' THEN _population ELSE NULL END,
    CASE WHEN _kind = 'insect' THEN _mass_grams ELSE NULL END,
    _total_cost, NULLIF(trim(_provider), ''), NULLIF(trim(_notes), '')
  ) RETURNING id INTO _purchase_id;

  IF _create_lot THEN
    INSERT INTO public.lots (
      owner_id, organization_id, kind, lot_code, lot_type, species_id, line_id,
      box_id, provider_purchase_id, males, females, unsexed, mass_grams,
      notes, started_at, status
    ) VALUES (
      _uid, _org, _kind, NULLIF(trim(_lot_code), ''), 'engorda',
      _species_id, _line_id, _box_id, _purchase_id,
      CASE WHEN _kind = 'rodent' THEN COALESCE(_males, 0) ELSE 0 END,
      CASE WHEN _kind = 'rodent' THEN COALESCE(_females, 0) ELSE 0 END,
      CASE WHEN _kind = 'rodent' THEN _unsexed ELSE 0 END,
      CASE WHEN _kind = 'insect' THEN _mass_grams ELSE 0 END,
      _notes, _started_at, 'active'
    ) RETURNING id INTO _lot_id;

    UPDATE public.warehouse_purchases
    SET converted_to_lot_id = _lot_id
    WHERE id = _purchase_id;
  END IF;

  _result := jsonb_build_object(
    'success', true,
    'purchase_id', _purchase_id,
    'lot_id', _lot_id,
    'lot_created', _create_lot
  );
  PERFORM public.finish_transaction_request(_request_id, 'create_purchase', _result);
  RETURN _result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fifo_consume_rodents(UUID, TEXT, INT) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fifo_consume_insects(UUID, TEXT, NUMERIC) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.register_mortality(UUID, INT, INT, INT, TEXT) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.register_birth(UUID, UUID, UUID, TEXT, INT, INT, INT, TEXT) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.register_insect_birth(UUID, UUID, UUID, TEXT, NUMERIC, TEXT) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.move_lot(UUID, UUID, TEXT) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.split_lot(UUID, JSONB, TEXT) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.register_mortality_tx(UUID, UUID, INT, INT, INT, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_birth_tx(UUID, public.kind_type, UUID, UUID, UUID, TEXT, INT, INT, INT, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.move_lot_tx(UUID, UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.split_lot_tx(UUID, UUID, JSONB, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_sale_tx(UUID, UUID, JSONB, NUMERIC, TEXT, TIMESTAMPTZ, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_purchase_tx(UUID, public.kind_type, UUID, UUID, INT, INT, INT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, BOOLEAN, UUID, TEXT, DATE) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.register_mortality_tx(UUID, UUID, INT, INT, INT, NUMERIC, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.register_birth_tx(UUID, public.kind_type, UUID, UUID, UUID, TEXT, INT, INT, INT, NUMERIC, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.move_lot_tx(UUID, UUID, UUID, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.split_lot_tx(UUID, UUID, JSONB, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_sale_tx(UUID, UUID, JSONB, NUMERIC, TEXT, TIMESTAMPTZ, BOOLEAN) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_purchase_tx(UUID, public.kind_type, UUID, UUID, INT, INT, INT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, BOOLEAN, UUID, TEXT, DATE) FROM PUBLIC, anon;

COMMIT;
