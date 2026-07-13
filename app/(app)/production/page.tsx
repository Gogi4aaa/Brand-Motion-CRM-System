"use client";

import { useState } from "react";
import { useStore } from "@/components/store";
import { ContentCalendar } from "@/components/ContentCalendar";
import { clientsById, contentTypeMeta, isArchived, BOARD_RETENTION_DAYS, PRODUCTION_STAGES, CYCLE_PHASES, cyclePhaseMeta, monthLabel } from "@/lib/data";

export default function ProductionPage() {
  const { contentItems, clients, cycles, currentUser, advanceStage, advanceCycle, openModal, visibleClients } = useStore();
  const canImport = currentUser.level === "admin" || currentUser.level === "manager";
  const activeCycles = cycles.filter((c) => c.phase !== "published");
  const byId = clientsById(clients);
  const allowedIds = new Set(visibleClients.map((c) => c.id));
  const [clientFilter, setClientFilter] = useState("all");
  const [mine, setMine] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

  // Публикуваното отпреди BOARD_RETENTION_DAYS дни се архивира от борда —
  // видеата остават в базата (клиентският портал и пакетът ги ползват).
  const inScope = contentItems.filter((c) => {
    if (!allowedIds.has(c.client)) return false;
    if (clientFilter !== "all" && c.client !== clientFilter) return false;
    if (mine) {
      const cur = (c.stages || []).find((s) => s.key === (c.current_stage || "strategy"));
      if (cur?.assignee !== currentUser.initials) return false;
    }
    return true;
  });
  const archivedCount = inScope.filter((c) => c.published && isArchived(c.published_at)).length;
  const visible = showArchive ? inScope : inScope.filter((c) => !(c.published && isArchived(c.published_at)));

  const colItems = (stageKey: string) => visible.filter((c) => (c.current_stage || "strategy") === stageKey);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-5)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--bm-space-4)", flexWrap: "wrap" }}>
        <div>
          <h1>Продукция</h1>
          <p className="bm-text-muted" style={{ margin: "4px 0 0" }}>Местѝ всяко видео през етапите — влаченето го предава на следващия.</p>
        </div>
        <div style={{ display: "flex", gap: "var(--bm-space-3)", alignItems: "center", flexWrap: "wrap" }}>
          <label className="bm-checkbox"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Моята работа</label>
          <label className="bm-checkbox" title={`Публикуваните преди повече от ${BOARD_RETENTION_DAYS} дни се прибират от борда, но остават в клиентския портал`}>
            <input type="checkbox" checked={showArchive} onChange={(e) => setShowArchive(e.target.checked)} /> Архив{archivedCount > 0 ? ` (${archivedCount})` : ""}
          </label>
          {canImport && (
            <button className="bm-btn bm-btn--primary" onClick={() => openModal({ kind: "importScripts" })}>Импортирай сценарии</button>
          )}
          <select className="bm-select" style={{ width: "auto", minWidth: 160 }} value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}>
            <option value="all">Всички клиенти</option>
            {visibleClients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      {canImport && (
        <div className="bm-card">
          <div className="bm-card__body" style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-3)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--bm-space-3)" }}>
              <div style={{ fontWeight: 700, fontSize: "var(--bm-text-sm)" }}>Месечни цикли — къде сме с всеки клиент</div>
              <button className="bm-btn bm-btn--secondary" onClick={() => openModal({ kind: "cycle" })}>+ Нов цикъл</button>
            </div>
            {activeCycles.length === 0 ? (
              <div className="bm-text-subtle" style={{ fontSize: "var(--bm-text-sm)" }}>Няма активни цикли. Започни цикъл, за да задвижиш идеи и сценарии за клиент.</div>
            ) : (
              activeCycles.map((cy) => {
                const phaseIdx = CYCLE_PHASES.findIndex((p) => p.key === cy.phase);
                const next = phaseIdx < CYCLE_PHASES.length - 1 ? CYCLE_PHASES[phaseIdx + 1] : null;
                const done = contentItems.filter((ci) => ci.cycle_id === cy.id && ci.published).length;
                return (
                  <div key={cy.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--bm-space-3)", flexWrap: "wrap", borderTop: "1px solid var(--bm-border)", paddingTop: "var(--bm-space-3)" }}>
                    <div style={{ minWidth: 160 }}>
                      <div style={{ fontWeight: 600, fontSize: "var(--bm-text-sm)" }}>{byId[cy.client]?.name || cy.client}</div>
                      <div className="bm-text-subtle" style={{ fontSize: "var(--bm-text-xs)" }}>{monthLabel(cy.month)} · {cy.phase === "production" || cy.phase === "published" ? `${done}/${cy.target_count} готови` : `${cy.target_count} видеа`}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--bm-space-2)", flexWrap: "wrap" }}>
                      {CYCLE_PHASES.map((p, i) => (
                        <span key={p.key} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "var(--bm-text-xs)", fontWeight: i === phaseIdx ? 700 : 400, color: i <= phaseIdx ? "var(--bm-text)" : "var(--bm-text-subtle)" }}>
                          <span style={{ width: 8, height: 8, borderRadius: "50%", background: i <= phaseIdx ? p.dot : "var(--bm-border-strong)" }} />
                          {p.label}
                        </span>
                      ))}
                    </div>
                    {next ? (
                      <button className="bm-btn bm-btn--primary" style={{ fontSize: "var(--bm-text-xs)", padding: "4px 10px" }} onClick={() => advanceCycle(cy.id, next.key)}>→ {next.label}</button>
                    ) : <span />}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      <div className="bm-board bm-board--6">
        {PRODUCTION_STAGES.map((col) => {
          const items = colItems(col.key);
          return (
            <div
              key={col.key}
              className="bm-kcol"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => { if (dragId) { advanceStage(dragId, col.key); setDragId(null); } }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "var(--bm-space-1) var(--bm-space-2)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--bm-space-2)", minWidth: 0 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: col.dot, flexShrink: 0 }} />
                  <span title={col.label} style={{ fontWeight: 600, fontSize: "var(--bm-text-sm)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{col.label}</span>
                </div>
                <span style={{ fontSize: "var(--bm-text-xs)", color: "var(--bm-text-subtle)", fontWeight: 600, background: "var(--bm-surface)", borderRadius: "var(--bm-radius-full)", padding: "1px 8px" }}>{items.length}</span>
              </div>

              <div className="bm-noscrollbar bm-kcol__list">
              {items.map((it) => {
                const ct = contentTypeMeta(it.type);
                const cur = (it.stages || []).find((s) => s.key === (it.current_stage || "strategy"));
                const canMove = currentUser.isAdmin || cur?.assignee === currentUser.initials;
                return (
                  <div
                    key={it.id}
                    className={canMove ? "aw-tcard" : undefined}
                    draggable={canMove}
                    onDragStart={canMove ? () => setDragId(it.id) : undefined}
                    onClick={() => openModal({ kind: "content", mode: "edit", item: it })}
                    style={{ background: "var(--bm-surface)", border: "1px solid var(--bm-border)", borderLeft: `3px solid ${ct.fg}`, borderRadius: "var(--bm-radius-md)", padding: "var(--bm-space-3)", display: "flex", flexDirection: "column", gap: "var(--bm-space-2)", boxShadow: "var(--bm-shadow-xs)", cursor: "pointer" }}
                  >
                    <div style={{ fontWeight: 600, fontSize: "var(--bm-text-sm)", lineHeight: "var(--bm-leading-snug)" }}>{it.published ? "✓ " : ""}{it.title || "(без заглавие)"}</div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: "var(--bm-text-xs)", color: "var(--bm-text-subtle)" }}>{byId[it.client]?.name || it.client}</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: "var(--bm-text-xs)", color: "var(--bm-text-subtle)" }}>{it.date?.slice(5)}</span>
                        {cur?.assignee && <span className="bm-avatar bm-avatar--sm" style={{ width: 22, height: 22, fontSize: 9 }}>{cur.assignee}</span>}
                      </span>
                    </div>
                  </div>
                );
              })}

              {items.length === 0 && (
                <div style={{ border: "1px dashed var(--bm-border-strong)", borderRadius: "var(--bm-radius-md)", padding: "var(--bm-space-3)", textAlign: "center", fontSize: "var(--bm-text-xs)", color: "var(--bm-text-subtle)" }}>—</div>
              )}
              </div>
            </div>
          );
        })}
      </div>

      {contentItems.length === 0 && (
        <div className="bm-card"><div className="bm-card__body bm-text-subtle">Все още няма видеа. Добави съдържание в календара по-долу и то ще се появи тук като карта за продукция.</div></div>
      )}

      {/* Контент календарът живее тук, под дъската: работниците виждат кога
          какво излиза и в каква последователност се правят видеата. */}
      <div style={{ borderTop: "1px solid var(--bm-border)", paddingTop: "var(--bm-space-5)", display: "flex", flexDirection: "column", gap: "var(--bm-space-4)" }}>
        <div>
          <h2 style={{ margin: 0 }}>Контент календар</h2>
          <p className="bm-text-muted" style={{ margin: "4px 0 0" }}>Планът за месеца — кое видео кога излиза. Филтърът по клиент горе важи и за дъската, и за календара.</p>
        </div>
        <ContentCalendar clientId={clientFilter} onClientChange={setClientFilter} />
      </div>
    </div>
  );
}
