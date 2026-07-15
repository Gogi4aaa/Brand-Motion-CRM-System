// Mock data + display helpers for the BrandMotion CRM frontend.
// Ported from the agency-workspace prototype; swap this module for real
// API/DB calls when the backend lands.

export type Health = "good" | "watch" | "risk";
export type InvStatus = "paid" | "pending" | "overdue" | "draft";
export type TaskStatus = "todo" | "inprogress" | "review" | "done";
export type Priority = "high" | "medium" | "low";

export interface Client {
  id: string;
  name: string;
  initials: string;
  industry: string;
  status: "Active" | "At risk" | "Onboarding";
  mrr: number;
  owner: string;
  health: Health;
  note: string;
  editor?: string; // initials of this brand's default video editor
  analysis_status?: AnalysisStatus;
  analysis_notes?: string;
  // ---- Brand profile (filled during onboarding) ----
  brand_voice?: string;
  target_audience?: string;
  brand_assets_url?: string;
}

export type AnalysisStatus = "not_started" | "in_progress" | "done";
export const analysisStatusMeta = (s: AnalysisStatus) =>
  ({
    not_started: { cls: "bm-badge--neutral", label: "Не е започнат" },
    in_progress: { cls: "bm-badge--warning", label: "В процес" },
    done: { cls: "bm-badge--success", label: "Готов" },
  }[s]);

export interface Invoice {
  id: string;
  client: string;
  amount: number;
  status: InvStatus;
  issued: string;
  due: string;
  created_at?: string; // set by the DB; drives the dashboard period filter
}

export interface Task {
  id: string;
  title: string;
  client: string;
  status: TaskStatus;
  priority: Priority;
  assignee: string;
  due: string;
  progress: number;
  time_logged?: number; // seconds
  estimate_hours?: number; // planned effort — drives the workload view
  pay_amount?: number; // what the assignee earns for this task (admin sets it)
  paid?: boolean; // admin marked this task's pay as settled
  paid_at?: string | null;
  visibility?: "private" | "team"; // private = admin + assignee only
  content_item_id?: string | null; // set on tasks auto-created from production
  stage_key?: string | null; // which production stage spawned this task
  created_at?: string; // set by the DB; drives the dashboard period filter
  done_at?: string | null; // when it was completed — drives the board archive
}

// Бордовете крият done/публикувано след този брой дни (данните остават —
// порталът, плащанията и справките ги ползват); pg_cron изтрива само
// безстойностните авто-таскове (0024_archive_cleanup.sql).
export const BOARD_RETENTION_DAYS = 7;
export const isArchived = (iso?: string | null) =>
  !!iso && Date.now() - new Date(iso).getTime() > BOARD_RETENTION_DAYS * 86400_000;

// Резултати от качено видео — въвеждани ръчно или дърпани автоматично.
export interface VideoMetric {
  id: string;
  content_item_id: string;
  platform: string;
  url: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  source?: "manual" | "auto";
  updated_at?: string;
}

// Private tasks are between the admin and the assignee; everything else is team-wide.
// Production handoff tasks (content_item_id set) stay visible to managers too —
// they distribute the stage work, so they keep oversight of the whole chain.
export const canSeeTask = (t: Task, level: AccessRole, initials: string) =>
  t.visibility !== "private" || level === "admin" || t.assignee === initials ||
  (level === "manager" && !!t.content_item_id);

// Which clients this member may see. Empty list: workers see nothing until the
// admin assigns clients; managers keep full visibility (back-compat); admins all.
export function visibleClientsFor(level: AccessRole, clientIds: string[] | undefined, clients: Client[]): Client[] {
  if (level === "admin") return clients;
  const ids = clientIds || [];
  if (ids.length === 0) return level === "manager" ? clients : [];
  return clients.filter((c) => ids.includes(c.id));
}

// Per-worker payout summary derived from tasks:
//   owed      — done, not yet paid (this is what the admin owes right now)
//   upcoming  — agreed pay on tasks still in progress
//   paidTotal — already settled
export function payoutFor(tasks: Task[], initials: string) {
  const mine = tasks.filter((t) => t.assignee === initials);
  const sum = (list: Task[]) => list.reduce((a, t) => a + (t.pay_amount || 0), 0);
  return {
    owed: sum(mine.filter((t) => t.status === "done" && !t.paid)),
    owedCount: mine.filter((t) => t.status === "done" && !t.paid && (t.pay_amount || 0) > 0).length,
    upcoming: sum(mine.filter((t) => t.status !== "done" && !t.paid)),
    paidTotal: sum(mine.filter((t) => t.paid)),
  };
}

