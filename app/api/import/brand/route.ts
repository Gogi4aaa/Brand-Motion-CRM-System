import { NextResponse, type NextRequest } from "next/server";
import { parseBrandDocx } from "@/lib/brand-import";

// POST /api/import/brand
// Body: multipart/form-data с едно поле `file` (.docx — попълненият бранд
// въпросник от шаблона /brand-questionnaire.docx). Логиката е в
// lib/brand-import.ts. Pure parse — нищо не се записва; служителят преглежда
// разчетеното в модала „Бранд профил" и той записва.

export const runtime = "nodejs"; // mammoth needs Node APIs (Buffer), not the edge runtime.

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
    const result = await parseBrandDocx(Buffer.from(await file.arrayBuffer()));
    if ("error" in result) return NextResponse.json(result, { status: 422 });
    return NextResponse.json(result);
  } catch (e) {
    console.error("[BrandMotion] brand import parse failed:", e);
    return NextResponse.json({ error: "Файлът не можа да бъде прочетен." }, { status: 500 });
  }
}
