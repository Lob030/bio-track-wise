-- BioTrack: puente transaccional para una sola lectura de inventario sin perder modulos historicos.

BEGIN;

CREATE TABLE public.inventory_source_links(
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  source text NOT NULL CHECK(source IN ('warehouse_food','substrate')),
  source_id uuid NOT NULL,
  supply_item_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(organization_id,source,source_id),
  UNIQUE(organization_id,supply_item_id),
  CONSTRAINT inventory_source_supply_fkey FOREIGN KEY(organization_id,supply_item_id)
    REFERENCES public.supply_items(organization_id,id) ON DELETE RESTRICT
);
ALTER TABLE public.inventory_source_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY inventory_source_links_member_select ON public.inventory_source_links FOR SELECT
  USING(organization_id=public.get_my_org_id() AND public.is_org_member());
GRANT SELECT ON public.inventory_source_links TO authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.inventory_source_links FROM authenticated,anon;

-- El backfill corre sin JWT; se conservan explicitamente organizacion y propietario historicos.
ALTER TABLE public.supply_items DISABLE TRIGGER set_org_and_owner_trg;

INSERT INTO public.supply_items(organization_id,owner_id,sku,name,category,unit,current_quantity,
  minimum_quantity,average_unit_cost,preferred_vendor,active,created_at,updated_at)
SELECT w.organization_id,w.owner_id,'LEGACY-FOOD-'||left(w.id::text,12),w.name,'feed','g',
  w.quantity_grams,COALESCE(w.min_stock_grams,0),COALESCE(w.unit_cost,0)/1000,NULL,true,w.created_at,w.created_at
FROM public.warehouse_food w
WHERE NOT EXISTS(SELECT 1 FROM public.inventory_source_links l
  WHERE l.organization_id=w.organization_id AND l.source='warehouse_food' AND l.source_id=w.id);

INSERT INTO public.inventory_source_links(organization_id,source,source_id,supply_item_id)
SELECT w.organization_id,'warehouse_food',w.id,s.id FROM public.warehouse_food w
JOIN public.supply_items s ON s.organization_id=w.organization_id
  AND s.sku='LEGACY-FOOD-'||left(w.id::text,12)
ON CONFLICT DO NOTHING;

INSERT INTO public.supply_items(organization_id,owner_id,sku,name,category,unit,current_quantity,
  minimum_quantity,average_unit_cost,preferred_vendor,active,created_at,updated_at)
SELECT s.organization_id,s.owner_id,'LEGACY-SUB-'||left(s.id::text,12),s.name,'substrate','g',
  s.stock_grams,s.minimum_stock_grams,s.average_cost_per_kg/1000,s.supplier,s.active,s.created_at,s.updated_at
FROM public.substrates s
WHERE NOT EXISTS(SELECT 1 FROM public.inventory_source_links l
  WHERE l.organization_id=s.organization_id AND l.source='substrate' AND l.source_id=s.id);

INSERT INTO public.inventory_source_links(organization_id,source,source_id,supply_item_id)
SELECT x.organization_id,'substrate',x.id,s.id FROM public.substrates x
JOIN public.supply_items s ON s.organization_id=x.organization_id
  AND s.sku='LEGACY-SUB-'||left(x.id::text,12)
ON CONFLICT DO NOTHING;

ALTER TABLE public.supply_items ENABLE TRIGGER set_org_and_owner_trg;

CREATE OR REPLACE FUNCTION public.sync_warehouse_food_to_supply()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _item_id uuid;
BEGIN
  IF current_setting('app.inventory_source_sync',true)='supply_to_source' THEN RETURN NEW; END IF;
  SELECT supply_item_id INTO _item_id FROM public.inventory_source_links
    WHERE organization_id=NEW.organization_id AND source='warehouse_food' AND source_id=NEW.id;
  IF _item_id IS NULL THEN
    INSERT INTO public.supply_items(organization_id,owner_id,sku,name,category,unit,current_quantity,
      minimum_quantity,average_unit_cost,active)
    VALUES(NEW.organization_id,NEW.owner_id,'LEGACY-FOOD-'||left(NEW.id::text,12),NEW.name,'feed','g',
      NEW.quantity_grams,COALESCE(NEW.min_stock_grams,0),COALESCE(NEW.unit_cost,0)/1000,true)
    RETURNING id INTO _item_id;
    INSERT INTO public.inventory_source_links(organization_id,source,source_id,supply_item_id)
      VALUES(NEW.organization_id,'warehouse_food',NEW.id,_item_id);
  ELSE
    PERFORM set_config('app.inventory_source_sync','source_to_supply',true);
    PERFORM set_config('app.operational_management_write','allowed',true);
    UPDATE public.supply_items SET name=NEW.name,current_quantity=NEW.quantity_grams,
      minimum_quantity=COALESCE(NEW.min_stock_grams,0),average_unit_cost=COALESCE(NEW.unit_cost,0)/1000,
      updated_at=now() WHERE id=_item_id AND organization_id=NEW.organization_id;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.sync_substrate_to_supply()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _item_id uuid;
