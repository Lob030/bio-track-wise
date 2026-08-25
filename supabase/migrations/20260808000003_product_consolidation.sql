-- BioTrack: consolidacion operativa, inventario, protocolos, turnos y pronosticos.

BEGIN;

ALTER TABLE public.organizations
  ADD COLUMN timezone text NOT NULL DEFAULT 'America/Mexico_City';

CREATE OR REPLACE FUNCTION public.validate_organization_timezone()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_catalog AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name=NEW.timezone) THEN
    RAISE EXCEPTION 'Zona horaria no valida: %.',NEW.timezone;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER validate_organization_timezone_trg BEFORE INSERT OR UPDATE OF timezone
  ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.validate_organization_timezone();

-- Un solo protocolo principal activo evita duplicar planeacion y consumo previsto.
WITH ranked AS (
  SELECT id,row_number() OVER (
    PARTITION BY organization_id,lot_id ORDER BY starts_on DESC,created_at DESC,id DESC
  ) position
  FROM public.protocol_assignments WHERE active AND lot_id IS NOT NULL
)
UPDATE public.protocol_assignments p SET active=false,ends_on=COALESCE(ends_on,current_date)
FROM ranked r WHERE p.id=r.id AND r.position>1;

WITH ranked AS (
  SELECT id,row_number() OVER (
    PARTITION BY organization_id,box_id ORDER BY starts_on DESC,created_at DESC,id DESC
  ) position
  FROM public.protocol_assignments WHERE active AND box_id IS NOT NULL
)
UPDATE public.protocol_assignments p SET active=false,ends_on=COALESCE(ends_on,current_date)
FROM ranked r WHERE p.id=r.id AND r.position>1;

DROP INDEX public.protocol_assignments_active_lot_uidx;
DROP INDEX public.protocol_assignments_active_box_uidx;
CREATE UNIQUE INDEX protocol_assignments_one_active_lot_uidx
  ON public.protocol_assignments(organization_id,lot_id) WHERE active AND lot_id IS NOT NULL;
CREATE UNIQUE INDEX protocol_assignments_one_active_box_uidx
  ON public.protocol_assignments(organization_id,box_id) WHERE active AND box_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.validate_protocol_task_definitions()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE _task jsonb; _type text; _frequency int; _hour int;
BEGIN
  IF jsonb_typeof(NEW.task_definitions)<>'array' THEN RAISE EXCEPTION 'Las tareas deben ser un arreglo.'; END IF;
  FOR _task IN SELECT * FROM jsonb_array_elements(NEW.task_definitions) LOOP
    IF jsonb_typeof(_task)<>'object' THEN RAISE EXCEPTION 'Cada tarea del protocolo debe ser un objeto.'; END IF;
    _type:=_task->>'type';
    IF _type IS NULL OR _type NOT IN ('feeding','cleaning','substrate','weighing','inspection','separation','health','inventory','other') THEN
      RAISE EXCEPTION 'Tipo de tarea de protocolo no valido.';
    END IF;
    IF trim(COALESCE(_task->>'title',''))='' THEN RAISE EXCEPTION 'Cada tarea requiere titulo.'; END IF;
    BEGIN
      _frequency:=COALESCE((_task->>'frequency_days')::int,1);
      _hour:=COALESCE((_task->>'hour')::int,8);
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Frecuencia u hora de tarea no valida.';
    END;
    IF _frequency<1 OR _hour NOT BETWEEN 0 AND 23 THEN RAISE EXCEPTION 'Frecuencia u hora fuera de rango.'; END IF;
  END LOOP;
  RETURN NEW;
END $$;
CREATE TRIGGER validate_protocol_task_definitions_trg BEFORE INSERT OR UPDATE OF task_definitions
  ON public.operational_protocols FOR EACH ROW EXECUTE FUNCTION public.validate_protocol_task_definitions();

