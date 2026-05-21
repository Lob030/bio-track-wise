export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ai_conversations: {
        Row: {
          created_at: string
          id: string
          owner_id: string
          title: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          owner_id: string
          title?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          owner_id?: string
          title?: string | null
        }
        Relationships: []
      }
      ai_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          owner_id: string
          pending_action_id: string | null
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          owner_id: string
          pending_action_id?: string | null
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          owner_id?: string
          pending_action_id?: string | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_pending_actions: {
        Row: {
          action_type: string
          conversation_id: string | null
          created_at: string
          id: string
          owner_id: string
          payload: Json
          resolved_at: string | null
          status: Database["public"]["Enums"]["ai_action_status"]
          summary: string
        }
        Insert: {
          action_type: string
          conversation_id?: string | null
          created_at?: string
          id?: string
          owner_id: string
          payload: Json
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["ai_action_status"]
          summary: string
        }
        Update: {
          action_type?: string
          conversation_id?: string | null
          created_at?: string
          id?: string
          owner_id?: string
          payload?: Json
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["ai_action_status"]
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_pending_actions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      alert_rules: {
        Row: {
          created_at: string
          enabled: boolean
          frequency_days: number
          id: string
          last_triggered_at: string | null
          lot_id: string | null
          lot_type: Database["public"]["Enums"]["lot_type"] | null
          metric: string
          operator: string
          owner_id: string
          priority: Database["public"]["Enums"]["alert_priority"]
          scope: string
          template_text: string
          threshold: number
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          frequency_days?: number
          id?: string
          last_triggered_at?: string | null
          lot_id?: string | null
          lot_type?: Database["public"]["Enums"]["lot_type"] | null
          metric: string
          operator: string
          owner_id: string
          priority?: Database["public"]["Enums"]["alert_priority"]
          scope?: string
          template_text?: string
          threshold: number
        }
        Update: {
          created_at?: string
          enabled?: boolean
          frequency_days?: number
          id?: string
          last_triggered_at?: string | null
          lot_id?: string | null
          lot_type?: Database["public"]["Enums"]["lot_type"] | null
          metric?: string
          operator?: string
          owner_id?: string
          priority?: Database["public"]["Enums"]["alert_priority"]
          scope?: string
          template_text?: string
          threshold?: number
        }
        Relationships: [
          {
            foreignKeyName: "alert_rules_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "lots"
            referencedColumns: ["id"]
          },
        ]
      }
      alerts: {
        Row: {
          acknowledged: boolean
          created_at: string
          id: string
          lot_id: string | null
          message: string
          owner_id: string
          priority: Database["public"]["Enums"]["alert_priority"]
          rule_id: string | null
        }
        Insert: {
          acknowledged?: boolean
          created_at?: string
          id?: string
          lot_id?: string | null
          message: string
          owner_id: string
          priority?: Database["public"]["Enums"]["alert_priority"]
          rule_id?: string | null
        }
        Update: {
          acknowledged?: boolean
          created_at?: string
          id?: string
          lot_id?: string | null
          message?: string
          owner_id?: string
          priority?: Database["public"]["Enums"]["alert_priority"]
          rule_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alerts_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "alert_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      boxes: {
        Row: {
          capacity: number | null
          code: string
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["kind_type"]
          location: string | null
          owner_id: string
        }
        Insert: {
          capacity?: number | null
          code: string
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["kind_type"]
          location?: string | null
          owner_id: string
        }
        Update: {
          capacity?: number | null
          code?: string
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["kind_type"]
          location?: string | null
          owner_id?: string
        }
        Relationships: []
      }
      clients: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
          phone: string
          profile: Database["public"]["Enums"]["client_profile"]
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id: string
          phone: string
          profile?: Database["public"]["Enums"]["client_profile"]
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          phone?: string
          profile?: Database["public"]["Enums"]["client_profile"]
        }
        Relationships: []
      }
      genetic_lines: {
        Row: {
          created_at: string
          id: string
          name: string
          notes: string | null
          owner_id: string
          species_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          owner_id: string
          species_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          owner_id?: string
          species_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "genetic_lines_species_id_fkey"
            columns: ["species_id"]
            isOneToOne: false
            referencedRelation: "species"
            referencedColumns: ["id"]
          },
        ]
      }
      lots: {
        Row: {
          box_id: string | null
          created_at: string
          females: number | null
          finalized_at: string | null
          id: string
          kind: Database["public"]["Enums"]["kind_type"]
          line_id: string | null
          lot_code: string | null
          lot_type: Database["public"]["Enums"]["lot_type"]
          males: number | null
          mass_grams: number | null
          notes: string | null
          owner_id: string
          parent_lot_id: string | null
          provider_purchase_id: string | null
          species_id: string | null
          started_at: string
          status: Database["public"]["Enums"]["lot_status"]
          unsexed: number | null
        }
        Insert: {
          box_id?: string | null
          created_at?: string
          females?: number | null
          finalized_at?: string | null
          id?: string
          kind: Database["public"]["Enums"]["kind_type"]
          line_id?: string | null
          lot_code?: string | null
          lot_type?: Database["public"]["Enums"]["lot_type"]
          males?: number | null
          mass_grams?: number | null
          notes?: string | null
          owner_id: string
          parent_lot_id?: string | null
          provider_purchase_id?: string | null
          species_id?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["lot_status"]
          unsexed?: number | null
        }
        Update: {
          box_id?: string | null
          created_at?: string
          females?: number | null
          finalized_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["kind_type"]
          line_id?: string | null
          lot_code?: string | null
          lot_type?: Database["public"]["Enums"]["lot_type"]
          males?: number | null
          mass_grams?: number | null
          notes?: string | null
          owner_id?: string
          parent_lot_id?: string | null
          provider_purchase_id?: string | null
          species_id?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["lot_status"]
          unsexed?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "lots_box_id_fkey"
            columns: ["box_id"]
            isOneToOne: false
            referencedRelation: "boxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lots_line_id_fkey"
            columns: ["line_id"]
            isOneToOne: false
            referencedRelation: "genetic_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lots_parent_lot_id_fkey"
            columns: ["parent_lot_id"]
            isOneToOne: false
            referencedRelation: "lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lots_species_id_fkey"
            columns: ["species_id"]
            isOneToOne: false
            referencedRelation: "species"
            referencedColumns: ["id"]
          },
        ]
      }
      order_item_allocations: {
        Row: {
          created_at: string
          finalized_lot: boolean
          id: string
          lot_id: string | null
          order_item_id: string
          owner_id: string
          qty_taken: number
        }
        Insert: {
          created_at?: string
          finalized_lot?: boolean
          id?: string
          lot_id?: string | null
          order_item_id: string
          owner_id: string
          qty_taken: number
        }
        Update: {
          created_at?: string
          finalized_lot?: boolean
          id?: string
          lot_id?: string | null
          order_item_id?: string
          owner_id?: string
          qty_taken?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_item_allocations_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_item_allocations_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["kind_type"]
          line_total: number
          order_id: string
          owner_id: string
          requested_qty: number
          size_label: string | null
          species_id: string | null
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["kind_type"]
          line_total?: number
          order_id: string
          owner_id: string
          requested_qty: number
          size_label?: string | null
          species_id?: string | null
          unit_price?: number
        }
        Update: {
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["kind_type"]
          line_total?: number
          order_id?: string
          owner_id?: string
          requested_qty?: number
          size_label?: string | null
          species_id?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_species_id_fkey"
            columns: ["species_id"]
            isOneToOne: false
            referencedRelation: "species"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          client_id: string | null
          created_at: string
          delivered_at: string | null
          discount_pct: number
          id: string
          notes: string | null
          owner_id: string
          status: Database["public"]["Enums"]["order_status"]
          subtotal_mxn: number
          total_mxn: number
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          delivered_at?: string | null
          discount_pct?: number
          id?: string
          notes?: string | null
          owner_id: string
          status?: Database["public"]["Enums"]["order_status"]
          subtotal_mxn?: number
          total_mxn?: number
        }
        Update: {
          client_id?: string | null
          created_at?: string
          delivered_at?: string | null
          discount_pct?: number
          id?: string
          notes?: string | null
          owner_id?: string
          status?: Database["public"]["Enums"]["order_status"]
          subtotal_mxn?: number
          total_mxn?: number
        }
        Relationships: [
          {
            foreignKeyName: "orders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          ai_month_reset_at: string | null
          ai_prompts_used_this_month: number
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          tier: Database["public"]["Enums"]["subscription_tier"]
          tier_renewed_at: string | null
        }
        Insert: {
          ai_month_reset_at?: string | null
          ai_prompts_used_this_month?: number
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          tier?: Database["public"]["Enums"]["subscription_tier"]
          tier_renewed_at?: string | null
        }
        Update: {
          ai_month_reset_at?: string | null
          ai_prompts_used_this_month?: number
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          tier?: Database["public"]["Enums"]["subscription_tier"]
          tier_renewed_at?: string | null
        }
        Relationships: []
      }
      species: {
        Row: {
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["kind_type"]
          name: string
          owner_id: string
          size_rules: Json
        }
        Insert: {
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["kind_type"]
          name: string
          owner_id: string
          size_rules?: Json
        }
        Update: {
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["kind_type"]
          name?: string
          owner_id?: string
          size_rules?: Json
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      warehouse_cleaning: {
        Row: {
          cost: number | null
          created_at: string
          expiry_date: string | null
          id: string
          name: string
          owner_id: string
          quantity: number
          unit: string | null
        }
        Insert: {
          cost?: number | null
          created_at?: string
          expiry_date?: string | null
          id?: string
          name: string
          owner_id: string
          quantity?: number
          unit?: string | null
        }
        Update: {
          cost?: number | null
          created_at?: string
          expiry_date?: string | null
          id?: string
          name?: string
          owner_id?: string
          quantity?: number
          unit?: string | null
        }
        Relationships: []
      }
      warehouse_food: {
        Row: {
          audited_at: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          owner_id: string
          quantity_grams: number
          unit_cost: number | null
        }
        Insert: {
          audited_at?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          owner_id: string
          quantity_grams?: number
          unit_cost?: number | null
        }
        Update: {
          audited_at?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          owner_id?: string
          quantity_grams?: number
          unit_cost?: number | null
        }
        Relationships: []
      }
      warehouse_packaging: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
          unit_cost: number | null
          units: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id: string
          unit_cost?: number | null
          units?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          unit_cost?: number | null
          units?: number
        }
        Relationships: []
      }
      warehouse_purchases: {
        Row: {
          converted_to_lot_id: string | null
          created_at: string
          id: string
          invoice_id: string | null
          kind: Database["public"]["Enums"]["kind_type"]
          line_id: string | null
          mass_grams: number | null
          notes: string | null
          owner_id: string
          population: number | null
          provider: string | null
          species_id: string | null
          total_cost: number | null
        }
        Insert: {
          converted_to_lot_id?: string | null
          created_at?: string
          id?: string
          invoice_id?: string | null
          kind: Database["public"]["Enums"]["kind_type"]
          line_id?: string | null
          mass_grams?: number | null
          notes?: string | null
          owner_id: string
          population?: number | null
          provider?: string | null
          species_id?: string | null
          total_cost?: number | null
        }
        Update: {
          converted_to_lot_id?: string | null
          created_at?: string
          id?: string
          invoice_id?: string | null
          kind?: Database["public"]["Enums"]["kind_type"]
          line_id?: string | null
          mass_grams?: number | null
          notes?: string | null
          owner_id?: string
          population?: number | null
          provider?: string | null
          species_id?: string | null
          total_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_purchases_converted_to_lot_id_fkey"
            columns: ["converted_to_lot_id"]
            isOneToOne: false
            referencedRelation: "lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_purchases_line_id_fkey"
            columns: ["line_id"]
            isOneToOne: false
            referencedRelation: "genetic_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_purchases_species_id_fkey"
            columns: ["species_id"]
            isOneToOne: false
            referencedRelation: "species"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_tools: {
        Row: {
          condition: Database["public"]["Enums"]["tool_condition"]
          created_at: string
          id: string
          name: string
          notes: string | null
          owner_id: string
          value: number | null
        }
        Insert: {
          condition?: Database["public"]["Enums"]["tool_condition"]
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          owner_id: string
          value?: number | null
        }
        Update: {
          condition?: Database["public"]["Enums"]["tool_condition"]
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          owner_id?: string
          value?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      fifo_consume_insects: {
        Args: {
          _grams: number
          _owner: string
          _size: string
          _species: string
        }
        Returns: Json
      }
      fifo_consume_rodents: {
        Args: { _owner: string; _qty: number; _size: string; _species: string }
        Returns: Json
      }
      get_tier: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["subscription_tier"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      tier_rank: {
        Args: { _t: Database["public"]["Enums"]["subscription_tier"] }
        Returns: number
      }
    }
    Enums: {
      ai_action_status: "pending" | "confirmed" | "cancelled"
      alert_priority: "high" | "medium"
      app_role: "admin" | "user"
      client_profile:
        | "particular"
        | "pimvs"
        | "uma"
        | "veterinaria"
        | "comercializadora"
        | "uso_propio"
      kind_type: "rodent" | "insect"
      lot_status: "active" | "finalizado"
      lot_type: "breeder" | "engorda" | "birth"
      order_status: "preparando" | "historial"
      subscription_tier: "bronze" | "silver" | "gold" | "diamond"
      tool_condition: "nuevo" | "bueno" | "regular" | "malo" | "reparacion"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      ai_action_status: ["pending", "confirmed", "cancelled"],
      alert_priority: ["high", "medium"],
      app_role: ["admin", "user"],
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
} as const