// Weekly capacity per person (hours) — over this is flagged as overloaded.
export const WEEKLY_CAPACITY_HOURS = 40;

export type CampaignStatus = "planning" | "active" | "paused" | "completed";

export interface Campaign {
  id: string;
  name: string;
  client: string; // client id
  status: CampaignStatus;
  channel: string;
  budget: number;
  starts: string;
  ends: string;
}

export const campaignStatusMeta = (s: CampaignStatus) =>
  ({
    planning: { cls: "bm-badge--info", label: "Планиране" },
    active: { cls: "bm-badge--success", label: "Активна" },
    paused: { cls: "bm-badge--warning", label: "На пауза" },
    completed: { cls: "bm-badge--neutral", label: "Завършена" },
  }[s]);

export const fmtDuration = (sec: number) => {
  if (!sec) return "0m";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
};

export const OWNERS: Record<string, string> = {
  AK: "Anna Klein",
  ML: "Marco Lopez",
  JD: "Jamie Doe",
  SR: "Sara Rivera",
};

export type Role = "admin" | "member";

// ---- Access levels (RBAC) ----
export type AccessRole = "admin" | "manager" | "worker";

export const ROLE_LABELS: Record<AccessRole, string> = {
  admin: "Администратор",
  manager: "Мениджър",
  worker: "Сътрудник",
};

// Which app sections each level can open.
//   admin   — everything, and the ONLY level that sees money (фактури, бюджети,
//             сделки, приходи, възнаграждения на другите).
//   manager — coordinates the work: tasks, production, content, team roles,
//             social. No money and no client CRM/sales pages.
//   worker  — only their own work (tasks/content/production).
export const NAV_ACCESS: Record<string, AccessRole[]> = {
  dashboard: ["admin", "manager", "worker"],
  ideas: ["admin"], // в разработка — само админът я вижда засега

  tasks: ["admin", "manager", "worker"],
  calendar: ["admin", "manager", "worker"],
  production: ["admin", "manager", "worker"],
  clients: ["admin"],
  pipeline: ["admin"],
  campaigns: ["admin"],
  analytics: ["admin"],
  social: ["admin", "manager"],
  team: ["admin", "manager"],
  invoices: ["admin"],
};

export const canAccess = (role: AccessRole, key: string) =>
  (NAV_ACCESS[key] || ["admin"]).includes(role);

// Map a pathname to its access key (e.g. /clients/123 -> clients).
export const sectionForPath = (path: string) => {
  const seg = path.split("/").filter(Boolean)[0] || "dashboard";
  return seg;
};

export interface TeamMember {
  id: string;
  name: string;
  initials: string;
  role: AccessRole;
  roles?: string[]; // production role tags: strategy/script/camera/editor/review
  client_ids?: string[]; // clients this member may see (empty = role default)
}

// ---- Video production pipeline ----
export type StageStatus = "todo" | "doing" | "done" | "blocked";
export interface StageState {
  key: string;
  assignee: string; // initials
  status: StageStatus;
}

// Специалностите се показват като длъжност на човека (вж. memberTitle) —
// затова са съществителни: Монтажист, Видеограф…, а не имена на етапи.
export const PRODUCTION_ROLES: { id: string; label: string }[] = [
  { id: "strategy", label: "Стратег" },
  { id: "script", label: "Сценарист" },
  { id: "camera", label: "Видеограф" },
  { id: "editor", label: "Монтажист" },
  { id: "posts", label: "Пост криейтър" },
  { id: "review", label: "Публикуващ" },
];

// Длъжността, която се показва до името на човек от екипа: избраните
// специалности („Монтажист · Видеограф“); без специалности — нивото на
// достъп („Сътрудник“/„Мениджър“). Админът винаги е „Администратор“.
export const memberTitle = (m: Pick<TeamMember, "role" | "roles">): string => {
  if (m.role === "admin") return ROLE_LABELS.admin;
  const parts = (m.roles || [])
    .map((r) => PRODUCTION_ROLES.find((p) => p.id === r)?.label)
    .filter((x): x is string => !!x);
  return parts.length ? parts.join(" · ") : ROLE_LABELS[m.role];
};

// Дефолтно възнаграждение на автоматичния таск по етап (EUR). Монтажът се
// плаща на парче — €15; останалите етапи тръгват без сума. Ръчно въведена
// сума никога не се презаписва от дефолта.
export const STAGE_DEFAULT_PAY: Record<string, number> = { edit: 15 };

