"use client";

// Как плащат клиентите (0062): кой плаща навреме, кой закъснява и с колко,
// какво е просрочено сега и какво да очакваш следващите месеци.
// Допълва „Договорено / фактурирано / постъпило“ (MoneyTruth) — не го повтаря.

import Link from "next/link";
import { useStore } from "./store";
import { Money } from "./MoneyLock";
import {
  cashForecast, clientPaymentStats, daysOverdue, fmtDay, fmtFull, monthLabel, paidLateDays,
  type Client, type Invoice, type PayGrade, type PayMonthState, type PaymentStats,
} from "@/lib/data";

const GRADE: Record<PayGrade, { cls: string; hint: string }> = {
  "А": { cls: "pb-grade--a", hint: "плаща навреме" },
  "Б": { cls: "pb-grade--b", hint: "случва се да закъснее" },
  "В": { cls: "pb-grade--c", hint: "често закъснява или има просрочие" },
  "Г": { cls: "pb-grade--d", hint: "сериозно просрочие" },
  "—": { cls: "pb-grade--none", hint: "още няма плащания" },
};
const STATE_LABEL: Record<PayMonthState, string> = {
  ontime: "платено навреме", late: "платено със закъснение", partial: "платено частично",
  unpaid: "неплатено", due: "текущ месец — още не е платено", none: "няма такса",
};
const rank: Record<PayGrade, number> = { "Г": 0, "В": 1, "Б": 2, "А": 3, "—": 4 };

export function PayStrip({ s }: { s: PaymentStats }) {
  return (
    <span className="pb-strip" role="img" aria-label={s.months.map((m) => `${monthLabel(m.key)}: ${STATE_LABEL[m.state]}`).join("; ")}>
      {s.months.map((m) => <i key={m.key} className={`pb-cell pb-cell--${m.state}`} title={`${monthLabel(m.key)} — ${STATE_LABEL[m.state]}`} />)}
    </span>
  );
}

// Етикет за една фактура: „закъснява 12д“ / „платена с 5д закъснение“ / падеж.
export function DueLabel({ iv }: { iv: Invoice }) {
  if (iv.status === "draft") return <span className="bm-text-subtle">—</span>;
  if (iv.status === "paid") {
    const late = paidLateDays(iv) || 0;
    return late > 0
      ? <span className="bm-badge bm-badge--warning" title={`Платена на ${fmtDay(iv.paid_at)}`}>платена с {late}д закъснение</span>
      : <span className="bm-text-subtle">платена навреме</span>;
  }
  const od = daysOverdue(iv);
  return od > 0
    ? <span className="bm-badge bm-badge--danger" title={`Падеж ${fmtDay(iv.due_date)}`}>закъснява {od}д</span>
    : <span className="bm-text-subtle">{iv.due_date ? `до ${fmtDay(iv.due_date)}` : "—"}</span>;
}

// Малка карта за страницата на клиента.
export function ClientPaymentCard({ client }: { client: Client }) {
  const { invoices, monthTargets } = useStore();
  const s = clientPaymentStats(client, invoices, monthTargets);
  const g = GRADE[s.grade];
  return (
    <div className="bm-card">
      <div className="bm-card__header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--bm-space-3)" }}>
        <h3 style={{ margin: 0 }}>Как плаща</h3>
        <span className={"pb-grade " + g.cls} title={g.hint}>{s.grade}</span>
      </div>
      <div className="bm-card__body" style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-3)", fontSize: "var(--bm-text-sm)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--bm-space-3)" }}>
          <span className="bm-text-muted">Последните 6 месеца</span><PayStrip s={s} />
        </div>
        {([
          ["Навреме", s.onTimeRate === null ? "няма данни" : `${Math.round(s.onTimeRate * 100)}% (${s.paidCount - s.lateCount} от ${s.paidCount})`],
          ["Средно закъснение", s.lateCount ? `${s.avgLate} дни · най-много ${s.maxLate}` : "—"],
          ["Просрочено сега", s.overdueAmount ? <b key="o" style={{ color: "var(--bm-danger-600)" }}><Money>{fmtFull(s.overdueAmount)}</Money> · {s.overdueDays}д</b> : "няма"],
          ["Срок по договор", `${client.payment_terms_days ?? 7} дни след фактурата`],
        ] as [string, React.ReactNode][]).map(([k, v]) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: "var(--bm-space-3)" }}><span className="bm-text-muted">{k}</span><span style={{ textAlign: "right", fontWeight: 600 }}>{v}</span></div>
        ))}
      </div>
    </div>
  );
}

