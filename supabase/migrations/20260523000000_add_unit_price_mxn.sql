-- Migration to add unit_price_mxn column to species table
ALTER TABLE species ADD COLUMN IF NOT EXISTS unit_price_mxn NUMERIC(10,2) DEFAULT 0;
