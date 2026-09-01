import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { OperationalDatabase } from "@/integrations/supabase/operational-types";

// The generated schema is extended locally until staging can regenerate the complete file.
export const operationsDb = supabase as unknown as SupabaseClient<OperationalDatabase>;

export type OperationalTask = {
  id: string;
  title: string;
  task_type: string;
  due_at: string;
  priority: string;
  status: string;
  instructions: string | null;
  lot_id: string | null;
  box_id: string | null;
};

export type SimpleLot = {
  id: string;
  lot_code: string | null;
  kind: "rodent" | "insect";
  box_id: string | null;
  species_id: string;
  started_at: string;
};

export type SimpleBox = {
  id: string;
  code: string;
  kind: "rodent" | "insect";
  location_id: string | null;
};
