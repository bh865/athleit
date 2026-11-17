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
      claim_player_login: { Args: { p_player_id: string }; Returns: string }
      create_club: { Args: { p_name: string; p_slug: string }; Returns: string }
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
      create_team: {
        Args: {
          p_club_id?: string
          p_name: string
          p_season_label: string
          p_sport: Database["public"]["Enums"]["sport"]
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
      find_club: {
        Args: { p_slug: string }
        Returns: {
          id: string
          name: string
          slug: string
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
      revoke_invite: { Args: { p_invite_id: string }; Returns: undefined }
      rotate_team_join_code: { Args: { p_team_id: string }; Returns: string }
      unlink_team_from_club: { Args: { p_team_id: string }; Returns: undefined }
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
