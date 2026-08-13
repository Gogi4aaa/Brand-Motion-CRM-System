"use client";

import { useState } from "react";
import { useStore } from "@/components/store";
import { Icon } from "@/components/Icon";
import { Avatar } from "@/components/Avatar";
import { PIPELINE_STAGES, leadSourceMeta, clientsById, fmtFull, fmtK, type LeadStage } from "@/lib/data";
import { Money } from "@/components/MoneyLock";

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
  const { leads, clients, moveLead, openModal } = useStore();
  const [dragId, setDragId] = useState<string | null>(null);
  const byId = clientsById(clients);

  const open = leads.filter((l) => l.stage !== "won" && l.stage !== "lost");
  const won = leads.filter((l) => l.stage === "won");
  const lost = leads.filter((l) => l.stage === "lost");
  const closed = won.length + lost.length;
  const winRate = closed ? Math.round((won.length / closed) * 100) : 0;
  const referrals = leads.filter((l) => l.source === "referral");
  const sum = (a: typeof leads) => a.reduce((x, b) => x + b.value, 0);

  const onDrop = (stage: LeadStage) => { if (dragId) { moveLead(dragId, stage); setDragId(null); } };

  // Кой е препоръчал: свързан клиент (по име) или свободно вписано име.
  const referredBy = (l: (typeof leads)[number]) =>
    (l.referred_by_client_id && byId[l.referred_by_client_id]?.name) || l.referred_by_name || "";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-5)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--bm-space-4)", flexWrap: "wrap" }}>
        <div>
          <h1>Продажби</h1>
          <p className="bm-text-muted" style={{ margin: "4px 0 0" }}>Влачи сделките между етапите · {leads.length} сделки</p>
        </div>
        <button className="bm-btn bm-btn--primary" onClick={() => openModal({ kind: "lead", mode: "create" })}><Icon name="plus" /> Нова сделка</button>
      </div>

      <section className="bm-stats">
        <Kpi label="Активни сделки" value={<Money>{fmtK(sum(open))}</Money>} delta={`${open.length} активни сделки`} />
        <Kpi label="Спечелени" value={<Money>{fmtK(sum(won))}</Money>} deltaCls="bm-stat__delta--up" delta={`${won.length} затворени`} />
        <Kpi label="Успеваемост" value={winRate + "%"} delta={`${closed} затворени сделки`} />
        <Kpi label="Препоръки" value={referrals.length} delta={leads.length ? `${Math.round((referrals.length / leads.length) * 100)}% от всички` : "—"} />
      </section>

      <div className="bm-board bm-board--5">
        {PIPELINE_STAGES.map((col) => {
          const items = leads.filter((l) => l.stage === col.key);
          const colIdx = PIPELINE_STAGES.findIndex((c) => c.key === col.key);
          const prevCol = PIPELINE_STAGES[colIdx - 1];
          const nextCol = PIPELINE_STAGES[colIdx + 1];
          return (
            <div
              key={col.key}
              className="bm-kcol"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(col.key)}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "var(--bm-space-1) var(--bm-space-2)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--bm-space-2)", minWidth: 0 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: col.dot, flexShrink: 0 }} />
                  <span title={col.title} style={{ fontWeight: 600, fontSize: "var(--bm-text-sm)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{col.title}</span>
                </div>
                <span style={{ fontSize: "var(--bm-text-xs)", color: "var(--bm-text-subtle)", fontWeight: 600, background: "var(--bm-surface)", borderRadius: "var(--bm-radius-full)", padding: "1px 8px" }}>{items.length}</span>
              </div>

              <div className="bm-noscrollbar bm-kcol__list">
                {items.map((l) => {
                  const src = leadSourceMeta(l.source);
                  const ref = referredBy(l);
                  return (
                    <div
                      key={l.id}
                      className="aw-tcard"
                      draggable
                      onDragStart={() => setDragId(l.id)}
                      onClick={() => openModal({ kind: "lead", mode: "edit", lead: l })}
                      style={{ background: "var(--bm-surface)", border: "1px solid var(--bm-border)", borderRadius: "var(--bm-radius-md)", padding: "var(--bm-space-3)", display: "flex", flexDirection: "column", gap: 6, boxShadow: "var(--bm-shadow-xs)", cursor: "pointer" }}
                    >
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6 }}>
                        <div style={{ fontWeight: 600, fontSize: "var(--bm-text-sm)", lineHeight: "var(--bm-leading-snug)", minWidth: 0 }}>{l.name}</div>
                        <span className={"bm-badge " + src.cls} style={{ flexShrink: 0 }}>{src.label}</span>
                      </div>
                      {l.contact && <div style={{ fontSize: "var(--bm-text-xs)", color: "var(--bm-text-subtle)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.contact}</div>}
                      {l.source === "referral" && ref && (
                        <div style={{ fontSize: "var(--bm-text-xs)", color: "var(--bm-brand-600)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={`Препоръчан от ${ref}`}>↩ {ref}</div>
                      )}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 2 }}>
                        <span style={{ fontFamily: "var(--bm-font-mono)", fontWeight: 700, fontSize: "var(--bm-text-sm)" }}><Money>{fmtFull(l.value)}</Money></span>
                        <Avatar initials={l.owner} style={{ width: 24, height: 24, fontSize: 10 }} />
                      </div>
                      {/* Телефон: влаченето не работи на touch — стрелките местят между етапите */}
                      <div className="bm-card-move">
                        <button disabled={!prevCol} aria-label={prevCol ? `Премести в ${prevCol.title}` : undefined} onClick={(e) => { e.stopPropagation(); if (prevCol) moveLead(l.id, prevCol.key); }}>‹ {prevCol?.title || "—"}</button>
                        <button disabled={!nextCol} aria-label={nextCol ? `Премести в ${nextCol.title}` : undefined} onClick={(e) => { e.stopPropagation(); if (nextCol) moveLead(l.id, nextCol.key); }}>{nextCol?.title || "—"} ›</button>
                      </div>
                    </div>
                  );
                })}

                {items.length === 0 && (
                  <div style={{ border: "1px dashed var(--bm-border-strong)", borderRadius: "var(--bm-radius-md)", padding: "var(--bm-space-4)", textAlign: "center", fontSize: "var(--bm-text-xs)", color: "var(--bm-text-subtle)" }}>Пусни тук</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
