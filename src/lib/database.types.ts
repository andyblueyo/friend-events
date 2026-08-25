/**
 * Hand-maintained mirror of supabase/migrations/*.sql.
 *
 * Once the project is linked you can regenerate this instead:
 *   npx supabase gen types typescript --linked > src/lib/database.types.ts
 */

export type FriendshipStatus = "pending" | "accepted";

export type UserRow = {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  created_at: string;
}

export type FriendshipRow = {
  id: string;
  user_a: string;
  user_b: string;
  status: FriendshipStatus;
  requested_by: string;
  created_at: string;
}

export type EventRow = {
  id: string;
  posted_by: string;
  title: string;
  event_datetime: string | null;
  location: string | null;
  image_url: string | null;
  source_url: string;
  created_at: string;
}

export type EventInterestRow = {
  id: string;
  event_id: string;
  user_id: string;
  created_at: string;
}

export type Database = {
  public: {
    Tables: {
      users: {
        Row: UserRow;
        Insert: Omit<UserRow, "created_at"> & { created_at?: string };
        Update: Partial<Omit<UserRow, "id" | "created_at">>;
        Relationships: [];
      };
      friendships: {
        Row: FriendshipRow;
        Insert: Omit<FriendshipRow, "id" | "status" | "created_at"> & {
          id?: string;
          status?: FriendshipStatus;
          created_at?: string;
        };
        Update: Partial<Pick<FriendshipRow, "status">>;
        Relationships: [];
      };
      events: {
        Row: EventRow;
        Insert: Omit<EventRow, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<EventRow, "id" | "posted_by" | "created_at">>;
        Relationships: [];
      };
      event_interest: {
        Row: EventInterestRow;
        Insert: Omit<EventInterestRow, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      are_friends: {
        Args: { one: string; two: string };
        Returns: boolean;
      };
      friendship_pair: {
        Args: { one: string; two: string };
        Returns: { user_a: string; user_b: string }[];
      };
    };
    Enums: {
      friendship_status: FriendshipStatus;
    };
    CompositeTypes: Record<never, never>;
  };
}
