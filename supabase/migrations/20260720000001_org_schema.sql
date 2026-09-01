-- 20260720000001_org_schema.sql
-- Fase 1: Creación de Enums, Tablas Nuevas y Columnas organization_id

-- 1. Enums Tipados
DO $$ BEGIN
  CREATE TYPE public.membership_status AS ENUM ('active', 'invited', 'revoked', 'suspended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.invite_status AS ENUM ('pending', 'accepted', 'revoked', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.lot_event_type AS ENUM ('mortality', 'birth', 'move', 'split', 'finalize');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.audit_action AS ENUM (
    'role_change', 'invite_sent', 'invite_accepted', 'invite_revoked',
    'member_suspended', 'member_reinstated', 'member_revoked',
    'mortality', 'birth', 'lot_move', 'lot_split', 'lot_finalize',
    'sale_created', 'sale_delivered', 'inventory_adjustment'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Tabla organizations
CREATE TABLE IF NOT EXISTS public.organizations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL DEFAULT 'Mi Bioterio',
  tier            public.subscription_tier NOT NULL DEFAULT 'bronze',
  tier_renewed_at TIMESTAMPTZ DEFAULT now(),
  created_by      UUID NOT NULL REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- 3. Tabla organization_invites
CREATE TABLE IF NOT EXISTS public.organization_invites (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  role            public.app_role NOT NULL DEFAULT 'user',
  status          public.invite_status NOT NULL DEFAULT 'pending',
  invited_by      UUID NOT NULL REFERENCES auth.users(id),
  token           UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at     TIMESTAMPTZ,
  accepted_by     UUID REFERENCES auth.users(id),
  revoked_at      TIMESTAMPTZ,
  revoked_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.organization_invites ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS ux_invites_pending_email
  ON public.organization_invites (organization_id, lower(email))
  WHERE status = 'pending';

-- 4. Tabla audit_log
CREATE TABLE IF NOT EXISTS public.audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  actor_user_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action          public.audit_action NOT NULL,
  target_table    TEXT,
  target_id       UUID,
  old_values      JSONB,
  new_values      JSONB,
  reason          TEXT,
  request_id      UUID,
  payload         JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_audit_log_org ON public.audit_log(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_req ON public.audit_log(request_id) WHERE request_id IS NOT NULL;

-- 5. Tabla lot_events
CREATE TABLE IF NOT EXISTS public.lot_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  lot_id          UUID NOT NULL REFERENCES public.lots(id) ON DELETE RESTRICT,
  actor_user_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type      public.lot_event_type NOT NULL,
  males_delta     INT NOT NULL DEFAULT 0,
  females_delta   INT NOT NULL DEFAULT 0,
  unsexed_delta   INT NOT NULL DEFAULT 0,
  mass_delta      NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes           TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.lot_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_lot_events_lot ON public.lot_events(lot_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lot_events_org ON public.lot_events(organization_id, created_at DESC);

-- 6. Modificar user_roles
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS organization_id   UUID REFERENCES public.organizations(id),
  ADD COLUMN IF NOT EXISTS status            public.membership_status NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS status_changed_by UUID REFERENCES auth.users(id);

ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_role_key;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_roles_one_per_user') THEN
    ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_one_per_user UNIQUE(user_id);
  END IF;
END $$;

-- 7. Añadir organization_id NULLABLE a profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);

-- 8. Añadir organization_id NULLABLE a las 15 tablas operativas/comerciales/alertas
ALTER TABLE public.species                ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.genetic_lines          ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.boxes                  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.lots                   ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.warehouse_food         ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.warehouse_cleaning     ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.warehouse_tools        ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.warehouse_packaging    ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.warehouse_purchases    ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.clients                ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.orders                 ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.order_items            ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.order_item_allocations ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.alert_rules            ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.alerts                 ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
