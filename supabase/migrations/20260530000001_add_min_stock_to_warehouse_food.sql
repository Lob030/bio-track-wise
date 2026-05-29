ALTER TABLE public.warehouse_food
ADD COLUMN IF NOT EXISTS min_stock_grams integer DEFAULT 0;
