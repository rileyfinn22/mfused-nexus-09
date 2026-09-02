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
      _blanket_backfill_audit: {
        Row: {
          affected_line_count: number | null
          company_name: string | null
          id: string
          invoice_id: string | null
          invoice_number: string | null
          order_id: string | null
          order_number: string | null
          ran_at: string
        }
        Insert: {
          affected_line_count?: number | null
          company_name?: string | null
          id?: string
          invoice_id?: string | null
          invoice_number?: string | null
          order_id?: string | null
          order_number?: string | null
          ran_at?: string
        }
        Update: {
          affected_line_count?: number | null
          company_name?: string | null
          id?: string
          invoice_id?: string | null
          invoice_number?: string | null
          order_id?: string | null
          order_number?: string | null
          ran_at?: string
        }
        Relationships: []
      }
      artwork_files: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          artwork_type: string
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
          artwork_type?: string
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
          artwork_type?: string
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
      chat_channel_members: {
        Row: {
          channel_id: string
          id: string
          joined_at: string
          last_seen_at: string | null
          user_id: string
        }
        Insert: {
          channel_id: string
          id?: string
          joined_at?: string
          last_seen_at?: string | null
          user_id: string
        }
        Update: {
          channel_id?: string
          id?: string
          joined_at?: string
          last_seen_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_channel_members_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "chat_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_channels: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_dm: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_dm?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_dm?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      chat_message_attachments: {
        Row: {
          created_at: string
          file_name: string
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
          message_id: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          message_id: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          message_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_message_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          channel_id: string
          content: string
          created_at: string
          id: string
          is_edited: boolean
          parent_message_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          channel_id: string
          content: string
          created_at?: string
          id?: string
          is_edited?: boolean
          parent_message_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          channel_id?: string
          content?: string
          created_at?: string
          id?: string
          is_edited?: boolean
          parent_message_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "chat_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_parent_message_id_fkey"
            columns: ["parent_message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_profiles: {
        Row: {
          avatar_color: string
          created_at: string
          display_name: string
          id: string
          user_id: string
        }
        Insert: {
          avatar_color?: string
          created_at?: string
          display_name: string
          id?: string
          user_id: string
        }
        Update: {
          avatar_color?: string
          created_at?: string
          display_name?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      companies: {
        Row: {
          billing_city: string | null
          billing_email: string | null
          billing_name: string | null
          billing_state: string | null
          billing_street: string | null
          billing_street2: string | null
          billing_zip: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          payment_terms: string | null
          phone: string | null
          quickbooks_id: string | null
          shipping_city: string | null
          shipping_name: string | null
          shipping_state: string | null
          shipping_street: string | null
          shipping_street2: string | null
          shipping_zip: string | null
          updated_at: string
        }
        Insert: {
          billing_city?: string | null
          billing_email?: string | null
          billing_name?: string | null
          billing_state?: string | null
          billing_street?: string | null
          billing_street2?: string | null
          billing_zip?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          payment_terms?: string | null
          phone?: string | null
          quickbooks_id?: string | null
          shipping_city?: string | null
          shipping_name?: string | null
          shipping_state?: string | null
          shipping_street?: string | null
          shipping_street2?: string | null
          shipping_zip?: string | null
          updated_at?: string
        }
        Update: {
          billing_city?: string | null
          billing_email?: string | null
          billing_name?: string | null
          billing_state?: string | null
          billing_street?: string | null
          billing_street2?: string | null
          billing_zip?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          payment_terms?: string | null
          phone?: string | null
          quickbooks_id?: string | null
          shipping_city?: string | null
          shipping_name?: string | null
          shipping_state?: string | null
          shipping_street?: string | null
          shipping_street2?: string | null
          shipping_zip?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      company_contacts: {
        Row: {
          city: string | null
          company_id: string
          created_at: string
          email: string | null
          id: string
          is_primary: boolean
          name: string
          notes: string | null
          phone: string | null
          role: string | null
          state: string | null
          street: string | null
          updated_at: string
          zip: string | null
        }
        Insert: {
          city?: string | null
          company_id: string
          created_at?: string
          email?: string | null
          id?: string
          is_primary?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          role?: string | null
          state?: string | null
          street?: string | null
          updated_at?: string
          zip?: string | null
        }
        Update: {
          city?: string | null
          company_id?: string
          created_at?: string
          email?: string | null
          id?: string
          is_primary?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          role?: string | null
          state?: string | null
          street?: string | null
          updated_at?: string
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_emails: {
        Row: {
          company_id: string
          created_at: string
          email: string
          id: string
          is_primary: boolean | null
          label: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          email: string
          id?: string
          is_primary?: boolean | null
          label?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          email?: string
          id?: string
          is_primary?: boolean | null
          label?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_emails_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_invitations: {
        Row: {
          accepted_at: string | null
          company_id: string
          created_at: string
          email: string
          expires_at: string
          id: string
          invitation_token: string
          invited_by: string | null
          role: Database["public"]["Enums"]["app_role"]
          status: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          company_id: string
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invitation_token?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          company_id?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invitation_token?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_invitations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_settings: {
        Row: {
          address_city: string | null
          address_state: string | null
          address_street: string | null
          address_zip: string | null
          company_id: string
          created_at: string
          id: string
          logo_url: string | null
          notification_preferences: Json | null
          primary_contact_email: string | null
          primary_contact_name: string | null
          primary_contact_phone: string | null
          session_timeout_minutes: number | null
          updated_at: string
        }
        Insert: {
          address_city?: string | null
          address_state?: string | null
          address_street?: string | null
          address_zip?: string | null
          company_id: string
          created_at?: string
          id?: string
          logo_url?: string | null
          notification_preferences?: Json | null
          primary_contact_email?: string | null
          primary_contact_name?: string | null
          primary_contact_phone?: string | null
          session_timeout_minutes?: number | null
          updated_at?: string
        }
        Update: {
          address_city?: string | null
          address_state?: string | null
          address_street?: string | null
          address_zip?: string | null
          company_id?: string
          created_at?: string
          id?: string
          logo_url?: string | null
          notification_preferences?: Json | null
          primary_contact_email?: string | null
          primary_contact_name?: string | null
          primary_contact_phone?: string | null
          session_timeout_minutes?: number | null
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
      design_saves: {
        Row: {
          bleed_inches: number
          canvas_data: Json | null
          company_id: string | null
          created_at: string
          created_by: string | null
          height_inches: number
          id: string
          material: string | null
          print_file_url: string | null
          source_pdf_path: string | null
          template_id: string | null
          template_name: string
          thumbnail_url: string | null
          updated_at: string
          width_inches: number
        }
        Insert: {
          bleed_inches?: number
          canvas_data?: Json | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          height_inches?: number
          id?: string
          material?: string | null
          print_file_url?: string | null
          source_pdf_path?: string | null
          template_id?: string | null
          template_name: string
          thumbnail_url?: string | null
          updated_at?: string
          width_inches?: number
        }
        Update: {
          bleed_inches?: number
          canvas_data?: Json | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          height_inches?: number
          id?: string
          material?: string | null
          print_file_url?: string | null
          source_pdf_path?: string | null
          template_id?: string | null
          template_name?: string
          thumbnail_url?: string | null
          updated_at?: string
          width_inches?: number
        }
        Relationships: [
          {
            foreignKeyName: "design_saves_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_saves_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "print_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_deposits: {
        Row: {
          amount: number
          confirmation_status: string
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          dispute_note: string | null
          id: string
          notes: string | null
          payment_date: string
        }
        Insert: {
          amount?: number
          confirmation_status?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          dispute_note?: string | null
          id?: string
          notes?: string | null
          payment_date?: string
        }
        Update: {
          amount?: number
          confirmation_status?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          dispute_note?: string | null
          id?: string
          notes?: string | null
          payment_date?: string
        }
        Relationships: []
      }
      finance_repayments: {
        Row: {
          amount: number
          batch_reference: string | null
          confirmation_status: string
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          created_by: string | null
          dispute_note: string | null
          financed_invoice_id: string
          id: string
          notes: string | null
          payment_batch_id: string | null
          payment_date: string
          payment_method: string | null
          reference_number: string | null
          source: string | null
        }
        Insert: {
          amount?: number
          batch_reference?: string | null
          confirmation_status?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          dispute_note?: string | null
          financed_invoice_id: string
          id?: string
          notes?: string | null
          payment_batch_id?: string | null
          payment_date?: string
          payment_method?: string | null
          reference_number?: string | null
          source?: string | null
        }
        Update: {
          amount?: number
          batch_reference?: string | null
          confirmation_status?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          dispute_note?: string | null
          financed_invoice_id?: string
          id?: string
          notes?: string | null
          payment_batch_id?: string | null
          payment_date?: string
          payment_method?: string | null
          reference_number?: string | null
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_repayments_financed_invoice_id_fkey"
            columns: ["financed_invoice_id"]
            isOneToOne: false
            referencedRelation: "financed_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_share_links: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          is_active: boolean
          label: string | null
          token: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
          token?: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
          token?: string
        }
        Relationships: []
      }
      financed_invoice_documents: {
        Row: {
          created_at: string
          created_by: string | null
          file_name: string
          file_path: string
          file_size: number | null
          file_type: string | null
          financed_invoice_id: string
          id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          file_type?: string | null
          financed_invoice_id: string
          id?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          file_type?: string | null
          financed_invoice_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financed_invoice_documents_financed_invoice_id_fkey"
            columns: ["financed_invoice_id"]
            isOneToOne: false
            referencedRelation: "financed_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      financed_invoice_edit_log: {
        Row: {
          changed_at: string
          changed_by: string | null
          changes: Json
          financed_invoice_id: string
          id: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          changes?: Json
          financed_invoice_id: string
          id?: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          changes?: Json
          financed_invoice_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financed_invoice_edit_log_financed_invoice_id_fkey"
            columns: ["financed_invoice_id"]
            isOneToOne: false
            referencedRelation: "financed_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      financed_invoices: {
        Row: {
          carrier: string | null
          created_at: string
          created_by_role: string | null
          description: string | null
          exchange_rate: number
          finance_status: string
          financed_amount: number
          financed_amount_rmb: number
          financed_date: string
          id: string
          invoice_id: string | null
          invoice_number: string | null
          notes: string | null
          paid_back_amount: number
          paid_back_date: string | null
          shipment_notes: string | null
          status: string
          tracking_number: string | null
          tracking_url: string | null
          updated_at: string
          vendor_po_id: string | null
        }
        Insert: {
          carrier?: string | null
          created_at?: string
          created_by_role?: string | null
          description?: string | null
          exchange_rate?: number
          finance_status?: string
          financed_amount?: number
          financed_amount_rmb?: number
          financed_date?: string
          id?: string
          invoice_id?: string | null
          invoice_number?: string | null
          notes?: string | null
          paid_back_amount?: number
          paid_back_date?: string | null
          shipment_notes?: string | null
          status?: string
          tracking_number?: string | null
          tracking_url?: string | null
          updated_at?: string
          vendor_po_id?: string | null
        }
        Update: {
          carrier?: string | null
          created_at?: string
          created_by_role?: string | null
          description?: string | null
          exchange_rate?: number
          finance_status?: string
          financed_amount?: number
          financed_amount_rmb?: number
          financed_date?: string
          id?: string
          invoice_id?: string | null
          invoice_number?: string | null
          notes?: string | null
          paid_back_amount?: number
          paid_back_date?: string | null
          shipment_notes?: string | null
          status?: string
          tracking_number?: string | null
          tracking_url?: string | null
          updated_at?: string
          vendor_po_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "financed_invoices_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoice_receivables"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "financed_invoices_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoice_subtotal_reconciliation"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "financed_invoices_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financed_invoices_vendor_po_id_fkey"
            columns: ["vendor_po_id"]
            isOneToOne: false
            referencedRelation: "vendor_pos"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory: {
        Row: {
          available: number
          company_id: string
          created_at: string
          id: string
          in_production: number
          invoice_number: string | null
          order_id: string | null
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
          invoice_number?: string | null
          order_id?: string | null
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
          invoice_number?: string | null
          order_id?: string | null
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
            foreignKeyName: "inventory_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_allocations: {
        Row: {
          allocated_at: string
          allocated_by: string | null
          created_at: string
          id: string
          inventory_id: string | null
          invoice_id: string
          order_item_id: string
          quantity_allocated: number
          status: string
        }
        Insert: {
          allocated_at?: string
          allocated_by?: string | null
          created_at?: string
          id?: string
          inventory_id?: string | null
          invoice_id: string
          order_item_id: string
          quantity_allocated: number
          status?: string
        }
        Update: {
          allocated_at?: string
          allocated_by?: string | null
          created_at?: string
          id?: string
          inventory_id?: string | null
          invoice_id?: string
          order_item_id?: string
          quantity_allocated?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_allocations_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_allocations_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoice_receivables"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "inventory_allocations_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoice_subtotal_reconciliation"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "inventory_allocations_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_allocations_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_audit_log: {
        Row: {
          action: string
          changed_at: string
          changed_by: string | null
          changes: Json | null
          id: string
          invoice_id: string
          notes: string | null
        }
        Insert: {
          action: string
          changed_at?: string
          changed_by?: string | null
          changes?: Json | null
          id?: string
          invoice_id: string
          notes?: string | null
        }
        Update: {
          action?: string
          changed_at?: string
          changed_by?: string | null
          changes?: Json | null
          id?: string
          invoice_id?: string
          notes?: string | null
        }
        Relationships: []
      }
      invoice_packing_lists: {
        Row: {
          created_at: string
          created_by: string | null
          file_name: string
          file_path: string
          file_size: number | null
          file_type: string | null
          id: string
          invoice_id: string
          notes: string | null
          source: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          invoice_id: string
          notes?: string | null
          source?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          invoice_id?: string
          notes?: string | null
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_packing_lists_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoice_receivables"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "invoice_packing_lists_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoice_subtotal_reconciliation"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "invoice_packing_lists_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          billed_percentage: number | null
          billing_city: string | null
          billing_name: string | null
          billing_state: string | null
          billing_street: string | null
          billing_zip: string | null
          blanket_closed_at: string | null
          blanket_closed_by: string | null
          company_id: string
          created_at: string
          created_by: string | null
          customer_po_number: string | null
          deleted_at: string | null
          description: string | null
          due_date: string | null
          id: string
          invoice_date: string
          invoice_number: string
          invoice_type: string | null
          notes: string | null
          order_id: string
          parent_invoice_id: string | null
          qb_project_id: string | null
          quickbooks_id: string | null
          quickbooks_payment_link: string | null
          quickbooks_sync_status: string | null
          quickbooks_synced_at: string | null
          quote_id: string | null
          shipment_number: number | null
          shipped_date: string | null
          shipping_city: string | null
          shipping_cost: number | null
          shipping_method: string | null
          shipping_name: string | null
          shipping_note: string | null
          shipping_state: string | null
          shipping_street: string | null
          shipping_zip: string | null
          status: string
          subtotal: number
          tax: number
          total: number
          total_paid: number | null
          tracking_carrier: string | null
          tracking_number: string | null
          tracking_url: string | null
          updated_at: string
        }
        Insert: {
          billed_percentage?: number | null
          billing_city?: string | null
          billing_name?: string | null
          billing_state?: string | null
          billing_street?: string | null
          billing_zip?: string | null
          blanket_closed_at?: string | null
          blanket_closed_by?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          customer_po_number?: string | null
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          invoice_date?: string
          invoice_number: string
          invoice_type?: string | null
          notes?: string | null
          order_id: string
          parent_invoice_id?: string | null
          qb_project_id?: string | null
          quickbooks_id?: string | null
          quickbooks_payment_link?: string | null
          quickbooks_sync_status?: string | null
          quickbooks_synced_at?: string | null
          quote_id?: string | null
          shipment_number?: number | null
          shipped_date?: string | null
          shipping_city?: string | null
          shipping_cost?: number | null
          shipping_method?: string | null
          shipping_name?: string | null
          shipping_note?: string | null
          shipping_state?: string | null
          shipping_street?: string | null
          shipping_zip?: string | null
          status?: string
          subtotal?: number
          tax?: number
          total?: number
          total_paid?: number | null
          tracking_carrier?: string | null
          tracking_number?: string | null
          tracking_url?: string | null
          updated_at?: string
        }
        Update: {
          billed_percentage?: number | null
          billing_city?: string | null
          billing_name?: string | null
          billing_state?: string | null
          billing_street?: string | null
          billing_zip?: string | null
          blanket_closed_at?: string | null
          blanket_closed_by?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          customer_po_number?: string | null
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          invoice_date?: string
          invoice_number?: string
          invoice_type?: string | null
          notes?: string | null
          order_id?: string
          parent_invoice_id?: string | null
          qb_project_id?: string | null
          quickbooks_id?: string | null
          quickbooks_payment_link?: string | null
          quickbooks_sync_status?: string | null
          quickbooks_synced_at?: string | null
          quote_id?: string | null
          shipment_number?: number | null
          shipped_date?: string | null
          shipping_city?: string | null
          shipping_cost?: number | null
          shipping_method?: string | null
          shipping_name?: string | null
          shipping_note?: string | null
          shipping_state?: string | null
          shipping_street?: string | null
          shipping_zip?: string | null
          status?: string
          subtotal?: number
          tax?: number
          total?: number
          total_paid?: number | null
          tracking_carrier?: string | null
          tracking_number?: string | null
          tracking_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_parent_invoice_id_fkey"
            columns: ["parent_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoice_receivables"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "invoices_parent_invoice_id_fkey"
            columns: ["parent_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoice_subtotal_reconciliation"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "invoices_parent_invoice_id_fkey"
            columns: ["parent_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          company_id: string
          created_at: string
          id: string
          link: string | null
          message: string
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          link?: string | null
          message: string
          read?: boolean
          title: string
          type?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          link?: string | null
          message?: string
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      order_attachments: {
        Row: {
          created_at: string
          description: string | null
          file_name: string
          file_path: string
          file_size: number | null
          file_type: string | null
          id: string
          order_id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          order_id: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          order_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_attachments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_item_costs: {
        Row: {
          order_item_id: string
          updated_at: string
          vendor_cost: number | null
          vendor_id: string | null
          vendor_po_number: string | null
        }
        Insert: {
          order_item_id: string
          updated_at?: string
          vendor_cost?: number | null
          vendor_id?: string | null
          vendor_po_number?: string | null
        }
        Update: {
          order_item_id?: string
          updated_at?: string
          vendor_cost?: number | null
          vendor_id?: string | null
          vendor_po_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_item_costs_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: true
            referencedRelation: "order_items"
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
          line_number: number | null
          name: string
          order_id: string
          product_id: string | null
          quantity: number
          shipped_quantity: number | null
          sku: string
          total: number
          unit_price: number
          vendor_cost: number | null
          vendor_id: string | null
          vendor_po_number: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          item_id?: string | null
          line_number?: number | null
          name: string
          order_id: string
          product_id?: string | null
          quantity: number
          shipped_quantity?: number | null
          sku: string
          total: number
          unit_price: number
          vendor_cost?: number | null
          vendor_id?: string | null
          vendor_po_number?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          item_id?: string | null
          line_number?: number | null
          name?: string
          order_id?: string
          product_id?: string | null
          quantity?: number
          shipped_quantity?: number | null
          sku?: string
          total?: number
          unit_price?: number
          vendor_cost?: number | null
          vendor_id?: string | null
          vendor_po_number?: string | null
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
          {
            foreignKeyName: "order_items_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
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
          art_approved_manually: boolean
          art_approved_manually_at: string | null
          art_approved_manually_by: string | null
          billing_city: string | null
          billing_name: string | null
          billing_state: string | null
          billing_street: string | null
          billing_zip: string | null
          company_id: string
          created_at: string
          created_by: string | null
          customer_email: string | null
          customer_name: string
          customer_phone: string | null
          delay_reason: string | null
          deleted_at: string | null
          description: string | null
          due_date: string | null
          estimated_delivery_date: string | null
          fulfillment_vendor_id: string | null
          id: string
          is_delayed: boolean | null
          memo: string | null
          order_date: string
          order_finalized: boolean
          order_finalized_at: string | null
          order_finalized_by: string | null
          order_number: string
          order_type: string
          parent_order_id: string | null
          po_number: string | null
          po_pdf_path: string | null
          production_notes: string | null
          production_progress: number | null
          qb_estimate_id: string | null
          qb_project_id: string | null
          quote_id: string | null
          shipping_city: string
          shipping_cost: number | null
          shipping_method: string | null
          shipping_name: string
          shipping_state: string
          shipping_street: string
          shipping_zip: string
          status: string
          subtotal: number
          tax: number
          terms: string | null
          total: number
          tracking_carrier: string | null
          tracking_number: string | null
          tracking_url: string | null
          updated_at: string
          vibe_approved: boolean
          vibe_approved_at: string | null
          vibe_approved_by: string | null
          vibe_processed: boolean
          vibe_processed_at: string | null
          vibe_processed_by: string | null
          vibenotes: Json | null
        }
        Insert: {
          art_approved_manually?: boolean
          art_approved_manually_at?: string | null
          art_approved_manually_by?: string | null
          billing_city?: string | null
          billing_name?: string | null
          billing_state?: string | null
          billing_street?: string | null
          billing_zip?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          customer_email?: string | null
          customer_name: string
          customer_phone?: string | null
          delay_reason?: string | null
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          estimated_delivery_date?: string | null
          fulfillment_vendor_id?: string | null
          id?: string
          is_delayed?: boolean | null
          memo?: string | null
          order_date?: string
          order_finalized?: boolean
          order_finalized_at?: string | null
          order_finalized_by?: string | null
          order_number: string
          order_type?: string
          parent_order_id?: string | null
          po_number?: string | null
          po_pdf_path?: string | null
          production_notes?: string | null
          production_progress?: number | null
          qb_estimate_id?: string | null
          qb_project_id?: string | null
          quote_id?: string | null
          shipping_city: string
          shipping_cost?: number | null
          shipping_method?: string | null
          shipping_name: string
          shipping_state: string
          shipping_street: string
          shipping_zip: string
          status?: string
          subtotal?: number
          tax?: number
          terms?: string | null
          total?: number
          tracking_carrier?: string | null
          tracking_number?: string | null
          tracking_url?: string | null
          updated_at?: string
          vibe_approved?: boolean
          vibe_approved_at?: string | null
          vibe_approved_by?: string | null
          vibe_processed?: boolean
          vibe_processed_at?: string | null
          vibe_processed_by?: string | null
          vibenotes?: Json | null
        }
        Update: {
          art_approved_manually?: boolean
          art_approved_manually_at?: string | null
          art_approved_manually_by?: string | null
          billing_city?: string | null
          billing_name?: string | null
          billing_state?: string | null
          billing_street?: string | null
          billing_zip?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          customer_email?: string | null
          customer_name?: string
          customer_phone?: string | null
          delay_reason?: string | null
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          estimated_delivery_date?: string | null
          fulfillment_vendor_id?: string | null
          id?: string
          is_delayed?: boolean | null
          memo?: string | null
          order_date?: string
          order_finalized?: boolean
          order_finalized_at?: string | null
          order_finalized_by?: string | null
          order_number?: string
          order_type?: string
          parent_order_id?: string | null
          po_number?: string | null
          po_pdf_path?: string | null
          production_notes?: string | null
          production_progress?: number | null
          qb_estimate_id?: string | null
          qb_project_id?: string | null
          quote_id?: string | null
          shipping_city?: string
          shipping_cost?: number | null
          shipping_method?: string | null
          shipping_name?: string
          shipping_state?: string
          shipping_street?: string
          shipping_zip?: string
          status?: string
          subtotal?: number
          tax?: number
          terms?: string | null
          total?: number
          tracking_carrier?: string | null
          tracking_number?: string | null
          tracking_url?: string | null
          updated_at?: string
          vibe_approved?: boolean
          vibe_approved_at?: string | null
          vibe_approved_by?: string | null
          vibe_processed?: boolean
          vibe_processed_at?: string | null
          vibe_processed_by?: string | null
          vibenotes?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_fulfillment_vendor_id_fkey"
            columns: ["fulfillment_vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_parent_order_id_fkey"
            columns: ["parent_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          invoice_id: string
          notes: string | null
          payment_date: string
          payment_method: string
          quickbooks_id: string | null
          quickbooks_sync_status: string | null
          quickbooks_synced_at: string | null
          reference_number: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_id: string
          notes?: string | null
          payment_date?: string
          payment_method?: string
          quickbooks_id?: string | null
          quickbooks_sync_status?: string | null
          quickbooks_synced_at?: string | null
          reference_number?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: string
          quickbooks_id?: string | null
          quickbooks_sync_status?: string | null
          quickbooks_synced_at?: string | null
          reference_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoice_receivables"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoice_subtotal_reconciliation"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
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
      print_orders: {
        Row: {
          canvas_data: Json | null
          company_id: string | null
          created_at: string
          created_by: string | null
          id: string
          material: string | null
          order_id: string | null
          price_per_unit: number | null
          print_file_url: string | null
          print_template_id: string | null
          quantity: number
          quoted_at: string | null
          quoted_by: string | null
          quoted_price: number | null
          status: string
          template_name: string
          thumbnail_url: string | null
          total: number | null
          workshop_order_id: string | null
        }
        Insert: {
          canvas_data?: Json | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          material?: string | null
          order_id?: string | null
          price_per_unit?: number | null
          print_file_url?: string | null
          print_template_id?: string | null
          quantity?: number
          quoted_at?: string | null
          quoted_by?: string | null
          quoted_price?: number | null
          status?: string
          template_name: string
          thumbnail_url?: string | null
          total?: number | null
          workshop_order_id?: string | null
        }
        Update: {
          canvas_data?: Json | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          material?: string | null
          order_id?: string | null
          price_per_unit?: number | null
          print_file_url?: string | null
          print_template_id?: string | null
          quantity?: number
          quoted_at?: string | null
          quoted_by?: string | null
          quoted_price?: number | null
          status?: string
          template_name?: string
          thumbnail_url?: string | null
          total?: number | null
          workshop_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "print_orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_orders_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_orders_print_template_id_fkey"
            columns: ["print_template_id"]
            isOneToOne: false
            referencedRelation: "print_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_orders_workshop_order_id_fkey"
            columns: ["workshop_order_id"]
            isOneToOne: false
            referencedRelation: "workshop_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      print_presets: {
        Row: {
          bleed_inches: number | null
          created_at: string | null
          depth_inches: number | null
          dieline_data: Json | null
          height_inches: number
          id: string
          is_active: boolean | null
          name: string
          panel_zones: Json | null
          product_type: string
          sort_order: number | null
          width_inches: number
        }
        Insert: {
          bleed_inches?: number | null
          created_at?: string | null
          depth_inches?: number | null
          dieline_data?: Json | null
          height_inches: number
          id?: string
          is_active?: boolean | null
          name: string
          panel_zones?: Json | null
          product_type?: string
          sort_order?: number | null
          width_inches: number
        }
        Update: {
          bleed_inches?: number | null
          created_at?: string | null
          depth_inches?: number | null
          dieline_data?: Json | null
          height_inches?: number
          id?: string
          is_active?: boolean | null
          name?: string
          panel_zones?: Json | null
          product_type?: string
          sort_order?: number | null
          width_inches?: number
        }
        Relationships: []
      }
      print_pricing_tiers: {
        Row: {
          created_at: string
          description: string | null
          id: string
          material: string | null
          max_quantity: number | null
          min_quantity: number
          product_type: string
          unit_cost: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          material?: string | null
          max_quantity?: number | null
          min_quantity?: number
          product_type?: string
          unit_cost?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          material?: string | null
          max_quantity?: number | null
          min_quantity?: number
          product_type?: string
          unit_cost?: number
          updated_at?: string
        }
        Relationships: []
      }
      print_template_companies: {
        Row: {
          company_id: string
          created_at: string
          id: string
          template_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          template_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "print_template_companies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_template_companies_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "print_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      print_templates: {
        Row: {
          bleed_inches: number
          canvas_data: Json | null
          company_id: string | null
          created_at: string
          created_by: string | null
          depth_inches: number | null
          description: string | null
          height_inches: number
          id: string
          is_global: boolean
          material_options: Json | null
          name: string
          panel_zones: Json | null
          preset_price_per_unit: number | null
          product_type: string
          source_pdf_path: string | null
          thumbnail_url: string | null
          updated_at: string
          width_inches: number
        }
        Insert: {
          bleed_inches?: number
          canvas_data?: Json | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          depth_inches?: number | null
          description?: string | null
          height_inches?: number
          id?: string
          is_global?: boolean
          material_options?: Json | null
          name: string
          panel_zones?: Json | null
          preset_price_per_unit?: number | null
          product_type?: string
          source_pdf_path?: string | null
          thumbnail_url?: string | null
          updated_at?: string
          width_inches?: number
        }
        Update: {
          bleed_inches?: number
          canvas_data?: Json | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          depth_inches?: number | null
          description?: string | null
          height_inches?: number
          id?: string
          is_global?: boolean
          material_options?: Json | null
          name?: string
          panel_zones?: Json | null
          preset_price_per_unit?: number | null
          product_type?: string
          source_pdf_path?: string | null
          thumbnail_url?: string | null
          updated_at?: string
          width_inches?: number
        }
        Relationships: [
          {
            foreignKeyName: "print_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      product_costs: {
        Row: {
          cost: number | null
          preferred_vendor_id: string | null
          product_id: string
          updated_at: string
        }
        Insert: {
          cost?: number | null
          preferred_vendor_id?: string | null
          product_id: string
          updated_at?: string
        }
        Update: {
          cost?: number | null
          preferred_vendor_id?: string | null
          product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_costs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
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
      product_template_costs: {
        Row: {
          cost: number | null
          template_id: string
          updated_at: string
        }
        Insert: {
          cost?: number | null
          template_id: string
          updated_at?: string
        }
        Update: {
          cost?: number | null
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_template_costs_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: true
            referencedRelation: "product_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      product_templates: {
        Row: {
          company_id: string | null
          cost: number | null
          created_at: string
          description: string | null
          id: string
          name: string
          price: number | null
          state: string | null
          thumbnail_url: string | null
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          cost?: number | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          price?: number | null
          state?: string | null
          thumbnail_url?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          cost?: number | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          price?: number | null
          state?: string | null
          thumbnail_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      production_comments: {
        Row: {
          author_name: string
          author_role: string
          created_at: string
          id: string
          message: string
          order_id: string
          user_id: string
        }
        Insert: {
          author_name: string
          author_role?: string
          created_at?: string
          id?: string
          message: string
          order_id: string
          user_id: string
        }
        Update: {
          author_name?: string
          author_role?: string
          created_at?: string
          id?: string
          message?: string
          order_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_comments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      production_stage_updates: {
        Row: {
          created_at: string
          file_name: string | null
          file_url: string | null
          id: string
          image_url: string | null
          is_published: boolean
          new_status: string | null
          note_text: string | null
          previous_status: string | null
          published_at: string | null
          published_image_url: string | null
          published_note_text: string | null
          stage_id: string
          update_type: string
          updated_by: string
        }
        Insert: {
          created_at?: string
          file_name?: string | null
          file_url?: string | null
          id?: string
          image_url?: string | null
          is_published?: boolean
          new_status?: string | null
          note_text?: string | null
          previous_status?: string | null
          published_at?: string | null
          published_image_url?: string | null
          published_note_text?: string | null
          stage_id: string
          update_type: string
          updated_by: string
        }
        Update: {
          created_at?: string
          file_name?: string | null
          file_url?: string | null
          id?: string
          image_url?: string | null
          is_published?: boolean
          new_status?: string | null
          note_text?: string | null
          previous_status?: string | null
          published_at?: string | null
          published_image_url?: string | null
          published_note_text?: string | null
          stage_id?: string
          update_type?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_stage_updates_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "production_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      production_stages: {
        Row: {
          created_at: string
          id: string
          internal_notes: string | null
          order_id: string
          published_at: string | null
          published_notes: string | null
          published_status: string
          published_substages: Json | null
          sequence_order: number
          stage_name: string
          status: string
          updated_at: string
          vendor_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          internal_notes?: string | null
          order_id: string
          published_at?: string | null
          published_notes?: string | null
          published_status?: string
          published_substages?: Json | null
          sequence_order: number
          stage_name: string
          status?: string
          updated_at?: string
          vendor_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          internal_notes?: string | null
          order_id?: string
          published_at?: string | null
          published_notes?: string | null
          published_status?: string
          published_substages?: Json | null
          sequence_order?: number
          stage_name?: string
          status?: string
          updated_at?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_stages_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_stages_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          cases_per_pallet: number | null
          company_id: string
          cost: number | null
          created_at: string
          customer_item_id: string | null
          description: string | null
          id: string
          image_url: string | null
          item_id: string | null
          name: string
          preferred_vendor_id: string | null
          price: number | null
          print_template_id: string | null
          product_type: string | null
          quickbooks_id: string | null
          quickbooks_sync_status: string | null
          quickbooks_synced_at: string | null
          state: string | null
          template_id: string | null
          units_per_case: number | null
          updated_at: string
          volume_per_case: number | null
          weight_per_case: number | null
        }
        Insert: {
          cases_per_pallet?: number | null
          company_id: string
          cost?: number | null
          created_at?: string
          customer_item_id?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          item_id?: string | null
          name: string
          preferred_vendor_id?: string | null
          price?: number | null
          print_template_id?: string | null
          product_type?: string | null
          quickbooks_id?: string | null
          quickbooks_sync_status?: string | null
          quickbooks_synced_at?: string | null
          state?: string | null
          template_id?: string | null
          units_per_case?: number | null
          updated_at?: string
          volume_per_case?: number | null
          weight_per_case?: number | null
        }
        Update: {
          cases_per_pallet?: number | null
          company_id?: string
          cost?: number | null
          created_at?: string
          customer_item_id?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          item_id?: string | null
          name?: string
          preferred_vendor_id?: string | null
          price?: number | null
          print_template_id?: string | null
          product_type?: string | null
          quickbooks_id?: string | null
          quickbooks_sync_status?: string | null
          quickbooks_synced_at?: string | null
          state?: string | null
          template_id?: string | null
          units_per_case?: number | null
          updated_at?: string
          volume_per_case?: number | null
          weight_per_case?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_preferred_vendor_id_fkey"
            columns: ["preferred_vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_print_template_id_fkey"
            columns: ["print_template_id"]
            isOneToOne: false
            referencedRelation: "print_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "product_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      project_documents: {
        Row: {
          created_at: string
          description: string | null
          file_name: string
          file_path: string
          file_size: number | null
          file_type: string | null
          id: string
          order_id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          order_id: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          order_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_documents_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      qb_import_requests: {
        Row: {
          company_id: string
          created_at: string
          data: Json | null
          id: string
          import_type: string
          imported_at: string | null
          notes: string | null
          qb_customer_id: string | null
          qb_customer_name: string | null
          qb_project_id: string | null
          qb_project_name: string
          requested_at: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          data?: Json | null
          id?: string
          import_type?: string
          imported_at?: string | null
          notes?: string | null
          qb_customer_id?: string | null
          qb_customer_name?: string | null
          qb_project_id?: string | null
          qb_project_name: string
          requested_at?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          data?: Json | null
          id?: string
          import_type?: string
          imported_at?: string | null
          notes?: string | null
          qb_customer_id?: string | null
          qb_customer_name?: string | null
          qb_project_id?: string | null
          qb_project_name?: string
          requested_at?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "qb_import_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      quickbooks_settings: {
        Row: {
          access_token: string | null
          access_token_secret_id: string | null
          company_id: string
          created_at: string
          id: string
          is_connected: boolean | null
          last_error: string | null
          last_error_at: string | null
          realm_id: string
          refresh_token: string | null
          refresh_token_expires_at: string | null
          refresh_token_secret_id: string | null
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          access_token_secret_id?: string | null
          company_id: string
          created_at?: string
          id?: string
          is_connected?: boolean | null
          last_error?: string | null
          last_error_at?: string | null
          realm_id: string
          refresh_token?: string | null
          refresh_token_expires_at?: string | null
          refresh_token_secret_id?: string | null
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          access_token_secret_id?: string | null
          company_id?: string
          created_at?: string
          id?: string
          is_connected?: boolean | null
          last_error?: string | null
          last_error_at?: string | null
          realm_id?: string
          refresh_token?: string | null
          refresh_token_expires_at?: string | null
          refresh_token_secret_id?: string | null
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quickbooks_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_documents: {
        Row: {
          created_at: string
          created_by: string | null
          file_name: string
          file_path: string
          file_size: number | null
          file_type: string | null
          id: string
          notes: string | null
          quote_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          notes?: string | null
          quote_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          notes?: string | null
          quote_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_documents_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_items: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          price_breaks: Json | null
          product_id: string | null
          quantity: number
          quote_id: string
          selected_tier: number | null
          sku: string
          state: string | null
          total: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          price_breaks?: Json | null
          product_id?: string | null
          quantity?: number
          quote_id: string
          selected_tier?: number | null
          sku: string
          state?: string | null
          total?: number
          unit_price?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          price_breaks?: Json | null
          product_id?: string | null
          quantity?: number
          quote_id?: string
          selected_tier?: number | null
          sku?: string
          state?: string | null
          total?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          customer_email: string | null
          customer_name: string
          customer_phone: string | null
          description: string | null
          id: string
          internal_notes: string | null
          lead_time: string | null
          parent_quote_id: string | null
          quote_number: string
          request_notes: string | null
          requested_by: string | null
          sent_at: string | null
          shipping_city: string | null
          shipping_cost: number
          shipping_method: string | null
          shipping_name: string | null
          shipping_state: string | null
          shipping_street: string | null
          shipping_zip: string | null
          status: string
          subtotal: number
          tax: number
          terms: string | null
          total: number
          updated_at: string
          uploaded_file_url: string | null
          uploaded_filename: string | null
          valid_until: string | null
          vendor_id: string | null
          vendor_quote_notes: string | null
          vendor_response_received_at: string | null
          vendor_sent_at: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_email?: string | null
          customer_name: string
          customer_phone?: string | null
          description?: string | null
          id?: string
          internal_notes?: string | null
          lead_time?: string | null
          parent_quote_id?: string | null
          quote_number: string
          request_notes?: string | null
          requested_by?: string | null
          sent_at?: string | null
          shipping_city?: string | null
          shipping_cost?: number
          shipping_method?: string | null
          shipping_name?: string | null
          shipping_state?: string | null
          shipping_street?: string | null
          shipping_zip?: string | null
          status?: string
          subtotal?: number
          tax?: number
          terms?: string | null
          total?: number
          updated_at?: string
          uploaded_file_url?: string | null
          uploaded_filename?: string | null
          valid_until?: string | null
          vendor_id?: string | null
          vendor_quote_notes?: string | null
          vendor_response_received_at?: string | null
          vendor_sent_at?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_email?: string | null
          customer_name?: string
          customer_phone?: string | null
          description?: string | null
          id?: string
          internal_notes?: string | null
          lead_time?: string | null
          parent_quote_id?: string | null
          quote_number?: string
          request_notes?: string | null
          requested_by?: string | null
          sent_at?: string | null
          shipping_city?: string | null
          shipping_cost?: number
          shipping_method?: string | null
          shipping_name?: string | null
          shipping_state?: string | null
          shipping_street?: string | null
          shipping_zip?: string | null
          status?: string
          subtotal?: number
          tax?: number
          terms?: string | null
          total?: number
          updated_at?: string
          uploaded_file_url?: string | null
          uploaded_filename?: string | null
          valid_until?: string | null
          vendor_id?: string | null
          vendor_quote_notes?: string | null
          vendor_response_received_at?: string | null
          vendor_sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_parent_quote_id_fkey"
            columns: ["parent_quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
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
      sent_email_history: {
        Row: {
          company_id: string
          created_at: string
          email: string
          id: string
          last_used_at: string
          use_count: number
        }
        Insert: {
          company_id: string
          created_at?: string
          email: string
          id?: string
          last_used_at?: string
          use_count?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          email?: string
          id?: string
          last_used_at?: string
          use_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "sent_email_history_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      shipment_legs: {
        Row: {
          actual_arrival: string | null
          attachment_name: string | null
          attachment_url: string | null
          bl_number: string | null
          carrier: string | null
          company_id: string
          created_at: string
          created_by: string | null
          ctns: number | null
          ddp_method: string | null
          destination: string | null
          estimated_arrival: string | null
          etd: string | null
          id: string
          label: string | null
          leg_number: number
          leg_type: string
          notes: string | null
          order_id: string
          origin: string | null
          pcs_per_ctn: number | null
          qty_pcs: number | null
          shipped_date: string | null
          status: string
          tracking_number: string | null
          tracking_url: string | null
          vessel_voyage: string | null
        }
        Insert: {
          actual_arrival?: string | null
          attachment_name?: string | null
          attachment_url?: string | null
          bl_number?: string | null
          carrier?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          ctns?: number | null
          ddp_method?: string | null
          destination?: string | null
          estimated_arrival?: string | null
          etd?: string | null
          id?: string
          label?: string | null
          leg_number?: number
          leg_type?: string
          notes?: string | null
          order_id: string
          origin?: string | null
          pcs_per_ctn?: number | null
          qty_pcs?: number | null
          shipped_date?: string | null
          status?: string
          tracking_number?: string | null
          tracking_url?: string | null
          vessel_voyage?: string | null
        }
        Update: {
          actual_arrival?: string | null
          attachment_name?: string | null
          attachment_url?: string | null
          bl_number?: string | null
          carrier?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          ctns?: number | null
          ddp_method?: string | null
          destination?: string | null
          estimated_arrival?: string | null
          etd?: string | null
          id?: string
          label?: string | null
          leg_number?: number
          leg_type?: string
          notes?: string | null
          order_id?: string
          origin?: string | null
          pcs_per_ctn?: number | null
          qty_pcs?: number | null
          shipped_date?: string | null
          status?: string
          tracking_number?: string | null
          tracking_url?: string | null
          vessel_voyage?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shipment_legs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_legs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      shipment_share_links: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          is_active: boolean
          label: string | null
          order_ids: string[]
          token: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
          order_ids: string[]
          token?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
          order_ids?: string[]
          token?: string
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
      vendor_bills: {
        Row: {
          bill_date: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          document_name: string | null
          document_path: string | null
          due_date: string | null
          freight: number
          id: string
          invoice_number: string | null
          notes: string | null
          parse_confidence: number | null
          source: string
          source_update_id: string | null
          status: string
          subtotal: number
          total: number
          updated_at: string
          vendor_po_id: string
        }
        Insert: {
          bill_date?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          document_name?: string | null
          document_path?: string | null
          due_date?: string | null
          freight?: number
          id?: string
          invoice_number?: string | null
          notes?: string | null
          parse_confidence?: number | null
          source?: string
          source_update_id?: string | null
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
          vendor_po_id: string
        }
        Update: {
          bill_date?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          document_name?: string | null
          document_path?: string | null
          due_date?: string | null
          freight?: number
          id?: string
          invoice_number?: string | null
          notes?: string | null
          parse_confidence?: number | null
          source?: string
          source_update_id?: string | null
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
          vendor_po_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_bills_vendor_po_id_fkey"
            columns: ["vendor_po_id"]
            isOneToOne: false
            referencedRelation: "vendor_pos"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_invitations: {
        Row: {
          accepted_at: string | null
          company_id: string
          created_at: string
          email: string
          expires_at: string
          id: string
          invitation_token: string
          invited_by: string
          status: string
          vendor_id: string
        }
        Insert: {
          accepted_at?: string | null
          company_id: string
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invitation_token?: string
          invited_by: string
          status?: string
          vendor_id: string
        }
        Update: {
          accepted_at?: string | null
          company_id?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invitation_token?: string
          invited_by?: string
          status?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_invitations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_invitations_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_po_items: {
        Row: {
          created_at: string
          description: string | null
          final_quantity: number | null
          final_unit_cost: number | null
          id: string
          is_adjustment: boolean | null
          item_type: string | null
          name: string
          order_item_id: string | null
          quantity: number
          shipped_quantity: number | null
          sku: string
          total: number
          unit_cost: number
          vendor_po_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          final_quantity?: number | null
          final_unit_cost?: number | null
          id?: string
          is_adjustment?: boolean | null
          item_type?: string | null
          name: string
          order_item_id?: string | null
          quantity: number
          shipped_quantity?: number | null
          sku: string
          total: number
          unit_cost: number
          vendor_po_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          final_quantity?: number | null
          final_unit_cost?: number | null
          id?: string
          is_adjustment?: boolean | null
          item_type?: string | null
          name?: string
          order_item_id?: string | null
          quantity?: number
          shipped_quantity?: number | null
          sku?: string
          total?: number
          unit_cost?: number
          vendor_po_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_po_items_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_po_items_vendor_po_id_fkey"
            columns: ["vendor_po_id"]
            isOneToOne: false
            referencedRelation: "vendor_pos"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_po_packing_lists: {
        Row: {
          created_at: string
          created_by: string | null
          file_name: string
          file_path: string
          file_size: number | null
          file_type: string | null
          id: string
          notes: string | null
          original_packing_list_id: string | null
          parsed_data: Json | null
          source: string | null
          vendor_po_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          notes?: string | null
          original_packing_list_id?: string | null
          parsed_data?: Json | null
          source?: string | null
          vendor_po_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          notes?: string | null
          original_packing_list_id?: string | null
          parsed_data?: Json | null
          source?: string | null
          vendor_po_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_po_packing_lists_original_packing_list_id_fkey"
            columns: ["original_packing_list_id"]
            isOneToOne: false
            referencedRelation: "vendor_po_packing_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_po_packing_lists_vendor_po_id_fkey"
            columns: ["vendor_po_id"]
            isOneToOne: false
            referencedRelation: "vendor_pos"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_po_payments: {
        Row: {
          amount: number
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          payment_date: string
          payment_method: string
          reference_number: string | null
          updated_at: string
          vendor_po_id: string
        }
        Insert: {
          amount: number
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: string
          reference_number?: string | null
          updated_at?: string
          vendor_po_id: string
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: string
          reference_number?: string | null
          updated_at?: string
          vendor_po_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_po_payments_vendor_po_id_fkey"
            columns: ["vendor_po_id"]
            isOneToOne: false
            referencedRelation: "vendor_pos"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_po_production_updates: {
        Row: {
          attachment_name: string | null
          attachment_url: string | null
          created_at: string
          created_by: string
          id: string
          kind: string
          note: string | null
          percent_at_time: number | null
          published_at: string | null
          vendor_po_id: string
        }
        Insert: {
          attachment_name?: string | null
          attachment_url?: string | null
          created_at?: string
          created_by?: string
          id?: string
          kind?: string
          note?: string | null
          percent_at_time?: number | null
          published_at?: string | null
          vendor_po_id: string
        }
        Update: {
          attachment_name?: string | null
          attachment_url?: string | null
          created_at?: string
          created_by?: string
          id?: string
          kind?: string
          note?: string | null
          percent_at_time?: number | null
          published_at?: string | null
          vendor_po_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_po_production_updates_vendor_po_id_fkey"
            columns: ["vendor_po_id"]
            isOneToOne: false
            referencedRelation: "vendor_pos"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_po_status_history: {
        Row: {
          changed_by: string | null
          committed_ship_date: string | null
          created_at: string
          delay_reason: string | null
          id: string
          is_delayed: boolean | null
          new_status: string | null
          note: string | null
          previous_status: string | null
          vendor_po_id: string
        }
        Insert: {
          changed_by?: string | null
          committed_ship_date?: string | null
          created_at?: string
          delay_reason?: string | null
          id?: string
          is_delayed?: boolean | null
          new_status?: string | null
          note?: string | null
          previous_status?: string | null
          vendor_po_id: string
        }
        Update: {
          changed_by?: string | null
          committed_ship_date?: string | null
          created_at?: string
          delay_reason?: string | null
          id?: string
          is_delayed?: boolean | null
          new_status?: string | null
          note?: string | null
          previous_status?: string | null
          vendor_po_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_po_status_history_vendor_po_id_fkey"
            columns: ["vendor_po_id"]
            isOneToOne: false
            referencedRelation: "vendor_pos"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_pos: {
        Row: {
          attachment_name: string | null
          attachment_url: string | null
          company_id: string
          completion_date: string | null
          created_at: string
          customer_company_id: string | null
          delay_reason: string | null
          delivery_date: string | null
          description: string | null
          expected_delivery_date: string | null
          expense_category: string | null
          final_total: number | null
          id: string
          is_delayed: boolean
          notes: string | null
          order_date: string
          order_id: string | null
          po_number: string
          po_type: string
          production_percent: number
          production_status: string
          production_status_updated_at: string | null
          production_status_updated_by: string | null
          quickbooks_id: string | null
          quickbooks_sync_status: string | null
          quickbooks_synced_at: string | null
          sheet_completed_at: string | null
          sheet_description: string | null
          ship_to_city: string | null
          ship_to_name: string | null
          ship_to_state: string | null
          ship_to_street: string | null
          ship_to_zip: string | null
          shipping_cost: number
          shipping_method: string | null
          show_on_customer_sheet: boolean | null
          status: string
          total: number
          total_paid: number | null
          tracking_carrier: string | null
          tracking_number: string | null
          tracking_url: string | null
          updated_at: string
          vendor_committed_ship_date: string | null
          vendor_id: string
          vendor_invoice_number: string | null
        }
        Insert: {
          attachment_name?: string | null
          attachment_url?: string | null
          company_id: string
          completion_date?: string | null
          created_at?: string
          customer_company_id?: string | null
          delay_reason?: string | null
          delivery_date?: string | null
          description?: string | null
          expected_delivery_date?: string | null
          expense_category?: string | null
          final_total?: number | null
          id?: string
          is_delayed?: boolean
          notes?: string | null
          order_date?: string
          order_id?: string | null
          po_number: string
          po_type?: string
          production_percent?: number
          production_status?: string
          production_status_updated_at?: string | null
          production_status_updated_by?: string | null
          quickbooks_id?: string | null
          quickbooks_sync_status?: string | null
          quickbooks_synced_at?: string | null
          sheet_completed_at?: string | null
          sheet_description?: string | null
          ship_to_city?: string | null
          ship_to_name?: string | null
          ship_to_state?: string | null
          ship_to_street?: string | null
          ship_to_zip?: string | null
          shipping_cost?: number
          shipping_method?: string | null
          show_on_customer_sheet?: boolean | null
          status?: string
          total?: number
          total_paid?: number | null
          tracking_carrier?: string | null
          tracking_number?: string | null
          tracking_url?: string | null
          updated_at?: string
          vendor_committed_ship_date?: string | null
          vendor_id: string
          vendor_invoice_number?: string | null
        }
        Update: {
          attachment_name?: string | null
          attachment_url?: string | null
          company_id?: string
          completion_date?: string | null
          created_at?: string
          customer_company_id?: string | null
          delay_reason?: string | null
          delivery_date?: string | null
          description?: string | null
          expected_delivery_date?: string | null
          expense_category?: string | null
          final_total?: number | null
          id?: string
          is_delayed?: boolean
          notes?: string | null
          order_date?: string
          order_id?: string | null
          po_number?: string
          po_type?: string
          production_percent?: number
          production_status?: string
          production_status_updated_at?: string | null
          production_status_updated_by?: string | null
          quickbooks_id?: string | null
          quickbooks_sync_status?: string | null
          quickbooks_synced_at?: string | null
          sheet_completed_at?: string | null
          sheet_description?: string | null
          ship_to_city?: string | null
          ship_to_name?: string | null
          ship_to_state?: string | null
          ship_to_street?: string | null
          ship_to_zip?: string | null
          shipping_cost?: number
          shipping_method?: string | null
          show_on_customer_sheet?: boolean | null
          status?: string
          total?: number
          total_paid?: number | null
          tracking_carrier?: string | null
          tracking_number?: string | null
          tracking_url?: string | null
          updated_at?: string
          vendor_committed_ship_date?: string | null
          vendor_id?: string
          vendor_invoice_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_pos_customer_company_id_fkey"
            columns: ["customer_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_pos_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_pos_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          address_city: string | null
          address_country: string | null
          address_state: string | null
          address_street: string | null
          address_zip: string | null
          bank_account_name: string | null
          bank_account_number: string | null
          bank_country: string | null
          bank_iban: string | null
          bank_name: string | null
          bank_routing_number: string | null
          bank_swift_code: string | null
          category: string
          company_id: string
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          id: string
          is_active: boolean
          is_fulfillment_vendor: boolean
          name: string
          notes: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address_city?: string | null
          address_country?: string | null
          address_state?: string | null
          address_street?: string | null
          address_zip?: string | null
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_country?: string | null
          bank_iban?: string | null
          bank_name?: string | null
          bank_routing_number?: string | null
          bank_swift_code?: string | null
          category?: string
          company_id: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_fulfillment_vendor?: boolean
          name: string
          notes?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address_city?: string | null
          address_country?: string | null
          address_state?: string | null
          address_street?: string | null
          address_zip?: string | null
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_country?: string | null
          bank_iban?: string | null
          bank_name?: string | null
          bank_routing_number?: string | null
          bank_swift_code?: string | null
          category?: string
          company_id?: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_fulfillment_vendor?: boolean
          name?: string
          notes?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendors_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      vibe_note_attachments: {
        Row: {
          created_at: string
          file_name: string
          file_type: string | null
          file_url: string
          id: string
          note: string | null
          order_id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          file_name: string
          file_type?: string | null
          file_url: string
          id?: string
          note?: string | null
          order_id: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          file_name?: string
          file_type?: string | null
          file_url?: string
          id?: string
          note?: string | null
          order_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vibe_note_attachments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      workshop_orders: {
        Row: {
          company_id: string | null
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          order_number: string
          production_progress: number | null
          production_status: string | null
          shipping_city: string | null
          shipping_cost: number
          shipping_name: string | null
          shipping_state: string | null
          shipping_street: string | null
          shipping_zip: string | null
          status: string
          subtotal: number
          tax: number
          total: number
          tracking_carrier: string | null
          tracking_number: string | null
          tracking_url: string | null
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          order_number: string
          production_progress?: number | null
          production_status?: string | null
          shipping_city?: string | null
          shipping_cost?: number
          shipping_name?: string | null
          shipping_state?: string | null
          shipping_street?: string | null
          shipping_zip?: string | null
          status?: string
          subtotal?: number
          tax?: number
          total?: number
          tracking_carrier?: string | null
          tracking_number?: string | null
          tracking_url?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          order_number?: string
          production_progress?: number | null
          production_status?: string | null
          shipping_city?: string | null
          shipping_cost?: number
          shipping_name?: string | null
          shipping_state?: string | null
          shipping_street?: string | null
          shipping_zip?: string | null
          status?: string
          subtotal?: number
          tax?: number
          total?: number
          tracking_carrier?: string | null
          tracking_number?: string | null
          tracking_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workshop_orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      invoice_receivables: {
        Row: {
          billable: number | null
          company_id: string | null
          counts_toward_ar: boolean | null
          due_date: string | null
          invoice_date: string | null
          invoice_id: string | null
          invoice_number: string | null
          is_placeholder: boolean | null
          kind: string | null
          order_id: string | null
          outstanding: number | null
          parent_credit: number | null
          status: string | null
          total: number | null
          total_paid: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_subtotal_reconciliation: {
        Row: {
          company_id: string | null
          drift: number | null
          expected_subtotal: number | null
          invoice_id: string | null
          invoice_kind: string | null
          invoice_number: string | null
          order_id: string | null
          status: string | null
          stored_subtotal: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_company_invitation: {
        Args: { invitation_token_param: string; user_email: string }
        Returns: Json
      }
      accept_vendor_invitation: {
        Args: { invitation_token_param: string; user_email: string }
        Returns: Json
      }
      add_shipment_leg_public: {
        Args: {
          p_carrier?: string
          p_destination?: string
          p_estimated_arrival?: string
          p_leg_type?: string
          p_notes?: string
          p_order_id: string
          p_origin?: string
          p_token: string
          p_tracking_number?: string
        }
        Returns: Json
      }
      associate_customer_with_invoice: {
        Args: { p_invoice_id: string; p_user_email: string }
        Returns: Json
      }
      can_access_artwork_storage_file: {
        Args: { _object_name: string; _user_id: string }
        Returns: boolean
      }
      can_access_packing_list_file: {
        Args: { _object_name: string; _user_id: string }
        Returns: boolean
      }
      can_access_print_file: {
        Args: { _object_name: string; _user_id: string }
        Returns: boolean
      }
      can_access_production_image: {
        Args: { _object_name: string; _user_id: string }
        Returns: boolean
      }
      can_view_child_order: {
        Args: { _order_id: string; _user_id: string }
        Returns: boolean
      }
      customer_po_production_detail: {
        Args: { p_po_id: string }
        Returns: Json
      }
      customer_production_sheet: {
        Args: { p_company_id: string }
        Returns: {
          completion_date: string
          cpo: string
          delivery_date: string
          description: string
          invoice_ids: string[]
          invoice_numbers: string[]
          notes: string
          order_date: string
          order_number: string
          po_id: string
          production_percent: number
          sheet_completed_at: string
          ship_to_city: string
          ship_to_name: string
          ship_to_state: string
          ship_to_street: string
          ship_to_zip: string
          tracking_carrier: string
          tracking_number: string
          tracking_url: string
        }[]
      }
      delete_shipment_leg_public: {
        Args: { p_leg_id: string; p_token: string }
        Returns: Json
      }
      exec_sql_admin: { Args: { query: string }; Returns: Json }
      get_all_portal_users: {
        Args: never
        Returns: {
          companies: string[]
          email: string
          user_id: string
        }[]
      }
      get_chat_user_info: {
        Args: { p_user_id: string }
        Returns: {
          email: string
          user_id: string
        }[]
      }
      get_company_users: {
        Args: { p_company_id: string }
        Returns: {
          email: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }[]
      }
      get_finance_data_by_token: { Args: { p_token: string }; Returns: Json }
      get_invitation_details: {
        Args: { token_param: string }
        Returns: {
          company_name: string
          email: string
          expires_at: string
          role: Database["public"]["Enums"]["app_role"]
        }[]
      }
      get_qb_token_decrypted: {
        Args: { p_company_id: string; p_token_type: string }
        Returns: string
      }
      get_shipment_legs_by_token: {
        Args: { p_token: string }
        Returns: {
          actual_arrival: string
          carrier: string
          destination: string
          estimated_arrival: string
          label: string
          leg_id: string
          leg_number: number
          leg_type: string
          notes: string
          order_id: string
          order_number: string
          origin: string
          shipped_date: string
          status: string
          tracking_number: string
          tracking_url: string
        }[]
      }
      get_user_companies: { Args: { _user_id: string }; Returns: string[] }
      get_user_company: { Args: { _user_id: string }; Returns: string }
      get_vibe_admins: {
        Args: never
        Returns: {
          email: string
          id: string
          user_id: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      recalc_blanket_invoices_for_order: {
        Args: {
          p_include_closed?: boolean
          p_only_invoice_id?: string
          p_order_id: string
        }
        Returns: undefined
      }
      reorder_shipment_leg_public: {
        Args: { p_direction: string; p_leg_id: string; p_token: string }
        Returns: Json
      }
      store_qb_token_encrypted: {
        Args: {
          p_company_id: string
          p_token_type: string
          p_token_value: string
        }
        Returns: string
      }
      update_shipment_leg_public:
        | {
            Args: {
              p_carrier?: string
              p_estimated_arrival?: string
              p_leg_id: string
              p_notes?: string
              p_token: string
              p_tracking_number?: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_carrier?: string
              p_destination?: string
              p_estimated_arrival?: string
              p_leg_id: string
              p_leg_type?: string
              p_notes?: string
              p_origin?: string
              p_status?: string
              p_token: string
              p_tracking_number?: string
            }
            Returns: Json
          }
      submit_customer_order: {
        Args: {
          p_billing_city?: string
          p_billing_name?: string
          p_billing_state?: string
          p_billing_street?: string
          p_billing_zip?: string
          p_company_id: string
          p_customer_email?: string
          p_customer_name?: string
          p_customer_phone?: string
          p_due_date?: string
          p_items: Json
          p_memo?: string
          p_po_number?: string
          p_shipping_city: string
          p_shipping_name: string
          p_shipping_state: string
          p_shipping_street: string
          p_shipping_zip: string
        }
        Returns: string
      }
      user_has_company_access: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      user_in_company: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      validate_company_invitation: {
        Args: { invitation_token_param: string }
        Returns: Json
      }
      validate_shipment_share_token: {
        Args: { p_token: string }
        Returns: Json
      }
      validate_vendor_invitation: { Args: { p_token: string }; Returns: Json }
      vendor_po_recalc: { Args: { target_po_id: string }; Returns: undefined }
      vendor_po_sheet_info: {
        Args: { p_po_ids: string[] }
        Returns: {
          company_name: string
          cpo: string
          invoice_numbers: string[]
          order_description: string
          order_number: string
          po_id: string
        }[]
      }
      vendor_po_visible_to_customer: {
        Args: { _po_type: string; _show: boolean }
        Returns: boolean
      }
      vendor_update_item_final_qty: {
        Args: { p_final_quantity: number; p_item_id: string }
        Returns: Json
      }
      vendor_update_item_shipped_qty: {
        Args: { p_item_id: string; p_shipped_quantity: number }
        Returns: Json
      }
      vendor_update_po_details: {
        Args: {
          p_completion_date?: string
          p_delivery_date?: string
          p_notes?: string
          p_po_id: string
          p_production_percent?: number
          p_sheet_completed?: boolean
          p_sheet_description?: string
          p_ship_to_city?: string
          p_ship_to_name?: string
          p_ship_to_state?: string
          p_ship_to_street?: string
          p_ship_to_zip?: string
          p_tracking_carrier?: string
          p_tracking_number?: string
          p_tracking_url?: string
          p_vendor_invoice_number?: string
        }
        Returns: Json
      }
      vendor_update_po_status: {
        Args: {
          p_committed_ship_date?: string
          p_delay_reason?: string
          p_is_delayed?: boolean
          p_note?: string
          p_po_id: string
          p_status: string
        }
        Returns: Json
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "customer"
        | "vibe_admin"
        | "vendor"
        | "company"
        | "finance"
        | "forwarder"
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
      app_role: [
        "admin",
        "customer",
        "vibe_admin",
        "vendor",
        "company",
        "finance",
        "forwarder",
      ],
    },
  },
} as const
