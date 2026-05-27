ALTER TABLE public.lots
ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_lots_tags ON public.lots USING GIN(tags);
