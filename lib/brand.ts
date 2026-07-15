// Бранд въпросникът — единственият източник на истината за въпросите.
// Word шаблонът (scripts/generate-brand-template.mjs), docx парсерът
// (/api/import/brand), табът „Бранд" и модалът за редакция четат оттук.
// Промяна на въпрос НЕ иска миграция — отговорите са jsonb по key.
// `num` е стабилният номер в документа, по който парсерът закача отговора —
// не преизползвай номер на изтрит въпрос.

export type BrandFieldType = "text" | "textarea" | "colors" | "tags" | "links" | "select";

export interface BrandQuestion {
  key: string;
  num: number; // номерът в docx шаблона ("7. …")
  label: string;
  hint?: string;
  type: BrandFieldType;
  options?: string[]; // за type: "select"
}

export interface BrandSection {
  key: string;
  title: string;
  questions: BrandQuestion[];
}

export interface BrandColor { hex: string; name?: string }
export interface BrandLink { label?: string; url: string }
export type BrandAnswerValue = string | string[] | BrandColor[] | BrandLink[];
export type BrandAnswers = Record<string, BrandAnswerValue>;

export interface BrandProfile {
  client_id: string;
  answers: BrandAnswers;
  updated_at: string;
}

export const TONE_TAG_SUGGESTIONS = [
  "приятелски", "експертен", "забавен", "луксозен", "достъпен",
  "дързък", "топъл", "директен", "вдъхновяващ", "спокоен",
];

export const BRAND_SECTIONS: BrandSection[] = [
  {
    key: "visual",
    title: "Визуална идентичност",
    questions: [
      { key: "primary_colors", num: 1, type: "colors", label: "Основни бранд цветове", hint: "Hex кодове ако ги знаете (напр. #0090B5), иначе опишете с думи." },
      { key: "accent_colors", num: 2, type: "colors", label: "Допълнителни / акцентни цветове", hint: "Ако имате такива." },
      { key: "fonts", num: 3, type: "text", label: "Шрифтове, които ползвате", hint: "Или напишете „нямаме определени“." },
      { key: "assets_links", num: 4, type: "links", label: "Линк към лого и бранд материали", hint: "Google Drive, Dropbox или друго споделено място." },
      { key: "brand_book", num: 5, type: "text", label: "Имате ли бранд бук / визуални правила?", hint: "Линк към него или „не“." },
    ],
  },
  {
    key: "tone",
    title: "Тон на гласа",
    questions: [
      { key: "tone_of_voice", num: 6, type: "textarea", label: "Опишете как „звучи“ брандът ви — как говорите с клиентите си?", hint: "Все едно обяснявате на нов служител как да пише от ваше име." },
      { key: "tone_tags", num: 7, type: "tags", label: "3–5 думи, които описват бранда", hint: "Напр.: " + TONE_TAG_SUGGESTIONS.slice(0, 6).join(", ") + "…" },
      { key: "address_form", num: 8, type: "select", label: "Обръщение към аудиторията", options: ["на „ти“", "на „вие“", "смесено / според случая"] },
      { key: "forbidden_words", num: 9, type: "textarea", label: "Думи / фрази, които НЕ искате в съдържанието ви", hint: "Клишета, конкурентни имена, неподходящи изрази…" },
      { key: "emoji_slang", num: 10, type: "select", label: "Емоджита и жаргон", options: ["да, свободно", "умерено", "не"] },
    ],
  },
  {
    key: "audience",
    title: "Аудитория",
    questions: [
      { key: "ideal_client", num: 11, type: "textarea", label: "Кой е идеалният ви клиент?", hint: "Възраст, пол, град, интереси, доход — колкото по-конкретно, толкова по-добре." },
      { key: "problem_solved", num: 12, type: "textarea", label: "Какъв проблем му решавате? Защо идва при вас?" },
      { key: "objections", num: 13, type: "textarea", label: "Най-честите въпроси / възражения, които чувате от клиенти" },
    ],
  },
  {
    key: "business",
    title: "Бизнесът",
    questions: [
      { key: "offering", num: 14, type: "textarea", label: "Какво точно предлагате?", hint: "Услуги / продукти + кое е приоритет за промотиране." },
      { key: "usp", num: 15, type: "textarea", label: "Кое ви отличава от конкуренцията?" },
      { key: "competitors", num: 16, type: "textarea", label: "Топ 3 конкуренти", hint: "Имена или линкове към профилите им." },
    ],
  },
  {
    key: "content",
    title: "Съдържание",
    questions: [
      { key: "taboo_topics", num: 17, type: "textarea", label: "Теми табу — за какво НЕ искате да се говори в съдържанието ви" },
      { key: "inspiration", num: 18, type: "links", label: "Съдържание, което ви харесва", hint: "Линкове към видеа / профили за вдъхновение — ваши или чужди." },
      { key: "on_camera", num: 19, type: "text", label: "Кой ще се снима / е лицето на бранда?" },
    ],
  },
];

export const BRAND_QUESTIONS: BrandQuestion[] = BRAND_SECTIONS.flatMap((s) => s.questions);

export const brandQuestionByNum = (num: number) => BRAND_QUESTIONS.find((q) => q.num === num);

// Празна стойност според типа на полето.
export const emptyBrandValue = (type: BrandFieldType): BrandAnswerValue =>
  type === "colors" || type === "links" || type === "tags" ? [] : "";

// Има ли изобщо нещо попълнено в отговора?
export const hasBrandValue = (v: BrandAnswerValue | undefined): boolean =>
  Array.isArray(v) ? v.length > 0 : !!(v && String(v).trim());

const HEX_RE = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g;
const URL_RE = /https?:\/\/[^\s)»"']+/g;

const normHex = (h: string) =>
  h.length === 4 ? "#" + [...h.slice(1)].map((c) => c + c).join("") : h;

// Суров текст от docx → структурирана стойност за полето. Цветовете вадят
// hex кодовете от текста (останалото става name); линковете — URL-ите;
// tags се цепят по запетая/нов ред. Несигурното остава за ръчния преглед.
export function coerceBrandValue(type: BrandFieldType, raw: string): BrandAnswerValue {
  const text = raw.trim();
  if (!text) return emptyBrandValue(type);
  if (type === "colors") {
    const hexes = text.match(HEX_RE) || [];
    if (hexes.length === 0) return []; // описано с думи → служителят избира с picker-а
    const rest = text.replace(HEX_RE, "").replace(/[,;•·]+/g, " ").replace(/\s+/g, " ").trim();
    return hexes.map((h, i) => ({ hex: normHex(h.toLowerCase()), name: i === 0 && rest ? rest : undefined }));
  }
  if (type === "links") {
    const urls = text.match(URL_RE) || [];
    return urls.map((u) => ({ url: u }));
  }
  if (type === "tags") {
    return text.split(/[,;\n•·]+/).map((t) => t.trim()).filter(Boolean).slice(0, 10);
  }
  return text;
}

// Стойност → текст (за огледалните полета в clients и за празни проверки).
export function brandValueToText(v: BrandAnswerValue | undefined): string {
  if (!v) return "";
  if (typeof v === "string") return v;
  return (v as (string | BrandColor | BrandLink)[])
    .map((x) => (typeof x === "string" ? x : "url" in x ? x.url : x.hex + (x.name ? ` (${x.name})` : "")))
    .join(", ");
}
