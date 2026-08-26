#!/usr/bin/env node
/**
 * Schema drift check: does the database actually have every object the code
 * expects?
 *
 * We apply migrations by pasting them into the Supabase SQL editor, so nothing
 * records what's been run. This closes that loop — it asks the live database
 * about each object the app depends on, and fails loudly if one is missing.
 * Run it after applying a migration, and before blaming the app code for a
 * "function not found".
 *
 * Uses only the anon key from .env.local, so it needs no extra credentials.
 * It never reads row data: it distinguishes "exists but RLS says no" (401/403)
 * from "doesn't exist" (PGRST202 / PGRST205 / 42703).
 *
 *   npm run db:check
 */

import { readFileSync } from "node:fs";

/** Every DB object the application code references, and where it comes from. */
const EXPECTED = {
  tables: [
    { name: "users", migration: "0001" },
    { name: "friendships", migration: "0001" },
    { name: "events", migration: "0001" },
    { name: "event_interest", migration: "0001" },
  ],
  columns: [
    { table: "users", column: "handle", migration: "0003" },
    { table: "events", column: "source_url", migration: "0001" },
    { table: "friendships", column: "requested_by", migration: "0001" },
  ],
  functions: [
    { name: "friendship_pair", body: { one: ZERO_UUID(), two: ZERO_UUID() }, migration: "0001" },
    { name: "are_friends", body: { one: ZERO_UUID(), two: ZERO_UUID() }, migration: "0001" },
    { name: "handle_available", body: { candidate: "zzcheck" }, migration: "0003" },
    { name: "search_people", body: { q: "zz" }, migration: "0004" },
    { name: "list_friendships", body: {}, migration: "0004" },
    { name: "list_feed_events", body: {}, migration: "0005" },
  ],
};

function ZERO_UUID() {
  return "00000000-0000-0000-0000-000000000000";
}

function loadEnv() {
  let raw;
  try {
    raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  } catch {
    fail("Couldn't read .env.local — copy .env.example and fill it in.");
  }

  const env = {};
  for (const line of raw.split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }

  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) fail("Missing Supabase URL or anon key in .env.local.");

  return { url: url.replace(/\/$/, ""), key };
}

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

/** Missing-object error codes, as opposed to permission errors. */
const MISSING_CODES = new Set([
  "PGRST202", // function not found
  "PGRST205", // table not found in schema cache
  "42703", // column does not exist
  "42P01", // relation does not exist
]);

async function probe(url, key, path, init = {}) {
  const response = await fetch(`${url}${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  // 401/403 means the object is there and RLS or GRANT stopped us, which is
  // exactly what we expect for an anonymous caller.
  if (response.status === 401 || response.status === 403) {
    return { present: true };
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    /* empty body is fine */
  }

  const code = payload?.code;
  if (code && MISSING_CODES.has(code)) {
    return { present: false, detail: `${code}: ${payload.message ?? ""}`.trim() };
  }

  return { present: true };
}

async function main() {
  const { url, key } = loadEnv();
  const rest = `${url}/rest/v1`;
  const missing = [];
  const lines = [];

  for (const { name, migration } of EXPECTED.tables) {
    const { present, detail } = await probe(rest, key, `/${name}?select=*&limit=1`);
    lines.push([present, `table    ${name}`, migration, detail]);
    if (!present) missing.push({ kind: "table", name, migration });
  }

  for (const { table, column, migration } of EXPECTED.columns) {
    const { present, detail } = await probe(
      rest,
      key,
      `/${table}?select=${column}&limit=1`,
    );
    lines.push([present, `column   ${table}.${column}`, migration, detail]);
    if (!present) missing.push({ kind: "column", name: `${table}.${column}`, migration });
  }

  for (const { name, body, migration } of EXPECTED.functions) {
    const { present, detail } = await probe(rest, key, `/rpc/${name}`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    lines.push([present, `function ${name}()`, migration, detail]);
    if (!present) missing.push({ kind: "function", name, migration });
  }

  for (const [present, label, migration, detail] of lines) {
    const mark = present ? "✓" : "✗";
    const suffix = present ? "" : `  ← ${detail}`;
    console.log(`  ${mark} ${label.padEnd(34)} ${migration}${suffix}`);
  }

  if (missing.length === 0) {
    console.log("\n✓ Database matches the migrations the code expects.");
    return;
  }

  const behind = [...new Set(missing.map((item) => item.migration))].sort();
  console.error(
    `\n✗ ${missing.length} object(s) missing. Unapplied migration(s): ${behind.join(", ")}`,
  );
  console.error("  Apply the matching file(s) in supabase/migrations/, then re-run.");
  process.exit(1);
}

main().catch((error) => fail(error.message));
