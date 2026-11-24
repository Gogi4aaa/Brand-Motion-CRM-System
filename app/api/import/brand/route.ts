import { NextResponse, type NextRequest } from "next/server";
import { parseBrandDocx, parseBrandText } from "@/lib/brand-import";

// POST /api/import/brand
// Body: multipart/form-data с `file` (.docx / .md / .txt / .json) ИЛИ `text`
// (поставен текст). Приема и стария номериран Word шаблон, и свободен файл по
// етикети („Основни цветове: #0090B5“), какъвто пише всеки AI — логиката е в
// lib/brand-import.ts. Pure parse — нищо не се записва; служителят преглежда
// разчетеното и той записва.

export const runtime = "nodejs"; // mammoth needs Node APIs (Buffer), not the edge runtime.

const MAX_BYTES = 5 * 1024 * 1024;
const TEXT_EXT = [".md", ".markdown", ".txt", ".json"];

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Очаква се multipart/form-data." }, { status: 400 });
  }

  try {
    const text = form.get("text");
    if (typeof text === "string" && text.trim()) {
      if (text.length > 200_000) return NextResponse.json({ error: "Текстът е твърде дълъг." }, { status: 413 });
      const result = parseBrandText(text);
      return NextResponse.json(result, { status: "error" in result ? 422 : 200 });
    }

    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Липсва файл или текст." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "Файлът е над 5 MB." }, { status: 413 });
    const name = file.name.toLowerCase();
    let result;
    if (name.endsWith(".docx")) result = await parseBrandDocx(Buffer.from(await file.arrayBuffer()));
    else if (TEXT_EXT.some((e) => name.endsWith(e))) result = parseBrandText(await file.text());
    else return NextResponse.json({ error: "Приемам .docx, .md, .txt или .json. За PDF — копирай текста и го постави." }, { status: 400 });
    return NextResponse.json(result, { status: "error" in result ? 422 : 200 });
  } catch (e) {
    console.error("[BrandMotion] brand import parse failed:", e);
    return NextResponse.json({ error: "Файлът не можа да бъде прочетен." }, { status: 500 });
  }
}
