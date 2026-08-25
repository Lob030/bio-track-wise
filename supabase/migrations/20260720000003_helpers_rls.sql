-- 20260720000003_helpers_rls.sql
-- Fase 3: Helpers de Seguridad y Políticas RLS Organizacionales

-- 1. Helper: Obtener organización del usuario autenticado
CREATE OR REPLACE FUNCTION public.get_my_org_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT organization_id FROM public.profiles WHERE id = auth.uid()
$$;

-- 2. Helper: ¿Es miembro activo de la organización del perfil?
CREATE OR REPLACE FUNCTION public.is_org_member()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
      AND status = 'active'
  )
$$;

-- 3. Helper: ¿Es administrador activo?
CREATE OR REPLACE FUNCTION public.is_org_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
      AND status = 'active'
      AND role = 'admin'
  )
$$;

-- 4. Helper: ¿Es operador activo?
CREATE OR REPLACE FUNCTION public.is_org_operator()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
      AND status = 'active'
      AND role = 'user'
  )
$$;

-- 5. Helper: Tier de la organización actual
CREATE OR REPLACE FUNCTION public.get_org_tier()
RETURNS public.subscription_tier LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT tier FROM public.organizations WHERE id = (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  )
$$;

GRANT EXECUTE ON FUNCTION public.get_my_org_id()    TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_member()    TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_admin()     TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_operator()  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_org_tier()     TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_my_org_id()   FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_org_member()   FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_org_admin()    FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_org_operator() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_org_tier()    FROM anon, PUBLIC;

-- 6. Limpieza de políticas RLS antiguas
DO $$
DECLARE _pol RECORD;
BEGIN
  FOR _pol IN
    SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', _pol.policyname, _pol.tablename);
  END LOOP;
END $$;

-- 7. Nuevas Políticas RLS
-- A. organizations
CREATE POLICY "org_select_member" ON public.organizations FOR SELECT USING (id = public.get_my_org_id() AND public.is_org_member());
CREATE POLICY "org_update_admin" ON public.organizations FOR UPDATE USING (id = public.get_my_org_id() AND public.is_org_admin()) WITH CHECK (id = public.get_my_org_id());

-- B. organization_invites
CREATE POLICY "inv_select_admin" ON public.organization_invites FOR SELECT USING (organization_id = public.get_my_org_id() AND public.is_org_admin());

-- C. audit_log
CREATE POLICY "audit_select_member" ON public.audit_log FOR SELECT USING (organization_id = public.get_my_org_id() AND public.is_org_member());

-- D. lot_events
CREATE POLICY "events_select_member" ON public.lot_events FOR SELECT USING (organization_id = public.get_my_org_id() AND public.is_org_member());

-- E. profiles
CREATE POLICY "profile_self_select" ON public.profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY "profile_org_admin_select" ON public.profiles FOR SELECT USING (organization_id = public.get_my_org_id() AND public.is_org_admin());
CREATE POLICY "profile_self_update" ON public.profiles FOR UPDATE USING (id = auth.uid());

-- F. user_roles
CREATE POLICY "roles_self_select" ON public.user_roles FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "roles_org_admin_select" ON public.user_roles FOR SELECT USING (organization_id = public.get_my_org_id() AND public.is_org_admin());

-- G. Tablas Operativas (species, genetic_lines, boxes, alert_rules)
CREATE POLICY "species_select" ON public.species FOR SELECT USING (organization_id = public.get_my_org_id() AND public.is_org_member());
CREATE POLICY "species_insert" ON public.species FOR INSERT WITH CHECK (organization_id = public.get_my_org_id() AND public.is_org_admin());
CREATE POLICY "species_update" ON public.species FOR UPDATE USING (organization_id = public.get_my_org_id() AND public.is_org_admin());
CREATE POLICY "species_delete" ON public.species FOR DELETE USING (organization_id = public.get_my_org_id() AND public.is_org_admin());

CREATE POLICY "gl_select" ON public.genetic_lines FOR SELECT USING (organization_id = public.get_my_org_id() AND public.is_org_member());
CREATE POLICY "gl_insert" ON public.genetic_lines FOR INSERT WITH CHECK (organization_id = public.get_my_org_id() AND public.is_org_admin());
CREATE POLICY "gl_update" ON public.genetic_lines FOR UPDATE USING (organization_id = public.get_my_org_id() AND public.is_org_admin());
CREATE POLICY "gl_delete" ON public.genetic_lines FOR DELETE USING (organization_id = public.get_my_org_id() AND public.is_org_admin());

