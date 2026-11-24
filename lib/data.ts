// Mock data + display helpers for the BrandMotion CRM frontend.
// Ported from the agency-workspace prototype; swap this module for real
// API/DB calls when the backend lands.

export type Health = "good" | "watch" | "risk";
export type InvStatus = "paid" | "pending" | "overdue" | "draft";
export type TaskStatus = "todo" | "inprogress" | "review" | "done";
export type Priority = "high" | "medium" | "low";

export type ClientStatus = "Active" | "At risk" | "Onboarding" | "Churned";
export interface Client {
  id: string;
  name: string;
  initials: string;
  industry: string;
  status: ClientStatus;
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
  created_at?: string;              // кога е добавен клиентът (за задържане)
  archived_at?: string | null;      // архивиран: скрит от списъците, но историята му остава
  churned_at?: string | null;       // кога е напуснал (status="Churned")
  // ---- Договор (0059) ----
  videos_per_month?: number | null; // договорени видеа на месец (8/10/12); празно = не е зададено
  payment_terms_days?: number;      // срок за плащане в дни след издаване на фактурата
  billing_email?: string;           // имейл за фактури и напомняния
  contract_start?: string | null;   // начало на работата с клиента
  // 'project' = не е постоянен клиент (0065): пази се с историята си, но без месечна такса, пакет и напомняния
  engagement?: "retainer" | "project";
  // ---- Пакет (CRM v2) ----
  platforms?: string[];             // къде публикуваме: facebook, instagram, tiktok, youtube
  services?: string[];              // какво включва пакетът
  contract_months?: number | null;  // срок на договора в месеци (празно = безсрочен)
  website?: string | null;
  onboarding?: Record<string, boolean>; // чеклист за старт: access_meta, access_ig, access_tiktok, brand_assets
}
export const clientStatusMeta = (s: ClientStatus) =>
  ({
    Active: { cls: "bm-badge--success", label: "Активен" },
    "At risk": { cls: "bm-badge--warning", label: "Риск" },
    Onboarding: { cls: "bm-badge--info", label: "Включване" },
    Churned: { cls: "bm-badge--danger", label: "Напуснал" },
  }[s]);

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
  issued: string;      // ISO ден (YYYY-MM-DD) — кога е издадена фактурата
  due: string;              // стар свободен текст — вече не се ползва за сметки
  due_date?: string | null; // ISO ден — падеж (0062): издаване + срока на клиента
  payment_method?: string;
  paid_at?: string | null; // ISO ден — кога е платена; по нея карат месечните сметки
  period?: string | null;  // 'YYYY-MM' — ЗА кой месец е плащането (0058); по него е „Събиране по месеци“
  created_at?: string; // set by the DB; кога е въведен редът (не е дата на издаване)
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

// Private tasks are strictly between the admin and the assignee — managers see
// only team-visible tasks (те следят продукцията от борда, не от чуждите таскове).
export const canSeeTask = (t: Task, level: AccessRole, initials: string) =>
  t.visibility !== "private" || level === "admin" || t.assignee === initials;

// Which clients this member may see. Empty list: workers see nothing until the
// admin assigns clients; managers keep full visibility (back-compat); admins all.
export function visibleClientsFor(level: AccessRole, clientIds: string[] | undefined, clients: Client[]): Client[] {
  if (level === "admin") return clients;
  const ids = clientIds || [];
  if (ids.length === 0) return level === "manager" ? clients : [];
  return clients.filter((c) => ids.includes(c.id));
}

// ⚠️ НАСЛЕДЕНО (до 0046) — плащането вече е по видео, не по задача. Оставено
// само за четене на стари task_pay данни; новото е `owedFor`. Не го използвай.
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

// ============================================================================
// ПЛАЩАНЕ ПО ВИДЕО (0046) — единицата е (видео × човек × роля), не етап.
// Няколко етапа се свиват в една платена роля през `stage_roles`, затова един
// монтажист, който прави и монтажа, и прегледа, взима ЕДНА сума за видеото.
// ============================================================================

export interface PayRole { key: string; label: string; sort: number }

// Резервни роли за демо режим (без Supabase) — огледало на `pay_roles` в 0046.
export const PAY_ROLES_FALLBACK: PayRole[] = [
  { key: "strategist", label: "Стратег", sort: 1 },
  { key: "scriptwriter", label: "Сценарист", sort: 2 },
  { key: "videographer", label: "Видеограф", sort: 3 },
  { key: "editor", label: "Монтажист", sort: 4 },
  { key: "poster", label: "Пост криейтър", sort: 5 },
  { key: "publisher", label: "Публикуващ", sort: 6 },
];

// Карта етап → платена роля (огледало на `stage_roles`). Етап, който не е тук,
// не струва пари. `review` е нарочно при `editor`: прегледът е част от монтажа.
export const STAGE_PAY_ROLE: Record<string, string> = {
  strategy: "strategist",
  script: "scriptwriter",
  shoot: "videographer",
  edit: "editor",
  review: "editor",
  publish: "publisher",
  copy: "poster",
  design: "poster",
};

export const payRoleLabel = (roles: PayRole[], key: string) =>
  roles.find((r) => r.key === key)?.label || PAY_ROLES_FALLBACK.find((r) => r.key === key)?.label || key;

// Жизненият цикъл на премията (0050). `granted`/`waived` са ръчни решения на
// админа и нищо автоматично не ги пренаписва.
export type BonusStatus = "none" | "pending" | "earned" | "missed" | "granted" | "waived";
export type EarningStatus = "pending" | "owed" | "in_package" | "paid";
export type Timeline = "прието" | "чака преглед" | "просрочено" | "изтича" | "в срок" | "без срок";

// Един ред на (видео × човек × роля), както го дава `v_earning_full`.
// `payable` е ЕДИНСТВЕНАТА истина за реда — фронтендът не го пресмята наново.
export interface VideoEarning {
  id: number;
  content_item_id: string | null;   // null = видеото е изтрито, но парите се дължат
  legacy_item_id?: string | null;   // старият id на изтрито видео (пренос 0046)
  title: string;                    // снимка на заглавието — оцелява изтриването
  publish_on?: string | null;
  profile_id: string;
  initials?: string;
  worker_name?: string;
  role_key: string;
  role_label?: string;
  client_id?: string | null;
  client_name?: string | null;
  price: number;
  price_locked: boolean;      // ръчна сума — тарифата вече не я пипа
  package_id?: number | null; // част от пакет → не е поотделно дължимо
  payout_id?: string | null;
  // ---- срок и часовник (0050) ----
  due_at?: string | null;
  due_source?: "manual" | "calendar" | "handover" | null;
  started_at?: string | null;
  submitted_at?: string | null;   // работникът е казал „готово" — часовникът спира
  accepted_at?: string | null;    // админът е приел
  redos: number;
  bonus_amount: number;
  bonus_status: BonusStatus;
  earned_at?: string | null;
  note?: string | null;
  // ---- изчислени от изгледа ----
  status: EarningStatus;
  payable: number;
  bonus_at_risk: number;
  days_late: number | null;   // отрицателно = подадено по-рано
  timeline: Timeline;
  created_at?: string;
}