BEGIN
  IF current_setting('app.inventory_source_sync',true)='supply_to_source' THEN RETURN NEW; END IF;
  SELECT supply_item_id INTO _item_id FROM public.inventory_source_links
    WHERE organization_id=NEW.organization_id AND source='substrate' AND source_id=NEW.id;
  IF _item_id IS NULL THEN
    INSERT INTO public.supply_items(organization_id,owner_id,sku,name,category,unit,current_quantity,
      minimum_quantity,average_unit_cost,preferred_vendor,active)
    VALUES(NEW.organization_id,NEW.owner_id,'LEGACY-SUB-'||left(NEW.id::text,12),NEW.name,'substrate','g',
      NEW.stock_grams,NEW.minimum_stock_grams,NEW.average_cost_per_kg/1000,NEW.supplier,NEW.active)
    RETURNING id INTO _item_id;
    INSERT INTO public.inventory_source_links(organization_id,source,source_id,supply_item_id)
      VALUES(NEW.organization_id,'substrate',NEW.id,_item_id);
  ELSE
    PERFORM set_config('app.inventory_source_sync','source_to_supply',true);
    PERFORM set_config('app.operational_management_write','allowed',true);
    UPDATE public.supply_items SET name=NEW.name,current_quantity=NEW.stock_grams,
      minimum_quantity=NEW.minimum_stock_grams,average_unit_cost=NEW.average_cost_per_kg/1000,
      preferred_vendor=NEW.supplier,active=NEW.active,updated_at=now()
      WHERE id=_item_id AND organization_id=NEW.organization_id;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER sync_warehouse_food_to_supply_trg AFTER INSERT OR UPDATE OF name,quantity_grams,
  min_stock_grams,unit_cost ON public.warehouse_food FOR EACH ROW EXECUTE FUNCTION public.sync_warehouse_food_to_supply();
CREATE TRIGGER sync_substrate_to_supply_trg AFTER INSERT OR UPDATE OF name,stock_grams,
  minimum_stock_grams,average_cost_per_kg,supplier,active ON public.substrates
  FOR EACH ROW EXECUTE FUNCTION public.sync_substrate_to_supply();

CREATE OR REPLACE FUNCTION public.protect_linked_supply_item()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF current_setting('app.inventory_source_sync',true)='source_to_supply' THEN
    IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
  END IF;
  IF EXISTS(SELECT 1 FROM public.inventory_source_links l WHERE l.organization_id=OLD.organization_id
    AND l.supply_item_id=OLD.id) THEN
    RAISE EXCEPTION 'Este insumo se administra desde su modulo historico de alimento o sustrato.';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER protect_linked_supply_item_trg BEFORE UPDATE OR DELETE ON public.supply_items
  FOR EACH ROW EXECUTE FUNCTION public.protect_linked_supply_item();

CREATE OR REPLACE VIEW public.unified_inventory WITH(security_invoker=true) AS
SELECT s.organization_id,COALESCE(CASE l.source WHEN 'warehouse_food' THEN 'legacy_feed'
    WHEN 'substrate' THEN 'substrate' END,'supply') source,
  s.id source_id,s.sku code,s.name,s.category,s.unit,s.current_quantity quantity,
  s.minimum_quantity,s.average_unit_cost unit_cost,s.active,s.updated_at
FROM public.supply_items s LEFT JOIN public.inventory_source_links l
  ON l.organization_id=s.organization_id AND l.supply_item_id=s.id;

CREATE OR REPLACE VIEW public.supply_forecast WITH(security_invoker=true) AS
WITH all_use AS (
  SELECT organization_id,supply_item_id,-quantity_delta quantity,event_at
  FROM public.supply_inventory_events WHERE event_type IN ('consumption','waste')
  UNION ALL
  SELECT e.organization_id,l.supply_item_id,-e.grams_delta,e.event_at
  FROM public.feed_inventory_events e JOIN public.inventory_source_links l
    ON l.organization_id=e.organization_id AND l.source='warehouse_food' AND l.source_id=e.food_id
  WHERE e.event_type IN ('consumption','waste')
  UNION ALL
  SELECT e.organization_id,l.supply_item_id,-e.grams_delta,e.event_at
  FROM public.substrate_inventory_events e JOIN public.inventory_source_links l
    ON l.organization_id=e.organization_id AND l.source='substrate' AND l.source_id=e.substrate_id
  WHERE e.event_type IN ('setup','replacement','waste')
), consumption AS (
  SELECT organization_id,supply_item_id,COALESCE(sum(quantity),0)/30 daily_use
  FROM all_use WHERE event_at>=now()-interval '30 days' GROUP BY organization_id,supply_item_id
)
SELECT s.organization_id,s.id supply_item_id,s.sku,s.name,s.unit,s.current_quantity,s.minimum_quantity,
  COALESCE(c.daily_use,0) average_daily_use,
  CASE WHEN COALESCE(c.daily_use,0)>0 THEN round(s.current_quantity/c.daily_use,1) END coverage_days,
  CASE WHEN COALESCE(c.daily_use,0)>0 THEN greatest(0,round(c.daily_use*(s.lead_time_days+14)-s.current_quantity,4)) ELSE 0 END suggested_order_quantity,
  CASE WHEN s.current_quantity<=s.minimum_quantity THEN 'reorder'
    WHEN COALESCE(c.daily_use,0)>0 AND s.current_quantity/c.daily_use<=s.lead_time_days THEN 'at_risk' ELSE 'ok' END status
FROM public.supply_items s LEFT JOIN consumption c ON c.organization_id=s.organization_id AND c.supply_item_id=s.id
WHERE s.active;

ALTER FUNCTION public.export_organization_data() RENAME TO export_organization_data_product_v1;
REVOKE ALL ON FUNCTION public.export_organization_data_product_v1() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.export_organization_data() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _org uuid:=public.get_my_org_id(); _base jsonb;
BEGIN
  IF _org IS NULL OR NOT public.is_org_admin() THEN RAISE EXCEPTION 'CONSOLIDATED_EXPORT_ADMIN_REQUIRED'; END IF;
  _base:=public.export_organization_data_product_v1();
  RETURN _base||jsonb_build_object('schema_version','20260808000004',
    'inventory_source_links',(SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]')
      FROM public.inventory_source_links t WHERE t.organization_id=_org));
END $$;
REVOKE ALL ON FUNCTION public.export_organization_data() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.export_organization_data() TO authenticated;

COMMIT;
