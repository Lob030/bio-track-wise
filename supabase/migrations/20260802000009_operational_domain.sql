-- BioTrack: dominio operativo biologico y libro inmutable de inventario.

BEGIN;

DO $$ BEGIN
  CREATE TYPE public.inventory_event_type AS ENUM (
    'opening', 'birth_in', 'purchase_in', 'transfer_in', 'transfer_out',
    'mortality_out', 'sale_out', 'adjustment', 'inventory_in', 'inventory_out'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.reproduction_event_type AS ENUM (
    'mating', 'separation', 'gestation_confirmed', 'birth', 'hatch', 'failed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- lot_events conserva el hecho biologico u operativo, no solo un texto libre.
ALTER TABLE public.lot_events
  ADD COLUMN IF NOT EXISTS event_at timestamptz,
  ADD COLUMN IF NOT EXISTS cause text,
  ADD COLUMN IF NOT EXISTS observations text,
  ADD COLUMN IF NOT EXISTS source_box_id uuid,
  ADD COLUMN IF NOT EXISTS destination_box_id uuid,
  ADD COLUMN IF NOT EXISTS related_lot_id uuid,
  ADD COLUMN IF NOT EXISTS evidence_url text,
  ADD COLUMN IF NOT EXISTS reference_type text,
  ADD COLUMN IF NOT EXISTS reference_id text,
  ADD COLUMN IF NOT EXISTS request_id uuid;

UPDATE public.lot_events
SET event_at = COALESCE(event_at, created_at),
    observations = COALESCE(observations, notes),
    cause = CASE
      WHEN event_type = 'mortality' THEN COALESCE(NULLIF(cause, ''), NULLIF(metadata->>'cause', ''), 'historica_sin_clasificar')
      ELSE cause
    END,
    source_box_id = CASE
      WHEN metadata->>'old_box' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       AND EXISTS (
         SELECT 1 FROM public.boxes b
         WHERE b.id = (metadata->>'old_box')::uuid
           AND b.organization_id = lot_events.organization_id
       )
      THEN (metadata->>'old_box')::uuid ELSE source_box_id END,
    destination_box_id = CASE
      WHEN metadata->>'new_box' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       AND EXISTS (
         SELECT 1 FROM public.boxes b
         WHERE b.id = (metadata->>'new_box')::uuid
           AND b.organization_id = lot_events.organization_id
       )
      THEN (metadata->>'new_box')::uuid ELSE destination_box_id END;

ALTER TABLE public.lot_events ALTER COLUMN event_at SET DEFAULT now();
ALTER TABLE public.lot_events ALTER COLUMN event_at SET NOT NULL;
ALTER TABLE public.lot_events
  ADD CONSTRAINT lot_events_effective_date_valid CHECK (
    event_at >= timestamptz '2000-01-01 00:00:00+00'
    AND event_at <= now() + interval '5 minutes'
  ),
  ADD CONSTRAINT lot_events_mortality_cause_required CHECK (
    event_type <> 'mortality' OR NULLIF(trim(cause), '') IS NOT NULL
  ),
  ADD CONSTRAINT lot_events_evidence_url_valid CHECK (
    evidence_url IS NULL OR evidence_url ~* '^https?://'
  );

ALTER TABLE public.lot_events ADD CONSTRAINT lot_events_org_source_box_fkey
  FOREIGN KEY (organization_id, source_box_id)
  REFERENCES public.boxes (organization_id, id) ON DELETE RESTRICT;
ALTER TABLE public.lot_events ADD CONSTRAINT lot_events_org_destination_box_fkey
  FOREIGN KEY (organization_id, destination_box_id)
  REFERENCES public.boxes (organization_id, id) ON DELETE RESTRICT;
ALTER TABLE public.lot_events ADD CONSTRAINT lot_events_org_related_lot_fkey
  FOREIGN KEY (organization_id, related_lot_id)
  REFERENCES public.lots (organization_id, id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION public.normalize_lot_operational_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _request_id text := NULLIF(current_setting('app.inventory_request_id', true), '');
  _cause text := NULLIF(current_setting('app.inventory_cause', true), '');
  _observations text := NULLIF(current_setting('app.inventory_observations', true), '');
  _evidence text := NULLIF(current_setting('app.inventory_evidence_url', true), '');
BEGIN
  NEW.event_at := COALESCE(NEW.event_at, now());
  NEW.observations := COALESCE(NEW.observations, _observations, NEW.notes);
  NEW.cause := COALESCE(
    NULLIF(trim(NEW.cause), ''), _cause, NULLIF(NEW.metadata->>'cause', ''),
    CASE WHEN NEW.event_type = 'mortality' THEN NULLIF(trim(NEW.notes), '') END
  );
  NEW.evidence_url := COALESCE(NEW.evidence_url, _evidence);
  IF NEW.request_id IS NULL AND _request_id IS NOT NULL THEN
    BEGIN NEW.request_id := _request_id::uuid;
    EXCEPTION WHEN invalid_text_representation THEN NEW.request_id := NULL;
    END;
  END IF;
  IF NEW.source_box_id IS NULL AND NEW.metadata->>'old_box' ~* '^[0-9a-f-]{36}$' THEN
    NEW.source_box_id := (NEW.metadata->>'old_box')::uuid;
  END IF;
  IF NEW.destination_box_id IS NULL AND NEW.metadata->>'new_box' ~* '^[0-9a-f-]{36}$' THEN
    NEW.destination_box_id := (NEW.metadata->>'new_box')::uuid;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER normalize_lot_operational_event_trg
BEFORE INSERT ON public.lot_events
FOR EACH ROW EXECUTE FUNCTION public.normalize_lot_operational_event();

CREATE INDEX IF NOT EXISTS lot_events_org_effective_idx
  ON public.lot_events (organization_id, event_at DESC, event_type);
CREATE INDEX IF NOT EXISTS lot_events_request_idx
  ON public.lot_events (request_id) WHERE request_id IS NOT NULL;

CREATE TABLE public.inventory_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  lot_id uuid NOT NULL,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type public.inventory_event_type NOT NULL,
  event_at timestamptz NOT NULL DEFAULT now(),
  males_delta int NOT NULL DEFAULT 0,
  females_delta int NOT NULL DEFAULT 0,
  unsexed_delta int NOT NULL DEFAULT 0,
  mass_delta numeric(12,2) NOT NULL DEFAULT 0,
  balance_before jsonb NOT NULL,
  balance_after jsonb NOT NULL,
  cause text,
  observations text,
  source_box_id uuid,
  destination_box_id uuid,
  reference_type text,
  reference_id text,
  evidence_url text,
  request_id uuid,
  origin text NOT NULL DEFAULT 'database:lot_balance_trigger',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_events_org_lot_fkey
    FOREIGN KEY (organization_id, lot_id)
    REFERENCES public.lots (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT inventory_events_org_source_box_fkey
    FOREIGN KEY (organization_id, source_box_id)
    REFERENCES public.boxes (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT inventory_events_org_destination_box_fkey
    FOREIGN KEY (organization_id, destination_box_id)
    REFERENCES public.boxes (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT inventory_events_date_valid CHECK (
    event_at >= timestamptz '2000-01-01 00:00:00+00'
    AND event_at <= now() + interval '5 minutes'
  ),
  CONSTRAINT inventory_events_evidence_url_valid CHECK (
    evidence_url IS NULL OR evidence_url ~* '^https?://'
  ),
  CONSTRAINT inventory_events_has_change CHECK (
    event_type = 'opening'
    OR males_delta <> 0 OR females_delta <> 0 OR unsexed_delta <> 0 OR mass_delta <> 0
  ),
  CONSTRAINT inventory_events_kind_shape CHECK (
    jsonb_typeof(balance_before) = 'object' AND jsonb_typeof(balance_after) = 'object'
  )
);

CREATE INDEX inventory_events_org_effective_idx
  ON public.inventory_events (organization_id, event_at DESC, event_type);
CREATE INDEX inventory_events_lot_effective_idx
  ON public.inventory_events (lot_id, event_at DESC, id);
CREATE INDEX inventory_events_reference_idx
  ON public.inventory_events (organization_id, reference_type, reference_id)
  WHERE reference_id IS NOT NULL;
CREATE UNIQUE INDEX inventory_events_request_type_lot_uidx
  ON public.inventory_events (request_id, event_type, lot_id)
  WHERE request_id IS NOT NULL;

ALTER TABLE public.inventory_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY inventory_events_select_member ON public.inventory_events
  FOR SELECT USING (
    organization_id = public.get_my_org_id() AND public.is_org_member()
  );
REVOKE INSERT, UPDATE, DELETE ON public.inventory_events FROM authenticated, anon;
GRANT SELECT ON public.inventory_events TO authenticated;

-- Un evento base hace reconciliables los lotes que ya existian al desplegar.
INSERT INTO public.inventory_events (
  organization_id, lot_id, actor_user_id, event_type, event_at,
  males_delta, females_delta, unsexed_delta, mass_delta,
  balance_before, balance_after, cause, origin
)
SELECT organization_id, id, owner_id, 'opening', created_at,
       COALESCE(males, 0), COALESCE(females, 0), COALESCE(unsexed, 0), COALESCE(mass_grams, 0),
       jsonb_build_object('males', 0, 'females', 0, 'unsexed', 0, 'mass_grams', 0),
       jsonb_build_object(
         'males', COALESCE(males, 0), 'females', COALESCE(females, 0),
         'unsexed', COALESCE(unsexed, 0), 'mass_grams', COALESCE(mass_grams, 0)
       ),
       'Saldo inicial al habilitar el libro operativo', 'migration:operational_domain'
FROM public.lots;

CREATE OR REPLACE FUNCTION public.capture_lot_inventory_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _event_type public.inventory_event_type;
  _configured_type text := NULLIF(current_setting('app.inventory_event_type', true), '');
  _cause text := NULLIF(current_setting('app.inventory_cause', true), '');
  _observations text := NULLIF(current_setting('app.inventory_observations', true), '');
  _reference_type text := NULLIF(current_setting('app.inventory_reference_type', true), '');
  _reference_id text := NULLIF(current_setting('app.inventory_reference_id', true), '');
  _evidence_url text := NULLIF(current_setting('app.inventory_evidence_url', true), '');
  _request_id uuid;
  _males_delta int;
  _females_delta int;
  _unsexed_delta int;
  _mass_delta numeric;
  _before jsonb;
  _after jsonb;
BEGIN
  BEGIN
    _request_id := NULLIF(current_setting('app.inventory_request_id', true), '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    _request_id := NULL;
  END;

  IF TG_OP = 'INSERT' THEN
    _males_delta := COALESCE(NEW.males, 0);
    _females_delta := COALESCE(NEW.females, 0);
    _unsexed_delta := COALESCE(NEW.unsexed, 0);
    _mass_delta := COALESCE(NEW.mass_grams, 0);
    _before := jsonb_build_object('males', 0, 'females', 0, 'unsexed', 0, 'mass_grams', 0);
    IF _males_delta = 0 AND _females_delta = 0 AND _unsexed_delta = 0 AND _mass_delta = 0 THEN
      _event_type := 'opening';
    ELSIF _configured_type IS NOT NULL THEN
      _event_type := _configured_type::public.inventory_event_type;
    ELSIF NEW.provider_purchase_id IS NOT NULL THEN
      _event_type := 'purchase_in';
      _reference_type := COALESCE(_reference_type, 'warehouse_purchase');
      _reference_id := COALESCE(_reference_id, NEW.provider_purchase_id::text);
    ELSIF NEW.lot_type = 'birth' THEN
      _event_type := 'birth_in';
    ELSE
      _event_type := 'inventory_in';
    END IF;
  ELSE
    _males_delta := COALESCE(NEW.males, 0) - COALESCE(OLD.males, 0);
    _females_delta := COALESCE(NEW.females, 0) - COALESCE(OLD.females, 0);
    _unsexed_delta := COALESCE(NEW.unsexed, 0) - COALESCE(OLD.unsexed, 0);
    _mass_delta := COALESCE(NEW.mass_grams, 0) - COALESCE(OLD.mass_grams, 0);
    IF _males_delta = 0 AND _females_delta = 0 AND _unsexed_delta = 0 AND _mass_delta = 0 THEN
      RETURN NEW;
    END IF;
    _before := jsonb_build_object(
      'males', COALESCE(OLD.males, 0), 'females', COALESCE(OLD.females, 0),
      'unsexed', COALESCE(OLD.unsexed, 0), 'mass_grams', COALESCE(OLD.mass_grams, 0)
    );
    IF _configured_type IS NOT NULL THEN
      _event_type := _configured_type::public.inventory_event_type;
    ELSIF _males_delta <= 0 AND _females_delta <= 0 AND _unsexed_delta <= 0 AND _mass_delta <= 0 THEN
      _event_type := 'inventory_out';
    ELSIF _males_delta >= 0 AND _females_delta >= 0 AND _unsexed_delta >= 0 AND _mass_delta >= 0 THEN
      _event_type := 'inventory_in';
    ELSE
      _event_type := 'adjustment';
    END IF;
  END IF;

  _after := jsonb_build_object(
    'males', COALESCE(NEW.males, 0), 'females', COALESCE(NEW.females, 0),
    'unsexed', COALESCE(NEW.unsexed, 0), 'mass_grams', COALESCE(NEW.mass_grams, 0)
  );

  INSERT INTO public.inventory_events (
    organization_id, lot_id, actor_user_id, event_type, event_at,
    males_delta, females_delta, unsexed_delta, mass_delta,
    balance_before, balance_after, cause, observations,
    source_box_id, destination_box_id, reference_type, reference_id,
    evidence_url, request_id
  ) VALUES (
    NEW.organization_id, NEW.id, auth.uid(), _event_type, now(),
    _males_delta, _females_delta, _unsexed_delta, _mass_delta,
    _before, _after, _cause, _observations,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.box_id ELSE NULL END,
    NEW.box_id, _reference_type, _reference_id, _evidence_url, _request_id
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER capture_lot_inventory_event_trg
AFTER INSERT OR UPDATE OF males, females, unsexed, mass_grams ON public.lots
FOR EACH ROW EXECUTE FUNCTION public.capture_lot_inventory_event();

CREATE TABLE public.reproduction_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type public.reproduction_event_type NOT NULL,
  event_at timestamptz NOT NULL DEFAULT now(),
  primary_lot_id uuid NOT NULL,
  secondary_lot_id uuid,
  offspring_lot_id uuid,
  species_id uuid NOT NULL,
  line_id uuid,
  box_id uuid,
  quantity int,
  mass_grams numeric(12,2),
  cause text,
  observations text,
  evidence_url text,
  reference_type text,
  reference_id text,
  request_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reproduction_events_request_uidx UNIQUE (organization_id, request_id),
  CONSTRAINT reproduction_primary_fkey FOREIGN KEY (organization_id, primary_lot_id)
    REFERENCES public.lots (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT reproduction_secondary_fkey FOREIGN KEY (organization_id, secondary_lot_id)
    REFERENCES public.lots (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT reproduction_offspring_fkey FOREIGN KEY (organization_id, offspring_lot_id)
    REFERENCES public.lots (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT reproduction_species_fkey FOREIGN KEY (organization_id, species_id)
    REFERENCES public.species (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT reproduction_line_fkey FOREIGN KEY (organization_id, species_id, line_id)
    REFERENCES public.genetic_lines (organization_id, species_id, id) ON DELETE RESTRICT,
  CONSTRAINT reproduction_box_fkey FOREIGN KEY (organization_id, box_id)
    REFERENCES public.boxes (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT reproduction_distinct_parents CHECK (secondary_lot_id IS NULL OR secondary_lot_id <> primary_lot_id),
  CONSTRAINT reproduction_quantity_positive CHECK (quantity IS NULL OR quantity > 0),
  CONSTRAINT reproduction_mass_positive CHECK (mass_grams IS NULL OR mass_grams > 0),
  CONSTRAINT reproduction_date_valid CHECK (
    event_at >= timestamptz '2000-01-01 00:00:00+00'
    AND event_at <= now() + interval '5 minutes'
  ),
  CONSTRAINT reproduction_evidence_url_valid CHECK (evidence_url IS NULL OR evidence_url ~* '^https?://')
);

CREATE INDEX reproduction_events_org_effective_idx
  ON public.reproduction_events (organization_id, event_at DESC, event_type);
CREATE INDEX reproduction_events_primary_idx
  ON public.reproduction_events (primary_lot_id, event_at DESC);
CREATE INDEX reproduction_events_secondary_idx
  ON public.reproduction_events (secondary_lot_id, event_at DESC)
  WHERE secondary_lot_id IS NOT NULL;

ALTER TABLE public.reproduction_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY reproduction_events_select_member ON public.reproduction_events
  FOR SELECT USING (organization_id = public.get_my_org_id() AND public.is_org_member());
REVOKE INSERT, UPDATE, DELETE ON public.reproduction_events FROM authenticated, anon;
GRANT SELECT ON public.reproduction_events TO authenticated;

CREATE OR REPLACE FUNCTION public.prevent_operational_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'El historial operativo es inmutable: no se permite %.', TG_OP;
END;
$$;

CREATE TRIGGER prevent_inventory_event_mutation_trg
BEFORE UPDATE OR DELETE ON public.inventory_events
FOR EACH ROW EXECUTE FUNCTION public.prevent_operational_event_mutation();
CREATE TRIGGER prevent_reproduction_event_mutation_trg
BEFORE UPDATE OR DELETE ON public.reproduction_events
FOR EACH ROW EXECUTE FUNCTION public.prevent_operational_event_mutation();
CREATE TRIGGER prevent_lot_event_mutation_trg
BEFORE UPDATE OR DELETE ON public.lot_events
FOR EACH ROW EXECUTE FUNCTION public.prevent_operational_event_mutation();

CREATE OR REPLACE VIEW public.lot_balance_reconciliation
WITH (security_invoker = true)
AS
SELECT
  l.organization_id,
  l.id AS lot_id,
  l.kind,
  l.lot_code,
  l.status,
  COALESCE(l.males, 0) AS current_males,
  COALESCE(l.females, 0) AS current_females,
  COALESCE(l.unsexed, 0) AS current_unsexed,
  COALESCE(l.mass_grams, 0) AS current_mass_grams,
  COALESCE(sum(e.males_delta), 0)::int AS ledger_males,
  COALESCE(sum(e.females_delta), 0)::int AS ledger_females,
  COALESCE(sum(e.unsexed_delta), 0)::int AS ledger_unsexed,
  COALESCE(sum(e.mass_delta), 0)::numeric(12,2) AS ledger_mass_grams,
  COALESCE(l.males, 0) = COALESCE(sum(e.males_delta), 0)
    AND COALESCE(l.females, 0) = COALESCE(sum(e.females_delta), 0)
    AND COALESCE(l.unsexed, 0) = COALESCE(sum(e.unsexed_delta), 0)
    AND COALESCE(l.mass_grams, 0) = COALESCE(sum(e.mass_delta), 0) AS is_consistent
FROM public.lots l
LEFT JOIN public.inventory_events e ON e.lot_id = l.id AND e.organization_id = l.organization_id
GROUP BY l.organization_id, l.id;

GRANT SELECT ON public.lot_balance_reconciliation TO authenticated;

COMMIT;
