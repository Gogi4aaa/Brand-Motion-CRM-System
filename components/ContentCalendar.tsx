"use client";

// Контент календарът, споделен между страницата „Продукция“ (под дъската,
// за да виждат работниците реда и датите на видеата) и /calendar (стар deep
// link). Клиентски селект + месечна решетка с drag-за-насрочване; на телефон
// решетката става дневен списък.

import { useState } from "react";
import { useStore } from "@/components/store";
import { Icon } from "@/components/Icon";
import { CONTENT_TYPES, contentTypeMeta, clientsById } from "@/lib/data";

const WEEKDAYS = ["НД", "ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ"];
const MONTHS = ["Януари", "Февруари", "Март", "Април", "Май", "Юни", "Юли", "Август", "Септември", "Октомври", "Ноември", "Декември"];

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

// clientId/onClientChange правят филтъра контролиран отвън (Продукция подава
// общата си селекция и скриваме вътрешния селект); "all" показва видеата на
// всички достъпни клиенти заедно, с инициалите на клиента върху всяко видео.
export function ContentCalendar({ initialClientId, clientId: controlledClient, onClientChange }: { initialClientId?: string; clientId?: string; onClientChange?: (id: string) => void }) {
  const { contentItems, openModal, scheduleContent, visibleClients, clients } = useStore();
  const [dragId, setDragId] = useState<string | null>(null);
  const initialClient = initialClientId && visibleClients.some((c) => c.id === initialClientId) ? initialClientId : "all";
  const [internalClient, setInternalClient] = useState(initialClient);
  const clientId = controlledClient ?? internalClient;
  const setClient = onClientChange ?? setInternalClient;
  const allMode = clientId === "all";
  const allowedIds = new Set(visibleClients.map((c) => c.id));
  const matches = (c: { client: string }) => (allMode ? allowedIds.has(c.client) : c.client === clientId);
  const byId = clientsById(clients);
  // В режим „всички“ новите видеа се създават към първия достъпен клиент —
  // за точен избор се сменя филтърът на конкретен клиент.
  const createClientId = allMode ? "" : clientId;
  const [pubFilter, setPubFilter] = useState<"all" | "published" | "unpublished">("all");
  // Кликнат ден: отваря преглед на насрочените за него видеа (ключово на
  // телефон, където решетката показва само точки) + създаване от там.
  const [dayView, setDayView] = useState<string | null>(null);
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
    contentItems.filter((c) => matches(c) && c.date === date && pubOk(c));
  const backlog = contentItems.filter((c) => matches(c) && !c.date && pubOk(c));
  // Заглавие на чип: в общ изглед се показват и инициалите на клиента.
  const chipTitle = (it: { title: string; client: string }) => (allMode ? `${byId[it.client]?.initials || "?"} · ${it.title}` : it.title);
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
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-4)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--bm-space-3)", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: "var(--bm-space-2)", flexWrap: "wrap" }}>
          {CONTENT_TYPES.map((t) => (
            <span key={t.id} className="bm-badge" style={{ background: t.bg, color: t.fg }}>{t.label}</span>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--bm-space-3)", flexWrap: "wrap" }}>
          {!controlledClient && (
            <select className="bm-select" style={{ width: "auto", minWidth: 180 }} value={clientId} onChange={(e) => setClient(e.target.value)}>
              <option value="all">Всички клиенти</option>
              {visibleClients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
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

      {visibleClients.length > 0 ? (
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
            <button
              className="bm-btn bm-btn--secondary bm-btn--sm"
              disabled={!createClientId}
              title={createClientId ? "" : "Избери конкретен клиент от филтъра, за да добавяш видеа"}
              onClick={() => createClientId && openModal({ kind: "content", mode: "create", clientId: createClientId, date: "" })}
            ><Icon name="plus" size={16} /> Ново видео</button>
            <p className="bm-text-subtle" style={{ fontSize: "var(--bm-text-xs)", margin: 0 }}>{allMode ? "Общ изглед на всички клиенти — избери конкретен клиент, за да добавяш нови видеа." : "Завлачи видео върху ден от календара, за да го насрочиш."}</p>
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
                    title={allMode ? `${byId[it.client]?.name || ""} — ${it.title}` : it.title}
                    style={{ cursor: "grab", borderLeft: `3px solid ${m.fg}`, background: m.bg, color: m.fg, borderRadius: "var(--bm-radius-sm)", padding: "6px 8px", fontSize: "var(--bm-text-xs)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  >
                    {chipTitle(it)}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Calendar grid: full chips on desktop, compact dots on phones */}
          <div style={{ flex: "1 1 520px", minWidth: 0 }}>
          <div style={{ border: "1px solid var(--bm-border)", borderRadius: "var(--bm-radius-lg)", overflow: "hidden", background: "var(--bm-surface)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", background: "var(--bm-slate-900)" }}>
              {WEEKDAYS.map((w) => (
                <div key={w} style={{ padding: "var(--bm-space-2)", textAlign: "center", color: "#fff", fontSize: "var(--bm-text-xs)", fontWeight: 700, letterSpacing: "var(--bm-tracking-wide)" }}>{w}</div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
              {cells.map((cell, i) => {
                if (!cell) return <div key={i} className="cc-cell cc-cell--empty" />;
                const items = itemsFor(cell.date);
                const isToday = cell.date === todayIso;
                return (
                  <div
                    key={i}
                    className={"cc-cell" + (isToday ? " cc-cell--today" : "")}
                    onClick={() => {
                      if (items.length) setDayView(cell.date);
                      else if (createClientId) openModal({ kind: "content", mode: "create", clientId: createClientId, date: cell.date });
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => onDropDay(cell.date)}
                  >
                    <div style={{ fontSize: "var(--bm-text-xs)", fontWeight: 600, color: isToday ? "var(--bm-brand-700)" : "var(--bm-text-subtle)", textAlign: "right" }}>{cell.day}</div>
                    {items.map((it) => {
                      const m = contentTypeMeta(it.type);
                      const total = it.stages?.length || 0;
                      const done = it.stages?.filter((s) => s.status === "done").length || 0;
                      return (
                        <div
                          key={it.id}
                          className="cc-ev"
                          draggable
                          onDragStart={(e) => { e.stopPropagation(); setDragId(it.id); }}
                          onClick={(e) => { e.stopPropagation(); openModal({ kind: "content", mode: "edit", item: it }); }}
                          style={{ textAlign: "left", borderRadius: "var(--bm-radius-sm)", padding: "3px 6px", background: m.bg, color: m.fg, fontSize: "var(--bm-text-xs)", fontWeight: 600, cursor: "grab", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                          title={allMode ? `${byId[it.client]?.name || ""} — ${it.title}` : it.title}
                        >
                          {it.published ? "✓ " : ""}{chipTitle(it)}{total ? ` · ${done}/${total}` : ""}
                        </div>
                      );
                    })}
                    {items.length > 0 && (
                      <div className="cc-dots">
                        {items.map((it) => <span key={it.id} style={{ width: 6, height: 6, borderRadius: "50%", background: contentTypeMeta(it.type).fg }} />)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          </div>

          {/* Agenda (mobile): титлите по дни под компактната решетка */}
          <div className="cc-agenda" style={{ flex: "1 1 100%", minWidth: 0, width: "100%", flexDirection: "column", gap: "var(--bm-space-4)" }}>
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
                      {it.published ? "✓ " : ""}{chipTitle(it)}{total ? ` · ${done}/${total}` : ""}
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

      {/* Преглед на ден: списък с насрочените видеа + създаване на ново */}
      {dayView && (
        <div className="bm-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setDayView(null); }}>
          <div className="bm-modal">
            <div className="bm-modal__header">
              <h3>{parseInt(dayView.slice(8, 10), 10)} {MONTHS[parseInt(dayView.slice(5, 7), 10) - 1]} — видеа за деня</h3>
              <button className="bm-btn bm-btn--ghost bm-btn--icon" onClick={() => setDayView(null)} aria-label="Затвори"><Icon name="close" /></button>
            </div>
            <div className="bm-modal__body" style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-2)" }}>
              {itemsFor(dayView).length === 0 && <p className="bm-text-subtle" style={{ fontSize: "var(--bm-text-sm)", margin: 0 }}>Няма насрочени видеа за този ден.</p>}
              {itemsFor(dayView).map((it) => {
                const m = contentTypeMeta(it.type);
                const total = it.stages?.length || 0;
                const done = it.stages?.filter((s) => s.status === "done").length || 0;
                return (
                  <div
                    key={it.id}
                    onClick={() => { setDayView(null); openModal({ kind: "content", mode: "edit", item: it }); }}
                    style={{ borderLeft: `3px solid ${m.fg}`, background: m.bg, color: m.fg, borderRadius: "var(--bm-radius-sm)", padding: "10px 12px", fontSize: "var(--bm-text-sm)", fontWeight: 600, cursor: "pointer" }}
                  >
                    {it.published ? "✓ " : ""}{chipTitle(it)}
                    <div style={{ fontSize: "var(--bm-text-xs)", fontWeight: 500, opacity: .85, marginTop: 2 }}>{m.label}{total ? ` · етапи ${done}/${total}` : ""}{allMode ? ` · ${byId[it.client]?.name || ""}` : ""}</div>
                  </div>
                );
              })}
            </div>
            <div className="bm-modal__footer">
              <button className="bm-btn bm-btn--secondary" onClick={() => setDayView(null)}>Затвори</button>
              <button
                className="bm-btn bm-btn--primary"
                disabled={!createClientId}
                title={createClientId ? "" : "Избери конкретен клиент от филтъра, за да добавяш видеа"}
                onClick={() => { if (createClientId) { const d = dayView; setDayView(null); openModal({ kind: "content", mode: "create", clientId: createClientId, date: d }); } }}
              >+ Ново видео за деня</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
