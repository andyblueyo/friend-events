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

export type PriceType = "free" | "paid";
export type RsvpType = "registration" | "drop_in";

export type AudienceMode = "all" | "tags";

export type EventRow = {
  id: string;
  posted_by: string;
  // Nullable now: a fork stores no title/date/location/image of its own —
  // those resolve through root_event_id at read time. Only ever null when
  // forked_from_event_id is set.
  title: string | null;
  event_datetime: string | null;
  end_datetime: string | null;
  location: string | null;
  notes: string | null;
  price_type: PriceType | null;
  rsvp_type: RsvpType | null;
  image_url: string | null;
  source_url: string;
  created_at: string;
  forked_from_event_id: string | null;
  root_event_id: string;
  deleted_at: string | null;
  audience_mode: AudienceMode;
}

export type TagRow = {
  id: string;
  owner_id: string;
  name: string;
  created_at: string;
}

export type TagMemberRow = {
  id: string;
  tag_id: string;
  friend_id: string;
  created_at: string;
}

export type EventTagRow = {
  id: string;
  event_id: string;
  tag_id: string;
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

/**
 * One person who marked interest in an event, as embedded in
 * FeedEventRow.interested_friends.
 */
export type InterestedFriend = {
  id: string;
  display_name: string;
  handle: string;
  avatar_url: string | null;
};

/**
 * One of the poster's own tags an event is scoped to, as embedded in
 * FeedEventRow.audience_tags. member_count is live (recomputed on every
 * read), not a snapshot of who saw it at post time.
 */
export type AudienceTag = {
  id: string;
  name: string;
  member_count: number;
};

/** Row shape returned by the list_tags() RPC. */
export type TagListRow = {
  tag_id: string;
  name: string;
  created_at: string;
  members: InterestedFriend[];
};

/** Row shape returned by the list_feed_events() RPC. */
export type FeedEventRow = {
  id: string;
  title: string;
  event_datetime: string | null;
  end_datetime: string | null;
  location: string | null;
  notes: string | null;
  price_type: PriceType | null;
  rsvp_type: RsvpType | null;
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
  is_fork: boolean;
  already_forked_by_me: boolean;
  /**
   * The interested users the *viewer* is friends with (plus the viewer
   * themselves), oldest interest first. jsonb_agg returns null rather than an
   * empty array, and this can be null even when interest_count > 0 — every
   * interested user may be a stranger to the viewer.
   */
  interested_friends: InterestedFriend[] | null;
  audience_mode: AudienceMode;
  /**
   * The poster's own tags this event is scoped to. Only ever populated when
   * is_mine is true and audience_mode is "tags" — the underlying tag names
   * are private to the poster, so this must stay null for anyone else's
   * event even though list_feed_events() is security definer.
   */
  audience_tags: AudienceTag[] | null;
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
        // root_event_id is set by the events_set_root trigger — never
        // supplied by the app. forked_from_event_id and deleted_at default
        // to null; forking goes through the fork_event() RPC below, not a
        // direct insert, so most callers still never touch it.
        Insert: Omit<
          EventRow,
          "id" | "created_at" | "root_event_id" | "forked_from_event_id" | "deleted_at"
        > & {
          id?: string;
          created_at?: string;
          forked_from_event_id?: string | null;
          deleted_at?: string | null;
        };
        Update: Partial<
          Omit<EventRow, "id" | "posted_by" | "created_at" | "root_event_id">
        >;
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
      tags: {
        Row: TagRow;
        Insert: Omit<TagRow, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Pick<TagRow, "name">>;
        Relationships: [];
      };
      tag_members: {
        Row: TagMemberRow;
        Insert: Omit<TagMemberRow, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      event_tags: {
        Row: EventTagRow;
        Insert: Omit<EventTagRow, "id"> & { id?: string };
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
      fork_event: {
        Args: { p_event_id: string };
        Returns: string;
      };
      delete_event: {
        Args: { p_event_id: string };
        Returns: undefined;
      };
      can_view_event_audience: {
        Args: { viewer: string; target_event: string };
        Returns: boolean;
      };
      list_tags: {
        Args: Record<string, never>;
        Returns: TagListRow[];
      };
      set_friend_tags: {
        Args: { p_friend_id: string; p_tag_ids: string[] };
        Returns: undefined;
      };
    };
    Enums: {
      friendship_status: FriendshipStatus;
    };
    CompositeTypes: Record<never, never>;
  };
}
