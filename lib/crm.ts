// CRM v2 — логиката зад „Днес“, месечната отчетност и пакетите.
//
// Правило за броене: видео отива в месеца, в който е ПУБЛИКУВАНО
// (published_at). Публикуваното не изчезва от месеца си, колкото и да е
// старо. Целта за месеца идва от content_cycles.target_count (снимка на пакета
// за този месец), а ако такава няма — от текущия пакет на клиента.

import { monthProgress, expectedByToday, videoHealth, type Client, type ContentItem, type ContentCycle, type Invoice } from "./data";

export interface PipelineRow {
  id: string;
  client_id: string | null;
  name: string;
  status: string;
  updated_at?: string;
}

export interface ClientPackage {
  videos_per_month: number | null;
  price: number;
  platforms: string[];
  services: string[];
  contract_months?: number | null;
}
export interface QuickClientForm extends ClientPackage {
  name: string;
  industry: string;
  website?: string;
  billing_email?: string;
  owner?: string;
  editor?: string;
  contract_start?: string;
  payment_terms_days?: number | null;
  note?: string;
  onboarding?: Record<string, boolean>;
}

export const PLATFORMS: { id: string; label: string }[] = [
  { id: "facebook", label: "Facebook" },
  { id: "instagram", label: "Instagram" },
  { id: "tiktok", label: "TikTok" },
  { id: "youtube", label: "YouTube" },
];
export const SERVICES: string[] = ["Стратегия", "Сценарии", "Снимане", "Монтаж", "Публикуване", "Реклами", "Месечен отчет"];
export const ONBOARDING_CHECKS: { id: string; label: string }[] = [
  { id: "access_meta", label: "Facebook страницата е добавена в Business Suite" },
  { id: "access_ig", label: "Instagram е свързан със страницата" },
  { id: "access_tiktok", label: "TikTok е свързан в Zernio" },
  { id: "brand_assets", label: "Лого и бранд материали са качени" },
];

const BG_SHORT = ["яну", "фев", "мар", "апр", "май", "юни", "юли", "авг", "сеп", "окт", "ное", "дек"];
const BG_FULL = ["януари", "февруари", "март", "април", "май", "юни", "юли", "август", "септември", "октомври", "ноември", "декември"];

const pad = (n: number) => String(n).padStart(2, "0");
export const ymOf = (iso?: string | null) => (iso && iso.length >= 7 ? iso.slice(0, 7) : null);
export const ymNow = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
export const ymShift = (ym: string, delta: number) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};
export const ymShort = (ym: string) => BG_SHORT[Number(ym.slice(5, 7)) - 1] || ym;
export const ymLong = (ym: string) => BG_FULL[Number(ym.slice(5, 7)) - 1] || ym;
export const daysSince = (iso?: string | null) => {
  if (!iso) return null;
  const t = new Date(iso.length === 10 ? iso + "T00:00:00" : iso).getTime();
  return Number.isNaN(t) ? null : Math.floor((Date.now() - t) / 86400000);
};
export const fmtDM = (iso?: string | null) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : "");

/** Клиенти, за които работим в момента (не архивирани, не напуснали). */
/** Проектните клиенти (engagement = "project") са извън месечния ритъм — не влизат тук. */
export const liveClients = (list: Client[]) => list.filter((c) => !c.archived_at && c.status !== "Churned" && c.engagement !== "project");
export const clientStart = (c: Client) => c.contract_start || (c.created_at ? c.created_at.slice(0, 10) : null);

/** Месецът, в който се брои видеото: по публикуване. */
export const countedMonth = (it: ContentItem) => (it.published ? ymOf(it.published_at) || ymOf(it.date) : null);

export const publishedIn = (items: ContentItem[], clientId: string, ym: string) =>
  items.filter((it) => it.client === clientId && countedMonth(it) === ym);

export const inProgress = (items: ContentItem[], clientId: string) =>
  items.filter((it) => it.client === clientId && !it.published);

