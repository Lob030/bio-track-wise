-- BioTrack: bitacora operativa inmutable, normalizada y aislada por organizacion.

BEGIN;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

ALTER TABLE public.audit_log
  ADD COLUMN IF NOT EXISTS operation TEXT,
  ADD COLUMN IF NOT EXISTS origin TEXT,
  ADD COLUMN IF NOT EXISTS event_version SMALLINT,
  ADD COLUMN IF NOT EXISTS transaction_id BIGINT,
  ADD COLUMN IF NOT EXISTS entry_hash TEXT;

UPDATE public.audit_log
SET operation = COALESCE(operation, action::TEXT),
    origin = COALESCE(origin, 'legacy:database'),
    event_version = COALESCE(event_version, 1),
    transaction_id = COALESCE(transaction_id, 0)
WHERE operation IS NULL
   OR origin IS NULL
   OR event_version IS NULL
   OR transaction_id IS NULL;

ALTER TABLE public.audit_log
  ALTER COLUMN operation SET NOT NULL,
  ALTER COLUMN origin SET NOT NULL,
  ALTER COLUMN origin DROP DEFAULT,
  ALTER COLUMN event_version SET NOT NULL,
  ALTER COLUMN event_version SET DEFAULT 1,
  ALTER COLUMN transaction_id SET NOT NULL,
  ALTER COLUMN transaction_id SET DEFAULT txid_current();

