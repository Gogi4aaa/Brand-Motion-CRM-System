import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Клиентът решава за готово видео от портала си (без логин).
//   POST /api/portal/<token>/review → { item, decision: 'approved'|'changes', feedback? }
// Минава през anon RPC portal_review: то проверява, че видеото е на клиента
// зад този токен и че още чака преглед, записва решението и известява екипа.

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.json({ error: "Системата не е конфигурирана." }, { status: 503 });
  const client = createClient(url, anon, { auth: { persistSession: false } });

  const body = await req.json().catch(() => null);
  const item = typeof body?.item === "string" ? body.item : "";
  const decision = body?.decision;
  const feedback = (typeof body?.feedback === "string" ? body.feedback : "").trim().slice(0, 4000);
  if (!item || (decision !== "approved" && decision !== "changes")) {
    return NextResponse.json({ error: "Невалидна заявка." }, { status: 400 });
  }
  if (decision === "changes" && !feedback) {
    return NextResponse.json({ error: "Напиши какво да променим." }, { status: 400 });
  }

  const { data, error } = await client.rpc("portal_review", {
    p_token: token, p_item: item, p_decision: decision, p_feedback: feedback,
  });
  if (error) {
    console.error("[BrandMotion] portal_review failed:", error);
    return NextResponse.json({ error: "Грешка при записване." }, { status: 500 });
  }
  if (!data?.ok) {
    const msg = data?.error === "not_pending" ? "Това видео вече не чака преглед — обнови страницата."
      : data?.error === "no_feedback" ? "Напиши какво да променим."
      : "Линкът е невалиден или деактивиран.";
    return NextResponse.json({ error: msg }, { status: 409 });
  }
  return NextResponse.json(data);
}
