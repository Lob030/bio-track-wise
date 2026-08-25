export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: Database["public"]["Enums"]["audit_action"];
          actor_user_id: string | null;
          created_at: string;
          entry_hash: string;
          event_version: number;
          id: string;
          new_values: Json | null;
          old_values: Json | null;
          operation: string;
          organization_id: string;
          origin: string;
          payload: Json;
          reason: string | null;
          request_id: string | null;
          target_id: string | null;
          target_table: string | null;
          transaction_id: number;
        };
        Insert: {
          action: Database["public"]["Enums"]["audit_action"];
          actor_user_id?: string | null;
          created_at?: string;
          entry_hash?: string;
          event_version?: number;
          id?: string;
          new_values?: Json | null;
          old_values?: Json | null;
          operation?: string;
          organization_id: string;
          origin?: string;
          payload?: Json;
          reason?: string | null;
          request_id?: string | null;
          target_id?: string | null;
          target_table?: string | null;
          transaction_id?: number;
        };
        Update: {
          action?: Database["public"]["Enums"]["audit_action"];
          actor_user_id?: string | null;
          created_at?: string;
          entry_hash?: string;
          event_version?: number;
          id?: string;
          new_values?: Json | null;
          old_values?: Json | null;
          operation?: string;
          organization_id?: string;
          origin?: string;
          payload?: Json;
          reason?: string | null;
          request_id?: string | null;
          target_id?: string | null;
          target_table?: string | null;
          transaction_id?: number;
        };
        Relationships: [];
      };
      lot_events: {
        Row: {
          actor_user_id: string | null;
          cause: string | null;
          created_at: string;
          destination_box_id: string | null;
          evidence_url: string | null;
          event_at: string;
          event_type: Database["public"]["Enums"]["lot_event_type"];
          females_delta: number;
          id: string;
          lot_id: string;
          males_delta: number;
          mass_delta: number;
          metadata: Json;
          notes: string | null;
          observations: string | null;
          organization_id: string;
          reference_id: string | null;
          reference_type: string | null;
          related_lot_id: string | null;
          request_id: string | null;
          source_box_id: string | null;
          unsexed_delta: number;
        };
        Insert: {
          actor_user_id?: string | null;
          cause?: string | null;
          created_at?: string;
          destination_box_id?: string | null;
          evidence_url?: string | null;
          event_at?: string;
          event_type: Database["public"]["Enums"]["lot_event_type"];
          females_delta?: number;
          id?: string;
          lot_id: string;
          males_delta?: number;
          mass_delta?: number;
          metadata?: Json;
          notes?: string | null;
          observations?: string | null;
          organization_id: string;
          reference_id?: string | null;
          reference_type?: string | null;
          related_lot_id?: string | null;
          request_id?: string | null;
          source_box_id?: string | null;
          unsexed_delta?: number;
        };
        Update: {
          actor_user_id?: string | null;
          cause?: string | null;
          created_at?: string;
          destination_box_id?: string | null;
          evidence_url?: string | null;
          event_at?: string;
          event_type?: Database["public"]["Enums"]["lot_event_type"];
          females_delta?: number;
          id?: string;
          lot_id?: string;
          males_delta?: number;
          mass_delta?: number;
          metadata?: Json;
          notes?: string | null;
          observations?: string | null;
          organization_id?: string;
          reference_id?: string | null;
          reference_type?: string | null;
          related_lot_id?: string | null;
          request_id?: string | null;
          source_box_id?: string | null;
          unsexed_delta?: number;
        };
        Relationships: [];
      };
      inventory_events: {
        Row: {
          actor_user_id: string | null;
          balance_after: Json;
          balance_before: Json;
          cause: string | null;
          created_at: string;
          destination_box_id: string | null;
          evidence_url: string | null;
          event_at: string;
          event_type: Database["public"]["Enums"]["inventory_event_type"];
          females_delta: number;
          id: string;
          lot_id: string;
          males_delta: number;
          mass_delta: number;
          observations: string | null;
          organization_id: string;
          origin: string;
          reference_id: string | null;
          reference_type: string | null;
          request_id: string | null;
          source_box_id: string | null;
          unsexed_delta: number;
        };
        Insert: {
          actor_user_id?: string | null;
          balance_after: Json;
          balance_before: Json;
          cause?: string | null;
          created_at?: string;
          destination_box_id?: string | null;
          evidence_url?: string | null;
          event_at?: string;
          event_type: Database["public"]["Enums"]["inventory_event_type"];
          females_delta?: number;
          id?: string;
          lot_id: string;
          males_delta?: number;
          mass_delta?: number;
          observations?: string | null;
          organization_id: string;
          origin?: string;
          reference_id?: string | null;
          reference_type?: string | null;
          request_id?: string | null;
          source_box_id?: string | null;
          unsexed_delta?: number;
        };
        Update: {
          actor_user_id?: string | null;
          balance_after?: Json;
          balance_before?: Json;
          cause?: string | null;
          created_at?: string;
          destination_box_id?: string | null;
          evidence_url?: string | null;
          event_at?: string;
          event_type?: Database["public"]["Enums"]["inventory_event_type"];
          females_delta?: number;
          id?: string;
          lot_id?: string;
          males_delta?: number;
          mass_delta?: number;
          observations?: string | null;
          organization_id?: string;
          origin?: string;
          reference_id?: string | null;
          reference_type?: string | null;
          request_id?: string | null;
          source_box_id?: string | null;
          unsexed_delta?: number;
        };
        Relationships: [];
      };
      reproduction_events: {
        Row: {
          actor_user_id: string | null;
          box_id: string | null;
          cause: string | null;
          created_at: string;
          evidence_url: string | null;
          event_at: string;
          event_type: Database["public"]["Enums"]["reproduction_event_type"];
          id: string;
          line_id: string | null;
          mass_grams: number | null;
          observations: string | null;
          offspring_lot_id: string | null;
          organization_id: string;
          primary_lot_id: string;
          quantity: number | null;
          reference_id: string | null;
          reference_type: string | null;
          request_id: string;
          secondary_lot_id: string | null;
          species_id: string;
        };
        Insert: {
          actor_user_id?: string | null;
          box_id?: string | null;
          cause?: string | null;
          created_at?: string;
          evidence_url?: string | null;
          event_at?: string;
          event_type: Database["public"]["Enums"]["reproduction_event_type"];
          id?: string;
          line_id?: string | null;
          mass_grams?: number | null;
          observations?: string | null;
          offspring_lot_id?: string | null;
          organization_id: string;
          primary_lot_id: string;
          quantity?: number | null;
          reference_id?: string | null;
          reference_type?: string | null;
          request_id: string;
          secondary_lot_id?: string | null;
          species_id: string;
        };
        Update: {
          actor_user_id?: string | null;
          box_id?: string | null;
          cause?: string | null;
          created_at?: string;
          evidence_url?: string | null;
          event_at?: string;
          event_type?: Database["public"]["Enums"]["reproduction_event_type"];
          id?: string;
          line_id?: string | null;
          mass_grams?: number | null;
          observations?: string | null;
          offspring_lot_id?: string | null;
          organization_id?: string;
          primary_lot_id?: string;
          quantity?: number | null;
          reference_id?: string | null;
          reference_type?: string | null;
          request_id?: string;
          secondary_lot_id?: string | null;
          species_id?: string;
        };
        Relationships: [];
      };
      organizations: {
        Row: {
          created_at: string;
          created_by: string;
          id: string;
          name: string;
          tier: Database["public"]["Enums"]["subscription_tier"];
          tier_renewed_at: string | null;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          id?: string;
          name?: string;
          tier?: Database["public"]["Enums"]["subscription_tier"];
          tier_renewed_at?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          id?: string;
          name?: string;
          tier?: Database["public"]["Enums"]["subscription_tier"];
          tier_renewed_at?: string | null;
        };
        Relationships: [];
      };
      organization_invites: {
        Row: {
          accepted_at: string | null;
          accepted_by: string | null;
          created_at: string;
          email: string;
          expires_at: string;
          id: string;
          invited_by: string;
          organization_id: string;
          revoked_at: string | null;
          revoked_by: string | null;
          role: Database["public"]["Enums"]["app_role"];
          status: Database["public"]["Enums"]["invite_status"];
          token: string;
        };
        Insert: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          created_at?: string;
          email: string;
          expires_at?: string;
          id?: string;
          invited_by: string;
          organization_id: string;
          revoked_at?: string | null;
          revoked_by?: string | null;
          role?: Database["public"]["Enums"]["app_role"];
          status?: Database["public"]["Enums"]["invite_status"];
          token?: string;
        };
        Update: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          created_at?: string;
          email?: string;
          expires_at?: string;
          id?: string;
          invited_by?: string;
          organization_id?: string;
          revoked_at?: string | null;
          revoked_by?: string | null;
          role?: Database["public"]["Enums"]["app_role"];
          status?: Database["public"]["Enums"]["invite_status"];
          token?: string;
        };
        Relationships: [];
      };
      ai_conversations: {
        Row: {
          created_at: string;
          id: string;
          organization_id: string;
          owner_id?: string;
          title: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          organization_id?: string;
          owner_id?: string;
          title?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          organization_id?: string;
          owner_id?: string;
          title?: string | null;
        };
        Relationships: [];
      };
      ai_messages: {
        Row: {
          content: string;
          conversation_id: string;
          created_at: string;
          id: string;
          organization_id: string;
          owner_id?: string;
          pending_action_id: string | null;
          role: string;
        };
        Insert: {
          content: string;
          conversation_id: string;
          created_at?: string;
          id?: string;
          organization_id?: string;
          owner_id?: string;
          pending_action_id?: string | null;
          role: string;
        };
        Update: {
          content?: string;
          conversation_id?: string;
          created_at?: string;
          id?: string;
          organization_id?: string;
          owner_id?: string;
          pending_action_id?: string | null;
          role?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_messages_org_conversation_fkey";
            columns: ["organization_id", "conversation_id"];
            isOneToOne: false;
            referencedRelation: "ai_conversations";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "ai_messages_org_pending_action_fkey";
            columns: ["organization_id", "pending_action_id"];
            isOneToOne: false;
            referencedRelation: "ai_pending_actions";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      ai_pending_actions: {
        Row: {
          action_type: string;
          conversation_id: string | null;
          created_at: string;
          id: string;
          organization_id: string;
          owner_id?: string;
          payload: Json;
          resolved_at: string | null;
          status: Database["public"]["Enums"]["ai_action_status"];
          summary: string;
        };
        Insert: {
          action_type: string;
          conversation_id?: string | null;
          created_at?: string;
          id?: string;
          organization_id?: string;
          owner_id?: string;
          payload: Json;
          resolved_at?: string | null;
          status?: Database["public"]["Enums"]["ai_action_status"];
          summary: string;
        };
        Update: {
          action_type?: string;
          conversation_id?: string | null;
          created_at?: string;
          id?: string;
          organization_id?: string;
          owner_id?: string;
          payload?: Json;
          resolved_at?: string | null;
          status?: Database["public"]["Enums"]["ai_action_status"];
          summary?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_actions_org_conversation_fkey";
            columns: ["organization_id", "conversation_id"];
            isOneToOne: false;
            referencedRelation: "ai_conversations";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      alert_rules: {
        Row: {
          animal_kind: string;
          created_at: string;
          enabled: boolean;
          evaluation_window_days: number;
          frequency_days: number;
          id: string;
          last_triggered_at: string | null;
          lot_id: string | null;
          lot_type: Database["public"]["Enums"]["lot_type"] | null;
          metric: string;
          name: string | null;
          operator: string;
          organization_id: string;
          owner_id?: string;
          priority: Database["public"]["Enums"]["alert_priority"];
          scope: string;
          species_id: string | null;
          template_text: string;
          threshold: number;
        };
        Insert: {
          animal_kind?: string;
          created_at?: string;
          enabled?: boolean;
          evaluation_window_days?: number;
          frequency_days?: number;
          id?: string;
          last_triggered_at?: string | null;
          lot_id?: string | null;
          lot_type?: Database["public"]["Enums"]["lot_type"] | null;
          metric: string;
          name?: string | null;
          operator: string;
          organization_id?: string;
          owner_id?: string;
          priority?: Database["public"]["Enums"]["alert_priority"];
          scope?: string;
          species_id?: string | null;
          template_text?: string;
          threshold: number;
        };
        Update: {
          animal_kind?: string;
          created_at?: string;
          enabled?: boolean;
          evaluation_window_days?: number;
          frequency_days?: number;
          id?: string;
          last_triggered_at?: string | null;
          lot_id?: string | null;
          lot_type?: Database["public"]["Enums"]["lot_type"] | null;
          metric?: string;
          name?: string | null;
          operator?: string;
          organization_id?: string;
          owner_id?: string;
          priority?: Database["public"]["Enums"]["alert_priority"];
          scope?: string;
          species_id?: string | null;
          template_text?: string;
          threshold?: number;
        };
        Relationships: [
          {
            foreignKeyName: "alert_rules_lot_id_fkey";
            columns: ["lot_id"];
            isOneToOne: false;
            referencedRelation: "lots";
            referencedColumns: ["id"];
          },
        ];
      };
      alerts: {
        Row: {
          acknowledged: boolean;
          acknowledged_at: string | null;
          acknowledged_by: string | null;
          condition_key: string;
          created_at: string;
          current_value: number | null;
          entity_id: string | null;
          entity_type: string;
          generated_at: string;
          id: string;
          last_notified_at: string;
          last_seen_at: string;
          lot_id: string | null;
          message: string;
          occurrence_count: number;
          organization_id: string;
          owner_id?: string;
          priority: Database["public"]["Enums"]["alert_priority"];
          resolution_reason: string | null;
          resolved_at: string | null;
          resolved_by: string | null;
          rule_id: string | null;
          status: string;
        };
        Insert: {
          acknowledged?: boolean;
          acknowledged_at?: string | null;
          acknowledged_by?: string | null;
          condition_key: string;
          created_at?: string;
          current_value?: number | null;
          entity_id?: string | null;
          entity_type?: string;
          generated_at?: string;
          id?: string;
          last_notified_at?: string;
          last_seen_at?: string;
          lot_id?: string | null;
          message: string;
          occurrence_count?: number;
          organization_id?: string;
          owner_id?: string;
          priority?: Database["public"]["Enums"]["alert_priority"];
          resolution_reason?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          rule_id?: string | null;
          status?: string;
        };
        Update: {
          acknowledged?: boolean;
          acknowledged_at?: string | null;
          acknowledged_by?: string | null;
          condition_key?: string;
          created_at?: string;
          current_value?: number | null;
          entity_id?: string | null;
          entity_type?: string;
          generated_at?: string;
          id?: string;
          last_notified_at?: string;
          last_seen_at?: string;
          lot_id?: string | null;
          message?: string;
          occurrence_count?: number;
          organization_id?: string;
          owner_id?: string;
          priority?: Database["public"]["Enums"]["alert_priority"];
          resolution_reason?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          rule_id?: string | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "alerts_lot_id_fkey";
            columns: ["lot_id"];
            isOneToOne: false;
            referencedRelation: "lots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "alerts_rule_id_fkey";
            columns: ["rule_id"];
            isOneToOne: false;
            referencedRelation: "alert_rules";
            referencedColumns: ["id"];
          },
        ];
      };
      alert_evaluation_runs: {
        Row: {
          alerts_generated: number;
          alerts_resolved: number;
          completed_at: string | null;
          conditions_matched: number;
          error_message: string | null;
          id: string;
          invocation_id: string | null;
          organization_id: string | null;
          rules_evaluated: number;
          started_at: string;
          status: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      box_types: {
        Row: {
          id: string;
          organization_id: string;
          owner_id: string;
          code: string;
          name: string;
          kind: Database["public"]["Enums"]["kind_type"];
          length_cm: number | null;
          width_cm: number | null;
          height_cm: number | null;
          usable_volume_liters: number | null;
          material: string | null;
          max_population: number | null;
          max_biomass_grams: number | null;
          life_stages: string[];
          ventilation: string | null;
          lid_type: string | null;
          temperature_min_c: number | null;
          temperature_max_c: number | null;
          humidity_min_pct: number | null;
          humidity_max_pct: number | null;
          cleaning_interval_days: number | null;
          useful_life_days: number | null;
          notes: string | null;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id?: string;
          owner_id?: string;
          code: string;
          name: string;
          kind: Database["public"]["Enums"]["kind_type"];
          length_cm?: number | null;
          width_cm?: number | null;
          height_cm?: number | null;
          usable_volume_liters?: number | null;
          material?: string | null;
          max_population?: number | null;
          max_biomass_grams?: number | null;
          life_stages?: string[];
          ventilation?: string | null;
          lid_type?: string | null;
          temperature_min_c?: number | null;
          temperature_max_c?: number | null;
          humidity_min_pct?: number | null;
          humidity_max_pct?: number | null;
          cleaning_interval_days?: number | null;
          useful_life_days?: number | null;
          notes?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["box_types"]["Insert"]>;
        Relationships: [];
      };
      substrates: {
        Row: {
          id: string;
          organization_id: string;
          owner_id: string;
          code: string;
          name: string;
          stock_grams: number;
          minimum_stock_grams: number;
          average_cost_per_kg: number;
          supplier: string | null;
          batch_code: string | null;
          expires_at: string | null;
          notes: string | null;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id?: string;
          owner_id?: string;
          code: string;
          name: string;
          stock_grams?: number;
          minimum_stock_grams?: number;
          average_cost_per_kg?: number;
          supplier?: string | null;
          batch_code?: string | null;
          expires_at?: string | null;
          notes?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["substrates"]["Insert"]>;
        Relationships: [];
      };
      box_substrate_rules: {
        Row: {
          id: string;
          organization_id: string;
          owner_id: string;
          box_type_id: string;
          substrate_id: string;
          setup_grams: number;
          replacement_grams: number;
          replacement_interval_days: number | null;
          waste_pct: number;
          optional: boolean;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id?: string;
          owner_id?: string;
          box_type_id: string;
          substrate_id: string;
          setup_grams?: number;
          replacement_grams?: number;
          replacement_interval_days?: number | null;
          waste_pct?: number;
          optional?: boolean;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["box_substrate_rules"]["Insert"]>;
        Relationships: [];
      };
      substrate_inventory_events: {
        Row: {
          id: string;
          organization_id: string;
          actor_user_id: string | null;
          substrate_id: string;
          event_type: string;
          event_at: string;
          grams_delta: number;
          balance_before_grams: number;
          balance_after_grams: number;
          unit_cost_per_kg: number;
          total_cost: number;
          box_id: string | null;
          lot_id: string | null;
          reason: string | null;
          observations: string | null;
          evidence_url: string | null;
          reference_type: string | null;
          reference_id: string | null;
          request_id: string;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      box_service_events: {
        Row: {
          id: string;
          organization_id: string;
          actor_user_id: string | null;
          box_id: string;
          lot_id: string | null;
          event_type: string;
          event_at: string;
          substrate_event_id: string | null;
          observations: string | null;
          evidence_url: string | null;
          request_id: string;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      lot_cost_allocations: {
        Row: {
          id: string;
          organization_id: string;
          lot_id: string;
          category: string;
          amount: number;
          source_table: string;
          source_id: string;
          incurred_at: string;
          description: string | null;
          created_at: string;
          cost_entry_id: string | null;
          allocation_basis: string;
          allocation_weight: number | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      cost_entries: {
        Row: {
          id: string;
          organization_id: string;
          actor_user_id: string | null;
          category: string;
          description: string;
          incurred_at: string;
          quantity: number | null;
          unit: string | null;
          unit_cost: number | null;
          total_amount: number;
          vendor: string | null;
          reference_type: string | null;
          reference_id: string | null;
          notes: string | null;
          evidence_url: string | null;
          request_id: string | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      feed_inventory_events: {
        Row: {
          id: string;
          organization_id: string;
          actor_user_id: string | null;
          food_id: string;
          event_type: string;
          event_at: string;
          grams_delta: number;
          balance_before_grams: number;
          balance_after_grams: number;
          unit_cost_per_kg: number;
          total_cost: number;
          cost_entry_id: string | null;
          observations: string | null;
          request_id: string | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      cost_assets: {
        Row: {
          id: string;
          organization_id: string;
          owner_id: string;
          code: string;
          name: string;
          asset_type: string;
          box_id: string | null;
          acquisition_cost: number;
          residual_value: number;
          useful_life_months: number;
          in_service_date: string;
          active: boolean;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id?: string;
          owner_id?: string;
          code: string;
          name: string;
          asset_type: string;
          box_id?: string | null;
          acquisition_cost: number;
          residual_value?: number;
          useful_life_months: number;
          in_service_date: string;
          active?: boolean;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["cost_assets"]["Insert"]>;
        Relationships: [];
      };
      asset_depreciation_postings: {
        Row: {
          id: string;
          organization_id: string;
          asset_id: string;
          period_start: string;
          amount: number;
          cost_entry_id: string;
          request_id: string;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      boxes: {
        Row: {
          capacity: number | null;
          capacity_override: boolean;
          box_type_id: string | null;
          acquired_at: string | null;
          status: string;
          notes: string | null;
          code: string;
          created_at: string;
          id: string;
          kind: Database["public"]["Enums"]["kind_type"];
          location: string | null;
          organization_id: string;
          owner_id?: string;
        };
        Insert: {
          capacity?: number | null;
          capacity_override?: boolean;
          box_type_id?: string | null;
          acquired_at?: string | null;
          status?: string;
          notes?: string | null;
          code: string;
          created_at?: string;
          id?: string;
          kind: Database["public"]["Enums"]["kind_type"];
          location?: string | null;
          organization_id?: string;
          owner_id?: string;
        };
        Update: {
          capacity?: number | null;
          capacity_override?: boolean;
          box_type_id?: string | null;
          acquired_at?: string | null;
          status?: string;
          notes?: string | null;
          code?: string;
          created_at?: string;
          id?: string;
          kind?: Database["public"]["Enums"]["kind_type"];
          location?: string | null;
          organization_id?: string;
          owner_id?: string;
        };
        Relationships: [];
      };
      clients: {
        Row: {
          created_at: string;
          email: string | null;
          id: string;
          name: string;
          notes: string | null;
          owner_id?: string;
          phone: string;
          profile: Database["public"]["Enums"]["client_profile"];
        };
        Insert: {
          created_at?: string;
          email?: string | null;
          id?: string;
          name: string;
          notes?: string | null;
          owner_id?: string;
          phone: string;
          profile?: Database["public"]["Enums"]["client_profile"];
        };
        Update: {
          created_at?: string;
          email?: string | null;
          id?: string;
          name?: string;
          notes?: string | null;
          owner_id?: string;
          phone?: string;
          profile?: Database["public"]["Enums"]["client_profile"];
        };
        Relationships: [];
      };
      genetic_lines: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          notes: string | null;
          owner_id?: string;
          species_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          notes?: string | null;
          owner_id?: string;
          species_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          notes?: string | null;
          owner_id?: string;
          species_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "genetic_lines_species_id_fkey";
            columns: ["species_id"];
            isOneToOne: false;
            referencedRelation: "species";
            referencedColumns: ["id"];
          },
        ];
      };
      lots: {
        Row: {
          box_id: string | null;
          created_at: string;
          females: number | null;
          finalized_at: string | null;
          id: string;
          kind: Database["public"]["Enums"]["kind_type"];
          line_id: string | null;
          lot_code: string | null;
          lot_type: Database["public"]["Enums"]["lot_type"];
          males: number | null;
          mass_grams: number | null;
          notes: string | null;
          owner_id?: string;
          parent_lot_id: string | null;
          provider_purchase_id: string | null;
          species_id: string;
          started_at: string;
          status: Database["public"]["Enums"]["lot_status"];
          tags: string[];
          total_deaths: number | null;
          unsexed: number | null;
        };
        Insert: {
          box_id?: string | null;
          created_at?: string;
          females?: number | null;
          finalized_at?: string | null;
          id?: string;
          kind: Database["public"]["Enums"]["kind_type"];
          line_id?: string | null;
          lot_code?: string | null;
          lot_type?: Database["public"]["Enums"]["lot_type"];
          males?: number | null;
          mass_grams?: number | null;
          notes?: string | null;
          owner_id?: string;
          parent_lot_id?: string | null;
          provider_purchase_id?: string | null;
          species_id: string;
          started_at?: string;
          status?: Database["public"]["Enums"]["lot_status"];
          tags?: string[];
          total_deaths?: number | null;
          unsexed?: number | null;
        };
        Update: {
          box_id?: string | null;
          created_at?: string;
          females?: number | null;
          finalized_at?: string | null;
          id?: string;
          kind?: Database["public"]["Enums"]["kind_type"];
          line_id?: string | null;
          lot_code?: string | null;
          lot_type?: Database["public"]["Enums"]["lot_type"];
          males?: number | null;
          mass_grams?: number | null;
          notes?: string | null;
          owner_id?: string;
          parent_lot_id?: string | null;
          provider_purchase_id?: string | null;
          species_id?: string | null;
          started_at?: string;
          status?: Database["public"]["Enums"]["lot_status"];
          tags?: string[];
          total_deaths?: number | null;
          unsexed?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "lots_box_id_fkey";
            columns: ["box_id"];
            isOneToOne: false;
            referencedRelation: "boxes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lots_line_id_fkey";
            columns: ["line_id"];
            isOneToOne: false;
            referencedRelation: "genetic_lines";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lots_parent_lot_id_fkey";
            columns: ["parent_lot_id"];
            isOneToOne: false;
            referencedRelation: "lots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lots_species_id_fkey";
            columns: ["species_id"];
            isOneToOne: false;
            referencedRelation: "species";
            referencedColumns: ["id"];
          },
        ];
      };
      order_item_allocations: {
        Row: {
          created_at: string;
          finalized_lot: boolean;
          id: string;
          lot_id: string | null;
          order_item_id: string;
          owner_id?: string;
          qty_taken: number;
        };
        Insert: {
          created_at?: string;
          finalized_lot?: boolean;
          id?: string;
          lot_id?: string | null;
          order_item_id: string;
          owner_id?: string;
          qty_taken: number;
        };
        Update: {
          created_at?: string;
          finalized_lot?: boolean;
          id?: string;
          lot_id?: string | null;
          order_item_id?: string;
          owner_id?: string;
          qty_taken?: number;
        };
        Relationships: [
          {
            foreignKeyName: "order_item_allocations_lot_id_fkey";
            columns: ["lot_id"];
            isOneToOne: false;
            referencedRelation: "lots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_item_allocations_order_item_id_fkey";
            columns: ["order_item_id"];
            isOneToOne: false;
            referencedRelation: "order_items";
            referencedColumns: ["id"];
          },
        ];
      };
      order_items: {
        Row: {
          created_at: string;
          id: string;
          kind: Database["public"]["Enums"]["kind_type"];
          line_total: number;
          order_id: string;
          owner_id?: string;
          requested_qty: number;
          size_label: string | null;
          species_id: string | null;
          unit_price: number;
        };
        Insert: {
          created_at?: string;
          id?: string;
          kind: Database["public"]["Enums"]["kind_type"];
          line_total?: number;
          order_id: string;
          owner_id?: string;
          requested_qty: number;
          size_label?: string | null;
          species_id?: string | null;
          unit_price?: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          kind?: Database["public"]["Enums"]["kind_type"];
          line_total?: number;
          order_id?: string;
          owner_id?: string;
          requested_qty?: number;
          size_label?: string | null;
          species_id?: string | null;
          unit_price?: number;
        };
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_species_id_fkey";
            columns: ["species_id"];
            isOneToOne: false;
            referencedRelation: "species";
            referencedColumns: ["id"];
          },
        ];
      };
      orders: {
        Row: {
          client_id: string | null;
          created_at: string;
          delivered_at: string | null;
          discount_pct: number;
          id: string;
          notes: string | null;
          owner_id?: string;
          status: Database["public"]["Enums"]["order_status"];
          subtotal_mxn: number;
          total_mxn: number;
        };
        Insert: {
          client_id?: string | null;
          created_at?: string;
          delivered_at?: string | null;
          discount_pct?: number;
          id?: string;
          notes?: string | null;
          owner_id?: string;
          status?: Database["public"]["Enums"]["order_status"];
          subtotal_mxn?: number;
          total_mxn?: number;
        };
        Update: {
          client_id?: string | null;
          created_at?: string;
          delivered_at?: string | null;
          discount_pct?: number;
          id?: string;
          notes?: string | null;
          owner_id?: string;
          status?: Database["public"]["Enums"]["order_status"];
          subtotal_mxn?: number;
          total_mxn?: number;
        };
        Relationships: [
          {
            foreignKeyName: "orders_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          ai_month_reset_at: string | null;
          ai_prompts_used_this_month: number;
          created_at: string;
          email: string | null;
          full_name: string | null;
          id: string;
          organization_id: string | null;
          preferred_theme: string | null;
          tier: Database["public"]["Enums"]["subscription_tier"];
          tier_renewed_at: string | null;
        };
        Insert: {
          ai_month_reset_at?: string | null;
          ai_prompts_used_this_month?: number;
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id: string;
          organization_id?: string | null;
          preferred_theme?: string | null;
          tier?: Database["public"]["Enums"]["subscription_tier"];
          tier_renewed_at?: string | null;
        };
        Update: {
          ai_month_reset_at?: string | null;
          ai_prompts_used_this_month?: number;
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id?: string;
          organization_id?: string | null;
          preferred_theme?: string | null;
          tier?: Database["public"]["Enums"]["subscription_tier"];
          tier_renewed_at?: string | null;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          id: string;
          organization_id: string | null;
          role: Database["public"]["Enums"]["app_role"];
          status: Database["public"]["Enums"]["membership_status"];
          status_changed_at: string | null;
          status_changed_by: string | null;
          user_id: string;
        };
        Insert: {
          id?: string;
          organization_id?: string | null;
          role: Database["public"]["Enums"]["app_role"];
          status?: Database["public"]["Enums"]["membership_status"];
          status_changed_at?: string | null;
          status_changed_by?: string | null;
          user_id: string;
        };
        Update: {
          id?: string;
          organization_id?: string | null;
          role?: Database["public"]["Enums"]["app_role"];
          status?: Database["public"]["Enums"]["membership_status"];
          status_changed_at?: string | null;
          status_changed_by?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      species: {
        Row: {
          created_at: string;
          id: string;
          kind: Database["public"]["Enums"]["kind_type"];
          name: string;
          owner_id?: string;
          size_rules: Json;
          unit_price_mxn: number | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          kind: Database["public"]["Enums"]["kind_type"];
          name: string;
          owner_id?: string;
          size_rules?: Json;
          unit_price_mxn?: number | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          kind?: Database["public"]["Enums"]["kind_type"];
          name?: string;
          owner_id?: string;
          size_rules?: Json;
          unit_price_mxn?: number | null;
        };
        Relationships: [];
      };
      warehouse_cleaning: {
        Row: {
          cost: number | null;
          created_at: string;
          expiry_date: string | null;
          id: string;
          name: string;
          owner_id?: string;
          quantity: number;
          unit: string | null;
        };
        Insert: {
          cost?: number | null;
          created_at?: string;
          expiry_date?: string | null;
          id?: string;
          name: string;
          owner_id?: string;
          quantity?: number;
          unit?: string | null;
        };
        Update: {
          cost?: number | null;
          created_at?: string;
          expiry_date?: string | null;
          id?: string;
          name?: string;
          owner_id?: string;
          quantity?: number;
          unit?: string | null;
        };
        Relationships: [];
      };
      warehouse_food: {
        Row: {
          audited_at: string | null;
          created_at: string;
          id: string;
          min_stock_grams: number | null;
          name: string;
          notes: string | null;
          owner_id?: string;
          quantity_grams: number;
          unit_cost: number | null;
        };
        Insert: {
          audited_at?: string | null;
          created_at?: string;
          id?: string;
          min_stock_grams?: number | null;
          name: string;
          notes?: string | null;
          owner_id?: string;
          quantity_grams?: number;
          unit_cost?: number | null;
        };
        Update: {
          audited_at?: string | null;
          created_at?: string;
          id?: string;
          min_stock_grams?: number | null;
          name?: string;
          notes?: string | null;
          owner_id?: string;
          quantity_grams?: number;
          unit_cost?: number | null;
        };
        Relationships: [];
      };
      warehouse_packaging: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          owner_id?: string;
          unit_cost: number | null;
          units: number;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          owner_id?: string;
          unit_cost?: number | null;
          units?: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          owner_id?: string;
          unit_cost?: number | null;
          units?: number;
        };
        Relationships: [];
      };
      warehouse_purchases: {
        Row: {
          converted_to_lot_id: string | null;
          created_at: string;
          id: string;
          invoice_id: string | null;
          kind: Database["public"]["Enums"]["kind_type"];
          line_id: string | null;
          mass_grams: number | null;
          notes: string | null;
          owner_id?: string;
          population: number | null;
          provider: string | null;
          species_id: string | null;
          total_cost: number | null;
        };
        Insert: {
          converted_to_lot_id?: string | null;
          created_at?: string;
          id?: string;
          invoice_id?: string | null;
          kind: Database["public"]["Enums"]["kind_type"];
          line_id?: string | null;
          mass_grams?: number | null;
          notes?: string | null;
          owner_id?: string;
          population?: number | null;
          provider?: string | null;
          species_id?: string | null;
          total_cost?: number | null;
        };
        Update: {
          converted_to_lot_id?: string | null;
          created_at?: string;
          id?: string;
          invoice_id?: string | null;
          kind?: Database["public"]["Enums"]["kind_type"];
          line_id?: string | null;
          mass_grams?: number | null;
          notes?: string | null;
          owner_id?: string;
          population?: number | null;
          provider?: string | null;
          species_id?: string | null;
          total_cost?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "warehouse_purchases_converted_to_lot_id_fkey";
            columns: ["converted_to_lot_id"];
            isOneToOne: false;
            referencedRelation: "lots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "warehouse_purchases_line_id_fkey";
            columns: ["line_id"];
            isOneToOne: false;
            referencedRelation: "genetic_lines";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "warehouse_purchases_species_id_fkey";
            columns: ["species_id"];
            isOneToOne: false;
            referencedRelation: "species";
            referencedColumns: ["id"];
          },
        ];
      };
      warehouse_tools: {
        Row: {
          condition: Database["public"]["Enums"]["tool_condition"];
          created_at: string;
          id: string;
          name: string;
          notes: string | null;
          owner_id?: string;
          value: number | null;
        };
        Insert: {
          condition?: Database["public"]["Enums"]["tool_condition"];
          created_at?: string;
          id?: string;
          name: string;
          notes?: string | null;
          owner_id?: string;
          value?: number | null;
        };
        Update: {
          condition?: Database["public"]["Enums"]["tool_condition"];
          created_at?: string;
          id?: string;
          name?: string;
          notes?: string | null;
          owner_id?: string;
          value?: number | null;
        };
        Relationships: [];
      };
    };
    Views: {
      lot_production_costs: {
        Row: {
          organization_id: string | null;
          lot_id: string | null;
          lot_code: string | null;
          kind: Database["public"]["Enums"]["kind_type"] | null;
          status: string | null;
          total_cost: number | null;
          substrate_cost: number | null;
          cost_per_animal: number | null;
          cost_per_gram: number | null;
        };
        Relationships: [];
      };
      lot_financial_summary: {
        Row: {
          organization_id: string | null;
          lot_id: string | null;
          lot_code: string | null;
          kind: Database["public"]["Enums"]["kind_type"] | null;
          status: string | null;
          current_population: number | null;
          current_mass: number | null;
          sold_quantity: number | null;
          revenue: number | null;
          dead_population: number | null;
          dead_mass: number | null;
          total_cost: number | null;
          purchase_cost: number | null;
          feed_cost: number | null;
          substrate_cost: number | null;
          labor_cost: number | null;
          veterinary_cost: number | null;
          utilities_cost: number | null;
          depreciation_cost: number | null;
          produced_quantity: number | null;
          cost_per_unit: number | null;
          recognized_cogs: number | null;
          inventory_value: number | null;
          mortality_loss: number | null;
          gross_margin: number | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      register_lot_cost_tx: {
        Args: {
          _request_id: string;
          _category: string;
          _description: string;
          _total_amount: number;
          _allocations: Json;
          _allocation_basis?: string;
          _incurred_at?: string;
          _quantity?: number | null;
          _unit?: string | null;
          _unit_cost?: number | null;
          _vendor?: string | null;
          _reference_type?: string | null;
          _reference_id?: string | null;
          _notes?: string | null;
          _evidence_url?: string | null;
        };
        Returns: Json;
      };
      consume_feed_tx: {
        Args: {
          _request_id: string;
          _food_id: string;
          _allocations: Json;
          _event_at?: string;
          _observations?: string | null;
        };
        Returns: Json;
      };
      post_asset_depreciation_tx: {
        Args: {
          _request_id: string;
          _asset_id: string;
          _period_start: string;
          _allocations: Json;
          _allocation_basis?: string;
        };
        Returns: Json;
      };
      create_box_type_tx: {
        Args: { _request_id: string; _data: Json };
        Returns: Json;
      };
      create_box_from_type_tx: {
        Args: {
          _request_id: string;
          _kind: Database["public"]["Enums"]["kind_type"];
          _box_type_id: string;
          _code: string;
          _location: string;
          _capacity?: number | null;
          _acquired_at?: string | null;
          _notes?: string | null;
        };
        Returns: Json;
      };
      register_substrate_stock_tx: {
        Args: {
          _request_id: string;
          _substrate_id: string;
          _grams: number;
          _total_cost: number;
          _event_at?: string;
          _notes?: string | null;
          _reference_type?: string | null;
          _reference_id?: string | null;
        };
        Returns: Json;
      };
      consume_box_substrate_tx: {
        Args: {
          _request_id: string;
          _box_id: string;
          _substrate_id: string;
          _event_type: string;
          _grams?: number | null;
          _lot_id?: string | null;
          _event_at?: string;
          _observations?: string | null;
          _evidence_url?: string | null;
        };
        Returns: Json;
      };
      accept_invite: {
        Args: { _token: string };
        Returns: Json;
      };
      register_mortality: {
        Args: {
          _lot_id: string;
          _males?: number;
          _females?: number;
          _unsexed?: number;
          _notes?: string | null;
        };
        Returns: string;
      };
      register_mortality_tx: {
        Args: {
          _request_id: string;
          _lot_id: string;
          _males?: number;
          _females?: number;
          _unsexed?: number;
          _mass_grams?: number;
          _notes?: string | null;
        };
        Returns: Json;
      };
      register_mortality_event_tx: {
        Args: {
          _request_id: string;
          _lot_id: string;
          _males?: number;
          _females?: number;
          _unsexed?: number;
          _mass_grams?: number;
          _event_at?: string;
          _cause?: string | null;
          _observations?: string | null;
          _evidence_url?: string | null;
          _reference_type?: string | null;
          _reference_id?: string | null;
        };
        Returns: Json;
      };
      register_birth: {
        Args: {
          _box_id: string;
          _species_id: string;
          _line_id?: string | null;
          _lot_code?: string | null;
          _unsexed?: number;
          _males?: number;
          _females?: number;
          _notes?: string | null;
        };
        Returns: string;
      };
      register_insect_birth: {
        Args: {
          _box_id: string;
          _species_id: string;
          _line_id?: string | null;
          _lot_code?: string | null;
          _mass_grams?: number;
          _notes?: string | null;
        };
        Returns: string;
      };
      register_birth_tx: {
        Args: {
          _request_id: string;
          _kind: Database["public"]["Enums"]["kind_type"];
          _box_id: string;
          _species_id: string;
          _line_id?: string | null;
          _lot_code?: string | null;
          _unsexed?: number;
          _males?: number;
          _females?: number;
          _mass_grams?: number;
          _notes?: string | null;
        };
        Returns: Json;
      };
      register_birth_event_tx: {
        Args: {
          _request_id: string;
          _kind: Database["public"]["Enums"]["kind_type"];
          _box_id: string;
          _species_id: string;
          _line_id?: string | null;
          _parent_lot_id?: string | null;
          _reproduction_event_id?: string | null;
          _lot_code?: string | null;
          _unsexed?: number;
          _males?: number;
          _females?: number;
          _mass_grams?: number;
          _event_at?: string;
          _observations?: string | null;
          _evidence_url?: string | null;
          _reference_type?: string | null;
          _reference_id?: string | null;
        };
        Returns: Json;
      };
      move_lot: {
        Args: { _lot_id: string; _destination_box_id: string; _reason?: string | null };
        Returns: undefined;
      };
      move_lot_tx: {
        Args: {
          _request_id: string;
          _lot_id: string;
          _destination_box_id: string;
          _reason?: string | null;
        };
        Returns: Json;
      };
      move_lot_event_tx: {
        Args: {
          _request_id: string;
          _lot_id: string;
          _destination_box_id: string;
          _event_at?: string;
          _cause?: string | null;
          _observations?: string | null;
          _evidence_url?: string | null;
          _reference_type?: string | null;
          _reference_id?: string | null;
        };
        Returns: Json;
      };
      split_lot: {
        Args: { _source_lot_id: string; _sublots: Json; _reason?: string | null };
        Returns: Json;
      };
      split_lot_tx: {
        Args: {
          _request_id: string;
          _source_lot_id: string;
          _sublots: Json;
          _reason?: string | null;
        };
        Returns: Json;
      };
      create_sale_tx: {
        Args: {
          _request_id: string;
          _client_id: string;
          _items: Json;
          _discount_pct?: number;
          _notes?: string | null;
          _delivered_at?: string | null;
          _consume_inventory?: boolean;
        };
        Returns: Json;
      };
      create_purchase_tx: {
        Args: {
          _request_id: string;
          _kind: Database["public"]["Enums"]["kind_type"];
          _species_id: string;
          _line_id?: string | null;
          _population?: number | null;
          _males?: number;
          _females?: number;
          _mass_grams?: number | null;
          _total_cost?: number;
          _invoice_id?: string | null;
          _provider?: string | null;
          _notes?: string | null;
          _create_lot?: boolean;
          _box_id?: string | null;
          _lot_code?: string | null;
          _started_at?: string;
        };
        Returns: Json;
      };
      merge_lots_tx: {
        Args: {
          _request_id: string;
          _source_lot_ids: string[];
          _destination_box_id: string;
          _lot_code?: string | null;
          _reason?: string | null;
        };
        Returns: Json;
      };
      acknowledge_alert: {
        Args: { _alert_id: string };
        Returns: undefined;
      };
      resolve_alert: {
        Args: { _alert_id: string; _reason?: string | null };
        Returns: undefined;
      };
      export_organization_data: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      get_my_org_id: {
        Args: Record<PropertyKey, never>;
        Returns: string | null;
      };
      is_org_member: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      is_org_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      is_org_operator: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      get_org_tier: {
        Args: Record<PropertyKey, never>;
        Returns: Database["public"]["Enums"]["subscription_tier"];
      };
      consume_ai_prompt: { Args: { _uid: string }; Returns: undefined };
      fifo_consume_insects: {
        Args: {
          _grams: number;
          _species: string;
          _size?: string;
        };
        Returns: Json;
      };
      fifo_consume_rodents: {
        Args: { _qty: number; _species: string; _size?: string };
        Returns: Json;
      };
      get_tier: {
        Args: { _user_id: string };
        Returns: Database["public"]["Enums"]["subscription_tier"];
      };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      tier_rank: {
        Args: { _t: Database["public"]["Enums"]["subscription_tier"] };
        Returns: number;
      };
      manage_team_member: {
        Args: {
          _target_user_id: string;
          _action: string;
          _new_role?: Database["public"]["Enums"]["app_role"] | null;
        };
        Returns: undefined;
      };
      create_organization_invite: {
        Args: {
          _email: string;
          _role?: Database["public"]["Enums"]["app_role"];
        };
        Returns: Json;
      };
      adjust_lot: {
        Args: {
          _lot_id: string;
          _males?: number | null;
          _females?: number | null;
          _unsexed?: number | null;
          _mass_grams?: number | null;
          _tags?: string[] | null;
          _notes: string;
        };
        Returns: undefined;
      };
      adjust_lot_event_tx: {
        Args: {
          _request_id: string;
          _lot_id: string;
          _males?: number | null;
          _females?: number | null;
          _unsexed?: number | null;
          _mass_grams?: number | null;
          _tags?: string[] | null;
          _reason?: string | null;
          _event_at?: string;
          _evidence_url?: string | null;
          _reference_type?: string | null;
          _reference_id?: string | null;
        };
        Returns: Json;
      };
      register_reproduction_event_tx: {
        Args: {
          _request_id: string;
          _event_type: Database["public"]["Enums"]["reproduction_event_type"];
          _primary_lot_id: string;
          _secondary_lot_id?: string | null;
          _offspring_lot_id?: string | null;
          _event_at?: string;
          _quantity?: number | null;
          _mass_grams?: number | null;
          _cause?: string | null;
          _observations?: string | null;
          _evidence_url?: string | null;
          _reference_type?: string | null;
          _reference_id?: string | null;
        };
        Returns: Json;
      };
      get_fifo_signatures: {
        Args: Record<PropertyKey, never>;
        Returns: Array<{ proname: string; identity_args: string }>;
      };
      get_security_function_signatures: {
        Args: Record<PropertyKey, never>;
        Returns: Array<{ proname: string; identity_args: string }>;
      };
    };
    Enums: {
      membership_status: "active" | "invited" | "revoked" | "suspended";
      invite_status: "pending" | "accepted" | "revoked" | "expired";
      inventory_event_type:
        | "opening"
        | "birth_in"
        | "purchase_in"
        | "transfer_in"
        | "transfer_out"
        | "mortality_out"
        | "sale_out"
        | "adjustment"
        | "inventory_in"
        | "inventory_out";
      reproduction_event_type:
        | "mating"
        | "separation"
        | "gestation_confirmed"
        | "birth"
        | "hatch"
        | "failed";
      lot_event_type:
        | "mortality"
        | "birth"
        | "move"
        | "split"
        | "finalize"
        | "adjustment"
        | "merge";
      audit_action:
        | "role_change"
        | "invite_sent"
        | "invite_accepted"
        | "invite_revoked"
        | "member_suspended"
        | "member_reinstated"
        | "member_revoked"
        | "mortality"
        | "birth"
        | "lot_move"
        | "lot_split"
        | "lot_finalize"
        | "sale_created"
        | "sale_delivered"
        | "inventory_adjustment"
        | "record_created"
        | "record_updated"
        | "record_deleted"
        | "lot_merge"
        | "fifo_allocation"
        | "configuration_change"
        | "purchase_created";
      ai_action_status: "pending" | "confirmed" | "cancelled";
      alert_priority: "high" | "medium";
      app_role: "admin" | "operator";
      client_profile:
        | "particular"
        | "pimvs"
        | "uma"
        | "veterinaria"
        | "comercializadora"
        | "uso_propio";
      kind_type: "rodent" | "insect";
      lot_status: "active" | "finalizado";
      lot_type: "breeder" | "engorda" | "birth";
      order_status: "preparando" | "historial";
      subscription_tier: "bronze" | "silver" | "gold" | "diamond";
      tool_condition: "nuevo" | "bueno" | "regular" | "malo" | "reparacion";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      ai_action_status: ["pending", "confirmed", "cancelled"],
      alert_priority: ["high", "medium"],
      app_role: ["admin", "operator"],
      client_profile: [
        "particular",
        "pimvs",
        "uma",
        "veterinaria",
        "comercializadora",
        "uso_propio",
      ],
      kind_type: ["rodent", "insect"],
      lot_status: ["active", "finalizado"],
      lot_type: ["breeder", "engorda", "birth"],
      order_status: ["preparando", "historial"],
      subscription_tier: ["bronze", "silver", "gold", "diamond"],
      tool_condition: ["nuevo", "bueno", "regular", "malo", "reparacion"],
    },
  },
} as const;
