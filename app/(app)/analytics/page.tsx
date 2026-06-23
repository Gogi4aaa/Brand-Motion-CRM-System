"use client";

import Link from "next/link";
import { useStore } from "@/components/store";
import { fmtK, PIPELINE_STAGES } from "@/lib/data";

function Kpi({ label, value, deltaCls, delta }: { label: string; value: string; deltaCls: string; delta: string }) {
  return (
    <div className="bm-card bm-stat">
      <div className="bm-stat__label">{label}</div>
      <div className="bm-stat__value">{value}</div>
      <div className={"bm-stat__delta " + deltaCls}>{delta}</div>
    </div>
  );
}

export default function AnalyticsPage() {
  const { clients, invoices, leads } = useStore();
  const rev = [...clients].map((c) => ({ name: c.name, val: c.mrr })).sort((a, b) => b.val - a.val).slice(0, 6);
  const revMax = rev[0]?.val || 1;

  // Real aggregates
  const mrr = clients.reduce((a, b) => a + b.mrr, 0);
  const activeClients = clients.filter((c) => c.status === "Active").length;
  const collected = invoices.filter((i) => i.status === "paid").reduce((a, b) => a + b.amount, 0);
  const openLeads = leads.filter((l) => l.stage !== "won" && l.stage !== "lost");
  const openPipeline = openLeads.reduce((a, b) => a + b.value, 0);
  const won = leads.filter((l) => l.stage === "won").length;
  const lost = leads.filter((l) => l.stage === "lost").length;
  const winRate = won + lost ? Math.round((won / (won + lost)) * 100) : 0;

  const stageBars = PIPELINE_STAGES.map((s) => ({
    title: s.title, dot: s.dot,
    val: leads.filter((l) => l.stage === s.key).reduce((a, b) => a + b.value, 0),
  }));
  const stageMax = Math.max(1, ...stageBars.map((s) => s.val));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-6)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--bm-space-4)", flexWrap: "wrap" }}>
        <div>
          <h1>Анализи</h1>
          <p className="bm-text-muted" style={{ margin: "4px 0 0" }}>Резултати по канали и клиенти · последните 30 дни</p>
        </div>
        <div className="bm-tabs" style={{ border: "none" }}>
          <button className="bm-tab" aria-selected>Днес</button>
          <button className="bm-tab">Тази седмица</button>
          <button className="bm-tab">Месец</button>
        </div>
      </div>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "var(--bm-space-4)" }}>
        <Kpi label="Месечен приход" value={fmtK(mrr)} deltaCls="bm-text-subtle" delta={`${activeClients} активни клиенти`} />
        <Kpi label="Събрано" value={fmtK(collected)} deltaCls="bm-stat__delta--up" delta="платени фактури" />
        <Kpi label="Активни сделки" value={fmtK(openPipeline)} deltaCls="bm-text-subtle" delta={`${openLeads.length} активни сделки`} />
        <Kpi label="Успеваемост" value={winRate + "%"} deltaCls="bm-text-subtle" delta={`${won + lost} затворени сделки`} />
      </section>

      <section>
        <div className="bm-card">
          <div className="bm-card__header"><h3>Сделки по етап</h3><Link href="/pipeline" className="bm-btn bm-btn--ghost bm-btn--sm">Виж</Link></div>
          <div className="bm-card__body" style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-4)" }}>
            {stageBars.map((s) => (
              <div key={s.title}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--bm-text-sm)", marginBottom: 6 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: "var(--bm-space-2)" }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: s.dot }} />{s.title}</span>
                  <span style={{ fontFamily: "var(--bm-font-mono)", color: "var(--bm-text-muted)" }}>{fmtK(s.val)}</span>
                </div>
                <div style={{ height: 12, background: "var(--bm-surface-2)", borderRadius: "var(--bm-radius-full)", overflow: "hidden" }}><div style={{ height: "100%", width: Math.round((s.val / stageMax) * 100) + "%", background: s.dot, borderRadius: "inherit" }} /></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="bm-card">
        <div className="bm-card__header"><h3>Приход по клиент</h3><Link href="/clients" className="bm-btn bm-btn--ghost bm-btn--sm">Виж клиенти</Link></div>
        <div className="bm-card__body" style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-4)" }}>
          {rev.map((r) => (
            <div key={r.name} style={{ display: "flex", alignItems: "center", gap: "var(--bm-space-3)" }}>
              <span style={{ width: 120, flexShrink: 0, fontSize: "var(--bm-text-sm)", fontWeight: 500 }}>{r.name}</span>
              <div style={{ flex: 1, height: 12, background: "var(--bm-surface-2)", borderRadius: "var(--bm-radius-full)", overflow: "hidden" }}><div style={{ height: "100%", background: "var(--bm-brand-500)", borderRadius: "inherit", width: Math.round((r.val / revMax) * 100) + "%" }} /></div>
              <span style={{ width: 64, textAlign: "right", fontFamily: "var(--bm-font-mono)", fontSize: "var(--bm-text-sm)", color: "var(--bm-text-muted)" }}>{fmtK(r.val)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
