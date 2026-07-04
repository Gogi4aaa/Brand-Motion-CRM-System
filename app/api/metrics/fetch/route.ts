import { NextResponse, type NextRequest } from "next/server";

// Attempt to pull public stats for a posted video, where the platform allows:
//   * YouTube — full stats (views/likes/comments) via the Data API v3 when
//     YOUTUBE_API_KEY is set in .env.local; without a key we can only confirm
//     the video exists (oEmbed carries no counters).
//   * Instagram / Facebook — Meta blocks scraping and gates all insights
//     behind Graph API tokens per business account, so we return a clear
//     explanation instead of silently failing.
//   * TikTok — no public stats API; oEmbed confirms the post but has no counters.
// Everything else stays manual entry in the content modal.
//   GET /api/metrics/fetch?url=<post url>

export const runtime = "nodejs";

const youtubeId = (u: URL): string | null => {
  if (u.hostname === "youtu.be") return u.pathname.slice(1) || null;
  if (u.hostname.endsWith("youtube.com")) {
    if (u.pathname === "/watch") return u.searchParams.get("v");
    const m = u.pathname.match(/^\/(shorts|embed)\/([^/]+)/);
    if (m) return m[2];
  }
  return null;
};

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("url") || "";
  let u: URL;
  try { u = new URL(raw); } catch { return NextResponse.json({ error: "Невалиден линк." }, { status: 400 }); }
  const host = u.hostname.replace(/^www\./, "");

  try {
    const ytId = youtubeId(u);
    if (ytId) {
      const key = process.env.YOUTUBE_API_KEY;
      if (!key) {
        return NextResponse.json({ platform: "YouTube", note: "За автоматични YouTube статистики добави YOUTUBE_API_KEY в .env.local (Google Cloud → YouTube Data API v3). Дотогава въведи числата ръчно." });
      }
      const r = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${ytId}&key=${key}`, { cache: "no-store" });
      const j = await r.json();
      const s = j?.items?.[0]?.statistics;
      if (!s) return NextResponse.json({ error: "Видеото не е намерено в YouTube." }, { status: 404 });
      return NextResponse.json({
        platform: "YouTube",
        views: Number(s.viewCount || 0),
        likes: Number(s.likeCount || 0),
        comments: Number(s.commentCount || 0),
        note: "Дръпнато от YouTube Data API.",
      });
    }

    if (host.endsWith("tiktok.com")) {
      const r = await fetch("https://www.tiktok.com/oembed?url=" + encodeURIComponent(raw), { cache: "no-store" });
      if (!r.ok) return NextResponse.json({ error: "TikTok не намери тази публикация." }, { status: 404 });
      return NextResponse.json({ platform: "TikTok", note: "Публикацията е потвърдена, но TikTok не дава публични бройки без бизнес API — въведи числата ръчно от приложението." });
    }

    if (host.endsWith("instagram.com") || host.endsWith("facebook.com") || host.endsWith("fb.watch")) {
      return NextResponse.json({
        platform: host.includes("instagram") ? "Instagram" : "Facebook",
        note: "Meta не позволява скрейпване — статистиките изискват свързан бизнес акаунт през Graph API. Засега въведи числата ръчно от Insights.",
      });
    }

    return NextResponse.json({ note: "Непозната платформа — въведи резултатите ръчно." });
  } catch (e) {
    console.error("[BrandMotion] metrics fetch failed:", e);
    return NextResponse.json({ error: "Грешка при връзката с платформата." }, { status: 502 });
  }
}
