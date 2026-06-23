"use client";

import { useState } from "react";
import { useStore } from "@/components/store";
import { Icon } from "@/components/Icon";
import { PIPELINE_STAGES, fmtFull, fmtK, type LeadStage } from "@/lib/data";

function Kpi({ label, value, deltaCls, delta }: { label: string; value: React.ReactNode; deltaCls?: string; delta?: string }) {
  return (
    <div className="bm-card bm-stat">
      <div className="bm-stat__label">{label}</div>
      <div className="bm-stat__value">{value}</div>
      {delta && <div className={"bm-stat__delta " + (deltaCls || "bm-text-subtle")}>{delta}</div>}
    </div>
  );
}

export default function PipelinePage() {
  const { leads, moveLead, openModal } = useStore();
  const [dragId, setDragId] = useState<string | null>(null);

  const open = leads.filter((l) => l.stage !== "won" && l.stage !== "lost");
  const won = leads.filter((l) => l.stage === "won");
  const lost = leads.filter((l) => l.stage === "lost");
  const closed = won.length + lost.length;
  const winRate = closed ? Math.round((won.length / closed) * 100) : 0;
  const sum = (a: typeof leads) => a.reduce((x, b) => x + b.value, 0);

  const onDrop = (stage: LeadStage) => { if (dragId) { moveLead(dragId, stage); setDragId(null); } };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-5)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--bm-space-4)", flexWrap: "wrap" }}>
        <div>
          <h1>Сделки</h1>
          <p className="bm-text-muted" style={{ margin: "4px 0 0" }}>Влачи сделките между етапите · {leads.length} сделки</p>
        </div>
        <button className="bm-btn bm-btn--primary" onClick={() => openModal({ kind: "lead", mode: "create" })}><Icon name="plus" /> Нова сделка</button>
      </div>

      <section className="bm-stats">
        <Kpi label="Активни сделки" value={fmtK(sum(open))} delta={`${open.length} активни сделки`} />
        <Kpi label="Спечелени" value={fmtK(sum(won))} deltaCls="bm-stat__delta--up" delta={`${won.length} затворени`} />
        <Kpi label="Успеваемост" value={winRate + "%"} delta={`${closed} затворени сделки`} />
        <Kpi label="Средна сделка" value={leads.length ? fmtK(sum(leads) / leads.length) : "$0"} delta="по всички сделки" />
      </section>

      <div className="bm-board bm-board--5">
        {PIPELINE_STAGES.map((col) => {
          const items = leads.filter((l) => l.stage === col.key);
          return (
            <div
              key={col.key}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(col.key)}
              style={{ background: "var(--bm-surface-2)", borderRadius: "var(--bm-radius-lg)", padding: "var(--bm-space-3)", display: "flex", flexDirection: "column", gap: "var(--bm-space-3)", minHeight: 220 }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "var(--bm-space-1) var(--bm-space-2)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--bm-space-2)" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: col.dot }} />
                  <span style={{ fontWeight: 600, fontSize: "var(--bm-text-sm)" }}>{col.title}</span>
                </div>
                <span style={{ fontSize: "var(--bm-text-xs)", color: "var(--bm-text-subtle)", fontWeight: 600, background: "var(--bm-surface)", borderRadius: "var(--bm-radius-full)", padding: "1px 8px" }}>{items.length}</span>
              </div>

              {items.map((l) => (
                <div
                  key={l.id}
                  className="aw-tcard"
                  draggable
                  onDragStart={() => setDragId(l.id)}
                  onClick={() => openModal({ kind: "lead", mode: "edit", lead: l })}
                  style={{ background: "var(--bm-surface)", border: "1px solid var(--bm-border)", borderRadius: "var(--bm-radius-md)", padding: "var(--bm-space-3)", display: "flex", flexDirection: "column", gap: "var(--bm-space-2)", boxShadow: "var(--bm-shadow-xs)" }}
                >
                  <div style={{ fontWeight: 600, fontSize: "var(--bm-text-sm)", lineHeight: "var(--bm-leading-snug)" }}>{l.name}</div>
                  <div style={{ fontSize: "var(--bm-text-xs)", color: "var(--bm-text-subtle)" }}>{l.contact}</div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "var(--bm-space-1)" }}>
                    <span style={{ fontFamily: "var(--bm-font-mono)", fontWeight: 700, fontSize: "var(--bm-text-sm)" }}>{fmtFull(l.value)}</span>
                    <span className="bm-avatar bm-avatar--sm" style={{ width: 24, height: 24, fontSize: 10 }}>{l.owner}</span>
                  </div>
                </div>
              ))}

              {items.length === 0 && (
                <div style={{ border: "1px dashed var(--bm-border-strong)", borderRadius: "var(--bm-radius-md)", padding: "var(--bm-space-4)", textAlign: "center", fontSize: "var(--bm-text-xs)", color: "var(--bm-text-subtle)" }}>Пусни тук</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