CREATE POLICY "boxes_select" ON public.boxes FOR SELECT USING (organization_id = public.get_my_org_id() AND public.is_org_member());
CREATE POLICY "boxes_insert" ON public.boxes FOR INSERT WITH CHECK (organization_id = public.get_my_org_id() AND public.is_org_admin());
CREATE POLICY "boxes_update" ON public.boxes FOR UPDATE USING (organization_id = public.get_my_org_id() AND public.is_org_admin());
CREATE POLICY "boxes_delete" ON public.boxes FOR DELETE USING (organization_id = public.get_my_org_id() AND public.is_org_admin());

CREATE POLICY "ar_select" ON public.alert_rules FOR SELECT USING (organization_id = public.get_my_org_id() AND public.is_org_member());
CREATE POLICY "ar_insert" ON public.alert_rules FOR INSERT WITH CHECK (organization_id = public.get_my_org_id() AND public.is_org_admin());
CREATE POLICY "ar_update" ON public.alert_rules FOR UPDATE USING (organization_id = public.get_my_org_id() AND public.is_org_admin());
CREATE POLICY "ar_delete" ON public.alert_rules FOR DELETE USING (organization_id = public.get_my_org_id() AND public.is_org_admin());

-- H. lots: lectura miembros, escritura solo admin
CREATE POLICY "lots_select" ON public.lots FOR SELECT USING (organization_id = public.get_my_org_id() AND public.is_org_member());
CREATE POLICY "lots_insert" ON public.lots FOR INSERT WITH CHECK (organization_id = public.get_my_org_id() AND public.is_org_admin());
CREATE POLICY "lots_update" ON public.lots FOR UPDATE USING (organization_id = public.get_my_org_id() AND public.is_org_admin());
CREATE POLICY "lots_delete" ON public.lots FOR DELETE USING (organization_id = public.get_my_org_id() AND public.is_org_admin());

-- I. alerts
CREATE POLICY "alerts_select" ON public.alerts FOR SELECT USING (organization_id = public.get_my_org_id() AND public.is_org_member());
CREATE POLICY "alerts_insert" ON public.alerts FOR INSERT WITH CHECK (organization_id = public.get_my_org_id() AND public.is_org_admin());
CREATE POLICY "alerts_update" ON public.alerts FOR UPDATE USING (organization_id = public.get_my_org_id() AND public.is_org_admin());
CREATE POLICY "alerts_delete" ON public.alerts FOR DELETE USING (organization_id = public.get_my_org_id() AND public.is_org_admin());

-- J. Tablas Comerciales & Almacén (solo admin)
CREATE POLICY "wf_select" ON public.warehouse_food FOR SELECT USING (organization_id = public.get_my_org_id() AND public.is_org_admin());
CREATE POLICY "wf_insert" ON public.warehouse_food FOR INSERT WITH CHECK (organization_id = public.get_my_org_id() AND public.is_org_admin());
CREATE POLICY "wf_update" ON public.warehouse_food FOR UPDATE USING (organization_id = public.get_my_org_id() AND public.is_org_admin());
CREATE POLICY "wf_delete" ON public.warehouse_food FOR DELETE USING (organization_id = public.get_my_org_id() AND public.is_org_admin());

CREATE POLICY "wc_select" ON public.warehouse_cleaning FOR SELECT USING (organization_id = public.get_my_org_id() AND public.is_org_admin());
CREATE POLICY "wc_insert" ON public.warehouse_cleaning FOR INSERT WITH CHECK (organization_id = public.get_my_org_id() AND public.is_org_admin());
CREATE POLICY "wc_update" ON public.warehouse_cleaning FOR UPDATE USING (organization_id = public.get_my_org_id() AND public.is_org_admin());
CREATE POLICY "wc_delete" ON public.warehouse_cleaning FOR DELETE USING (organization_id = public.get_my_org_id() AND public.is_org_admin());

