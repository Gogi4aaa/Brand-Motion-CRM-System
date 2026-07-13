"use client";

import { useState } from "react";
import { useStore } from "@/components/store";
import { Icon } from "@/components/Icon";
import { clientsById, prioMeta, TASK_COLUMNS, fmtFull, payoutFor, canSeeTask, isArchived, BOARD_RETENTION_DAYS, WEEKLY_CAPACITY_HOURS, type TaskStatus } from "@/lib/data";

export default function TasksPage() {
  const { clients, tasks, team, moveTask, openModal, currentUser, markWorkerPaid, visibleClients } = useStore();
  const [filter, setFilter] = useState("all");
  const [showOld, setShowOld] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const byId = clientsById(clients);
  const mine = currentUser.level === "worker" ? tasks.filter((t) => t.assignee === currentUser.initials) : tasks;
  // Private tasks stay between the admin and the assignee — hidden from everyone else.
  const scoped = mine.filter((t) => canSeeTask(t, currentUser.level, currentUser.initials));

  // Done по-старо от BOARD_RETENTION_DAYS се прибира от борда; сумите долу
  // (възнаграждения, натовареност) винаги смятат върху пълния списък tasks.
  const oldDoneCount = scoped.filter((t) => t.status === "done" && isArchived(t.done_at) && (filter === "all" || t.client === filter)).length;
  const visible = scoped.filter((t) =>
    (filter === "all" || t.client === filter) && (showOld || t.status !== "done" || !isArchived(t.done_at)));
  const clientCount = new Set(scoped.map((t) => t.client)).size;

  // Workload: planned hours per person across open (non-done) tasks vs the
  // weekly capacity — Productive.io-style over/under signal.
  const workload = (() => {
    const open = tasks.filter((t) => t.status !== "done");
    const hours = new Map<string, number>();
    for (const t of open) {
      if (!t.assignee) continue;
      hours.set(t.assignee, (hours.get(t.assignee) || 0) + (t.estimate_hours || 0));
    }
    for (const m of team) if (!hours.has(m.initials)) hours.set(m.initials, 0);
    return Array.from(hours.entries())
      .map(([initials, h]) => ({ initials, hours: h, name: team.find((m) => m.initials === initials)?.name || initials }))
      .sort((a, b) => b.hours - a.hours);
  })();

  const onDrop = (status: TaskStatus) => {
    if (dragId) { moveTask(dragId, status); setDragId(null); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-5)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--bm-space-4)", flexWrap: "wrap" }}>
        <div>
          <h1>Задачи</h1>
          <p className="bm-text-muted" style={{ margin: "4px 0 0" }}>Влачи картите между колоните, за да смениш статуса · {visible.length} задачи в {clientCount} клиента</p>
        </div>
        <div style={{ display: "flex", gap: "var(--bm-space-3)", alignItems: "center", flexWrap: "wrap" }}>
          <label className="bm-checkbox" title={`Завършените преди повече от ${BOARD_RETENTION_DAYS} дни се прибират от борда (историята и плащанията се пазят)`}>
            <input type="checkbox" checked={showOld} onChange={(e) => setShowOld(e.target.checked)} /> Стари{oldDoneCount > 0 ? ` (${oldDoneCount})` : ""}
          </label>
          <select className="bm-select" style={{ width: "auto", minWidth: 170 }} value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">Всички клиенти</option>
            {visibleClients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button className="bm-btn bm-btn--primary" onClick={() => openModal({ kind: "task", mode: "create" })}><Icon name="plus" /> Нова задача</button>
        </div>
      </div>

      {currentUser.level === "worker" && (() => {
        const p = payoutFor(tasks, currentUser.initials);
        return (
          <div className="bm-card">
            <div className="bm-card__header"><h3>Моето възнаграждение</h3></div>
            <div className="bm-card__body" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "var(--bm-space-4)" }}>
              <div>
                <div className="bm-label">За получаване</div>
                <div style={{ fontSize: "var(--bm-text-xl)", fontWeight: 700 }}>{fmtFull(p.owed)}</div>
                <div className="bm-text-subtle" style={{ fontSize: "var(--bm-text-xs)" }}>{p.owedCount} завършени задачи</div>
              </div>
              <div>
                <div className="bm-label">Предстоящо</div>
                <div style={{ fontSize: "var(--bm-text-xl)", fontWeight: 700 }}>{fmtFull(p.upcoming)}</div>
                <div className="bm-text-subtle" style={{ fontSize: "var(--bm-text-xs)" }}>по задачи в процес</div>
              </div>
              <div>
                <div className="bm-label">Платено досега</div>
                <div style={{ fontSize: "var(--bm-text-xl)", fontWeight: 700, color: "var(--bm-success-600)" }}>{fmtFull(p.paidTotal)}</div>
              </div>
            </div>
          </div>
        );
      })()}

      {currentUser.isAdmin && (
        <div className="bm-card">
          <div className="bm-card__header"><h3>Възнаграждения към екипа</h3><span className="bm-text-subtle" style={{ fontSize: "var(--bm-text-xs)" }}>дължимо = завършени, неплатени задачи</span></div>
          <div className="bm-card__body" style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-3)" }}>
            {team.filter((m) => m.initials !== currentUser.initials).map((m) => {
              const p = payoutFor(tasks, m.initials);
              if (p.owed === 0 && p.upcoming === 0 && p.paidTotal === 0) return null;
              return (
                <div key={m.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--bm-space-3)", borderBottom: "1px solid var(--bm-border)", paddingBottom: "var(--bm-space-3)" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <span className="bm-avatar bm-avatar--sm" style={{ width: 24, height: 24, fontSize: 10 }}>{m.initials}</span>
                    <span style={{ fontWeight: 600, fontSize: "var(--bm-text-sm)" }}>{m.name}</span>
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: "var(--bm-space-3)", flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <span className="bm-text-subtle" style={{ fontSize: "var(--bm-text-xs)" }}>предстоящо {fmtFull(p.upcoming)} · платено {fmtFull(p.paidTotal)}</span>
                    <span style={{ fontWeight: 700 }}>{fmtFull(p.owed)}</span>
                    <button className="bm-btn bm-btn--secondary bm-btn--sm" disabled={p.owed === 0} onClick={() => markWorkerPaid(m.initials)} title="Маркира завършените неплатени задачи като платени">Платено</button>
                  </span>
                </div>
              );
            })}
            {team.every((m) => { const p = payoutFor(tasks, m.initials); return m.initials === currentUser.initials || (p.owed === 0 && p.upcoming === 0 && p.paidTotal === 0); }) && (
              <p className="bm-text-subtle" style={{ fontSize: "var(--bm-text-sm)", margin: 0 }}>Няма зададени възнаграждения. Отвори задача и попълни полето „Възнаграждение за изпълнителя“.</p>
            )}
          </div>
        </div>
      )}

      {currentUser.level !== "worker" && workload.length > 0 && (
        <div className="bm-card">
          <div className="bm-card__header"><h3>Натовареност (седмица)</h3><span className="bm-text-subtle" style={{ fontSize: "var(--bm-text-xs)" }}>капацитет {WEEKLY_CAPACITY_HOURS}ч / човек</span></div>
          <div className="bm-card__body" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "var(--bm-space-4)" }}>
            {workload.map((w) => {
              const pct = Math.min(100, Math.round((w.hours / WEEKLY_CAPACITY_HOURS) * 100));
              const over = w.hours > WEEKLY_CAPACITY_HOURS;
              return (
                <div key={w.initials} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      <span className="bm-avatar bm-avatar--sm" style={{ width: 24, height: 24, fontSize: 10 }}>{w.initials}</span>
                      <span style={{ fontSize: "var(--bm-text-sm)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.name}</span>
                    </span>
                    <span className={"bm-badge " + (over ? "bm-badge--danger" : w.hours >= WEEKLY_CAPACITY_HOURS * 0.8 ? "bm-badge--warning" : "bm-badge--success")}>{w.hours}ч{over ? " · претоварен" : ""}</span>
                  </div>
                  <div className="bm-progress"><div className="bm-progress__bar" style={{ width: pct + "%", background: over ? "var(--bm-danger-500)" : undefined }} /></div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="bm-board bm-board--4">
        {TASK_COLUMNS.map((col) => {
          const colTasks = visible.filter((t) => t.status === col.key);
          return (
            <div
              key={col.key}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(col.key)}
              style={{ background: "var(--bm-surface-2)", borderRadius: "var(--bm-radius-lg)", padding: "var(--bm-space-3)", display: "flex", flexDirection: "column", gap: "var(--bm-space-3)", minHeight: 200 }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "var(--bm-space-1) var(--bm-space-2)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--bm-space-2)" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: col.dot }} />
                  <span style={{ fontWeight: 600, fontSize: "var(--bm-text-sm)" }}>{col.title}</span>
                </div>
                <span style={{ fontSize: "var(--bm-text-xs)", color: "var(--bm-text-subtle)", fontWeight: 600, background: "var(--bm-surface)", borderRadius: "var(--bm-radius-full)", padding: "1px 8px" }}>{colTasks.length}</span>
              </div>

              {colTasks.map((t) => {
                const pm = prioMeta(t.priority);
                return (
                  <div
                    key={t.id}
                    className="aw-tcard"
                    draggable
                    onDragStart={() => setDragId(t.id)}
                    onClick={() => openModal({ kind: "task", mode: "edit", task: t })}
                    style={{ background: "var(--bm-surface)", border: "1px solid var(--bm-border)", borderRadius: "var(--bm-radius-md)", padding: "var(--bm-space-3)", display: "flex", flexDirection: "column", gap: "var(--bm-space-2)", boxShadow: "var(--bm-shadow-xs)" }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span className={"bm-badge " + pm.cls}>{pm.label}</span>
                      <span style={{ fontSize: "var(--bm-text-xs)", color: "var(--bm-text-subtle)" }}>{t.due}</span>
                    </div>
                    <div style={{ fontWeight: 600, fontSize: "var(--bm-text-sm)", lineHeight: "var(--bm-leading-snug)" }}>{t.title}</div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "var(--bm-space-1)" }}>
                      <span style={{ fontSize: "var(--bm-text-xs)", color: "var(--bm-text-subtle)", display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{byId[t.client]?.name}</span>
                        {t.visibility === "private" ? <span style={{ flexShrink: 0 }} title={t.content_item_id ? "Виждат я само изпълнителят, админът и мениджърът" : "Виждате я само ти и админът"}>🔒</span> : null}
                        {(currentUser.isAdmin || t.assignee === currentUser.initials) && (t.pay_amount || 0) > 0 ? (
                          <span style={{ flexShrink: 0, fontWeight: 600, color: t.paid ? "var(--bm-success-600)" : "var(--bm-text-muted)" }}>· {fmtFull(t.pay_amount || 0)}{t.paid ? " ✓" : ""}</span>
                        ) : null}
                      </span>
                      <span className="bm-avatar bm-avatar--sm" style={{ width: 24, height: 24, fontSize: 10 }}>{t.assignee}</span>
                    </div>
                  </div>
                );
              })}

              {colTasks.length === 0 && (
                <div style={{ border: "1px dashed var(--bm-border-strong)", borderRadius: "var(--bm-radius-md)", padding: "var(--bm-space-4)", textAlign: "center", fontSize: "var(--bm-text-xs)", color: "var(--bm-text-subtle)" }}>Пусни задачи тук</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