// Редът на човека — `v_worker_owed`. `owed` НЕ се пресмята във фронтенда.
export interface WorkerOwed {
  profile_id: string;
  initials: string;
  name: string;
  owed: number;
  owed_videos: number;      // сумата на видеата извън пакет
  owed_packages: number;    // завършените неплатени пакети + техните премии
  pending: number;
  upcoming: number;
  paid_total: number;
  bonus_earned_total: number;
  bonus_at_risk: number;
  videos_done: number;
  late_videos: number;
  owed_count: number;
}

// ---- Месечна сметка (0053) --------------------------------------------------
// Един ред на позиция, както го дава `bm_month_settlement`. Фронтендът само
// групира и сумира — не решава кое влиза.
export interface SettlementLine {
  profile_id: string;
  initials: string;
  worker_name: string;
  kind: "video" | "package";
  ref_id: number;
  title: string;
  client_name?: string | null;
  role_label?: string | null;
  earned_on?: string | null;
  carried_over: boolean;   // заработено ПРЕДИ избрания месец
  price: number;
  bonus: number;
  amount: number;          // цена + заслужена премия
}

// Самопроверката: сборът от редовете срещу v_worker_owed.owed.
export interface SettlementCheck {
  profile_id: string;
  initials: string;
  from_lines: number;
  from_view: number;
  ok: boolean;
}

// Пакетът с прогреса си — `v_package_progress`.
export interface PackageProgress {
  id: number;
  profile_id: string;
  initials: string;
  worker_name: string;
  label: string;
  client_id?: string | null;
  client_name?: string | null;
  role_key?: string | null;
  status: PackageStatus;
  payout_mode: "on_completion" | "monthly_partial";
  videos_total: number;
  price_total: number;
  base_price?: number | null;
  bonus_per_video: number;
  started_on: string;
  completed_at?: string | null;
  payout_id?: string | null;
  price_per_video: number;
  used: number;
  on_time: number;
  late: number;
  bonus_earned: number;
  bonus_at_risk: number;
  bonus_missed: number;
  payable_now: number;
  payable_max: number;
  saved_vs_base?: number | null;
  days_running: number;
}

// N видеа за X€. Плаща се НАВЕДНЪЖ при завършване; видеата вътре само
// придвижват прогреса и никога не стават поотделно дължими.
export type PackageStatus = "open" | "completed" | "paid" | "cancelled";
export interface WorkerPackage {
  id: number;
  profile_id: string;
  label: string;
  target_count: number;
  total_price: number;
  role_key?: string | null;
  client_id?: string | null;
  status: PackageStatus;
  completed_at?: string | null;
  payout_id?: string | null;
  created_at?: string;
}

// Плащане с дата, метод и референция. Отменяемо (`voided_at`), не се трие.
export interface Payout {
  id: string;
  profile_id: string;
  amount: number;
  method?: string | null;
  reference?: string | null;
  note?: string | null;
  paid_at: string;
  voided_at?: string | null;
}

export interface VideoRate {
  id: number;
  profile_id: string;
  role_key?: string | null;
  client_id?: string | null;
  price: number;
  valid_from: string;
}

export const PAY_METHODS: { id: string; label: string }[] = [
  { id: "bank", label: "Банка" },
  { id: "cash", label: "В брой" },
  { id: "revolut", label: "Revolut" },
  { id: "wise", label: "Wise" },
  { id: "other", label: "Друго" },
];