CREATE INDEX IF NOT EXISTS idx_audit_log_org_action_created
  ON public.audit_log (organization_id, action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_org_target_created
  ON public.audit_log (organization_id, target_table, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_org_actor_created
  ON public.audit_log (organization_id, actor_user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.normalize_audit_entry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _request_id TEXT := NULLIF(current_setting('app.audit.request_id', true), '');
  _request_path TEXT := NULLIF(current_setting('request.path', true), '');
  _context_origin TEXT := NULLIF(current_setting('app.audit.origin', true), '');
  _context_reason TEXT := NULLIF(current_setting('app.audit.reason', true), '');
  _hash_input TEXT;
BEGIN
  IF NEW.organization_id IS NULL THEN
    RAISE EXCEPTION 'Toda entrada de auditoria requiere organization_id.';
  END IF;

  NEW.actor_user_id := COALESCE(NEW.actor_user_id, auth.uid());
  NEW.operation := COALESCE(NULLIF(trim(NEW.operation), ''), NEW.action::TEXT);
  NEW.origin := COALESCE(
    NULLIF(trim(NEW.origin), ''),
    _context_origin,
    CASE
      WHEN _request_path IS NOT NULL THEN 'api:' || _request_path
      WHEN auth.uid() IS NOT NULL THEN 'api:authenticated'
      ELSE 'database:system'
    END
  );
  NEW.reason := COALESCE(NEW.reason, _context_reason);
  NEW.request_id := COALESCE(
    NEW.request_id,
    CASE WHEN _request_id IS NULL THEN NULL ELSE _request_id::UUID END
  );
  NEW.payload := COALESCE(NEW.payload, '{}'::JSONB);
  NEW.created_at := COALESCE(NEW.created_at, clock_timestamp());
  NEW.event_version := COALESCE(NEW.event_version, 1);
  NEW.transaction_id := COALESCE(NEW.transaction_id, txid_current());

  _hash_input := jsonb_build_object(
    'id', NEW.id,
    'organization_id', NEW.organization_id,
    'actor_user_id', NEW.actor_user_id,
    'created_at', NEW.created_at,
    'action', NEW.action,
    'operation', NEW.operation,
    'target_table', NEW.target_table,
    'target_id', NEW.target_id,
    'old_values', NEW.old_values,
    'new_values', NEW.new_values,
    'reason', NEW.reason,
    'origin', NEW.origin,
    'request_id', NEW.request_id,
    'payload', NEW.payload,
    'event_version', NEW.event_version,
    'transaction_id', NEW.transaction_id
  )::TEXT;
  NEW.entry_hash := encode(digest(convert_to(_hash_input, 'UTF8'), 'sha256'), 'hex');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_audit_entry_trg ON public.audit_log;
CREATE TRIGGER normalize_audit_entry_trg
BEFORE INSERT ON public.audit_log
FOR EACH ROW EXECUTE FUNCTION public.normalize_audit_entry();

REVOKE ALL ON FUNCTION public.normalize_audit_entry() FROM PUBLIC, anon, authenticated;

UPDATE public.audit_log
SET entry_hash = encode(
  digest(
    convert_to(
      jsonb_build_object(
        'id', id,
        'organization_id', organization_id,
        'actor_user_id', actor_user_id,
        'created_at', created_at,
        'action', action,
        'operation', operation,
        'target_table', target_table,
        'target_id', target_id,
        'old_values', old_values,
        'new_values', new_values,
        'reason', reason,
        'origin', origin,
        'request_id', request_id,
        'payload', payload,
        'event_version', event_version,
        'transaction_id', transaction_id
      )::TEXT,
      'UTF8'
    ),
    'sha256'
  ),
  'hex'
)
WHERE entry_hash IS NULL;

ALTER TABLE public.audit_log ALTER COLUMN entry_hash SET NOT NULL;

CREATE OR REPLACE FUNCTION public.prevent_audit_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'La bitacora es inmutable: no se permite %.', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS prevent_audit_mutation_trg ON public.audit_log;
CREATE TRIGGER prevent_audit_mutation_trg
BEFORE UPDATE OR DELETE ON public.audit_log
FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_mutation();

REVOKE ALL ON FUNCTION public.prevent_audit_mutation() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.write_audit_event(
  _organization_id UUID,
  _action public.audit_action,
  _target_table TEXT,
  _target_id UUID DEFAULT NULL,
  _old_values JSONB DEFAULT NULL,
  _new_values JSONB DEFAULT NULL,
  _reason TEXT DEFAULT NULL,
  _origin TEXT DEFAULT NULL,
  _request_id UUID DEFAULT NULL,
  _payload JSONB DEFAULT '{}'::JSONB,
  _operation TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _audit_id UUID;
BEGIN
  IF _organization_id IS NULL OR _action IS NULL THEN
    RAISE EXCEPTION 'organization_id y action son obligatorios para auditar.';
  END IF;

  INSERT INTO public.audit_log (
    organization_id, actor_user_id, action, operation, target_table, target_id,
    old_values, new_values, reason, origin, request_id, payload
  ) VALUES (
    _organization_id, auth.uid(), _action, COALESCE(_operation, _action::TEXT),
    NULLIF(trim(_target_table), ''), _target_id, _old_values, _new_values,
    NULLIF(trim(_reason), ''), NULLIF(trim(_origin), ''), _request_id,
    COALESCE(_payload, '{}'::JSONB)
  )
  RETURNING id INTO _audit_id;

  RETURN _audit_id;
END;
$$;

REVOKE ALL ON FUNCTION public.write_audit_event(
  UUID, public.audit_action, TEXT, UUID, JSONB, JSONB, TEXT, TEXT, UUID, JSONB, TEXT
) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.audit_row_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _old JSONB;
  _new JSONB;
  _row JSONB;
  _org UUID;
  _target_id UUID;
  _action public.audit_action;
  _operation TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _new := to_jsonb(NEW);
    _row := _new;
  ELSIF TG_OP = 'UPDATE' THEN
    _old := to_jsonb(OLD);
    _new := to_jsonb(NEW);
    IF _old = _new THEN RETURN NEW; END IF;
    _row := _new;
  ELSE
    _old := to_jsonb(OLD);
    _row := _old;
  END IF;

  _org := CASE
    WHEN TG_TABLE_NAME = 'organizations' THEN NULLIF(_row->>'id', '')::UUID
    ELSE NULLIF(_row->>'organization_id', '')::UUID
  END;
  IF _org IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  _target_id := COALESCE(
    NULLIF(_row->>'id', '')::UUID,
    NULLIF(_row->>'user_id', '')::UUID
  );

  IF TG_OP = 'INSERT' THEN
    _action := CASE
      WHEN TG_TABLE_NAME = 'orders' THEN 'sale_created'::public.audit_action
      WHEN TG_TABLE_NAME = 'order_item_allocations' THEN 'fifo_allocation'::public.audit_action
      WHEN TG_TABLE_NAME = 'warehouse_purchases' THEN 'purchase_created'::public.audit_action
      ELSE 'record_created'::public.audit_action
    END;
  ELSIF TG_OP = 'UPDATE' THEN
    _action := CASE
      WHEN TG_TABLE_NAME IN ('organizations', 'alert_rules', 'species', 'genetic_lines', 'boxes')
        THEN 'configuration_change'::public.audit_action
      WHEN TG_TABLE_NAME LIKE 'warehouse_%'
        THEN 'inventory_adjustment'::public.audit_action
      ELSE 'record_updated'::public.audit_action
    END;
  ELSE
    _action := 'record_deleted'::public.audit_action;
  END IF;

  _operation := lower(TG_OP) || ':' || TG_TABLE_NAME;
  PERFORM public.write_audit_event(
    _org,
    _action,
    TG_TABLE_NAME,
    _target_id,
    _old,
    _new,
    NULL,
    NULL,
    NULL,
    jsonb_build_object('schema', TG_TABLE_SCHEMA, 'trigger_operation', TG_OP),
    _operation
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_row_change() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  _table TEXT;
BEGIN
  FOREACH _table IN ARRAY ARRAY[
    'lots', 'orders', 'order_items', 'order_item_allocations',
    'warehouse_food', 'warehouse_cleaning', 'warehouse_tools',
    'warehouse_packaging', 'warehouse_purchases', 'user_roles',
    'alert_rules', 'species', 'genetic_lines', 'boxes'
  ]
  LOOP
    IF to_regclass('public.' || _table) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS audit_row_change_trg ON public.%I', _table);
      EXECUTE format(
        'CREATE TRIGGER audit_row_change_trg AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_row_change()',
        _table
      );
    END IF;
  END LOOP;
END;
$$;

-- La organizacion solo se audita al cambiar configuracion. Auditar su DELETE
-- impediria eliminarla por la propia llave foranea de la bitacora.
DROP TRIGGER IF EXISTS audit_row_change_trg ON public.organizations;
CREATE TRIGGER audit_row_change_trg
AFTER UPDATE ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

-- La solicitud transaccional tambien establece correlacion y origen para todos
-- los triggers y eventos semanticos ejecutados dentro de la misma transaccion.
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

  PERFORM set_config('app.audit.request_id', _request_id::TEXT, true);
  PERFORM set_config('app.audit.origin', 'rpc:' || trim(_operation), true);

  INSERT INTO public.transaction_requests (
    organization_id, actor_user_id, request_id, operation
  ) VALUES (
    _org, _uid, _request_id, _operation
  )
  ON CONFLICT DO NOTHING;

  IF FOUND THEN RETURN NULL; END IF;

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

REVOKE ALL ON FUNCTION public.begin_transaction_request(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "audit_select_member" ON public.audit_log;
DROP POLICY IF EXISTS "audit_select_admin" ON public.audit_log;
CREATE POLICY "audit_select_admin"
ON public.audit_log
FOR SELECT
USING (
  organization_id = public.get_my_org_id()
  AND public.is_org_admin()
);

REVOKE ALL ON TABLE public.audit_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.audit_log TO authenticated;

COMMIT;