// Блокът за Анализи.
export function PaymentBehavior() {
  const { clients, invoices, monthTargets } = useStore();
  const stats = clients
    .filter((c) => !c.archived_at && (c.status !== "Churned" || invoices.some((i) => i.client === c.id && i.status !== "paid" && i.status !== "draft")))
    .map((c) => clientPaymentStats(c, invoices, monthTargets))
    // проектен клиент влиза само ако има реални плащания или дължи нещо
    .filter((s) => s.paidCount > 0 || s.overdueAmount > 0 || s.openAmount > 0 || ((s.client.mrr || 0) > 0 && s.client.engagement !== "project"))
    .sort((a, b) => rank[a.grade] - rank[b.grade] || b.overdueAmount - a.overdueAmount || a.client.name.localeCompare(b.client.name));
  if (!stats.length) return null;
  const overdue = stats.reduce((a, s) => a + s.overdueAmount, 0);
  const lateClients = stats.filter((s) => s.overdueAmount > 0).length;
  const paid = stats.reduce((a, s) => a + s.paidCount, 0);
  const late = stats.reduce((a, s) => a + s.lateCount, 0);
  const forecast = cashForecast(stats);
  const months = stats[0].months;

  return (
    <div className="bm-card" style={{ overflow: "hidden" }}>
      <div className="bm-card__header" style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "var(--bm-space-3)", flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>Как плащат клиентите</h3>
        <span className="bm-text-subtle" style={{ fontSize: "var(--bm-text-xs)" }}>на база {paid} {paid === 1 ? "плащане" : "плащания"} · най-проблемните са най-горе</span>
      </div>

      <div className="pb-kpis">
        <div className="pb-kpi"><span>Просрочено сега</span><b style={overdue ? { color: "var(--bm-danger-600)" } : undefined}><Money>{fmtFull(overdue)}</Money></b><small>{lateClients ? `${lateClients} ${lateClients === 1 ? "клиент" : "клиента"}` : "никой не закъснява"}</small></div>
        <div className="pb-kpi"><span>Платени навреме</span><b>{paid ? Math.round(((paid - late) / paid) * 100) + "%" : "—"}</b><small>{paid ? `${paid - late} от ${paid} плащания` : "няма данни"}</small></div>
        {forecast.map((f) => (
          <div key={f.key} className="pb-kpi">
            <span>Очаквано · {monthLabel(f.key).split(" ")[0]}</span>
            <b><Money>{fmtFull(f.likely)}</Money></b>
            <small>от <Money>{fmtFull(f.contracted)}</Money> договорени{f.atRisk > 0 ? <> · <Money>{fmtFull(f.atRisk)}</Money> под риск</> : null}</small>
          </div>
        ))}
      </div>

      <div className="bm-table-wrap" style={{ border: "none", borderRadius: 0 }}>
        <table className="bm-table pb-table">
          <thead><tr>
            <th>Клиент</th><th>Оценка</th>
            <th title={months.map((m) => monthLabel(m.key).split(" ")[0]).join(" · ")}>{monthLabel(months[0].key).split(" ")[0].slice(0, 3)} → {monthLabel(months[months.length - 1].key).split(" ")[0].slice(0, 3)}</th>
            <th>Навреме</th><th>Ср. закъснение</th><th className="bm-table__num">Просрочено</th><th className="bm-table__num">Чака</th>
          </tr></thead>
          <tbody>
            {stats.map((s) => (
              <tr key={s.client.id}>
                <td><Link href={`/clients/${s.client.id}`} style={{ color: "inherit", fontWeight: 600, textDecoration: "none" }}>{s.client.name}</Link></td>
                <td><span className={"pb-grade " + GRADE[s.grade].cls} title={GRADE[s.grade].hint}>{s.grade}</span></td>
                <td><PayStrip s={s} /></td>
                <td>{s.onTimeRate === null ? <span className="bm-text-subtle">—</span> : `${Math.round(s.onTimeRate * 100)}%`}</td>
                <td>{s.lateCount ? `${s.avgLate}д` : <span className="bm-text-subtle">—</span>}</td>
                <td className="bm-table__num">{s.overdueAmount ? <b style={{ color: "var(--bm-danger-600)" }}><Money>{fmtFull(s.overdueAmount)}</Money> <small style={{ fontWeight: 400 }}>· {s.overdueDays}д</small></b> : <span className="bm-text-subtle">—</span>}</td>
                <td className="bm-table__num">{s.openAmount ? <Money>{fmtFull(s.openAmount)}</Money> : <span className="bm-text-subtle">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pb-foot">
        <div className="qt-legend" aria-hidden="true">
          <span><i className="pb-cell--ontime" /> навреме</span>
          <span><i className="pb-cell--late" /> със закъснение</span>
          <span><i className="pb-cell--partial" /> частично</span>
          <span><i className="pb-cell--unpaid" /> неплатено</span>
          <span><i className="pb-cell--none" /> няма такса</span>
        </div>
        <p>Закъснението се мери спрямо падежа (издаване + срока на клиента). Плащане, записано направо като платено, се мери спрямо края на месеца, за който е. „Очаквано“ е оценка по досегашните навици — клиент без история се брои за 75% надежден.</p>
      </div>
    </div>
  );
}