// ---- Месечна навигация (‹ Август 2026 ›) ----------------------------------
export const shiftMonthKey = (key: string, delta: number) => {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
// `null` месец = „цял период“ (без филтър).
export const inMonthKey = (iso: string | null | undefined, key: string | null) => {
  if (!key) return true;
  const t = parseDay(iso);
  if (Number.isNaN(t)) return false;
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` === key;
};

// ---- Дължимо на един човек -------------------------------------------------
// Огледало на `v_worker_owed` от 0046, за да работи и демо режимът без Supabase.
//   owed      — завършени неплатени ОТДЕЛНИ видеа + завършени неплатени пакети
//   upcoming  — започнати, но още незавършени отделни видеа
//   paidTotal — сумата на неотменените плащания
export function owedFor(
  earnings: VideoEarning[],
  packages: WorkerPackage[],
  payouts: Payout[],
  profileId: string
) {
  const mine = earnings.filter((e) => e.profile_id === profileId && !e.package_id);
  const open = mine.filter((e) => !e.payout_id);
  const owedVideos = open.filter((e) => e.earned_at);
  const packs = packages.filter(
    (p) => p.profile_id === profileId && p.status === "completed" && !p.payout_id
  );
  const sum = (list: { price: number }[]) => list.reduce((a, e) => a + (e.price || 0), 0);
  return {
    owed: sum(owedVideos) + packs.reduce((a, p) => a + (p.total_price || 0), 0),
    owedVideos: owedVideos.length,
    owedPackages: packs,
    upcoming: sum(open.filter((e) => !e.earned_at)),
    paidTotal: payouts
      .filter((p) => p.profile_id === profileId && !p.voided_at)
      .reduce((a, p) => a + (p.amount || 0), 0),
  };
}

// ---- Рентабилност по клиент ------------------------------------------------
// Данните ги има от 0046 (video_earnings.client_id), просто никъде не се
// събираха. `cost` е НАЧИСЛЕНОТО (заработено + предстоящо) — то е реалният
// ангажимент към екипа, независимо дали е преведено.
export interface ClientPnl {
  id: string; name: string; status: ClientStatus;
  revenue: number;          // събрано от платени фактури
  cost: number;             // начислено към екипа за този клиент
  earnedCost: number;       // от него — вече заработено (дължимо или платено)
  profit: number;
  margin: number | null;    // null = няма приход, маржът е безсмислен
  videos: number;
  costPerVideo: number;
  revenuePerVideo: number | null;
}

export function clientPnlRows(
  clients: Client[], invoices: Invoice[], earnings: VideoEarning[]
): ClientPnl[] {
  return clients
    .map((c) => {
      const mine = earnings.filter((e) => e.client_id === c.id);
      const revenue = clientLtv(invoices, c.id);
      const cost = mine.reduce((a, e) => a + (e.price || 0), 0);
      const earnedCost = mine.filter((e) => e.earned_at).reduce((a, e) => a + (e.price || 0), 0);
      const videos = new Set(mine.map((e) => e.content_item_id || e.legacy_item_id)).size;
      const profit = revenue - cost;
      return {
        id: c.id, name: c.name, status: c.status,
        revenue, cost, earnedCost, profit,
        margin: revenue > 0 ? (profit / revenue) * 100 : null,
        videos,
        costPerVideo: videos ? cost / videos : 0,
        revenuePerVideo: videos && revenue > 0 ? revenue / videos : null,
      };
    })
    .filter((r) => r.revenue > 0 || r.cost > 0)
    .sort((a, b) => b.profit - a.profit);
}

// ---- Серии по месеци за екрана Анализи ------------------------------------
// Приходът е КАСОВ (платени фактури по paid_at). Разходът за екипа е НАЧИСЛЕН
// (video_earnings по earned_at) — това е реалната цена на свършената работа.
// Касовият разход (payouts) стои отделно, защото преводът може да е много
// по-късно от работата и смесването на двете крие маржа.
export interface MonthPnl {
  key: string; label: string;
  revenue: number;      // събрано по paid_at
  cost: number;         // начислено към екипа по earned_at
  paidOut: number;      // реално преведено по payouts.paid_at
  profit: number;       // revenue − cost
  videos: number;       // завършени видеа
  costPerVideo: number;
}

export function monthlyPnl(
  invoices: Invoice[], earnings: VideoEarning[], payouts: Payout[], months: number | null
): MonthPnl[] {
  // Обхватът тръгва от най-ранното събитие, за да няма празни месеци отпред.
  const stamps = [
    ...invoices.filter((i) => i.status === "paid").map((i) => parseDay(i.paid_at)),
    ...earnings.filter((e) => e.earned_at).map((e) => parseDay(e.earned_at)),
    ...payouts.filter((p) => !p.voided_at).map((p) => parseDay(p.paid_at)),
  ].filter((t) => !Number.isNaN(t));
  if (!stamps.length) return [];

  const now = new Date();
  const first = new Date(Math.min(...stamps));
  let start = new Date(first.getFullYear(), first.getMonth(), 1);
  if (months) {
    const limit = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
    if (limit > start) start = limit;
  }

  const out: MonthPnl[] = [];
  for (let d = new Date(start); d <= now; d.setMonth(d.getMonth() + 1)) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const revenue = invoices
      .filter((i) => i.status === "paid" && inMonthKey(i.paid_at, key))
      .reduce((a, i) => a + (i.amount || 0), 0);
    const inMonth = earnings.filter((e) => e.earned_at && inMonthKey(e.earned_at, key));
    const cost = inMonth.reduce((a, e) => a + (e.price || 0), 0);
    const videos = new Set(inMonth.map((e) => e.content_item_id || e.legacy_item_id)).size;
    const paidOut = payouts
      .filter((p) => !p.voided_at && inMonthKey(p.paid_at, key))
      .reduce((a, p) => a + (p.amount || 0), 0);
    out.push({ key, label: monthLabel(key), revenue, cost, paidOut,
      profit: revenue - cost, videos, costPerVideo: videos ? cost / videos : 0 });
  }
  return out;
}

// ---- Несъбрано по давност ---------------------------------------------------
// `due` беше свободен текст до 0044 — редовете без разпознаваема дата отиват в
// собствена кофа, вместо да се преструваме, че падежът е известен.
export interface AgingBucket { label: string; amount: number; count: number; tone: "ok" | "warn" | "bad" | "muted" }

export function receivablesAging(invoices: Invoice[]): AgingBucket[] {
  const open = invoices.filter((i) => i.status === "pending" || i.status === "overdue");
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const b: Record<string, AgingBucket> = {
    fresh:   { label: "Не е паднала", amount: 0, count: 0, tone: "ok" },
    d30:     { label: "До 30 дни",    amount: 0, count: 0, tone: "warn" },
    d60:     { label: "30–60 дни",    amount: 0, count: 0, tone: "warn" },
    d60plus: { label: "Над 60 дни",   amount: 0, count: 0, tone: "bad" },
    unknown: { label: "Без падеж",    amount: 0, count: 0, tone: "muted" },
  };
  for (const i of open) {
    const t = parseDay(i.due_date || i.due);
    let k: keyof typeof b;
    if (Number.isNaN(t)) k = "unknown";
    else {
      const days = Math.floor((today.getTime() - t) / 86400000);
      k = days <= 0 ? "fresh" : days <= 30 ? "d30" : days <= 60 ? "d60" : "d60plus";
    }
    b[k].amount += i.amount || 0;
    b[k].count += 1;
  }
  return Object.values(b).filter((x) => x.count > 0);
}

// ---- Къде отиват парите -----------------------------------------------------
// Реални преводи по човек, ако има; иначе начисленото — за да не е празен блокът,
// докато още нищо не е платено.
export interface SpendRow { label: string; amount: number; accrued: boolean }

export function spendBreakdown(
  payouts: Payout[], earnings: VideoEarning[], team: TeamMember[], monthKeyOrNull: string | null
): { rows: SpendRow[]; accrued: boolean; total: number } {
  const nameOf = (id: string) => team.find((m) => m.id === id)?.name || "—";
  const paid = payouts.filter((p) => !p.voided_at && inMonthKey(p.paid_at, monthKeyOrNull));
  const src = paid.length
    ? Object.entries(paid.reduce<Record<string, number>>((acc, p) => {
        acc[p.profile_id] = (acc[p.profile_id] || 0) + (p.amount || 0); return acc; }, {}))
    : Object.entries(earnings
        .filter((e) => e.earned_at && inMonthKey(e.earned_at, monthKeyOrNull))
        .reduce<Record<string, number>>((acc, e) => {
          acc[e.profile_id] = (acc[e.profile_id] || 0) + (e.price || 0); return acc; }, {}));
  const rows = src
    .map(([id, amount]) => ({ label: nameOf(id), amount, accrued: !paid.length }))
    .filter((r) => r.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  return { rows, accrued: !paid.length, total: rows.reduce((a, r) => a + r.amount, 0) };
}

// Общият ангажимент към екипа: начислено, но още непреведено. Разликата между
// него и payoutCost е причината „Чиста печалба" да изглежда по-голяма, отколкото е.
export const accruedLiability = (earnings: VideoEarning[]) =>
  earnings.filter((e) => !e.payout_id).reduce((a, e) => a + (e.price || 0), 0);

// Текущата тарифа на човек за роля (+ по избор клиент) — огледало на
// `bm_video_price` от 0046, за да се покаже чипът, без да се пита базата.
// Приоритет на съвпадението: клиент(4) + роля(2); при равенство — по-новият ред.
export function videoPriceFor(
  rates: VideoRate[],
  profileId: string,
  roleKey: string,
  clientId?: string | null,
  fallbackRate?: number
): number {
  const score = (r: VideoRate) => (r.client_id ? 4 : 0) + (r.role_key ? 2 : 0);
  const match = rates
    .filter((r) => r.profile_id === profileId
      && (!r.role_key || r.role_key === roleKey)
      && (!r.client_id || r.client_id === clientId))
    .sort((a, b) => score(b) - score(a) || (b.valid_from || "").localeCompare(a.valid_from || "") || b.id - a.id)[0];
  return match ? match.price : fallbackRate ?? 15;
}

// Колко е свършил пакетът (за прогрес бара).
export const packageProgress = (earnings: VideoEarning[], pkg: WorkerPackage) => {
  const inPkg = earnings.filter((e) => e.package_id === pkg.id);
  return { done: inPkg.filter((e) => e.earned_at).length, total: pkg.target_count };
};

// Реално изплатено на екипа за период — по датата на ПЛАЩАНЕ (payouts), а не по
// задачите. Заменя workerPaidCost за новия модел.
export const payoutCost = (payouts: Payout[], monthKeyOrNull: string | null) =>
  payouts
    .filter((p) => !p.voided_at && inMonthKey(p.paid_at, monthKeyOrNull))
    .reduce((a, p) => a + (p.amount || 0), 0);

// Weekly capacity per person (hours) — over this is flagged as overloaded.
export const WEEKLY_CAPACITY_HOURS = 40;

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

  tasks: ["admin", "manager", "worker"],
  calendar: ["admin", "manager", "worker"],
  production: ["admin", "manager", "worker"],
  clients: ["admin"],
  pipeline: ["admin"],
  analytics: ["admin"],
  team: ["admin", "manager"],
  invoices: ["admin"],
  payouts: ["admin", "manager", "worker"], // всеки вижда САМО своите (RLS); админ вижда всички
  bookings: ["admin"],
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
  approved?: boolean; // false = чака одобрение от админ (нова регистрация)
  email?: string; // за валидиращия имейл при одобрение
  avatar_url?: string; // публичен URL на профилната снимка (Storage bucket „avatars“)
  pay_rate?: number; // дефолтна ставка €/видео (worker_rates; вижда се само от админ/себе си)
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
// Сумите се показват ТОЧНИ навсякъде (€1 425, не €1.4k). Показваме стотинки само
// когато сумата има такива (€50,30), а кръглите остават без десетични (€1 425).
// fmtK остава псевдоним за старите извиквания из KPI картите.
export const fmtFull = (n: number) => {
  const hasCents = Math.round((n || 0) * 100) % 100 !== 0;
  return "€" + (n || 0).toLocaleString("bg-BG", { minimumFractionDigits: hasCents ? 2 : 0, maximumFractionDigits: 2 });
};
export const fmtK = fmtFull;

// ---- Дати по дни (YYYY-MM-DD) ----------------------------------------------
// Датите на фактурите се пазят като ISO ден без час. Парсваме ги в ЛОКАЛНА
// полунощ — `new Date("2026-08-01")` е UTC и може да падне в предния месец.
const pad2 = (n: number) => String(n).padStart(2, "0");
export const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
export const parseDay = (s?: string | null) => {
  if (!s) return NaN;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]).getTime();
  return new Date(s).getTime(); // наследени/timestamptz стойности
};
// „18 авг 2026“. Непозната стойност (стар свободен текст) се връща както е.
export const fmtDay = (s?: string | null) => {
  if (!s) return "—";
  const t = parseDay(s);
  return Number.isNaN(t) ? s : new Date(t).toLocaleDateString("bg-BG", { day: "numeric", month: "short", year: "numeric" });
};

// Начало на текущия месец + помощник за „платено този месец“ сметките.
export const monthStart = () => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d.getTime(); };
export const inCurrentMonth = (iso?: string | null) => { const t = parseDay(iso); return !Number.isNaN(t) && t >= monthStart(); };

// ---- Приход / печалба / задържане (Анализи + Възнаграждения) ----
// Реално събрано = сумата на ПЛАТЕНИТЕ фактури (опц. само текущия месец по paid_at —
// т.е. кога парите са влезли, не кога е въведен редът).
export const collectedRevenue = (invoices: Invoice[], onlyMonth = false) =>
  invoices.filter((i) => i.status === "paid" && (!onlyMonth || inCurrentMonth(i.paid_at)))
    .reduce((a, i) => a + (i.amount || 0), 0);

// ⚠️ НАСЛЕДЕНО (до 0046) — замени го с `payoutCost(payouts, …)`, което кара по
// реалните преводи. Оставено само за стари данни.
// Изплатено на работници = сумата на pay_amount за ПЛАТЕНИТЕ задачи (месец = по paid_at).
export const workerPaidCost = (tasks: Task[], onlyMonth = false) =>
  tasks.filter((t) => t.paid && (!onlyMonth || inCurrentMonth(t.paid_at)))
    .reduce((a, t) => a + (t.pay_amount || 0), 0);

// LTV на клиент = сумата на всичките му платени фактури.
export const clientLtv = (invoices: Invoice[], clientId: string) =>
  invoices.filter((i) => i.client === clientId && i.status === "paid").reduce((a, i) => a + (i.amount || 0), 0);

// Задържане в дни: от created_at до churned_at (или до сега, ако е активен).
export const clientTenureDays = (c: Client) => {
  if (!c.created_at) return 0;
  const start = new Date(c.created_at).getTime();
  const end = c.churned_at ? new Date(c.churned_at).getTime() : Date.now();
  return Math.max(0, Math.floor((end - start) / 86400000));
};
// „1г 3м“ / „5 мес.“ / „12 дни“
export const fmtTenure = (days: number) => {
  if (days < 31) return `${days} ${days === 1 ? "ден" : "дни"}`;
  const months = Math.floor(days / 30.44);
  if (months < 12) return `${months} мес.`;
  const y = Math.floor(months / 12);
  const rem = months % 12;
  return rem ? `${y}г ${rem}м` : `${y} ${y === 1 ? "година" : "години"}`;
};
// Събрано по месеци (последните n месеца, по датата на плащане) — за бар
// графиката „Приход по месеци“.
export const revenueByMonth = (invoices: Invoice[], n = 12) => {
  const now = new Date();
  const out: { key: string; label: string; val: number }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = monthKey(d);
    const val = invoices.filter((iv) => { const t = iv.status === "paid" ? parseDay(iv.paid_at) : NaN; return !Number.isNaN(t) && monthKey(new Date(t)) === key; })
      .reduce((a, iv) => a + (iv.amount || 0), 0);
    out.push({ key, label: monthLabel(key), val });
  }
  return out;
};

// Клиентите за избор и списъци — без архивираните. Анализите НЕ ползват това:
// там архивираните трябва да се броят, иначе миналият приход изчезва от отчета.
export const activeClients = (list: Client[]) => list.filter((c) => !c.archived_at);
// Постоянните клиенти — тези, от които се очаква месечна такса и пакет.
export const isProjectClient = (c: Client) => c.engagement === "project";
export const retainerClients = (list: Client[]) => list.filter((c) => !c.archived_at && c.status !== "Churned" && !isProjectClient(c));

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

export type LeadStage = "new" | "meeting" | "proposal" | "won" | "lost" | "waiting";
// Откъде идва лийдът. „referral" отключва връзка към препоръчалия (клиент/име).
export type LeadSource = "cold" | "referral" | "inbound" | "social" | "event" | "other";

export interface Lead {
  id: string;
  name: string;
  contact: string;
  value: number;
  stage: LeadStage;
  owner: string;
  source?: LeadSource;
  referred_by_client_id?: string | null; // при „Препоръка": свързан съществуващ клиент
  referred_by_name?: string;             // …или свободно име на външен препоръчител
  client_id?: string | null; // set once the won lead is onboarded into a client
  videos_per_month?: number | null; // договорени видеа на месец — пренасят се в клиента (0059)
  monthly_fee?: number | null;      // договорена месечна такса (value е общата стойност на сделката)
  stage_changed_at?: string | null; // откога е в текущия етап (0066)
}

export const PIPELINE_STAGES: { key: LeadStage; title: string; dot: string }[] = [
  { key: "new", title: "Потенциални клиенти", dot: "var(--bm-slate-400)" },
  { key: "meeting", title: "Проведена среща", dot: "var(--bm-info-500)" },
  { key: "proposal", title: "Оферта", dot: "var(--bm-warning-500)" },
  { key: "won", title: "Спечелени", dot: "var(--bm-success-500)" },
  { key: "lost", title: "Загубени", dot: "var(--bm-danger-500)" },
  // Последна колона: чакаме решение от клиента и нищо не се движи (0066).
  { key: "waiting", title: "На изчакване", dot: "var(--bm-slate-400)" },
];

export const leadStageMeta = (s: LeadStage) =>
  ({
    new: { cls: "bm-badge--neutral", label: "Потенциален" },
    meeting: { cls: "bm-badge--info", label: "Среща" },
    proposal: { cls: "bm-badge--warning", label: "Оферта" },
    won: { cls: "bm-badge--success", label: "Спечелен" },
    lost: { cls: "bm-badge--danger", label: "Загубен" },
    waiting: { cls: "bm-badge--neutral", label: "На изчакване" },
  }[s]);

export const LEAD_SOURCES: { id: LeadSource; label: string }[] = [
  { id: "cold", label: "Студен контакт" },
  { id: "referral", label: "Препоръка" },
  { id: "inbound", label: "Входящо запитване" },
  { id: "social", label: "Социални мрежи" },
  { id: "event", label: "Събитие" },
  { id: "other", label: "Друго" },
];

export const leadSourceMeta = (s: LeadSource | undefined) =>
  ({
    cold: { cls: "bm-badge--neutral", label: "Студен контакт" },
    referral: { cls: "bm-badge--brand", label: "Препоръка" },
    inbound: { cls: "bm-badge--info", label: "Входящо" },
    social: { cls: "bm-badge--info", label: "Соц. мрежи" },
    event: { cls: "bm-badge--warning", label: "Събитие" },
    other: { cls: "bm-badge--neutral", label: "Друго" },
  }[s || "cold"]);

export const seedLeads: Lead[] = [];

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
  hashtags?: string; // стари данни — полето отпадна от формата (AI ги слага в caption)
  cycle_id?: string | null; // месецът-пакет, към който се брои видеото (0059: базата го слага сама, ако липсва)
  cycle_manual?: boolean;       // месецът е избран ръчно; иначе базата го слага при предаване (0065)
  delivered_at?: string | null; // кога реално е станало готово (стигнало „Публикуване“/публикувано)
  // ---- Движение (0061) ----
  stage_entered_at?: string | null; // откога е в текущия етап (слага го базата)
  waiting_on?: WaitingOn;           // защо стои; '' = не чака нищо. Чисти се при смяна на етапа.
  waiting_note?: string;
  waiting_since?: string | null;
  notion_url?: string; // стари данни — полето отпадна от формата
  footage_url?: string; // линк към суровия материал (Drive папка от снимачния ден)
  thumbnail_url?: string; // „Линк за снимка на видеото“ — Drive линк, всеки може да сменя
  final_url?: string; // линк към ГОТОВАТА (монтирана) версия — тегли се оттук за публикуване
  published?: boolean;
  published_at?: string | null; // кога е публикувано — бордът архивира по него
  // Корекции по монтажа: пише ги отговорникът на етап „Преглед“, монтажистът
  // ги отмята. Държим ги отделно от notes (брифа) — вж. миграция 0043.
  corrections?: string;
  corrections_done?: boolean;
  corrections_by?: string; // инициали на автора
  corrections_at?: string | null;
  // Преглед от клиента в портала (миграция 0057): '' = не е изпращано.
  client_review_status?: ClientReviewStatus;
  client_review_url?: string; // линкът, който клиентът вижда (обикновено готовият вариант)
  client_review_feedback?: string; // какво иска да се промени
  client_review_by?: string; // инициали на изпратилия
  client_review_sent_at?: string | null;
  client_review_decided_at?: string | null;
  current_stage?: string;
  stages?: StageState[];
}

export type ClientReviewStatus = "" | "sent" | "approved" | "changes";
export const clientReviewMeta = (s: ClientReviewStatus | undefined) =>
  ({
    sent: { cls: "bm-badge--warning", label: "Чака клиента", short: "👀 При клиента" },
    approved: { cls: "bm-badge--success", label: "Одобрено от клиента", short: "✓ Клиентът одобри" },
    changes: { cls: "bm-badge--danger", label: "Клиентът иска промени", short: "✎ Клиентът иска промени" },
  }[s as "sent" | "approved" | "changes"] ?? null);

// Ако линкът сочи към конкретен файл в Google Drive, връща URL за вградена
// картинка-преглед (thumbnail endpoint-а на Drive). За папки/непознати линкове
// връща null — тогава показваме само линка „Отвори“. Файлът трябва да е
// споделен с „всеки с линка“, за да се зареди визуализацията.
export function driveThumbnailSrc(url: string | undefined, width = 400): string | null {
  if (!url) return null;
  const m = url.match(/\/file\/d\/([\w-]+)/) || url.match(/[?&]id=([\w-]+)/);
  return m ? `https://drive.google.com/thumbnail?id=${m[1]}&sz=w${width}` : null;
}

// bg/border/text colours pulled from the design-system token scales.
export const CONTENT_TYPES: { id: ContentType; label: string; bg: string; fg: string }[] = [
  { id: "promo", label: "Промо", bg: "var(--bm-warning-50)", fg: "var(--bm-warning-700)" },
  { id: "info", label: "Инфо", bg: "var(--bm-success-50)", fg: "var(--bm-success-700)" },
  { id: "reel", label: "Рийл", bg: "var(--bm-ct-reel-bg)", fg: "var(--bm-ct-reel-fg)" },
  { id: "project", label: "Реализиран проект", bg: "var(--bm-ct-project-bg)", fg: "var(--bm-ct-project-fg)" },
  { id: "post", label: "Пост", bg: "var(--bm-info-50)", fg: "var(--bm-info-700)" },
];
export const contentTypeMeta = (t: ContentType) =>
  CONTENT_TYPES.find((c) => c.id === t) || CONTENT_TYPES[0];

export const seedContentItems: ContentItem[] = [];

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
  batch_token?: string | null; // ако е част от групов линк (/review/group/<token>)
  decided_at?: string | null;
  created_at?: string;
}
export const approvalStatusMeta = (s: ApprovalStatus) =>
  ({
    pending: { cls: "bm-badge--warning", label: "Чака одобрение" },
    approved: { cls: "bm-badge--success", label: "Одобрено от клиента" },
    changes_requested: { cls: "bm-badge--danger", label: "Иска промени" },
  }[s]);

