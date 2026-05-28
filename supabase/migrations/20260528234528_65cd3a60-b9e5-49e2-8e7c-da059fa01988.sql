ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS email text,
ADD COLUMN IF NOT EXISTS notes text;