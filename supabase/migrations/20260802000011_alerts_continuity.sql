-- Alert evaluation, lifecycle and organization-scoped operational exports.

ALTER TABLE public.alert_rules
  ADD COLUMN IF NOT EXISTS evaluation_window_days integer NOT NULL DEFAULT 7;

-- Preserve compatibility with the original UI name before validating the metric set.
UPDATE public.alert_rules SET metric = 'biomass' WHERE metric = 'weight';

ALTER TABLE public.alert_rules
  ADD CONSTRAINT alert_rules_metric_supported CHECK (
    metric IN ('population', 'biomass', 'age_days', 'days_active', 'stock_min', 'expiry_days', 'mortality')
  ),
  ADD CONSTRAINT alert_rules_window_positive CHECK (evaluation_window_days BETWEEN 1 AND 3650);

ALTER TABLE public.alerts
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS generated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS acknowledged_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolution_reason text,
  ADD COLUMN IF NOT EXISTS entity_type text NOT NULL DEFAULT 'lot',
  ADD COLUMN IF NOT EXISTS entity_id uuid,
  ADD COLUMN IF NOT EXISTS condition_key text,
  ADD COLUMN IF NOT EXISTS current_value numeric,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_notified_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS occurrence_count integer NOT NULL DEFAULT 1;

UPDATE public.alerts
SET generated_at = created_at,
    acknowledged_at = CASE WHEN acknowledged THEN created_at ELSE NULL END,
    status = CASE WHEN acknowledged THEN 'acknowledged' ELSE 'active' END,
    entity_id = lot_id,
    condition_key = 'legacy:' || id::text,
    last_seen_at = created_at,
    last_notified_at = created_at
WHERE condition_key IS NULL;

ALTER TABLE public.alerts
  ALTER COLUMN condition_key SET NOT NULL,
  ADD CONSTRAINT alerts_status_valid CHECK (status IN ('active', 'acknowledged', 'resolved')),
  ADD CONSTRAINT alerts_entity_type_valid CHECK (entity_type IN ('lot', 'warehouse_food', 'warehouse_cleaning')),
  ADD CONSTRAINT alerts_lifecycle_valid CHECK (
    (status = 'active' AND acknowledged_at IS NULL AND resolved_at IS NULL)
    OR (status = 'acknowledged' AND acknowledged_at IS NOT NULL AND resolved_at IS NULL)
    OR (status = 'resolved' AND resolved_at IS NOT NULL)
  ),
  ADD CONSTRAINT alerts_occurrence_positive CHECK (occurrence_count > 0);

CREATE UNIQUE INDEX alerts_open_condition_uidx
  ON public.alerts (organization_id, condition_key)
  WHERE status <> 'resolved';
CREATE INDEX alerts_org_status_generated_idx
  ON public.alerts (organization_id, status, generated_at DESC);

CREATE TABLE public.alert_evaluation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'completed_with_errors', 'failed')),
  rules_evaluated integer NOT NULL DEFAULT 0 CHECK (rules_evaluated >= 0),
  conditions_matched integer NOT NULL DEFAULT 0 CHECK (conditions_matched >= 0),
  alerts_generated integer NOT NULL DEFAULT 0 CHECK (alerts_generated >= 0),
  alerts_resolved integer NOT NULL DEFAULT 0 CHECK (alerts_resolved >= 0),
  error_message text,
  invocation_id text
);

ALTER TABLE public.alert_evaluation_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY alert_runs_admin_select ON public.alert_evaluation_runs
  FOR SELECT USING (
    organization_id = public.get_my_org_id() AND public.is_org_admin()
  );

CREATE OR REPLACE FUNCTION public.alert_compare(_value numeric, _operator text, _threshold numeric)
RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT CASE _operator
    WHEN '>' THEN _value > _threshold
    WHEN '>=' THEN _value >= _threshold
    WHEN '<' THEN _value < _threshold
    WHEN '<=' THEN _value <= _threshold
    WHEN '=' THEN _value = _threshold
    WHEN '==' THEN _value = _threshold
    ELSE false
  END
$$;

