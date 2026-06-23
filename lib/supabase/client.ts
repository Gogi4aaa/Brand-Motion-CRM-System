"use client";

import { createBrowserClient } from "@supabase/ssr";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** True only when both public env vars are present. When false the app falls
 *  back to in-memory mock data so it still runs before Supabase is wired up. */
export const supabaseConfigured = Boolean(url && anon);

export function createClient() {
  if (!supabaseConfigured) {
    throw new Error("Supabase env vars missing — check supabaseConfigured first.");
  }
  return createBrowserClient(url!, anon!);
}
