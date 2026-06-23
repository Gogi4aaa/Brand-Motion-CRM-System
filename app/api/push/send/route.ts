import { NextResponse, type NextRequest } from "next/server";
import webpush from "web-push";
import { createClient } from "@/lib/supabase/server";

// POST /api/push/send  { recipient, title, body, link }
// Sends a Web Push to every browser subscription registered for `recipient`.
// No-ops (returns { skipped }) until VAPID keys are configured, so the rest of
// the notification system works without web push set up.

export const runtime = "nodejs"; // web-push needs Node crypto.

const PUB = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const PRIV = process.env.VAPID_PRIVATE_KEY;
const SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@brandmotion.app";

interface SubRow { endpoint: string; p256dh: string; auth: string }

export async function POST(req: NextRequest) {
  if (!PUB || !PRIV) return NextResponse.json({ skipped: "vapid-unset" });
  webpush.setVapidDetails(SUBJECT, PUB, PRIV);

  let payload: { recipient?: string; title?: string; body?: string; link?: string };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const { recipient, title, body, link } = payload;
  if (!recipient) return NextResponse.json({ error: "no recipient" }, { status: 400 });

  const sb = await createClient();
  const { data: subs } = await sb.from("push_subscriptions").select("endpoint, p256dh, auth").eq("recipient", recipient);
  if (!subs?.length) return NextResponse.json({ sent: 0 });

  const msg = JSON.stringify({ title: title || "BrandMotion", body: body || "", link: link || "/production" });
  const rows = subs as SubRow[];
  const results = await Promise.allSettled(
    rows.map((s) => webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, msg))
  );

  // Prune subscriptions the push service has retired (404 Gone / 410).
  const dead = rows.filter((_, i) => {
    const r = results[i];
    const code = r.status === "rejected" ? (r.reason as { statusCode?: number })?.statusCode : 0;
    return code === 404 || code === 410;
  });
  if (dead.length) await sb.from("push_subscriptions").delete().in("endpoint", dead.map((d) => d.endpoint));

  return NextResponse.json({ sent: results.filter((r) => r.status === "fulfilled").length });
}
