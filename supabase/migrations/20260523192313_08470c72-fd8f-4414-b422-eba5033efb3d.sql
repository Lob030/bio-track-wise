ALTER TABLE public.alert_rules
  ADD COLUMN IF NOT EXISTS animal_kind TEXT NOT NULL DEFAULT 'both',
  ADD COLUMN IF NOT EXISTS species_id UUID;

ALTER TABLE public.alert_rules
  DROP CONSTRAINT IF EXISTS alert_rules_animal_kind_check;
ALTER TABLE public.alert_rules
  ADD CONSTRAINT alert_rules_animal_kind_check CHECK (animal_kind IN ('rodent','insect','both'));