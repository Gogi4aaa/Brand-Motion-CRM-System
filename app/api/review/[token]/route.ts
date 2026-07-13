import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Public client-review API (no login). All data access goes through the
// SECURITY DEFINER RPCs review_get / review_decide, which look rows up only
// by the unguessable token — the anon role has no table access.
//   GET  /api/review/<token>            → the content to review
//   POST /api/review/<token>            → { decision: 'approved'|'changes_requested', feedback?, suggested_script? }

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
  const { data, error } = await client.rpc("review_get", { p_token: token });
  if (error) {
    console.error("[BrandMotion] review_get failed:", error);
    return NextResponse.json({ error: "Грешка при зареждане." }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Линкът е невалиден или изтекъл." }, { status: 404 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const client = sb();
  if (!client) return NextResponse.json({ error: "Системата не е конфигурирана." }, { status: 503 });
  const body = await req.json().catch(() => null);
  const decision = body?.decision;
  if (decision !== "approved" && decision !== "changes_requested") {
    return NextResponse.json({ error: "Невалидно решение." }, { status: 400 });
  }
  const feedback = (body?.feedback || "").trim();
  const suggested = (body?.suggested_script || "").trim();
  if (decision === "changes_requested" && !feedback && !suggested) {
    return NextResponse.json({ error: "Редактирай сценария или напиши бележка какви промени искаш." }, { status: 400 });
  }
  const { data, error } = await client.rpc("review_decide", {
    p_token: token,
    p_decision: decision,
    p_feedback: feedback,
    p_suggested: suggested,
  });
  if (error) {
    console.error("[BrandMotion] review_decide failed:", error);
    return NextResponse.json({ error: "Грешка при записване." }, { status: 500 });
  }
  if (!data?.ok) return NextResponse.json({ error: "Този линк вече е използван." }, { status: 409 });
  return NextResponse.json(data);
}
