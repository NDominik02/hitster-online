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
      deck_cards: {
        Row: {
          artist: string
          artwork_url: string | null
          audio_source: string
          audio_url: string | null
          created_at: string
          deck_id: string
          duration_ms: number | null
          id: string
          sort_seed: number
          spotify_uri: string | null
          title: string
          year: number
          year_source: string
          year_uncertain: boolean
        }
        Insert: {
          artist: string
          artwork_url?: string | null
          audio_source: string
          audio_url?: string | null
          created_at?: string
          deck_id: string
          duration_ms?: number | null
          id?: string
          sort_seed?: number
          spotify_uri?: string | null
          title: string
          year: number
          year_source: string
          year_uncertain?: boolean
        }
        Update: {
          artist?: string
          artwork_url?: string | null
          audio_source?: string
          audio_url?: string | null
          created_at?: string
          deck_id?: string
          duration_ms?: number | null
          id?: string
          sort_seed?: number
          spotify_uri?: string | null
          title?: string
          year?: number
          year_source?: string
          year_uncertain?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "deck_cards_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
        ]
      }
      decks: {
        Row: {
          coverage_pct: number
          created_at: string
          id: string
          is_public: boolean
          name: string
          owner_id: string | null
          report: Json
          source_playlist_id: string
          source_playlist_url: string | null
          status: string
          total_tracks: number
          usable_count: number
        }
        Insert: {
          coverage_pct?: number
          created_at?: string
          id?: string
          is_public?: boolean
          name: string
          owner_id?: string | null
          report?: Json
          source_playlist_id: string
          source_playlist_url?: string | null
          status?: string
          total_tracks?: number
          usable_count?: number
        }
        Update: {
          coverage_pct?: number
          created_at?: string
          id?: string
          is_public?: boolean
          name?: string
          owner_id?: string | null
          report?: Json
          source_playlist_id?: string
          source_playlist_url?: string | null
          status?: string
          total_tracks?: number
          usable_count?: number
        }
        Relationships: []
      }
      mb_year_cache: {
        Row: {
          match_score: number | null
          norm_key: string
          resolved_at: string | null
          year: number | null
          year_source: string | null
        }
        Insert: {
          match_score?: number | null
          norm_key: string
          resolved_at?: string | null
          year?: number | null
          year_source?: string | null
        }
        Update: {
          match_score?: number | null
          norm_key?: string
          resolved_at?: string | null
          year?: number | null
          year_source?: string | null
        }
        Relationships: []
      }
      players: {
        Row: {
          auth_uid: string
          color: string
          connected: boolean
          id: string
          joined_at: string
          last_seen_at: string
          missed_turns: number
          name: string
          room_id: string
          seat_order: number
          tokens: number
        }
        Insert: {
          auth_uid: string
          color: string
          connected?: boolean
          id?: string
          joined_at?: string
          last_seen_at?: string
          missed_turns?: number
          name: string
          room_id: string
          seat_order: number
          tokens?: number
        }
        Update: {
          auth_uid?: string
          color?: string
          connected?: boolean
          id?: string
          joined_at?: string
          last_seen_at?: string
          missed_turns?: number
          name?: string
          room_id?: string
          seat_order?: number
          tokens?: number
        }
        Relationships: [
          {
            foreignKeyName: "players_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          code: string
          created_at: string
          current_round_id: string | null
          deck_cursor: number
          deck_id: string
          host_uid: string
          id: string
          settings: Json
          status: Database["public"]["Enums"]["room_status"]
          updated_at: string
          winner_player_ids: string[]
        }
        Insert: {
          code: string
          created_at?: string
          current_round_id?: string | null
          deck_cursor?: number
          deck_id: string
          host_uid: string
          id?: string
          settings?: Json
          status?: Database["public"]["Enums"]["room_status"]
          updated_at?: string
          winner_player_ids?: string[]
        }
        Update: {
          code?: string
          created_at?: string
          current_round_id?: string | null
          deck_cursor?: number
          deck_id?: string
          host_uid?: string
          id?: string
          settings?: Json
          status?: Database["public"]["Enums"]["room_status"]
          updated_at?: string
          winner_player_ids?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "rooms_current_round_fk"
            columns: ["current_round_id"]
            isOneToOne: false
            referencedRelation: "round_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rooms_current_round_fk"
            columns: ["current_round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rooms_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
        ]
      }
      rounds: {
        Row: {
          active_player_id: string
          card_id: string | null
          created_at: string
          id: string
          name_guess: Json | null
          outcome: Database["public"]["Enums"]["card_outcome"] | null
          phase: Database["public"]["Enums"]["round_phase"]
          placement: number | null
          placing_deadline: string | null
          revealed_card: Json | null
          room_id: string
          round_no: number
          steal_deadline: string | null
          steals: Json
        }
        Insert: {
          active_player_id: string
          card_id?: string | null
          created_at?: string
          id?: string
          name_guess?: Json | null
          outcome?: Database["public"]["Enums"]["card_outcome"] | null
          phase?: Database["public"]["Enums"]["round_phase"]
          placement?: number | null
          placing_deadline?: string | null
          revealed_card?: Json | null
          room_id: string
          round_no: number
          steal_deadline?: string | null
          steals?: Json
        }
        Update: {
          active_player_id?: string
          card_id?: string | null
          created_at?: string
          id?: string
          name_guess?: Json | null
          outcome?: Database["public"]["Enums"]["card_outcome"] | null
          phase?: Database["public"]["Enums"]["round_phase"]
          placement?: number | null
          placing_deadline?: string | null
          revealed_card?: Json | null
          room_id?: string
          round_no?: number
          steal_deadline?: string | null
          steals?: Json
        }
        Relationships: [
          {
            foreignKeyName: "rounds_active_player_id_fkey"
            columns: ["active_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rounds_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "deck_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rounds_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      timeline_cards: {
        Row: {
          card_id: string
          created_at: string
          id: string
          is_start: boolean
          placed_round_no: number | null
          player_id: string
          position: number
        }
        Insert: {
          card_id: string
          created_at?: string
          id?: string
          is_start?: boolean
          placed_round_no?: number | null
          player_id: string
          position: number
        }
        Update: {
          card_id?: string
          created_at?: string
          id?: string
          is_start?: boolean
          placed_round_no?: number | null
          player_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "timeline_cards_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "deck_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timeline_cards_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      round_public: {
        Row: {
          active_player_id: string | null
          id: string | null
          outcome: Database["public"]["Enums"]["card_outcome"] | null
          phase: Database["public"]["Enums"]["round_phase"] | null
          placement: number | null
          placing_deadline: string | null
          revealed_card: Json | null
          room_id: string | null
          round_no: number | null
          steal_deadline: string | null
        }
        Insert: {
          active_player_id?: string | null
          id?: string | null
          outcome?: Database["public"]["Enums"]["card_outcome"] | null
          phase?: Database["public"]["Enums"]["round_phase"] | null
          placement?: number | null
          placing_deadline?: string | null
          revealed_card?: never
          room_id?: string | null
          round_no?: number | null
          steal_deadline?: string | null
        }
        Update: {
          active_player_id?: string | null
          id?: string | null
          outcome?: Database["public"]["Enums"]["card_outcome"] | null
          phase?: Database["public"]["Enums"]["round_phase"] | null
          placement?: number | null
          placing_deadline?: string | null
          revealed_card?: never
          room_id?: string | null
          round_no?: number | null
          steal_deadline?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rounds_active_player_id_fkey"
            columns: ["active_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rounds_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      get_timeline: {
        Args: { p_room_id: string }
        Returns: {
          artist: string
          artwork_url: string
          id: string
          is_start: boolean
          placed_round_no: number
          player_id: string
          position: number
          room_id: string
          title: string
          year: number
        }[]
      }
      is_room_host: { Args: { p_room_id: string }; Returns: boolean }
      is_room_member: { Args: { p_room_id: string }; Returns: boolean }
    }
    Enums: {
      card_outcome: "correct" | "wrong" | "timeout" | "disputed"
      room_status: "lobby" | "playing" | "paused" | "finished"
      round_phase: "playing" | "placing" | "stealing" | "reveal" | "done"
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
      card_outcome: ["correct", "wrong", "timeout", "disputed"],
      room_status: ["lobby", "playing", "paused", "finished"],
      round_phase: ["playing", "placing", "stealing", "reveal", "done"],
    },
  },
} as const
