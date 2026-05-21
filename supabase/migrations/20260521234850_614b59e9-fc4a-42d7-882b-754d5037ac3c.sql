
-- =====================================================
-- ENUMS
-- =====================================================
CREATE TYPE public.app_role AS ENUM ('admin', 'user');
CREATE TYPE public.subscription_tier AS ENUM ('bronze', 'silver', 'gold', 'diamond');
CREATE TYPE public.kind_type AS ENUM ('rodent', 'insect');
CREATE TYPE public.lot_type AS ENUM ('breeder', 'engorda', 'birth');
CREATE TYPE public.lot_status AS ENUM ('active', 'finalizado');
CREATE TYPE public.client_profile AS ENUM ('particular', 'pimvs', 'uma', 'veterinaria', 'comercializadora', 'uso_propio');
CREATE TYPE public.order_status AS ENUM ('preparando', 'historial');
CREATE TYPE public.alert_priority AS ENUM ('high', 'medium');
CREATE TYPE public.tool_condition AS ENUM ('nuevo', 'bueno', 'regular', 'malo', 'reparacion');
CREATE TYPE public.ai_action_status AS ENUM ('pending', 'confirmed', 'cancelled');

-- =====================================================
-- PROFILES
-- =====================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  tier public.subscription_tier NOT NULL DEFAULT 'bronze',
  tier_renewed_at TIMESTAMPTZ DEFAULT now(),
  ai_prompts_used_this_month INT NOT NULL DEFAULT 0,
  ai_month_reset_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile select" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- =====================================================
-- USER ROLES
-- =====================================================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role) $$;

CREATE POLICY "own roles select" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);

-- =====================================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- =====================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================
-- TIER HELPER
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_tier(_user_id UUID)
RETURNS public.subscription_tier LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT tier FROM public.profiles WHERE id = _user_id $$;

CREATE OR REPLACE FUNCTION public.tier_rank(_t public.subscription_tier)
RETURNS INT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _t WHEN 'bronze' THEN 1 WHEN 'silver' THEN 2 WHEN 'gold' THEN 3 WHEN 'diamond' THEN 4 END
$$;

