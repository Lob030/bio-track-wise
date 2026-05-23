-- Migration: Add children_lot_ids array column to lots table
-- This enables bidirectional parent-child traceability for lot splits

ALTER TABLE public.lots 
ADD COLUMN IF NOT EXISTS children_lot_ids UUID[] DEFAULT '{}'::uuid[];

-- Create GIN index for faster array queries
CREATE INDEX IF NOT EXISTS idx_lots_children_lot_ids ON public.lots USING GIN (children_lot_ids);