export const PRODUCTION_STAGES: { key: string; label: string; role: string; dot: string }[] = [
  { key: "strategy", label: "Идеи и стратегия", role: "strategy", dot: "var(--bm-info-500)" },
  { key: "script", label: "Сценарии", role: "script", dot: "var(--bm-brand-400)" },
  { key: "shoot", label: "Заснемане", role: "camera", dot: "var(--bm-warning-500)" },
  { key: "edit", label: "Монтаж", role: "editor", dot: "#9D2667" },
  { key: "review", label: "Преглед", role: "review", dot: "var(--bm-brand-600)" },
  { key: "publish", label: "Публикуване", role: "review", dot: "var(--bm-success-500)" },
];

// Постовете минават през собствена, по-къса верига: Пост криейтърът поема
// Текст и Дизайн, останалото е като при видеата (Стратег → … → Публикуващ).
export const POST_STAGES: { key: string; label: string; role: string; dot: string }[] = [
  { key: "strategy", label: "Идея", role: "strategy", dot: "var(--bm-info-500)" },
  { key: "copy", label: "Текст", role: "posts", dot: "var(--bm-brand-400)" },
  { key: "design", label: "Дизайн", role: "posts", dot: "#9D2667" },
  { key: "review", label: "Преглед", role: "review", dot: "var(--bm-brand-600)" },
  { key: "publish", label: "Публикуване", role: "review", dot: "var(--bm-success-500)" },
];

// Етапният набор се определя от типа на съдържанието.
export const stagesForType = (type: ContentType | undefined) =>
  type === "post" ? POST_STAGES : PRODUCTION_STAGES;

export const stageMeta = (key: string) =>
  PRODUCTION_STAGES.find((s) => s.key === key) || POST_STAGES.find((s) => s.key === key) || PRODUCTION_STAGES[0];
export const stageStatusMeta = (s: StageStatus) =>
  ({
    todo: { cls: "bm-badge--neutral", label: "Чакащо" },
    doing: { cls: "bm-badge--info", label: "В процес" },
    done: { cls: "bm-badge--success", label: "Готово" },
    blocked: { cls: "bm-badge--danger", label: "Блокирано" },
  }[s]);

// Build default per-stage assignees: role default from the team, editor stage
// from the client's editor; falls back to the current user.
export function defaultStages(
  team: TeamMember[],
  clientEditor: string,
  fallback: string,
  type?: ContentType
): StageState[] {
  const byRole = (role: string) => team.find((m) => (m.roles || []).includes(role))?.initials;
  return stagesForType(type).map((s) => {
    let assignee = "";
    if (s.role === "editor") assignee = clientEditor || byRole("editor") || fallback;
    else assignee = byRole(s.role) || fallback;
    return { key: s.key, assignee, status: "todo" as StageStatus };
  });
}

export interface Comment {
  id: string;
  entity_type: "client" | "task";
  entity_id: string;
  author_name: string;
  author_initials: string;
  body: string;
  created_at: string;
}

// Fallback team for mock mode (real members come from the profiles table).
export const seedTeam: TeamMember[] = [];

export const clients: Client[] = [];

export const invoices: Invoice[] = [];

export const tasks: Task[] = [];

// ---- Display helpers ----
// Валутата на агенцията е евро; bg-BG форматиране (интервал за хиляди).
// Сумите се показват ТОЧНИ навсякъде (€1 425, не €1.4k) — fmtK остава като
// псевдоним за старите извиквания из KPI картите.
export const fmtFull = (n: number) => "€" + Math.round(n).toLocaleString("bg-BG");
export const fmtK = fmtFull;

// Начало на текущия месец + помощник за „платено този месец“ сметките.
export const monthStart = () => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d.getTime(); };
export const inCurrentMonth = (iso?: string | null) => !!iso && new Date(iso).getTime() >= monthStart();

export const clientsById = (list: Client[]) =>
  Object.fromEntries(list.map((c) => [c.id, c])) as Record<string, Client>;

export const healthMeta = (h: Health) =>
  h === "good"
    ? { cls: "bm-badge--success", label: "Стабилен" }
    : h === "watch"
    ? { cls: "bm-badge--warning", label: "Наблюдение" }
    : { cls: "bm-badge--danger", label: "Риск" };

export const prioMeta = (p: Priority) =>
  p === "high"
    ? { cls: "bm-badge--danger", label: "Висок" }
    : p === "medium"
    ? { cls: "bm-badge--warning", label: "Среден" }
    : { cls: "bm-badge--neutral", label: "Нисък" };

