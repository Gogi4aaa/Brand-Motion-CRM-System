import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Public client-portal API (no login). Data access goes through the SECURITY
// DEFINER RPC portal_get, which resolves rows only by the unguessable token —
// the anon role has no table access (same pattern as /api/review).
//   GET /api/portal/<token> → { client_name, items: [...] }

export const runtime = "nodejs";

const sb = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  return createClient(url, anon, { auth: { persistSession: false } });
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const client = sb();
  if (!client) return NextResponse.json({ error: "Системата не е конфигурирана." }, { status: 503 });
  const { data, error } = await client.rpc("portal_get", { p_token: token });
  if (error) {
    console.error("[BrandMotion] portal_get failed:", error);
    return NextResponse.json({ error: "Грешка при зареждане." }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Линкът е невалиден или деактивиран." }, { status: 404 });
  return NextResponse.json(data);
}
