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
});
export type TaskForm = z.infer<typeof taskSchema>;

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
  script: z.string().trim(),
  notion_url: z.string().trim(),
  published: z.boolean(),
});
export type ContentItemForm = z.infer<typeof contentItemSchema>;

export const invoiceSchema = z.object({
  client: z.string().min(1, "Pick a client"),
  amount: z.number({ message: "Enter a number" }).min(0, "Must be 0 or more"),
  status: z.enum(["paid", "pending", "overdue", "draft"]),
  due: z.string(),
});
export type InvoiceForm = z.infer<typeof invoiceSchema>;
