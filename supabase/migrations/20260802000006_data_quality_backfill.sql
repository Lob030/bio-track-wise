-- BioTrack: saneamiento previo y una sola fuente de verdad para genealogia.

BEGIN;

-- Las tablas del asistente tambien quedan identificadas por bioterio. Antes
-- solo conservaban owner_id, insuficiente para validar relaciones multiusuario.
ALTER TABLE public.ai_conversations
  ADD COLUMN organization_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.ai_messages
  ADD COLUMN organization_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.ai_pending_actions
  ADD COLUMN organization_id uuid REFERENCES public.organizations(id);

UPDATE public.ai_conversations a SET organization_id = p.organization_id
FROM public.profiles p WHERE p.id = a.owner_id;
UPDATE public.ai_messages a SET organization_id = p.organization_id
FROM public.profiles p WHERE p.id = a.owner_id;
UPDATE public.ai_pending_actions a SET organization_id = p.organization_id
FROM public.profiles p WHERE p.id = a.owner_id;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.ai_conversations WHERE organization_id IS NULL)
     OR EXISTS (SELECT 1 FROM public.ai_messages WHERE organization_id IS NULL)
     OR EXISTS (SELECT 1 FROM public.ai_pending_actions WHERE organization_id IS NULL) THEN
    RAISE EXCEPTION 'DATA_QUALITY: existen registros AI cuyo propietario no pertenece a una organizacion.';
  END IF;
END;
$$;

ALTER TABLE public.ai_conversations ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.ai_messages ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.ai_pending_actions ALTER COLUMN organization_id SET NOT NULL;

DO $$
DECLARE _table text;
BEGIN
  FOREACH _table IN ARRAY ARRAY['ai_conversations', 'ai_messages', 'ai_pending_actions'] LOOP
    EXECUTE format('CREATE TRIGGER set_org_and_owner_trg BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_org_and_owner()', _table);
    EXECUTE format('CREATE TRIGGER prevent_org_and_owner_change_trg BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.prevent_org_and_owner_change()', _table);
  END LOOP;
END;
$$;

-- Los espacios no forman parte de nombres ni codigos de negocio.
UPDATE public.species SET name = trim(name);
UPDATE public.genetic_lines SET name = trim(name);
UPDATE public.boxes SET code = trim(code);
UPDATE public.lots SET lot_code = NULLIF(trim(lot_code), '');
UPDATE public.clients SET name = trim(name), phone = trim(phone);
UPDATE public.warehouse_food SET name = trim(name);
UPDATE public.warehouse_cleaning SET name = trim(name);
UPDATE public.warehouse_tools SET name = trim(name);
UPDATE public.warehouse_packaging SET name = trim(name);
UPDATE public.warehouse_purchases SET invoice_id = NULLIF(trim(invoice_id), '');

-- Estados antiguos incompletos se vuelven temporalmente coherentes.
UPDATE public.lots
SET finalized_at = GREATEST(created_at, started_at::timestamptz)
WHERE status = 'finalizado' AND finalized_at IS NULL;

UPDATE public.lots
SET finalized_at = NULL
WHERE status = 'active' AND finalized_at IS NOT NULL;

UPDATE public.ai_pending_actions
SET resolved_at = GREATEST(created_at, now())
WHERE status <> 'pending' AND resolved_at IS NULL;

UPDATE public.ai_pending_actions
SET resolved_at = NULL
WHERE status = 'pending' AND resolved_at IS NOT NULL;

-- children_lot_ids fue una representacion duplicada. Antes de retirarla se
-- rechazan ambiguedades y se recuperan relaciones que solo estaban en el array.
DO $$
DECLARE
  _conflicts TEXT;
