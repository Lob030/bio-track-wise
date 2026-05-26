ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS preferred_theme text DEFAULT 'dark-slate';
ALTER TABLE public.alert_rules ADD COLUMN IF NOT EXISTS name text;