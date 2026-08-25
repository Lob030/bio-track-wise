-- BioTrack: control profesional, aprobaciones, rentabilidad, mantenimiento, importacion y sedes.

BEGIN;

CREATE TABLE public.facility_user_access(
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  location_id uuid NOT NULL,
  can_operate boolean NOT NULL DEFAULT true,
  granted_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(organization_id,user_id,location_id),
  CONSTRAINT facility_access_location_fkey FOREIGN KEY(organization_id,location_id)
    REFERENCES public.facility_locations(organization_id,id) ON DELETE CASCADE
);

CREATE TABLE public.adjustment_approval_requests(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  supply_item_id uuid NOT NULL,
  quantity_delta numeric(14,4) NOT NULL CHECK(quantity_delta<>0),
  reason text NOT NULL CHECK(trim(reason)<>''),
  batch_code text,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','cancelled')),
  decided_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  decided_at timestamptz,
  decision_notes text,
  request_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT adjustment_approval_item_fkey FOREIGN KEY(organization_id,supply_item_id)
    REFERENCES public.supply_items(organization_id,id) ON DELETE RESTRICT,
  UNIQUE(organization_id,requested_by,request_id)
);
CREATE INDEX adjustment_approvals_pending_idx ON public.adjustment_approval_requests(organization_id,status,created_at);

CREATE TABLE public.maintenance_assets(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  code text NOT NULL CHECK(trim(code)<>''),name text NOT NULL CHECK(trim(name)<>''),
  asset_type text NOT NULL CHECK(asset_type IN ('equipment','rack','box','sensor','hvac','vehicle','other')),
  location_id uuid,box_id uuid,manufacturer text,model text,serial_number text,
  acquired_on date,warranty_until date,active boolean NOT NULL DEFAULT true,notes text,
  created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,id),
  CONSTRAINT maintenance_asset_location_fkey FOREIGN KEY(organization_id,location_id)
    REFERENCES public.facility_locations(organization_id,id) ON DELETE RESTRICT,
  CONSTRAINT maintenance_asset_box_fkey FOREIGN KEY(organization_id,box_id)
    REFERENCES public.boxes(organization_id,id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX maintenance_assets_code_uidx ON public.maintenance_assets(organization_id,lower(trim(code)));

CREATE TABLE public.maintenance_plans(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  asset_id uuid NOT NULL,title text NOT NULL CHECK(trim(title)<>''),frequency_days int NOT NULL CHECK(frequency_days>0),
  next_due_on date NOT NULL,assigned_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  instructions text,estimated_minutes int CHECK(estimated_minutes IS NULL OR estimated_minutes>=0),active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,id),CONSTRAINT maintenance_plan_asset_fkey FOREIGN KEY(organization_id,asset_id)
    REFERENCES public.maintenance_assets(organization_id,id) ON DELETE CASCADE
);
CREATE INDEX maintenance_plans_due_idx ON public.maintenance_plans(organization_id,active,next_due_on);

CREATE TABLE public.maintenance_events(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  plan_id uuid NOT NULL,asset_id uuid NOT NULL,performed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  performed_at timestamptz NOT NULL DEFAULT now(),outcome text NOT NULL CHECK(outcome IN ('completed','failed','rescheduled')),
  notes text,evidence_url text CHECK(evidence_url IS NULL OR evidence_url~*'^https?://'),cost numeric(14,4) CHECK(cost IS NULL OR cost>=0),
  request_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT maintenance_event_plan_fkey FOREIGN KEY(organization_id,plan_id)
    REFERENCES public.maintenance_plans(organization_id,id) ON DELETE RESTRICT,
  CONSTRAINT maintenance_event_asset_fkey FOREIGN KEY(organization_id,asset_id)
    REFERENCES public.maintenance_assets(organization_id,id) ON DELETE RESTRICT,
  UNIQUE(organization_id,request_id)
);

