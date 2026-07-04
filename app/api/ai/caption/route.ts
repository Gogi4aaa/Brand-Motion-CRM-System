import { NextResponse, type NextRequest } from "next/server";
import { aiConfigured, generateCaption } from "@/lib/ai/claude";

// POST /api/ai/caption — generate caption + 3-tier hashtags for a video.
// Body: { title, script?, platforms?, clientName?, industry?, brandVoice?, targetAudience? }

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!aiConfigured()) {
    return NextResponse.json({ error: "AI не е конфигуриран — задай ANTHROPIC_API_KEY в .env.local." }, { status: 503 });
  }
  const body = await req.json().catch(() => null);
  if (!body?.title || typeof body.title !== "string") {
    return NextResponse.json({ error: "Липсва заглавие." }, { status: 400 });
  }
  try {
    const result = await generateCaption(body);
    return NextResponse.json(result);
  } catch (e) {
    console.error("[BrandMotion] AI caption failed:", e);
    return NextResponse.json({ error: "Генерирането не успя. Опитай пак." }, { status: 500 });
  }
}
