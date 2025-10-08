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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      artwork_files: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          artwork_url: string
          company_id: string
          created_at: string
          filename: string
          id: string
          is_approved: boolean
          notes: string | null
          preview_url: string | null
          sku: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          artwork_url: string
          company_id: string
          created_at?: string
          filename: string
          id?: string
          is_approved?: boolean
          notes?: string | null
          preview_url?: string | null
          sku: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          artwork_url?: string
          company_id?: string
          created_at?: string
          filename?: string
          id?: string
          is_approved?: boolean
          notes?: string | null
          preview_url?: string | null
          sku?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "artwork_files_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      customer_addresses: {
        Row: {
          address_type: string
          city: string
          company_id: string
          created_at: string
          customer_email: string | null
          customer_name: string
          customer_phone: string | null
          id: string
          is_default: boolean
          name: string
          state: string
          street: string
          updated_at: string
          zip: string
        }
        Insert: {
          address_type?: string
          city: string
          company_id: string
          created_at?: string
          customer_email?: string | null
          customer_name: string
          customer_phone?: string | null
          id?: string
          is_default?: boolean
          name: string
          state: string
          street: string
          updated_at?: string
          zip: string
        }
        Update: {
          address_type?: string
          city?: string
          company_id?: string
          created_at?: string
          customer_email?: string | null
          customer_name?: string
          customer_phone?: string | null
          id?: string
          is_default?: boolean
          name?: string
          state?: string
          street?: string
          updated_at?: string
          zip?: string
        }
        Relationships: []
      }
      inventory: {
        Row: {
          available: number
          company_id: string
          created_at: string
          id: string
          in_production: number
          product_id: string
          redline: number
          sku: string
          state: string
          updated_at: string
          upload_batch_id: string | null
          upload_timestamp: string | null
        }
        Insert: {
          available?: number
          company_id: string
          created_at?: string
          id?: string
          in_production?: number
          product_id: string
          redline?: number
          sku: string
          state: string
          updated_at?: string
          upload_batch_id?: string | null
          upload_timestamp?: string | null
        }
        Update: {
          available?: number
          company_id?: string
          created_at?: string
          id?: string
          in_production?: number
          product_id?: string
          redline?: number
          sku?: string
          state?: string
          updated_at?: string
          upload_batch_id?: string | null
          upload_timestamp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          description: string | null
          id: string
          item_id: string | null
          name: string
          order_id: string
          product_id: string
          quantity: number
          sku: string
          total: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          item_id?: string | null
          name: string
          order_id: string
          product_id: string
          quantity: number
          sku: string
          total: number
          unit_price: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          item_id?: string | null
          name?: string
          order_id?: string
          product_id?: string
          quantity?: number
          sku?: string
          total?: number
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
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      order_notes: {
        Row: {
          author_name: string
          created_at: string
          id: string
          note_text: string
          order_id: string
          user_id: string
        }
        Insert: {
          author_name: string
          created_at?: string
          id?: string
          note_text: string
          order_id: string
          user_id: string
        }
        Update: {
          author_name?: string
          created_at?: string
          id?: string
          note_text?: string
          order_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_notes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_production_updates: {
        Row: {
          created_at: string
          id: string
          order_id: string
          update_text: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          update_text: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          update_text?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_production_updates_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          billing_city: string | null
          billing_name: string | null
          billing_state: string | null
          billing_street: string | null
          billing_zip: string | null
          company_id: string
          created_at: string
          customer_email: string | null
          customer_name: string
          customer_phone: string | null
          due_date: string | null
          id: string
          memo: string | null
          order_date: string
          order_finalized: boolean
          order_finalized_at: string | null
          order_finalized_by: string | null
          order_number: string
          po_number: string | null
          shipping_city: string
          shipping_name: string
          shipping_state: string
          shipping_street: string
          shipping_zip: string
          status: string
          subtotal: number
          tax: number
          terms: string | null
          total: number
          tracking_number: string | null
          updated_at: string
          vibe_processed: boolean
          vibe_processed_at: string | null
          vibe_processed_by: string | null
        }
        Insert: {
          billing_city?: string | null
          billing_name?: string | null
          billing_state?: string | null
          billing_street?: string | null
          billing_zip?: string | null
          company_id: string
          created_at?: string
          customer_email?: string | null
          customer_name: string
          customer_phone?: string | null
          due_date?: string | null
          id?: string
          memo?: string | null
          order_date?: string
          order_finalized?: boolean
          order_finalized_at?: string | null
          order_finalized_by?: string | null
          order_number: string
          po_number?: string | null
          shipping_city: string
          shipping_name: string
          shipping_state: string
          shipping_street: string
          shipping_zip: string
          status?: string
          subtotal?: number
          tax?: number
          terms?: string | null
          total?: number
          tracking_number?: string | null
          updated_at?: string
          vibe_processed?: boolean
          vibe_processed_at?: string | null
          vibe_processed_by?: string | null
        }
        Update: {
          billing_city?: string | null
          billing_name?: string | null
          billing_state?: string | null
          billing_street?: string | null
          billing_zip?: string | null
          company_id?: string
          created_at?: string
          customer_email?: string | null
          customer_name?: string
          customer_phone?: string | null
          due_date?: string | null
          id?: string
          memo?: string | null
          order_date?: string
          order_finalized?: boolean
          order_finalized_at?: string | null
          order_finalized_by?: string | null
          order_number?: string
          po_number?: string | null
          shipping_city?: string
          shipping_name?: string
          shipping_state?: string
          shipping_street?: string
          shipping_zip?: string
          status?: string
          subtotal?: number
          tax?: number
          terms?: string | null
          total?: number
          tracking_number?: string | null
          updated_at?: string
          vibe_processed?: boolean
          vibe_processed_at?: string | null
          vibe_processed_by?: string | null
        }
        Relationships: []
      }
      po_submissions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          approved_cost: number | null
          approved_lead_time_days: number | null
          approved_pricing: number | null
          company_id: string
          created_at: string
          customer_id: string | null
          extracted_data: Json | null
          id: string
          internal_notes: string | null
          original_filename: string
          pdf_url: string
          rejection_reason: string | null
          status: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          approved_cost?: number | null
          approved_lead_time_days?: number | null
          approved_pricing?: number | null
          company_id: string
          created_at?: string
          customer_id?: string | null
          extracted_data?: Json | null
          id?: string
          internal_notes?: string | null
          original_filename: string
          pdf_url: string
          rejection_reason?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          approved_cost?: number | null
          approved_lead_time_days?: number | null
          approved_pricing?: number | null
          company_id?: string
          created_at?: string
          customer_id?: string | null
          extracted_data?: Json | null
          id?: string
          internal_notes?: string | null
          original_filename?: string
          pdf_url?: string
          rejection_reason?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "po_submissions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      product_states: {
        Row: {
          artwork_status: string
          created_at: string
          id: string
          product_id: string
          specs: string | null
          state: string
          status: string
          updated_at: string
        }
        Insert: {
          artwork_status?: string
          created_at?: string
          id?: string
          product_id: string
          specs?: string | null
          state: string
          status?: string
          updated_at?: string
        }
        Update: {
          artwork_status?: string
          created_at?: string
          id?: string
          product_id?: string
          specs?: string | null
          state?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_states_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          cases_per_pallet: number | null
          category: string
          company_id: string
          cost: number | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          item_id: string | null
          name: string
          product_type: string | null
          state: string | null
          units_per_case: number | null
          updated_at: string
          volume_per_case: number | null
          weight_per_case: number | null
        }
        Insert: {
          cases_per_pallet?: number | null
          category: string
          company_id: string
          cost?: number | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          item_id?: string | null
          name: string
          product_type?: string | null
          state?: string | null
          units_per_case?: number | null
          updated_at?: string
          volume_per_case?: number | null
          weight_per_case?: number | null
        }
        Update: {
          cases_per_pallet?: number | null
          category?: string
          company_id?: string
          cost?: number | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          item_id?: string | null
          name?: string
          product_type?: string | null
          state?: string | null
          units_per_case?: number | null
          updated_at?: string
          volume_per_case?: number | null
          weight_per_case?: number | null
        }
        Relationships: []
      }
      rejected_artwork_files: {
        Row: {
          artwork_url: string
          company_id: string
          created_at: string
          filename: string
          id: string
          notes: string | null
          original_artwork_id: string
          original_created_at: string
          preview_url: string | null
          rejected_at: string
          rejected_by: string | null
          rejection_reason: string
          sku: string
        }
        Insert: {
          artwork_url: string
          company_id: string
          created_at?: string
          filename: string
          id?: string
          notes?: string | null
          original_artwork_id: string
          original_created_at: string
          preview_url?: string | null
          rejected_at?: string
          rejected_by?: string | null
          rejection_reason: string
          sku: string
        }
        Update: {
          artwork_url?: string
          company_id?: string
          created_at?: string
          filename?: string
          id?: string
          notes?: string | null
          original_artwork_id?: string
          original_created_at?: string
          preview_url?: string | null
          rejected_at?: string
          rejected_by?: string | null
          rejection_reason?: string
          sku?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          company_id: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          company_id: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          company_id?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_company: {
        Args: { _user_id: string }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      user_in_company: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "customer"
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
      app_role: ["admin", "customer"],
    },
  },
} as const