-- =====================================================
-- SPECIES
-- =====================================================
CREATE TABLE public.species (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind public.kind_type NOT NULL,
  name TEXT NOT NULL,
  -- For rodents: [{label:"Pinky",min_days:0,max_days:6}, ...]
  -- For insects: [{label:"Week 1",min_week:1,max_week:1,individuals_per_gram:200}, ...]
  size_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.species ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own species all" ON public.species FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- =====================================================
-- GENETIC LINES
-- =====================================================
CREATE TABLE public.genetic_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  species_id UUID NOT NULL REFERENCES public.species(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.genetic_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own lines all" ON public.genetic_lines FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- =====================================================
-- BOXES
-- =====================================================
CREATE TABLE public.boxes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind public.kind_type NOT NULL,
  code TEXT NOT NULL,
  capacity INT,
  location TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.boxes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own boxes all" ON public.boxes FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- =====================================================
-- LOTS
-- =====================================================
CREATE TABLE public.lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind public.kind_type NOT NULL,
  species_id UUID REFERENCES public.species(id) ON DELETE SET NULL,
  line_id UUID REFERENCES public.genetic_lines(id) ON DELETE SET NULL,
  box_id UUID REFERENCES public.boxes(id) ON DELETE SET NULL,
  parent_lot_id UUID REFERENCES public.lots(id) ON DELETE SET NULL,
  provider_purchase_id UUID,
  lot_code TEXT,
  lot_type public.lot_type NOT NULL DEFAULT 'engorda',
  status public.lot_status NOT NULL DEFAULT 'active',
  males INT DEFAULT 0,
  females INT DEFAULT 0,
  unsexed INT DEFAULT 0,
  mass_grams NUMERIC(12,2) DEFAULT 0,
  notes TEXT,
  started_at DATE NOT NULL DEFAULT CURRENT_DATE,
  finalized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.lots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own lots all" ON public.lots FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE INDEX ON public.lots(owner_id, kind, status);
CREATE INDEX ON public.lots(box_id);

-- =====================================================
-- TIER ENFORCEMENT TRIGGER ON LOTS
-- =====================================================
CREATE OR REPLACE FUNCTION public.enforce_lot_tier_limits()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _tier public.subscription_tier;
  _active INT;
  _limit INT;
BEGIN
  IF NEW.status <> 'active' THEN RETURN NEW; END IF;
  SELECT tier INTO _tier FROM public.profiles WHERE id = NEW.owner_id;
  IF _tier = 'diamond' THEN RETURN NEW; END IF;
  _limit := CASE _tier WHEN 'bronze' THEN 5 WHEN 'silver' THEN 20 ELSE 999999 END;
  SELECT COUNT(*) INTO _active FROM public.lots
    WHERE owner_id = NEW.owner_id AND kind = NEW.kind AND status = 'active' AND id <> NEW.id;
  IF _active >= _limit THEN
    RAISE EXCEPTION 'TIER_LIMIT: % tier allows max % active % lots', _tier, _limit, NEW.kind;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER enforce_lot_tier_limits_trg
BEFORE INSERT OR UPDATE ON public.lots
FOR EACH ROW EXECUTE FUNCTION public.enforce_lot_tier_limits();

-- =====================================================
-- WAREHOUSE
-- =====================================================
CREATE TABLE public.warehouse_food (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity_grams NUMERIC(12,2) NOT NULL DEFAULT 0,
  unit_cost NUMERIC(10,2),
  notes TEXT,
  audited_at DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.warehouse_food ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own food all" ON public.warehouse_food FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE TABLE public.warehouse_cleaning (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity NUMERIC(12,2) NOT NULL DEFAULT 0,
  unit TEXT DEFAULT 'ml',
  expiry_date DATE,
  cost NUMERIC(10,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.warehouse_cleaning ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own clean all" ON public.warehouse_cleaning FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE TABLE public.warehouse_tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  value NUMERIC(10,2) DEFAULT 0,
  condition public.tool_condition NOT NULL DEFAULT 'bueno',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.warehouse_tools ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own tools all" ON public.warehouse_tools FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE TABLE public.warehouse_packaging (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  units INT NOT NULL DEFAULT 0,
  unit_cost NUMERIC(10,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.warehouse_packaging ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own pack all" ON public.warehouse_packaging FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE TABLE public.warehouse_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invoice_id TEXT,
  kind public.kind_type NOT NULL,
  species_id UUID REFERENCES public.species(id) ON DELETE SET NULL,
  line_id UUID REFERENCES public.genetic_lines(id) ON DELETE SET NULL,
  population INT,
  mass_grams NUMERIC(12,2),
  total_cost NUMERIC(10,2),
  provider TEXT,
  notes TEXT,
  converted_to_lot_id UUID REFERENCES public.lots(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.warehouse_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own purchases all" ON public.warehouse_purchases FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- =====================================================
-- CLIENTS
-- =====================================================
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  profile public.client_profile NOT NULL DEFAULT 'particular',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own clients all" ON public.clients FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE OR REPLACE FUNCTION public.enforce_client_tier_limits()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _tier public.subscription_tier; _count INT;
BEGIN
  SELECT tier INTO _tier FROM public.profiles WHERE id = NEW.owner_id;
  IF _tier = 'diamond' THEN RETURN NEW; END IF;
  IF _tier IN ('bronze','silver') THEN
    RAISE EXCEPTION 'TIER_LIMIT: clients module requires Gold tier or higher';
  END IF;
  IF _tier = 'gold' THEN
    SELECT COUNT(*) INTO _count FROM public.clients WHERE owner_id = NEW.owner_id AND id <> NEW.id;
    IF _count >= 60 THEN
      RAISE EXCEPTION 'TIER_LIMIT: Gold tier allows max 60 clients';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER enforce_client_tier_limits_trg
BEFORE INSERT ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.enforce_client_tier_limits();

-- =====================================================
-- ORDERS / SALES
-- =====================================================
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  status public.order_status NOT NULL DEFAULT 'preparando',
  discount_pct INT NOT NULL DEFAULT 0,
  subtotal_mxn NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_mxn NUMERIC(10,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ
);
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own orders all" ON public.orders FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  species_id UUID REFERENCES public.species(id) ON DELETE SET NULL,
  kind public.kind_type NOT NULL,
  size_label TEXT,
  requested_qty NUMERIC(12,2) NOT NULL,
  unit_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own oi all" ON public.order_items FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE TABLE public.order_item_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_item_id UUID NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  lot_id UUID REFERENCES public.lots(id) ON DELETE SET NULL,
  qty_taken NUMERIC(12,2) NOT NULL,
  finalized_lot BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.order_item_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own oia all" ON public.order_item_allocations FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- =====================================================
-- ALERTS
-- =====================================================
CREATE TABLE public.alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope TEXT NOT NULL DEFAULT 'all',         -- 'all' | 'lot'
  lot_id UUID REFERENCES public.lots(id) ON DELETE CASCADE,
  lot_type public.lot_type,
  metric TEXT NOT NULL,                       -- days_active | age_days | weight | population
  operator TEXT NOT NULL,                     -- > | < | ==
  threshold NUMERIC(12,2) NOT NULL,
  priority public.alert_priority NOT NULL DEFAULT 'medium',
  frequency_days INT NOT NULL DEFAULT 0,      -- 0 = once
  template_text TEXT NOT NULL DEFAULT 'Lot {lot_id} in box {box_id} reached limit',
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.alert_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own rules all" ON public.alert_rules FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE TABLE public.alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rule_id UUID REFERENCES public.alert_rules(id) ON DELETE CASCADE,
  lot_id UUID REFERENCES public.lots(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  priority public.alert_priority NOT NULL DEFAULT 'medium',
  acknowledged BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own alerts all" ON public.alerts FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- =====================================================
-- AI ASSISTANT
-- =====================================================
CREATE TABLE public.ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own conv all" ON public.ai_conversations FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE TABLE public.ai_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  pending_action_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own msg all" ON public.ai_messages FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE TABLE public.ai_pending_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  summary TEXT NOT NULL,
  status public.ai_action_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
ALTER TABLE public.ai_pending_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own pact all" ON public.ai_pending_actions FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- =====================================================
-- FIFO consume function
-- =====================================================
CREATE OR REPLACE FUNCTION public.fifo_consume_rodents(_owner UUID, _species UUID, _size TEXT, _qty INT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _remaining INT := _qty;
  _lot RECORD;
  _alloc JSONB := '[]'::jsonb;
  _take INT;
  _pop INT;
  _rule JSONB;
  _min INT;
  _max INT;
BEGIN
  -- iterate active rodent lots of species matching size category, lowest population first
  FOR _lot IN
    SELECT l.*, (COALESCE(l.males,0)+COALESCE(l.females,0)+COALESCE(l.unsexed,0)) AS pop,
           (CURRENT_DATE - l.started_at) AS age_days
    FROM public.lots l
    WHERE l.owner_id = _owner AND l.kind='rodent' AND l.status='active'
      AND l.species_id = _species
      AND (COALESCE(l.males,0)+COALESCE(l.females,0)+COALESCE(l.unsexed,0)) > 0
    ORDER BY (COALESCE(l.males,0)+COALESCE(l.females,0)+COALESCE(l.unsexed,0)) ASC
  LOOP
    -- check size match
    SELECT size_rules INTO _rule FROM public.species WHERE id = _species;
    IF _rule IS NULL THEN EXIT; END IF;
    -- find matching size band
    PERFORM 1 FROM jsonb_array_elements(_rule) r
      WHERE r->>'label' = _size
        AND (r->>'min_days')::INT <= _lot.age_days
        AND (r->>'max_days')::INT >= _lot.age_days;
    IF NOT FOUND THEN CONTINUE; END IF;

    _pop := _lot.pop;
    _take := LEAST(_remaining, _pop);

    -- proportional deduction across unsexed/males/females
    UPDATE public.lots SET
      unsexed = GREATEST(0, COALESCE(unsexed,0) - LEAST(COALESCE(unsexed,0), _take)),
      males   = GREATEST(0, COALESCE(males,0)   - GREATEST(0, _take - LEAST(COALESCE(unsexed,0), _take))),
      females = COALESCE(females,0) - GREATEST(0, _take - LEAST(COALESCE(unsexed,0), _take) - LEAST(COALESCE(males,0), GREATEST(0, _take - LEAST(COALESCE(unsexed,0), _take)))),
      status = CASE WHEN _take >= _pop THEN 'finalizado'::lot_status ELSE status END,
      finalized_at = CASE WHEN _take >= _pop THEN now() ELSE finalized_at END
    WHERE id = _lot.id;

    _alloc := _alloc || jsonb_build_object('lot_id', _lot.id, 'qty', _take, 'finalized', _take >= _pop);
    _remaining := _remaining - _take;
    EXIT WHEN _remaining <= 0;
  END LOOP;
  RETURN jsonb_build_object('allocations', _alloc, 'unfulfilled', _remaining);
END; $$;

CREATE OR REPLACE FUNCTION public.fifo_consume_insects(_owner UUID, _species UUID, _size TEXT, _grams NUMERIC)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _remaining NUMERIC := _grams;
  _lot RECORD;
  _alloc JSONB := '[]'::jsonb;
  _take NUMERIC;
BEGIN
  FOR _lot IN
    SELECT * FROM public.lots
    WHERE owner_id = _owner AND kind='insect' AND status='active'
      AND species_id = _species AND mass_grams > 0
    ORDER BY mass_grams ASC
  LOOP
    _take := LEAST(_remaining, _lot.mass_grams);
    UPDATE public.lots SET
      mass_grams = mass_grams - _take,
      status = CASE WHEN _take >= _lot.mass_grams THEN 'finalizado'::lot_status ELSE status END,
      finalized_at = CASE WHEN _take >= _lot.mass_grams THEN now() ELSE finalized_at END
    WHERE id = _lot.id;
    _alloc := _alloc || jsonb_build_object('lot_id', _lot.id, 'qty', _take, 'finalized', _take >= _lot.mass_grams);
    _remaining := _remaining - _take;
    EXIT WHEN _remaining <= 0;
  END LOOP;
  RETURN jsonb_build_object('allocations', _alloc, 'unfulfilled', _remaining);
END; $$;

-- updated_at helper trigger generator not needed since columns omitted intentionally
