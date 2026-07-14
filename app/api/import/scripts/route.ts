import { NextResponse, type NextRequest } from "next/server";
import mammoth from "mammoth";

// POST /api/import/scripts
// Body: multipart/form-data with a single `file` field (a .docx export).
// Splits the document into one video per title. A title is either:
//   * a real Word heading (<h1..h6>), or
//   * a paragraph that is entirely bold (as в Google Docs експортите), or
//   * a paragraph that започва с „Видео N“.
// Within each video, "Hook:" / "Скрипт:" / "CTA:" маркерите (ако ги има) се
// разпределят в отделните полета; иначе целият текст става сценарий.
// Pure parse — no DB writes happen here (the client confirms first).

export const runtime = "nodejs"; // mammoth needs Node APIs (Buffer), not the edge runtime.

interface ParsedVideo {
  title: string;
  script: string;
  hook?: string;
  cta?: string;
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

// Секционни маркери в тялото на едно видео (ред "Hook:" или "Hook: текст…").
const SECTION_RE = /^(hook|кука|скрипт|script|сценарий|cta|ста|призив)\s*[::]?\s*(.*)$/i;
const sectionKey = (word: string): "hook" | "script" | "cta" => {
  const w = word.toLowerCase();
  if (w === "hook" || w === "кука") return "hook";
  if (w === "cta" || w === "ста" || w === "призив") return "cta";
  return "script";
};

// Разпределя редовете на видеото по Hook/Скрипт/CTA секции; без маркери —
// всичко е сценарий.
function splitSections(text: string): { script: string; hook?: string; cta?: string } {
  const buckets: Record<"hook" | "script" | "cta", string[]> = { hook: [], script: [], cta: [] };
  let current: "hook" | "script" | "cta" | null = null;
  let sawMarker = false;
  for (const line of text.split("\n")) {
    const m = line.match(SECTION_RE);
    if (m) {
      sawMarker = true;
      current = sectionKey(m[1]);
      if (m[2].trim()) buckets[current].push(m[2].trim());
      continue;
    }
    buckets[current ?? "script"].push(line);
  }
  if (!sawMarker) return { script: text };
  const join = (a: string[]) => a.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return { script: join(buckets.script), hook: join(buckets.hook) || undefined, cta: join(buckets.cta) || undefined };
}

interface TitleMark { title: string; start: number; end: number }

function findHeadingTitles(html: string): TitleMark[] {
  const heads: TitleMark[] = [];
  let m: RegExpExecArray | null;
  while ((m = HEADING_RE.exec(html)) !== null) {
    const title = htmlToText(m[1]).replace(/\n+/g, " ").trim();
    if (title) heads.push({ title, start: m.index, end: m.index + m[0].length });
  }
  return heads;
}

// Google Docs експортите нямат Heading стилове — заглавието е удебелен
// параграф („Видео 1 – …“). Параграф се брои за заглавие, ако целият му
// текст е в <strong>/<b>, или започва с „Видео N“.
const PARA_RE = /<p[^>]*>([\s\S]*?)<\/p>/gi;
function findBoldTitles(html: string): TitleMark[] {
  const marks: TitleMark[] = [];
  let m: RegExpExecArray | null;
  while ((m = PARA_RE.exec(html)) !== null) {
    const inner = m[1];
    const text = htmlToText(inner).replace(/\n+/g, " ").trim();
    if (!text || text.length > 120) continue;
    const boldText = (inner.match(/<(strong|b)[^>]*>([\s\S]*?)<\/(strong|b)>/gi) || [])
      .map((x) => htmlToText(x)).join(" ").replace(/\s+/g, " ").trim();
    const fullyBold = boldText.length > 0 && boldText.replace(/\s+/g, "") === text.replace(/\s+/g, "");
    const looksLikeVideo = /^видео\s*№?\s*\d+/i.test(text);
    // Секционните маркери (Hook:/Скрипт:/CTA:) често също са удебелени — те не са заглавия.
    const isSectionMarker = SECTION_RE.test(text) && text.length < 40 && !looksLikeVideo;
    if ((fullyBold || looksLikeVideo) && !isSectionMarker) {
      marks.push({ title: text, start: m.index, end: m.index + m[0].length });
    }
  }
  return marks;
}

function splitVideos(html: string): ParsedVideo[] {
  let marks = findHeadingTitles(html);
  if (marks.length === 0) marks = findBoldTitles(html);
  return marks
    .map((h, i) => {
      const bodyHtml = html.slice(h.end, i + 1 < marks.length ? marks[i + 1].start : html.length);
      const sections = splitSections(htmlToText(bodyHtml));
      return { title: h.title, ...sections };
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
    const videos = splitVideos(html);
    if (videos.length === 0) {
      return NextResponse.json(
        { error: "Не са намерени заглавия. Всяко видео трябва да започва със заглавие — Heading стил, изцяло удебелен ред или ред „Видео 1 – …“." },
        { status: 422 }
      );
    }
    return NextResponse.json({ videos });
  } catch (e) {
    console.error("[BrandMotion] script import parse failed:", e);
    return NextResponse.json({ error: "Файлът не можа да бъде прочетен." }, { status: 500 });
  }
}
