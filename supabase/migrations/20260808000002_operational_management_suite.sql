-- BioTrack: jornada operativa, ubicaciones, protocolos, sanidad, reproduccion,
-- planeacion, compras e indicadores ejecutivos.

BEGIN;

ALTER TABLE public.organizations
  ADD COLUMN default_labor_cost_per_hour numeric(12,2) NOT NULL DEFAULT 0,
  ADD CONSTRAINT organizations_labor_cost_nonnegative CHECK (default_labor_cost_per_hour >= 0);

CREATE TABLE public.facility_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  parent_id uuid,
  location_type text NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  capacity_boxes int,
  target_temperature_c numeric(6,2),
  temperature_tolerance_c numeric(6,2),
  target_humidity_pct numeric(6,2),
  humidity_tolerance_pct numeric(6,2),
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT facility_locations_type_valid CHECK (location_type IN ('site','room','rack','level','position')),
  CONSTRAINT facility_locations_code_not_blank CHECK (trim(code) <> ''),
  CONSTRAINT facility_locations_name_not_blank CHECK (trim(name) <> ''),
  CONSTRAINT facility_locations_capacity_positive CHECK (capacity_boxes IS NULL OR capacity_boxes > 0),
  CONSTRAINT facility_locations_temperature_valid CHECK (
    target_temperature_c IS NULL OR target_temperature_c BETWEEN -20 AND 60
  ),
  CONSTRAINT facility_locations_humidity_valid CHECK (
    target_humidity_pct IS NULL OR target_humidity_pct BETWEEN 0 AND 100
  ),
  CONSTRAINT facility_locations_tolerances_valid CHECK (
    (temperature_tolerance_c IS NULL OR temperature_tolerance_c >= 0) AND
    (humidity_tolerance_pct IS NULL OR humidity_tolerance_pct >= 0)
  ),
  CONSTRAINT facility_locations_org_id_uidx UNIQUE (organization_id, id),
  CONSTRAINT facility_locations_parent_fkey FOREIGN KEY (organization_id, parent_id)
    REFERENCES public.facility_locations(organization_id, id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX facility_locations_root_code_uidx
  ON public.facility_locations(organization_id, lower(trim(code))) WHERE parent_id IS NULL;
CREATE UNIQUE INDEX facility_locations_child_code_uidx
  ON public.facility_locations(organization_id, parent_id, lower(trim(code))) WHERE parent_id IS NOT NULL;
CREATE INDEX facility_locations_tree_idx ON public.facility_locations(organization_id, parent_id, location_type);

ALTER TABLE public.boxes ADD COLUMN location_id uuid;
ALTER TABLE public.boxes ADD CONSTRAINT boxes_location_fkey
  FOREIGN KEY (organization_id, location_id)
  REFERENCES public.facility_locations(organization_id, id) ON DELETE RESTRICT;
CREATE INDEX boxes_location_idx ON public.boxes(organization_id, location_id) WHERE location_id IS NOT NULL;

CREATE TABLE public.box_location_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  box_id uuid NOT NULL,
  from_location_id uuid,
  to_location_id uuid NOT NULL,
  moved_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL,
  request_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT box_location_box_fkey FOREIGN KEY (organization_id, box_id)
    REFERENCES public.boxes(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT box_location_from_fkey FOREIGN KEY (organization_id, from_location_id)
    REFERENCES public.facility_locations(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT box_location_to_fkey FOREIGN KEY (organization_id, to_location_id)
    REFERENCES public.facility_locations(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT box_location_reason_not_blank CHECK (trim(reason) <> ''),
  CONSTRAINT box_location_request_uidx UNIQUE (organization_id, request_id)
);
CREATE INDEX box_location_events_box_idx ON public.box_location_events(box_id, moved_at DESC);

CREATE TABLE public.operational_protocols (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  name text NOT NULL,
  kind public.kind_type,
  species_id uuid,
  line_id uuid,
  stage text,
  active boolean NOT NULL DEFAULT true,
  task_definitions jsonb NOT NULL DEFAULT '[]'::jsonb,
  daily_feed_grams_per_unit numeric(12,4),
  setup_substrate_grams numeric(12,2),
  replacement_substrate_grams numeric(12,2),
  maximum_density numeric(12,2),
  weighing_frequency_days int,
  cleaning_frequency_days int,
  feeding_frequency_days int NOT NULL DEFAULT 1,
  target_temperature_c numeric(6,2),
  target_humidity_pct numeric(6,2),
  sale_age_days int,
  separation_age_days int,
  instructions text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT operational_protocols_name_not_blank CHECK (trim(name) <> ''),
  CONSTRAINT operational_protocols_task_array CHECK (jsonb_typeof(task_definitions) = 'array'),
  CONSTRAINT operational_protocols_values_valid CHECK (
    (daily_feed_grams_per_unit IS NULL OR daily_feed_grams_per_unit >= 0) AND
    (setup_substrate_grams IS NULL OR setup_substrate_grams >= 0) AND
    (replacement_substrate_grams IS NULL OR replacement_substrate_grams >= 0) AND
    (maximum_density IS NULL OR maximum_density > 0) AND
    (weighing_frequency_days IS NULL OR weighing_frequency_days > 0) AND
    (cleaning_frequency_days IS NULL OR cleaning_frequency_days > 0) AND
    feeding_frequency_days > 0 AND
    (target_humidity_pct IS NULL OR target_humidity_pct BETWEEN 0 AND 100) AND
    (sale_age_days IS NULL OR sale_age_days > 0) AND
    (separation_age_days IS NULL OR separation_age_days > 0)
  ),
  CONSTRAINT operational_protocols_species_fkey FOREIGN KEY (organization_id, species_id)
    REFERENCES public.species(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT operational_protocols_line_fkey FOREIGN KEY (organization_id, species_id, line_id)
    REFERENCES public.genetic_lines(organization_id, species_id, id) ON DELETE RESTRICT,
  CONSTRAINT operational_protocols_org_id_uidx UNIQUE (organization_id, id)
);
CREATE UNIQUE INDEX operational_protocols_org_name_uidx
  ON public.operational_protocols(organization_id, lower(trim(name)));

CREATE TABLE public.protocol_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  protocol_id uuid NOT NULL,
  lot_id uuid,
  box_id uuid,
  starts_on date NOT NULL DEFAULT current_date,
  ends_on date,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT protocol_assignments_protocol_fkey FOREIGN KEY (organization_id, protocol_id)
    REFERENCES public.operational_protocols(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT protocol_assignments_lot_fkey FOREIGN KEY (organization_id, lot_id)
    REFERENCES public.lots(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT protocol_assignments_box_fkey FOREIGN KEY (organization_id, box_id)
    REFERENCES public.boxes(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT protocol_assignments_target CHECK (num_nonnulls(lot_id, box_id) = 1),
  CONSTRAINT protocol_assignments_dates CHECK (ends_on IS NULL OR ends_on >= starts_on),
  CONSTRAINT protocol_assignments_org_id_uidx UNIQUE (organization_id, id)
);
CREATE UNIQUE INDEX protocol_assignments_active_lot_uidx
  ON public.protocol_assignments(organization_id, protocol_id, lot_id) WHERE active AND lot_id IS NOT NULL;
CREATE UNIQUE INDEX protocol_assignments_active_box_uidx
  ON public.protocol_assignments(organization_id, protocol_id, box_id) WHERE active AND box_id IS NOT NULL;

CREATE TABLE public.operational_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  protocol_id uuid,
  assignment_id uuid,
  task_type text NOT NULL,
  title text NOT NULL,
  instructions text,
  lot_id uuid,
  box_id uuid,
  location_id uuid,
  due_at timestamptz NOT NULL,
  priority text NOT NULL DEFAULT 'normal',
  status text NOT NULL DEFAULT 'pending',
  assigned_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_at timestamptz,
  completed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  completion_notes text,
  measured_value numeric,
  measured_unit text,
  evidence_url text,
  labor_minutes int,
  request_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT operational_tasks_type_valid CHECK (
    task_type IN ('feeding','cleaning','substrate','weighing','inspection','separation','health','inventory','other')
  ),
  CONSTRAINT operational_tasks_title_not_blank CHECK (trim(title) <> ''),
  CONSTRAINT operational_tasks_priority_valid CHECK (priority IN ('low','normal','high','critical')),
  CONSTRAINT operational_tasks_status_valid CHECK (status IN ('pending','in_progress','completed','skipped','cancelled')),
  CONSTRAINT operational_tasks_labor_valid CHECK (labor_minutes IS NULL OR labor_minutes >= 0),
  CONSTRAINT operational_tasks_evidence_valid CHECK (evidence_url IS NULL OR evidence_url ~* '^https?://'),
  CONSTRAINT operational_tasks_protocol_fkey FOREIGN KEY (organization_id, protocol_id)
    REFERENCES public.operational_protocols(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT operational_tasks_assignment_fkey FOREIGN KEY (organization_id, assignment_id)
    REFERENCES public.protocol_assignments(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT operational_tasks_lot_fkey FOREIGN KEY (organization_id, lot_id)
    REFERENCES public.lots(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT operational_tasks_box_fkey FOREIGN KEY (organization_id, box_id)
    REFERENCES public.boxes(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT operational_tasks_location_fkey FOREIGN KEY (organization_id, location_id)
    REFERENCES public.facility_locations(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT operational_tasks_request_uidx UNIQUE (organization_id, request_id),
  CONSTRAINT operational_tasks_org_id_uidx UNIQUE (organization_id, id)
);
CREATE INDEX operational_tasks_daily_idx
  ON public.operational_tasks(organization_id, status, due_at, priority);
CREATE UNIQUE INDEX operational_tasks_generated_uidx
  ON public.operational_tasks(organization_id, assignment_id, task_type, due_at)
  WHERE assignment_id IS NOT NULL;

CREATE TABLE public.task_completion_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  task_id uuid NOT NULL,
  outcome text NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  measured_value numeric,
  measured_unit text,
  evidence_url text,
  labor_minutes int,
  request_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT task_completion_task_fkey FOREIGN KEY (organization_id, task_id)
    REFERENCES public.operational_tasks(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT task_completion_outcome_valid CHECK (outcome IN ('completed','skipped')),
  CONSTRAINT task_completion_labor_valid CHECK (labor_minutes IS NULL OR labor_minutes >= 0),
  CONSTRAINT task_completion_request_uidx UNIQUE (organization_id, request_id)
);

CREATE TABLE public.health_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  case_code text NOT NULL,
  lot_id uuid NOT NULL,
  box_id uuid,
  status text NOT NULL DEFAULT 'open',
  severity text NOT NULL DEFAULT 'medium',
  opened_at timestamptz NOT NULL DEFAULT now(),
  opened_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  clinical_signs text NOT NULL,
  diagnosis text,
  quarantine boolean NOT NULL DEFAULT false,
  sale_restricted boolean NOT NULL DEFAULT false,
  reproduction_restricted boolean NOT NULL DEFAULT false,
  veterinarian text,
  laboratory_reference text,
  evidence_url text,
  follow_up_at timestamptz,
  closed_at timestamptz,
  closed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT health_cases_code_not_blank CHECK (trim(case_code) <> ''),
  CONSTRAINT health_cases_signs_not_blank CHECK (trim(clinical_signs) <> ''),
  CONSTRAINT health_cases_status_valid CHECK (status IN ('open','monitoring','resolved','closed')),
  CONSTRAINT health_cases_severity_valid CHECK (severity IN ('low','medium','high','critical')),
  CONSTRAINT health_cases_evidence_valid CHECK (evidence_url IS NULL OR evidence_url ~* '^https?://'),
  CONSTRAINT health_cases_lot_fkey FOREIGN KEY (organization_id, lot_id)
    REFERENCES public.lots(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT health_cases_box_fkey FOREIGN KEY (organization_id, box_id)
    REFERENCES public.boxes(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT health_cases_org_id_uidx UNIQUE (organization_id, id)
);
CREATE UNIQUE INDEX health_cases_org_code_uidx ON public.health_cases(organization_id, lower(trim(case_code)));
CREATE INDEX health_cases_open_idx ON public.health_cases(organization_id, status, severity, follow_up_at);

CREATE TABLE public.health_treatments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  health_case_id uuid NOT NULL,
  administered_at timestamptz NOT NULL DEFAULT now(),
  medication text NOT NULL,
  dose numeric(12,4),
  dose_unit text,
  route text,
  duration_days int,
  response text,
  notes text,
  evidence_url text,
  request_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT health_treatments_case_fkey FOREIGN KEY (organization_id, health_case_id)
    REFERENCES public.health_cases(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT health_treatments_medication_not_blank CHECK (trim(medication) <> ''),
  CONSTRAINT health_treatments_values_valid CHECK (
    (dose IS NULL OR dose > 0) AND (duration_days IS NULL OR duration_days > 0)
  ),
  CONSTRAINT health_treatments_request_uidx UNIQUE (organization_id, request_id)
);

CREATE TABLE public.breeding_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  code text NOT NULL,
  primary_lot_id uuid NOT NULL,
  secondary_lot_id uuid,
  method text NOT NULL DEFAULT 'pair',
  status text NOT NULL DEFAULT 'planned',
  planned_start date NOT NULL,
  actual_start date,
  expected_birth_date date,
  expected_weaning_date date,
  target_offspring int,
  offspring_count int NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT breeding_programs_method_valid CHECK (method IN ('pair','trio','group','colony')),
  CONSTRAINT breeding_programs_status_valid CHECK (status IN ('planned','active','gestating','born','weaned','failed','closed')),
  CONSTRAINT breeding_programs_counts_valid CHECK (
    (target_offspring IS NULL OR target_offspring > 0) AND offspring_count >= 0
  ),
  CONSTRAINT breeding_programs_primary_fkey FOREIGN KEY (organization_id, primary_lot_id)
    REFERENCES public.lots(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT breeding_programs_secondary_fkey FOREIGN KEY (organization_id, secondary_lot_id)
    REFERENCES public.lots(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT breeding_programs_distinct CHECK (secondary_lot_id IS NULL OR secondary_lot_id <> primary_lot_id),
  CONSTRAINT breeding_programs_org_id_uidx UNIQUE (organization_id, id)
);
CREATE UNIQUE INDEX breeding_programs_org_code_uidx ON public.breeding_programs(organization_id, lower(trim(code)));

ALTER TABLE public.reproduction_events ADD COLUMN breeding_program_id uuid;
ALTER TABLE public.reproduction_events ADD CONSTRAINT reproduction_breeding_program_fkey
  FOREIGN KEY (organization_id, breeding_program_id)
  REFERENCES public.breeding_programs(organization_id, id) ON DELETE RESTRICT;

CREATE TABLE public.supply_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  sku text NOT NULL,
  name text NOT NULL,
  category text NOT NULL,
  unit text NOT NULL,
  current_quantity numeric(14,4) NOT NULL DEFAULT 0,
  minimum_quantity numeric(14,4) NOT NULL DEFAULT 0,
  average_unit_cost numeric(14,4) NOT NULL DEFAULT 0,
  preferred_vendor text,
  lead_time_days int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supply_items_text_valid CHECK (trim(sku) <> '' AND trim(name) <> '' AND trim(unit) <> ''),
  CONSTRAINT supply_items_category_valid CHECK (
    category IN ('feed','substrate','medication','cleaning','packaging','equipment','other')
  ),
  CONSTRAINT supply_items_values_valid CHECK (
    current_quantity >= 0 AND minimum_quantity >= 0 AND average_unit_cost >= 0 AND lead_time_days >= 0
  ),
  CONSTRAINT supply_items_org_id_uidx UNIQUE (organization_id, id)
);
CREATE UNIQUE INDEX supply_items_org_sku_uidx ON public.supply_items(organization_id, lower(trim(sku)));

CREATE TABLE public.supply_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  supply_item_id uuid NOT NULL,
  batch_code text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  expiry_date date,
  quantity_received numeric(14,4) NOT NULL,
  quantity_remaining numeric(14,4) NOT NULL,
  unit_cost numeric(14,4) NOT NULL,
  vendor text,
  document_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supply_batches_item_fkey FOREIGN KEY (organization_id, supply_item_id)
    REFERENCES public.supply_items(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT supply_batches_values_valid CHECK (
    trim(batch_code) <> '' AND quantity_received > 0 AND quantity_remaining BETWEEN 0 AND quantity_received AND unit_cost >= 0
  ),
  CONSTRAINT supply_batches_expiry_valid CHECK (expiry_date IS NULL OR expiry_date >= received_at::date),
  CONSTRAINT supply_batches_org_id_uidx UNIQUE (organization_id, id),
  CONSTRAINT supply_batches_code_uidx UNIQUE (organization_id, supply_item_id, batch_code)
);

CREATE TABLE public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  order_number text NOT NULL,
  vendor text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  ordered_at timestamptz,
  expected_at date,
  received_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT purchase_orders_text_valid CHECK (trim(order_number) <> '' AND trim(vendor) <> ''),
  CONSTRAINT purchase_orders_status_valid CHECK (status IN ('draft','ordered','partial','received','cancelled')),
  CONSTRAINT purchase_orders_org_id_uidx UNIQUE (organization_id, id)
);
CREATE UNIQUE INDEX purchase_orders_org_number_uidx ON public.purchase_orders(organization_id, lower(trim(order_number)));

CREATE TABLE public.purchase_order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  purchase_order_id uuid NOT NULL,
  supply_item_id uuid NOT NULL,
  quantity_ordered numeric(14,4) NOT NULL,
  quantity_received numeric(14,4) NOT NULL DEFAULT 0,
  unit_cost numeric(14,4) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT purchase_order_lines_order_fkey FOREIGN KEY (organization_id, purchase_order_id)
    REFERENCES public.purchase_orders(organization_id, id) ON DELETE CASCADE,
  CONSTRAINT purchase_order_lines_item_fkey FOREIGN KEY (organization_id, supply_item_id)
    REFERENCES public.supply_items(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT purchase_order_lines_values_valid CHECK (
    quantity_ordered > 0 AND quantity_received BETWEEN 0 AND quantity_ordered AND unit_cost >= 0
  ),
  CONSTRAINT purchase_order_lines_item_uidx UNIQUE (organization_id, purchase_order_id, supply_item_id),
  CONSTRAINT purchase_order_lines_org_id_uidx UNIQUE (organization_id, id)
);

CREATE TABLE public.supply_inventory_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  supply_item_id uuid NOT NULL,
  batch_id uuid,
  event_type text NOT NULL,
  quantity_delta numeric(14,4) NOT NULL,
  balance_before numeric(14,4) NOT NULL,
  balance_after numeric(14,4) NOT NULL,
  unit_cost numeric(14,4) NOT NULL DEFAULT 0,
  event_at timestamptz NOT NULL DEFAULT now(),
  reference_type text,
  reference_id text,
  notes text,
  request_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supply_inventory_events_item_fkey FOREIGN KEY (organization_id, supply_item_id)
    REFERENCES public.supply_items(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT supply_inventory_events_batch_fkey FOREIGN KEY (organization_id, batch_id)
    REFERENCES public.supply_batches(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT supply_inventory_events_type_valid CHECK (event_type IN ('receipt','consumption','adjustment','waste')),
  CONSTRAINT supply_inventory_events_balances_valid CHECK (balance_before >= 0 AND balance_after >= 0 AND unit_cost >= 0),
  CONSTRAINT supply_inventory_events_request_uidx UNIQUE (organization_id, request_id)
);

-- RLS and grants.
ALTER TABLE public.facility_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.box_location_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_protocols ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.protocol_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_completion_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_treatments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.breeding_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supply_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supply_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supply_inventory_events ENABLE ROW LEVEL SECURITY;

DO $$ DECLARE _table text; BEGIN
  FOREACH _table IN ARRAY ARRAY[
    'facility_locations','box_location_events','operational_protocols','protocol_assignments',
    'operational_tasks','task_completion_events','health_cases','health_treatments',
    'breeding_programs','supply_items','supply_batches','purchase_orders',
    'purchase_order_lines','supply_inventory_events'
  ] LOOP
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (organization_id = public.get_my_org_id() AND public.is_org_member())', _table || '_member_select', _table);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.set_current_organization()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF public.get_my_org_id() IS NULL THEN RAISE EXCEPTION 'Se requiere membresia activa.'; END IF;
  NEW.organization_id:=public.get_my_org_id(); RETURN NEW;
END $$;
CREATE TRIGGER set_current_organization_trg BEFORE INSERT ON public.purchase_order_lines
  FOR EACH ROW EXECUTE FUNCTION public.set_current_organization();

CREATE POLICY facility_locations_admin_all ON public.facility_locations FOR ALL
  USING (organization_id = public.get_my_org_id() AND public.is_org_admin())
  WITH CHECK (organization_id = public.get_my_org_id() AND public.is_org_admin());
CREATE POLICY operational_protocols_admin_all ON public.operational_protocols FOR ALL
  USING (organization_id = public.get_my_org_id() AND public.is_org_admin())
  WITH CHECK (organization_id = public.get_my_org_id() AND public.is_org_admin());
CREATE POLICY protocol_assignments_admin_all ON public.protocol_assignments FOR ALL
  USING (organization_id = public.get_my_org_id() AND public.is_org_admin())
  WITH CHECK (organization_id = public.get_my_org_id() AND public.is_org_admin());
CREATE POLICY breeding_programs_admin_all ON public.breeding_programs FOR ALL
  USING (organization_id = public.get_my_org_id() AND public.is_org_admin())
  WITH CHECK (organization_id = public.get_my_org_id() AND public.is_org_admin());
CREATE POLICY supply_items_admin_all ON public.supply_items FOR ALL
  USING (organization_id = public.get_my_org_id() AND public.is_org_admin())
  WITH CHECK (organization_id = public.get_my_org_id() AND public.is_org_admin());
CREATE POLICY purchase_orders_admin_all ON public.purchase_orders FOR ALL
  USING (organization_id = public.get_my_org_id() AND public.is_org_admin())
  WITH CHECK (organization_id = public.get_my_org_id() AND public.is_org_admin());
CREATE POLICY purchase_order_lines_admin_all ON public.purchase_order_lines FOR ALL
  USING (organization_id = public.get_my_org_id() AND public.is_org_admin())
  WITH CHECK (organization_id = public.get_my_org_id() AND public.is_org_admin());

GRANT SELECT ON public.facility_locations, public.box_location_events,
  public.operational_protocols, public.protocol_assignments, public.operational_tasks,
  public.task_completion_events, public.health_cases, public.health_treatments,
  public.breeding_programs, public.supply_items, public.supply_batches,
  public.purchase_orders, public.purchase_order_lines, public.supply_inventory_events TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.facility_locations, public.operational_protocols,
  public.protocol_assignments, public.breeding_programs, public.supply_items,
  public.purchase_orders, public.purchase_order_lines TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.box_location_events, public.operational_tasks,
  public.task_completion_events, public.health_cases, public.health_treatments,
  public.supply_batches, public.supply_inventory_events FROM authenticated, anon;

DO $$ DECLARE _table text; BEGIN
  FOREACH _table IN ARRAY ARRAY[
    'facility_locations','operational_protocols','protocol_assignments','health_cases',
    'breeding_programs','supply_items','purchase_orders'
  ] LOOP
    EXECUTE format('CREATE TRIGGER set_org_and_owner_trg BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_org_and_owner()', _table);
    EXECUTE format('CREATE TRIGGER prevent_org_and_owner_change_trg BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.prevent_org_and_owner_change()', _table);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.protect_operational_management_rows()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user IN ('postgres','service_role','supabase_admin') THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF; RETURN NEW;
  END IF;
  IF current_setting('app.operational_management_write', true) = 'allowed' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF; RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Este registro solo puede cambiar mediante una operacion transaccional.';
END $$;

CREATE TRIGGER protect_operational_tasks_trg BEFORE INSERT OR UPDATE OR DELETE ON public.operational_tasks
  FOR EACH ROW EXECUTE FUNCTION public.protect_operational_management_rows();
CREATE TRIGGER protect_health_cases_trg BEFORE INSERT OR UPDATE OR DELETE ON public.health_cases
  FOR EACH ROW EXECUTE FUNCTION public.protect_operational_management_rows();
CREATE TRIGGER protect_supply_balance_trg BEFORE UPDATE ON public.supply_items
  FOR EACH ROW WHEN (NEW.current_quantity IS DISTINCT FROM OLD.current_quantity OR NEW.average_unit_cost IS DISTINCT FROM OLD.average_unit_cost)
  EXECUTE FUNCTION public.protect_operational_management_rows();
CREATE TRIGGER protect_box_location_trg BEFORE UPDATE OF location_id ON public.boxes
  FOR EACH ROW WHEN (NEW.location_id IS DISTINCT FROM OLD.location_id)
  EXECUTE FUNCTION public.protect_operational_management_rows();
CREATE TRIGGER immutable_box_location_events_trg BEFORE UPDATE OR DELETE ON public.box_location_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_operational_event_mutation();
CREATE TRIGGER immutable_task_completion_events_trg BEFORE UPDATE OR DELETE ON public.task_completion_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_operational_event_mutation();
CREATE TRIGGER immutable_health_treatments_trg BEFORE UPDATE OR DELETE ON public.health_treatments
  FOR EACH ROW EXECUTE FUNCTION public.prevent_operational_event_mutation();
CREATE TRIGGER immutable_supply_events_trg BEFORE UPDATE OR DELETE ON public.supply_inventory_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_operational_event_mutation();

CREATE OR REPLACE FUNCTION public.validate_facility_location_tree()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE _parent public.facility_locations%ROWTYPE; _cursor uuid; _expected_parent text;
BEGIN
  IF NEW.location_type='site' THEN
    IF NEW.parent_id IS NOT NULL THEN RAISE EXCEPTION 'Una sede no puede tener ubicacion superior.'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.parent_id IS NULL THEN RAISE EXCEPTION 'La ubicacion requiere un nivel superior.'; END IF;
  SELECT * INTO _parent FROM public.facility_locations
  WHERE id=NEW.parent_id AND organization_id=NEW.organization_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ubicacion superior no disponible.'; END IF;
  _expected_parent:=CASE NEW.location_type
    WHEN 'room' THEN 'site' WHEN 'rack' THEN 'room' WHEN 'level' THEN 'rack' WHEN 'position' THEN 'level' END;
  IF _parent.location_type<>_expected_parent THEN
    RAISE EXCEPTION 'Jerarquia invalida: % debe depender de %.',NEW.location_type,_expected_parent;
  END IF;
  _cursor:=NEW.parent_id;
  WHILE _cursor IS NOT NULL LOOP
    IF _cursor=NEW.id THEN RAISE EXCEPTION 'La jerarquia de ubicaciones contiene un ciclo.'; END IF;
    SELECT parent_id INTO _cursor FROM public.facility_locations
    WHERE id=_cursor AND organization_id=NEW.organization_id;
  END LOOP;
  RETURN NEW;
END $$;
CREATE TRIGGER validate_facility_location_tree_trg BEFORE INSERT OR UPDATE OF parent_id,location_type
  ON public.facility_locations FOR EACH ROW EXECUTE FUNCTION public.validate_facility_location_tree();

CREATE OR REPLACE FUNCTION public.validate_protocol_assignment_target()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE _protocol public.operational_protocols%ROWTYPE; _lot public.lots%ROWTYPE; _box_lot public.lots%ROWTYPE;
BEGIN
  SELECT * INTO _protocol FROM public.operational_protocols
  WHERE id=NEW.protocol_id AND organization_id=NEW.organization_id AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'El protocolo no esta activo o no pertenece a la organizacion.'; END IF;
  IF NEW.lot_id IS NOT NULL THEN
    SELECT * INTO _lot FROM public.lots WHERE id=NEW.lot_id AND organization_id=NEW.organization_id;
  ELSE
    SELECT l.* INTO _box_lot FROM public.lots l
    WHERE l.box_id=NEW.box_id AND l.organization_id=NEW.organization_id AND l.status='active'
    ORDER BY l.created_at DESC LIMIT 1;
    _lot:=_box_lot;
  END IF;
  IF _lot.id IS NOT NULL AND (
    (_protocol.kind IS NOT NULL AND _protocol.kind<>_lot.kind) OR
    (_protocol.species_id IS NOT NULL AND _protocol.species_id<>_lot.species_id) OR
    (_protocol.line_id IS NOT NULL AND _protocol.line_id IS DISTINCT FROM _lot.line_id)
  ) THEN RAISE EXCEPTION 'El protocolo no corresponde al tipo, especie o linea del lote.'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER validate_protocol_assignment_target_trg BEFORE INSERT OR UPDATE OF protocol_id,lot_id,box_id
  ON public.protocol_assignments FOR EACH ROW EXECUTE FUNCTION public.validate_protocol_assignment_target();

CREATE OR REPLACE FUNCTION public.enforce_open_health_restrictions()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE _restricted boolean;
BEGIN
  IF TG_TABLE_NAME='order_item_allocations' THEN
    SELECT EXISTS(SELECT 1 FROM public.health_cases h WHERE h.lot_id=NEW.lot_id
      AND h.status IN ('open','monitoring','resolved') AND h.sale_restricted) INTO _restricted;
    IF _restricted THEN RAISE EXCEPTION 'El lote tiene una restriccion sanitaria de venta activa.'; END IF;
  ELSE
    SELECT EXISTS(SELECT 1 FROM public.health_cases h
      WHERE h.lot_id IN (NEW.primary_lot_id,NEW.secondary_lot_id)
      AND h.status IN ('open','monitoring','resolved') AND h.reproduction_restricted) INTO _restricted;
    IF _restricted THEN RAISE EXCEPTION 'El lote tiene una restriccion sanitaria de reproduccion activa.'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER enforce_sale_health_restriction_trg BEFORE INSERT OR UPDATE OF lot_id
  ON public.order_item_allocations FOR EACH ROW EXECUTE FUNCTION public.enforce_open_health_restrictions();
CREATE TRIGGER enforce_reproduction_health_restriction_trg BEFORE INSERT OR UPDATE OF primary_lot_id,secondary_lot_id
  ON public.reproduction_events FOR EACH ROW EXECUTE FUNCTION public.enforce_open_health_restrictions();

CREATE OR REPLACE FUNCTION public.assign_box_location_tx(
  _request_id uuid, _box_id uuid, _location_id uuid, _reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _org uuid := public.get_my_org_id(); _cached jsonb; _box public.boxes%ROWTYPE;
  _location public.facility_locations%ROWTYPE; _occupied int; _result jsonb;
BEGIN
  _cached := public.begin_transaction_request(_request_id, 'location:assign');
  IF _cached IS NOT NULL THEN RETURN _cached; END IF;
  IF _org IS NULL OR NOT public.is_org_admin() THEN RAISE EXCEPTION 'Solo administradores pueden ubicar cajas.'; END IF;
  IF trim(COALESCE(_reason,'')) = '' THEN RAISE EXCEPTION 'El motivo es obligatorio.'; END IF;
  SELECT * INTO _box FROM public.boxes WHERE id = _box_id AND organization_id = _org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Caja no disponible.'; END IF;
  SELECT * INTO _location FROM public.facility_locations
  WHERE id=_location_id AND organization_id=_org AND active FOR UPDATE;
  IF NOT FOUND OR _location.location_type='site' THEN RAISE EXCEPTION 'Ubicacion final invalida.'; END IF;
  SELECT count(*) INTO _occupied FROM public.boxes
  WHERE organization_id=_org AND location_id=_location_id AND id<>_box.id;
  IF _location.capacity_boxes IS NOT NULL AND _occupied>=_location.capacity_boxes THEN
    RAISE EXCEPTION 'La ubicacion alcanzo su capacidad maxima de cajas.';
  END IF;
  PERFORM set_config('app.operational_management_write','allowed',true);
  UPDATE public.boxes SET location_id = _location_id WHERE id = _box.id;
  INSERT INTO public.box_location_events(organization_id,actor_user_id,box_id,from_location_id,to_location_id,reason,request_id)
  VALUES (_org,auth.uid(),_box.id,_box.location_id,_location_id,trim(_reason),_request_id);
  _result := jsonb_build_object('success',true,'box_id',_box.id,'location_id',_location_id);
  PERFORM public.finish_transaction_request(_request_id,'location:assign',_result); RETURN _result;
END $$;

CREATE OR REPLACE FUNCTION public.generate_operational_tasks(
  _for_date date DEFAULT current_date
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _org uuid := public.get_my_org_id(); _assignment record; _definition jsonb; _count int := 0; _task_type text; _frequency int; _due timestamptz;
BEGIN
  IF _org IS NULL OR NOT public.is_org_admin() THEN RAISE EXCEPTION 'Solo administradores pueden generar jornadas.'; END IF;
  PERFORM set_config('app.operational_management_write','allowed',true);
  FOR _assignment IN
    SELECT a.*, p.task_definitions, p.cleaning_frequency_days, p.feeding_frequency_days,
           p.weighing_frequency_days, p.name protocol_name, b.location_id
    FROM public.protocol_assignments a
    JOIN public.operational_protocols p ON p.id = a.protocol_id AND p.organization_id = a.organization_id
    LEFT JOIN public.boxes b ON b.id = COALESCE(a.box_id,(SELECT l.box_id FROM public.lots l WHERE l.id=a.lot_id))
    WHERE a.organization_id=_org AND a.active AND p.active AND a.starts_on <= _for_date
      AND (a.ends_on IS NULL OR a.ends_on >= _for_date)
  LOOP
    FOR _definition IN SELECT * FROM jsonb_array_elements(
      CASE WHEN jsonb_array_length(_assignment.task_definitions)>0 THEN _assignment.task_definitions ELSE
        jsonb_build_array(jsonb_build_object('type','inspection','title','Revision diaria','frequency_days',1,'hour',8)) END
    ) LOOP
      _task_type := COALESCE(_definition->>'type','inspection');
      _frequency := GREATEST(COALESCE((_definition->>'frequency_days')::int,
        CASE _task_type WHEN 'feeding' THEN _assignment.feeding_frequency_days
          WHEN 'cleaning' THEN _assignment.cleaning_frequency_days
          WHEN 'weighing' THEN _assignment.weighing_frequency_days ELSE 1 END,1),1);
      IF ((_for_date - _assignment.starts_on) % _frequency) = 0 THEN
        _due := (_for_date::timestamp + make_interval(hours => COALESCE((_definition->>'hour')::int,8))) AT TIME ZONE 'UTC';
        INSERT INTO public.operational_tasks(
          organization_id,owner_id,protocol_id,assignment_id,task_type,title,instructions,
          lot_id,box_id,location_id,due_at,priority
        ) VALUES (
          _org,auth.uid(),_assignment.protocol_id,_assignment.id,_task_type,
          COALESCE(NULLIF(trim(_definition->>'title'),''),initcap(_task_type)),
          COALESCE(_definition->>'instructions','Protocolo '||_assignment.protocol_name),
          _assignment.lot_id,_assignment.box_id,_assignment.location_id,_due,
          COALESCE(_definition->>'priority','normal')
        ) ON CONFLICT DO NOTHING;
        IF FOUND THEN _count := _count + 1; END IF;
      END IF;
    END LOOP;
  END LOOP;
  RETURN jsonb_build_object('success',true,'date',_for_date,'created',_count);
END $$;

CREATE OR REPLACE FUNCTION public.complete_operational_task_tx(
  _request_id uuid, _task_id uuid, _outcome text, _notes text DEFAULT NULL,
  _measured_value numeric DEFAULT NULL, _measured_unit text DEFAULT NULL,
  _labor_minutes int DEFAULT NULL, _evidence_url text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _org uuid := public.get_my_org_id(); _cached jsonb; _task public.operational_tasks%ROWTYPE;
  _result jsonb; _labor_rate numeric; _cost_id uuid; _labor_cost numeric;
BEGIN
  _cached := public.begin_transaction_request(_request_id,'task:complete'); IF _cached IS NOT NULL THEN RETURN _cached; END IF;
  IF _org IS NULL OR NOT public.is_org_member() THEN RAISE EXCEPTION 'Se requiere membresia activa.'; END IF;
  IF _outcome NOT IN ('completed','skipped') OR COALESCE(_labor_minutes,0)<0 THEN RAISE EXCEPTION 'Resultado o tiempo invalido.'; END IF;
  SELECT * INTO _task FROM public.operational_tasks WHERE id=_task_id AND organization_id=_org FOR UPDATE;
  IF NOT FOUND OR _task.status IN ('completed','skipped','cancelled') THEN RAISE EXCEPTION 'Tarea no disponible.'; END IF;
  PERFORM set_config('app.operational_management_write','allowed',true);
  UPDATE public.operational_tasks SET status=_outcome,completed_at=now(),completed_by=auth.uid(),
    completion_notes=NULLIF(trim(_notes),''),measured_value=_measured_value,
    measured_unit=NULLIF(trim(_measured_unit),''),labor_minutes=_labor_minutes,
    evidence_url=NULLIF(trim(_evidence_url),''),request_id=_request_id,updated_at=now() WHERE id=_task.id;
  INSERT INTO public.task_completion_events(organization_id,actor_user_id,task_id,outcome,notes,
    measured_value,measured_unit,evidence_url,labor_minutes,request_id)
  VALUES(_org,auth.uid(),_task.id,_outcome,NULLIF(trim(_notes),''),_measured_value,
    NULLIF(trim(_measured_unit),''),NULLIF(trim(_evidence_url),''),_labor_minutes,_request_id);
  IF _outcome='completed' AND COALESCE(_labor_minutes,0)>0 AND _task.lot_id IS NOT NULL THEN
    SELECT default_labor_cost_per_hour INTO _labor_rate FROM public.organizations WHERE id=_org;
    _labor_cost:=round(COALESCE(_labor_rate,0)*_labor_minutes/60,4);
    IF _labor_cost>0 THEN
      INSERT INTO public.cost_entries(organization_id,actor_user_id,category,description,incurred_at,
        quantity,unit,unit_cost,total_amount,reference_type,reference_id,notes)
      VALUES(_org,auth.uid(),'labor','Tarea: '||_task.title,now(),_labor_minutes,'min',
        _labor_rate/60,_labor_cost,'operational_task',_task.id::text,NULLIF(trim(_notes),'')) RETURNING id INTO _cost_id;
      PERFORM public.allocate_cost_entry(_cost_id,
        jsonb_build_array(jsonb_build_object('lot_id',_task.lot_id,'amount',_labor_cost,'weight',_labor_minutes)),'direct');
    END IF;
  END IF;
  _result:=jsonb_build_object('success',true,'task_id',_task.id,'status',_outcome);
  PERFORM public.finish_transaction_request(_request_id,'task:complete',_result); RETURN _result;
END $$;

CREATE OR REPLACE FUNCTION public.open_health_case_tx(
  _request_id uuid,_lot_id uuid,_severity text,_clinical_signs text,_quarantine boolean DEFAULT false,
  _sale_restricted boolean DEFAULT false,_reproduction_restricted boolean DEFAULT false,
  _veterinarian text DEFAULT NULL,_follow_up_at timestamptz DEFAULT NULL,_evidence_url text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _org uuid:=public.get_my_org_id(); _cached jsonb; _lot public.lots%ROWTYPE; _id uuid; _code text; _result jsonb;
BEGIN
  _cached:=public.begin_transaction_request(_request_id,'health:open'); IF _cached IS NOT NULL THEN RETURN _cached; END IF;
  IF _org IS NULL OR NOT public.is_org_member() THEN RAISE EXCEPTION 'Se requiere membresia activa.'; END IF;
  SELECT * INTO _lot FROM public.lots WHERE id=_lot_id AND organization_id=_org AND status='active' FOR UPDATE;
  IF NOT FOUND OR _severity NOT IN ('low','medium','high','critical') OR trim(COALESCE(_clinical_signs,''))='' THEN RAISE EXCEPTION 'Datos sanitarios invalidos.'; END IF;
  _code:='HC-'||to_char(now(),'YYYYMMDD-HH24MISS')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,4));
  PERFORM set_config('app.operational_management_write','allowed',true);
  INSERT INTO public.health_cases(organization_id,owner_id,case_code,lot_id,box_id,severity,opened_by,
    clinical_signs,quarantine,sale_restricted,reproduction_restricted,veterinarian,follow_up_at,evidence_url)
  VALUES(_org,auth.uid(),_code,_lot.id,_lot.box_id,_severity,auth.uid(),trim(_clinical_signs),_quarantine,
    _sale_restricted,_reproduction_restricted,NULLIF(trim(_veterinarian),''),_follow_up_at,NULLIF(trim(_evidence_url),'')) RETURNING id INTO _id;
  _result:=jsonb_build_object('success',true,'health_case_id',_id,'case_code',_code);
  PERFORM public.finish_transaction_request(_request_id,'health:open',_result); RETURN _result;
END $$;

CREATE OR REPLACE FUNCTION public.add_health_treatment_tx(
  _request_id uuid,_health_case_id uuid,_medication text,_dose numeric DEFAULT NULL,
  _dose_unit text DEFAULT NULL,_route text DEFAULT NULL,_duration_days int DEFAULT NULL,
  _response text DEFAULT NULL,_notes text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _org uuid:=public.get_my_org_id(); _cached jsonb; _id uuid; _result jsonb;
BEGIN
  _cached:=public.begin_transaction_request(_request_id,'health:treatment'); IF _cached IS NOT NULL THEN RETURN _cached; END IF;
  IF _org IS NULL OR NOT public.is_org_member() OR trim(COALESCE(_medication,''))='' THEN RAISE EXCEPTION 'Tratamiento invalido.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.health_cases WHERE id=_health_case_id AND organization_id=_org AND status IN ('open','monitoring')) THEN RAISE EXCEPTION 'Caso sanitario no disponible.'; END IF;
  INSERT INTO public.health_treatments(organization_id,actor_user_id,health_case_id,medication,dose,dose_unit,route,duration_days,response,notes,request_id)
  VALUES(_org,auth.uid(),_health_case_id,trim(_medication),_dose,NULLIF(trim(_dose_unit),''),NULLIF(trim(_route),''),_duration_days,NULLIF(trim(_response),''),NULLIF(trim(_notes),''),_request_id) RETURNING id INTO _id;
  PERFORM set_config('app.operational_management_write','allowed',true);
  UPDATE public.health_cases SET status='monitoring',updated_at=now() WHERE id=_health_case_id AND status='open';
  _result:=jsonb_build_object('success',true,'treatment_id',_id);
  PERFORM public.finish_transaction_request(_request_id,'health:treatment',_result); RETURN _result;
END $$;

CREATE OR REPLACE FUNCTION public.close_health_case_tx(
  _request_id uuid,_health_case_id uuid,_resolution text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _org uuid:=public.get_my_org_id(); _cached jsonb; _result jsonb;
BEGIN
  _cached:=public.begin_transaction_request(_request_id,'health:close'); IF _cached IS NOT NULL THEN RETURN _cached; END IF;
  IF _org IS NULL OR NOT public.is_org_admin() OR trim(COALESCE(_resolution,''))='' THEN RAISE EXCEPTION 'Solo un administrador puede cerrar el caso con resolucion.'; END IF;
  PERFORM set_config('app.operational_management_write','allowed',true);
  UPDATE public.health_cases SET status='closed',closed_at=now(),closed_by=auth.uid(),resolution=trim(_resolution),updated_at=now()
  WHERE id=_health_case_id AND organization_id=_org AND status IN ('open','monitoring','resolved');
  IF NOT FOUND THEN RAISE EXCEPTION 'Caso sanitario no disponible.'; END IF;
  _result:=jsonb_build_object('success',true,'health_case_id',_health_case_id,'status','closed');
  PERFORM public.finish_transaction_request(_request_id,'health:close',_result); RETURN _result;
END $$;

CREATE OR REPLACE FUNCTION public.receive_supply_tx(
  _request_id uuid,_purchase_order_line_id uuid,_batch_code text,_quantity numeric,
  _expiry_date date DEFAULT NULL,_document_reference text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _org uuid:=public.get_my_org_id(); _cached jsonb; _line public.purchase_order_lines%ROWTYPE; _item public.supply_items%ROWTYPE; _batch uuid; _new_avg numeric; _result jsonb;
BEGIN
  _cached:=public.begin_transaction_request(_request_id,'supply:receive'); IF _cached IS NOT NULL THEN RETURN _cached; END IF;
  IF _org IS NULL OR NOT public.is_org_admin() OR _quantity<=0 OR trim(COALESCE(_batch_code,''))='' THEN RAISE EXCEPTION 'Recepcion invalida.'; END IF;
  SELECT * INTO _line FROM public.purchase_order_lines WHERE id=_purchase_order_line_id AND organization_id=_org FOR UPDATE;
  IF NOT FOUND OR _line.quantity_received+_quantity>_line.quantity_ordered THEN RAISE EXCEPTION 'Cantidad excede lo pendiente.'; END IF;
  SELECT * INTO _item FROM public.supply_items WHERE id=_line.supply_item_id AND organization_id=_org FOR UPDATE;
  _new_avg:=CASE WHEN _item.current_quantity+_quantity=0 THEN 0 ELSE
    ((_item.current_quantity*_item.average_unit_cost)+(_quantity*_line.unit_cost))/(_item.current_quantity+_quantity) END;
  INSERT INTO public.supply_batches(organization_id,supply_item_id,batch_code,expiry_date,quantity_received,quantity_remaining,unit_cost,vendor,document_reference)
  SELECT _org,_item.id,trim(_batch_code),_expiry_date,_quantity,_quantity,_line.unit_cost,o.vendor,NULLIF(trim(_document_reference),'')
  FROM public.purchase_orders o WHERE o.id=_line.purchase_order_id RETURNING id INTO _batch;
  PERFORM set_config('app.operational_management_write','allowed',true);
  UPDATE public.supply_items SET current_quantity=current_quantity+_quantity,average_unit_cost=_new_avg,updated_at=now() WHERE id=_item.id;
  UPDATE public.purchase_order_lines SET quantity_received=quantity_received+_quantity WHERE id=_line.id;
  UPDATE public.purchase_orders o SET status=CASE WHEN EXISTS(
    SELECT 1 FROM public.purchase_order_lines l WHERE l.purchase_order_id=o.id AND l.quantity_received+CASE WHEN l.id=_line.id THEN _quantity ELSE 0 END<l.quantity_ordered
  ) THEN 'partial' ELSE 'received' END, received_at=CASE WHEN NOT EXISTS(
    SELECT 1 FROM public.purchase_order_lines l WHERE l.purchase_order_id=o.id AND l.quantity_received+CASE WHEN l.id=_line.id THEN _quantity ELSE 0 END<l.quantity_ordered
  ) THEN now() ELSE received_at END,updated_at=now() WHERE o.id=_line.purchase_order_id;
  INSERT INTO public.supply_inventory_events(organization_id,actor_user_id,supply_item_id,batch_id,event_type,quantity_delta,balance_before,balance_after,unit_cost,reference_type,reference_id,request_id)
  VALUES(_org,auth.uid(),_item.id,_batch,'receipt',_quantity,_item.current_quantity,_item.current_quantity+_quantity,_line.unit_cost,'purchase_order_line',_line.id::text,_request_id);
  _result:=jsonb_build_object('success',true,'batch_id',_batch,'balance',_item.current_quantity+_quantity);
  PERFORM public.finish_transaction_request(_request_id,'supply:receive',_result); RETURN _result;
END $$;

CREATE OR REPLACE FUNCTION public.create_supply_purchase_order_tx(
  _request_id uuid,_order_number text,_vendor text,_supply_item_id uuid,
  _quantity numeric,_unit_cost numeric,_expected_at date DEFAULT NULL,_notes text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _org uuid:=public.get_my_org_id(); _cached jsonb; _order_id uuid; _line_id uuid; _result jsonb;
BEGIN
  _cached:=public.begin_transaction_request(_request_id,'supply:order'); IF _cached IS NOT NULL THEN RETURN _cached; END IF;
  IF _org IS NULL OR NOT public.is_org_admin() OR trim(COALESCE(_order_number,''))='' OR
    trim(COALESCE(_vendor,''))='' OR _quantity<=0 OR _unit_cost<0 THEN
    RAISE EXCEPTION 'Orden de compra invalida.';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.supply_items WHERE id=_supply_item_id AND organization_id=_org AND active) THEN
    RAISE EXCEPTION 'Insumo no disponible.';
  END IF;
  INSERT INTO public.purchase_orders(organization_id,owner_id,order_number,vendor,status,ordered_at,expected_at,notes)
  VALUES(_org,auth.uid(),trim(_order_number),trim(_vendor),'ordered',now(),_expected_at,NULLIF(trim(_notes),''))
  RETURNING id INTO _order_id;
  INSERT INTO public.purchase_order_lines(organization_id,purchase_order_id,supply_item_id,quantity_ordered,unit_cost)
  VALUES(_org,_order_id,_supply_item_id,_quantity,_unit_cost) RETURNING id INTO _line_id;
  _result:=jsonb_build_object('success',true,'purchase_order_id',_order_id,'line_id',_line_id);
  PERFORM public.finish_transaction_request(_request_id,'supply:order',_result); RETURN _result;
END $$;

CREATE OR REPLACE FUNCTION public.consume_supply_tx(
  _request_id uuid,_supply_item_id uuid,_quantity numeric,_reference_type text,
  _reference_id text DEFAULT NULL,_notes text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  _org uuid:=public.get_my_org_id(); _cached jsonb; _item public.supply_items%ROWTYPE;
  _batch public.supply_batches%ROWTYPE; _remaining numeric; _taken numeric; _cost numeric:=0;
  _allocations jsonb:='[]'::jsonb; _result jsonb;
BEGIN
  _cached:=public.begin_transaction_request(_request_id,'supply:consume'); IF _cached IS NOT NULL THEN RETURN _cached; END IF;
  IF _org IS NULL OR NOT public.is_org_member() OR _quantity<=0 OR trim(COALESCE(_reference_type,''))='' THEN
    RAISE EXCEPTION 'Consumo de insumo invalido.';
  END IF;
  SELECT * INTO _item FROM public.supply_items
  WHERE id=_supply_item_id AND organization_id=_org AND active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Insumo no disponible.'; END IF;
  IF _item.current_quantity<_quantity THEN RAISE EXCEPTION 'Existencia insuficiente.'; END IF;
  _remaining:=_quantity;
  FOR _batch IN SELECT * FROM public.supply_batches
    WHERE organization_id=_org AND supply_item_id=_supply_item_id AND quantity_remaining>0
    ORDER BY expiry_date ASC NULLS LAST,received_at,id FOR UPDATE
  LOOP
    EXIT WHEN _remaining<=0;
    _taken:=LEAST(_remaining,_batch.quantity_remaining);
    UPDATE public.supply_batches SET quantity_remaining=quantity_remaining-_taken WHERE id=_batch.id;
    _cost:=_cost+(_taken*_batch.unit_cost);
    _allocations:=_allocations||jsonb_build_array(jsonb_build_object(
      'batch_id',_batch.id,'batch_code',_batch.batch_code,'quantity',_taken,'unit_cost',_batch.unit_cost));
    INSERT INTO public.supply_inventory_events(
      organization_id,actor_user_id,supply_item_id,batch_id,event_type,quantity_delta,
      balance_before,balance_after,unit_cost,reference_type,reference_id,notes,request_id
    ) VALUES(
      _org,auth.uid(),_supply_item_id,_batch.id,'consumption',-_taken,
      _item.current_quantity-(_quantity-_remaining),_item.current_quantity-(_quantity-_remaining+_taken),
      _batch.unit_cost,trim(_reference_type),NULLIF(trim(_reference_id),''),NULLIF(trim(_notes),''),gen_random_uuid()
    );
    _remaining:=_remaining-_taken;
  END LOOP;
  IF _remaining>0 THEN RAISE EXCEPTION 'Los lotes de insumo no cubren la existencia solicitada.'; END IF;
  PERFORM set_config('app.operational_management_write','allowed',true);
  UPDATE public.supply_items SET current_quantity=current_quantity-_quantity,updated_at=now() WHERE id=_item.id;
  _result:=jsonb_build_object('success',true,'quantity',_quantity,'balance',_item.current_quantity-_quantity,
    'total_cost',_cost,'allocations',_allocations);
  PERFORM public.finish_transaction_request(_request_id,'supply:consume',_result); RETURN _result;
END $$;

CREATE OR REPLACE FUNCTION public.set_default_labor_cost_tx(_hourly_cost numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _org uuid:=public.get_my_org_id();
BEGIN
  IF _org IS NULL OR NOT public.is_org_admin() OR _hourly_cost<0 THEN
    RAISE EXCEPTION 'Tarifa de mano de obra invalida.';
  END IF;
  UPDATE public.organizations SET default_labor_cost_per_hour=_hourly_cost WHERE id=_org;
  RETURN jsonb_build_object('success',true,'hourly_cost',_hourly_cost);
END $$;

CREATE OR REPLACE FUNCTION public.record_breeding_program_event_tx(
  _request_id uuid,_breeding_program_id uuid,_event_type public.reproduction_event_type,
  _event_at timestamptz DEFAULT now(),_quantity int DEFAULT NULL,_mass_grams numeric DEFAULT NULL,
  _observations text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _org uuid:=public.get_my_org_id(); _program public.breeding_programs%ROWTYPE; _result jsonb; _event_id uuid; _linked uuid;
BEGIN
  IF _org IS NULL OR NOT public.is_org_member() THEN RAISE EXCEPTION 'Se requiere membresia activa.'; END IF;
  SELECT * INTO _program FROM public.breeding_programs
  WHERE id=_breeding_program_id AND organization_id=_org AND status NOT IN ('failed','closed') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Programa reproductivo no disponible.'; END IF;
  _result:=public.register_reproduction_event_tx(_request_id,_event_type,_program.primary_lot_id,
    _program.secondary_lot_id,NULL,_event_at,_quantity,_mass_grams,NULL,_observations,NULL,
    'breeding_program',_program.id::text);
  _event_id:=(_result->>'event_id')::uuid;
  UPDATE public.reproduction_events SET breeding_program_id=_program.id
  WHERE id=_event_id AND organization_id=_org AND breeding_program_id IS NULL RETURNING id INTO _linked;
  IF _linked IS NOT NULL THEN
    UPDATE public.breeding_programs SET
      status=CASE _event_type WHEN 'mating' THEN 'active' WHEN 'gestation_confirmed' THEN 'gestating'
        WHEN 'birth' THEN 'born' WHEN 'hatch' THEN 'born' WHEN 'separation' THEN 'weaned'
        WHEN 'failed' THEN 'failed' ELSE status END,
      actual_start=CASE WHEN _event_type='mating' THEN COALESCE(actual_start,_event_at::date) ELSE actual_start END,
      offspring_count=offspring_count+CASE WHEN _event_type IN ('birth','hatch') THEN COALESCE(_quantity,0) ELSE 0 END,
      updated_at=now() WHERE id=_program.id;
  END IF;
  RETURN _result||jsonb_build_object('breeding_program_id',_program.id);
END $$;

DO $$ DECLARE _table text; BEGIN
  FOREACH _table IN ARRAY ARRAY[
    'facility_locations','box_location_events','operational_protocols','protocol_assignments',
    'operational_tasks','task_completion_events','health_cases','health_treatments',
    'breeding_programs','supply_items','supply_batches','purchase_orders',
    'purchase_order_lines','supply_inventory_events'
  ] LOOP
    EXECUTE format('CREATE TRIGGER audit_row_change_trg AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_row_change()',_table);
  END LOOP;
END $$;

CREATE OR REPLACE VIEW public.operational_planning_summary WITH (security_invoker=true) AS
SELECT l.organization_id,l.id lot_id,l.lot_code,l.kind,l.started_at,
  (current_date-l.started_at) age_days,
  (COALESCE(l.males,0)+COALESCE(l.females,0)+COALESCE(l.unsexed,0)) population,
  COALESCE(l.mass_grams,0) biomass_grams,p.id protocol_id,p.name protocol_name,
  CASE WHEN l.kind='rodent' THEN (COALESCE(l.males,0)+COALESCE(l.females,0)+COALESCE(l.unsexed,0))*COALESCE(p.daily_feed_grams_per_unit,0)
    ELSE COALESCE(l.mass_grams,0)*COALESCE(p.daily_feed_grams_per_unit,0) END projected_daily_feed_grams,
  CASE WHEN p.sale_age_days IS NULL THEN NULL ELSE l.started_at+p.sale_age_days END projected_sale_date,
  CASE WHEN p.separation_age_days IS NULL THEN NULL ELSE l.started_at+p.separation_age_days END projected_separation_date,
  b.code box_code,b.location_id
FROM public.lots l
LEFT JOIN public.protocol_assignments a ON a.organization_id=l.organization_id AND a.lot_id=l.id AND a.active
LEFT JOIN public.operational_protocols p ON p.id=a.protocol_id
LEFT JOIN public.boxes b ON b.id=l.box_id
WHERE l.status='active';

CREATE OR REPLACE VIEW public.reproduction_performance WITH (security_invoker=true) AS
SELECT b.organization_id,b.id breeding_program_id,b.code,b.status,b.method,b.planned_start,
  b.expected_birth_date,b.expected_weaning_date,b.target_offspring,b.offspring_count,
  count(r.id) event_count,
  max(r.event_at) last_event_at,
  CASE WHEN b.target_offspring>0 THEN round(b.offspring_count::numeric/b.target_offspring*100,2) END target_achievement_pct
FROM public.breeding_programs b
LEFT JOIN public.reproduction_events r ON r.breeding_program_id=b.id
GROUP BY b.organization_id,b.id;

CREATE OR REPLACE VIEW public.executive_dashboard WITH (security_invoker=true) AS
SELECT o.id organization_id,
  (SELECT count(*) FROM public.lots l WHERE l.organization_id=o.id AND l.status='active') active_lots,
  (SELECT count(*) FROM public.boxes b WHERE b.organization_id=o.id AND b.status='active') active_boxes,
  (SELECT count(*) FROM public.operational_tasks t WHERE t.organization_id=o.id AND t.status='pending' AND t.due_at<now()) overdue_tasks,
  (SELECT count(*) FROM public.operational_tasks t WHERE t.organization_id=o.id AND t.status='completed' AND t.completed_at>=date_trunc('month',now())) completed_tasks_month,
  (SELECT count(*) FROM public.health_cases h WHERE h.organization_id=o.id AND h.status IN ('open','monitoring')) open_health_cases,
  (SELECT count(*) FROM public.health_cases h WHERE h.organization_id=o.id AND h.severity='critical' AND h.status IN ('open','monitoring')) critical_health_cases,
  (SELECT count(*) FROM public.supply_items s WHERE s.organization_id=o.id AND s.current_quantity<=s.minimum_quantity) low_stock_items,
  (SELECT count(*) FROM public.supply_batches s WHERE s.organization_id=o.id AND s.quantity_remaining>0 AND s.expiry_date<=current_date+30) expiring_batches,
  (SELECT count(*) FROM public.breeding_programs b WHERE b.organization_id=o.id AND b.status IN ('active','gestating','born')) active_breeding_programs,
  (SELECT COALESCE(sum(f.gross_margin),0) FROM public.lot_financial_summary f WHERE f.organization_id=o.id) gross_margin,
  (SELECT COALESCE(sum(f.total_cost),0) FROM public.lot_financial_summary f WHERE f.organization_id=o.id) total_production_cost
FROM public.organizations o WHERE o.id=public.get_my_org_id();

GRANT SELECT ON public.operational_planning_summary,public.reproduction_performance,public.executive_dashboard TO authenticated;

REVOKE ALL ON FUNCTION public.assign_box_location_tx(uuid,uuid,uuid,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.generate_operational_tasks(date) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.complete_operational_task_tx(uuid,uuid,text,text,numeric,text,int,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.open_health_case_tx(uuid,uuid,text,text,boolean,boolean,boolean,text,timestamptz,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.add_health_treatment_tx(uuid,uuid,text,numeric,text,text,int,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.close_health_case_tx(uuid,uuid,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.receive_supply_tx(uuid,uuid,text,numeric,date,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.create_supply_purchase_order_tx(uuid,text,text,uuid,numeric,numeric,date,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.consume_supply_tx(uuid,uuid,numeric,text,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.set_default_labor_cost_tx(numeric) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.record_breeding_program_event_tx(uuid,uuid,public.reproduction_event_type,timestamptz,int,numeric,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.assign_box_location_tx(uuid,uuid,uuid,text),public.generate_operational_tasks(date),
  public.complete_operational_task_tx(uuid,uuid,text,text,numeric,text,int,text),
  public.open_health_case_tx(uuid,uuid,text,text,boolean,boolean,boolean,text,timestamptz,text),
  public.add_health_treatment_tx(uuid,uuid,text,numeric,text,text,int,text,text),
  public.close_health_case_tx(uuid,uuid,text),public.receive_supply_tx(uuid,uuid,text,numeric,date,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_supply_purchase_order_tx(uuid,text,text,uuid,numeric,numeric,date,text),
  public.consume_supply_tx(uuid,uuid,numeric,text,text,text),public.set_default_labor_cost_tx(numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_breeding_program_event_tx(uuid,uuid,public.reproduction_event_type,timestamptz,int,numeric,text) TO authenticated;

REVOKE INSERT,UPDATE,DELETE ON public.purchase_orders,public.purchase_order_lines,public.supply_batches FROM authenticated,anon;

-- Append the new operational entities to the organization export.
ALTER FUNCTION public.export_organization_data() RENAME TO export_organization_data_complete_costing;
REVOKE ALL ON FUNCTION public.export_organization_data_complete_costing() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.export_organization_data() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _org uuid:=public.get_my_org_id(); _base jsonb;
BEGIN
  IF _org IS NULL OR NOT public.is_org_admin() THEN RAISE EXCEPTION 'OPERATIONAL_EXPORT_ADMIN_REQUIRED'; END IF;
  _base:=public.export_organization_data_complete_costing();
  RETURN _base || jsonb_build_object(
    'schema_version','20260808000002',
    'facility_locations',(SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]') FROM public.facility_locations t WHERE t.organization_id=_org),
    'box_location_events',(SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]') FROM public.box_location_events t WHERE t.organization_id=_org),
    'operational_protocols',(SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]') FROM public.operational_protocols t WHERE t.organization_id=_org),
    'protocol_assignments',(SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]') FROM public.protocol_assignments t WHERE t.organization_id=_org),
    'operational_tasks',(SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]') FROM public.operational_tasks t WHERE t.organization_id=_org),
    'task_completion_events',(SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]') FROM public.task_completion_events t WHERE t.organization_id=_org),
    'health_cases',(SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]') FROM public.health_cases t WHERE t.organization_id=_org),
    'health_treatments',(SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]') FROM public.health_treatments t WHERE t.organization_id=_org),
    'breeding_programs',(SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]') FROM public.breeding_programs t WHERE t.organization_id=_org),
    'supply_items',(SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]') FROM public.supply_items t WHERE t.organization_id=_org),
    'supply_batches',(SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]') FROM public.supply_batches t WHERE t.organization_id=_org),
    'purchase_orders',(SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]') FROM public.purchase_orders t WHERE t.organization_id=_org),
    'purchase_order_lines',(SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]') FROM public.purchase_order_lines t WHERE t.organization_id=_org),
    'supply_inventory_events',(SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]') FROM public.supply_inventory_events t WHERE t.organization_id=_org)
  );
END $$;
REVOKE ALL ON FUNCTION public.export_organization_data() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.export_organization_data() TO authenticated;

COMMIT;
