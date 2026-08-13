"use client";

import Link from "next/link";
import { useStore } from "@/components/store";
import {
  fmtFull, PIPELINE_STAGES, collectedRevenue, workerPaidCost, clientLtv,
  clientTenureDays, fmtTenure, revenueByMonth, clientStatusMeta, clientsById,
} from "@/lib/data";
import { Money } from "@/components/MoneyLock";

function Kpi({ label, value, deltaCls, delta }: { label: string; value: React.ReactNode; deltaCls: string; delta: string }) {
  return (
    <div className="bm-card bm-stat">
      <div className="bm-stat__label">{label}</div>
      <div className="bm-stat__value">{value}</div>
      <div className={"bm-stat__delta " + deltaCls}>{delta}</div>
    </div>
  );
}

export default function AnalyticsPage() {
  const { clients, invoices, leads, tasks } = useStore();

  // ---- Приход и чиста печалба (реално събрано − изплатено на работници) ----
  const revMonth = collectedRevenue(invoices, true);
  const revAll = collectedRevenue(invoices);
  const paidMonth = workerPaidCost(tasks, true);
  const paidAll = workerPaidCost(tasks);
  const netMonth = revMonth - paidMonth;
  const netAll = revAll - paidAll;

  // ---- Сделки / успеваемост ----
  const won = leads.filter((l) => l.stage === "won").length;
  const lost = leads.filter((l) => l.stage === "lost").length;
  const winRate = won + lost ? Math.round((won / (won + lost)) * 100) : 0;
  const stageBars = PIPELINE_STAGES.map((s) => ({ title: s.title, dot: s.dot, val: leads.filter((l) => l.stage === s.key).reduce((a, b) => a + b.value, 0) }));
  const stageMax = Math.max(1, ...stageBars.map((s) => s.val));

  // ---- Приход по месеци ----
  const months = revenueByMonth(invoices, 12);
  const monthsMax = Math.max(1, ...months.map((m) => m.val));

  // ---- Задържане на клиенти ----
  const byId = clientsById(clients);
  const churned = clients.filter((c) => c.status === "Churned");
  const churnRate = clients.length ? Math.round((churned.length / clients.length) * 100) : 0;
  const avgTenure = clients.length ? Math.round(clients.reduce((a, c) => a + clientTenureDays(c), 0) / clients.length) : 0;
  const tenureRows = [...clients]
    .map((c) => ({ id: c.id, name: c.name, status: c.status, days: clientTenureDays(c), ltv: clientLtv(invoices, c.id) }))
    .sort((a, b) => b.days - a.days);
  const ltvRows = [...tenureRows].sort((a, b) => b.ltv - a.ltv).slice(0, 6);
  const ltvMax = Math.max(1, ...ltvRows.map((r) => r.ltv));

  const money = (n: number) => fmtFull(n);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-6)" }}>
      <div>
        <h1>Анализи</h1>
        <p className="bm-text-muted" style={{ margin: "4px 0 0" }}>Приходи, чиста печалба, задържане на клиенти и успеваемост.</p>
      </div>

      <section className="bm-stats">
        <Kpi label="Приход този месец" value={<Money>{money(revMonth)}</Money>} deltaCls="bm-stat__delta--up" delta="реално събрано" />
        <Kpi label="Приход общо" value={<Money>{money(revAll)}</Money>} deltaCls="bm-text-subtle" delta="от всички платени фактури" />
        <Kpi label="Чиста печалба (общо)" value={<Money>{money(netAll)}</Money>} deltaCls={netAll >= 0 ? "bm-stat__delta--up" : "bm-stat__delta--down"} delta={`след €${Math.round(paidAll).toLocaleString("bg-BG")} за екипа`} />
        <Kpi label="Успеваемост" value={winRate + "%"} deltaCls="bm-text-subtle" delta={`${won + lost} затворени сделки`} />
      </section>

      {/* Печалба: приход vs разход, месец и цял период */}
      <div className="bm-card">
        <div className="bm-card__header"><h3>Печалба</h3><Link href="/payouts" className="bm-btn bm-btn--ghost bm-btn--sm">Възнаграждения</Link></div>
        <div className="bm-card__body" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--bm-space-4)" }}>
          {([{ t: "Този месец", rev: revMonth, cost: paidMonth, net: netMonth }, { t: "Цял период", rev: revAll, cost: paidAll, net: netAll }]).map((b) => (
            <div key={b.t} style={{ border: "1px solid var(--bm-border)", borderRadius: "var(--bm-radius-md)", padding: "var(--bm-space-4)", display: "flex", flexDirection: "column", gap: 6 }}>
              <div className="bm-label">{b.t}</div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--bm-text-sm)" }}><span className="bm-text-subtle">Събрано</span><span style={{ fontFamily: "var(--bm-font-mono)" }}><Money>{money(b.rev)}</Money></span></div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--bm-text-sm)" }}><span className="bm-text-subtle">За екипа</span><span style={{ fontFamily: "var(--bm-font-mono)", color: "var(--bm-danger-600)" }}>−<Money>{money(b.cost)}</Money></span></div>
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, borderTop: "1px solid var(--bm-border)", paddingTop: 6 }}><span>Чиста печалба</span><span style={{ fontFamily: "var(--bm-font-mono)", color: b.net >= 0 ? "var(--bm-success-600)" : "var(--bm-danger-600)" }}><Money>{money(b.net)}</Money></span></div>
            </div>
          ))}
        </div>
      </div>

      {/* Приход по месеци (последните 12) */}
      <div className="bm-card">
        <div className="bm-card__header"><h3>Приход по месеци</h3><span className="bm-text-subtle" style={{ fontSize: "var(--bm-text-xs)" }}>реално събрано</span></div>
        <div className="bm-card__body">
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 150 }}>
            {months.map((m) => (
              <div key={m.key} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, height: "100%", justifyContent: "flex-end" }} title={`${m.label}: ${money(m.val)}`}>
                <div style={{ width: "100%", maxWidth: 34, height: `${Math.round((m.val / monthsMax) * 100)}%`, minHeight: m.val > 0 ? 4 : 0, background: "var(--bm-brand-500)", borderRadius: "4px 4px 0 0" }} />
                <span style={{ fontSize: 9, color: "var(--bm-text-subtle)", whiteSpace: "nowrap" }}>{m.label.split(" ")[0].slice(0, 3)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Задържане на клиенти */}
      <div className="bm-card">
        <div className="bm-card__header">
          <h3>Задържане на клиенти</h3>
          <span className="bm-text-subtle" style={{ fontSize: "var(--bm-text-xs)" }}>средно {fmtTenure(avgTenure)} · churn {churnRate}%</span>
        </div>
        <div className="bm-table-wrap">
          <table className="bm-table">
            <thead><tr><th>Клиент</th><th>Статус</th><th>Задържане</th><th className="bm-table__num">Приход (LTV)</th></tr></thead>
            <tbody>
              {tenureRows.map((r) => {
                const meta = clientStatusMeta(r.status);
                return (
                  <tr key={r.id}>
                    <td>{byId[r.id]?.name || r.name}</td>
                    <td><span className={"bm-badge " + meta.cls}>{meta.label}</span></td>
                    <td>{fmtTenure(r.days)}</td>
                    <td className="bm-table__num" style={{ fontFamily: "var(--bm-font-mono)" }}><Money>{money(r.ltv)}</Money></td>
                  </tr>
                );
              })}
              {tenureRows.length === 0 && <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--bm-text-subtle)", padding: "var(--bm-space-6)" }}>Няма клиенти.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Сделки по етап + приход по клиент (LTV) */}
      <div className="bm-card">
        <div className="bm-card__header"><h3>Сделки по етап</h3><Link href="/pipeline" className="bm-btn bm-btn--ghost bm-btn--sm">Виж</Link></div>
        <div className="bm-card__body" style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-4)" }}>
          {stageBars.map((s) => (
            <div key={s.title}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--bm-text-sm)", marginBottom: 6 }}>
                <span style={{ display: "flex", alignItems: "center", gap: "var(--bm-space-2)" }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: s.dot }} />{s.title}</span>
                <span style={{ fontFamily: "var(--bm-font-mono)", color: "var(--bm-text-muted)" }}><Money>{money(s.val)}</Money></span>
              </div>
              <div style={{ height: 12, background: "var(--bm-surface-2)", borderRadius: "var(--bm-radius-full)", overflow: "hidden" }}><div style={{ height: "100%", width: Math.round((s.val / stageMax) * 100) + "%", background: s.dot, borderRadius: "inherit" }} /></div>
            </div>
          ))}
        </div>
      </div>

      <div className="bm-card">
        <div className="bm-card__header"><h3>Топ приход по клиент</h3><Link href="/clients" className="bm-btn bm-btn--ghost bm-btn--sm">Виж клиенти</Link></div>
        <div className="bm-card__body" style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-4)" }}>
          {ltvRows.map((r) => (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: "var(--bm-space-3)" }}>
              <span style={{ width: 120, flexShrink: 0, fontSize: "var(--bm-text-sm)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
              <div style={{ flex: 1, height: 12, background: "var(--bm-surface-2)", borderRadius: "var(--bm-radius-full)", overflow: "hidden" }}><div style={{ height: "100%", background: "var(--bm-brand-500)", borderRadius: "inherit", width: Math.round((r.ltv / ltvMax) * 100) + "%" }} /></div>
              <span style={{ width: 72, textAlign: "right", fontFamily: "var(--bm-font-mono)", fontSize: "var(--bm-text-sm)", color: "var(--bm-text-muted)" }}><Money>{money(r.ltv)}</Money></span>
            </div>
          ))}
          {ltvRows.every((r) => r.ltv === 0) && <p className="bm-text-subtle" style={{ fontSize: "var(--bm-text-sm)", margin: 0 }}>Все още няма платени фактури.</p>}
        </div>
      </div>
    </div>
  );
}
