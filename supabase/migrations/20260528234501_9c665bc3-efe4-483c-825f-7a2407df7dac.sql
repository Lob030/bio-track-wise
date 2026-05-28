ALTER TABLE public.lots
ADD COLUMN IF NOT EXISTS total_deaths integer DEFAULT 0;

ALTER TABLE public.warehouse_food
ADD COLUMN IF NOT EXISTS min_stock_grams integer DEFAULT 0;