/** Цел за месеца: снимката на пакета в content_cycles, иначе текущият пакет. */
export const targetFor = (c: Client, ym: string, cycles: ContentCycle[]) => {
  const cy = cycles.find((x) => x.client === c.id && x.month === ym && x.target_count > 0);
  if (cy) return cy.target_count;
  return ym >= ymNow() && c.videos_per_month ? c.videos_per_month : null;
};

export const lastPublished = (items: ContentItem[], clientId: string) =>
  items
    .filter((it) => it.client === clientId && it.published)
    .map((it) => (it.published_at || it.date || "").slice(0, 10))
    .filter(Boolean)
    .sort()
    .pop() || null;

/** Месеците на клиента: от началото на договора до сега (най-много `max`). */
export const clientMonths = (c: Client, max = 6) => {
  const now = ymNow();
  const start = ymOf(clientStart(c)) || now;
  const out: string[] = [];
  for (let ym = now; out.length < max && ym >= start; ym = ymShift(ym, -1)) out.push(ym);
  return out.reverse();
};

// ---- Пари ----
export const contractedMonthly = (clients: Client[]) => liveClients(clients).reduce((a, c) => a + (c.mrr || 0), 0);
export const invoicedFor = (invoices: Invoice[], ym: string) =>
  invoices.filter((i) => (i.period || ymOf(i.issued)) === ym && i.status !== "draft");
export const cashIn = (invoices: Invoice[], ym: string) =>
  invoices.filter((i) => i.status === "paid" && ymOf(i.paid_at) === ym);
export const sumAmt = (list: Invoice[]) => list.reduce((a, b) => a + Number(b.amount || 0), 0);

/** Неплатени фактури, по-стари от срока за плащане на клиента (по подразбиране 14 дни). */
export const overdueInvoices = (invoices: Invoice[], clients: Client[]) => {
  const byId = new Map(clients.map((c) => [c.id, c]));
  const today = new Date().toISOString().slice(0, 10);
  return invoices.filter((i) => {
    if (i.status === "overdue") return true;
    if (i.status !== "pending" || !i.issued || i.issued > today) return false;
    // Падежът вече е дата в базата (0062); старото правило остава само за редове без нея.
    if (i.due_date) return i.due_date < today;
    const terms = byId.get(i.client)?.payment_terms_days ?? 14;
    return (daysSince(i.issued) ?? 0) > terms;
  });
};

// ---- „Чака теб“ ----
export type NudgeTone = "danger" | "warn" | "info";
export interface Nudge {
  id: string;
  tone: NudgeTone;
  badge: string;          // кратко в квадратчето: „51д“, „€“, „8×“
  title: string;
  detail: string;
  score: number;          // по-голямо = по-нагоре
  clientId?: string;
  action?: { label: string; href?: string; kind?: "start_strategy" | "set_active" | "open_package" | "mark_paid"; primary?: boolean; payload?: string };
}

const PIPE_BG: Record<string, string> = {
  strategy_requested: "агентът пише стратегията", strategy_revising: "агентът поправя стратегията", strategy_review: "стратегията чака твоето одобрение",
  offer_requested: "агентът прави офертата", offer_revising: "агентът поправя офертата", offer_review: "офертата чака твоето одобрение",
  prep_requested: "агентът подготвя срещата", prep_revising: "агентът поправя подготовката", ready: "документите са готови, отбележи резултата от срещата",
  won: "агентът пише онбординг имейла", onboarding_review: "онбординг имейлът чака одобрение", onboarding_revising: "агентът поправя имейла",
  onboarding_send: "имейлът се изпраща", content_requested: "агентът вкарва темите и сценариите",
};
export const pipelineLabel = (s: string) => PIPE_BG[s] || s;

const eur = (n: number) => new Intl.NumberFormat("bg-BG", { maximumFractionDigits: 2 }).format(n) + " €";

