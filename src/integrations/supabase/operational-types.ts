import type { Database, Json } from "./types";

type Table<
  Row extends Record<string, unknown>,
  Insert extends Record<string, unknown> = Partial<Row>,
> = {
  Row: Row;
  Insert: Insert;
  Update: Partial<Row>;
  Relationships: [];
};

type View<Row extends Record<string, unknown>> = { Row: Row; Relationships: [] };
type Rpc<Args extends Record<string, unknown>> = { Args: Args; Returns: Json };

type SupplyItem = {
  id: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  current_quantity: number;
  minimum_quantity: number;
  average_unit_cost: number;
  active: boolean;
  [key: string]: unknown;
};

export type OperationalDatabase = {
  __InternalSupabase: Database["__InternalSupabase"];
  public: {
    Tables: Omit<Database["public"]["Tables"], "boxes"> & {
      boxes: Table<
        Database["public"]["Tables"]["boxes"]["Row"] & { location_id: string | null },
        Database["public"]["Tables"]["boxes"]["Insert"] & { location_id?: string | null }
      >;
      facility_locations: Table<Record<string, unknown>>;
      operational_protocols: Table<Record<string, unknown>>;
      protocol_assignments: Table<Record<string, unknown>>;
      operational_tasks: Table<{
        id: string;
        title: string;
        task_type: string;
        due_at: string;
        priority: string;
        status: string;
        instructions: string | null;
        lot_id: string | null;
        box_id: string | null;
        assigned_user_id: string | null;
        shift_id: string | null;
        [key: string]: unknown;
      }>;
      health_cases: Table<Record<string, unknown>>;
      breeding_programs: Table<Record<string, unknown>>;
      supply_items: Table<SupplyItem>;
      supply_batches: Table<Record<string, unknown>>;
      purchase_orders: Table<Record<string, unknown>>;
      purchase_order_lines: Table<Record<string, unknown>>;
      operational_shifts: Table<Record<string, unknown>>;
      operational_shift_members: Table<Record<string, unknown>>;
      inventory_source_links: Table<{
        organization_id: string;
        source: string;
        source_id: string;
        supply_item_id: string;
        created_at: string;
      }>;
      facility_user_access: Table<Record<string, unknown>>;
      adjustment_approval_requests: Table<Record<string, unknown>>;
      maintenance_assets: Table<Record<string, unknown>>;
      maintenance_plans: Table<Record<string, unknown>>;
      maintenance_events: Table<Record<string, unknown>>;
      label_print_jobs: Table<Record<string, unknown>>;
      import_jobs: Table<Record<string, unknown>>;
    };
    Views: Database["public"]["Views"] & {
      operational_planning_summary: View<Record<string, unknown>>;
      reproduction_performance: View<Record<string, unknown>>;
      executive_dashboard: View<Record<string, unknown>>;
      unified_inventory: View<Record<string, unknown>>;
      supply_forecast: View<Record<string, unknown>>;
      operational_reconciliation: View<Record<string, unknown>>;
      profitability_dimensions: View<Record<string, unknown>>;
      professional_procurement_forecast: View<Record<string, unknown>>;
      operational_exceptions: View<Record<string, unknown>>;
    };
    Functions: Database["public"]["Functions"] & {
      generate_operational_tasks: Rpc<{ _for_date?: string }>;
      complete_operational_task_tx: Rpc<Record<string, unknown>>;
      assign_box_location_tx: Rpc<Record<string, unknown>>;
      open_health_case_tx: Rpc<Record<string, unknown>>;
      add_health_treatment_tx: Rpc<Record<string, unknown>>;
      close_health_case_tx: Rpc<Record<string, unknown>>;
      create_breeding_program_tx: Rpc<Record<string, unknown>>;
      record_breeding_program_event_tx: Rpc<Record<string, unknown>>;
      create_supply_purchase_order_tx: Rpc<Record<string, unknown>>;
      receive_supply_tx: Rpc<Record<string, unknown>>;
      consume_supply_tx: Rpc<Record<string, unknown>>;
      adjust_supply_tx: Rpc<Record<string, unknown>>;
      cancel_supply_purchase_order_tx: Rpc<Record<string, unknown>>;
      set_default_labor_cost_tx: Rpc<{ _hourly_cost: number }>;
      create_operational_shift_tx: Rpc<Record<string, unknown>>;
      assign_shift_member_tx: Rpc<Record<string, unknown>>;
      assign_operational_task_tx: Rpc<Record<string, unknown>>;
      set_organization_timezone_tx: Rpc<{ _timezone: string }>;
      set_facility_user_access_tx: Rpc<Record<string, unknown>>;
      request_supply_adjustment_tx: Rpc<Record<string, unknown>>;
      decide_supply_adjustment_tx: Rpc<Record<string, unknown>>;
      create_maintenance_plan_tx: Rpc<Record<string, unknown>>;
      complete_maintenance_tx: Rpc<Record<string, unknown>>;
      record_label_print_job_tx: Rpc<Record<string, unknown>>;
      validate_import_job_tx: Rpc<Record<string, unknown>>;
      apply_import_job_tx: Rpc<Record<string, unknown>>;
      finalize_lot_tx: Rpc<{ _request_id: string; _lot_id: string; _reason: string }>;
      import_genetic_lines_tx: Rpc<{
        _request_id: string;
        _kind: "rodent" | "insect";
        _rows: Json;
      }>;
    };
    Enums: Database["public"]["Enums"];
    CompositeTypes: Database["public"]["CompositeTypes"];
  };
};
