/**
 * Handle rules, shared by the signup form and the signup action.
 *
 * Kept out of the "use server" action module because those may only export
 * async functions — a plain `export const` there is a build error.
 *
 * Must stay in step with the users_handle_format CHECK in 0003_handle.sql.
 */
export const HANDLE_PATTERN = "^[a-z0-9_]{3,20}$";

export const HANDLE_HINT =
  "3–20 characters: lowercase letters, numbers, underscores.";

export function isValidHandle(value: string): boolean {
  return new RegExp(HANDLE_PATTERN).test(value);
}