CREATE OR REPLACE FUNCTION public.evaluate_alert_rules(
  _organization_id uuid DEFAULT NULL,
  _invocation_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _run_id uuid;
  _started_at timestamptz := clock_timestamp();
  _rule record;
  _candidate record;
  _rules integer := 0;
  _matched integer := 0;
  _generated integer := 0;
  _resolved integer := 0;
  _rule_errors integer := 0;
  _affected integer;
  _condition_key text;
  _message text;
BEGIN
  IF current_user NOT IN ('postgres', 'service_role', 'supabase_admin') THEN
    RAISE EXCEPTION 'ALERT_EVALUATION_FORBIDDEN';
  END IF;

  INSERT INTO public.alert_evaluation_runs (organization_id, invocation_id)
  VALUES (_organization_id, _invocation_id)
  RETURNING id INTO _run_id;

  FOR _rule IN
    SELECT r.*
    FROM public.alert_rules r
    WHERE r.enabled
      AND (_organization_id IS NULL OR r.organization_id = _organization_id)
    ORDER BY r.organization_id, r.id
  LOOP
    _rules := _rules + 1;
    BEGIN
      FOR _candidate IN
        SELECT l.id AS entity_id, 'lot'::text AS entity_type, l.id AS lot_id,
               COALESCE(l.lot_code, l.id::text) AS entity_label,
               CASE _rule.metric
                 WHEN 'population' THEN (COALESCE(l.males, 0) + COALESCE(l.females, 0) + COALESCE(l.unsexed, 0))::numeric
                 WHEN 'biomass' THEN COALESCE(l.mass_grams, 0)
                 WHEN 'age_days' THEN GREATEST(0, CURRENT_DATE - l.started_at)::numeric
                 WHEN 'days_active' THEN GREATEST(0, CURRENT_DATE - l.created_at::date)::numeric
                 WHEN 'mortality' THEN CASE l.kind
                   WHEN 'rodent' THEN COALESCE((
                     SELECT sum(abs(e.males_delta) + abs(e.females_delta) + abs(e.unsexed_delta))
                     FROM public.inventory_events e
                     WHERE e.lot_id = l.id AND e.event_type = 'mortality_out'
                       AND e.event_at >= now() - make_interval(days => _rule.evaluation_window_days)
                   ), 0)
                   ELSE COALESCE((
                     SELECT sum(abs(e.mass_delta))
                     FROM public.inventory_events e
                     WHERE e.lot_id = l.id AND e.event_type = 'mortality_out'
                       AND e.event_at >= now() - make_interval(days => _rule.evaluation_window_days)
                   ), 0)
                 END
               END AS metric_value,
               _rule.threshold AS effective_threshold
        FROM public.lots l
        WHERE _rule.metric IN ('population', 'biomass', 'age_days', 'days_active', 'mortality')
          AND l.organization_id = _rule.organization_id
          AND l.status = 'active'
          AND (_rule.scope = 'all' OR l.id = _rule.lot_id)
          AND (_rule.animal_kind = 'both' OR l.kind::text = _rule.animal_kind)
          AND (_rule.species_id IS NULL OR l.species_id = _rule.species_id)
          AND (_rule.lot_type IS NULL OR l.lot_type = _rule.lot_type)
          AND (_rule.metric <> 'population' OR l.kind = 'rodent')
          AND (_rule.metric <> 'biomass' OR l.kind = 'insect')

        UNION ALL

        SELECT f.id, 'warehouse_food', NULL::uuid, f.name,
               f.quantity_grams,
               COALESCE(NULLIF(_rule.threshold, 0), f.min_stock_grams, 0)
        FROM public.warehouse_food f
        WHERE _rule.metric = 'stock_min'
          AND f.organization_id = _rule.organization_id
          AND f.min_stock_grams IS NOT NULL

        UNION ALL

        SELECT c.id, 'warehouse_cleaning', NULL::uuid, c.name,
               (c.expiry_date - CURRENT_DATE)::numeric,
               _rule.threshold
        FROM public.warehouse_cleaning c
        WHERE _rule.metric = 'expiry_days'
          AND c.organization_id = _rule.organization_id
          AND c.expiry_date IS NOT NULL
      LOOP
        IF public.alert_compare(
          _candidate.metric_value,
          CASE WHEN _rule.metric IN ('stock_min', 'expiry_days') THEN '<=' ELSE _rule.operator END,
          _candidate.effective_threshold
        ) THEN
          _matched := _matched + 1;
          _condition_key := _rule.id::text || ':' || _candidate.entity_type || ':' || _candidate.entity_id::text;
          _message := COALESCE(NULLIF(_rule.template_text, ''), NULLIF(_rule.name, ''), 'Regla de alerta');
          _message := replace(_message, '{lot_id}', COALESCE(_candidate.entity_label, ''));
          _message := replace(_message, '{entity}', COALESCE(_candidate.entity_label, ''));
          _message := replace(_message, '{value}', _candidate.metric_value::text);
          _message := replace(_message, '{threshold}', _candidate.effective_threshold::text);

          INSERT INTO public.alerts (
            owner_id, organization_id, rule_id, lot_id, message, priority,
            status, acknowledged, generated_at, entity_type, entity_id,
            condition_key, current_value, last_seen_at, last_notified_at
          ) VALUES (
            _rule.owner_id, _rule.organization_id, _rule.id, _candidate.lot_id,
            _message, _rule.priority, 'active', false, _started_at,
            _candidate.entity_type, _candidate.entity_id, _condition_key,
            _candidate.metric_value, _started_at, _started_at
          )
          ON CONFLICT (organization_id, condition_key) WHERE status <> 'resolved'
          DO UPDATE SET
            message = EXCLUDED.message,
            priority = EXCLUDED.priority,
            current_value = EXCLUDED.current_value,
            last_seen_at = EXCLUDED.last_seen_at,
            occurrence_count = CASE
              WHEN _rule.frequency_days > 0
               AND public.alerts.last_notified_at <= _started_at - make_interval(days => _rule.frequency_days)
              THEN public.alerts.occurrence_count + 1
              ELSE public.alerts.occurrence_count
            END,
            last_notified_at = CASE
              WHEN _rule.frequency_days > 0
               AND public.alerts.last_notified_at <= _started_at - make_interval(days => _rule.frequency_days)
              THEN _started_at
              ELSE public.alerts.last_notified_at
            END;

          GET DIAGNOSTICS _affected = ROW_COUNT;
          _generated := _generated + _affected;
        END IF;
      END LOOP;

      UPDATE public.alerts
      SET status = 'resolved', resolved_at = _started_at,
          resolution_reason = 'La condición dejó de cumplirse', acknowledged = true
      WHERE organization_id = _rule.organization_id
        AND rule_id = _rule.id
        AND status <> 'resolved'
        AND last_seen_at < _started_at;
      GET DIAGNOSTICS _affected = ROW_COUNT;
      _resolved := _resolved + _affected;

      UPDATE public.alert_rules
      SET last_triggered_at = CASE WHEN EXISTS (
        SELECT 1 FROM public.alerts a
        WHERE a.rule_id = _rule.id AND a.last_seen_at = _started_at
      ) THEN _started_at ELSE last_triggered_at END
      WHERE id = _rule.id;
    EXCEPTION WHEN OTHERS THEN
      _rule_errors := _rule_errors + 1;
      UPDATE public.alert_evaluation_runs
      SET error_message = concat_ws(E'\n', error_message, 'Regla ' || _rule.id || ': ' || SQLERRM)
      WHERE id = _run_id;
    END;
  END LOOP;

  UPDATE public.alert_evaluation_runs
  SET completed_at = clock_timestamp(),
      status = CASE WHEN _rule_errors > 0 THEN 'completed_with_errors' ELSE 'completed' END,
      rules_evaluated = _rules,
      conditions_matched = _matched,
      alerts_generated = _generated,
      alerts_resolved = _resolved
  WHERE id = _run_id;

  RETURN jsonb_build_object(
    'run_id', _run_id, 'rules_evaluated', _rules, 'conditions_matched', _matched,
    'alerts_touched', _generated, 'alerts_resolved', _resolved, 'rule_errors', _rule_errors
  );
EXCEPTION WHEN OTHERS THEN
  UPDATE public.alert_evaluation_runs
  SET completed_at = clock_timestamp(), status = 'failed', error_message = SQLERRM
  WHERE id = _run_id;
  RETURN jsonb_build_object('run_id', _run_id, 'status', 'failed', 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.acknowledge_alert(_alert_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _org uuid := public.get_my_org_id();
BEGIN
  IF _org IS NULL OR NOT public.is_org_member() THEN
    RAISE EXCEPTION 'ALERT_ACKNOWLEDGE_FORBIDDEN';
  END IF;
  UPDATE public.alerts
  SET status = 'acknowledged', acknowledged = true,
      acknowledged_at = COALESCE(acknowledged_at, now()), acknowledged_by = auth.uid()
  WHERE id = _alert_id AND organization_id = _org AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'ALERT_NOT_ACTIVE_OR_NOT_FOUND'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_alert(_alert_id uuid, _reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _org uuid := public.get_my_org_id();
BEGIN
  IF _org IS NULL OR NOT public.is_org_admin() THEN
    RAISE EXCEPTION 'ALERT_RESOLVE_ADMIN_REQUIRED';
  END IF;
  UPDATE public.alerts
  SET status = 'resolved', resolved_at = now(), resolved_by = auth.uid(),
      resolution_reason = COALESCE(NULLIF(trim(_reason), ''), 'Resolución manual'), acknowledged = true
  WHERE id = _alert_id AND organization_id = _org AND status <> 'resolved';
  IF NOT FOUND THEN RAISE EXCEPTION 'ALERT_NOT_OPEN_OR_NOT_FOUND'; END IF;
END;
$$;

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
    'schema_version', '20260802000011',
    'generated_at', now(),
    'organization', (SELECT to_jsonb(o) - 'created_by' FROM public.organizations o WHERE o.id = _org),
    'species', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.species t WHERE t.organization_id = _org),
    'genetic_lines', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.genetic_lines t WHERE t.organization_id = _org),
    'boxes', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.boxes t WHERE t.organization_id = _org),
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

REVOKE ALL ON FUNCTION public.evaluate_alert_rules(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_alert_rules(uuid, text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.alert_compare(numeric, text, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.alert_evaluation_runs FROM anon, authenticated;
GRANT SELECT ON TABLE public.alert_evaluation_runs TO authenticated;
REVOKE EXECUTE ON FUNCTION public.acknowledge_alert(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acknowledge_alert(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.resolve_alert(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_alert(uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.export_organization_data() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.export_organization_data() TO authenticated;
