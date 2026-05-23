ALTER TABLE public.lots
  ADD COLUMN IF NOT EXISTS children_lot_ids UUID[] DEFAULT '{}'::uuid[];

CREATE INDEX IF NOT EXISTS idx_lots_children_lot_ids
  ON public.lots USING GIN (children_lot_ids);