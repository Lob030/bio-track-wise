-- BioTrack: tipos de evento para auditoria y union de lotes.

ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'record_created';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'record_updated';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'record_deleted';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'lot_merge';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'fifo_allocation';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'configuration_change';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'purchase_created';

ALTER TYPE public.lot_event_type ADD VALUE IF NOT EXISTS 'merge';
