/**
 * Shared with the search form. Lives outside actions.ts because a "use server"
 * module may only export async functions.
 *
 * Two characters minimum matches the guard inside search_people() — a
 * single-letter query would effectively list every user.
 */
export const MIN_QUERY_LENGTH = 2;