export function buildNudges(args: {
  clients: Client[];
  items: ContentItem[];
  invoices: Invoice[];
  cycles: ContentCycle[];
  pipeline: PipelineRow[];
}): Nudge[] {
  const { clients, items, invoices, cycles, pipeline } = args;
  const live = liveClients(clients);
  const ym = ymNow();
  const out: Nudge[] = [];
  const today = new Date();
  const dayOfMonth = today.getDate();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();

  // 1. Просрочени плащания — едно общо напомняне.
  const od = overdueInvoices(invoices, clients);
  if (od.length) {
    const total = sumAmt(od);
    const byClient = od
      .map((i) => `${clients.find((c) => c.id === i.client)?.name || i.client} ${eur(Number(i.amount))}`)
      .join(" · ");
    const oldest = Math.max(...od.map((i) => daysSince(i.issued) ?? 0));
    out.push({
      id: "overdue", tone: "danger", badge: "€", score: 1000 + total / 10,
      title: `${eur(total)} неплатени (най-старата от ${oldest} дни)`,
      detail: byClient,
      action: { label: "Към фактурите", href: "/invoices", primary: true },
    });
  }

  const staleStatus: Client[] = [];
  for (const c of live) {
    const start = clientStart(c);
    const age = daysSince(start) ?? 0;
    const all = items.filter((it) => it.client === c.id);
    const published = all.filter((it) => it.published);
    const open = pipeline.find((p) => p.client_id === c.id && !["cancelled", "lost", "failed", "done"].includes(p.status));

    // 2. Подписан клиент, по който работата не е започнала.
    if (all.length === 0 && age >= 3) {
      const strategyDone = c.analysis_status === "done" || (open && !["strategy_requested", "strategy_revising"].includes(open.status));
      out.push({
        id: "nostart-" + c.id, clientId: c.id, tone: age > 21 ? "danger" : "warn", badge: age + "д",
        score: 600 + age * 5 + (c.mrr || 0) / 50,
        title: `${c.name} — работата не е започнала`,
        detail: `Договор от ${fmtDM(start)} · ${c.mrr ? eur(c.mrr) + "/мес · " : ""}0 видеа · следва: ${open ? pipelineLabel(open.status) : strategyDone ? "сценарии" : "стратегия"}`,
        action: open
          ? { label: "Отвори клиента", href: `/clients/${c.id}` }
          : strategyDone
            ? { label: "Пиши сценарии", href: `/clients/${c.id}`, primary: true }
            : { label: "Пусни стратегия", kind: "start_strategy", payload: c.id, primary: true },
      });
      continue;
    }

    // 3. Статусът изостава: публикува, а пише „Включване“ (събират се в едно напомняне).
    if (c.status === "Onboarding" && published.length > 0) staleStatus.push(c);

    // 4. Изостава спрямо пакета за месеца (броим по месеца на пакета, както Продукция).
    const [mp] = monthProgress([c], cycles, items, ym);
    if (mp.target) {
      const expected = expectedByToday(mp.target, ym);
      if (mp.done + 1 < expected) {
        out.push({
          id: "behind-" + c.id, clientId: c.id, tone: "warn", badge: `${mp.done}/${mp.target}`,
          score: 400 + (expected - mp.done) * 20,
          title: `${c.name} изостава за ${ymLong(ym)}`,
          detail: `${mp.done} от ${mp.target} готови · до днес трябваше да са ~${expected}`,
          action: { label: "Виж месеца", href: `/clients/${c.id}?tab=videos` },
        });
      }
    }

    // 5. Дълга пауза в публикуването.
    const last = lastPublished(items, c.id);
    const since = daysSince(last);
    if (last && since !== null && since >= 14) {
      out.push({
        id: "pause-" + c.id, clientId: c.id, tone: since > 30 ? "danger" : "warn", badge: since + "д",
        score: 300 + since * 4,
        title: `${c.name} — ${since} дни без ново видео`,
        detail: `Последно публикувано ${fmtDM(last)} · в работа: ${all.filter((it) => !it.published).length}`,
        action: { label: "Отвори клиента", href: `/clients/${c.id}` },
      });
    }
  }

  // 5б. Видеа, които искат внимание: закъсняват, заседнали са или чакат дълго (0061).
  const liveIds = new Set(live.map((c) => c.id));
  const hot = items
    .filter((it) => it.type !== "post" && !it.published && liveIds.has(it.client))
    .map((it) => ({ it, h: videoHealth(it)! }))
    .filter(({ h }) => h.level === "late" || h.level === "stuck" || (h.level === "waiting" && h.badge === "bm-badge--danger"))
    .sort((a, b) => b.h.score - a.h.score);
  if (hot.length) {
    const late = hot.filter((x) => x.h.level === "late").length;
    const nameOf = (id: string) => clients.find((c) => c.id === id)?.name || id;
    out.push({
      id: "videos-hot", tone: late ? "danger" : "warn", badge: hot.length + "×", score: 450 + late * 30 + hot.length * 5,
      title: `${hot.length} ${hot.length === 1 ? "видео иска" : "видеа искат"} внимание${late ? ` · ${late} след датата` : ""}`,
      detail: hot.slice(0, 3).map(({ it, h }) => `${nameOf(it.client)}: ${(it.title || "(без заглавие)").slice(0, 34)} — ${h.label}`).join(" · ") + (hot.length > 3 ? ` · и още ${hot.length - 3}` : ""),
      action: { label: "Виж ги на дъската", href: "/production?attention=1", primary: late > 0 },
    });
  }

  if (staleStatus.length) {
    out.push({
      id: "status", tone: "info", badge: "✓", score: 150,
      title: `${staleStatus.length === 1 ? staleStatus[0].name + " публикува, а е" : staleStatus.length + " клиента публикуват, а са"} още „Включване“`,
      detail: `${staleStatus.map((c) => c.name).join(", ")} · един клик ги прави „Активен“, за да са верни броячите`,
      action: { label: staleStatus.length === 1 ? "Направи активен" : "Направи всички активни", kind: "set_active", payload: staleStatus.map((c) => c.id).join(",") },
    });
  }

  // 6. Клиенти без пакет — едно общо напомняне.
  const noPkg = live.filter((c) => !c.videos_per_month);
  if (noPkg.length) {
    out.push({
      id: "nopkg", tone: "info", badge: noPkg.length + "×", score: 200,
      title: `${noPkg.length} ${noPkg.length === 1 ? "клиент няма" : "клиента нямат"} зададен пакет`,
      detail: `Без пакет прогресът за месеца не се смята: ${noPkg.slice(0, 5).map((c) => c.name).join(", ")}${noPkg.length > 5 ? "…" : ""}`,
      action: { label: "Задай пакетите", kind: "open_package", payload: noPkg[0].id },
    });
  }

  // 7. Нефактуриран месец (от 20-о число нататък).
  if (dayOfMonth >= 20) {
    const billed = new Set(invoicedFor(invoices, ym).map((i) => i.client));
    const missing = live.filter((c) => (c.mrr || 0) > 0 && !billed.has(c.id));
    if (missing.length) {
      const sum = missing.reduce((a, c) => a + (c.mrr || 0), 0);
      out.push({
        id: "unbilled", tone: "info", badge: missing.length + "×", score: 250 + dayOfMonth,
        title: `${ymLong(ym)[0].toUpperCase() + ymLong(ym).slice(1)} не е фактуриран за ${missing.length} ${missing.length === 1 ? "клиент" : "клиента"}`,
        detail: `${eur(sum)} по договор без фактура · ${daysInMonth - dayOfMonth} дни до края на месеца`,
        action: { label: "Към фактурите", href: "/invoices" },
      });
    }
  }

  return out.sort((a, b) => b.score - a.score);
}