export const invStatusMeta = (s: InvStatus) =>
  ({
    paid: { cls: "bm-badge--success", label: "Платена" },
    pending: { cls: "bm-badge--warning", label: "Чакаща" },
    overdue: { cls: "bm-badge--danger", label: "Просрочена" },
    draft: { cls: "bm-badge--info", label: "Чернова" },
  }[s]);

export const taskStatusLabel = (s: TaskStatus) =>
  ({ todo: "За правене", inprogress: "В процес", review: "За преглед", done: "Готово" }[s]);

export type LeadStage = "new" | "contacted" | "proposal" | "won" | "lost";

export interface Lead {
  id: string;
  name: string;
  contact: string;
  value: number;
  stage: LeadStage;
  owner: string;
  client_id?: string | null; // set once the won lead is onboarded into a client
}

export const PIPELINE_STAGES: { key: LeadStage; title: string; dot: string }[] = [
  { key: "new", title: "Нови", dot: "var(--bm-slate-400)" },
  { key: "contacted", title: "Свързани", dot: "var(--bm-info-500)" },
  { key: "proposal", title: "Оферта", dot: "var(--bm-warning-500)" },
  { key: "won", title: "Спечелени", dot: "var(--bm-success-500)" },
  { key: "lost", title: "Загубени", dot: "var(--bm-danger-500)" },
];

export const leadStageMeta = (s: LeadStage) =>
  ({
    new: { cls: "bm-badge--neutral", label: "Нов" },
    contacted: { cls: "bm-badge--info", label: "Свързан" },
    proposal: { cls: "bm-badge--warning", label: "Оферта" },
    won: { cls: "bm-badge--success", label: "Спечелен" },
    lost: { cls: "bm-badge--danger", label: "Загубен" },
  }[s]);

export const seedLeads: Lead[] = [];

export const seedCampaigns: Campaign[] = [];

// ---- Per-client channel connections (organic posting) ----
export type ChannelProvider = "meta" | "tiktok";
export interface ClientConnection {
  client_id: string;
  provider: ChannelProvider;
  connected: boolean;
  account_label: string;
}
export const CLIENT_CHANNELS: { id: ChannelProvider; name: string; blurb: string }[] = [
  { id: "meta", name: "Facebook & Instagram", blurb: "Постове и рийлс към Страницата и Instagram на клиента (органик)." },
  { id: "tiktok", name: "TikTok", blurb: "Качване и насрочване на видеа към TikTok акаунта на клиента." },
];

// ---- Phase 5: integrations ----
export type Provider = "meta_ads" | "instagram" | "tiktok" | "youtube";

export interface Integration {
  provider: Provider;
  connected: boolean;
  account_label: string;
}

export const PROVIDERS: { id: Provider; name: string; blurb: string }[] = [
  { id: "meta_ads", name: "Meta Ads", blurb: "Създаване и публикуване на реклами към Meta бизнес акаунтите на клиентите." },
  { id: "instagram", name: "Instagram", blurb: "Публикуване на рийлс и постове към свързани Instagram акаунти." },
  { id: "tiktok", name: "TikTok", blurb: "Качване и насрочване на видео в TikTok." },
  { id: "youtube", name: "YouTube", blurb: "Публикуване на видео и shorts в YouTube канали." },
];

export type AdStatus = "draft" | "ready" | "published";
export interface AdDraft {
  id: string;
  client: string | null;
  name: string;
  objective: string;
  budget: number;
  audience: string;
  primary_text: string;
  headline: string;
  status: AdStatus;
}
export const AD_OBJECTIVES = ["awareness", "traffic", "engagement", "leads", "sales"];
export const AD_OBJECTIVE_LABELS: Record<string, string> = {
  awareness: "Разпознаваемост",
  traffic: "Трафик",
  engagement: "Ангажираност",
  leads: "Запитвания",
  sales: "Продажби",
};
export const adStatusMeta = (s: AdStatus) =>
  ({
    draft: { cls: "bm-badge--neutral", label: "Чернова" },
    ready: { cls: "bm-badge--info", label: "Готова" },
    published: { cls: "bm-badge--success", label: "Публикувана" },
  }[s]);

