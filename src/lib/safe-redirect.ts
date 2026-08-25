/**
 * Normalises a `?next=` param to a same-origin path.
 *
 * Anything that isn't a single-slash-prefixed relative path (protocol-relative
 * `//evil.com`, absolute URLs, backslash tricks) falls back to "/", so a
 * crafted magic link can't bounce someone off-site after sign-in.
 */
export function safeNextPath(value: string | null | undefined, fallback = "/") {
  if (!value) return fallback;
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//") || value.startsWith("/\\")) return fallback;
  return value;
}
