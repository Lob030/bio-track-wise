-- BioTrack: restricciones definitivas, relaciones por organizacion e indices.

BEGIN;

CREATE OR REPLACE FUNCTION public.is_finite_nonnegative(_value numeric)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT _value IS NOT NULL
     AND _value >= 0
     AND _value <> 'NaN'::numeric
     AND _value <> 'Infinity'::numeric
     AND _value <> '-Infinity'::numeric
$$;

REVOKE EXECUTE ON FUNCTION public.is_finite_nonnegative(numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_finite_nonnegative(numeric) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.valid_species_size_rules(
  _rules jsonb,
  _kind public.kind_type
) RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
DECLARE
  _rule jsonb;
  _min_days numeric;
  _max_days numeric;
BEGIN
  IF _rules IS NULL OR jsonb_typeof(_rules) <> 'array' THEN RETURN false; END IF;
  FOR _rule IN SELECT value FROM jsonb_array_elements(_rules) LOOP
    BEGIN
      IF trim(COALESCE(_rule->>'label', '')) = '' THEN RETURN false; END IF;
      _min_days := (_rule->>'min_days')::numeric;
      _max_days := (_rule->>'max_days')::numeric;
      IF NOT public.is_finite_nonnegative(_min_days)
         OR NOT public.is_finite_nonnegative(_max_days)
         OR _max_days < _min_days THEN RETURN false; END IF;
      IF NOT public.is_finite_nonnegative(COALESCE((_rule->>'price_mxn')::numeric, 0)) THEN RETURN false; END IF;
      IF _kind = 'rodent' AND (
        NOT public.is_finite_nonnegative(COALESCE((_rule->>'min_weight_g')::numeric, 0))
        OR NOT public.is_finite_nonnegative(COALESCE((_rule->>'max_weight_g')::numeric, 0))
        OR COALESCE((_rule->>'max_weight_g')::numeric, 0) < COALESCE((_rule->>'min_weight_g')::numeric, 0)
        OR NOT public.is_finite_nonnegative(COALESCE((_rule->>'daily_feed_g')::numeric, 0))
      ) THEN RETURN false; END IF;
      IF _kind = 'insect' AND (
        NOT public.is_finite_nonnegative(COALESCE((_rule->>'individuals_per_gram')::numeric, 0))
        OR COALESCE((_rule->>'individuals_per_gram')::numeric, 0) <= 0
      ) THEN RETURN false; END IF;
    EXCEPTION WHEN OTHERS THEN
      RETURN false;
    END;
  END LOOP;
  RETURN true;
END;
$$;

ALTER TABLE public.lots ALTER COLUMN species_id SET NOT NULL;

-- organization_id es el propietario logico. Eliminar una cuenta de Auth no
-- debe borrar inventario ni trazabilidad creada por esa persona.
DO $$
DECLARE _table text;
BEGIN
  FOREACH _table IN ARRAY ARRAY[
    'species', 'genetic_lines', 'boxes', 'lots',
    'warehouse_food', 'warehouse_cleaning', 'warehouse_tools',
    'warehouse_packaging', 'warehouse_purchases', 'clients', 'orders',
    'order_items', 'order_item_allocations', 'alert_rules', 'alerts',
    'ai_conversations', 'ai_messages', 'ai_pending_actions'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN owner_id DROP NOT NULL', _table);
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', _table, _table || '_owner_id_fkey');
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE SET NULL',
      _table, _table || '_owner_id_fkey'
    );
  END LOOP;
END;
$$;

ALTER TABLE public.species
  ADD CONSTRAINT species_name_not_blank CHECK (trim(name) <> ''),
  ADD CONSTRAINT species_price_nonnegative CHECK (public.is_finite_nonnegative(unit_price_mxn)),
  ADD CONSTRAINT species_size_rules_valid CHECK (public.valid_species_size_rules(size_rules, kind));

ALTER TABLE public.genetic_lines
  ADD CONSTRAINT genetic_lines_name_not_blank CHECK (trim(name) <> '');

ALTER TABLE public.boxes
  ADD CONSTRAINT boxes_code_not_blank CHECK (trim(code) <> ''),
  ADD CONSTRAINT boxes_capacity_positive CHECK (capacity IS NULL OR capacity > 0);

ALTER TABLE public.lots
  ADD CONSTRAINT lots_code_not_blank CHECK (lot_code IS NULL OR trim(lot_code) <> ''),
  ADD CONSTRAINT lots_males_nonnegative CHECK (males IS NOT NULL AND males >= 0),
  ADD CONSTRAINT lots_females_nonnegative CHECK (females IS NOT NULL AND females >= 0),
  ADD CONSTRAINT lots_unsexed_nonnegative CHECK (unsexed IS NOT NULL AND unsexed >= 0),
  ADD CONSTRAINT lots_mass_nonnegative CHECK (public.is_finite_nonnegative(mass_grams)),
  ADD CONSTRAINT lots_deaths_nonnegative CHECK (total_deaths IS NOT NULL AND total_deaths >= 0),
  ADD CONSTRAINT lots_parent_not_self CHECK (parent_lot_id IS NULL OR parent_lot_id <> id),
  ADD CONSTRAINT lots_status_dates_compatible CHECK (
    (status = 'active' AND finalized_at IS NULL)
    OR (status = 'finalizado' AND finalized_at IS NOT NULL)
  ),
  ADD CONSTRAINT lots_kind_quantities_compatible CHECK (
    kind <> 'insect' OR (males = 0 AND females = 0 AND unsexed = 0)
  );

ALTER TABLE public.warehouse_food
  ADD CONSTRAINT warehouse_food_name_not_blank CHECK (trim(name) <> ''),
  ADD CONSTRAINT warehouse_food_quantity_nonnegative CHECK (public.is_finite_nonnegative(quantity_grams)),
  ADD CONSTRAINT warehouse_food_cost_nonnegative CHECK (unit_cost IS NULL OR public.is_finite_nonnegative(unit_cost)),
  ADD CONSTRAINT warehouse_food_min_stock_nonnegative CHECK (min_stock_grams >= 0);

ALTER TABLE public.warehouse_cleaning
  ADD CONSTRAINT warehouse_cleaning_name_not_blank CHECK (trim(name) <> ''),
  ADD CONSTRAINT warehouse_cleaning_quantity_nonnegative CHECK (public.is_finite_nonnegative(quantity)),
  ADD CONSTRAINT warehouse_cleaning_cost_nonnegative CHECK (cost IS NULL OR public.is_finite_nonnegative(cost));

ALTER TABLE public.warehouse_tools
  ADD CONSTRAINT warehouse_tools_name_not_blank CHECK (trim(name) <> ''),
  ADD CONSTRAINT warehouse_tools_value_nonnegative CHECK (value IS NULL OR public.is_finite_nonnegative(value));

ALTER TABLE public.warehouse_packaging
  ADD CONSTRAINT warehouse_packaging_name_not_blank CHECK (trim(name) <> ''),
  ADD CONSTRAINT warehouse_packaging_units_nonnegative CHECK (units >= 0),
  ADD CONSTRAINT warehouse_packaging_cost_nonnegative CHECK (unit_cost IS NULL OR public.is_finite_nonnegative(unit_cost));

ALTER TABLE public.warehouse_purchases
  ADD CONSTRAINT warehouse_purchases_invoice_not_blank CHECK (invoice_id IS NULL OR trim(invoice_id) <> ''),
  ADD CONSTRAINT warehouse_purchases_population_nonnegative CHECK (population IS NULL OR population >= 0),
  ADD CONSTRAINT warehouse_purchases_mass_nonnegative CHECK (mass_grams IS NULL OR public.is_finite_nonnegative(mass_grams)),
  ADD CONSTRAINT warehouse_purchases_cost_nonnegative CHECK (total_cost IS NULL OR public.is_finite_nonnegative(total_cost)),
  ADD CONSTRAINT warehouse_purchases_kind_quantity CHECK (
    (kind = 'rodent' AND COALESCE(population, 0) > 0 AND COALESCE(mass_grams, 0) = 0)
    OR (kind = 'insect' AND COALESCE(mass_grams, 0) > 0 AND COALESCE(population, 0) = 0)
  );

ALTER TABLE public.clients
  ADD CONSTRAINT clients_name_not_blank CHECK (trim(name) <> ''),
  ADD CONSTRAINT clients_phone_not_blank CHECK (trim(phone) <> '');

ALTER TABLE public.orders
  ADD CONSTRAINT orders_discount_range CHECK (discount_pct BETWEEN 0 AND 100),
  ADD CONSTRAINT orders_subtotal_nonnegative CHECK (public.is_finite_nonnegative(subtotal_mxn)),
  ADD CONSTRAINT orders_total_nonnegative CHECK (public.is_finite_nonnegative(total_mxn)),
  ADD CONSTRAINT orders_total_not_over_subtotal CHECK (total_mxn <= subtotal_mxn),
  ADD CONSTRAINT orders_status_dates_compatible CHECK (
    status = 'preparando' OR (status = 'historial' AND delivered_at IS NOT NULL)
  );

ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_quantity_positive CHECK (
    public.is_finite_nonnegative(requested_qty) AND requested_qty > 0
  ),
  ADD CONSTRAINT order_items_price_nonnegative CHECK (public.is_finite_nonnegative(unit_price)),
  ADD CONSTRAINT order_items_total_nonnegative CHECK (public.is_finite_nonnegative(line_total)),
  ADD CONSTRAINT order_items_rodent_integer_quantity CHECK (kind <> 'rodent' OR requested_qty = trunc(requested_qty));

ALTER TABLE public.order_item_allocations
  ADD CONSTRAINT allocations_quantity_positive CHECK (
    public.is_finite_nonnegative(qty_taken) AND qty_taken > 0
  );

ALTER TABLE public.alert_rules
  ADD CONSTRAINT alert_rules_scope_valid CHECK (scope IN ('all', 'lot')),
  ADD CONSTRAINT alert_rules_scope_lot_compatible CHECK (
    (scope = 'lot' AND lot_id IS NOT NULL) OR (scope = 'all' AND lot_id IS NULL)
  ),
  ADD CONSTRAINT alert_rules_operator_valid CHECK (operator IN ('>', '<', '=', '==', '>=', '<=')),
  ADD CONSTRAINT alert_rules_threshold_nonnegative CHECK (public.is_finite_nonnegative(threshold)),
  ADD CONSTRAINT alert_rules_frequency_nonnegative CHECK (frequency_days >= 0);

ALTER TABLE public.organization_invites
  ADD CONSTRAINT organization_invites_dates_valid CHECK (
    expires_at > created_at
    AND (accepted_at IS NULL OR accepted_at >= created_at)
    AND (revoked_at IS NULL OR revoked_at >= created_at)
  );

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_ai_usage_nonnegative CHECK (ai_prompts_used_this_month >= 0);

ALTER TABLE public.ai_conversations
  ADD CONSTRAINT ai_conversations_title_not_blank CHECK (title IS NULL OR trim(title) <> '');

ALTER TABLE public.ai_messages
  ADD CONSTRAINT ai_messages_role_valid CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  ADD CONSTRAINT ai_messages_content_not_blank CHECK (trim(content) <> '');

ALTER TABLE public.ai_pending_actions
  ADD CONSTRAINT ai_actions_type_not_blank CHECK (trim(action_type) <> ''),
  ADD CONSTRAINT ai_actions_summary_not_blank CHECK (trim(summary) <> ''),
  ADD CONSTRAINT ai_actions_status_dates_compatible CHECK (
    (status = 'pending' AND resolved_at IS NULL)
    OR (status <> 'pending' AND resolved_at IS NOT NULL)
  );

-- Referencias compuestas: la FK comprueba pertenencia a organizacion, especie
-- y tipo sin depender de validaciones del cliente.
CREATE UNIQUE INDEX species_org_id_uidx ON public.species (organization_id, id);
CREATE UNIQUE INDEX species_org_id_kind_uidx ON public.species (organization_id, id, kind);
CREATE UNIQUE INDEX lines_org_id_uidx ON public.genetic_lines (organization_id, id);
CREATE UNIQUE INDEX lines_org_species_id_uidx ON public.genetic_lines (organization_id, species_id, id);
CREATE UNIQUE INDEX boxes_org_id_uidx ON public.boxes (organization_id, id);
CREATE UNIQUE INDEX boxes_org_id_kind_uidx ON public.boxes (organization_id, id, kind);
CREATE UNIQUE INDEX lots_org_id_uidx ON public.lots (organization_id, id);
CREATE UNIQUE INDEX purchases_org_id_uidx ON public.warehouse_purchases (organization_id, id);
CREATE UNIQUE INDEX clients_org_id_uidx ON public.clients (organization_id, id);
CREATE UNIQUE INDEX orders_org_id_uidx ON public.orders (organization_id, id);
CREATE UNIQUE INDEX order_items_org_id_uidx ON public.order_items (organization_id, id);
CREATE UNIQUE INDEX alert_rules_org_id_uidx ON public.alert_rules (organization_id, id);
CREATE UNIQUE INDEX ai_conversations_org_id_uidx ON public.ai_conversations (organization_id, id);
CREATE UNIQUE INDEX ai_actions_org_id_uidx ON public.ai_pending_actions (organization_id, id);

CREATE UNIQUE INDEX species_org_kind_name_uidx
  ON public.species (organization_id, kind, lower(trim(name)));
CREATE UNIQUE INDEX genetic_lines_org_species_name_uidx
  ON public.genetic_lines (organization_id, species_id, lower(trim(name)));
CREATE UNIQUE INDEX boxes_org_code_uidx
  ON public.boxes (organization_id, lower(trim(code)));
CREATE UNIQUE INDEX lots_org_code_uidx
  ON public.lots (organization_id, lower(trim(lot_code))) WHERE lot_code IS NOT NULL;
CREATE UNIQUE INDEX purchases_org_invoice_uidx
  ON public.warehouse_purchases (organization_id, lower(trim(invoice_id))) WHERE invoice_id IS NOT NULL;
CREATE UNIQUE INDEX alert_rules_org_name_uidx
  ON public.alert_rules (organization_id, lower(trim(name))) WHERE name IS NOT NULL AND trim(name) <> '';

CREATE INDEX lots_org_species_status_started_idx
  ON public.lots (organization_id, species_id, status, started_at, id);
CREATE INDEX lots_org_parent_idx ON public.lots (organization_id, parent_lot_id);
CREATE INDEX lots_org_box_status_idx ON public.lots (organization_id, box_id, status);
CREATE INDEX lines_org_species_idx ON public.genetic_lines (organization_id, species_id);
CREATE INDEX orders_org_client_created_idx ON public.orders (organization_id, client_id, created_at DESC);
CREATE INDEX allocations_org_lot_idx ON public.order_item_allocations (organization_id, lot_id);

ALTER TABLE public.genetic_lines DROP CONSTRAINT genetic_lines_species_id_fkey;
ALTER TABLE public.genetic_lines ADD CONSTRAINT genetic_lines_org_species_fkey
  FOREIGN KEY (organization_id, species_id)
  REFERENCES public.species (organization_id, id) ON DELETE RESTRICT;

ALTER TABLE public.lots DROP CONSTRAINT lots_species_id_fkey;
ALTER TABLE public.lots DROP CONSTRAINT lots_line_id_fkey;
ALTER TABLE public.lots DROP CONSTRAINT lots_box_id_fkey;
ALTER TABLE public.lots DROP CONSTRAINT lots_parent_lot_id_fkey;
ALTER TABLE public.lots ADD CONSTRAINT lots_org_species_kind_fkey
  FOREIGN KEY (organization_id, species_id, kind)
  REFERENCES public.species (organization_id, id, kind) ON DELETE RESTRICT;
ALTER TABLE public.lots ADD CONSTRAINT lots_org_line_species_fkey
  FOREIGN KEY (organization_id, species_id, line_id)
  REFERENCES public.genetic_lines (organization_id, species_id, id) ON DELETE RESTRICT;
ALTER TABLE public.lots ADD CONSTRAINT lots_org_box_kind_fkey
  FOREIGN KEY (organization_id, box_id, kind)
  REFERENCES public.boxes (organization_id, id, kind) ON DELETE RESTRICT;
ALTER TABLE public.lots ADD CONSTRAINT lots_org_parent_fkey
  FOREIGN KEY (organization_id, parent_lot_id)
  REFERENCES public.lots (organization_id, id) ON DELETE RESTRICT;

ALTER TABLE public.warehouse_purchases DROP CONSTRAINT warehouse_purchases_species_id_fkey;
ALTER TABLE public.warehouse_purchases DROP CONSTRAINT warehouse_purchases_line_id_fkey;
ALTER TABLE public.warehouse_purchases DROP CONSTRAINT warehouse_purchases_converted_to_lot_id_fkey;
ALTER TABLE public.warehouse_purchases ADD CONSTRAINT purchases_org_species_kind_fkey
  FOREIGN KEY (organization_id, species_id, kind)
  REFERENCES public.species (organization_id, id, kind) ON DELETE RESTRICT;
ALTER TABLE public.warehouse_purchases ADD CONSTRAINT purchases_org_line_species_fkey
  FOREIGN KEY (organization_id, species_id, line_id)
  REFERENCES public.genetic_lines (organization_id, species_id, id) ON DELETE RESTRICT;
ALTER TABLE public.warehouse_purchases ADD CONSTRAINT purchases_org_lot_fkey
  FOREIGN KEY (organization_id, converted_to_lot_id)
  REFERENCES public.lots (organization_id, id) ON DELETE RESTRICT;
ALTER TABLE public.lots ADD CONSTRAINT lots_org_purchase_fkey
  FOREIGN KEY (organization_id, provider_purchase_id)
  REFERENCES public.warehouse_purchases (organization_id, id) ON DELETE RESTRICT;

ALTER TABLE public.orders DROP CONSTRAINT orders_client_id_fkey;
ALTER TABLE public.orders ADD CONSTRAINT orders_org_client_fkey
  FOREIGN KEY (organization_id, client_id)
  REFERENCES public.clients (organization_id, id) ON DELETE RESTRICT;

ALTER TABLE public.order_items DROP CONSTRAINT order_items_order_id_fkey;
ALTER TABLE public.order_items DROP CONSTRAINT order_items_species_id_fkey;
ALTER TABLE public.order_items ADD CONSTRAINT order_items_org_order_fkey
  FOREIGN KEY (organization_id, order_id)
  REFERENCES public.orders (organization_id, id) ON DELETE CASCADE;
ALTER TABLE public.order_items ADD CONSTRAINT order_items_org_species_kind_fkey
  FOREIGN KEY (organization_id, species_id, kind)
  REFERENCES public.species (organization_id, id, kind) ON DELETE RESTRICT;

ALTER TABLE public.order_item_allocations DROP CONSTRAINT order_item_allocations_order_item_id_fkey;
ALTER TABLE public.order_item_allocations DROP CONSTRAINT order_item_allocations_lot_id_fkey;
ALTER TABLE public.order_item_allocations ADD CONSTRAINT allocations_org_item_fkey
  FOREIGN KEY (organization_id, order_item_id)
  REFERENCES public.order_items (organization_id, id) ON DELETE CASCADE;
ALTER TABLE public.order_item_allocations ADD CONSTRAINT allocations_org_lot_fkey
  FOREIGN KEY (organization_id, lot_id)
  REFERENCES public.lots (organization_id, id) ON DELETE RESTRICT;

ALTER TABLE public.alert_rules DROP CONSTRAINT alert_rules_lot_id_fkey;
ALTER TABLE public.alert_rules ADD CONSTRAINT alert_rules_org_lot_fkey
  FOREIGN KEY (organization_id, lot_id)
  REFERENCES public.lots (organization_id, id) ON DELETE CASCADE;
ALTER TABLE public.alert_rules ADD CONSTRAINT alert_rules_org_species_fkey
  FOREIGN KEY (organization_id, species_id)
  REFERENCES public.species (organization_id, id) ON DELETE RESTRICT;

ALTER TABLE public.alerts DROP CONSTRAINT alerts_rule_id_fkey;
ALTER TABLE public.alerts DROP CONSTRAINT alerts_lot_id_fkey;
ALTER TABLE public.alerts ADD CONSTRAINT alerts_org_rule_fkey
  FOREIGN KEY (organization_id, rule_id)
  REFERENCES public.alert_rules (organization_id, id) ON DELETE CASCADE;
ALTER TABLE public.alerts ADD CONSTRAINT alerts_org_lot_fkey
  FOREIGN KEY (organization_id, lot_id)
  REFERENCES public.lots (organization_id, id) ON DELETE CASCADE;

ALTER TABLE public.ai_messages DROP CONSTRAINT ai_messages_conversation_id_fkey;
ALTER TABLE public.ai_messages ADD CONSTRAINT ai_messages_org_conversation_fkey
  FOREIGN KEY (organization_id, conversation_id)
  REFERENCES public.ai_conversations (organization_id, id) ON DELETE CASCADE;
ALTER TABLE public.ai_pending_actions DROP CONSTRAINT ai_pending_actions_conversation_id_fkey;
ALTER TABLE public.ai_pending_actions ADD CONSTRAINT ai_actions_org_conversation_fkey
  FOREIGN KEY (organization_id, conversation_id)
  REFERENCES public.ai_conversations (organization_id, id) ON DELETE CASCADE;
ALTER TABLE public.ai_messages ADD CONSTRAINT ai_messages_org_pending_action_fkey
  FOREIGN KEY (organization_id, pending_action_id)
  REFERENCES public.ai_pending_actions (organization_id, id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.validate_lot_integrity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _parent RECORD;
BEGIN
  IF NEW.started_at < DATE '2000-01-01' OR NEW.started_at > CURRENT_DATE THEN
    RAISE EXCEPTION 'DATA_QUALITY: la fecha de inicio del lote no es valida.';
  END IF;
  IF NEW.finalized_at IS NOT NULL AND NEW.finalized_at::date < NEW.started_at THEN
    RAISE EXCEPTION 'DATA_QUALITY: la fecha de finalizacion precede al inicio.';
  END IF;
  IF NEW.parent_lot_id IS NOT NULL THEN
    SELECT organization_id, kind, species_id, line_id INTO _parent
    FROM public.lots WHERE id = NEW.parent_lot_id;
    IF NOT FOUND
       OR _parent.organization_id <> NEW.organization_id
       OR _parent.kind <> NEW.kind
       OR _parent.species_id <> NEW.species_id
       OR _parent.line_id IS DISTINCT FROM NEW.line_id THEN
      RAISE EXCEPTION 'DATA_QUALITY: padre e hijo deben pertenecer a la misma organizacion, especie y linea.';
    END IF;
  END IF;
  IF NEW.parent_lot_id IS NOT NULL AND EXISTS (
    WITH RECURSIVE ancestors AS (
      SELECT id, parent_lot_id FROM public.lots WHERE id = NEW.parent_lot_id
      UNION ALL
      SELECT l.id, l.parent_lot_id
      FROM public.lots l JOIN ancestors a ON l.id = a.parent_lot_id
    )
    SELECT 1 FROM ancestors WHERE id = NEW.id
  ) THEN
    RAISE EXCEPTION 'DATA_QUALITY: la genealogia de lotes no puede contener ciclos.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_lot_integrity_trg
BEFORE INSERT OR UPDATE OF started_at, finalized_at, parent_lot_id ON public.lots
FOR EACH ROW EXECUTE FUNCTION public.validate_lot_integrity();

CREATE OR REPLACE FUNCTION public.validate_business_dates()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'orders' AND NEW.delivered_at IS NOT NULL
     AND NEW.delivered_at::date < NEW.created_at::date THEN
    RAISE EXCEPTION 'DATA_QUALITY: la entrega no puede preceder a la venta.';
  ELSIF TG_TABLE_NAME = 'organization_invites' AND NEW.expires_at <= now() AND TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'DATA_QUALITY: la invitacion debe expirar en el futuro.';
  ELSIF TG_TABLE_NAME = 'warehouse_cleaning' AND NEW.expiry_date < DATE '2000-01-01' THEN
    RAISE EXCEPTION 'DATA_QUALITY: la fecha de caducidad no es valida.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_order_dates_trg
BEFORE INSERT OR UPDATE OF delivered_at ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.validate_business_dates();
CREATE TRIGGER validate_invite_dates_trg
BEFORE INSERT OR UPDATE OF expires_at ON public.organization_invites
FOR EACH ROW EXECUTE FUNCTION public.validate_business_dates();
CREATE TRIGGER validate_cleaning_dates_trg
BEFORE INSERT OR UPDATE OF expiry_date ON public.warehouse_cleaning
FOR EACH ROW EXECUTE FUNCTION public.validate_business_dates();

CREATE OR REPLACE FUNCTION public.validate_alert_rule_integrity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _species_kind public.kind_type;
  _lot_kind public.kind_type;
BEGIN
  IF NEW.species_id IS NOT NULL THEN
    SELECT kind INTO _species_kind
    FROM public.species
    WHERE id = NEW.species_id AND organization_id = NEW.organization_id;
    IF _species_kind IS NULL
       OR (NEW.animal_kind <> 'both' AND NEW.animal_kind <> _species_kind::text) THEN
      RAISE EXCEPTION 'DATA_QUALITY: la especie no corresponde al tipo de la alerta.';
    END IF;
  END IF;
  IF NEW.lot_id IS NOT NULL THEN
    SELECT kind INTO _lot_kind
    FROM public.lots
    WHERE id = NEW.lot_id AND organization_id = NEW.organization_id;
    IF _lot_kind IS NULL
       OR (NEW.animal_kind <> 'both' AND NEW.animal_kind <> _lot_kind::text) THEN
      RAISE EXCEPTION 'DATA_QUALITY: el lote no corresponde al tipo de la alerta.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_alert_rule_integrity_trg
BEFORE INSERT OR UPDATE OF organization_id, animal_kind, species_id, lot_id ON public.alert_rules
FOR EACH ROW EXECUTE FUNCTION public.validate_alert_rule_integrity();

COMMIT;