export type PostStatus = "draft" | "scheduled" | "published";
export interface SocialPost {
  id: string;
  caption: string;
  media_url: string;
  platforms: string[];
  scheduled_for: string;
  status: PostStatus;
}
export const SOCIAL_PLATFORMS: { id: string; name: string }[] = [
  { id: "instagram", name: "Instagram" },
  { id: "tiktok", name: "TikTok" },
  { id: "youtube", name: "YouTube" },
];
export const postStatusMeta = (s: PostStatus) =>
  ({
    draft: { cls: "bm-badge--neutral", label: "Чернова" },
    scheduled: { cls: "bm-badge--warning", label: "Насрочен" },
    published: { cls: "bm-badge--success", label: "Публикуван" },
  }[s]);

export const seedIntegrations: Integration[] = PROVIDERS.map((p) => ({ provider: p.id, connected: false, account_label: "" }));
export const seedAdDrafts: AdDraft[] = [];
export const seedSocialPosts: SocialPost[] = [];

// ---- Content calendar ----
export type ContentType = "promo" | "info" | "reel" | "project" | "post";

export interface ContentItem {
  id: string;
  client: string; // client id
  date: string | null; // ISO yyyy-mm-dd, or null when unscheduled (backlog)
  type: ContentType;
  title: string;
  notes: string;
  script?: string; // per-video script body (imported from .docx, editable in-app)
  hook?: string; // opening line — first 2-3 seconds decide everything
  hook_type?: string; // see HOOK_TYPES
  cta?: string; // closing call to action
  caption?: string; // platform caption for publishing
  hashtags?: string; // space-separated hashtags
  cycle_id?: string | null; // monthly cycle this video belongs to (set on import)
  notion_url: string;
  footage_url?: string; // линк към суровия материал (Drive папка от снимачния ден)
  published?: boolean;
  published_at?: string | null; // кога е публикувано — бордът архивира по него
  current_stage?: string;
  stages?: StageState[];
}

// bg/border/text colours pulled from the design-system token scales.
export const CONTENT_TYPES: { id: ContentType; label: string; bg: string; fg: string }[] = [
  { id: "promo", label: "Промо", bg: "var(--bm-warning-50)", fg: "var(--bm-warning-700)" },
  { id: "info", label: "Инфо", bg: "var(--bm-success-50)", fg: "var(--bm-success-700)" },
  { id: "reel", label: "Рийл", bg: "#E0F2F1", fg: "#00637E" },
  { id: "project", label: "Реализиран проект", bg: "#FCE7F0", fg: "#9D2667" },
  { id: "post", label: "Пост", bg: "var(--bm-info-50)", fg: "var(--bm-info-700)" },
];
export const contentTypeMeta = (t: ContentType) =>
  CONTENT_TYPES.find((c) => c.id === t) || CONTENT_TYPES[0];

export const seedContentItems: ContentItem[] = [];

// ---- Idea Bank ----
export type IdeaSource = "team" | "client_brief" | "trend" | "competitor" | "ai";
export type IdeaStatus = "backlog" | "approved" | "promoted" | "archived";

export interface Idea {
  id: string;
  client: string | null; // client id (null = general)
  title: string;
  description: string;
  hook: string;
  source: IdeaSource;
  status: IdeaStatus;
  votes: number;
  created_by: string;
  created_at?: string;
}

export const IDEA_SOURCES: { id: IdeaSource; label: string }[] = [
  { id: "team", label: "Екип" },
  { id: "client_brief", label: "Бриф на клиента" },
  { id: "trend", label: "Тренд" },
  { id: "competitor", label: "Конкурент" },
  { id: "ai", label: "AI" },
];
export const ideaSourceMeta = (s: IdeaSource) =>
  ({
    team: { cls: "bm-badge--info", label: "Екип" },
    client_brief: { cls: "bm-badge--neutral", label: "Бриф" },
    trend: { cls: "bm-badge--warning", label: "Тренд" },
    competitor: { cls: "bm-badge--danger", label: "Конкурент" },
    ai: { cls: "bm-badge--success", label: "AI" },
  }[s]);
export const ideaStatusMeta = (s: IdeaStatus) =>
  ({
    backlog: { cls: "bm-badge--neutral", label: "Бек-лог" },
    approved: { cls: "bm-badge--info", label: "Одобрена" },
    promoted: { cls: "bm-badge--success", label: "В продукция" },
    archived: { cls: "bm-badge--neutral", label: "Архив" },
  }[s]);

export const seedIdeas: Idea[] = [];

