// Генерира public/brand-questionnaire.docx от BRAND_SECTIONS (lib/brand.ts).
// Пускане: node scripts/generate-brand-template.mjs  (Node ≥ 23 — чете .ts)
// Шаблонът се комитва; пусни скрипта отново при промяна на въпросите.
// ВАЖНО: парсерът (/api/import/brand) закача отговорите по реда „N. …“ —
// номерата тук и в lib/brand.ts трябва да съвпадат.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";
import { BRAND_SECTIONS } from "../lib/brand.ts";

const BRAND_COLOR = "0090B5";
const kids = [];

kids.push(
  new Paragraph({
    heading: HeadingLevel.TITLE,
    children: [new TextRun({ text: "Бранд въпросник", color: BRAND_COLOR })],
  }),
  new Paragraph({
    children: [
      new TextRun({
        text: "Моля, попълнете отговорите под всеки въпрос. Няма грешни отговори — колкото по-конкретни сте, толкова по-точно съдържанието ни ще звучи като вас. Не изтривайте номерата на въпросите.",
        italics: true,
      }),
    ],
    spacing: { after: 300 },
  })
);

for (const section of BRAND_SECTIONS) {
  kids.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 400, after: 150 },
      children: [new TextRun({ text: section.title, color: BRAND_COLOR })],
    })
  );
  for (const q of section.questions) {
    kids.push(
      new Paragraph({
        spacing: { before: 250, after: 50 },
        children: [new TextRun({ text: `${q.num}. ${q.label}`, bold: true })],
      })
    );
    const hint = q.type === "select" && q.options ? `Изберете: ${q.options.join(" / ")}.` + (q.hint ? " " + q.hint : "") : q.hint;
    if (hint) {
      kids.push(
        new Paragraph({
          spacing: { after: 50 },
          children: [new TextRun({ text: hint, italics: true, size: 20, color: "666666" })],
        })
      );
    }
    // Празни редове за отговор
    kids.push(new Paragraph({ text: "" }), new Paragraph({ text: "" }));
  }
}

const doc = new Document({
  creator: "BrandMotion",
  title: "Бранд въпросник — BrandMotion",
  styles: {
    default: { document: { run: { font: "Calibri", size: 22 } } },
  },
  sections: [{ children: kids }],
});

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "brand-questionnaire.docx");
writeFileSync(out, await Packer.toBuffer(doc));
console.log("written:", out);
