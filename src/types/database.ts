export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      balance_purchases: {
        Row: {
          canceled_at: string | null
          created_at: string
          currency: string
          customer_fee_cents: number
          delivered_at: string | null
          face_value_cents: number
          gift_message: string | null
          id: string
          paid_at: string | null
          payment_order_id: string
          pricing_version: string
          purchase_kind: string
          purchaser_user_id: string
          recipient_user_id: string | null
          status: string
          total_paid_cents: number
          updated_at: string
        }
        Insert: {
          canceled_at?: string | null
          created_at?: string
          currency?: string
          customer_fee_cents: number
          delivered_at?: string | null
          face_value_cents: number
          gift_message?: string | null
          id?: string
          paid_at?: string | null
          payment_order_id: string
          pricing_version: string
          purchase_kind: string
          purchaser_user_id: string
          recipient_user_id?: string | null
          status?: string
          total_paid_cents: number
          updated_at?: string
        }
        Update: {
          canceled_at?: string | null
          created_at?: string
          currency?: string
          customer_fee_cents?: number
          delivered_at?: string | null
          face_value_cents?: number
          gift_message?: string | null
          id?: string
          paid_at?: string | null
          payment_order_id?: string
          pricing_version?: string
          purchase_kind?: string
          purchaser_user_id?: string
          recipient_user_id?: string | null
          status?: string
          total_paid_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "balance_purchases_payment_order_id_fkey"
            columns: ["payment_order_id"]
            isOneToOne: true
            referencedRelation: "payment_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "balance_purchases_purchaser_user_id_fkey"
            columns: ["purchaser_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "balance_purchases_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      balance_redemptions: {
        Row: {
          balance_debited_cents: number
          client_request_id: string
          confirmation_code: string
          created_at: string
          currency: string
          customer_user_id: string
          id: string
          merchant_account_id: string
          merchant_fee_bps: number
          merchant_fee_cents: number
          merchant_location_id: string | null
          merchant_payable_cents: number
          payment_hub_id: string
          status: string
          subtotal_cents: number
          tip_cents: number
          wallet_id: string
        }
        Insert: {
          balance_debited_cents: number
          client_request_id: string
          confirmation_code: string
          created_at?: string
          currency?: string
          customer_user_id: string
          id?: string
          merchant_account_id: string
          merchant_fee_bps: number
          merchant_fee_cents: number
          merchant_location_id?: string | null
          merchant_payable_cents: number
          payment_hub_id: string
          status?: string
          subtotal_cents: number
          tip_cents?: number
          wallet_id: string
        }
        Update: {
          balance_debited_cents?: number
          client_request_id?: string
          confirmation_code?: string
          created_at?: string
          currency?: string
          customer_user_id?: string
          id?: string
          merchant_account_id?: string
          merchant_fee_bps?: number
          merchant_fee_cents?: number
          merchant_location_id?: string | null
          merchant_payable_cents?: number
          payment_hub_id?: string
          status?: string
          subtotal_cents?: number
          tip_cents?: number
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "balance_redemptions_customer_user_id_fkey"
            columns: ["customer_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "balance_redemptions_merchant_account_id_fkey"
            columns: ["merchant_account_id"]
            isOneToOne: false
            referencedRelation: "merchant_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "balance_redemptions_merchant_account_id_fkey"
            columns: ["merchant_account_id"]
            isOneToOne: false
            referencedRelation: "merchant_payment_readiness"
            referencedColumns: ["merchant_account_id"]
          },
          {
            foreignKeyName: "balance_redemptions_merchant_location_id_fkey"
            columns: ["merchant_location_id"]
            isOneToOne: false
            referencedRelation: "merchant_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "balance_redemptions_payment_hub_id_fkey"
            columns: ["payment_hub_id"]
            isOneToOne: false
            referencedRelation: "payment_hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "balance_redemptions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_consumptions: {
        Row: {
          amount_cents: number
          balance_redemption_id: string
          created_at: string
          credit_lot_id: string
          id: string
        }
        Insert: {
          amount_cents: number
          balance_redemption_id: string
          created_at?: string
          credit_lot_id: string
          id?: string
        }
        Update: {
          amount_cents?: number
          balance_redemption_id?: string
          created_at?: string
          credit_lot_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_consumptions_balance_redemption_id_fkey"
            columns: ["balance_redemption_id"]
            isOneToOne: false
            referencedRelation: "balance_redemptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_consumptions_credit_lot_id_fkey"
            columns: ["credit_lot_id"]
            isOneToOne: false
            referencedRelation: "credit_lots"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_lots: {
        Row: {
          available_at: string
          balance_purchase_id: string
          created_at: string
          id: string
          original_amount_cents: number
          remaining_amount_cents: number
          status: string
          updated_at: string
          wallet_id: string
        }
        Insert: {
          available_at?: string
          balance_purchase_id: string
          created_at?: string
          id?: string
          original_amount_cents: number
          remaining_amount_cents: number
          status?: string
          updated_at?: string
          wallet_id: string
        }
        Update: {
          available_at?: string
          balance_purchase_id?: string
          created_at?: string
          id?: string
          original_amount_cents?: number
          remaining_amount_cents?: number
          status?: string
          updated_at?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_lots_balance_purchase_id_fkey"
            columns: ["balance_purchase_id"]
            isOneToOne: false
            referencedRelation: "balance_purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_lots_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_accounts: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          display_name: string
          id: string
          legal_name: string | null
          status: string
          support_email: string | null
          support_phone: string | null
          updated_at: string
          website_url: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          display_name: string
          id?: string
          legal_name?: string | null
          status?: string
          support_email?: string | null
          support_phone?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          display_name?: string
          id?: string
          legal_name?: string | null
          status?: string
          support_email?: string | null
          support_phone?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "merchant_accounts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_locations: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          address_text: string | null
          city: string | null
          country: string | null
          created_at: string
          id: string
          label: string
          latitude: number | null
          longitude: number | null
          merchant_account_id: string
          postal_code: string | null
          region: string | null
          status: string
          timezone: string | null
          updated_at: string
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          address_text?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          id?: string
          label: string
          latitude?: number | null
          longitude?: number | null
          merchant_account_id: string
          postal_code?: string | null
          region?: string | null
          status?: string
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          address_text?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          id?: string
          label?: string
          latitude?: number | null
          longitude?: number | null
          merchant_account_id?: string
          postal_code?: string | null
          region?: string | null
          status?: string
          timezone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchant_locations_merchant_account_id_fkey"
            columns: ["merchant_account_id"]
            isOneToOne: false
            referencedRelation: "merchant_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchant_locations_merchant_account_id_fkey"
            columns: ["merchant_account_id"]
            isOneToOne: false
            referencedRelation: "merchant_payment_readiness"
            referencedColumns: ["merchant_account_id"]
          },
        ]
      }
      merchant_members: {
        Row: {
          created_at: string
          id: string
          merchant_account_id: string
          role: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          merchant_account_id: string
          role: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          merchant_account_id?: string
          role?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchant_members_merchant_account_id_fkey"
            columns: ["merchant_account_id"]
            isOneToOne: false
            referencedRelation: "merchant_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchant_members_merchant_account_id_fkey"
            columns: ["merchant_account_id"]
            isOneToOne: false
            referencedRelation: "merchant_payment_readiness"
            referencedColumns: ["merchant_account_id"]
          },
          {
            foreignKeyName: "merchant_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_hubs: {
        Row: {
          created_at: string
          disabled_at: string | null
          id: string
          merchant_account_id: string
          merchant_location_id: string | null
          public_code: string
          rotated_from_id: string | null
          status: string
        }
        Insert: {
          created_at?: string
          disabled_at?: string | null
          id?: string
          merchant_account_id: string
          merchant_location_id?: string | null
          public_code: string
          rotated_from_id?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          disabled_at?: string | null
          id?: string
          merchant_account_id?: string
          merchant_location_id?: string | null
          public_code?: string
          rotated_from_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_hubs_merchant_account_id_fkey"
            columns: ["merchant_account_id"]
            isOneToOne: false
            referencedRelation: "merchant_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_hubs_merchant_account_id_fkey"
            columns: ["merchant_account_id"]
            isOneToOne: false
            referencedRelation: "merchant_payment_readiness"
            referencedColumns: ["merchant_account_id"]
          },
          {
            foreignKeyName: "payment_hubs_merchant_location_id_fkey"
            columns: ["merchant_location_id"]
            isOneToOne: false
            referencedRelation: "merchant_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_hubs_rotated_from_id_fkey"
            columns: ["rotated_from_id"]
            isOneToOne: false
            referencedRelation: "payment_hubs"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_orders: {
        Row: {
          client_request_id: string
          created_at: string
          currency: string
          customer_fee_cents: number
          id: string
          kind: string
          pricing_version: string
          status: string
          subtotal_cents: number
          total_cents: number
          updated_at: string
          user_id: string
        }
        Insert: {
          client_request_id: string
          created_at?: string
          currency?: string
          customer_fee_cents: number
          id?: string
          kind: string
          pricing_version: string
          status?: string
          subtotal_cents: number
          total_cents: number
          updated_at?: string
          user_id: string
        }
        Update: {
          client_request_id?: string
          created_at?: string
          currency?: string
          customer_fee_cents?: number
          id?: string
          kind?: string
          pricing_version?: string
          status?: string
          subtotal_cents?: number
          total_cents?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_path: string | null
          created_at: string
          display_name: string | null
          id: string
          status: string
          updated_at: string
        }
        Insert: {
          avatar_path?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          status?: string
          updated_at?: string
        }
        Update: {
          avatar_path?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      settlement_batches: {
        Row: {
          created_at: string
          currency: string
          gross_subtotal_cents: number
          id: string
          merchant_account_id: string
          merchant_fees_cents: number
          net_payable_cents: number
          period_end: string
          period_start: string
          status: string
          tips_cents: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          gross_subtotal_cents?: number
          id?: string
          merchant_account_id: string
          merchant_fees_cents?: number
          net_payable_cents?: number
          period_end: string
          period_start: string
          status?: string
          tips_cents?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          gross_subtotal_cents?: number
          id?: string
          merchant_account_id?: string
          merchant_fees_cents?: number
          net_payable_cents?: number
          period_end?: string
          period_start?: string
          status?: string
          tips_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "settlement_batches_merchant_account_id_fkey"
            columns: ["merchant_account_id"]
            isOneToOne: false
            referencedRelation: "merchant_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_batches_merchant_account_id_fkey"
            columns: ["merchant_account_id"]
            isOneToOne: false
            referencedRelation: "merchant_payment_readiness"
            referencedColumns: ["merchant_account_id"]
          },
        ]
      }
      settlement_items: {
        Row: {
          balance_redemption_id: string
          created_at: string
          id: string
          payable_cents: number
          settlement_batch_id: string
        }
        Insert: {
          balance_redemption_id: string
          created_at?: string
          id?: string
          payable_cents: number
          settlement_batch_id: string
        }
        Update: {
          balance_redemption_id?: string
          created_at?: string
          id?: string
          payable_cents?: number
          settlement_batch_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "settlement_items_balance_redemption_id_fkey"
            columns: ["balance_redemption_id"]
            isOneToOne: true
            referencedRelation: "balance_redemptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_items_settlement_batch_id_fkey"
            columns: ["settlement_batch_id"]
            isOneToOne: false
            referencedRelation: "settlement_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_webhook_events: {
        Row: {
          attempt_count: number
          created_at: string
          event_type: string
          id: string
          livemode: boolean
          locked_at: string | null
          payment_transaction_id: string | null
          process_error: string | null
          processed_at: string | null
          stripe_event_id: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          event_type: string
          id?: string
          livemode: boolean
          locked_at?: string | null
          payment_transaction_id?: string | null
          process_error?: string | null
          processed_at?: string | null
          stripe_event_id: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          created_at?: string
          event_type?: string
          id?: string
          livemode?: boolean
          locked_at?: string | null
          payment_transaction_id?: string | null
          process_error?: string | null
          processed_at?: string | null
          stripe_event_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      wallets: {
        Row: {
          balance_cents: number
          created_at: string
          currency: string
          id: string
          status: string
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          balance_cents?: number
          created_at?: string
          currency?: string
          id?: string
          status?: string
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          balance_cents?: number
          created_at?: string
          currency?: string
          id?: string
          status?: string
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "wallets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      merchant_payment_readiness: {
        Row: {
          display_name: string | null
          has_active_payment_hub: boolean | null
          merchant_account_id: string | null
          merchant_status: string | null
        }
        Insert: {
          display_name?: string | null
          has_active_payment_hub?: never
          merchant_account_id?: string | null
          merchant_status?: string | null
        }
        Update: {
          display_name?: string | null
          has_active_payment_hub?: never
          merchant_account_id?: string | null
          merchant_status?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      claim_stripe_webhook_event: {
        Args: {
          p_event_type: string
          p_lease_seconds?: number
          p_livemode: boolean
          p_stripe_event_id: string
        }
        Returns: {
          already_processed: boolean
          attempt_count: number
          claimed: boolean
        }[]
      }
      create_merchant_account: {
        Args: {
          p_description?: string
          p_display_name: string
          p_legal_name?: string
          p_support_email?: string
          p_support_phone?: string
          p_website_url?: string
        }
        Returns: Json
      }
      create_merchant_location: {
        Args: {
          p_address_line1?: string
          p_address_line2?: string
          p_address_text?: string
          p_city?: string
          p_country?: string
          p_label: string
          p_latitude?: number
          p_longitude?: number
          p_merchant_account_id: string
          p_postal_code?: string
          p_region?: string
          p_timezone?: string
        }
        Returns: Json
      }
      ensure_location_payment_hub: {
        Args: { p_location_id: string }
        Returns: Json
      }
      generate_payment_hub_public_code: { Args: never; Returns: string }
      get_merchant_connect_status: {
        Args: { p_merchant_account_id: string }
        Returns: Json
      }
      is_merchant_member: {
        Args: { p_merchant_account_id: string; p_roles?: string[] }
        Returns: boolean
      }
      preview_gift_claim: {
        Args: { p_claim_token_hash: string }
        Returns: Json
      }
      redeem_lokala_balance: {
        Args: {
          p_client_request_id: string
          p_public_code: string
          p_subtotal_cents: number
          p_tip_cents: number
        }
        Returns: Json
      }
      resolve_payment_hub: {
        Args: { p_public_code: string }
        Returns: {
          currency: string
          location_label: string
          merchant_account_id: string
          merchant_display_name: string
          merchant_location_id: string
          payment_hub_id: string
          public_code: string
        }[]
      }
      service_claim_pending_gift: {
        Args: { p_claim_token_hash: string; p_claimant_user_id: string }
        Returns: Json
      }
      service_claim_stripe_webhook_event: {
        Args: {
          p_event_type: string
          p_lease_seconds?: number
          p_livemode: boolean
          p_object_id: string
          p_stripe_event_id: string
        }
        Returns: {
          attempt_count: number
          claim_status: string
          event_id: string
        }[]
      }
      service_complete_stripe_webhook_event: {
        Args: {
          p_error?: string
          p_stripe_event_id: string
          p_success: boolean
        }
        Returns: undefined
      }
      service_finalize_stripe_connected_account: {
        Args: {
          p_charges_enabled: boolean
          p_details_submitted: boolean
          p_disabled_reason: string
          p_livemode: boolean
          p_merchant_account_id: string
          p_onboarding_status: string
          p_payouts_enabled: boolean
          p_requirements_currently_due: Json
          p_requirements_eventually_due: Json
          p_requirements_past_due: Json
          p_stripe_account_id: string
          p_transfers_enabled: boolean
        }
        Returns: Json
      }
      service_get_gift_claim_expiry_days: { Args: never; Returns: number }
      service_get_platform_stripe_livemode: { Args: never; Returns: boolean }
      service_get_stripe_connected_account: {
        Args: { p_livemode: boolean; p_merchant_account_id: string }
        Returns: Json
      }
      service_issue_balance_purchase: {
        Args: {
          p_balance_purchase_id: string
          p_claim_token_hash?: string
          p_recipient_email_normalized?: string
        }
        Returns: Json
      }
      service_reserve_stripe_connect_account: {
        Args: { p_livemode: boolean; p_merchant_account_id: string }
        Returns: Json
      }
      service_rotate_gift_claim_token: {
        Args: { p_balance_purchase_id: string; p_new_claim_token_hash: string }
        Returns: undefined
      }
      service_sync_stripe_connected_account: {
        Args: {
          p_charges_enabled: boolean
          p_details_submitted: boolean
          p_disabled_reason: string
          p_last_stripe_event_at?: string
          p_livemode: boolean
          p_onboarding_status: string
          p_payouts_enabled: boolean
          p_requirements_currently_due: Json
          p_requirements_eventually_due: Json
          p_requirements_past_due: Json
          p_stripe_account_id: string
          p_transfers_enabled: boolean
        }
        Returns: Json
      }
      update_merchant_location: {
        Args: {
          p_address_line1?: string
          p_address_line2?: string
          p_address_text?: string
          p_city?: string
          p_country?: string
          p_label: string
          p_latitude?: number
          p_location_id: string
          p_longitude?: number
          p_postal_code?: string
          p_region?: string
          p_status?: string
          p_timezone?: string
        }
        Returns: Json
      }
      update_merchant_profile: {
        Args: {
          p_description?: string
          p_display_name: string
          p_legal_name?: string
          p_merchant_account_id: string
          p_support_email?: string
          p_support_phone?: string
          p_website_url?: string
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

