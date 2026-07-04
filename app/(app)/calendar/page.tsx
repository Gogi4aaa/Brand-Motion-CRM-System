"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useStore } from "@/components/store";
import { Icon } from "@/components/Icon";
import { CONTENT_TYPES, contentTypeMeta } from "@/lib/data";

const WEEKDAYS = ["НД", "ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ"];
const MONTHS = ["Януари", "Февруари", "Март", "Април", "Май", "Юни", "Юли", "Август", "Септември", "Октомври", "Ноември", "Декември"];

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

export default function CalendarPage() {
  return (
    <Suspense fallback={null}>
      <CalendarInner />
    </Suspense>
  );
}

function CalendarInner() {
  const { contentItems, openModal, scheduleContent, visibleClients } = useStore();
  const search = useSearchParams();
  const [dragId, setDragId] = useState<string | null>(null);
  // Deep link honours access: a ?client= the user isn't allowed to see is ignored.
  const requested = search.get("client");
  const initialClient = requested && visibleClients.some((c) => c.id === requested) ? requested : visibleClients[0]?.id || "";
  const [clientId, setClientId] = useState(initialClient);
  const [pubFilter, setPubFilter] = useState<"all" | "published" | "unpublished">("all");
  const today = new Date();
  const [view, setView] = useState({ y: today.getFullYear(), m: today.getMonth() });

  // Build the 6x7 grid of dates for the visible month.
  const first = new Date(view.y, view.m, 1);
  const startOffset = first.getDay(); // 0 = Sunday
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells: ({ day: number; date: string } | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, date: iso(view.y, view.m, d) });
  while (cells.length % 7 !== 0) cells.push(null);

  const pubOk = (c: { published?: boolean }) => pubFilter === "all" || (pubFilter === "published" ? c.published : !c.published);
  const itemsFor = (date: string) =>
    contentItems.filter((c) => c.client === clientId && c.date === date && pubOk(c));
  const backlog = contentItems.filter((c) => c.client === clientId && !c.date && pubOk(c));
  // Mobile agenda: only the month's days that have content, in order.
  const agenda = cells
    .filter((c): c is { day: number; date: string } => c !== null)
    .map((c) => ({ ...c, items: itemsFor(c.date) }))
    .filter((c) => c.items.length > 0);

  const onDropDay = (date: string | null) => { if (dragId) { scheduleContent(dragId, date); setDragId(null); } };

  const go = (delta: number) => {
    const m = view.m + delta;
    setView({ y: view.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 });
  };

  const todayIso = iso(today.getFullYear(), today.getMonth(), today.getDate());

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-5)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--bm-space-4)", flexWrap: "wrap" }}>
        <div>
          <h1>Календар със съдържание</h1>
          <p className="bm-text-muted" style={{ margin: "4px 0 0" }}>Планирай постове, рийлс и промо по клиенти.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--bm-space-3)", flexWrap: "wrap" }}>
          <select className="bm-select" style={{ width: "auto", minWidth: 180 }} value={clientId} onChange={(e) => setClientId(e.target.value)}>
            {visibleClients.length === 0 && <option value="">Все още няма клиенти</option>}
            {visibleClients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className="bm-select" style={{ width: "auto" }} value={pubFilter} onChange={(e) => setPubFilter(e.target.value as "all" | "published" | "unpublished")}>
            <option value="all">Всички</option>
            <option value="published">Публикувани</option>
            <option value="unpublished">Непубликувани</option>
          </select>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--bm-space-2)" }}>
            <button className="bm-btn bm-btn--ghost bm-btn--icon" onClick={() => go(-1)} aria-label="Предишен месец"><Icon name="chevronLeft" /></button>
            <span style={{ fontWeight: 600, minWidth: 130, textAlign: "center" }}>{MONTHS[view.m]} {view.y}</span>
            <button className="bm-btn bm-btn--ghost bm-btn--icon" onClick={() => go(1)} aria-label="Следващ месец"><Icon name="chevronRight" /></button>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: "var(--bm-space-2)", flexWrap: "wrap" }}>
        {CONTENT_TYPES.map((t) => (
          <span key={t.id} className="bm-badge" style={{ background: t.bg, color: t.fg }}>{t.label}</span>
        ))}
      </div>

      {clientId ? (
        <div style={{ display: "flex", gap: "var(--bm-space-4)", alignItems: "flex-start", flexWrap: "wrap" }}>
          {/* Backlog of unscheduled videos — drag onto a day to plan it */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDropDay(null)}
            style={{ flex: "0 0 250px", maxWidth: "100%", background: "var(--bm-surface)", border: "1px solid var(--bm-border)", borderRadius: "var(--bm-radius-lg)", padding: "var(--bm-space-4)", display: "flex", flexDirection: "column", gap: "var(--bm-space-3)", minHeight: 320 }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontWeight: 700, fontSize: "var(--bm-text-sm)" }}>Непланирани видеа</div>
              <span className="bm-badge bm-badge--neutral">{backlog.length}</span>
            </div>
            <button className="bm-btn bm-btn--secondary bm-btn--sm" onClick={() => openModal({ kind: "content", mode: "create", clientId, date: "" })}><Icon name="plus" size={16} /> Ново видео</button>
            <p className="bm-text-subtle" style={{ fontSize: "var(--bm-text-xs)", margin: 0 }}>Завлачи видео върху ден от календара, за да го насрочиш.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, overflowY: "auto" }}>
              {backlog.length === 0 && <span className="bm-text-subtle" style={{ fontSize: "var(--bm-text-xs)" }}>Няма непланирани видеа.</span>}
              {backlog.map((it) => {
                const m = contentTypeMeta(it.type);
                return (
                  <div
                    key={it.id}
                    draggable
                    onDragStart={() => setDragId(it.id)}
                    onClick={() => openModal({ kind: "content", mode: "edit", item: it })}
                    title={it.title}
                    style={{ cursor: "grab", borderLeft: `3px solid ${m.fg}`, background: m.bg, color: m.fg, borderRadius: "var(--bm-radius-sm)", padding: "6px 8px", fontSize: "var(--bm-text-xs)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  >
                    {it.title}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Calendar grid (desktop / tablet) */}
          <div className="bm-hide-mobile" style={{ flex: "1 1 520px", minWidth: 0 }}>
          <div style={{ border: "1px solid var(--bm-border)", borderRadius: "var(--bm-radius-lg)", overflow: "hidden", background: "var(--bm-surface)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", background: "var(--bm-slate-900)" }}>
              {WEEKDAYS.map((w) => (
                <div key={w} style={{ padding: "var(--bm-space-2)", textAlign: "center", color: "#fff", fontSize: "var(--bm-text-xs)", fontWeight: 700, letterSpacing: "var(--bm-tracking-wide)" }}>{w}</div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
              {cells.map((cell, i) => {
                if (!cell) return <div key={i} style={{ minHeight: 110, background: "var(--bm-slate-100)", borderRight: "1px solid var(--bm-border)", borderBottom: "1px solid var(--bm-border)" }} />;
                const items = itemsFor(cell.date);
                const isToday = cell.date === todayIso;
                return (
                  <div
                    key={i}
                    onClick={() => openModal({ kind: "content", mode: "create", clientId, date: cell.date })}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => onDropDay(cell.date)}
                    style={{ minHeight: 110, padding: "var(--bm-space-2)", borderRight: "1px solid var(--bm-border)", borderBottom: "1px solid var(--bm-border)", cursor: "pointer", display: "flex", flexDirection: "column", gap: 4, background: isToday ? "var(--bm-brand-50)" : "var(--bm-surface)" }}
                  >
                    <div style={{ fontSize: "var(--bm-text-xs)", fontWeight: 600, color: isToday ? "var(--bm-brand-700)" : "var(--bm-text-subtle)", textAlign: "right" }}>{cell.day}</div>
                    {items.map((it) => {
                      const m = contentTypeMeta(it.type);
                      const total = it.stages?.length || 0;
                      const done = it.stages?.filter((s) => s.status === "done").length || 0;
                      return (
                        <div
                          key={it.id}
                          draggable
                          onDragStart={(e) => { e.stopPropagation(); setDragId(it.id); }}
                          onClick={(e) => { e.stopPropagation(); openModal({ kind: "content", mode: "edit", item: it }); }}
                          style={{ textAlign: "left", borderRadius: "var(--bm-radius-sm)", padding: "3px 6px", background: m.bg, color: m.fg, fontSize: "var(--bm-text-xs)", fontWeight: 600, cursor: "grab", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                          title={it.title}
                        >
                          {it.published ? "✓ " : ""}{it.title}{total ? ` · ${done}/${total}` : ""}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
          </div>

          {/* Agenda (mobile) */}
          <div className="bm-show-mobile" style={{ flex: "1 1 100%", minWidth: 0, width: "100%", display: "flex", flexDirection: "column", gap: "var(--bm-space-4)" }}>
            {agenda.length === 0 && <div className="bm-text-subtle" style={{ fontSize: "var(--bm-text-sm)" }}>Няма насрочено съдържание за {MONTHS[view.m]}.</div>}
            {agenda.map((d) => (
              <div key={d.date} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontWeight: 700, fontSize: "var(--bm-text-sm)" }}>{d.day} {MONTHS[view.m]} · {WEEKDAYS[new Date(d.date).getDay()]}</div>
                {d.items.map((it) => {
                  const m = contentTypeMeta(it.type);
                  const total = it.stages?.length || 0;
                  const done = it.stages?.filter((s) => s.status === "done").length || 0;
                  return (
                    <div
                      key={it.id}
                      onClick={() => openModal({ kind: "content", mode: "edit", item: it })}
                      style={{ borderLeft: `3px solid ${m.fg}`, background: m.bg, color: m.fg, borderRadius: "var(--bm-radius-sm)", padding: "8px 10px", fontSize: "var(--bm-text-sm)", fontWeight: 600, cursor: "pointer" }}
                    >
                      {it.published ? "✓ " : ""}{it.title}{total ? ` · ${done}/${total}` : ""}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="bm-card"><div className="bm-card__body bm-text-subtle">Първо добави клиент, за да планираш съдържание.</div></div>
      )}
    </div>
  );
}
