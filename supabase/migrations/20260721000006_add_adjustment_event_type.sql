-- 20260721000006_add_adjustment_event_type.sql
-- v4.6: Añadir el valor 'adjustment' al enum public.lot_event_type

ALTER TYPE public.lot_event_type ADD VALUE IF NOT EXISTS 'adjustment';
