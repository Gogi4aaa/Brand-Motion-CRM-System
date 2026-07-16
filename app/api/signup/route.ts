import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

// POST /api/signup { name, email, password }
// Създава акаунта БЕЗ да праща валидиращ имейл (admin.createUser не праща
// нищо) — акаунтът остава непотвърден и не може да влиза. Имейлът тръгва
// чак когато администраторът одобри заявката от Екип (auth.resend).
// Изисква SUPABASE_SERVICE_ROLE_KEY в .env.local.

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) {
    return NextResponse.json({ error: "Регистрацията не е конфигурирана (липсва SUPABASE_SERVICE_ROLE_KEY)." }, { status: 503 });
  }

  let body: { name?: string; email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Невалидна заявка." }, { status: 400 });
  }
  const email = (body.email || "").trim().toLowerCase();
  const password = body.password || "";
  const name = (body.name || "").trim() || email.split("@")[0];
  if (!/.+@.+\..+/.test(email)) return NextResponse.json({ error: "Невалиден имейл." }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: "Паролата трябва да е поне 8 знака." }, { status: 400 });

  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: false, // непотвърден: не може да влиза, докато не мине одобрение + имейл
    user_metadata: { name },
  });
  if (error) {
    const msg = /already/i.test(error.message) ? "Вече има акаунт с този имейл." : error.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
