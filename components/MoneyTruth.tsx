"use client";

// Три числа, никога смесени: договорено, фактурирано за месеца, реално
// постъпили пари. Плюс списък с разминавания, които правят анализите неверни.

import Link from "next/link";
import { useStore } from "./store";
import { Money } from "./MoneyLock";
import { fmtFull } from "@/lib/data";
import { liveClients, contractedMonthly, invoicedFor, sumAmt, overdueInvoices, ymNow, ymLong, daysSince, fmtDM } from "@/lib/crm";

export function MoneyTruth() {
  const { clients, invoices, contentItems } = useStore();
  const ym = ymNow();
  const m = ymLong(ym);
  const live = liveClients(clients);
  const contracted = contractedMonthly(clients);
  const invoiced = invoicedFor(invoices, ym);
  const overdue = overdueInvoices(invoices, clients);
  const pctBilled = contracted ? Math.round((sumAmt(invoiced) / contracted) * 100) : 0;

  // Един ред на клиент, с всички проблеми. Разминаване = фактурираното за
  // последния месец с фактура е под половината или над 1,5 пъти договора
  // (вноските на две половини не се броят за грешка).
  type Issue = { clientId: string; name: string; contract: number; last?: string; problems: { text: string; tone: "danger" | "warning" }[] };
  const issues: Issue[] = [];
  for (const c of live) {
    const cInv = invoices.filter((i) => i.client === c.id).sort((a, b) => (b.issued || "").localeCompare(a.issued || ""));
    const last = cInv[0];
    const lastTxt = last ? `${fmtFull(Number(last.amount))} · ${fmtDM(last.issued)}` : undefined;
    const problems: Issue["problems"] = [];
    const od = overdue.filter((i) => i.client === c.id);
    if (od.length) problems.push({ text: `неплатена ${Math.max(...od.map((i) => daysSince(i.issued) ?? 0))} дни`, tone: "danger" });
    const lastPeriod = last ? (last.period || (last.issued || "").slice(0, 7)) : null;
    const billed = lastPeriod ? sumAmt(invoices.filter((i) => i.client === c.id && (i.period || (i.issued || "").slice(0, 7)) === lastPeriod)) : 0;
    if (lastPeriod && c.mrr > 0 && (billed < c.mrr * 0.5 || billed > c.mrr * 1.5)) problems.push({ text: `за ${ymLong(lastPeriod)} са фактурирани ${fmtFull(billed)}`, tone: "warning" });
    if (!c.mrr && contentItems.some((it) => it.client === c.id && it.published)) problems.push({ text: "публикува, но договорът е 0 €", tone: "warning" });
    if (problems.length) issues.push({ clientId: c.id, name: c.name, contract: c.mrr, last: lastTxt, problems });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-5)" }}>
      <section className="bm-stats" aria-label={`Пари за ${m}`}>
        <div className="bm-card bm-stat">
          <div className="bm-stat__label">Договорено на месец</div>
          <div className="bm-stat__value"><Money>{fmtFull(contracted)}</Money></div>
          <div className="bm-stat__delta bm-text-subtle">{live.length} клиента по договор</div>
        </div>
        <div className="bm-card bm-stat">
          <div className="bm-stat__label">Фактурирано за {m}</div>
          <div className="bm-stat__value"><Money>{fmtFull(sumAmt(invoiced))}</Money></div>
          <div className={"bm-stat__delta " + (pctBilled < 80 ? "bm-stat__delta--down" : "bm-stat__delta--up")}>{pctBilled}% от договореното</div>
        </div>
        <div className="bm-card bm-stat">
          <div className="bm-stat__label">Просрочени</div>
          <div className="bm-stat__value" style={{ color: overdue.length ? "var(--bm-danger-600)" : undefined }}><Money>{fmtFull(sumAmt(overdue))}</Money></div>
          <div className={"bm-stat__delta " + (overdue.length ? "bm-stat__delta--down" : "bm-text-subtle")}>{overdue.length ? `${overdue.length} фактури след срока` : "няма просрочени"}</div>
        </div>
      </section>

      {issues.length > 0 && (
        <div className="bm-card">
          <div className="bm-card__header"><h3>Провери тези числа</h3><span className="bm-text-subtle" style={{ fontSize: "var(--bm-text-xs)" }}>докато не са оправени, анализите не са точни</span></div>
          <div className="crm-nudges">
            {issues.map((i) => (
              <div key={i.clientId} className="crm-nudge" style={{ alignItems: "flex-start" }}>
                <div className="crm-nudge__body">
                  <Link href={`/clients/${i.clientId}`} className="crm-nudge__title">{i.name}</Link>
                  <div className="crm-nudge__detail">Договор <Money>{fmtFull(i.contract)}</Money>/мес{i.last ? <> · последна фактура <Money>{i.last}</Money></> : " · няма фактури"}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                    {i.problems.map((p) => <span key={p.text} className={"bm-badge bm-badge--" + p.tone}>{p.text.includes("€") ? <Money>{p.text}</Money> : p.text}</span>)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