// ---- Снимачни дни (резервации от портала, одобрение от админ) ----
export type BookingStatus = "pending" | "approved" | "declined";
export interface ShootBooking {
  id: string;
  client_id: string;
  date: string;       // ISO yyyy-mm-dd
  start_time?: string | null; // 'HH:MM' or null
  end_time?: string | null;
  note: string;
  status: BookingStatus;
  created_at?: string;
  decided_at?: string | null;
}
export const bookingStatusMeta = (s: BookingStatus) =>
  ({
    pending: { cls: "bm-badge--warning", label: "Чака одобрение" },
    approved: { cls: "bm-badge--success", label: "Одобрен" },
    declined: { cls: "bm-badge--danger", label: "Отказан" },
  }[s]);

// „10:00–14:00" от start/end (за чипове и списъци); празно ако няма часове.
export const bookingTimeLabel = (b: Pick<ShootBooking, "start_time" | "end_time">) =>
  b.start_time ? `${b.start_time}${b.end_time ? "–" + b.end_time : ""}` : "";

// ---- New-client onboarding ----
// Standard checklist created as tasks when a lead is converted into a client.
export const ONBOARDING_TASKS: { title: string; priority: Priority }[] = [
  { title: "Получи достъп до акаунти и бранд материали", priority: "high" },
  { title: "Въвеждащо обаждане с клиента", priority: "high" },
  { title: "Попълни бранд профил (тон, аудитория)", priority: "medium" },
  { title: "Бизнес анализ преди старт на видеата", priority: "medium" },
  { title: "Потвърди съдържателния план с клиента", priority: "medium" },
];