// ---- Hook structure (short-form video scripts) ----
export const HOOK_TYPES: { id: string; label: string }[] = [
  { id: "curiosity", label: "Любопитство" },
  { id: "pain_point", label: "Болка / проблем" },
  { id: "list", label: "Списък (топ 3…)" },
  { id: "authority", label: "Авторитет / експертиза" },
  { id: "fear", label: "Страх / риск" },
  { id: "myth_vs_fact", label: "Мит срещу факт" },
  { id: "pattern_interrupt", label: "Прекъсване на модела" },
];
export const hookTypeLabel = (id: string) => HOOK_TYPES.find((h) => h.id === id)?.label || id;

// ---- Client approvals (magic-link review) ----
export type ApprovalStatus = "pending" | "approved" | "changes_requested";
export interface Approval {
  id: string; // the magic-link token
  content_item_id: string;
  client_id: string;
  owner: string;
  status: ApprovalStatus;
  approver_email: string;
  feedback: string;
  suggested_script?: string; // редакцията на клиента — предложение, не презапис
  decided_at?: string | null;
  created_at?: string;
}
export const approvalStatusMeta = (s: ApprovalStatus) =>
  ({
    pending: { cls: "bm-badge--warning", label: "Чака одобрение" },
    approved: { cls: "bm-badge--success", label: "Одобрено от клиента" },
    changes_requested: { cls: "bm-badge--danger", label: "Иска промени" },
  }[s]);

// ---- New-client onboarding ----
// Standard checklist created as tasks when a lead is converted into a client.
export const ONBOARDING_TASKS: { title: string; priority: Priority }[] = [
  { title: "Получи достъп до акаунти и бранд материали", priority: "high" },
  { title: "Въвеждащо обаждане с клиента", priority: "high" },
  { title: "Попълни бранд профил (тон, аудитория)", priority: "medium" },
  { title: "Бизнес анализ преди старт на видеата", priority: "medium" },
  { title: "Потвърди съдържателния план с клиента", priority: "medium" },
];

// Content packages seed the backlog with a month's worth of videos on onboarding.
export interface ContentPackage {
  id: string;
  label: string;
  items: { type: ContentType; count: number }[];
}
export const CONTENT_PACKAGES: ContentPackage[] = [
  { id: "starter", label: "Стартов — 8 видеа/мес", items: [{ type: "reel", count: 4 }, { type: "post", count: 4 }] },
  { id: "growth", label: "Растеж — 16 видеа/мес", items: [{ type: "reel", count: 8 }, { type: "post", count: 6 }, { type: "promo", count: 2 }] },
  { id: "pro", label: "Про — 24 видеа/мес", items: [{ type: "reel", count: 12 }, { type: "post", count: 8 }, { type: "promo", count: 4 }] },
];
export const packageItemCount = (pkg: ContentPackage) => pkg.items.reduce((n, i) => n + i.count, 0);

// ---- Monthly content cycle (per client) ----
export type CyclePhase = "ideas" | "scripts" | "production" | "published";
export interface ContentCycle {
  id: string;
  client: string; // client id
  month: string; // 'YYYY-MM'
  target_count: number;
  phase: CyclePhase;
}
// Each phase maps to the production role that owns it — used to notify the right
// person when a cycle advances ('' = nobody to notify).
export const CYCLE_PHASES: { key: CyclePhase; label: string; role: string; dot: string }[] = [
  { key: "ideas", label: "Идеи", role: "strategy", dot: "var(--bm-info-500)" },
  { key: "scripts", label: "Сценарии", role: "script", dot: "var(--bm-brand-400)" },
  { key: "production", label: "Продукция", role: "camera", dot: "var(--bm-warning-500)" },
  { key: "published", label: "Публикувано", role: "", dot: "var(--bm-success-500)" },
];
export const cyclePhaseMeta = (p: CyclePhase) => CYCLE_PHASES.find((x) => x.key === p) || CYCLE_PHASES[0];

const BG_MONTHS = ["януари", "февруари", "март", "април", "май", "юни", "юли", "август", "септември", "октомври", "ноември", "декември"];
// Current month key, e.g. "2026-06".
export const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
// "2026-06" -> "юни 2026".
export const monthLabel = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return `${BG_MONTHS[(m || 1) - 1]} ${y}`;
};

export const TASK_COLUMNS: { key: TaskStatus; title: string; dot: string }[] = [
  { key: "todo", title: "To do", dot: "var(--bm-slate-400)" },
  { key: "inprogress", title: "In progress", dot: "var(--bm-info-500)" },
  { key: "review", title: "In review", dot: "var(--bm-warning-500)" },
  { key: "done", title: "Done", dot: "var(--bm-success-500)" },
];
