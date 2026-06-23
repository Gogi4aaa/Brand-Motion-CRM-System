import { NextResponse, type NextRequest } from "next/server";
import mammoth from "mammoth";

// POST /api/import/scripts
// Body: multipart/form-data with a single `file` field (a .docx export).
// Converts the doc to HTML and splits it into one video per heading
// (deterministic: each <h1..h6> starts a new video, content until the next
// heading is that video's script body). Returns { videos: [{ title, script }] }.
// Pure parse — no DB writes happen here (the client confirms first).

export const runtime = "nodejs"; // mammoth needs Node APIs (Buffer), not the edge runtime.

interface ParsedVideo {
  title: string;
  script: string;
}

const HEADING_RE = /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi;

// Turn a fragment of mammoth HTML into readable plain text: paragraphs/list
// items/line breaks become newlines, every other tag is dropped, entities decoded.
function htmlToText(html: string): string {
  return html
    .replace(/<\/(p|li|div|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .trim();
}

function splitOnHeadings(html: string): ParsedVideo[] {
  const heads: { title: string; start: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = HEADING_RE.exec(html)) !== null) {
    heads.push({
      title: htmlToText(m[1]).replace(/\n+/g, " ").trim(),
      start: m.index,
      end: m.index + m[0].length,
    });
  }

  return heads
    .map((h, i) => {
      const bodyHtml = html.slice(h.end, i + 1 < heads.length ? heads[i + 1].start : html.length);
      return { title: h.title, script: htmlToText(bodyHtml) };
    })
    .filter((v) => v.title.length > 0);
}

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Очаква се multipart/form-data." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Липсва файл." }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith(".docx")) {
    return NextResponse.json({ error: "Файлът трябва да е .docx." }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const { value: html } = await mammoth.convertToHtml({ buffer });
    const videos = splitOnHeadings(html);
    if (videos.length === 0) {
      return NextResponse.json(
        { error: "Не са намерени заглавия. Всяко видео трябва да започва със заглавие (Heading)." },
        { status: 422 }
      );
    }
    return NextResponse.json({ videos });
  } catch (e) {
    console.error("[BrandMotion] script import parse failed:", e);
    return NextResponse.json({ error: "Файлът не можа да бъде прочетен." }, { status: 500 });
  }
}
