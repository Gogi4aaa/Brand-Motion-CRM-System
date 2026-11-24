// Напомняния за плащане (0064): кое напомняне е ред на коя фактура и какъв е
// текстът му. Чиста логика — без база и без изпращане. Екранът (Фактури) го
// показва с бутони „Копирай“ / „Отвори имейл“; автоматичното изпращане ще
// ползва същите текстове, когато има свързана услуга за имейли.

import { fmtFull, invoicePeriod, monthLabel, parseDay, todayISO, type Client, type Invoice } from "./data";

export type ReminderStage = "before" | "due" | "after" | "second" | "call";
export interface ReminderLogRow { invoice_id: string; stage: ReminderStage; channel: string; sent_by: string; sent_at: string }

export const REMINDER_STAGES: Record<ReminderStage, { label: string; hint: string; badge: string }> = {
  before: { label: "Предстои падеж", hint: "до 3 дни преди срока", badge: "bm-badge--info" },
  due:    { label: "Падежът е днес", hint: "в деня на срока", badge: "bm-badge--warning" },
  after:  { label: "Първо напомняне", hint: "1–6 дни след срока", badge: "bm-badge--warning" },
  second: { label: "Второ напомняне", hint: "7–13 дни след срока", badge: "bm-badge--danger" },
  call:   { label: "Обади се лично", hint: "над 14 дни след срока", badge: "bm-badge--danger" },
};

// Дни спрямо падежа: отрицателно = още не е паднала.
const daysPast = (due: string, today: string) => Math.round((parseDay(today) - parseDay(due)) / 86400000);
export function stageFor(daysAfterDue: number): ReminderStage | null {
  if (daysAfterDue < -3) return null;
  if (daysAfterDue < 0) return "before";
  if (daysAfterDue === 0) return "due";
  if (daysAfterDue < 7) return "after";
  if (daysAfterDue < 14) return "second";
  return "call";
}

const fmtDate = (iso: string) => { const [y, m, d] = iso.split("-"); return `${d}.${m}.${y}`; };

export interface Reminder {
  invoice: Invoice;
  client: Client | undefined;
  stage: ReminderStage;
  days: number;            // дни след падежа (отрицателно = преди)
  done: ReminderLogRow | null; // вече напомнено на този етап
  lastSent: ReminderLogRow | null;
  subject: string;
  body: string;
}

export function reminderText(iv: Invoice, client: Client | undefined, stage: ReminderStage, days: number): { subject: string; body: string } {
  const amount = fmtFull(iv.amount);
  const period = invoicePeriod(iv);
  const what = `фактура ${iv.id}${period ? ` за ${monthLabel(period)}` : ""} на стойност ${amount}`;
  const due = iv.due_date ? fmtDate(iv.due_date) : "";
  const hello = "Здравейте,";
  const bye = "Поздрави,\nЕкипът на Brand Motion";
  if (stage === "before") return {
    subject: `Предстоящо плащане — фактура ${iv.id}`,
    body: `${hello}\n\nНапомняме, че ${what} е със срок за плащане ${due}.\n\nАко вече сте я платили, моля не обръщайте внимание на това съобщение.\n\n${bye}`,
  };
  if (stage === "due") return {
    subject: `Днес е срокът за плащане — фактура ${iv.id}`,
    body: `${hello}\n\nДнес (${due}) е срокът за плащане на ${what}.\n\nАко преводът вече е направен — благодарим! Ако има нужда от нещо от наша страна, пишете ни.\n\n${bye}`,
  };
  if (stage === "after") return {
    subject: `Напомняне за плащане — фактура ${iv.id}`,
    body: `${hello}\n\nСрокът за плащане на ${what} беше ${due} и при нас още не е постъпило плащане.\n\nЩе се радваме да го уредите в следващите дни. Ако вече сте превели сумата, изпратете ни потвърждение, за да я отбележим.\n\n${bye}`,
  };
  if (stage === "second") return {
    subject: `Второ напомняне — фактура ${iv.id} е просрочена с ${days} дни`,
    body: `${hello}\n\n${what[0].toUpperCase() + what.slice(1)} е просрочена с ${days} дни (срок ${due}).\n\nМолим да уредите плащането до края на седмицата или да ни пишете, ако има причина за забавянето — ще намерим решение заедно.\n\n${bye}`,
  };
  return {
    subject: `Просрочена фактура ${iv.id} — ${days} дни`,
    body: `${hello}\n\n${what[0].toUpperCase() + what.slice(1)} е просрочена с ${days} дни (срок ${due}). Ще ви потърсим по телефона, за да уточним плащането.\n\n${bye}`,
  };
}

// Какво е ред да се напомни днес. Най-тежкото е най-горе; вече напомненото
// на текущия етап остава в списъка, но отбелязано.
export function paymentReminders(invoices: Invoice[], clients: Client[], log: ReminderLogRow[], today = todayISO()): Reminder[] {
  const byId = new Map(clients.map((c) => [c.id, c]));
  const out: Reminder[] = [];
  for (const iv of invoices) {
    if ((iv.status !== "pending" && iv.status !== "overdue") || !iv.due_date) continue;
    const days = daysPast(iv.due_date, today);
    const stage = stageFor(days);
    if (!stage) continue;
    const mine = log.filter((l) => l.invoice_id === iv.id).sort((a, b) => b.sent_at.localeCompare(a.sent_at));
    const client = byId.get(iv.client);
    out.push({ invoice: iv, client, stage, days, done: mine.find((l) => l.stage === stage) || null, lastSent: mine[0] || null, ...reminderText(iv, client, stage, days) });
  }
  return out.sort((a, b) => Number(!!a.done) - Number(!!b.done) || b.days - a.days);
}
