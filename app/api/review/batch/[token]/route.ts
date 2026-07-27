import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Public grouped-review API (no login). Resolves a batch token to the client
// name + every video in the group through the SECURITY DEFINER RPC
// review_batch_get. Per-video decisions reuse POST /api/review/<approval_id>.
//   GET /api/review/batch/<token> → { client_name, items: [...] }

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
  const { data, error } = await client.rpc("review_batch_get", { p_token: token });
  if (error) {
    console.error("[BrandMotion] review_batch_get failed:", error);
    return NextResponse.json({ error: "Грешка при зареждане." }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Линкът е невалиден или изтекъл." }, { status: 404 });
  return NextResponse.json(data);
}
