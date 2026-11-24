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

// ---- Свободен бранд файл (импорт по етикети) --------------------------------
// Освен номерирания Word шаблон приемаме и обикновен текст/документ, в който
// всяко поле започва с етикет — „Основни цветове: #0090B5 (синьо)“ или заглавие
// „## Тон на гласа“ с отговора под него. Така файлът може да се напише от
// какъвто и да е AI. Първият етикет в списъка е каноничният (той е в
// инструкцията за AI); останалите са синоними, които също се разпознават.
export const BRAND_ALIASES: Record<string, string[]> = {
  primary_colors: ["Основни цветове", "основни бранд цветове", "бранд цветове", "цветове", "палитра", "primary colors", "colors", "colours"],
  accent_colors: ["Акцентни цветове", "допълнителни цветове", "вторични цветове", "акценти", "accent colors", "secondary colors"],
  fonts: ["Шрифтове", "шрифт", "типография", "fonts", "typography"],
  assets_links: ["Лого и материали", "бранд материали", "лого", "материали", "logo", "assets"],
  brand_book: ["Бранд бук", "брандбук", "визуални правила", "brand book", "brandbook"],
  tone_of_voice: ["Тон на гласа", "тон", "глас на бранда", "tone of voice", "tone", "voice"],
  tone_tags: ["Ключови думи", "думи за бранда", "характер", "личност на бранда", "keywords", "tags"],
  address_form: ["Обръщение", "обръщение към аудиторията", "address"],
  forbidden_words: ["Забранени думи", "забранени фрази", "думи които не искаме", "не използвай", "forbidden words"],
  emoji_slang: ["Емоджита и жаргон", "емоджита", "emoji"],
  ideal_client: ["Идеален клиент", "целева аудитория", "аудитория", "target audience", "audience"],
  problem_solved: ["Проблем, който решаваме", "проблем който решаваме", "какъв проблем решаваме", "проблем", "problem"],
  objections: ["Чести възражения", "възражения", "чести въпроси", "често задавани въпроси", "objections", "faq"],
  offering: ["Какво предлагаме", "услуги и продукти", "услуги", "продукти", "offering", "services"],
  usp: ["Какво ни отличава", "уникално предимство", "предимства", "отличава", "usp"],
  competitors: ["Конкуренти", "конкуренция", "competitors"],
  taboo_topics: ["Теми табу", "табу", "taboo"],
  inspiration: ["Вдъхновение", "референции", "съдържание което харесваме", "inspiration", "references"],
  on_camera: ["Лице на бранда", "кой се снима", "пред камера", "on camera"],
};
export const brandLabel = (key: string) => BRAND_ALIASES[key]?.[0] || key;

// Празен бранд файл — сваля се като шаблон или се дава на AI да го попълни.
export function brandFileTemplate(): string {
  const lines: string[] = ["# Бранд профил", ""];
  for (const s of BRAND_SECTIONS) {
    lines.push(`## ${s.title}`, "");
    for (const q of s.questions) {
      const example =
        q.type === "colors" ? "#0090B5 (основен син), #111827 (тъмен текст)"
        : q.type === "links" ? "https://…"
        : q.type === "tags" ? "приятелски, експертен, директен"
        : q.type === "select" ? (q.options || []).join(" / ")
        : "";
      lines.push(`${brandLabel(q.key)}: ${example}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

// Инструкция, която се копира и се дава на AI заедно с материалите на клиента.
export function brandAiPrompt(clientName?: string): string {
  return [
    `Направи бранд профил${clientName ? ` на „${clientName}“` : ""} от материалите, които ти давам (сайт, бранд бук, бележки от среща, профили в социалните мрежи).`,
    "Върни САМО попълнения текст по-долу, без увод и без обяснения — ще го кача направо в CRM-а.",
    "",
    "Правила:",
    "- Запази етикетите точно както са, всеки на нов ред, с двоеточие след него.",
    "- Цветовете са hex кодове с кратко име в скоби: #0090B5 (основен син). Ако не знаеш точния код, вземи го от логото/сайта.",
    "- Където има избор с „/“, остави само един вариант.",
    "- Ако няма информация за дадено поле, остави го празно — не си измисляй.",
    "- Пиши на български, кратко и конкретно.",
    "",
    brandFileTemplate(),
  ].join("\n");
}
