import { NextResponse, type NextRequest } from "next/server";
import { aiConfigured, generateIdeas } from "@/lib/ai/claude";

// POST /api/ai/ideas — generate content ideas for a client.
// Body: { count?, clientName?, industry?, brandVoice?, targetAudience?, extraContext? }

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!aiConfigured()) {
    return NextResponse.json({ error: "AI не е конфигуриран — задай ANTHROPIC_API_KEY в .env.local." }, { status: 503 });
  }
  const body = await req.json().catch(() => ({}));
  try {
    const result = await generateIdeas(body || {});
    return NextResponse.json(result);
  } catch (e) {
    console.error("[BrandMotion] AI ideas failed:", e);
    return NextResponse.json({ error: "Генерирането не успя. Опитай пак." }, { status: 500 });
  }
}
