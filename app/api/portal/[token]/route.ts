import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Public client-portal API (no login). Data access goes through the SECURITY
// DEFINER RPC portal_get, which resolves rows only by the unguessable token —
// the anon role has no table access (same pattern as /api/review).
//   GET  /api/portal/<token> → { client_name, items: [...], busy, bookings }
//   POST /api/portal/<token> → { date, start?, end?, note? }  (заявка за снимачен ден)

export const runtime = "nodejs";

const HHMM = /^\d{2}:\d{2}$/;

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

// Клиентът заявява снимачен ден — минава през anon RPC portal_book (валидира
// токена, insert-ва pending заявка и известява админите).
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const client = sb();
  if (!client) return NextResponse.json({ error: "Системата не е конфигурирана." }, { status: 503 });
  const body = await req.json().catch(() => null);
  const date = (body?.date || "").trim();
  const start = (body?.start || "").trim();
  const end = (body?.end || "").trim();
  const note = (body?.note || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "Избери валидна дата." }, { status: 400 });
  if (start && !HHMM.test(start)) return NextResponse.json({ error: "Невалиден начален час." }, { status: 400 });
  if (end && !HHMM.test(end)) return NextResponse.json({ error: "Невалиден краен час." }, { status: 400 });
  if (start && end && end <= start) return NextResponse.json({ error: "Краят трябва да е след началото." }, { status: 400 });

  const { data, error } = await client.rpc("portal_book", {
    p_token: token, p_date: date, p_start: start || null, p_end: end || null, p_note: note,
  });
  if (error) {
    console.error("[BrandMotion] portal_book failed:", error);
    return NextResponse.json({ error: "Грешка при заявката." }, { status: 500 });
  }
  if (!data?.ok) {
    const msg = data?.error === "bad_date" ? "Датата трябва да е днес или в бъдещето."
      : data?.error === "limit" ? "Достигна лимита от 3 снимачни дни. Изчакай потвърждение или се свържи с нас."
      : "Линкът е невалиден или деактивиран.";
    return NextResponse.json({ error: msg }, { status: 409 });
  }
  return NextResponse.json(data);
}
