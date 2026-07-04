// Server-side Claude client — the single entry point for all AI calls
// (scripts, ideas, captions). Never import from client components; only
// Route Handlers under app/api/ai/* use this. Key lives in ANTHROPIC_API_KEY.

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

export const MODEL = "claude-opus-4-8";

export const aiConfigured = () => !!process.env.ANTHROPIC_API_KEY;

const client = () => new Anthropic();

// Shared brand-voice context injected into every generation. Kept stable so
// the prompt prefix stays cacheable across requests.
const SYSTEM = `Ти си креативен директор в BrandMotion — видео/social агенция, която прави кратки видеа (Reels, TikTok, Shorts) и постове за клиенти в България. Пишеш на български, освен ако брандът не изисква друго.

Правила за кратки видео сценарии:
- Структура: Hook → Напрежение/Защо → Стойност → Доказателство → Развръзка → CTA.
- Първите 2-3 секунди решават всичко — куката трябва да спира скрола.
- 30-секундно видео е ~70-110 думи. Говори се разговорно, без корпоративни клишета.
- Съобразявай се с тона на бранда и целевата аудитория, когато са подадени.`;

export interface BrandContext {
  clientName?: string;
  industry?: string;
  brandVoice?: string;
  targetAudience?: string;
}

const brandBlock = (b: BrandContext) =>
  [
    b.clientName && `Клиент: ${b.clientName}`,
    b.industry && `Индустрия: ${b.industry}`,
    b.brandVoice && `Тон на гласа: ${b.brandVoice}`,
    b.targetAudience && `Целева аудитория: ${b.targetAudience}`,
  ]
    .filter(Boolean)
    .join("\n");

// ---- Script generation (3 hook variants for A/B) ----
const ScriptVariant = z.object({
  hook: z.string().describe("Първите 1-2 изречения, които спират скрола"),
  hook_type: z.enum(["curiosity", "pain_point", "list", "authority", "fear", "myth_vs_fact", "pattern_interrupt"]),
  body: z.string().describe("Основните стойностни точки на сценария, разговорен език"),
  payoff: z.string().describe("Развръзката / основният извод"),
  cta: z.string().describe("Призив към действие в края"),
});
const ScriptResult = z.object({ variants: z.array(ScriptVariant).min(2).max(4) });
export type ScriptResultT = z.infer<typeof ScriptResult>;

export async function generateScript(input: { title: string; notes?: string; type?: string; durationSec?: number } & BrandContext): Promise<ScriptResultT> {
  const user = `Напиши 3 варианта на сценарий за кратко видео.

Тема/заглавие: ${input.title}
${input.notes ? `Бриф/бележки: ${input.notes}` : ""}
Формат: ${input.type || "reel"} · Целева дължина: ~${input.durationSec || 30} сек.
${brandBlock(input)}

Всеки вариант да има различен тип кука.`;
  const msg = await client().messages.parse({
    model: MODEL,
    max_tokens: 4096,
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: user }],
    output_config: { format: zodOutputFormat(ScriptResult) },
  });
  if (!msg.parsed_output) throw new Error("AI не върна валиден резултат");
  return msg.parsed_output;
}

// ---- Idea generation ----
const IdeaItem = z.object({
  title: z.string(),
  description: z.string().describe("1-2 изречения какво представлява видеото"),
  hook: z.string().describe("Предложена кука"),
  category: z.enum(["educational", "entertaining", "inspirational", "promotional"]),
});
const IdeasResult = z.object({ ideas: z.array(IdeaItem).min(5).max(15) });
export type IdeasResultT = z.infer<typeof IdeasResult>;

export async function generateIdeas(input: { count?: number; extraContext?: string } & BrandContext): Promise<IdeasResultT> {
  const user = `Генерирай ${input.count || 10} идеи за кратки видеа, разпределени между категориите educational / entertaining / inspirational / promotional.
${brandBlock(input)}
${input.extraContext ? `Допълнителен контекст: ${input.extraContext}` : ""}`;
  const msg = await client().messages.parse({
    model: MODEL,
    max_tokens: 4096,
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: user }],
    output_config: { format: zodOutputFormat(IdeasResult) },
  });
  if (!msg.parsed_output) throw new Error("AI не върна валиден резултат");
  return msg.parsed_output;
}

// ---- Caption + hashtags ----
const CaptionResult = z.object({
  caption: z.string().describe("Платформен caption — кука в първия ред, до 2200 знака"),
  hashtags: z.array(z.string()).describe("10-15 хаштага в 3 нива: broad, niche, branded — без символа #"),
});
export type CaptionResultT = z.infer<typeof CaptionResult>;

export async function generateCaption(input: { title: string; script?: string; platforms?: string[] } & BrandContext): Promise<CaptionResultT> {
  const user = `Напиши caption и хаштагове за това видео.

Заглавие: ${input.title}
${input.script ? `Сценарий: ${input.script.slice(0, 4000)}` : ""}
Платформи: ${(input.platforms || ["instagram", "tiktok"]).join(", ")}
${brandBlock(input)}`;
  const msg = await client().messages.parse({
    model: MODEL,
    max_tokens: 2048,
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: user }],
    output_config: { format: zodOutputFormat(CaptionResult) },
  });
  if (!msg.parsed_output) throw new Error("AI не върна валиден резултат");
  return msg.parsed_output;
}
