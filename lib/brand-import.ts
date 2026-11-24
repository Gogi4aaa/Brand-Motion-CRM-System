import mammoth from "mammoth";
import { BRAND_ALIASES, BRAND_QUESTIONS, BRAND_SECTIONS, coerceBrandValue, hasBrandValue, type BrandAnswerValue, type BrandAnswers, type BrandColor, type BrandQuestion } from "./brand";

// Разчитане на попълнения бранд въпросник (.docx от шаблона
// /brand-questionnaire.docx). Отговор на въпрос N = всичко между реда,
// започващ с „N.“ / „N)“, и следващия номериран въпрос. Матчва се по номер,
// не по формулировка — клиентите редактират/съкращават текста на въпроса.
// Node-only (mammoth иска Buffer) — ползва се от /api/import/brand и тестове.

function htmlToText(html: string): string {
  return html
    .replace(/<h[1-6][^>]*>/gi, "\n## ") // заглавията остават разпознаваеми като етикети
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

export type BrandImportMode = "template" | "labels" | "json";
export type BrandImportResult = { answers: BrandAnswers; missing: number[]; mode: BrandImportMode } | { error: string };

// ---- Общи помощници ---------------------------------------------------------
const HEX_ONE = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/;
const HEX_ALL = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g;
const normHex = (h: string) => (h.length === 4 ? "#" + [...h.slice(1)].map((c) => c + c).join("") : h).toLowerCase();

// „#0090B5 (основен син), #111 — текст“ → всеки цвят със СВОЕТО име (старият
// разбор даваше име само на първия). Името е текстът до кода в същото парче.
export function parseColors(text: string): BrandColor[] {
  const out: BrandColor[] = [];
  const seen = new Set<string>();
  for (const line of text.split("\n")) {
    const hexes = line.match(HEX_ALL) || [];
    if (!hexes.length) continue;
    // по едно парче на цвят: режем преди всеки следващ код
    const parts = line.split(/(?=#[0-9a-fA-F]{3,6}\b)/).filter((p) => HEX_ONE.test(p));
    const lead = line.slice(0, line.search(HEX_ONE)); // „Синьо: #0090B5“ → името е преди кода
    parts.forEach((part, i) => {
      const hex = normHex(part.match(HEX_ONE)![0]);
      if (seen.has(hex)) return;
      seen.add(hex);
      const clean = (t: string) => t.replace(HEX_ALL, "").replace(/[()\[\]•·*_`]/g, " ").replace(/^[\s,;:.—–-]+|[\s,;:.—–-]+$/g, "").replace(/\s+/g, " ").trim();
      const name = clean(part) || (i === 0 && parts.length === 1 ? clean(lead) : "");
      out.push(name ? { hex, name: name.slice(0, 80) } : { hex });
    });
  }
  return out.slice(0, 12);
}

// Свободен текст → една от опциите на полето с избор.
function pickOption(q: BrandQuestion, raw: string): string {
  const t = raw.toLowerCase();
  const opts = q.options || [];
  const exact = opts.find((o) => t.includes(o.toLowerCase().replace(/[„“"]/g, "")) || t.replace(/[„“"]/g, "") === o.toLowerCase().replace(/[„“"]/g, ""));
  if (exact) return exact;
  if (q.key === "address_form") {
    if (/смесен|според/.test(t)) return opts[2] || "";
    if (/\bвие\b|официал/.test(t)) return opts[1] || "";
    if (/\bти\b|неформал/.test(t)) return opts[0] || "";
  }
  if (q.key === "emoji_slang") {
    if (/умерен|понякога|малко/.test(t)) return opts[1] || "";
    if (/^\s*не\b|без емодж|никак/.test(t)) return opts[2] || "";
    if (/\bда\b|свободно/.test(t)) return opts[0] || "";
  }
  return "";
}

function toValue(q: BrandQuestion, raw: string): BrandAnswerValue {
  const text = raw.trim();
  if (q.type === "colors") return parseColors(text);
  if (q.type === "select") return pickOption(q, text);
  if (q.type === "tags") return (coerceBrandValue("tags", text.replace(/^[-–•*]\s*/gm, "")) as string[]).map((t) => t.slice(0, 60));
  const v = coerceBrandValue(q.type, q.type === "links" ? text : text.replace(/^[-–•*]\s+/gm, "• "));
  return typeof v === "string" ? v.slice(0, 4000) : v;
}

function finish(raw: Map<string, string>, mode: BrandImportMode, fullText: string): BrandImportResult {
  const answers: BrandAnswers = {};
  const missing: number[] = [];
  for (const q of BRAND_QUESTIONS) {
    const value = toValue(q, raw.get(q.key) || "");
    if (hasBrandValue(value)) answers[q.key] = value;
    else missing.push(q.num);
  }
  // Цветове, споменати някъде в текста, но не под етикет за цветове.
  if (!answers.primary_colors) {
    const used = new Set(((answers.accent_colors as BrandColor[] | undefined) || []).map((c) => c.hex));
    const loose = parseColors(fullText).filter((c) => !used.has(c.hex));
    if (loose.length) { answers.primary_colors = loose.slice(0, 6); const i = missing.indexOf(1); if (i >= 0) missing.splice(i, 1); }
  }
  if (Object.keys(answers).length === 0) {
    return { error: "Не открих бранд полета във файла. Всяко поле трябва да започва с етикет — напр. „Основни цветове: #0090B5“ или „Тон на гласа: …“. Виж „Формат и инструкция за AI“." };
  }
  return { answers, missing, mode };
}

// ---- 1) JSON: { "primary_colors": [...], "Тон на гласа": "…" } --------------
const norm = (s: string) => s.toLowerCase().replace(/[*_`#„“"'’«»()\[\]]/g, "").replace(/^\s*\d{1,2}[.)]\s*/, "").replace(/[.:;,!?—–-]+$/g, "").replace(/\s+/g, " ").trim();
const ALIAS_TO_KEY = new Map<string, string>();
for (const q of BRAND_QUESTIONS) {
  ALIAS_TO_KEY.set(norm(q.key), q.key);
  ALIAS_TO_KEY.set(norm(q.label), q.key);
  for (const a of BRAND_ALIASES[q.key] || []) if (!ALIAS_TO_KEY.has(norm(a))) ALIAS_TO_KEY.set(norm(a), q.key);
}
const jsonToText = (v: unknown): string =>
  typeof v === "string" ? v
  : Array.isArray(v) ? v.map((x) => (x && typeof x === "object" ? [("hex" in x ? (x as { hex: string }).hex : "url" in x ? (x as { url: string }).url : ""), ("name" in x ? `(${(x as { name: string }).name})` : "")].join(" ").trim() : String(x))).join("\n")
  : v == null ? "" : String(v);

function tryJson(text: string): Map<string, string> | null {
  const t = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  if (!t.startsWith("{")) return null;
  try {
    const obj = JSON.parse(t) as Record<string, unknown>;
    const src = obj && typeof obj.answers === "object" && obj.answers ? (obj.answers as Record<string, unknown>) : obj;
    const raw = new Map<string, string>();
    for (const [k, v] of Object.entries(src)) {
      const key = ALIAS_TO_KEY.get(norm(k));
      if (key) raw.set(key, jsonToText(v));
    }
    return raw.size ? raw : null;
  } catch { return null; }
}

// ---- 2) Номерираният Word шаблон --------------------------------------------
function tryTemplate(lines: string[]): Map<string, string> | null {
  const raw = new Map<number, string[]>();
  let current: number | null = null;
  const validNums = new Set(BRAND_QUESTIONS.map((q) => q.num));
  for (const line0 of lines) {
    const line = line0.replace(/^##\s*/, "");
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
  if (raw.size < 5) return null; // няколко номерирани реда в свободен текст не са шаблонът
  const out = new Map<string, string>();
  for (const q of BRAND_QUESTIONS) out.set(q.key, (raw.get(q.num) || []).join("\n"));
  return out;
}

// ---- 3) Свободен файл по етикети --------------------------------------------
// Ред е етикет, ако целият (заглавие/удебелен ред) или частта преди „:“ / „ — “
// съвпада с известно име на поле. Всичко до следващия етикет е отговорът.
function labelOf(line: string): { key: string; rest: string } | null {
  const bare = line.replace(/^#{1,6}\s*/, "").replace(/^[-–•*]\s+/, "").trim();
  if (!bare) return null;
  const whole = ALIAS_TO_KEY.get(norm(bare));
  if (whole) return { key: whole, rest: "" };
  const m = bare.match(/^(.{2,70}?)\s*(?::|—|–| - )\s*(.*)$/);
  if (m) {
    const key = ALIAS_TO_KEY.get(norm(m[1]));
    if (key) return { key, rest: m[2].replace(/^\*+|\*+$/g, "").trim() };
  }
  return null;
}
function byLabels(lines: string[]): Map<string, string> {
  const raw = new Map<string, string[]>();
  let current: string | null = null;
  for (const line of lines) {
    const hit = labelOf(line);
    if (hit) {
      current = hit.key;
      if (!raw.has(current)) raw.set(current, []);
      if (hit.rest) raw.get(current)!.push(hit.rest);
      continue;
    }
    if (current === null || !line) continue;
    if (/^#{1,6}\s/.test(line)) { current = null; continue; } // непознато заглавие затваря полето
    if (SECTION_TITLES.has(line.toLowerCase())) { current = null; continue; }
    raw.get(current)!.push(line);
  }
  return new Map([...raw].map(([k, v]) => [k, v.join("\n")]));
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Известен етикет с двоеточие след край на изречение/разделител, по средата на реда.
const INLINE_LABEL_RE = new RegExp(
  "([.;|])[ \\t]+((?:" +
    [...new Set(Object.values(BRAND_ALIASES).flat())].sort((a, b) => b.length - a.length).map(esc).join("|") +
  ")[ \\t]*:)",
  "giu",
);

// Текст (от файл или поставен) → бранд отговори. Реда: JSON → шаблон → етикети.
export function parseBrandText(text: string): BrandImportResult {
  const clean = text.replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ");
  const json = tryJson(clean);
  if (json) return finish(json, "json", clean);
  const tpl = tryTemplate(clean.split("\n").map((l) => l.trim()));
  if (tpl) return finish(tpl, "template", clean);
  // Няколко полета на един ред („… тъмен текст. Шрифтове: Montserrat. Тон на гласа: …“)
  // → всяко на свой ред, за да го хване разборът по етикети.
  const lines = clean.replace(INLINE_LABEL_RE, "$1\n$2").split("\n").map((l) => l.trim());
  return finish(byLabels(lines), "labels", clean);
}
export async function parseBrandDocx(buffer: Buffer): Promise<BrandImportResult> {
  const { value: html } = await mammoth.convertToHtml({ buffer });
  return parseBrandText(htmlToText(html));
}
