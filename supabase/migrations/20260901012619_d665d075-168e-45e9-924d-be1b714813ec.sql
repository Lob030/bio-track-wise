-- 20260720000002_backfill.sql
-- Fase 2: Limpieza de datos, CTE Backfill, verificación de huérfanos y aplicación de NOT NULL

-- 1. Limpieza de datos inválidos en lots y species antes de aplicar CHECK constraints
DO $$
BEGIN
  UPDATE public.lots SET males        = GREATEST(0, COALESCE(males,0))        WHERE COALESCE(males,0) < 0;
  UPDATE public.lots SET females      = GREATEST(0, COALESCE(females,0))      WHERE COALESCE(females,0) < 0;
  UPDATE public.lots SET unsexed      = GREATEST(0, COALESCE(unsexed,0))      WHERE COALESCE(unsexed,0) < 0;
  UPDATE public.lots SET mass_grams   = GREATEST(0, COALESCE(mass_grams,0))   WHERE COALESCE(mass_grams,0) < 0;
  UPDATE public.lots SET total_deaths = GREATEST(0, COALESCE(total_deaths,0)) WHERE COALESCE(total_deaths,0) < 0;
  UPDATE public.species SET unit_price_mxn = GREATEST(0, COALESCE(unit_price_mxn,0)) WHERE COALESCE(unit_price_mxn,0) < 0;
  UPDATE public.warehouse_food SET quantity_grams = GREATEST(0, quantity_grams) WHERE quantity_grams < 0;
END $$;

-- 2. Verificar que no haya operadores sueltos sin organización asignable
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'user' AND organization_id IS NULL) THEN
    RAISE EXCEPTION 'MIGRATION_ABORT: Found existing operator(s) without organization_id.';
  END IF;
END $$;

-- 3. Crear una organización por cada perfil registrado
INSERT INTO public.organizations (name, created_by, tier)
SELECT 'Mi Bioterio', p.id, COALESCE(p.tier, 'bronze')
FROM public.profiles p
WHERE NOT EXISTS (SELECT 1 FROM public.organizations o WHERE o.created_by = p.id);

-- 4. Vincular profiles a su organización correspondiente
UPDATE public.profiles p
SET organization_id = o.id
FROM public.organizations o
WHERE o.created_by = p.id AND p.organization_id IS NULL;

-- 5. Crear o actualizar rol admin en user_roles para cada creador de organización
INSERT INTO public.user_roles (user_id, role, organization_id, status)
SELECT p.id, 'admin', p.organization_id, 'active'
FROM public.profiles p
WHERE p.organization_id IS NOT NULL
ON CONFLICT (user_id) DO UPDATE SET
  organization_id = EXCLUDED.organization_id,
  role = 'admin',
  status = 'active';

-- 6. Poblar organization_id en las 15 tablas operativas/comerciales/alertas desde owner_id
UPDATE public.species s               SET organization_id = p.organization_id FROM public.profiles p WHERE p.id = s.owner_id AND s.organization_id IS NULL;
UPDATE public.genetic_lines g          SET organization_id = p.organization_id FROM public.profiles p WHERE p.id = g.owner_id AND g.organization_id IS NULL;
UPDATE public.boxes b                  SET organization_id = p.organization_id FROM public.profiles p WHERE p.id = b.owner_id AND b.organization_id IS NULL;
UPDATE public.lots l                   SET organization_id = p.organization_id FROM public.profiles p WHERE p.id = l.owner_id AND l.organization_id IS NULL;
UPDATE public.warehouse_food wf        SET organization_id = p.organization_id FROM public.profiles p WHERE p.id = wf.owner_id AND wf.organization_id IS NULL;
UPDATE public.warehouse_cleaning wc    SET organization_id = p.organization_id FROM public.profiles p WHERE p.id = wc.owner_id AND wc.organization_id IS NULL;
UPDATE public.warehouse_tools wt       SET organization_id = p.organization_id FROM public.profiles p WHERE p.id = wt.owner_id AND wt.organization_id IS NULL;
UPDATE public.warehouse_packaging wp   SET organization_id = p.organization_id FROM public.profiles p WHERE p.id = wp.owner_id AND wp.organization_id IS NULL;
UPDATE public.warehouse_purchases wpu  SET organization_id = p.organization_id FROM public.profiles p WHERE p.id = wpu.owner_id AND wpu.organization_id IS NULL;
UPDATE public.clients c                SET organization_id = p.organization_id FROM public.profiles p WHERE p.id = c.owner_id AND c.organization_id IS NULL;
UPDATE public.orders o                 SET organization_id = p.organization_id FROM public.profiles p WHERE p.id = o.owner_id AND o.organization_id IS NULL;
UPDATE public.order_items oi           SET organization_id = p.organization_id FROM public.profiles p WHERE p.id = oi.owner_id AND oi.organization_id IS NULL;
UPDATE public.order_item_allocations a SET organization_id = p.organization_id FROM public.profiles p WHERE p.id = a.owner_id AND a.organization_id IS NULL;
UPDATE public.alert_rules ar           SET organization_id = p.organization_id FROM public.profiles p WHERE p.id = ar.owner_id AND ar.organization_id IS NULL;
UPDATE public.alerts al                SET organization_id = p.organization_id FROM public.profiles p WHERE p.id = al.owner_id AND al.organization_id IS NULL;

-- 7. Detectar huérfanos antes de NOT NULL
DO $$
DECLARE
  _tbl TEXT; _n INT; _err TEXT := '';
BEGIN
  FOREACH _tbl IN ARRAY ARRAY[
    'species','genetic_lines','boxes','lots',
    'warehouse_food','warehouse_cleaning','warehouse_tools',
    'warehouse_packaging','warehouse_purchases',
    'clients','orders','order_items','order_item_allocations',
    'alert_rules','alerts','user_roles'
  ] LOOP
    EXECUTE format('SELECT COUNT(*) FROM public.%I WHERE organization_id IS NULL', _tbl) INTO _n;
    IF _n > 0 THEN _err := _err || format(E'\n  %s: %s orphan(s)', _tbl, _n); END IF;
  END LOOP;
  IF _err <> '' THEN
    RAISE EXCEPTION 'MIGRATION_ABORT: Orphan records found:%', _err;
  END IF;
END $$;

-- 8. Aplicar NOT NULL en las 15 tablas operativas + user_roles (profiles PERMANECE NULLABLE)
ALTER TABLE public.species                ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.genetic_lines          ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.boxes                  ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.lots                   ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.warehouse_food         ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.warehouse_cleaning     ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.warehouse_tools        ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.warehouse_packaging    ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.warehouse_purchases    ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.clients                ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.orders                 ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.order_items            ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.order_item_allocations ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.alert_rules            ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.alerts                 ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.user_roles             ALTER COLUMN organization_id SET NOT NULL;