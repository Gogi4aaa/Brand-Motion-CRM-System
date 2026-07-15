import { z } from "zod";

export const clientSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  industry: z.string().trim().min(1, "Industry is required"),
  status: z.enum(["Active", "At risk", "Onboarding"]),
  mrr: z.number({ message: "Enter a number" }).min(0, "Must be 0 or more"),
  owner: z.string().trim().min(1, "Owner is required"),
  health: z.enum(["good", "watch", "risk"]),
  note: z.string(),
  editor: z.string(),
  analysis_status: z.enum(["not_started", "in_progress", "done"]),
  analysis_notes: z.string(),
  brand_voice: z.string(),
  target_audience: z.string(),
  brand_assets_url: z.string(),
});
export type ClientForm = z.infer<typeof clientSchema>;

export const onboardSchema = z.object({
  name: z.string().trim().min(1, "Името е задължително"),
  industry: z.string().trim().min(1, "Индустрията е задължителна"),
  mrr: z.number({ message: "Въведи число" }).min(0, "0 или повече"),
  owner: z.string().trim().min(1, "Отговорникът е задължителен"),
  editor: z.string(),
  packageId: z.string().min(1, "Избери пакет"),
});
export type OnboardForm = z.infer<typeof onboardSchema>;

export const taskSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  client: z.string().min(1, "Pick a client"),
  priority: z.enum(["high", "medium", "low"]),
  due: z.string(),
  estimate_hours: z.number({ message: "Въведи число" }).min(0, "0 или повече"),
  pay_amount: z.number({ message: "Въведи число" }).min(0, "0 или повече"),
  assignee: z.string(),
  team_visible: z.boolean(),
});
export type TaskForm = z.infer<typeof taskSchema>;

export const ideaSchema = z.object({
  client: z.string(), // '' = general idea
  title: z.string().trim().min(1, "Заглавието е задължително"),
  description: z.string().trim(),
  hook: z.string().trim(),
  source: z.enum(["team", "client_brief", "trend", "competitor", "ai"]),
});
export type IdeaForm = z.infer<typeof ideaSchema>;

export const leadSchema = z.object({
  name: z.string().trim().min(1, "Deal name is required"),
  contact: z.string().trim(),
  value: z.number({ message: "Enter a number" }).min(0, "Must be 0 or more"),
  stage: z.enum(["new", "contacted", "proposal", "won", "lost"]),
  owner: z.string().trim().min(1, "Owner is required"),
});
export type LeadForm = z.infer<typeof leadSchema>;

export const campaignSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  client: z.string().min(1, "Pick a client"),
  status: z.enum(["planning", "active", "paused", "completed"]),
  channel: z.string().trim(),
  budget: z.number({ message: "Enter a number" }).min(0, "Must be 0 or more"),
  starts: z.string().trim(),
  ends: z.string().trim(),
});
export type CampaignForm = z.infer<typeof campaignSchema>;

export const adDraftSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  client: z.string(),
  objective: z.string(),
  budget: z.number({ message: "Enter a number" }).min(0, "Must be 0 or more"),
  audience: z.string().trim(),
  primary_text: z.string().trim().min(1, "Ad text is required"),
  headline: z.string().trim(),
});
export type AdDraftForm = z.infer<typeof adDraftSchema>;

export const socialPostSchema = z.object({
  caption: z.string().trim().min(1, "Caption is required"),
  media_url: z.string().trim(),
  platforms: z.array(z.string()).min(1, "Pick at least one platform"),
  scheduled_for: z.string().trim(),
});
export type SocialPostForm = z.infer<typeof socialPostSchema>;

export const contentItemSchema = z.object({
  date: z.string(),
  type: z.enum(["promo", "info", "reel", "project", "post"]),
  title: z.string().trim().min(1, "Заглавието е задължително"),
  notes: z.string().trim(),
  hook: z.string().trim(),
  hook_type: z.string(),
  script: z.string().trim(),
  cta: z.string().trim(),
  caption: z.string().trim(),
  hashtags: z.string().trim(),
  notion_url: z.string().trim(),
  footage_url: z.string().trim(),
  published: z.boolean(),
});
export type ContentItemForm = z.infer<typeof contentItemSchema>;

export const cycleSchema = z.object({
  client: z.string().min(1, "Избери клиент"),
  month: z.string().trim().min(1, "Избери месец"),
  target_count: z.number({ message: "Въведи число" }).min(1, "Поне 1 видео"),
});
export type CycleForm = z.infer<typeof cycleSchema>;

// Отговорите на бранд въпросника (lib/brand.ts). Ключовете са по question.key;
// passthrough пази отговори на въпроси, които междувременно са отпаднали.
const brandColor = z.object({ hex: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Невалиден hex"), name: z.string().max(80).optional() });
const brandLink = z.object({ label: z.string().max(200).optional(), url: z.string().trim().max(2000) });
export const brandAnswersSchema = z
  .object({
    primary_colors: z.array(brandColor).max(12).optional(),
    accent_colors: z.array(brandColor).max(12).optional(),
    assets_links: z.array(brandLink).max(20).optional(),
    inspiration: z.array(brandLink).max(20).optional(),
    tone_tags: z.array(z.string().max(60)).max(30).optional(),
  })
  .catchall(z.union([z.string().max(4000), z.array(z.string().max(60)).max(30)]));
export type BrandAnswersForm = z.infer<typeof brandAnswersSchema>;

export const invoiceSchema = z.object({
  client: z.string().min(1, "Pick a client"),
  amount: z.number({ message: "Enter a number" }).min(0, "Must be 0 or more"),
  status: z.enum(["paid", "pending", "overdue", "draft"]),
  due: z.string(),
});
export type InvoiceForm = z.infer<typeof invoiceSchema>;
