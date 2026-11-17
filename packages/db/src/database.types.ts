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
    PostgrestVersion: "14.18"
  }
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
      api_rate_limits: {
        Row: {
          bucket: string
          hits: number
          window_start: string
        }
        Insert: {
          bucket: string
          hits?: number
          window_start: string
        }
        Update: {
          bucket?: string
          hits?: number
          window_start?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          after: Json | null
          before: Json | null
          club_id: string | null
          created_at: string
          id: number
          target_id: string | null
          target_type: string
          team_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          club_id?: string | null
          created_at?: string
          id?: never
          target_id?: string | null
          target_type: string
          team_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          club_id?: string | null
          created_at?: string
          id?: never
          target_id?: string | null
          target_type?: string
          team_id?: string | null
        }
        Relationships: []
      }
      calendar_feed_tokens: {
        Row: {
          created_at: string
          id: string
          last_used_at: string | null
          profile_id: string
          revoked_at: string | null
          token_hash: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_used_at?: string | null
          profile_id: string
          revoked_at?: string | null
          token_hash: string
        }
        Update: {
          created_at?: string
          id?: string
          last_used_at?: string | null
          profile_id?: string
          revoked_at?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_feed_tokens_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      club_memberships: {
        Row: {
          club_id: string
          created_at: string
          id: string
          profile_id: string
          role: Database["public"]["Enums"]["club_role"]
          status: Database["public"]["Enums"]["membership_status"]
          updated_at: string
        }
        Insert: {
          club_id: string
          created_at?: string
          id?: string
          profile_id: string
          role: Database["public"]["Enums"]["club_role"]
          status?: Database["public"]["Enums"]["membership_status"]
          updated_at?: string
        }
        Update: {
          club_id?: string
          created_at?: string
          id?: string
          profile_id?: string
          role?: Database["public"]["Enums"]["club_role"]
          status?: Database["public"]["Enums"]["membership_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_memberships_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_memberships_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clubs: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clubs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      connected_accounts: {
        Row: {
          charges_enabled: boolean
          club_id: string | null
          created_at: string
          created_by: string | null
          default_fee_policy: string
          details_submitted: boolean
          id: string
          onboarding_status: string
          payouts_enabled: boolean
          requirements: Json
          stripe_account_id: string
          team_id: string | null
          updated_at: string
        }
        Insert: {
          charges_enabled?: boolean
          club_id?: string | null
          created_at?: string
          created_by?: string | null
          default_fee_policy?: string
          details_submitted?: boolean
          id?: string
          onboarding_status?: string
          payouts_enabled?: boolean
          requirements?: Json
          stripe_account_id: string
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          charges_enabled?: boolean
          club_id?: string | null
          created_at?: string
          created_by?: string | null
          default_fee_policy?: string
          details_submitted?: boolean
          id?: string
          onboarding_status?: string
          payouts_enabled?: boolean
          requirements?: Json
          stripe_account_id?: string
          team_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "connected_accounts_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: true
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connected_accounts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connected_accounts_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: true
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      event_series: {
        Row: {
          created_at: string
          created_by: string | null
          duration_minutes: number
          id: string
          interval_weeks: number
          local_start_time: string
          occurrence_count: number | null
          starts_on: string
          team_id: string
          timezone: string
          type: string
          until_on: string | null
          weekdays: number[]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          duration_minutes: number
          id?: string
          interval_weeks?: number
          local_start_time: string
          occurrence_count?: number | null
          starts_on: string
          team_id: string
          timezone: string
          type: string
          until_on?: string | null
          weekdays: number[]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          duration_minutes?: number
          id?: string
          interval_weeks?: number
          local_start_time?: string
          occurrence_count?: number | null
          starts_on?: string
          team_id?: string
          timezone?: string
          type?: string
          until_on?: string | null
          weekdays?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "event_series_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_series_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          arrive_early_minutes: number | null
          cancelled_reason: string | null
          created_at: string
          created_by: string | null
          ends_at: string
          game_format: Json | null
          home_away: string | null
          id: string
          location_id: string | null
          location_text: string | null
          notes: string | null
          opponent_id: string | null
          revision: number
          series_id: string | null
          starts_at: string
          status: string
          team_id: string
          timezone: string
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          arrive_early_minutes?: number | null
          cancelled_reason?: string | null
          created_at?: string
          created_by?: string | null
          ends_at: string
          game_format?: Json | null
          home_away?: string | null
          id?: string
          location_id?: string | null
          location_text?: string | null
          notes?: string | null
          opponent_id?: string | null
          revision?: number
          series_id?: string | null
          starts_at: string
          status?: string
          team_id: string
          timezone: string
          title: string
          type: string
          updated_at?: string
        }
        Update: {
          arrive_early_minutes?: number | null
          cancelled_reason?: string | null
          created_at?: string
          created_by?: string | null
          ends_at?: string
          game_format?: Json | null
          home_away?: string | null
          id?: string
          location_id?: string | null
          location_text?: string | null
          notes?: string | null
          opponent_id?: string | null
          revision?: number
          series_id?: string | null
          starts_at?: string
          status?: string
          team_id?: string
          timezone?: string
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_opponent_id_fkey"
            columns: ["opponent_id"]
            isOneToOne: false
            referencedRelation: "opponents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "event_series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_config: {
        Row: {
          created_at: string
          created_by: string | null
          effective_from: string
          id: string
          is_active: boolean
          note: string | null
          platform_fee_bps: number
          platform_fee_flat_cents: number
          refund_athleit_charge_on_full: boolean
          refund_athleit_charge_on_partial: boolean
          refund_service_fee_on_full: boolean
          refund_service_fee_on_partial: boolean
          stripe_fee_bps: number
          stripe_fee_fixed_cents: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          effective_from?: string
          id?: string
          is_active?: boolean
          note?: string | null
          platform_fee_bps?: number
          platform_fee_flat_cents?: number
          refund_athleit_charge_on_full?: boolean
          refund_athleit_charge_on_partial?: boolean
          refund_service_fee_on_full?: boolean
          refund_service_fee_on_partial?: boolean
          stripe_fee_bps?: number
          stripe_fee_fixed_cents?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          effective_from?: string
          id?: string
          is_active?: boolean
          note?: string | null
          platform_fee_bps?: number
          platform_fee_flat_cents?: number
          refund_athleit_charge_on_full?: boolean
          refund_athleit_charge_on_partial?: boolean
          refund_service_fee_on_full?: boolean
          refund_service_fee_on_partial?: boolean
          stripe_fee_bps?: number
          stripe_fee_fixed_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "fee_config_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      game_results: {
        Row: {
          entered_at: string
          entered_by: string | null
          event_id: string
          id: string
          notes: string | null
          our_score: number
          outcome: string | null
          period_scores: Json | null
          their_score: number
          updated_at: string
        }
        Insert: {
          entered_at?: string
          entered_by?: string | null
          event_id: string
          id?: string
          notes?: string | null
          our_score: number
          outcome?: string | null
          period_scores?: Json | null
          their_score: number
          updated_at?: string
        }
        Update: {
          entered_at?: string
          entered_by?: string | null
          event_id?: string
          id?: string
          notes?: string | null
          our_score?: number
          outcome?: string | null
          period_scores?: Json | null
          their_score?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_results_entered_by_fkey"
            columns: ["entered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_results_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      household_members: {
        Row: {
          created_at: string
          household_id: string
          profile_id: string
          relationship: Database["public"]["Enums"]["household_relationship"]
        }
        Insert: {
          created_at?: string
          household_id: string
          profile_id: string
          relationship?: Database["public"]["Enums"]["household_relationship"]
        }
        Update: {
          created_at?: string
          household_id?: string
          profile_id?: string
          relationship?: Database["public"]["Enums"]["household_relationship"]
        }
        Relationships: [
          {
            foreignKeyName: "household_members_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "household_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      households: {
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
      invites: {
        Row: {
          club_id: string | null
          created_at: string
          created_by: string | null
          expires_at: string
          household_id: string | null
          id: string
          max_uses: number
          revoked_at: string | null
          role: string
          team_id: string | null
          token_hash: string
          use_count: number
        }
        Insert: {
          club_id?: string | null
          created_at?: string
          created_by?: string | null
          expires_at: string
          household_id?: string | null
          id?: string
          max_uses?: number
          revoked_at?: string | null
          role: string
          team_id?: string | null
          token_hash: string
          use_count?: number
        }
        Update: {
          club_id?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string
          household_id?: string | null
          id?: string
          max_uses?: number
          revoked_at?: string | null
          role?: string
          team_id?: string | null
          token_hash?: string
          use_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "invites_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      join_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          message: string | null
          player_id: string | null
          requester_id: string
          status: Database["public"]["Enums"]["request_status"]
          team_id: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          message?: string | null
          player_id?: string | null
          requester_id: string
          status?: Database["public"]["Enums"]["request_status"]
          team_id: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          message?: string | null
          player_id?: string | null
          requester_id?: string
          status?: Database["public"]["Enums"]["request_status"]
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "join_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "join_requests_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "join_requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "join_requests_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          address: string | null
          created_at: string
          created_by: string | null
          id: string
          lat: number | null
          lng: number | null
          name: string
          notes: string | null
          team_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          name: string
          notes?: string | null
          team_id: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          name?: string
          notes?: string | null
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      message_attachments: {
        Row: {
          created_at: string
          id: string
          message_id: string
          mime_type: string
          size_bytes: number
          storage_path: string
        }
        Insert: {
          created_at?: string
          id?: string
          message_id: string
          mime_type: string
          size_bytes: number
          storage_path: string
        }
        Update: {
          created_at?: string
          id?: string
          message_id?: string
          mime_type?: string
          size_bytes?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reactions: {
        Row: {
          created_at: string
          emoji: string
          message_id: string
          profile_id: string
          thread_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          message_id: string
          profile_id: string
          thread_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          message_id?: string
          profile_id?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reads: {
        Row: {
          last_read_at: string
          last_read_message_id: string | null
          profile_id: string
          thread_id: string
        }
        Insert: {
          last_read_at?: string
          last_read_message_id?: string | null
          profile_id: string
          thread_id: string
        }
        Update: {
          last_read_at?: string
          last_read_message_id?: string | null
          profile_id?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reads_last_read_message_id_fkey"
            columns: ["last_read_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reads_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reads_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reports: {
        Row: {
          created_at: string
          id: string
          message_id: string
          reason: string
          reporter_profile_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          message_id: string
          reason: string
          reporter_profile_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          message_id?: string
          reason?: string
          reporter_profile_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reports_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reports_reporter_profile_id_fkey"
            columns: ["reporter_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reports_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          hidden_at: string | null
          hidden_by: string | null
          id: string
          reply_to_id: string | null
          sender_profile_id: string | null
          thread_id: string
        }
        Insert: {
          body?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          hidden_at?: string | null
          hidden_by?: string | null
          id?: string
          reply_to_id?: string | null
          sender_profile_id?: string | null
          thread_id: string
        }
        Update: {
          body?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          hidden_at?: string | null
          hidden_by?: string | null
          id?: string
          reply_to_id?: string | null
          sender_profile_id?: string | null
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_hidden_by_fkey"
            columns: ["hidden_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_profile_id_fkey"
            columns: ["sender_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_outbox: {
        Row: {
          attempts: number
          category: string
          channel: string
          created_at: string
          dedupe_key: string
          deliver_after: string
          id: string
          last_error: string | null
          payload: Json
          profile_id: string
          read_at: string | null
          sent_at: string | null
          status: string
        }
        Insert: {
          attempts?: number
          category: string
          channel: string
          created_at?: string
          dedupe_key: string
          deliver_after?: string
          id?: string
          last_error?: string | null
          payload?: Json
          profile_id: string
          read_at?: string | null
          sent_at?: string | null
          status?: string
        }
        Update: {
          attempts?: number
          category?: string
          channel?: string
          created_at?: string
          dedupe_key?: string
          deliver_after?: string
          id?: string
          last_error?: string | null
          payload?: Json
          profile_id?: string
          read_at?: string | null
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_outbox_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          category: string
          channel: string
          enabled: boolean
          include_preview: boolean
          profile_id: string
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          timezone: string
        }
        Insert: {
          category: string
          channel: string
          enabled?: boolean
          include_preview?: boolean
          profile_id: string
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          timezone?: string
        }
        Update: {
          category?: string
          channel?: string
          enabled?: boolean
          include_preview?: boolean
          profile_id?: string
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          timezone?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      offline_payments: {
        Row: {
          id: string
          method: string
          note: string | null
          payment_request_id: string
          recorded_at: string
          recorded_by: string | null
        }
        Insert: {
          id?: string
          method: string
          note?: string | null
          payment_request_id: string
          recorded_at?: string
          recorded_by?: string | null
        }
        Update: {
          id?: string
          method?: string
          note?: string | null
          payment_request_id?: string
          recorded_at?: string
          recorded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "offline_payments_payment_request_id_fkey"
            columns: ["payment_request_id"]
            isOneToOne: true
            referencedRelation: "payment_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offline_payments_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      opponents: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          team_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          team_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "opponents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opponents_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_events: {
        Row: {
          amount_cents: number
          audience: string
          audience_player_ids: string[] | null
          cancelled_at: string | null
          club_id: string | null
          connected_account_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          due_at: string
          fee_config: Json | null
          fee_policy: string
          id: string
          published_at: string | null
          status: string
          team_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          amount_cents: number
          audience?: string
          audience_player_ids?: string[] | null
          cancelled_at?: string | null
          club_id?: string | null
          connected_account_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          due_at: string
          fee_config?: Json | null
          fee_policy?: string
          id?: string
          published_at?: string | null
          status?: string
          team_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          audience?: string
          audience_player_ids?: string[] | null
          cancelled_at?: string | null
          club_id?: string | null
          connected_account_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          due_at?: string
          fee_config?: Json | null
          fee_policy?: string
          id?: string
          published_at?: string | null
          status?: string
          team_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_events_connected_account_id_fkey"
            columns: ["connected_account_id"]
            isOneToOne: false
            referencedRelation: "connected_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_events_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_items: {
        Row: {
          amount_cents: number
          created_at: string
          id: string
          is_active: boolean
          payment_id: string
          payment_request_id: string
          platform_fee_cents: number
          processing_fee_passthrough_cents: number
        }
        Insert: {
          amount_cents: number
          created_at?: string
          id?: string
          is_active?: boolean
          payment_id: string
          payment_request_id: string
          platform_fee_cents?: number
          processing_fee_passthrough_cents?: number
        }
        Update: {
          amount_cents?: number
          created_at?: string
          id?: string
          is_active?: boolean
          payment_id?: string
          payment_request_id?: string
          platform_fee_cents?: number
          processing_fee_passthrough_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "payment_items_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_items_payment_request_id_fkey"
            columns: ["payment_request_id"]
            isOneToOne: false
            referencedRelation: "payment_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_requests: {
        Row: {
          amount_cents: number
          created_at: string
          display_id: string
          disputed: boolean
          due_at: string
          due_soon_notified_at: string | null
          household_id: string
          id: string
          last_reminded_at: string | null
          note: string | null
          overdue_notified_at: string | null
          paid_at: string | null
          payment_event_id: string
          player_id: string
          status: string
          updated_at: string
          waived_at: string | null
          waived_by: string | null
        }
        Insert: {
          amount_cents: number
          created_at?: string
          display_id: string
          disputed?: boolean
          due_at: string
          due_soon_notified_at?: string | null
          household_id: string
          id?: string
          last_reminded_at?: string | null
          note?: string | null
          overdue_notified_at?: string | null
          paid_at?: string | null
          payment_event_id: string
          player_id: string
          status?: string
          updated_at?: string
          waived_at?: string | null
          waived_by?: string | null
        }
        Update: {
          amount_cents?: number
          created_at?: string
          display_id?: string
          disputed?: boolean
          due_at?: string
          due_soon_notified_at?: string | null
          household_id?: string
          id?: string
          last_reminded_at?: string | null
          note?: string | null
          overdue_notified_at?: string | null
          paid_at?: string | null
          payment_event_id?: string
          player_id?: string
          status?: string
          updated_at?: string
          waived_at?: string | null
          waived_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_requests_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_requests_payment_event_id_fkey"
            columns: ["payment_event_id"]
            isOneToOne: false
            referencedRelation: "payment_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_requests_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_requests_waived_by_fkey"
            columns: ["waived_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          application_fee_cents: number
          base_cents: number
          connected_account_id: string
          created_at: string
          currency: string
          estimated_stripe_fee_cents: number
          fee_policy: string
          household_id: string
          id: string
          net_to_account_cents: number | null
          payer_profile_id: string | null
          platform_fee_cents: number
          processing_fee_passthrough_cents: number
          receipt_display_id: string | null
          request_set_key: string
          status: string
          stripe_charge_id: string | null
          stripe_fee_cents: number | null
          stripe_payment_intent_id: string | null
          succeeded_at: string | null
          total_charged_cents: number
          updated_at: string
        }
        Insert: {
          application_fee_cents?: number
          base_cents: number
          connected_account_id: string
          created_at?: string
          currency?: string
          estimated_stripe_fee_cents: number
          fee_policy: string
          household_id: string
          id?: string
          net_to_account_cents?: number | null
          payer_profile_id?: string | null
          platform_fee_cents?: number
          processing_fee_passthrough_cents?: number
          receipt_display_id?: string | null
          request_set_key: string
          status?: string
          stripe_charge_id?: string | null
          stripe_fee_cents?: number | null
          stripe_payment_intent_id?: string | null
          succeeded_at?: string | null
          total_charged_cents: number
          updated_at?: string
        }
        Update: {
          application_fee_cents?: number
          base_cents?: number
          connected_account_id?: string
          created_at?: string
          currency?: string
          estimated_stripe_fee_cents?: number
          fee_policy?: string
          household_id?: string
          id?: string
          net_to_account_cents?: number | null
          payer_profile_id?: string | null
          platform_fee_cents?: number
          processing_fee_passthrough_cents?: number
          receipt_display_id?: string | null
          request_set_key?: string
          status?: string
          stripe_charge_id?: string | null
          stripe_fee_cents?: number | null
          stripe_payment_intent_id?: string | null
          succeeded_at?: string | null
          total_charged_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_connected_account_id_fkey"
            columns: ["connected_account_id"]
            isOneToOne: false
            referencedRelation: "connected_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_payer_profile_id_fkey"
            columns: ["payer_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      player_login_claims: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          player_id: string
          profile_id: string
          status: Database["public"]["Enums"]["request_status"]
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          player_id: string
          profile_id: string
          status?: Database["public"]["Enums"]["request_status"]
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          player_id?: string
          profile_id?: string
          status?: Database["public"]["Enums"]["request_status"]
        }
        Relationships: [
          {
            foreignKeyName: "player_login_claims_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_login_claims_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_login_claims_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          created_at: string
          date_of_birth: string
          first_name: string
          household_id: string
          id: string
          last_name: string
          login_invite_email: string | null
          photo_path: string | null
          profile_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          date_of_birth: string
          first_name: string
          household_id: string
          id?: string
          last_name: string
          login_invite_email?: string | null
          photo_path?: string | null
          profile_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          date_of_birth?: string
          first_name?: string
          household_id?: string
          id?: string
          last_name?: string
          login_invite_email?: string | null
          photo_path?: string | null
          profile_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "players_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "players_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name: string
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      push_devices: {
        Row: {
          active_at: string | null
          active_thread_id: string | null
          created_at: string
          device_label: string | null
          id: string
          last_seen_at: string
          platform: string
          profile_id: string
          revoked_at: string | null
          subscription: Json | null
          token: string
        }
        Insert: {
          active_at?: string | null
          active_thread_id?: string | null
          created_at?: string
          device_label?: string | null
          id?: string
          last_seen_at?: string
          platform: string
          profile_id: string
          revoked_at?: string | null
          subscription?: Json | null
          token: string
        }
        Update: {
          active_at?: string | null
          active_thread_id?: string | null
          created_at?: string
          device_label?: string | null
          id?: string
          last_seen_at?: string
          platform?: string
          profile_id?: string
          revoked_at?: string | null
          subscription?: Json | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_devices_active_thread_id_fkey"
            columns: ["active_thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_devices_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      refunds: {
        Row: {
          amount_cents: number
          athleit_charge_cents: number
          base_cents: number
          created_at: string
          id: string
          payment_id: string
          payment_item_id: string | null
          reason: string | null
          requested_by: string | null
          service_fee_cents: number
          status: string
          stripe_refund_id: string | null
          updated_at: string
        }
        Insert: {
          amount_cents: number
          athleit_charge_cents?: number
          base_cents?: number
          created_at?: string
          id?: string
          payment_id: string
          payment_item_id?: string | null
          reason?: string | null
          requested_by?: string | null
          service_fee_cents?: number
          status?: string
          stripe_refund_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          athleit_charge_cents?: number
          base_cents?: number
          created_at?: string
          id?: string
          payment_id?: string
          payment_item_id?: string | null
          reason?: string | null
          requested_by?: string | null
          service_fee_cents?: number
          status?: string
          stripe_refund_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "refunds_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_payment_item_id_fkey"
            columns: ["payment_item_id"]
            isOneToOne: false
            referencedRelation: "payment_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rsvps: {
        Row: {
          event_id: string
          id: string
          note: string | null
          player_id: string
          responded_at: string
          responded_by: string | null
          set_by_staff: boolean
          status: string
          team_id: string
        }
        Insert: {
          event_id: string
          id?: string
          note?: string | null
          player_id: string
          responded_at?: string
          responded_by?: string | null
          set_by_staff?: boolean
          status: string
          team_id: string
        }
        Update: {
          event_id?: string
          id?: string
          note?: string | null
          player_id?: string
          responded_at?: string
          responded_by?: string | null
          set_by_staff?: boolean
          status?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rsvps_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rsvps_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rsvps_responded_by_fkey"
            columns: ["responded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rsvps_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      sport_configs: {
        Row: {
          default_period_count: number
          default_period_minutes: number | null
          period_type: string
          positions: string[]
          scoring_label: string
          sport: Database["public"]["Enums"]["sport"]
          ties_allowed: boolean
        }
        Insert: {
          default_period_count: number
          default_period_minutes?: number | null
          period_type: string
          positions?: string[]
          scoring_label: string
          sport: Database["public"]["Enums"]["sport"]
          ties_allowed: boolean
        }
        Update: {
          default_period_count?: number
          default_period_minutes?: number | null
          period_type?: string
          positions?: string[]
          scoring_label?: string
          sport?: Database["public"]["Enums"]["sport"]
          ties_allowed?: boolean
        }
        Relationships: []
      }
      stripe_webhook_events: {
        Row: {
          attempts: number
          error: string | null
          id: string
          livemode: boolean
          payload: Json
          processed_at: string | null
          received_at: string
          stripe_account_id: string | null
          stripe_event_id: string
          type: string
        }
        Insert: {
          attempts?: number
          error?: string | null
          id?: string
          livemode?: boolean
          payload?: Json
          processed_at?: string | null
          received_at?: string
          stripe_account_id?: string | null
          stripe_event_id: string
          type: string
        }
        Update: {
          attempts?: number
          error?: string | null
          id?: string
          livemode?: boolean
          payload?: Json
          processed_at?: string | null
          received_at?: string
          stripe_account_id?: string | null
          stripe_event_id?: string
          type?: string
        }
        Relationships: []
      }
      team_club_link_requests: {
        Row: {
          club_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          requested_by: string | null
          status: Database["public"]["Enums"]["request_status"]
          team_id: string
        }
        Insert: {
          club_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          requested_by?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          team_id: string
        }
        Update: {
          club_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          requested_by?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_club_link_requests_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_club_link_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_club_link_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_club_link_requests_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_memberships: {
        Row: {
          created_at: string
          id: string
          profile_id: string
          role: Database["public"]["Enums"]["team_role"]
          status: Database["public"]["Enums"]["membership_status"]
          team_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          profile_id: string
          role: Database["public"]["Enums"]["team_role"]
          status?: Database["public"]["Enums"]["membership_status"]
          team_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          profile_id?: string
          role?: Database["public"]["Enums"]["team_role"]
          status?: Database["public"]["Enums"]["membership_status"]
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_memberships_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_memberships_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_players: {
        Row: {
          created_at: string
          id: string
          jersey_number: number | null
          player_id: string
          position: string | null
          status: Database["public"]["Enums"]["roster_status"]
          team_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          jersey_number?: number | null
          player_id: string
          position?: string | null
          status?: Database["public"]["Enums"]["roster_status"]
          team_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          jersey_number?: number | null
          player_id?: string
          position?: string | null
          status?: Database["public"]["Enums"]["roster_status"]
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_players_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          club_id: string | null
          created_at: string
          created_by: string | null
          id: string
          join_code: string
          name: string
          season_label: string
          sport: Database["public"]["Enums"]["sport"]
          updated_at: string
        }
        Insert: {
          club_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          join_code?: string
          name: string
          season_label: string
          sport: Database["public"]["Enums"]["sport"]
          updated_at?: string
        }
        Update: {
          club_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          join_code?: string
          name?: string
          season_label?: string
          sport?: Database["public"]["Enums"]["sport"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      thread_participants: {
        Row: {
          joined_at: string
          left_at: string | null
          muted_until: string | null
          profile_id: string
          role: string
          thread_id: string
        }
        Insert: {
          joined_at?: string
          left_at?: string | null
          muted_until?: string | null
          profile_id: string
          role: string
          thread_id: string
        }
        Update: {
          joined_at?: string
          left_at?: string | null
          muted_until?: string | null
          profile_id?: string
          role?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "thread_participants_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thread_participants_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
        ]
      }
      threads: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          id: string
          last_message_at: string
          team_id: string
          title: string | null
          type: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          last_message_at?: string
          team_id: string
          title?: string | null
          type: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          last_message_at?: string
          team_id?: string
          title?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "threads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "threads_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invite: {
        Args: { p_token: string }
        Returns: {
          club_id: string
          household_id: string
          role: string
          team_id: string
        }[]
      }
      add_child: {
        Args: {
          p_date_of_birth: string
          p_first_name: string
          p_household_id: string
          p_last_name: string
        }
        Returns: string
      }
      add_participant: {
        Args: { p_profile_id: string; p_role?: string; p_thread_id: string }
        Returns: undefined
      }
      calendar_feed_events: {
        Args: { p_profile_id: string }
        Returns: {
          arrive_early_minutes: number
          cancelled_reason: string
          ends_at: string
          home_away: string
          id: string
          location_address: string
          location_name: string
          location_text: string
          notes: string
          opponent_name: string
          revision: number
          starts_at: string
          status: string
          team_name: string
          timezone: string
          title: string
          type: string
          updated_at: string
        }[]
      }
      cancel_event: {
        Args: { p_event_id: string; p_reason: string; p_scope: string }
        Returns: number
      }
      cancel_payment_event: { Args: { p_event_id: string }; Returns: number }
      claim_notifications: {
        Args: { p_limit?: number }
        Returns: {
          attempts: number
          category: string
          channel: string
          id: string
          payload: Json
          profile_id: string
        }[]
      }
      claim_player_login: { Args: { p_player_id: string }; Returns: string }
      clear_game_result: { Args: { p_event_id: string }; Returns: undefined }
      connected_account_status: {
        Args: { p_club_id?: string; p_team_id?: string }
        Returns: {
          can_manage: boolean
          charges_enabled: boolean
          default_fee_policy: string
          exists_account: boolean
          onboarding_status: string
          payouts_enabled: boolean
        }[]
      }
      create_calendar_feed_token: { Args: never; Returns: string }
      create_club: { Args: { p_name: string; p_slug: string }; Returns: string }
      create_event: {
        Args: {
          p_arrive_early_minutes?: number
          p_ends_at: string
          p_game_format?: Json
          p_home_away?: string
          p_location_id?: string
          p_location_text?: string
          p_notes?: string
          p_opponent_id?: string
          p_recurrence?: Json
          p_starts_at: string
          p_team_id: string
          p_timezone: string
          p_title: string
          p_type: string
        }
        Returns: {
          event_id: string
          occurrences: number
          series_id: string
        }[]
      }
      create_household_invite: {
        Args: {
          p_expires_in?: string
          p_household_id: string
          p_max_uses?: number
        }
        Returns: {
          invite_id: string
          token: string
        }[]
      }
      create_invite: {
        Args: {
          p_club_id: string
          p_expires_in?: string
          p_max_uses?: number
          p_role: string
          p_team_id: string
        }
        Returns: {
          invite_id: string
          token: string
        }[]
      }
      create_payment_event: {
        Args: {
          p_amount_cents: number
          p_audience?: string
          p_audience_player_ids?: string[]
          p_club_id: string
          p_description: string
          p_due_at: string
          p_fee_policy?: string
          p_team_id: string
          p_title: string
        }
        Returns: string
      }
      create_team: {
        Args: {
          p_club_id?: string
          p_name: string
          p_season_label: string
          p_sport: Database["public"]["Enums"]["sport"]
        }
        Returns: string
      }
      create_thread: {
        Args: {
          p_participant_ids?: string[]
          p_team_id: string
          p_title: string
          p_type: string
        }
        Returns: string
      }
      decide_club_link: {
        Args: { p_approve: boolean; p_request_id: string }
        Returns: undefined
      }
      decide_join_request: {
        Args: { p_approve: boolean; p_request_id: string }
        Returns: undefined
      }
      decide_player_login_claim: {
        Args: { p_approve: boolean; p_claim_id: string }
        Returns: undefined
      }
      delete_event: { Args: { p_event_id: string }; Returns: undefined }
      delete_message: { Args: { p_message_id: string }; Returns: undefined }
      edit_message: {
        Args: { p_body: string; p_message_id: string }
        Returns: undefined
      }
      event_collection_detail: {
        Args: { p_event_id: string }
        Returns: {
          amount_cents: number
          display_id: string
          disputed: boolean
          due_at: string
          household_name: string
          last_reminded_at: string
          paid_at: string
          paid_via: string
          player_name: string
          receipt_display_id: string
          request_id: string
          status: string
        }[]
      }
      event_collection_summary: {
        Args: { p_event_id: string }
        Returns: {
          collected_cents: number
          disputed_count: number
          due_at: string
          expected_cents: number
          outstanding_cents: number
          paid_count: number
          processing_count: number
          progress_percent: number
          refunded_cents: number
          refunded_count: number
          status: string
          total_requests: number
          unpaid_count: number
          waived_cents: number
          waived_count: number
        }[]
      }
      event_rsvp_detail: {
        Args: { p_event_id: string }
        Returns: {
          first_name: string
          jersey_number: number
          last_name: string
          note: string
          player_id: string
          responded_at: string
          responded_by_name: string
          set_by_staff: boolean
          status: string
        }[]
      }
      event_rsvp_summary: {
        Args: { p_event_id: string }
        Returns: {
          going: number
          maybe: number
          no_reply: number
          not_going: number
        }[]
      }
      find_club: {
        Args: { p_slug: string }
        Returns: {
          id: string
          name: string
          slug: string
        }[]
      }
      get_event: {
        Args: { p_event_id: string }
        Returns: {
          arrive_early_minutes: number
          cancelled_reason: string
          ends_at: string
          game_format: Json
          home_away: string
          id: string
          is_staff: boolean
          location_address: string
          location_id: string
          location_name: string
          location_text: string
          notes: string
          opponent_id: string
          opponent_name: string
          our_score: number
          outcome: string
          period_scores: Json
          result_notes: string
          revision: number
          series_id: string
          sport: Database["public"]["Enums"]["sport"]
          starts_at: string
          status: string
          team_id: string
          team_name: string
          their_score: number
          timezone: string
          title: string
          type: string
        }[]
      }
      get_guardian_contacts: {
        Args: { p_player_id: string }
        Returns: {
          display_name: string
          email: string
          phone: string
          profile_id: string
        }[]
      }
      get_hidden_message: {
        Args: { p_message_id: string }
        Returns: {
          body: string
          how: string
          removed_at: string
          removed_by: string
          sender_profile_id: string
        }[]
      }
      get_join_requests: {
        Args: { p_team_id: string }
        Returns: {
          created_at: string
          id: string
          message: string
          player_first_name: string
          player_id: string
          player_last_name: string
          requester_id: string
          requester_name: string
          status: Database["public"]["Enums"]["request_status"]
        }[]
      }
      get_link_requests: {
        Args: { p_club_id?: string; p_team_id?: string }
        Returns: {
          club_id: string
          club_name: string
          created_at: string
          id: string
          requested_by_name: string
          season_label: string
          sport: Database["public"]["Enums"]["sport"]
          status: Database["public"]["Enums"]["request_status"]
          team_id: string
          team_name: string
        }[]
      }
      get_messageable_people: {
        Args: { p_team_id: string }
        Returns: {
          display_name: string
          is_minor: boolean
          profile_id: string
          role: Database["public"]["Enums"]["team_role"]
        }[]
      }
      get_notification_failures: {
        Args: { p_team_id: string }
        Returns: {
          attempts: number
          category: string
          channel: string
          created_at: string
          deliver_after: string
          id: string
          last_error: string
          status: string
        }[]
      }
      get_player_login_claims: {
        Args: never
        Returns: {
          claim_id: string
          claimant_email: string
          claimant_name: string
          created_at: string
          player_first_name: string
          player_id: string
          player_last_name: string
        }[]
      }
      get_team_members: {
        Args: { p_team_id: string }
        Returns: {
          display_name: string
          membership_id: string
          profile_id: string
          role: Database["public"]["Enums"]["team_role"]
          status: Database["public"]["Enums"]["membership_status"]
        }[]
      }
      get_team_roster: {
        Args: { p_team_id: string }
        Returns: {
          first_name: string
          jersey_number: number
          last_name: string
          player_id: string
          position: string
          status: Database["public"]["Enums"]["roster_status"]
          team_player_id: string
        }[]
      }
      get_thread_list: {
        Args: { p_team_id: string }
        Returns: {
          archived_at: string
          last_body: string
          last_created_at: string
          last_deleted: boolean
          last_hidden: boolean
          last_message_at: string
          last_message_id: string
          last_sender_id: string
          last_sender_name: string
          member_count: number
          muted_until: string
          other_name: string
          thread_id: string
          title: string
          type: string
          unread_count: number
        }[]
      }
      get_thread_members: {
        Args: { p_thread_id: string }
        Returns: {
          display_name: string
          joined_at: string
          profile_id: string
          role: string
        }[]
      }
      get_unread_total: { Args: never; Returns: number }
      hide_message: {
        Args: { p_message_id: string; p_reason?: string }
        Returns: undefined
      }
      household_payments: {
        Args: { p_household_id?: string }
        Returns: {
          amount_cents: number
          can_pay: boolean
          display_id: string
          disputed: boolean
          due_at: string
          household_id: string
          issuer_name: string
          paid_at: string
          payment_event_id: string
          player_first_name: string
          request_id: string
          status: string
          title: string
        }[]
      }
      household_receipts: {
        Args: { p_household_id?: string }
        Returns: {
          base_cents: number
          items: Json
          payment_id: string
          platform_fee_cents: number
          processing_fee_passthrough_cents: number
          receipt_display_id: string
          refunded_cents: number
          status: string
          succeeded_at: string
          total_charged_cents: number
        }[]
      }
      household_schedule: {
        Args: { p_limit?: number; p_offset?: number; p_when?: string }
        Returns: {
          arrive_early_minutes: number
          cancelled_reason: string
          ends_at: string
          event_id: string
          home_away: string
          location_address: string
          location_name: string
          location_text: string
          opponent_name: string
          our_score: number
          outcome: string
          player_first_name: string
          player_id: string
          revision: number
          rsvp_note: string
          rsvp_status: string
          starts_at: string
          status: string
          team_id: string
          team_name: string
          their_score: number
          timezone: string
          title: string
          type: string
        }[]
      }
      household_schedule_range: {
        Args: { p_from: string; p_to: string }
        Returns: {
          arrive_early_minutes: number
          cancelled_reason: string
          ends_at: string
          event_id: string
          home_away: string
          location_address: string
          location_name: string
          location_text: string
          opponent_name: string
          our_score: number
          outcome: string
          player_first_name: string
          player_id: string
          revision: number
          rsvp_note: string
          rsvp_status: string
          starts_at: string
          status: string
          team_id: string
          team_name: string
          their_score: number
          timezone: string
          title: string
          type: string
        }[]
      }
      mark_notifications_read: { Args: { p_ids?: string[] }; Returns: number }
      mark_thread_read: {
        Args: { p_message_id: string; p_thread_id: string }
        Returns: undefined
      }
      next_up: {
        Args: { p_limit?: number }
        Returns: {
          arrive_early_minutes: number
          children: Json
          ends_at: string
          event_id: string
          going: number
          home_away: string
          is_staff: boolean
          location_address: string
          location_name: string
          location_text: string
          maybe: number
          no_reply: number
          not_going: number
          opponent_name: string
          revision: number
          starts_at: string
          team_id: string
          team_name: string
          timezone: string
          title: string
          type: string
        }[]
      }
      payer_checkout_quote: { Args: { p_request_ids: string[] }; Returns: Json }
      payment_event_export: {
        Args: { p_event_id: string }
        Returns: {
          athleit_charge_cents: number
          base_cents: number
          display_id: string
          due_at: string
          household_name: string
          paid_at: string
          paid_via: string
          player_name: string
          receipt_display_id: string
          refunded_cents: number
          service_fee_cents: number
          status: string
          total_charged_cents: number
        }[]
      }
      place_player_on_roster: {
        Args: {
          p_jersey_number?: number
          p_player_id: string
          p_position?: string
          p_status?: Database["public"]["Enums"]["roster_status"]
          p_team_id: string
        }
        Returns: string
      }
      prepare_refund: {
        Args: {
          p_base_cents?: number
          p_item_id?: string
          p_payment_id: string
          p_reason?: string
        }
        Returns: Json
      }
      preview_invite: {
        Args: { p_token: string }
        Returns: {
          kind: string
          reason: string
          role: string
          target_name: string
          valid: boolean
        }[]
      }
      publish_payment_event: { Args: { p_event_id: string }; Returns: number }
      record_game_result: {
        Args: {
          p_event_id: string
          p_notes?: string
          p_our_score: number
          p_period_scores?: Json
          p_their_score: number
        }
        Returns: string
      }
      record_offline_payment: {
        Args: { p_method: string; p_note?: string; p_request_id: string }
        Returns: undefined
      }
      register_push_device: {
        Args: {
          p_label?: string
          p_platform: string
          p_subscription?: Json
          p_token: string
        }
        Returns: string
      }
      remove_participant: {
        Args: { p_profile_id: string; p_thread_id: string }
        Returns: undefined
      }
      report_message: {
        Args: { p_message_id: string; p_reason: string }
        Returns: string
      }
      request_club_link: {
        Args: { p_club_id: string; p_team_id: string }
        Returns: string
      }
      request_to_join: {
        Args: {
          p_message?: string
          p_player_id?: string
          p_team_code?: string
          p_team_id?: string
        }
        Returns: string
      }
      resolve_calendar_feed_token: {
        Args: { p_token: string }
        Returns: string
      }
      review_report: {
        Args: { p_report_id: string; p_status: string }
        Returns: undefined
      }
      revoke_calendar_feed_token: { Args: never; Returns: undefined }
      revoke_invite: { Args: { p_invite_id: string }; Returns: undefined }
      revoke_push_device: {
        Args: { p_device_id?: string; p_token?: string }
        Returns: undefined
      }
      rotate_calendar_feed_token: { Args: never; Returns: string }
      rotate_team_join_code: { Args: { p_team_id: string }; Returns: string }
      send_message: {
        Args: {
          p_attachments?: Json
          p_body: string
          p_reply_to?: string
          p_thread_id: string
        }
        Returns: string
      }
      send_payment_reminders: { Args: { p_event_id: string }; Returns: number }
      set_active_thread: {
        Args: { p_thread_id: string; p_token: string }
        Returns: undefined
      }
      set_default_fee_policy: {
        Args: { p_club_id?: string; p_policy?: string; p_team_id?: string }
        Returns: undefined
      }
      set_rsvp: {
        Args: {
          p_event_id: string
          p_note?: string
          p_player_id: string
          p_status: string
        }
        Returns: undefined
      }
      set_thread_archived: {
        Args: { p_archived: boolean; p_thread_id: string }
        Returns: undefined
      }
      set_thread_mute: {
        Args: { p_thread_id: string; p_until: string }
        Returns: undefined
      }
      staff_set_rsvp: {
        Args: {
          p_event_id: string
          p_note?: string
          p_player_id: string
          p_status: string
        }
        Returns: undefined
      }
      svc_attach_payment_intent: {
        Args: { p_payment_id: string; p_pi: string }
        Returns: undefined
      }
      svc_attach_refund: {
        Args: {
          p_refund_id: string
          p_status?: string
          p_stripe_refund_id: string
        }
        Returns: undefined
      }
      svc_cleanup_rate_limits: { Args: never; Returns: number }
      svc_dispute_event: {
        Args: {
          p_charge?: string
          p_dispute_id: string
          p_outcome?: string
          p_payment_id?: string
          p_phase: string
          p_pi: string
        }
        Returns: string
      }
      svc_fail_refund: { Args: { p_refund_id: string }; Returns: undefined }
      svc_finish_event: {
        Args: { p_error?: string; p_event_id: string; p_final?: boolean }
        Returns: undefined
      }
      svc_ledger_event: {
        Args: {
          p_account: string
          p_event_id: string
          p_livemode: boolean
          p_payload: Json
          p_type: string
        }
        Returns: string
      }
      svc_payment_status: {
        Args: { p_payment_id?: string; p_pi: string; p_status: string }
        Returns: string
      }
      svc_payment_succeeded: {
        Args: {
          p_amount?: number
          p_application_fee?: number
          p_charge?: string
          p_currency?: string
          p_destination?: string
          p_payment_id?: string
          p_pi: string
          p_stripe_fee?: number
        }
        Returns: string
      }
      svc_rate_limit: {
        Args: { p_bucket: string; p_limit: number; p_window_seconds: number }
        Returns: boolean
      }
      svc_reconcile_candidates: { Args: { p_stale?: string }; Returns: Json }
      svc_reconcile_candidates_base: {
        Args: { p_stale?: string }
        Returns: Json
      }
      svc_refund_event: {
        Args: {
          p_charge?: string
          p_payment_id?: string
          p_pi: string
          p_refunds: Json
        }
        Returns: string
      }
      svc_release_payment: {
        Args: { p_payment_id: string }
        Returns: undefined
      }
      svc_reserve_payment: {
        Args: { p_request_ids: string[]; p_uid: string }
        Returns: Json
      }
      svc_set_account_status: {
        Args: {
          p_charges_enabled: boolean
          p_deauthorized?: boolean
          p_details_submitted: boolean
          p_payouts_enabled: boolean
          p_requirements?: Json
          p_stripe_account_id: string
        }
        Returns: string
      }
      team_record: {
        Args: { p_team_id: string }
        Returns: {
          games: number
          losses: number
          season_label: string
          ties: number
          wins: number
        }[]
      }
      team_schedule: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_team_id: string
          p_when?: string
        }
        Returns: {
          arrive_early_minutes: number
          cancelled_reason: string
          ends_at: string
          game_format: Json
          going: number
          home_away: string
          id: string
          location_address: string
          location_id: string
          location_name: string
          location_text: string
          maybe: number
          no_reply: number
          not_going: number
          notes: string
          opponent_id: string
          opponent_name: string
          our_score: number
          outcome: string
          revision: number
          series_id: string
          starts_at: string
          status: string
          team_id: string
          their_score: number
          timezone: string
          title: string
          type: string
        }[]
      }
      team_schedule_range: {
        Args: { p_from: string; p_team_id: string; p_to: string }
        Returns: {
          arrive_early_minutes: number
          cancelled_reason: string
          ends_at: string
          game_format: Json
          going: number
          home_away: string
          id: string
          location_address: string
          location_id: string
          location_name: string
          location_text: string
          maybe: number
          no_reply: number
          not_going: number
          notes: string
          opponent_id: string
          opponent_name: string
          our_score: number
          outcome: string
          revision: number
          series_id: string
          starts_at: string
          status: string
          team_id: string
          their_score: number
          timezone: string
          title: string
          type: string
        }[]
      }
      toggle_reaction: {
        Args: { p_emoji: string; p_message_id: string }
        Returns: boolean
      }
      unlink_team_from_club: { Args: { p_team_id: string }; Returns: undefined }
      update_event: {
        Args: { p_event_id: string; p_patch: Json; p_scope: string }
        Returns: number
      }
      update_payment_event: {
        Args: {
          p_amount_cents: number
          p_audience: string
          p_audience_player_ids: string[]
          p_description: string
          p_due_at: string
          p_event_id: string
          p_fee_policy: string
          p_title: string
        }
        Returns: undefined
      }
      waive_request: {
        Args: { p_note?: string; p_request_id: string }
        Returns: undefined
      }
    }
    Enums: {
      club_role: "admin" | "manager"
      household_relationship: "guardian"
      membership_status: "active" | "inactive"
      request_status: "pending" | "approved" | "declined"
      roster_status: "active" | "inactive"
      sport:
        | "soccer"
        | "basketball"
        | "volleyball"
        | "football"
        | "baseball"
        | "softball"
        | "hockey"
      team_role: "admin" | "coach" | "manager" | "parent" | "player"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
    Enums: {
      club_role: ["admin", "manager"],
      household_relationship: ["guardian"],
      membership_status: ["active", "inactive"],
      request_status: ["pending", "approved", "declined"],
      roster_status: ["active", "inactive"],
      sport: [
        "soccer",
        "basketball",
        "volleyball",
        "football",
        "baseball",
        "softball",
        "hockey",
      ],
      team_role: ["admin", "coach", "manager", "parent", "player"],
    },
  },
} as const
