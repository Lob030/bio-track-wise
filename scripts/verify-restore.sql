\set ON_ERROR_STOP on

DO $$
DECLARE _missing text;
BEGIN
  SELECT string_agg(required.name, ', ')
  INTO _missing
  FROM (VALUES
    ('organizations'), ('profiles'), ('user_roles'), ('species'), ('genetic_lines'),
    ('boxes'), ('lots'), ('lot_events'), ('inventory_events'), ('reproduction_events'),
    ('alert_rules'), ('alerts'), ('audit_log'), ('box_types'), ('substrates'),
    ('substrate_inventory_events'), ('lot_cost_allocations'), ('cost_entries'),
    ('feed_inventory_events'), ('cost_assets'), ('asset_depreciation_postings')
    ,('facility_locations'), ('box_location_events'), ('operational_protocols'),
    ('protocol_assignments'), ('operational_tasks'), ('task_completion_events'),
    ('health_cases'), ('health_treatments'), ('breeding_programs'), ('supply_items'),
    ('supply_batches'), ('purchase_orders'), ('purchase_order_lines'), ('supply_inventory_events')
    ,('operational_shifts'), ('operational_shift_members'), ('inventory_source_links'),
    ('facility_user_access'), ('adjustment_approval_requests'), ('maintenance_assets'),
    ('maintenance_plans'), ('maintenance_events'), ('label_print_jobs'), ('import_jobs')
  ) AS required(name)
  WHERE to_regclass('public.' || required.name) IS NULL;
  IF _missing IS NOT NULL THEN
    RAISE EXCEPTION 'Missing required tables: %', _missing;
  END IF;
END $$;

DO $$
DECLARE _unprotected text;
BEGIN
  SELECT string_agg(c.relname, ', ')
  INTO _unprotected
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN (
      'lots', 'inventory_events', 'alert_rules', 'alerts', 'audit_log',
      'substrate_inventory_events', 'lot_cost_allocations', 'cost_entries',
      'feed_inventory_events', 'asset_depreciation_postings',
      'operational_shifts', 'operational_shift_members', 'facility_user_access',
      'adjustment_approval_requests', 'maintenance_assets', 'maintenance_plans',
      'maintenance_events', 'label_print_jobs', 'import_jobs'
    )
    AND NOT c.relrowsecurity;
  IF _unprotected IS NOT NULL THEN
    RAISE EXCEPTION 'RLS disabled on: %', _unprotected;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.alerts
    WHERE status <> 'resolved'
    GROUP BY organization_id, condition_key
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate open alert conditions found';
  END IF;
  IF EXISTS (SELECT 1 FROM public.lot_balance_reconciliation WHERE NOT is_consistent) THEN
    RAISE EXCEPTION 'Lot ledger reconciliation failed';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.warehouse_food WHERE quantity_grams < 0
    UNION ALL
    SELECT 1 FROM public.substrates WHERE stock_grams < 0
  ) THEN
    RAISE EXCEPTION 'Negative operational inventory found';
  END IF;
END $$;

SELECT 'restore_verified' AS result,
       (SELECT count(*) FROM public.organizations) AS organizations,
       (SELECT count(*) FROM public.lots) AS lots,
       (SELECT count(*) FROM public.inventory_events) AS inventory_events,
       (SELECT count(*) FROM public.alerts) AS alerts,
       (SELECT count(*) FROM public.cost_entries) AS cost_entries;