// Месечните пакети са САМО видеа: 8, 10 или 12. Договорената бройка се пази в
// clients.videos_per_month и оттам се отваря цикълът на всеки месец (0059).
export const VIDEO_PACKAGES = [8, 10, 12] as const;

// ---- Monthly content cycle (per client) ----
export type CyclePhase = "ideas" | "scripts" | "production" | "published";
export interface ContentCycle {
  id: string;
  client: string; // client id
  month: string; // 'YYYY-MM'
  target_count: number;
  phase: CyclePhase;
}
// ---- Движение на видеото (0061): откога е в етапа и защо стои -----------------
export type WaitingOn = "" | "client" | "footage" | "shoot" | "team" | "other";
export const WAITING_REASONS: { id: Exclude<WaitingOn, "">; label: string; short: string }[] = [
  { id: "client", label: "Чака клиента", short: "клиента" },
  { id: "footage", label: "Чака материал", short: "материал" },
  { id: "shoot", label: "Чака снимачен ден", short: "снимки" },
  { id: "team", label: "Чака човек от екипа", short: "екипа" },
  { id: "other", label: "Друго", short: "друго" },
];
export const waitingMeta = (w?: WaitingOn) => WAITING_REASONS.find((r) => r.id === w) || null;
export interface StageEvent { id: number; content_item_id: string; from_stage: string | null; to_stage: string; changed_by: string; changed_at: string; days_in_prev: number | null }
const wholeDays = (iso?: string | null, now = new Date()) => {
  if (!iso) return 0;
  const t = new Date(iso.length === 10 ? iso + "T00:00:00" : iso).getTime();
  return Number.isNaN(t) ? 0 : Math.max(0, Math.floor((now.getTime() - t) / 86400000));
};
export const daysInStage = (ci: ContentItem, now = new Date()) => wholeDays(ci.stage_entered_at, now);
// Прагове: колко дни в един етап са „заседнало“ и колко — тревожно.
export const STUCK_DAYS = 7;
export const STUCK_DAYS_HARD = 14;
// Състояние на видео в работа. Редът е по тежест: закъснява > чака > заседнало > изтича.
export type HealthLevel = "late" | "waiting" | "stuck" | "soon" | "ok";
export interface VideoHealth { level: HealthLevel; label: string; badge: string; days: number; score: number }
export function videoHealth(ci: ContentItem, now = new Date()): VideoHealth | null {
  if (ci.published) return null;
  const days = daysInStage(ci, now);
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const ready = ci.current_stage === "publish";
  if (ci.date && ci.date < today) {
    const over = wholeDays(ci.date, now);
    return { level: "late", label: ready ? `не е публикувано · ${over}д след датата` : `закъснява с ${over}д`, badge: "bm-badge--danger", days, score: 1000 + over };
  }
  const w = waitingMeta(ci.waiting_on);
  if (w) {
    const wd = wholeDays(ci.waiting_since, now);
    return { level: "waiting", label: `чака ${w.short} · ${wd}д`, badge: wd >= 5 ? "bm-badge--danger" : "bm-badge--info", days, score: 500 + wd };
  }
  if (!ready && days >= STUCK_DAYS) return { level: "stuck", label: `${days}д в етапа`, badge: days >= STUCK_DAYS_HARD ? "bm-badge--danger" : "bm-badge--warning", days, score: 300 + days };
  if (!ready && ci.date) {
    const left = Math.ceil((new Date(ci.date + "T00:00:00").getTime() - now.getTime()) / 86400000);
    if (left <= 2) return { level: "soon", label: left <= 0 ? "датата е днес" : `остават ${left}д`, badge: "bm-badge--warning", days, score: 200 - left };
  }
  return { level: "ok", label: ready ? "готово за публикуване" : days >= 1 ? `${days}д в етапа` : "днес", badge: "bm-badge--neutral", days, score: days };
}

