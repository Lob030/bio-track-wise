## Apply `children_lot_ids` migration to lots table

Execute the pending schema change so the `lots` table supports bidirectional parent↔child lot traceability, then let the Supabase types regenerate automatically.

### What runs

```sql
ALTER TABLE public.lots
  ADD COLUMN IF NOT EXISTS children_lot_ids UUID[] DEFAULT '{}'::uuid[];

CREATE INDEX IF NOT EXISTS idx_lots_children_lot_ids
  ON public.lots USING GIN (children_lot_ids);
```

### Steps

1. Run the migration via the Supabase migration tool (this is the only supported path on Lovable — `npx supabase db push` is not used here).
2. After approval, `src/integrations/supabase/types.ts` is regenerated automatically; `lots.children_lot_ids` becomes `string[] | null`.
3. The build runs automatically on the next change — no manual `npm run build` needed. I'll confirm types updated.

### Not touched

No TypeScript/React files are modified, matching your instruction.