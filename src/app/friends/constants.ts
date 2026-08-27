/**
 * Shared with the search form. Lives outside actions.ts because a "use server"
 * module may only export async functions.
 *
 * Two characters minimum matches the guard inside search_people() — a
 * single-letter query would effectively list every user.
 */
export const MIN_QUERY_LENGTH = 2;

/** Matches the tags_name_length CHECK constraint (0011_friend_tags.sql). */
export const TAG_NAME_MIN_LENGTH = 1;
export const TAG_NAME_MAX_LENGTH = 30;
