"use client";

import { useState } from "react";
import { useStore } from "@/components/store";
import { Icon } from "@/components/Icon";
import { clientsById, prioMeta, TASK_COLUMNS, fmtDuration, type TaskStatus } from "@/lib/data";

export default function TasksPage() {
  const { clients, tasks, moveTask, openModal, currentUser } = useStore();
  const [filter, setFilter] = useState("all");
  const [dragId, setDragId] = useState<string | null>(null);
  const byId = clientsById(clients);
  const scoped = currentUser.level === "worker" ? tasks.filter((t) => t.assignee === currentUser.initials) : tasks;

  const visible = scoped.filter((t) => filter === "all" || t.client === filter);
  const clientCount = new Set(scoped.map((t) => t.client)).size;

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
        <div style={{ display: "flex", gap: "var(--bm-space-3)", alignItems: "center" }}>
          <select className="bm-select" style={{ width: "auto", minWidth: 170 }} value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">Всички клиенти</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button className="bm-btn bm-btn--primary" onClick={() => openModal({ kind: "task", mode: "create" })}><Icon name="plus" /> Нова задача</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "var(--bm-space-4)", alignItems: "start" }}>
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
                        {t.time_logged ? <span style={{ flexShrink: 0 }}>· {fmtDuration(t.time_logged)}</span> : null}
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