-- Creacion reproductiva transaccional y biologicamente compatible.
CREATE OR REPLACE FUNCTION public.create_breeding_program_tx(
  _request_id uuid,_code text,_primary_lot_id uuid,_secondary_lot_id uuid DEFAULT NULL,
  _method text DEFAULT 'pair',_planned_start date DEFAULT current_date,
  _expected_birth_date date DEFAULT NULL,_expected_weaning_date date DEFAULT NULL,
  _target_offspring int DEFAULT NULL,_notes text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _org uuid:=public.get_my_org_id(); _cached jsonb; _primary public.lots%ROWTYPE;
  _secondary public.lots%ROWTYPE; _id uuid; _result jsonb;
BEGIN
  _cached:=public.begin_transaction_request(_request_id,'breeding:create'); IF _cached IS NOT NULL THEN RETURN _cached; END IF;
  IF _org IS NULL OR NOT public.is_org_admin() OR trim(COALESCE(_code,''))='' OR
     _method NOT IN ('pair','trio','group','colony') OR _planned_start<current_date-interval '1 year' OR
     COALESCE(_target_offspring,1)<=0 THEN RAISE EXCEPTION 'Programa reproductivo invalido.'; END IF;
  SELECT * INTO _primary FROM public.lots WHERE id=_primary_lot_id AND organization_id=_org FOR UPDATE;
  IF NOT FOUND OR _primary.status<>'active' OR _primary.lot_type<>'breeder' THEN
    RAISE EXCEPTION 'El lote principal debe ser reproductor activo.';
  END IF;
  IF EXISTS(SELECT 1 FROM public.health_cases h WHERE h.lot_id=_primary.id
    AND h.status IN ('open','monitoring','resolved') AND h.reproduction_restricted) THEN
    RAISE EXCEPTION 'El lote principal tiene restriccion sanitaria reproductiva.';
  END IF;
  IF _secondary_lot_id IS NOT NULL THEN
    SELECT * INTO _secondary FROM public.lots WHERE id=_secondary_lot_id AND organization_id=_org FOR UPDATE;
    IF NOT FOUND OR _secondary.status<>'active' OR _secondary.lot_type<>'breeder' OR
       _secondary.kind<>_primary.kind OR _secondary.species_id<>_primary.species_id OR
       _secondary.line_id IS DISTINCT FROM _primary.line_id OR _secondary.id=_primary.id THEN
      RAISE EXCEPTION 'Los reproductores deben ser distintos y compartir tipo, especie y linea.';
    END IF;
    IF EXISTS(SELECT 1 FROM public.health_cases h WHERE h.lot_id=_secondary.id
      AND h.status IN ('open','monitoring','resolved') AND h.reproduction_restricted) THEN
      RAISE EXCEPTION 'El lote secundario tiene restriccion sanitaria reproductiva.';
    END IF;
  ELSIF _primary.kind='rodent' AND _method IN ('pair','trio') THEN
    RAISE EXCEPTION 'El programa de roedores requiere lote secundario.';
  END IF;
  IF _expected_birth_date IS NOT NULL AND _expected_birth_date<_planned_start THEN RAISE EXCEPTION 'Fecha de nacimiento esperada invalida.'; END IF;
  IF _expected_weaning_date IS NOT NULL AND _expected_weaning_date<COALESCE(_expected_birth_date,_planned_start) THEN RAISE EXCEPTION 'Fecha de destete esperada invalida.'; END IF;
  INSERT INTO public.breeding_programs(organization_id,owner_id,code,primary_lot_id,secondary_lot_id,
    method,status,planned_start,expected_birth_date,expected_weaning_date,target_offspring,notes)
  VALUES(_org,auth.uid(),trim(_code),_primary.id,_secondary_lot_id,_method,'planned',_planned_start,
    _expected_birth_date,_expected_weaning_date,_target_offspring,NULLIF(trim(_notes),'')) RETURNING id INTO _id;
  _result:=jsonb_build_object('success',true,'breeding_program_id',_id);
  PERFORM public.finish_transaction_request(_request_id,'breeding:create',_result); RETURN _result;
END $$;

REVOKE INSERT,UPDATE,DELETE ON public.breeding_programs FROM authenticated,anon;
REVOKE ALL ON FUNCTION public.create_breeding_program_tx(uuid,text,uuid,uuid,text,date,date,date,int,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_breeding_program_tx(uuid,text,uuid,uuid,text,date,date,date,int,text) TO authenticated;

-- Trazabilidad tipada para consumos y costos.
ALTER TABLE public.supply_inventory_events
  ADD COLUMN operation_request_id uuid,
  ADD COLUMN lot_id uuid,
  ADD COLUMN box_id uuid,
  ADD COLUMN operational_task_id uuid,
  ADD COLUMN cost_entry_id uuid,
  ADD CONSTRAINT supply_events_lot_fkey FOREIGN KEY(organization_id,lot_id)
    REFERENCES public.lots(organization_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT supply_events_box_fkey FOREIGN KEY(organization_id,box_id)
    REFERENCES public.boxes(organization_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT supply_events_task_fkey FOREIGN KEY(organization_id,operational_task_id)
    REFERENCES public.operational_tasks(organization_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT supply_events_cost_fkey FOREIGN KEY(organization_id,cost_entry_id)
    REFERENCES public.cost_entries(organization_id,id) ON DELETE RESTRICT;
CREATE INDEX supply_events_operation_idx ON public.supply_inventory_events(organization_id,operation_request_id);
CREATE INDEX supply_events_lot_idx ON public.supply_inventory_events(lot_id,event_at DESC) WHERE lot_id IS NOT NULL;

DROP FUNCTION public.consume_supply_tx(uuid,uuid,numeric,text,text,text);
CREATE OR REPLACE FUNCTION public.consume_supply_tx(
  _request_id uuid,_supply_item_id uuid,_quantity numeric,_reference_type text,
  _reference_id text DEFAULT NULL,_notes text DEFAULT NULL,_event_type text DEFAULT 'consumption'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _org uuid:=public.get_my_org_id(); _cached jsonb; _item public.supply_items%ROWTYPE;
  _batch public.supply_batches%ROWTYPE; _remaining numeric; _taken numeric; _cost numeric:=0;
  _lot_id uuid; _box_id uuid; _task_id uuid; _cost_id uuid; _category text;
  _allocations jsonb:='[]'::jsonb; _result jsonb;
BEGIN
  _cached:=public.begin_transaction_request(_request_id,'supply:consume'); IF _cached IS NOT NULL THEN RETURN _cached; END IF;
  IF _org IS NULL OR NOT public.is_org_member() OR _quantity<=0 OR _event_type NOT IN ('consumption','waste') OR
    trim(COALESCE(_reference_type,''))='' THEN RAISE EXCEPTION 'Consumo de insumo invalido.'; END IF;
  SELECT * INTO _item FROM public.supply_items WHERE id=_supply_item_id AND organization_id=_org AND active FOR UPDATE;
  IF NOT FOUND OR _item.current_quantity<_quantity THEN RAISE EXCEPTION 'Insumo no disponible o existencia insuficiente.'; END IF;
  IF _reference_type='lot' THEN
    BEGIN _lot_id:=_reference_id::uuid; EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'Referencia de lote invalida.'; END;
  ELSIF _reference_type='box' THEN
    BEGIN _box_id:=_reference_id::uuid; EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'Referencia de caja invalida.'; END;
    IF (SELECT count(*) FROM public.lots WHERE organization_id=_org AND box_id=_box_id AND status='active')>1 THEN
      RAISE EXCEPTION 'La caja tiene varios lotes activos; seleccione el lote para asignar el costo.';
    END IF;
    SELECT id INTO _lot_id FROM public.lots WHERE organization_id=_org AND box_id=_box_id AND status='active';
  ELSIF _reference_type='operational_task' THEN
    BEGIN _task_id:=_reference_id::uuid; EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'Referencia de tarea invalida.'; END;
    SELECT lot_id,box_id INTO _lot_id,_box_id FROM public.operational_tasks
      WHERE id=_task_id AND organization_id=_org;
  ELSIF _reference_type<>'general' THEN RAISE EXCEPTION 'Tipo de referencia no permitido.';
  END IF;
  IF _lot_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.lots WHERE id=_lot_id AND organization_id=_org) THEN RAISE EXCEPTION 'Lote no disponible.'; END IF;
  IF _box_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.boxes WHERE id=_box_id AND organization_id=_org) THEN RAISE EXCEPTION 'Caja no disponible.'; END IF;
  _remaining:=_quantity;
  FOR _batch IN SELECT * FROM public.supply_batches WHERE organization_id=_org
    AND supply_item_id=_supply_item_id AND quantity_remaining>0
    ORDER BY expiry_date ASC NULLS LAST,received_at,id FOR UPDATE
  LOOP
    EXIT WHEN _remaining<=0; _taken:=LEAST(_remaining,_batch.quantity_remaining);
    UPDATE public.supply_batches SET quantity_remaining=quantity_remaining-_taken WHERE id=_batch.id;
    _cost:=_cost+(_taken*_batch.unit_cost);
    _allocations:=_allocations||jsonb_build_array(jsonb_build_object('batch_id',_batch.id,
      'batch_code',_batch.batch_code,'quantity',_taken,'unit_cost',_batch.unit_cost));
    INSERT INTO public.supply_inventory_events(organization_id,actor_user_id,supply_item_id,batch_id,
      event_type,quantity_delta,balance_before,balance_after,unit_cost,reference_type,reference_id,notes,
      request_id,operation_request_id,lot_id,box_id,operational_task_id)
    VALUES(_org,auth.uid(),_item.id,_batch.id,_event_type,-_taken,
      _item.current_quantity-(_quantity-_remaining),_item.current_quantity-(_quantity-_remaining+_taken),
      _batch.unit_cost,_reference_type,NULLIF(trim(_reference_id),''),NULLIF(trim(_notes),''),gen_random_uuid(),
      _request_id,_lot_id,_box_id,_task_id);
    _remaining:=_remaining-_taken;
  END LOOP;
  IF _remaining>0 THEN RAISE EXCEPTION 'Los lotes de insumo no cubren la existencia solicitada.'; END IF;
  PERFORM set_config('app.operational_management_write','allowed',true);
  UPDATE public.supply_items SET current_quantity=current_quantity-_quantity,updated_at=now() WHERE id=_item.id;
  _category:=CASE _item.category WHEN 'feed' THEN 'feed'
    WHEN 'substrate' THEN 'substrate' WHEN 'medication' THEN 'veterinary'
    WHEN 'cleaning' THEN 'cleaning' WHEN 'packaging' THEN 'packaging'
    WHEN 'equipment' THEN 'depreciation' ELSE 'other' END;
  IF _cost>0 THEN
    INSERT INTO public.cost_entries(organization_id,actor_user_id,category,description,incurred_at,
      quantity,unit,unit_cost,total_amount,reference_type,reference_id,notes,request_id)
    VALUES(_org,auth.uid(),_category,CASE WHEN _event_type='waste' THEN 'Merma: ' ELSE 'Consumo: ' END||_item.name,
      now(),_quantity,_item.unit,_cost/_quantity,_cost,'supply_inventory',_request_id::text,NULLIF(trim(_notes),''),_request_id)
    RETURNING id INTO _cost_id;
    IF _lot_id IS NOT NULL THEN
      PERFORM public.allocate_cost_entry(_cost_id,jsonb_build_array(jsonb_build_object(
        'lot_id',_lot_id,'amount',_cost,'weight',_quantity)),'direct');
    END IF;
    UPDATE public.supply_inventory_events SET cost_entry_id=_cost_id
      WHERE organization_id=_org AND operation_request_id=_request_id;
  END IF;
  _result:=jsonb_build_object('success',true,'quantity',_quantity,'balance',_item.current_quantity-_quantity,
    'total_cost',_cost,'cost_entry_id',_cost_id,'lot_id',_lot_id,'allocations',_allocations);
  PERFORM public.finish_transaction_request(_request_id,'supply:consume',_result); RETURN _result;
END $$;
REVOKE ALL ON FUNCTION public.consume_supply_tx(uuid,uuid,numeric,text,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.consume_supply_tx(uuid,uuid,numeric,text,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.adjust_supply_tx(
  _request_id uuid,_supply_item_id uuid,_quantity_delta numeric,_reason text,_batch_code text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _org uuid:=public.get_my_org_id(); _cached jsonb; _item public.supply_items%ROWTYPE;
  _batch public.supply_batches%ROWTYPE; _remaining numeric; _taken numeric; _batch_id uuid; _result jsonb;
BEGIN
  _cached:=public.begin_transaction_request(_request_id,'supply:adjust'); IF _cached IS NOT NULL THEN RETURN _cached; END IF;
  IF _org IS NULL OR NOT public.is_org_admin() OR _quantity_delta=0 OR trim(COALESCE(_reason,''))='' THEN RAISE EXCEPTION 'Ajuste invalido.'; END IF;
  SELECT * INTO _item FROM public.supply_items WHERE id=_supply_item_id AND organization_id=_org FOR UPDATE;
  IF NOT FOUND OR _item.current_quantity+_quantity_delta<0 THEN RAISE EXCEPTION 'Insumo no disponible o ajuste excede existencia.'; END IF;
  IF _quantity_delta>0 THEN
    INSERT INTO public.supply_batches(organization_id,supply_item_id,batch_code,quantity_received,
      quantity_remaining,unit_cost,document_reference)
    VALUES(_org,_item.id,COALESCE(NULLIF(trim(_batch_code),''),'ADJ-'||left(_request_id::text,8)),
      _quantity_delta,_quantity_delta,_item.average_unit_cost,'inventory_adjustment') RETURNING id INTO _batch_id;
  ELSE
    _remaining:=-_quantity_delta;
    FOR _batch IN SELECT * FROM public.supply_batches WHERE organization_id=_org
      AND supply_item_id=_item.id AND quantity_remaining>0
      ORDER BY expiry_date ASC NULLS LAST,received_at,id FOR UPDATE
    LOOP
      EXIT WHEN _remaining<=0; _taken:=LEAST(_remaining,_batch.quantity_remaining);
      UPDATE public.supply_batches SET quantity_remaining=quantity_remaining-_taken WHERE id=_batch.id;
      _remaining:=_remaining-_taken;
    END LOOP;
    IF _remaining>0 THEN RAISE EXCEPTION 'Los lotes fisicos no cubren el ajuste solicitado.'; END IF;
  END IF;
  PERFORM set_config('app.operational_management_write','allowed',true);
  UPDATE public.supply_items SET current_quantity=current_quantity+_quantity_delta,updated_at=now() WHERE id=_item.id;
  INSERT INTO public.supply_inventory_events(organization_id,actor_user_id,supply_item_id,batch_id,event_type,
    quantity_delta,balance_before,balance_after,unit_cost,reference_type,notes,request_id,operation_request_id)
  VALUES(_org,auth.uid(),_item.id,_batch_id,'adjustment',_quantity_delta,_item.current_quantity,
    _item.current_quantity+_quantity_delta,_item.average_unit_cost,'general',trim(_reason),_request_id,_request_id);
  _result:=jsonb_build_object('success',true,'balance',_item.current_quantity+_quantity_delta);
  PERFORM public.finish_transaction_request(_request_id,'supply:adjust',_result); RETURN _result;
END $$;
REVOKE ALL ON FUNCTION public.adjust_supply_tx(uuid,uuid,numeric,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.adjust_supply_tx(uuid,uuid,numeric,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.receive_supply_tx(
  _request_id uuid,_purchase_order_line_id uuid,_batch_code text,_quantity numeric,
  _expiry_date date DEFAULT NULL,_document_reference text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _org uuid:=public.get_my_org_id(); _cached jsonb; _line public.purchase_order_lines%ROWTYPE;
  _item public.supply_items%ROWTYPE; _existing public.supply_batches%ROWTYPE; _batch uuid;
  _new_avg numeric; _result jsonb;
BEGIN
  _cached:=public.begin_transaction_request(_request_id,'supply:receive'); IF _cached IS NOT NULL THEN RETURN _cached; END IF;
  IF _org IS NULL OR NOT public.is_org_admin() OR _quantity<=0 OR trim(COALESCE(_batch_code,''))='' THEN RAISE EXCEPTION 'Recepcion invalida.'; END IF;
  SELECT * INTO _line FROM public.purchase_order_lines WHERE id=_purchase_order_line_id AND organization_id=_org FOR UPDATE;
  IF NOT FOUND OR _line.quantity_received+_quantity>_line.quantity_ordered THEN RAISE EXCEPTION 'Cantidad excede lo pendiente.'; END IF;
  SELECT * INTO _item FROM public.supply_items WHERE id=_line.supply_item_id AND organization_id=_org FOR UPDATE;
  _new_avg:=((_item.current_quantity*_item.average_unit_cost)+(_quantity*_line.unit_cost))/(_item.current_quantity+_quantity);
  SELECT * INTO _existing FROM public.supply_batches WHERE organization_id=_org
    AND supply_item_id=_item.id AND batch_code=trim(_batch_code) FOR UPDATE;
  IF FOUND THEN
    IF _existing.unit_cost<>_line.unit_cost OR (_expiry_date IS NOT NULL AND _existing.expiry_date IS DISTINCT FROM _expiry_date) THEN
      RAISE EXCEPTION 'El lote existente tiene costo o caducidad diferente.';
    END IF;
    UPDATE public.supply_batches SET quantity_received=quantity_received+_quantity,
      quantity_remaining=quantity_remaining+_quantity,document_reference=COALESCE(NULLIF(trim(_document_reference),''),document_reference)
      WHERE id=_existing.id RETURNING id INTO _batch;
  ELSE
    INSERT INTO public.supply_batches(organization_id,supply_item_id,batch_code,expiry_date,quantity_received,
      quantity_remaining,unit_cost,vendor,document_reference)
    SELECT _org,_item.id,trim(_batch_code),_expiry_date,_quantity,_quantity,_line.unit_cost,o.vendor,NULLIF(trim(_document_reference),'')
    FROM public.purchase_orders o WHERE o.id=_line.purchase_order_id RETURNING id INTO _batch;
  END IF;
  PERFORM set_config('app.operational_management_write','allowed',true);
  UPDATE public.supply_items SET current_quantity=current_quantity+_quantity,average_unit_cost=_new_avg,updated_at=now() WHERE id=_item.id;
  UPDATE public.purchase_order_lines SET quantity_received=quantity_received+_quantity WHERE id=_line.id;
  UPDATE public.purchase_orders o SET status=CASE WHEN EXISTS(
    SELECT 1 FROM public.purchase_order_lines l WHERE l.purchase_order_id=o.id AND l.quantity_received<l.quantity_ordered
  ) THEN 'partial' ELSE 'received' END,received_at=CASE WHEN NOT EXISTS(
    SELECT 1 FROM public.purchase_order_lines l WHERE l.purchase_order_id=o.id AND l.quantity_received<l.quantity_ordered
  ) THEN now() ELSE received_at END,updated_at=now() WHERE o.id=_line.purchase_order_id;
  INSERT INTO public.supply_inventory_events(organization_id,actor_user_id,supply_item_id,batch_id,event_type,
    quantity_delta,balance_before,balance_after,unit_cost,reference_type,reference_id,request_id,operation_request_id)
  VALUES(_org,auth.uid(),_item.id,_batch,'receipt',_quantity,_item.current_quantity,
    _item.current_quantity+_quantity,_line.unit_cost,'purchase_order_line',_line.id::text,_request_id,_request_id);
  _result:=jsonb_build_object('success',true,'batch_id',_batch,'balance',_item.current_quantity+_quantity);
  PERFORM public.finish_transaction_request(_request_id,'supply:receive',_result); RETURN _result;
END $$;

CREATE OR REPLACE FUNCTION public.cancel_supply_purchase_order_tx(
  _request_id uuid,_purchase_order_id uuid,_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _org uuid:=public.get_my_org_id(); _cached jsonb; _result jsonb;
BEGIN
  _cached:=public.begin_transaction_request(_request_id,'supply:cancel_order'); IF _cached IS NOT NULL THEN RETURN _cached; END IF;
  IF _org IS NULL OR NOT public.is_org_admin() OR trim(COALESCE(_reason,''))='' THEN RAISE EXCEPTION 'Cancelacion invalida.'; END IF;
  UPDATE public.purchase_orders SET status='cancelled',notes=concat_ws(E'\n',notes,'Cancelada: '||trim(_reason)),updated_at=now()
    WHERE id=_purchase_order_id AND organization_id=_org AND status IN ('draft','ordered') AND received_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'La orden no puede cancelarse.'; END IF;
  _result:=jsonb_build_object('success',true,'purchase_order_id',_purchase_order_id,'status','cancelled');
  PERFORM public.finish_transaction_request(_request_id,'supply:cancel_order',_result); RETURN _result;
END $$;
REVOKE ALL ON FUNCTION public.cancel_supply_purchase_order_tx(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cancel_supply_purchase_order_tx(uuid,uuid,text) TO authenticated;

-- Turnos y asignacion de trabajo.
CREATE TABLE public.operational_shifts(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,name text NOT NULL,start_time time NOT NULL,
  end_time time NOT NULL,weekdays int[] NOT NULL DEFAULT ARRAY[1,2,3,4,5],active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT operational_shifts_name_not_blank CHECK(trim(name)<>''),
  CONSTRAINT operational_shifts_days_valid CHECK(weekdays<@ARRAY[0,1,2,3,4,5,6] AND cardinality(weekdays)>0),
  CONSTRAINT operational_shifts_org_id_uidx UNIQUE(organization_id,id),
  CONSTRAINT operational_shifts_org_name_uidx UNIQUE(organization_id,name)
);
CREATE TABLE public.operational_shift_members(
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  shift_id uuid NOT NULL,user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(organization_id,shift_id,user_id),
  CONSTRAINT shift_members_shift_fkey FOREIGN KEY(organization_id,shift_id)
    REFERENCES public.operational_shifts(organization_id,id) ON DELETE CASCADE
);
ALTER TABLE public.operational_tasks ADD COLUMN shift_id uuid;
ALTER TABLE public.operational_tasks ADD CONSTRAINT operational_tasks_shift_fkey
  FOREIGN KEY(organization_id,shift_id) REFERENCES public.operational_shifts(organization_id,id) ON DELETE SET NULL;
ALTER TABLE public.operational_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_shift_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY operational_shifts_member_select ON public.operational_shifts FOR SELECT
  USING(organization_id=public.get_my_org_id() AND public.is_org_member());
CREATE POLICY operational_shifts_admin_all ON public.operational_shifts FOR ALL
  USING(organization_id=public.get_my_org_id() AND public.is_org_admin())
  WITH CHECK(organization_id=public.get_my_org_id() AND public.is_org_admin());
CREATE POLICY shift_members_member_select ON public.operational_shift_members FOR SELECT
  USING(organization_id=public.get_my_org_id() AND public.is_org_member());
CREATE POLICY shift_members_admin_all ON public.operational_shift_members FOR ALL
  USING(organization_id=public.get_my_org_id() AND public.is_org_admin())
  WITH CHECK(organization_id=public.get_my_org_id() AND public.is_org_admin());
CREATE TRIGGER set_org_and_owner_trg BEFORE INSERT ON public.operational_shifts
  FOR EACH ROW EXECUTE FUNCTION public.set_org_and_owner();
CREATE TRIGGER prevent_org_and_owner_change_trg BEFORE UPDATE ON public.operational_shifts
  FOR EACH ROW EXECUTE FUNCTION public.prevent_org_and_owner_change();
GRANT SELECT ON public.operational_shifts,public.operational_shift_members TO authenticated;
GRANT INSERT,UPDATE,DELETE ON public.operational_shifts,public.operational_shift_members TO authenticated;

CREATE OR REPLACE FUNCTION public.assign_operational_task_tx(
  _task_id uuid,_user_id uuid DEFAULT NULL,_shift_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _org uuid:=public.get_my_org_id();
BEGIN
  IF _org IS NULL OR NOT public.is_org_admin() OR num_nonnulls(_user_id,_shift_id)>1 THEN RAISE EXCEPTION 'Asignacion invalida.'; END IF;
  IF _user_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.user_roles WHERE organization_id=_org AND user_id=_user_id AND status='active') THEN RAISE EXCEPTION 'Usuario no activo.'; END IF;
  IF _shift_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.operational_shifts WHERE organization_id=_org AND id=_shift_id AND active) THEN RAISE EXCEPTION 'Turno no activo.'; END IF;
  PERFORM set_config('app.operational_management_write','allowed',true);
  UPDATE public.operational_tasks SET assigned_user_id=_user_id,shift_id=_shift_id,updated_at=now()
    WHERE id=_task_id AND organization_id=_org AND status IN ('pending','in_progress');
  IF NOT FOUND THEN RAISE EXCEPTION 'Tarea no disponible.'; END IF;
  RETURN jsonb_build_object('success',true,'task_id',_task_id,'assigned_user_id',_user_id,'shift_id',_shift_id);
END $$;
REVOKE ALL ON FUNCTION public.assign_operational_task_tx(uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.assign_operational_task_tx(uuid,uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_operational_shift_tx(
  _name text,_start_time time,_end_time time,_weekdays int[]
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _org uuid:=public.get_my_org_id(); _id uuid;
BEGIN
  IF _org IS NULL OR NOT public.is_org_admin() OR trim(COALESCE(_name,''))='' THEN RAISE EXCEPTION 'Turno invalido.'; END IF;
  INSERT INTO public.operational_shifts(organization_id,owner_id,name,start_time,end_time,weekdays)
  VALUES(_org,auth.uid(),trim(_name),_start_time,_end_time,_weekdays) RETURNING id INTO _id;
  RETURN jsonb_build_object('success',true,'shift_id',_id);
END $$;

CREATE OR REPLACE FUNCTION public.assign_shift_member_tx(_shift_id uuid,_user_id uuid,_assigned boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _org uuid:=public.get_my_org_id();
BEGIN
  IF _org IS NULL OR NOT public.is_org_admin() OR NOT EXISTS(
    SELECT 1 FROM public.operational_shifts WHERE id=_shift_id AND organization_id=_org AND active
  ) OR NOT EXISTS(
    SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND organization_id=_org AND status='active'
  ) THEN RAISE EXCEPTION 'Turno o usuario no disponible.'; END IF;
  IF _assigned THEN
    INSERT INTO public.operational_shift_members(organization_id,shift_id,user_id)
    VALUES(_org,_shift_id,_user_id) ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.operational_shift_members WHERE organization_id=_org AND shift_id=_shift_id AND user_id=_user_id;
  END IF;
  RETURN jsonb_build_object('success',true,'assigned',_assigned);
END $$;

CREATE OR REPLACE FUNCTION public.set_organization_timezone_tx(_timezone text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _org uuid:=public.get_my_org_id();
BEGIN
  IF _org IS NULL OR NOT public.is_org_admin() THEN RAISE EXCEPTION 'Solo administradores pueden cambiar la zona horaria.'; END IF;
  UPDATE public.organizations SET timezone=_timezone WHERE id=_org;
  RETURN jsonb_build_object('success',true,'timezone',_timezone);
END $$;
REVOKE INSERT,UPDATE,DELETE ON public.operational_shifts,public.operational_shift_members FROM authenticated,anon;
REVOKE ALL ON FUNCTION public.create_operational_shift_tx(text,time,time,int[]) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.assign_shift_member_tx(uuid,uuid,boolean) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.set_organization_timezone_tx(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_operational_shift_tx(text,time,time,int[]),
  public.assign_shift_member_tx(uuid,uuid,boolean),public.set_organization_timezone_tx(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_operational_tasks_for_org(_org uuid,_for_date date)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _assignment record; _definition jsonb; _count int:=0; _task_type text; _frequency int;
  _due timestamptz; _timezone text; _owner uuid; _shift_id uuid;
BEGIN
  IF auth.role()<>'service_role' AND (_org IS DISTINCT FROM public.get_my_org_id() OR NOT public.is_org_admin()) THEN
    RAISE EXCEPTION 'No autorizado para generar jornada.';
  END IF;
  SELECT timezone,created_by INTO _timezone,_owner FROM public.organizations WHERE id=_org;
  IF NOT FOUND THEN RAISE EXCEPTION 'Organizacion no disponible.'; END IF;
  PERFORM set_config('app.operational_management_write','allowed',true);
  FOR _assignment IN
    SELECT a.*,p.task_definitions,p.cleaning_frequency_days,p.feeding_frequency_days,
      p.weighing_frequency_days,p.name protocol_name,b.location_id
    FROM public.protocol_assignments a
    JOIN public.operational_protocols p ON p.id=a.protocol_id AND p.organization_id=a.organization_id
    LEFT JOIN public.boxes b ON b.id=COALESCE(a.box_id,(SELECT l.box_id FROM public.lots l WHERE l.id=a.lot_id))
    WHERE a.organization_id=_org AND a.active AND p.active AND a.starts_on<=_for_date
      AND (a.ends_on IS NULL OR a.ends_on>=_for_date)
  LOOP
    FOR _definition IN SELECT * FROM jsonb_array_elements(CASE
      WHEN jsonb_array_length(_assignment.task_definitions)>0 THEN _assignment.task_definitions
      ELSE jsonb_build_array(jsonb_build_object('type','inspection','title','Revision diaria','frequency_days',1,'hour',8)) END)
    LOOP
      _task_type:=_definition->>'type';
      _frequency:=GREATEST(COALESCE((_definition->>'frequency_days')::int,
        CASE _task_type WHEN 'feeding' THEN _assignment.feeding_frequency_days
          WHEN 'cleaning' THEN _assignment.cleaning_frequency_days
          WHEN 'weighing' THEN _assignment.weighing_frequency_days ELSE 1 END,1),1);
      IF ((_for_date-_assignment.starts_on)%_frequency)=0 THEN
        _due:=(_for_date::timestamp+make_interval(hours=>COALESCE((_definition->>'hour')::int,8))) AT TIME ZONE _timezone;
        SELECT id INTO _shift_id FROM public.operational_shifts s WHERE s.organization_id=_org AND s.active
          AND extract(dow FROM _for_date)::int=ANY(s.weekdays)
          AND (CASE WHEN s.start_time<=s.end_time THEN (_due AT TIME ZONE _timezone)::time BETWEEN s.start_time AND s.end_time
            ELSE (_due AT TIME ZONE _timezone)::time>=s.start_time OR (_due AT TIME ZONE _timezone)::time<=s.end_time END)
          ORDER BY s.start_time LIMIT 1;
        INSERT INTO public.operational_tasks(organization_id,owner_id,protocol_id,assignment_id,task_type,
          title,instructions,lot_id,box_id,location_id,due_at,priority,shift_id)
        VALUES(_org,COALESCE(auth.uid(),_owner),_assignment.protocol_id,_assignment.id,_task_type,
          COALESCE(NULLIF(trim(_definition->>'title'),''),initcap(_task_type)),
          COALESCE(_definition->>'instructions','Protocolo '||_assignment.protocol_name),
          _assignment.lot_id,_assignment.box_id,_assignment.location_id,_due,
          COALESCE(_definition->>'priority','normal'),_shift_id) ON CONFLICT DO NOTHING;
        IF FOUND THEN _count:=_count+1; END IF;
      END IF;
    END LOOP;
  END LOOP;
  RETURN _count;
END $$;

CREATE OR REPLACE FUNCTION public.generate_operational_tasks(_for_date date DEFAULT current_date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _org uuid:=public.get_my_org_id(); _count int;
BEGIN
  IF _org IS NULL OR NOT public.is_org_admin() THEN RAISE EXCEPTION 'Solo administradores pueden generar jornadas.'; END IF;
  _count:=public.generate_operational_tasks_for_org(_org,_for_date);
  RETURN jsonb_build_object('success',true,'date',_for_date,'created',_count);
END $$;

CREATE OR REPLACE FUNCTION public.generate_all_operational_tasks(_for_date date DEFAULT current_date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _org record; _created int:=0; _organizations int:=0;
BEGIN
  IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'Solo el servicio programado puede generar todas las jornadas.'; END IF;
  FOR _org IN SELECT id FROM public.organizations LOOP
    _created:=_created+public.generate_operational_tasks_for_org(_org.id,_for_date);
    _organizations:=_organizations+1;
  END LOOP;
  RETURN jsonb_build_object('success',true,'organizations',_organizations,'created',_created,'date',_for_date);
END $$;
REVOKE ALL ON FUNCTION public.generate_operational_tasks_for_org(uuid,date) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.generate_all_operational_tasks(date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.generate_all_operational_tasks(date) TO service_role;

-- Inventario federado: una sola lectura sin borrar historiales especializados.
CREATE OR REPLACE VIEW public.unified_inventory WITH(security_invoker=true) AS
SELECT organization_id,'supply'::text source,id source_id,sku code,name,category,unit,current_quantity quantity,
  minimum_quantity,average_unit_cost unit_cost,active,updated_at
FROM public.supply_items
UNION ALL
SELECT organization_id,'legacy_feed',id,'FOOD-'||left(id::text,8),name,'feed','g',quantity_grams,0,
  COALESCE(unit_cost,0)/1000,true,created_at FROM public.warehouse_food
UNION ALL
SELECT organization_id,'substrate',id,code,name,'substrate','g',stock_grams,minimum_stock_grams,
  average_cost_per_kg/1000,active,updated_at FROM public.substrates;
GRANT SELECT ON public.unified_inventory TO authenticated;

CREATE OR REPLACE VIEW public.supply_forecast WITH(security_invoker=true) AS
WITH consumption AS (
  SELECT organization_id,supply_item_id,COALESCE(sum(-quantity_delta),0)/30 daily_use
  FROM public.supply_inventory_events
  WHERE event_type IN ('consumption','waste') AND event_at>=now()-interval '30 days'
  GROUP BY organization_id,supply_item_id
)
SELECT s.organization_id,s.id supply_item_id,s.sku,s.name,s.unit,s.current_quantity,s.minimum_quantity,
  COALESCE(c.daily_use,0) average_daily_use,
  CASE WHEN COALESCE(c.daily_use,0)>0 THEN round(s.current_quantity/c.daily_use,1) END coverage_days,
  CASE WHEN COALESCE(c.daily_use,0)>0 THEN greatest(0,round(c.daily_use*(s.lead_time_days+14)-s.current_quantity,4)) ELSE 0 END suggested_order_quantity,
  CASE WHEN s.current_quantity<=s.minimum_quantity THEN 'reorder'
    WHEN COALESCE(c.daily_use,0)>0 AND s.current_quantity/c.daily_use<=s.lead_time_days THEN 'at_risk' ELSE 'ok' END status
FROM public.supply_items s LEFT JOIN consumption c ON c.organization_id=s.organization_id AND c.supply_item_id=s.id
WHERE s.active;
GRANT SELECT ON public.supply_forecast TO authenticated;

CREATE TRIGGER audit_row_change_trg AFTER INSERT OR UPDATE OR DELETE ON public.operational_shifts
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

-- Exportacion de las nuevas configuraciones.
ALTER FUNCTION public.export_organization_data() RENAME TO export_organization_data_operational_v1;
REVOKE ALL ON FUNCTION public.export_organization_data_operational_v1() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.export_organization_data() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _org uuid:=public.get_my_org_id(); _base jsonb;
BEGIN
  IF _org IS NULL OR NOT public.is_org_admin() THEN RAISE EXCEPTION 'CONSOLIDATED_EXPORT_ADMIN_REQUIRED'; END IF;
  _base:=public.export_organization_data_operational_v1();
  RETURN _base||jsonb_build_object('schema_version','20260808000003',
    'operational_shifts',(SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]') FROM public.operational_shifts t WHERE t.organization_id=_org),
    'operational_shift_members',(SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]') FROM public.operational_shift_members t WHERE t.organization_id=_org));
END $$;
REVOKE ALL ON FUNCTION public.export_organization_data() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.export_organization_data() TO authenticated;

COMMIT;
