import mammoth from "mammoth";
import { BRAND_QUESTIONS, BRAND_SECTIONS, coerceBrandValue, hasBrandValue, type BrandAnswers } from "./brand";

// Разчитане на попълнения бранд въпросник (.docx от шаблона
// /brand-questionnaire.docx). Отговор на въпрос N = всичко между реда,
// започващ с „N.“ / „N)“, и следващия номериран въпрос. Матчва се по номер,
// не по формулировка — клиентите редактират/съкращават текста на въпроса.
// Node-only (mammoth иска Buffer) — ползва се от /api/import/brand и тестове.

function htmlToText(html: string): string {
  return html
    .replace(/<\/(p|li|div|tr|h[1-6])>/gi, "\n")
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
    .join("\n");
}

// Ред „7. Въпрос…“ / „7) Въпрос…“. Изискваме поне 3 знака текст след номера,
// за да не бъркаме номерирани изброявания в самите отговори със заглавия.
const QUESTION_LINE_RE = /^(\d{1,2})[.)]\s+(.{3,})$/;

// Секционните заглавия от шаблона („Тон на гласа“…) не са част от отговора —
// mammoth ги дава като обикновени редове и иначе лепват към предходния въпрос.
const SECTION_TITLES = new Set(BRAND_SECTIONS.map((s) => s.title.toLowerCase()));

// Курсивните подсказки от шаблона не са отговор.
const isHintLine = (line: string, num: number): boolean => {
  const q = BRAND_QUESTIONS.find((x) => x.num === num);
  if (!q) return false;
  if (q.type === "select" && /^Изберете\s*:/i.test(line)) return true;
  return !!q.hint && line.replace(/\s+/g, " ") === q.hint.replace(/\s+/g, " ");
};

export async function parseBrandDocx(buffer: Buffer): Promise<{ answers: BrandAnswers; missing: number[] } | { error: string }> {
  const { value: html } = await mammoth.convertToHtml({ buffer });
  const lines = htmlToText(html).split("\n");

  const raw = new Map<number, string[]>();
  let current: number | null = null;
  const validNums = new Set(BRAND_QUESTIONS.map((q) => q.num));
  for (const line of lines) {
    const m = line.match(QUESTION_LINE_RE);
    if (m && validNums.has(Number(m[1]))) {
      current = Number(m[1]);
      if (!raw.has(current)) raw.set(current, []);
      continue;
    }
    if (current === null || !line) continue;
    if (SECTION_TITLES.has(line.toLowerCase())) continue;
    if (isHintLine(line, current)) continue;
    raw.get(current)!.push(line);
  }

  if (raw.size === 0) {
    return { error: "Не са намерени номерирани въпроси („1. …“). Използвайте шаблона от бутона „Свали шаблона“." };
  }

  const answers: BrandAnswers = {};
  const missing: number[] = [];
  for (const q of BRAND_QUESTIONS) {
    const text = (raw.get(q.num) || []).join("\n").trim();
    const value = coerceBrandValue(q.type, text);
    if (hasBrandValue(value)) answers[q.key] = value;
    else missing.push(q.num);
  }

  return { answers, missing };
}
