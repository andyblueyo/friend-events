import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import type { Database } from "@/lib/database.types";
import { supabaseEnv } from "./env";

/**
 * Supabase client for server components, route handlers and server actions.
 *
 * Must be awaited per request — never cache the returned client across
 * requests, it is bound to that request's cookies.
 */
export async function createClient() {
  const { url, anonKey } = supabaseEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server components can't set cookies. The proxy refreshes the
          // session on every request, so it's safe to ignore here.
        }
      },
    },
  });
}
