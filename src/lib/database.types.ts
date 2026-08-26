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
  handle: string;
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

/** Relationship between the viewer and a search result. */
export type RelationshipState =
  | "none"
  | "pending_sent"
  | "pending_received"
  | "friends";

/** Row shape returned by the search_people() RPC. */
export type SearchPersonRow = {
  id: string;
  display_name: string;
  handle: string;
  avatar_url: string | null;
  friendship_id: string | null;
  state: RelationshipState;
};

/** Row shape returned by the list_friendships() RPC. */
export type FriendshipListRow = {
  friendship_id: string;
  status: FriendshipStatus;
  requested_by: string;
  created_at: string;
  other_id: string;
  other_display_name: string;
  other_handle: string;
  other_avatar_url: string | null;
};

/** Row shape returned by the list_feed_events() RPC. */
export type FeedEventRow = {
  id: string;
  title: string;
  event_datetime: string | null;
  location: string | null;
  image_url: string | null;
  source_url: string;
  created_at: string;
  posted_by: string;
  poster_display_name: string;
  poster_handle: string;
  poster_avatar_url: string | null;
  is_mine: boolean;
  is_interested: boolean;
  interest_count: number;
};

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
      handle_available: {
        Args: { candidate: string };
        Returns: boolean;
      };
      search_people: {
        Args: { q: string };
        Returns: SearchPersonRow[];
      };
      list_friendships: {
        Args: Record<string, never>;
        Returns: FriendshipListRow[];
      };
      list_feed_events: {
        Args: Record<string, never>;
        Returns: FeedEventRow[];
      };
    };
    Enums: {
      friendship_status: FriendshipStatus;
    };
    CompositeTypes: Record<never, never>;
  };
}