CREATE POLICY "wt_select" ON public.warehouse_tools FOR SELECT USING (organization_id = public.get_my_org_id() AND public.is_org_admin());
CREATE POLICY "wt_insert" ON public.warehouse_tools FOR INSERT WITH CHECK (organization_id = public.get_my_org_id() AND public.is_org_admin());
CREATE POLICY "wt_update" ON public.warehouse_tools FOR UPDATE USING (organization_id = public.get_my_org_id() AND public.is_org_admin());
CREATE POLICY "wt_delete" ON public.warehouse_tools FOR DELETE USING (organization_id = public.get_my_org_id() AND public.is_org_admin());

CREATE POLICY "wp_select" ON public.warehouse_packaging FOR SELECT USING (organization_id = public.get_my_org_id() AND public.is_org_admin());
CREATE POLICY "wp_insert" ON public.warehouse_packaging FOR INSERT WITH CHECK (organization_id = public.get_my_org_id() AND public.is_org_admin());
CREATE POLICY "wp_update" ON public.warehouse_packaging FOR UPDATE USING (organization_id = public.get_my_org_id() AND public.is_org_admin());
CREATE POLICY "wp_delete" ON public.warehouse_packaging FOR DELETE USING (organization_id = public.get_my_org_id() AND public.is_org_admin());

CREATE POLICY "wpu_select" ON public.warehouse_purchases FOR SELECT USING (organization_id = public.get_my_org_id() AND public.is_org_admin());
CREATE POLICY "wpu_insert" ON public.warehouse_purchases FOR INSERT WITH CHECK (organization_id = public.get_my_org_id() AND public.is_org_admin());
CREATE POLICY "wpu_update" ON public.warehouse_purchases FOR UPDATE USING (organization_id = public.get_my_org_id() AND public.is_org_admin());
CREATE POLICY "wpu_delete" ON public.warehouse_purchases FOR DELETE USING (organization_id = public.get_my_org_id() AND public.is_org_admin());

CREATE POLICY "clients_select" ON public.clients FOR SELECT USING (organization_id = public.get_my_org_id() AND public.is_org_admin());
CREATE POLICY "clients_insert" ON public.clients FOR INSERT WITH CHECK (organization_id = public.get_my_org_id() AND public.is_org_admin());
CREATE POLICY "clients_update" ON public.clients FOR UPDATE USING (organization_id = public.get_my_org_id() AND public.is_org_admin());
CREATE POLICY "clients_delete" ON public.clients FOR DELETE USING (organization_id = public.get_my_org_id() AND public.is_org_admin());

CREATE POLICY "orders_select" ON public.orders FOR SELECT USING (organization_id = public.get_my_org_id() AND public.is_org_admin());
CREATE POLICY "orders_insert" ON public.orders FOR INSERT WITH CHECK (organization_id = public.get_my_org_id() AND public.is_org_admin());
CREATE POLICY "orders_update" ON public.orders FOR UPDATE USING (organization_id = public.get_my_org_id() AND public.is_org_admin());
CREATE POLICY "orders_delete" ON public.orders FOR DELETE USING (organization_id = public.get_my_org_id() AND public.is_org_admin());

CREATE POLICY "oi_select" ON public.order_items FOR SELECT USING (organization_id = public.get_my_org_id() AND public.is_org_admin());
CREATE POLICY "oi_insert" ON public.order_items FOR INSERT WITH CHECK (organization_id = public.get_my_org_id() AND public.is_org_admin());
CREATE POLICY "oi_update" ON public.order_items FOR UPDATE USING (organization_id = public.get_my_org_id() AND public.is_org_admin());
CREATE POLICY "oi_delete" ON public.order_items FOR DELETE USING (organization_id = public.get_my_org_id() AND public.is_org_admin());

CREATE POLICY "oia_select" ON public.order_item_allocations FOR SELECT USING (organization_id = public.get_my_org_id() AND public.is_org_admin());
CREATE POLICY "oia_insert" ON public.order_item_allocations FOR INSERT WITH CHECK (organization_id = public.get_my_org_id() AND public.is_org_admin());
CREATE POLICY "oia_update" ON public.order_item_allocations FOR UPDATE USING (organization_id = public.get_my_org_id() AND public.is_org_admin());
CREATE POLICY "oia_delete" ON public.order_item_allocations FOR DELETE USING (organization_id = public.get_my_org_id() AND public.is_org_admin());