// ---- Изпълнение на пакета по месеци (0059) ---------------------------------
// Видеото се брои към месеца на ПАКЕТА (cycle_id), не към датата, на която е
// станало готово. „Готово“ = има delivered_at (стигнало е „Публикуване“ или е
// публикувано). Постовете не влизат в бройката.
export const isVideo = (ci: ContentItem) => ci.type !== "post";
export const isDelivered = (ci: ContentItem) => !!ci.delivered_at || !!ci.published || ci.current_stage === "publish";
// Последният ден на месец 'YYYY-MM' като ISO ден.
export const monthEndISO = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return `${key}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
};
// Предадено след края на месеца на пакета → закъсняло.
export const deliveredLate = (ci: ContentItem, month: string) =>
  !!ci.delivered_at && ci.delivered_at.slice(0, 10) > monthEndISO(month);
export interface CycleProgress {
  cycle: ContentCycle;
  videos: ContentItem[]; // готовите видеа за месеца (видеата в работа не са „за месеца“ и не се показват тук)
  done: number;          // = videos.length
  late: number;          // готови, но след края на месеца
  target: number;        // договорена бройка (0 = не е зададена)
  remaining: number;     // max(0, target − done)
}
// Месецът показва само ГОТОВОТО за него. Идея или сценарий, закачени към месец
// автоматично (защото още нямат дата), не са „видео за месеца“, докато не станат готови.
export function cycleProgress(cycle: ContentCycle, items: ContentItem[]): CycleProgress {
  const videos = items.filter((ci) => ci.cycle_id === cycle.id && isVideo(ci) && isDelivered(ci));
  const done = videos.length;
  return { cycle, videos, done, late: videos.filter((v) => deliveredLate(v, cycle.month)).length, target: cycle.target_count, remaining: Math.max(0, cycle.target_count - done) };
}
// Всички месеци на един клиент, най-новият първи.
export const clientCycleProgress = (clientId: string, cycles: ContentCycle[], items: ContentItem[]) =>
  cycles.filter((c) => c.client === clientId).sort((a, b) => b.month.localeCompare(a.month)).map((c) => cycleProgress(c, items));
// Изпълнението за един месец по клиенти. Клиент без цикъл за месеца се показва
// с договорената си бройка и 0 готови (цикълът се отваря от базата през нощта).
export interface ClientMonthProgress { client: Client; target: number; done: number; total: number; late: number; cycleId: string | null }
export function monthProgress(clients: Client[], cycles: ContentCycle[], items: ContentItem[], key: string): ClientMonthProgress[] {
  return clients.map((client) => {
    const cy = cycles.find((c) => c.client === client.id && c.month === key);
    if (!cy) return { client, target: client.videos_per_month || 0, done: 0, total: 0, late: 0, cycleId: null };
    const p = cycleProgress(cy, items);
    return { client, target: p.target, done: p.done, total: p.videos.length, late: p.late, cycleId: cy.id };
  });
}
// Очакван дял от бройката към днешна дата (равномерно през месеца) — за знак
// „изостава“. За минал месец = цялата бройка, за бъдещ = 0.
export function expectedByToday(target: number, key: string, now = new Date()) {
  const cur = monthKey(now);
  if (key < cur) return target;
  if (key > cur) return 0;
  const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return Math.floor((target * now.getDate()) / days);
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

// ---- Събиране по месеци (0058) --------------------------------------------
// Кой колко е платил ЗА даден месец и колко още дължи. Правилото е огледало на
// SQL функцията bm_month_collections (тя храни автоматичното напомняне) —
// пипаш ли едното, пипни и другото.
export interface MonthTarget { client_id: string; month: string; amount: number; note: string }
export interface CollectionRow {
  client: Client;
  expected: number;
  paid: number;
  remaining: number; // max(0, expected − paid)
  overpaid: number;  // max(0, paid − expected)
  hasOverride: boolean;
  note: string;
  invoices: Invoice[]; // всички фактури за месеца (платени и не)
}
export const invoicePeriod = (i: Invoice) => i.period || (i.issued || "").slice(0, 7);
const cents = (n: number) => Math.round(n * 100) / 100;
export function monthCollections(clients: Client[], invoices: Invoice[], targets: MonthTarget[], key: string): CollectionRow[] {
  const [y, m] = key.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1)).getTime();
  const end = new Date(Date.UTC(y, m, 1)).getTime();
  const ts = (iso?: string | null) => (iso ? new Date(iso).getTime() : NaN);
  const rows: CollectionRow[] = [];
  for (const c of clients) {
    const t = targets.find((x) => x.client_id === c.id && x.month === key);
    const created = ts(c.created_at);
    const churned = ts(c.churned_at);
    const alive = !c.archived_at
      && c.engagement !== "project" // проектните нямат месечна такса
      && (Number.isNaN(created) || created < end)
      && (c.status !== "Churned" || (!Number.isNaN(churned) && churned >= start))
      && (Number.isNaN(churned) || churned >= start);
    const expected = cents(t ? Number(t.amount) || 0 : alive ? c.mrr || 0 : 0);
    const inv = invoices.filter((i) => i.client === c.id && invoicePeriod(i) === key);
    if (expected <= 0 && inv.length === 0) continue;
    const paid = cents(inv.filter((i) => i.status === "paid").reduce((a, i) => a + (Number(i.amount) || 0), 0));
    rows.push({
      client: c, expected, paid,
      remaining: cents(Math.max(0, expected - paid)),
      overpaid: cents(Math.max(0, paid - expected)),
      hasOverride: !!t, note: t?.note || "", invoices: inv,
    });
  }
  return rows.sort((a, b) => b.remaining - a.remaining || a.client.name.localeCompare(b.client.name, "bg"));
}

export const TASK_COLUMNS: { key: TaskStatus; title: string; dot: string }[] = [
  { key: "todo", title: "To do", dot: "var(--bm-slate-400)" },
  { key: "inprogress", title: "In progress", dot: "var(--bm-info-500)" },
  { key: "review", title: "In review", dot: "var(--bm-warning-500)" },
  { key: "done", title: "Done", dot: "var(--bm-success-500)" },
];

// ---- Падежи и платежно поведение (0062) -----------------------------------
export const addDaysISO = (iso: string, n: number) => {
  const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const dayDiff = (a: string, b: string) => Math.round((parseDay(a) - parseDay(b)) / 86400000);
// Неплатена фактура: колко дни е след падежа (0 = още не е паднала).
export const daysOverdue = (i: Invoice, today = todayISO()) =>
  i.status === "paid" || i.status === "draft" || !i.due_date ? 0 : Math.max(0, dayDiff(today, i.due_date));
// Платена фактура: с колко дни след срока са дошли парите (0 = навреме).
// Плащане, записано направо като платено (без предварително издадена фактура),
// няма падеж — мерим го спрямо края на месеца, ЗА който е.
export function paidLateDays(i: Invoice): number | null {
  if (i.status !== "paid" || !i.paid_at) return null;
  if (i.issued === i.paid_at) { const p = invoicePeriod(i); return p ? Math.max(0, dayDiff(i.paid_at, monthEndISO(p))) : 0; }
  return i.due_date ? Math.max(0, dayDiff(i.paid_at, i.due_date)) : 0;
}
export type PayMonthState = "ontime" | "late" | "partial" | "unpaid" | "due" | "none";
export type PayGrade = "А" | "Б" | "В" | "Г" | "—";
export interface PaymentStats {
  client: Client;
  paidCount: number;         // платени фактури (основата на оценката)
  lateCount: number;
  onTimeRate: number | null; // 0..1; null = още няма плащания
  avgLate: number;           // средно дни закъснение при закъснелите
  maxLate: number;
  overdueAmount: number;     // просрочено в момента
  overdueDays: number;       // най-старото просрочие в дни
  openAmount: number;        // чака плащане, още не е паднало
  grade: PayGrade;
  months: { key: string; state: PayMonthState; paid: number; expected: number }[];
}
export function clientPaymentStats(client: Client, invoices: Invoice[], targets: MonthTarget[], monthsBack = 6): PaymentStats {
  const mine = invoices.filter((i) => i.client === client.id);
  const lates = mine.map(paidLateDays).filter((d): d is number => d !== null);
  const late = lates.filter((d) => d > 0);
  const open = mine.filter((i) => i.status === "pending" || i.status === "overdue");
  const od = open.filter((i) => daysOverdue(i) > 0);
  const onTimeRate = lates.length ? (lates.length - late.length) / lates.length : null;
  const overdueDays = od.length ? Math.max(...od.map((i) => daysOverdue(i))) : 0;
  const grade: PayGrade =
    !lates.length && !od.length ? "—"
    : overdueDays > 30 || (onTimeRate !== null && onTimeRate < 0.5) ? "Г"
    : overdueDays > 0 || (onTimeRate !== null && onTimeRate < 0.75) ? "В"
    : late.length ? "Б" : "А";
  const cur = monthKey();
  const months: PaymentStats["months"] = [];
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - (monthsBack - 1));
  for (let n = 0; n < monthsBack; n++, d.setMonth(d.getMonth() + 1)) {
    const key = monthKey(d);
    const row = monthCollections([client], invoices, targets, key)[0];
    const paid = row?.paid || 0, expected = row?.expected || 0;
    const wasLate = (row?.invoices || []).some((i) => (paidLateDays(i) || 0) > 0);
    const state: PayMonthState =
      expected <= 0 && paid <= 0 ? "none"
      : paid >= expected && paid > 0 ? (wasLate ? "late" : "ontime")
      : paid > 0 ? "partial"
      : key === cur ? "due" : "unpaid";
    months.push({ key, state, paid, expected });
  }
  return {
    client, paidCount: lates.length, lateCount: late.length, onTimeRate,
    avgLate: late.length ? Math.round(late.reduce((a, b) => a + b, 0) / late.length) : 0,
    maxLate: late.length ? Math.max(...late) : 0,
    overdueAmount: cents(od.reduce((a, i) => a + (i.amount || 0), 0)), overdueDays,
    openAmount: cents(open.filter((i) => daysOverdue(i) === 0).reduce((a, i) => a + (i.amount || 0), 0)),
    grade, months,
  };
}
// Какво да очакваш следващите месеци: договореното срещу това, което вероятно
// ще дойде навреме според досегашните навици. Клиент без история се брои за
// 75% надежден — оценка, не обещание.
export interface CashForecastMonth { key: string; contracted: number; likely: number; atRisk: number }
export function cashForecast(stats: PaymentStats[], monthsAhead = 3): CashForecastMonth[] {
  const live = stats.filter((s) => !s.client.archived_at && s.client.status !== "Churned" && s.client.engagement !== "project" && (s.client.mrr || 0) > 0);
  const out: CashForecastMonth[] = [];
  const d = new Date(); d.setDate(1);
  for (let n = 0; n < monthsAhead; n++) {
    d.setMonth(d.getMonth() + 1);
    const contracted = live.reduce((a, s) => a + s.client.mrr, 0);
    const likely = live.reduce((a, s) => a + s.client.mrr * (s.overdueDays > 30 ? Math.min(s.onTimeRate ?? 0.5, 0.5) : s.onTimeRate ?? 0.75), 0);
    out.push({ key: monthKey(d), contracted: cents(contracted), likely: cents(likely), atRisk: cents(contracted - likely) });
  }
  return out;
}