CREATE TABLE public.label_print_jobs(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,entity_type text NOT NULL CHECK(entity_type IN ('box','lot','location','supply_batch')),
  entity_ids uuid[] NOT NULL CHECK(cardinality(entity_ids)>0),label_count int NOT NULL CHECK(label_count>0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.import_jobs(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  entity_type text NOT NULL CHECK(entity_type IN ('supply_items','clients')),
  status text NOT NULL DEFAULT 'validated' CHECK(status IN ('validated','applied','failed','cancelled')),
  source_name text,rows jsonb NOT NULL CHECK(jsonb_typeof(rows)='array'),validation_errors jsonb NOT NULL DEFAULT '[]',
  row_count int NOT NULL,applied_count int NOT NULL DEFAULT 0,error_message text,request_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),applied_at timestamptz,
  UNIQUE(organization_id,requested_by,request_id)
);

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['facility_user_access','adjustment_approval_requests','maintenance_assets',
    'maintenance_plans','maintenance_events','label_print_jobs','import_jobs'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (organization_id=public.get_my_org_id() AND public.is_org_member())',t||'_member_select',t);
  END LOOP;
END $$;
CREATE POLICY maintenance_assets_admin_all ON public.maintenance_assets FOR ALL
  USING(organization_id=public.get_my_org_id() AND public.is_org_admin())
  WITH CHECK(organization_id=public.get_my_org_id() AND public.is_org_admin());
CREATE POLICY maintenance_plans_admin_all ON public.maintenance_plans FOR ALL
  USING(organization_id=public.get_my_org_id() AND public.is_org_admin())
  WITH CHECK(organization_id=public.get_my_org_id() AND public.is_org_admin());
GRANT SELECT ON public.facility_user_access,public.adjustment_approval_requests,public.maintenance_assets,
  public.maintenance_plans,public.maintenance_events,public.label_print_jobs,public.import_jobs TO authenticated;
GRANT INSERT,UPDATE,DELETE ON public.maintenance_assets,public.maintenance_plans TO authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.facility_user_access,public.adjustment_approval_requests,
  public.maintenance_events,public.label_print_jobs,public.import_jobs FROM authenticated,anon;

CREATE OR REPLACE FUNCTION public.can_access_location(_location uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.is_org_admin() OR NOT EXISTS(
    SELECT 1 FROM public.facility_user_access a WHERE a.organization_id=public.get_my_org_id() AND a.user_id=auth.uid()
  ) OR EXISTS(
    WITH RECURSIVE ancestors AS (
      SELECT id,parent_id FROM public.facility_locations WHERE id=_location AND organization_id=public.get_my_org_id()
      UNION ALL SELECT p.id,p.parent_id FROM public.facility_locations p JOIN ancestors c ON c.parent_id=p.id
    ) SELECT 1 FROM ancestors x JOIN public.facility_user_access a ON a.location_id=x.id
      WHERE a.organization_id=public.get_my_org_id() AND a.user_id=auth.uid() AND a.can_operate
  )
$$;
REVOKE ALL ON FUNCTION public.can_access_location(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_access_location(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_facility_write_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE target_location uuid;
BEGIN
  IF auth.uid() IS NULL OR auth.role()='service_role' OR public.is_org_admin() THEN
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME='boxes' THEN target_location:=CASE WHEN TG_OP='DELETE' THEN OLD.location_id ELSE NEW.location_id END;
  ELSIF TG_TABLE_NAME='lots' THEN
    SELECT location_id INTO target_location FROM public.boxes
      WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.box_id ELSE NEW.box_id END
        AND organization_id=CASE WHEN TG_OP='DELETE' THEN OLD.organization_id ELSE NEW.organization_id END;
  ELSE target_location:=CASE WHEN TG_OP='DELETE' THEN OLD.location_id ELSE NEW.location_id END; END IF;
  IF NOT public.can_access_location(target_location) THEN RAISE EXCEPTION 'La operacion queda fuera de las sedes asignadas.'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.enforce_facility_write_scope() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER enforce_facility_write_scope_trg BEFORE INSERT OR UPDATE OR DELETE ON public.boxes
  FOR EACH ROW EXECUTE FUNCTION public.enforce_facility_write_scope();
CREATE TRIGGER enforce_facility_write_scope_trg BEFORE INSERT OR UPDATE OR DELETE ON public.lots
  FOR EACH ROW EXECUTE FUNCTION public.enforce_facility_write_scope();
CREATE TRIGGER enforce_facility_write_scope_trg BEFORE UPDATE OR DELETE ON public.operational_tasks
  FOR EACH ROW EXECUTE FUNCTION public.enforce_facility_write_scope();

DROP POLICY IF EXISTS facility_locations_member_select ON public.facility_locations;
CREATE POLICY facility_locations_member_select ON public.facility_locations FOR SELECT USING(
  organization_id=public.get_my_org_id() AND public.is_org_member() AND public.can_access_location(id));
DROP POLICY IF EXISTS boxes_select ON public.boxes;
CREATE POLICY boxes_select ON public.boxes FOR SELECT USING(organization_id=public.get_my_org_id()
  AND public.is_org_member() AND ((location_id IS NULL AND NOT EXISTS(SELECT 1 FROM public.facility_user_access a
    WHERE a.organization_id=public.get_my_org_id() AND a.user_id=auth.uid())) OR public.can_access_location(location_id)));
DROP POLICY IF EXISTS lots_select ON public.lots;
CREATE POLICY lots_select ON public.lots FOR SELECT USING(organization_id=public.get_my_org_id() AND public.is_org_member()
  AND ((box_id IS NULL AND NOT EXISTS(SELECT 1 FROM public.facility_user_access a
    WHERE a.organization_id=public.get_my_org_id() AND a.user_id=auth.uid())) OR EXISTS(
    SELECT 1 FROM public.boxes b WHERE b.id=lots.box_id AND b.organization_id=lots.organization_id
      AND public.can_access_location(b.location_id))));
DROP POLICY IF EXISTS operational_tasks_member_select ON public.operational_tasks;
CREATE POLICY operational_tasks_member_select ON public.operational_tasks FOR SELECT USING(
  organization_id=public.get_my_org_id() AND public.is_org_member()
  AND ((location_id IS NULL AND NOT EXISTS(SELECT 1 FROM public.facility_user_access a
    WHERE a.organization_id=public.get_my_org_id() AND a.user_id=auth.uid())) OR public.can_access_location(location_id)));

CREATE TRIGGER set_org_and_owner_trg BEFORE INSERT ON public.maintenance_assets
  FOR EACH ROW EXECUTE FUNCTION public.set_org_and_owner();
CREATE TRIGGER prevent_org_and_owner_change_trg BEFORE UPDATE ON public.maintenance_assets
  FOR EACH ROW EXECUTE FUNCTION public.prevent_org_and_owner_change();
CREATE TRIGGER set_current_organization_trg BEFORE INSERT ON public.maintenance_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_current_organization();

CREATE OR REPLACE FUNCTION public.set_facility_user_access_tx(_user_id uuid,_location_id uuid,_granted boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o uuid:=public.get_my_org_id();
BEGIN
  IF o IS NULL OR NOT public.is_org_admin() OR NOT EXISTS(SELECT 1 FROM public.user_roles WHERE organization_id=o AND user_id=_user_id AND status='active')
    OR NOT EXISTS(SELECT 1 FROM public.facility_locations WHERE organization_id=o AND id=_location_id) THEN RAISE EXCEPTION 'Usuario o sede no disponible.'; END IF;
  IF _granted THEN INSERT INTO public.facility_user_access(organization_id,user_id,location_id,can_operate,granted_by,created_at)
    VALUES(o,_user_id,_location_id,true,auth.uid(),now())
    ON CONFLICT(organization_id,user_id,location_id) DO UPDATE SET can_operate=true,granted_by=auth.uid();
  ELSE DELETE FROM public.facility_user_access WHERE organization_id=o AND user_id=_user_id AND location_id=_location_id; END IF;
  RETURN jsonb_build_object('success',true,'granted',_granted);
END $$;

CREATE OR REPLACE FUNCTION public.request_supply_adjustment_tx(_request_id uuid,_supply_item_id uuid,
  _quantity_delta numeric,_reason text,_batch_code text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o uuid:=public.get_my_org_id(); cached jsonb; aid uuid; result jsonb;
BEGIN
  cached:=public.begin_transaction_request(_request_id,'approval:adjustment'); IF cached IS NOT NULL THEN RETURN cached; END IF;
  IF o IS NULL OR NOT public.is_org_member() OR _quantity_delta=0 OR trim(COALESCE(_reason,''))='' OR
    NOT EXISTS(SELECT 1 FROM public.supply_items WHERE organization_id=o AND id=_supply_item_id) THEN RAISE EXCEPTION 'Solicitud invalida.'; END IF;
  INSERT INTO public.adjustment_approval_requests(organization_id,requested_by,supply_item_id,quantity_delta,reason,batch_code,request_id)
    VALUES(o,auth.uid(),_supply_item_id,_quantity_delta,trim(_reason),NULLIF(trim(_batch_code),''),_request_id) RETURNING id INTO aid;
  result:=jsonb_build_object('success',true,'approval_id',aid,'status','pending');
  PERFORM public.finish_transaction_request(_request_id,'approval:adjustment',result); RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.decide_supply_adjustment_tx(_approval_id uuid,_approved boolean,_notes text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o uuid:=public.get_my_org_id(); a public.adjustment_approval_requests%ROWTYPE; applied jsonb;
BEGIN
  IF o IS NULL OR NOT public.is_org_admin() OR trim(COALESCE(_notes,''))='' THEN RAISE EXCEPTION 'Decision invalida.'; END IF;
  SELECT * INTO a FROM public.adjustment_approval_requests WHERE organization_id=o AND id=_approval_id FOR UPDATE;
  IF NOT FOUND OR a.status<>'pending' OR a.requested_by=auth.uid() THEN RAISE EXCEPTION 'Solicitud no disponible o requiere un segundo usuario.'; END IF;
  IF _approved THEN applied:=public.adjust_supply_tx(a.request_id,a.supply_item_id,a.quantity_delta,a.reason,a.batch_code); END IF;
  UPDATE public.adjustment_approval_requests SET status=CASE WHEN _approved THEN 'approved' ELSE 'rejected' END,
    decided_by=auth.uid(),decided_at=now(),decision_notes=trim(_notes) WHERE id=a.id;
  RETURN jsonb_build_object('success',true,'status',CASE WHEN _approved THEN 'approved' ELSE 'rejected' END,'result',applied);
END $$;

CREATE OR REPLACE FUNCTION public.create_maintenance_plan_tx(_request_id uuid,_asset jsonb,_plan jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o uuid:=public.get_my_org_id(); cached jsonb; asset_id uuid; plan_id uuid; result jsonb;
BEGIN
  cached:=public.begin_transaction_request(_request_id,'maintenance:create'); IF cached IS NOT NULL THEN RETURN cached; END IF;
  IF o IS NULL OR NOT public.is_org_admin() OR trim(COALESCE(_asset->>'code',''))='' OR trim(COALESCE(_asset->>'name',''))=''
    OR COALESCE((_plan->>'frequency_days')::int,0)<=0 THEN RAISE EXCEPTION 'Activo o plan invalido.'; END IF;
  INSERT INTO public.maintenance_assets(organization_id,owner_id,code,name,asset_type,location_id,manufacturer,model,serial_number,notes)
    VALUES(o,auth.uid(),trim(_asset->>'code'),trim(_asset->>'name'),COALESCE(_asset->>'asset_type','equipment'),
      NULLIF(_asset->>'location_id','')::uuid,NULLIF(trim(_asset->>'manufacturer'),''),NULLIF(trim(_asset->>'model'),''),
      NULLIF(trim(_asset->>'serial_number'),''),NULLIF(trim(_asset->>'notes'),'')) RETURNING id INTO asset_id;
  INSERT INTO public.maintenance_plans(organization_id,asset_id,title,frequency_days,next_due_on,assigned_user_id,instructions,estimated_minutes)
    VALUES(o,asset_id,COALESCE(NULLIF(trim(_plan->>'title'),''),'Mantenimiento preventivo'),(_plan->>'frequency_days')::int,
      COALESCE(NULLIF(_plan->>'next_due_on','')::date,current_date),NULLIF(_plan->>'assigned_user_id','')::uuid,
      NULLIF(trim(_plan->>'instructions'),''),NULLIF(_plan->>'estimated_minutes','')::int) RETURNING id INTO plan_id;
  result:=jsonb_build_object('success',true,'asset_id',asset_id,'plan_id',plan_id);
  PERFORM public.finish_transaction_request(_request_id,'maintenance:create',result); RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.complete_maintenance_tx(_request_id uuid,_plan_id uuid,_outcome text,
  _notes text DEFAULT NULL,_cost numeric DEFAULT NULL,_evidence_url text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o uuid:=public.get_my_org_id(); cached jsonb; p public.maintenance_plans%ROWTYPE; eid uuid; result jsonb;
BEGIN
  cached:=public.begin_transaction_request(_request_id,'maintenance:complete'); IF cached IS NOT NULL THEN RETURN cached; END IF;
  IF o IS NULL OR NOT public.is_org_member() OR _outcome NOT IN ('completed','failed','rescheduled') OR COALESCE(_cost,0)<0 THEN RAISE EXCEPTION 'Resultado invalido.'; END IF;
  SELECT * INTO p FROM public.maintenance_plans WHERE organization_id=o AND id=_plan_id AND active FOR UPDATE;
  IF NOT FOUND OR (p.assigned_user_id IS NOT NULL AND p.assigned_user_id<>auth.uid() AND NOT public.is_org_admin()) THEN RAISE EXCEPTION 'Plan no disponible para este usuario.'; END IF;
  INSERT INTO public.maintenance_events(organization_id,plan_id,asset_id,performed_by,outcome,notes,evidence_url,cost,request_id)
    VALUES(o,p.id,p.asset_id,auth.uid(),_outcome,NULLIF(trim(_notes),''),NULLIF(trim(_evidence_url),''),_cost,_request_id) RETURNING id INTO eid;
  UPDATE public.maintenance_plans SET next_due_on=CASE WHEN _outcome='completed' THEN current_date+frequency_days ELSE current_date+1 END,updated_at=now() WHERE id=p.id;
  result:=jsonb_build_object('success',true,'event_id',eid);
  PERFORM public.finish_transaction_request(_request_id,'maintenance:complete',result); RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.record_label_print_job_tx(_entity_type text,_entity_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o uuid:=public.get_my_org_id(); jid uuid; valid_count int;
BEGIN
  IF o IS NULL OR NOT public.is_org_member() OR _entity_type NOT IN ('box','lot','location','supply_batch') OR cardinality(_entity_ids)=0 THEN RAISE EXCEPTION 'Trabajo de impresion invalido.'; END IF;
  IF _entity_type='box' THEN SELECT count(*) INTO valid_count FROM public.boxes WHERE organization_id=o AND id=ANY(_entity_ids);
  ELSIF _entity_type='lot' THEN SELECT count(*) INTO valid_count FROM public.lots WHERE organization_id=o AND id=ANY(_entity_ids);
  ELSIF _entity_type='location' THEN SELECT count(*) INTO valid_count FROM public.facility_locations WHERE organization_id=o AND id=ANY(_entity_ids);
  ELSE SELECT count(*) INTO valid_count FROM public.supply_batches WHERE organization_id=o AND id=ANY(_entity_ids); END IF;
  IF valid_count<>cardinality(_entity_ids) THEN RAISE EXCEPTION 'Una o mas etiquetas no pertenecen a la organizacion.'; END IF;
  INSERT INTO public.label_print_jobs(organization_id,requested_by,entity_type,entity_ids,label_count)
    VALUES(o,auth.uid(),_entity_type,_entity_ids,cardinality(_entity_ids)) RETURNING id INTO jid;
  RETURN jsonb_build_object('success',true,'job_id',jid);
END $$;

CREATE OR REPLACE FUNCTION public.validate_import_job_tx(_request_id uuid,_entity_type text,_source_name text,_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o uuid:=public.get_my_org_id(); cached jsonb; errors jsonb:='[]'; r jsonb; pos int:=0; jid uuid; result jsonb;
  seen_skus text[]:=ARRAY[]::text[];
BEGIN
  cached:=public.begin_transaction_request(_request_id,'import:validate'); IF cached IS NOT NULL THEN RETURN cached; END IF;
  IF o IS NULL OR NOT public.is_org_admin() OR _entity_type NOT IN ('supply_items','clients') OR jsonb_typeof(_rows)<>'array'
    OR jsonb_array_length(_rows)=0 OR jsonb_array_length(_rows)>500 THEN RAISE EXCEPTION 'Importacion invalida o excede 500 filas.'; END IF;
  FOR r IN SELECT * FROM jsonb_array_elements(_rows) LOOP pos:=pos+1;
    IF _entity_type='supply_items' AND (trim(COALESCE(r->>'sku',''))='' OR trim(COALESCE(r->>'name',''))=''
      OR COALESCE(r->>'category','') NOT IN ('feed','substrate','medication','cleaning','packaging','equipment','other')
      OR COALESCE(NULLIF(r->>'minimum_quantity',''),'0')!~'^\d+(\.\d+)?$'
      OR COALESCE(NULLIF(r->>'lead_time_days',''),'0')!~'^\d+$'
      OR lower(trim(r->>'sku'))=ANY(seen_skus)
      OR EXISTS(SELECT 1 FROM public.supply_items s WHERE s.organization_id=o AND lower(trim(s.sku))=lower(trim(r->>'sku')))) THEN
      errors:=errors||jsonb_build_array(jsonb_build_object('row',pos,'message','SKU, nombre, categoria, cantidades o duplicidad invalidos'));
    ELSIF _entity_type='clients' AND (trim(COALESCE(r->>'name',''))='' OR trim(COALESCE(r->>'phone',''))=''
      OR COALESCE(NULLIF(r->>'profile',''),'particular') NOT IN ('particular','pimvs','uma','veterinaria','comercializadora','uso_propio')
      OR (NULLIF(trim(r->>'email'),'') IS NOT NULL AND trim(r->>'email')!~*'^[^@\s]+@[^@\s]+\.[^@\s]+$')) THEN
      errors:=errors||jsonb_build_array(jsonb_build_object('row',pos,'message','Nombre, telefono, perfil o correo invalidos'));
    END IF;
    IF _entity_type='supply_items' THEN seen_skus:=array_append(seen_skus,lower(trim(r->>'sku'))); END IF;
  END LOOP;
  INSERT INTO public.import_jobs(organization_id,requested_by,entity_type,source_name,rows,validation_errors,row_count,request_id)
    VALUES(o,auth.uid(),_entity_type,NULLIF(trim(_source_name),''),_rows,errors,jsonb_array_length(_rows),_request_id) RETURNING id INTO jid;
  result:=jsonb_build_object('success',true,'job_id',jid,'valid',jsonb_array_length(errors)=0,'errors',errors,'row_count',jsonb_array_length(_rows));
  PERFORM public.finish_transaction_request(_request_id,'import:validate',result); RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.apply_import_job_tx(_request_id uuid,_job_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o uuid:=public.get_my_org_id(); cached jsonb; j public.import_jobs%ROWTYPE; r jsonb; applied int:=0; result jsonb;
BEGIN
  cached:=public.begin_transaction_request(_request_id,'import:apply'); IF cached IS NOT NULL THEN RETURN cached; END IF;
  IF o IS NULL OR NOT public.is_org_admin() THEN RAISE EXCEPTION 'Solo administradores importan datos.'; END IF;
  SELECT * INTO j FROM public.import_jobs WHERE organization_id=o AND id=_job_id FOR UPDATE;
  IF NOT FOUND OR j.status<>'validated' OR jsonb_array_length(j.validation_errors)>0 THEN RAISE EXCEPTION 'Importacion no disponible o contiene errores.'; END IF;
  FOR r IN SELECT * FROM jsonb_array_elements(j.rows) LOOP
    IF j.entity_type='supply_items' THEN
      INSERT INTO public.supply_items(organization_id,owner_id,sku,name,category,unit,minimum_quantity,preferred_vendor,lead_time_days)
      VALUES(o,auth.uid(),trim(r->>'sku'),trim(r->>'name'),r->>'category',COALESCE(NULLIF(trim(r->>'unit'),''),'unit'),
        COALESCE(NULLIF(r->>'minimum_quantity','')::numeric,0),NULLIF(trim(r->>'preferred_vendor'),''),COALESCE(NULLIF(r->>'lead_time_days','')::int,0));
    ELSE
      INSERT INTO public.clients(organization_id,owner_id,name,phone,profile,email,notes)
      VALUES(o,auth.uid(),trim(r->>'name'),trim(r->>'phone'),COALESCE(NULLIF(r->>'profile','')::public.client_profile,'particular'),
        NULLIF(trim(r->>'email'),''),NULLIF(trim(r->>'notes'),''));
    END IF;
    applied:=applied+1;
  END LOOP;
  UPDATE public.import_jobs SET status='applied',applied_count=applied,applied_at=now() WHERE id=j.id;
  result:=jsonb_build_object('success',true,'applied',applied,'job_id',j.id);
  PERFORM public.finish_transaction_request(_request_id,'import:apply',result); RETURN result;
END $$;

CREATE OR REPLACE VIEW public.operational_reconciliation WITH(security_invoker=true) AS
SELECT organization_id,'lot_balance' issue_type,'lot' entity_type,lot_id entity_id,'critical' severity,
  (current_males+current_females+current_unsexed)::numeric expected_value,
  (ledger_males+ledger_females+ledger_unsexed)::numeric actual_value,
  ((current_males+current_females+current_unsexed)-(ledger_males+ledger_females+ledger_unsexed))::numeric difference,
  'El saldo del lote no coincide con su libro de eventos.' message FROM public.lot_balance_reconciliation WHERE NOT is_consistent
UNION ALL
SELECT s.organization_id,'supply_batches','supply_item',s.id,'high',s.current_quantity,COALESCE(sum(b.quantity_remaining),0),
  s.current_quantity-COALESCE(sum(b.quantity_remaining),0),'Existencia diferente a la suma de lotes fisicos.'
FROM public.supply_items s LEFT JOIN public.supply_batches b ON b.organization_id=s.organization_id AND b.supply_item_id=s.id
LEFT JOIN public.inventory_source_links x ON x.organization_id=s.organization_id AND x.supply_item_id=s.id
WHERE x.supply_item_id IS NULL GROUP BY s.organization_id,s.id HAVING s.current_quantity<>COALESCE(sum(b.quantity_remaining),0)
UNION ALL
SELECT c.organization_id,'unallocated_cost','cost_entry',c.id,'medium',c.total_amount,COALESCE(sum(a.amount),0),
  c.total_amount-COALESCE(sum(a.amount),0),'Costo sin asignacion completa a produccion.'
FROM public.cost_entries c LEFT JOIN public.lot_cost_allocations a ON a.organization_id=c.organization_id AND a.cost_entry_id=c.id
GROUP BY c.organization_id,c.id HAVING c.total_amount<>COALESCE(sum(a.amount),0);
GRANT SELECT ON public.operational_reconciliation TO authenticated;

CREATE OR REPLACE VIEW public.profitability_dimensions WITH(security_invoker=true) AS
SELECT f.organization_id,'lot' dimension_type,f.lot_id dimension_id,COALESCE(f.lot_code,f.lot_id::text) dimension_name,
  f.revenue,f.recognized_cogs cost,f.gross_margin margin,CASE WHEN f.revenue>0 THEN round(f.gross_margin/f.revenue*100,2) END margin_pct
FROM public.lot_financial_summary f
UNION ALL SELECT f.organization_id,'species',l.species_id,COALESCE(s.name,'Sin especie'),sum(f.revenue),sum(f.recognized_cogs),sum(f.gross_margin),
  CASE WHEN sum(f.revenue)>0 THEN round(sum(f.gross_margin)/sum(f.revenue)*100,2) END
FROM public.lot_financial_summary f JOIN public.lots l ON l.id=f.lot_id LEFT JOIN public.species s ON s.id=l.species_id
GROUP BY f.organization_id,l.species_id,s.name
UNION ALL SELECT f.organization_id,'line',l.line_id,COALESCE(g.name,'Sin linea'),sum(f.revenue),sum(f.recognized_cogs),sum(f.gross_margin),
  CASE WHEN sum(f.revenue)>0 THEN round(sum(f.gross_margin)/sum(f.revenue)*100,2) END
FROM public.lot_financial_summary f JOIN public.lots l ON l.id=f.lot_id LEFT JOIN public.genetic_lines g ON g.id=l.line_id
GROUP BY f.organization_id,l.line_id,g.name
UNION ALL SELECT o.organization_id,'client',o.client_id,COALESCE(c.name,'Cliente sin identificar'),
  sum(a.qty_taken*i.unit_price),sum(a.qty_taken*COALESCE(f.cost_per_unit,0)),
  sum(a.qty_taken*i.unit_price)-sum(a.qty_taken*COALESCE(f.cost_per_unit,0)),
  CASE WHEN sum(a.qty_taken*i.unit_price)>0 THEN round(
    (sum(a.qty_taken*i.unit_price)-sum(a.qty_taken*COALESCE(f.cost_per_unit,0))) /
    sum(a.qty_taken*i.unit_price)*100,2) END
FROM public.order_item_allocations a
JOIN public.order_items i ON i.id=a.order_item_id AND i.organization_id=a.organization_id
JOIN public.orders o ON o.id=i.order_id AND o.organization_id=i.organization_id
LEFT JOIN public.clients c ON c.id=o.client_id AND c.organization_id=o.organization_id
LEFT JOIN public.lot_financial_summary f ON f.lot_id=a.lot_id AND f.organization_id=a.organization_id
GROUP BY o.organization_id,o.client_id,c.name;
GRANT SELECT ON public.profitability_dimensions TO authenticated;

CREATE OR REPLACE VIEW public.professional_procurement_forecast WITH(security_invoker=true) AS
WITH ordered AS (SELECT l.organization_id,l.supply_item_id,sum(l.quantity_ordered-l.quantity_received) open_quantity
  FROM public.purchase_order_lines l JOIN public.purchase_orders o ON o.id=l.purchase_order_id
  WHERE o.status IN ('draft','ordered','partial') GROUP BY l.organization_id,l.supply_item_id),
expiring AS (SELECT organization_id,supply_item_id,sum(quantity_remaining) expiring_quantity FROM public.supply_batches
  WHERE quantity_remaining>0 AND expiry_date<=current_date+30 GROUP BY organization_id,supply_item_id)
SELECT f.*,COALESCE(o.open_quantity,0) open_order_quantity,COALESCE(e.expiring_quantity,0) expiring_quantity,
  greatest(0,f.suggested_order_quantity-COALESCE(o.open_quantity,0)+COALESCE(e.expiring_quantity,0)) net_order_quantity,
  f.average_daily_use*30 projected_30_day_use
FROM public.supply_forecast f LEFT JOIN ordered o USING(organization_id,supply_item_id)
LEFT JOIN expiring e USING(organization_id,supply_item_id);
GRANT SELECT ON public.professional_procurement_forecast TO authenticated;

CREATE OR REPLACE VIEW public.operational_exceptions WITH(security_invoker=true) AS
SELECT organization_id,'overdue_task' exception_type,id entity_id,'high' severity,title message,due_at occurred_at
FROM public.operational_tasks WHERE status IN ('pending','in_progress') AND due_at<now()
UNION ALL SELECT organization_id,'critical_health',id,'critical','Caso sanitario critico: '||case_code,opened_at
FROM public.health_cases WHERE severity='critical' AND status IN ('open','monitoring')
UNION ALL SELECT organization_id,'negative_margin',lot_id,'high','Lote con margen negativo: '||COALESCE(lot_code,lot_id::text),now()
FROM public.lot_financial_summary WHERE gross_margin<0
UNION ALL SELECT organization_id,'maintenance_overdue',id,'medium','Mantenimiento vencido: '||title,next_due_on::timestamptz
FROM public.maintenance_plans WHERE active AND next_due_on<current_date
UNION ALL SELECT organization_id,'reconciliation',entity_id,severity,message,now()
FROM public.operational_reconciliation;
GRANT SELECT ON public.operational_exceptions TO authenticated;

REVOKE ALL ON FUNCTION public.set_facility_user_access_tx(uuid,uuid,boolean),
  public.request_supply_adjustment_tx(uuid,uuid,numeric,text,text),public.decide_supply_adjustment_tx(uuid,boolean,text),
  public.create_maintenance_plan_tx(uuid,jsonb,jsonb),public.complete_maintenance_tx(uuid,uuid,text,text,numeric,text),
  public.record_label_print_job_tx(text,uuid[]),public.validate_import_job_tx(uuid,text,text,jsonb),
  public.apply_import_job_tx(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_facility_user_access_tx(uuid,uuid,boolean),
  public.request_supply_adjustment_tx(uuid,uuid,numeric,text,text),public.decide_supply_adjustment_tx(uuid,boolean,text),
  public.create_maintenance_plan_tx(uuid,jsonb,jsonb),public.complete_maintenance_tx(uuid,uuid,text,text,numeric,text),
  public.record_label_print_job_tx(text,uuid[]),public.validate_import_job_tx(uuid,text,text,jsonb),
  public.apply_import_job_tx(uuid,uuid) TO authenticated;
-- The low-level adjustment is callable only from the approval SECURITY DEFINER function.
REVOKE ALL ON FUNCTION public.adjust_supply_tx(uuid,uuid,numeric,text,text) FROM PUBLIC,anon,authenticated;

CREATE TRIGGER audit_row_change_trg AFTER INSERT OR UPDATE OR DELETE ON public.adjustment_approval_requests
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
CREATE TRIGGER audit_row_change_trg AFTER INSERT OR UPDATE OR DELETE ON public.maintenance_assets
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
CREATE TRIGGER audit_row_change_trg AFTER INSERT OR UPDATE OR DELETE ON public.maintenance_plans
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
CREATE TRIGGER audit_row_change_trg AFTER INSERT OR UPDATE OR DELETE ON public.facility_user_access
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

ALTER FUNCTION public.export_organization_data() RENAME TO export_organization_data_inventory_bridge;
REVOKE ALL ON FUNCTION public.export_organization_data_inventory_bridge() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.export_organization_data() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o uuid:=public.get_my_org_id(); base jsonb;
BEGIN
  IF o IS NULL OR NOT public.is_org_admin() THEN RAISE EXCEPTION 'PROFESSIONAL_EXPORT_ADMIN_REQUIRED'; END IF;
  base:=public.export_organization_data_inventory_bridge();
  RETURN base||jsonb_build_object('schema_version','20260808000005',
    'facility_user_access',(SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]') FROM public.facility_user_access t WHERE t.organization_id=o),
    'adjustment_approvals',(SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]') FROM public.adjustment_approval_requests t WHERE t.organization_id=o),
    'maintenance_assets',(SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]') FROM public.maintenance_assets t WHERE t.organization_id=o),
    'maintenance_plans',(SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]') FROM public.maintenance_plans t WHERE t.organization_id=o),
    'maintenance_events',(SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]') FROM public.maintenance_events t WHERE t.organization_id=o),
    'label_print_jobs',(SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]') FROM public.label_print_jobs t WHERE t.organization_id=o),
    'import_jobs',(SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]') FROM public.import_jobs t WHERE t.organization_id=o));
END $$;
REVOKE ALL ON FUNCTION public.export_organization_data() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.export_organization_data() TO authenticated;

COMMIT;