BEGIN
  SELECT string_agg(format('%s -> %s', p.id, child_id), ', ' ORDER BY p.id, child_id)
  INTO _conflicts
  FROM public.lots p
  CROSS JOIN LATERAL unnest(COALESCE(p.children_lot_ids, '{}'::uuid[])) child_id
  LEFT JOIN public.lots c ON c.id = child_id
  WHERE child_id = p.id
     OR c.id IS NULL
     OR c.organization_id <> p.organization_id
     OR (c.parent_lot_id IS NOT NULL AND c.parent_lot_id <> p.id);

  IF _conflicts IS NOT NULL THEN
    RAISE EXCEPTION 'DATA_QUALITY: relaciones padre-hijo ambiguas o invalidas: %', _conflicts;
  END IF;

  SELECT string_agg(child_id::text, ', ' ORDER BY child_id)
  INTO _conflicts
  FROM (
    SELECT child_id
    FROM public.lots p
    CROSS JOIN LATERAL unnest(COALESCE(p.children_lot_ids, '{}'::uuid[])) child_id
    GROUP BY child_id
    HAVING count(DISTINCT p.id) > 1
  ) duplicate_parents;

  IF _conflicts IS NOT NULL THEN
    RAISE EXCEPTION 'DATA_QUALITY: hijos asignados a mas de un padre: %', _conflicts;
  END IF;
END;
$$;

UPDATE public.lots child
SET parent_lot_id = parent.id
FROM public.lots parent
CROSS JOIN LATERAL unnest(COALESCE(parent.children_lot_ids, '{}'::uuid[])) child_id
WHERE child.id = child_id
  AND child.parent_lot_id IS NULL;

DROP INDEX IF EXISTS public.idx_lots_children_lot_ids;
ALTER TABLE public.lots DROP COLUMN children_lot_ids;

-- Los datos historicos dudosos requieren correccion explicita. No se inventan
-- especies, lineas, cajas, cantidades ni codigos para hacer pasar la migracion.
DO $$
DECLARE
  _errors TEXT := '';
  _count BIGINT;
