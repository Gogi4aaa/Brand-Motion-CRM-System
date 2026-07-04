import { NextResponse, type NextRequest } from "next/server";
import { aiConfigured, generateScript } from "@/lib/ai/claude";

// POST /api/ai/script — generate 3 script variants (hook/body/payoff/cta).
// Body: { title, notes?, type?, durationSec?, clientName?, industry?, brandVoice?, targetAudience? }

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!aiConfigured()) {
    return NextResponse.json({ error: "AI не е конфигуриран — задай ANTHROPIC_API_KEY в .env.local." }, { status: 503 });
  }
  const body = await req.json().catch(() => null);
  if (!body?.title || typeof body.title !== "string") {
    return NextResponse.json({ error: "Липсва заглавие/тема." }, { status: 400 });
  }
  try {
    const result = await generateScript(body);
    return NextResponse.json(result);
  } catch (e) {
    console.error("[BrandMotion] AI script failed:", e);
    return NextResponse.json({ error: "Генерирането не успя. Опитай пак." }, { status: 500 });
  }
}
