-- BioTrack: cierre de integracion para sedes, mantenimiento, etiquetas y lotes.

BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_facility_write_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old_location uuid; new_location uuid;
BEGIN
  IF auth.uid() IS NULL OR auth.role()='service_role' OR public.is_org_admin() THEN
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME='boxes' THEN
    IF TG_OP<>'INSERT' THEN old_location:=OLD.location_id; END IF;
    IF TG_OP<>'DELETE' THEN new_location:=NEW.location_id; END IF;
  ELSIF TG_TABLE_NAME='lots' THEN
    IF TG_OP<>'INSERT' THEN
      SELECT location_id INTO old_location FROM public.boxes
      WHERE id=OLD.box_id AND organization_id=OLD.organization_id;
    END IF;
    IF TG_OP<>'DELETE' THEN
      SELECT location_id INTO new_location FROM public.boxes
      WHERE id=NEW.box_id AND organization_id=NEW.organization_id;
    END IF;
  ELSE
    IF TG_OP<>'INSERT' THEN old_location:=OLD.location_id; END IF;
    IF TG_OP<>'DELETE' THEN new_location:=NEW.location_id; END IF;
  END IF;

  IF (TG_OP<>'INSERT' AND NOT public.can_access_location(old_location))
    OR (TG_OP<>'DELETE' AND NOT public.can_access_location(new_location)) THEN
    RAISE EXCEPTION 'La operacion queda fuera de las sedes asignadas.';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.enforce_facility_write_scope() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.validate_maintenance_plan_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE asset_location uuid;
BEGIN
  IF NEW.assigned_user_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.user_roles r
    WHERE r.organization_id=NEW.organization_id AND r.user_id=NEW.assigned_user_id AND r.status='active'
  ) THEN RAISE EXCEPTION 'El responsable no es miembro activo de la organizacion.'; END IF;
  SELECT location_id INTO asset_location FROM public.maintenance_assets
    WHERE organization_id=NEW.organization_id AND id=NEW.asset_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'El activo de mantenimiento no pertenece a la organizacion.'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.validate_maintenance_plan_scope() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER validate_maintenance_plan_scope_trg BEFORE INSERT OR UPDATE ON public.maintenance_plans
  FOR EACH ROW EXECUTE FUNCTION public.validate_maintenance_plan_scope();

DROP POLICY IF EXISTS maintenance_assets_member_select ON public.maintenance_assets;
CREATE POLICY maintenance_assets_member_select ON public.maintenance_assets FOR SELECT USING(
  organization_id=public.get_my_org_id() AND public.is_org_member()
  AND ((location_id IS NULL AND NOT EXISTS(SELECT 1 FROM public.facility_user_access a
    WHERE a.organization_id=public.get_my_org_id() AND a.user_id=auth.uid()))
    OR public.can_access_location(location_id)));
DROP POLICY IF EXISTS maintenance_plans_member_select ON public.maintenance_plans;
CREATE POLICY maintenance_plans_member_select ON public.maintenance_plans FOR SELECT USING(
  organization_id=public.get_my_org_id() AND public.is_org_member() AND EXISTS(
    SELECT 1 FROM public.maintenance_assets a WHERE a.id=maintenance_plans.asset_id
      AND a.organization_id=maintenance_plans.organization_id));
DROP POLICY IF EXISTS maintenance_events_member_select ON public.maintenance_events;
CREATE POLICY maintenance_events_member_select ON public.maintenance_events FOR SELECT USING(
  organization_id=public.get_my_org_id() AND public.is_org_member() AND EXISTS(
    SELECT 1 FROM public.maintenance_assets a WHERE a.id=maintenance_events.asset_id
      AND a.organization_id=maintenance_events.organization_id));