BEGIN
  SELECT count(*) INTO _count FROM public.lots WHERE species_id IS NULL;
  IF _count > 0 THEN _errors := _errors || format(E'\n- lots sin species_id: %s', _count); END IF;

  SELECT count(*) INTO _count
  FROM public.lots l
  LEFT JOIN public.species s ON s.id = l.species_id
  WHERE s.id IS NULL OR s.organization_id <> l.organization_id OR s.kind <> l.kind;
  IF _count > 0 THEN _errors := _errors || format(E'\n- lots con especie ajena o incompatible: %s', _count); END IF;

  SELECT count(*) INTO _count
  FROM public.lots l JOIN public.genetic_lines g ON g.id = l.line_id
  WHERE g.organization_id <> l.organization_id OR g.species_id <> l.species_id;
  IF _count > 0 THEN _errors := _errors || format(E'\n- lots con linea genetica incompatible: %s', _count); END IF;

  SELECT count(*) INTO _count
  FROM public.lots l JOIN public.boxes b ON b.id = l.box_id
  WHERE b.organization_id <> l.organization_id OR b.kind <> l.kind;
  IF _count > 0 THEN _errors := _errors || format(E'\n- lots con caja ajena o incompatible: %s', _count); END IF;

  SELECT count(*) INTO _count
  FROM public.lots child JOIN public.lots parent ON parent.id = child.parent_lot_id
  WHERE parent.organization_id <> child.organization_id
     OR parent.kind <> child.kind
     OR parent.species_id <> child.species_id
     OR parent.line_id IS DISTINCT FROM child.line_id;
  IF _count > 0 THEN _errors := _errors || format(E'\n- relaciones padre-hijo incompatibles: %s', _count); END IF;

  SELECT count(*) INTO _count FROM public.lots
  WHERE started_at < DATE '2000-01-01'
     OR started_at > CURRENT_DATE
     OR (finalized_at IS NOT NULL AND finalized_at::date < started_at);
  IF _count > 0 THEN _errors := _errors || format(E'\n- lots con fechas imposibles: %s', _count); END IF;

  SELECT count(*) INTO _count FROM public.lots
  WHERE males < 0 OR females < 0 OR unsexed < 0 OR mass_grams < 0 OR total_deaths < 0;
  IF _count > 0 THEN _errors := _errors || format(E'\n- lots con cantidades negativas: %s', _count); END IF;

  SELECT count(*) INTO _count FROM public.warehouse_food
  WHERE quantity_grams < 0 OR COALESCE(unit_cost, 0) < 0 OR min_stock_grams < 0;
  IF _count > 0 THEN _errors := _errors || format(E'\n- alimento con cantidades o costos negativos: %s', _count); END IF;

  SELECT count(*) INTO _count FROM public.warehouse_cleaning
  WHERE quantity < 0 OR COALESCE(cost, 0) < 0;
  IF _count > 0 THEN _errors := _errors || format(E'\n- limpieza con cantidades o costos negativos: %s', _count); END IF;

  SELECT count(*) INTO _count FROM public.warehouse_tools WHERE value < 0;
  IF _count > 0 THEN _errors := _errors || format(E'\n- herramientas con valor negativo: %s', _count); END IF;

  SELECT count(*) INTO _count FROM public.warehouse_packaging
  WHERE units < 0 OR COALESCE(unit_cost, 0) < 0;
  IF _count > 0 THEN _errors := _errors || format(E'\n- empaques con cantidades o costos negativos: %s', _count); END IF;

  SELECT count(*) INTO _count FROM public.warehouse_purchases
  WHERE COALESCE(population, 0) < 0 OR COALESCE(mass_grams, 0) < 0 OR COALESCE(total_cost, 0) < 0;
  IF _count > 0 THEN _errors := _errors || format(E'\n- compras con cantidades o costos negativos: %s', _count); END IF;

  SELECT count(*) INTO _count FROM public.orders
  WHERE discount_pct NOT BETWEEN 0 AND 100 OR subtotal_mxn < 0 OR total_mxn < 0 OR total_mxn > subtotal_mxn;
  IF _count > 0 THEN _errors := _errors || format(E'\n- ventas con totales o descuentos invalidos: %s', _count); END IF;

  SELECT count(*) INTO _count FROM public.order_items
  WHERE requested_qty <= 0 OR unit_price < 0 OR line_total < 0;
  IF _count > 0 THEN _errors := _errors || format(E'\n- partidas de venta invalidas: %s', _count); END IF;

  SELECT count(*) INTO _count FROM public.order_item_allocations WHERE qty_taken <= 0;
  IF _count > 0 THEN _errors := _errors || format(E'\n- asignaciones FIFO invalidas: %s', _count); END IF;

  SELECT count(*) INTO _count
  FROM (
    SELECT organization_id, kind, lower(name) FROM public.species
    GROUP BY organization_id, kind, lower(name) HAVING count(*) > 1
  ) duplicates;
  IF _count > 0 THEN _errors := _errors || format(E'\n- nombres de especie duplicados: %s', _count); END IF;

  SELECT count(*) INTO _count
  FROM (
    SELECT organization_id, lower(code) FROM public.boxes
    GROUP BY organization_id, lower(code) HAVING count(*) > 1
  ) duplicates;
  IF _count > 0 THEN _errors := _errors || format(E'\n- codigos de caja duplicados: %s', _count); END IF;

  SELECT count(*) INTO _count
  FROM (
    SELECT organization_id, lower(lot_code) FROM public.lots WHERE lot_code IS NOT NULL
    GROUP BY organization_id, lower(lot_code) HAVING count(*) > 1
  ) duplicates;
  IF _count > 0 THEN _errors := _errors || format(E'\n- codigos de lote duplicados: %s', _count); END IF;

  IF _errors <> '' THEN
    RAISE EXCEPTION 'DATA_QUALITY: corrija los datos historicos antes de continuar:%', _errors;
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    WITH RECURSIVE ancestry AS (
      SELECT id AS root_id, id, parent_lot_id, ARRAY[id] AS path, false AS cycle
      FROM public.lots
      WHERE parent_lot_id IS NOT NULL
      UNION ALL
      SELECT a.root_id, parent.id, parent.parent_lot_id,
             a.path || parent.id, parent.id = ANY(a.path)
      FROM ancestry a
      JOIN public.lots parent ON parent.id = a.parent_lot_id
      WHERE NOT a.cycle
    )
    SELECT 1 FROM ancestry WHERE cycle
  ) THEN
    RAISE EXCEPTION 'DATA_QUALITY: la genealogia historica de lotes contiene ciclos.';
  END IF;
END;
$$;

COMMIT;
