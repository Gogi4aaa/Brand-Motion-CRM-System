import { type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Публичен .ics feed за личния календар на админа (абонамент по таен токен).
// Връща одобрените снимачни дни като VCALENDAR; резолвът е през anon RPC
// bookings_ics (токенът се проверява в calendar_feeds). Еднопосочно (четене).
//   GET /api/bookings/ics/<token>

export const runtime = "nodejs";

const sb = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  return createClient(url, anon, { auth: { persistSession: false } });
};

interface IcsBooking { id: string; date: string; start: string | null; end: string | null; client: string; note: string }

const esc = (s: string) => (s || "").replace(/\\/g, "\\\\").replace(/[,;]/g, (m) => "\\" + m).replace(/\r?\n/g, "\\n");
const d8 = (iso: string) => iso.replace(/-/g, "");
const t6 = (hhmm: string) => hhmm.replace(":", "") + "00";
const addHour = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return `${String((h + 1) % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};
const dtstamp = () => new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const nextDay = (iso: string) => { const dt = new Date(iso + "T00:00:00Z"); dt.setUTCDate(dt.getUTCDate() + 1); return d8(dt.toISOString().slice(0, 10)); };

function vevent(b: IcsBooking): string {
  const lines = ["BEGIN:VEVENT", `UID:${b.id}@brandmotion`, `DTSTAMP:${dtstamp()}`];
  if (b.start) {
    const end = b.end || addHour(b.start);
    lines.push(`DTSTART:${d8(b.date)}T${t6(b.start)}`, `DTEND:${d8(b.date)}T${t6(end)}`);
  } else {
    lines.push(`DTSTART;VALUE=DATE:${d8(b.date)}`, `DTEND;VALUE=DATE:${nextDay(b.date)}`);
  }
  lines.push(`SUMMARY:${esc("Снимки: " + b.client)}`);
  if (b.note) lines.push(`DESCRIPTION:${esc(b.note)}`);
  lines.push("END:VEVENT");
  return lines.join("\r\n");
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const client = sb();
  if (!client) return new Response("Not configured", { status: 503 });
  const { data, error } = await client.rpc("bookings_ics", { p_token: token });
  if (error) {
    console.error("[BrandMotion] bookings_ics failed:", error);
    return new Response("Error", { status: 500 });
  }
  if (!data) return new Response("Invalid token", { status: 404 });

  const events = (data as IcsBooking[]).map(vevent).join("\r\n");
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//BrandMotion//Bookings//BG",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Снимачни дни",
    events,
    "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");

  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="brandmotion-shoots.ics"',
      "Cache-Control": "public, max-age=300",
    },
  });
}