CREATE OR REPLACE FUNCTION public.complete_maintenance_tx(_request_id uuid,_plan_id uuid,_outcome text,
  _notes text DEFAULT NULL,_cost numeric DEFAULT NULL,_evidence_url text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o uuid:=public.get_my_org_id(); cached jsonb; p public.maintenance_plans%ROWTYPE;
  asset_location uuid; eid uuid; result jsonb;
BEGIN
  cached:=public.begin_transaction_request(_request_id,'maintenance:complete');
  IF cached IS NOT NULL THEN RETURN cached; END IF;
  IF o IS NULL OR NOT public.is_org_member() OR _outcome NOT IN ('completed','failed','rescheduled')
    OR COALESCE(_cost,0)<0 OR trim(COALESCE(_notes,''))='' THEN RAISE EXCEPTION 'Resultado de mantenimiento invalido.'; END IF;
  SELECT * INTO p FROM public.maintenance_plans WHERE organization_id=o AND id=_plan_id AND active FOR UPDATE;
  IF NOT FOUND OR (p.assigned_user_id IS NOT NULL AND p.assigned_user_id<>auth.uid() AND NOT public.is_org_admin()) THEN
    RAISE EXCEPTION 'Plan no disponible para este usuario.';
  END IF;
  SELECT location_id INTO asset_location FROM public.maintenance_assets WHERE organization_id=o AND id=p.asset_id;
  IF NOT public.can_access_location(asset_location) THEN RAISE EXCEPTION 'El activo queda fuera de las sedes asignadas.'; END IF;
  INSERT INTO public.maintenance_events(organization_id,plan_id,asset_id,performed_by,outcome,notes,evidence_url,cost,request_id)
    VALUES(o,p.id,p.asset_id,auth.uid(),_outcome,trim(_notes),NULLIF(trim(_evidence_url),''),_cost,_request_id)
    RETURNING id INTO eid;
  UPDATE public.maintenance_plans SET
    next_due_on=CASE WHEN _outcome='completed' THEN current_date+frequency_days ELSE current_date+1 END,
    updated_at=now() WHERE id=p.id;
  result:=jsonb_build_object('success',true,'event_id',eid,'outcome',_outcome,'next_due_on',
    CASE WHEN _outcome='completed' THEN current_date+p.frequency_days ELSE current_date+1 END);
  PERFORM public.finish_transaction_request(_request_id,'maintenance:complete',result);
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.record_label_print_job_tx(_entity_type text,_entity_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o uuid:=public.get_my_org_id(); jid uuid; valid_count int;
BEGIN
  IF o IS NULL OR NOT public.is_org_member() OR _entity_type NOT IN ('box','lot','location','supply_batch')
    OR cardinality(_entity_ids)=0 OR cardinality(_entity_ids)>200 THEN RAISE EXCEPTION 'Trabajo de impresion invalido.'; END IF;
  IF _entity_type='box' THEN
    SELECT count(*) INTO valid_count FROM public.boxes
      WHERE organization_id=o AND id=ANY(_entity_ids) AND public.can_access_location(location_id);
  ELSIF _entity_type='lot' THEN
    SELECT count(*) INTO valid_count FROM public.lots l JOIN public.boxes b
      ON b.organization_id=l.organization_id AND b.id=l.box_id
      WHERE l.organization_id=o AND l.id=ANY(_entity_ids) AND public.can_access_location(b.location_id);
  ELSIF _entity_type='location' THEN
    SELECT count(*) INTO valid_count FROM public.facility_locations
      WHERE organization_id=o AND id=ANY(_entity_ids) AND public.can_access_location(id);
  ELSE
    SELECT count(*) INTO valid_count FROM public.supply_batches WHERE organization_id=o AND id=ANY(_entity_ids);
  END IF;
  IF valid_count<>cardinality(_entity_ids) THEN
    RAISE EXCEPTION 'Una o mas etiquetas no pertenecen al alcance autorizado.';
  END IF;
  INSERT INTO public.label_print_jobs(organization_id,requested_by,entity_type,entity_ids,label_count)
    VALUES(o,auth.uid(),_entity_type,_entity_ids,cardinality(_entity_ids)) RETURNING id INTO jid;
  RETURN jsonb_build_object('success',true,'job_id',jid,'label_count',cardinality(_entity_ids));
END $$;

CREATE OR REPLACE FUNCTION public.finalize_lot_tx(_request_id uuid,_lot_id uuid,_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o uuid:=public.get_my_org_id(); cached jsonb; lot public.lots%ROWTYPE; event_id uuid; result jsonb;
BEGIN
  cached:=public.begin_transaction_request(_request_id,'lot:finalize');
  IF cached IS NOT NULL THEN RETURN cached; END IF;
  IF o IS NULL OR NOT public.is_org_admin() OR trim(COALESCE(_reason,''))='' THEN
    RAISE EXCEPTION 'La finalizacion requiere administrador y motivo.';
  END IF;
  SELECT * INTO lot FROM public.lots WHERE organization_id=o AND id=_lot_id FOR UPDATE;
  IF NOT FOUND OR lot.status<>'active' THEN RAISE EXCEPTION 'El lote no existe o ya fue finalizado.'; END IF;
  IF COALESCE(lot.males,0)+COALESCE(lot.females,0)+COALESCE(lot.unsexed,0)>0 OR COALESCE(lot.mass_grams,0)>0 THEN
    RAISE EXCEPTION 'El lote debe tener poblacion y biomasa en cero antes de finalizarse.';
  END IF;
  UPDATE public.lots SET status='finalizado',finalized_at=now() WHERE id=lot.id;
  INSERT INTO public.lot_events(organization_id,lot_id,actor_user_id,event_type,notes,request_id,event_at,observations)
    VALUES(o,lot.id,auth.uid(),'finalize',trim(_reason),_request_id,now(),trim(_reason)) RETURNING id INTO event_id;
  result:=jsonb_build_object('success',true,'lot_id',lot.id,'event_id',event_id,'status','finalizado');
  PERFORM public.finish_transaction_request(_request_id,'lot:finalize',result);
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.import_genetic_lines_tx(_request_id uuid,_kind public.kind_type,_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o uuid:=public.get_my_org_id(); cached jsonb; row_data jsonb; species_id uuid;
  imported int:=0; seen text[]:=ARRAY[]::text[]; row_key text; result jsonb;
BEGIN
  cached:=public.begin_transaction_request(_request_id,'import:genetic_lines');
  IF cached IS NOT NULL THEN RETURN cached; END IF;
  IF o IS NULL OR NOT public.is_org_admin() OR jsonb_typeof(_rows)<>'array'
    OR jsonb_array_length(_rows)=0 OR jsonb_array_length(_rows)>500 THEN
    RAISE EXCEPTION 'Importacion de lineas invalida o excede 500 filas.';
  END IF;
  FOR row_data IN SELECT * FROM jsonb_array_elements(_rows) LOOP
    IF trim(COALESCE(row_data->>'name',''))='' OR trim(COALESCE(row_data->>'species',''))='' THEN
      RAISE EXCEPTION 'Cada fila requiere nombre y especie.';
    END IF;
    SELECT id INTO species_id FROM public.species
      WHERE organization_id=o AND kind=_kind AND lower(trim(name))=lower(trim(row_data->>'species'));
    IF NOT FOUND THEN RAISE EXCEPTION 'Especie no encontrada para la linea %.',row_data->>'name'; END IF;
    row_key:=species_id::text||':'||lower(trim(row_data->>'name'));
    IF row_key=ANY(seen) OR EXISTS(SELECT 1 FROM public.genetic_lines g
      WHERE g.organization_id=o AND g.species_id=species_id AND lower(trim(g.name))=lower(trim(row_data->>'name'))) THEN
      RAISE EXCEPTION 'Linea genetica duplicada: %.',row_data->>'name';
    END IF;
    seen:=array_append(seen,row_key);
    INSERT INTO public.genetic_lines(organization_id,owner_id,name,species_id,notes)
      VALUES(o,auth.uid(),trim(row_data->>'name'),species_id,jsonb_build_object(
        'date',COALESCE(row_data->>'date',''),'origin',COALESCE(row_data->>'origin',''),
        'notes',COALESCE(row_data->>'notes',''))::text);
    imported:=imported+1;
  END LOOP;
  result:=jsonb_build_object('success',true,'imported',imported);
  PERFORM public.finish_transaction_request(_request_id,'import:genetic_lines',result);
  RETURN result;
END $$;

REVOKE DELETE ON public.lots FROM authenticated,anon;
REVOKE ALL ON FUNCTION public.complete_maintenance_tx(uuid,uuid,text,text,numeric,text),
  public.record_label_print_job_tx(text,uuid[]),public.finalize_lot_tx(uuid,uuid,text),
  public.import_genetic_lines_tx(uuid,public.kind_type,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.complete_maintenance_tx(uuid,uuid,text,text,numeric,text),
  public.record_label_print_job_tx(text,uuid[]),public.finalize_lot_tx(uuid,uuid,text),
  public.import_genetic_lines_tx(uuid,public.kind_type,jsonb) TO authenticated;

COMMIT;
