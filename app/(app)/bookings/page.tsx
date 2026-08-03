"use client";

// Снимачни дни (admin): клиентите заявяват дати от портала → тук се одобряват.
// Месечен календар с всички резервации + опашка за чакащите + .ics абонамент за
// личния календар. Заявките идват live през bookings-sync канала в store-а.

import { useState } from "react";
import { useStore } from "@/components/store";
import { Icon } from "@/components/Icon";
import { clientsById, bookingTimeLabel } from "@/lib/data";

const WEEKDAYS = ["ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ", "НД"];
const MONTHS = ["Януари", "Февруари", "Март", "Април", "Май", "Юни", "Юли", "Август", "Септември", "Октомври", "Ноември", "Декември"];
const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

export default function BookingsPage() {
  const { bookings, clients, approveBooking, declineBooking, getBookingFeedUrl } = useStore();
  const byId = clientsById(clients);
  const today = new Date();
  const [view, setView] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [feedUrl, setFeedUrl] = useState("");
  const [copied, setCopied] = useState(false);

  const active = bookings.filter((b) => b.status !== "declined");
  const pending = bookings.filter((b) => b.status === "pending").sort((a, b) => (a.date < b.date ? -1 : 1));
  const byDate = new Map<string, typeof bookings>();
  for (const b of active) byDate.set(b.date, [...(byDate.get(b.date) || []), b]);

  // 6x7 месечна решетка (понеделник-старт).
  const first = new Date(view.y, view.m, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (string | null)[] = [...Array(startOffset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => iso(view.y, view.m, i + 1))];
  while (cells.length % 7 !== 0) cells.push(null);
  const todayIso = iso(today.getFullYear(), today.getMonth(), today.getDate());

  const go = (delta: number) => { const m = view.m + delta; setView({ y: view.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 }); };
  const label = (id: string) => byId[id]?.name || id;
  const showFeed = async () => {
    if (feedUrl) return;
    const url = await getBookingFeedUrl();
    if (url) { setFeedUrl(url); try { await navigator.clipboard.writeText(url); setCopied(true); } catch { /* ignore */ } }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-5)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--bm-space-4)", flexWrap: "wrap" }}>
        <div>
          <h1>Снимачни дни</h1>
          <p className="bm-text-muted" style={{ margin: "4px 0 0" }}>Клиентите заявяват дати от портала си · одобряваш ги тук · виждаш заетите дни на всички.</p>
        </div>
        <button className="bm-btn bm-btn--secondary" onClick={showFeed}><Icon name="calendar" size={16} /> Календар за телефона (.ics)</button>
      </div>

      {feedUrl && (
        <div className="bm-card"><div className="bm-card__body" style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-2)" }}>
          <div style={{ fontWeight: 700, fontSize: "var(--bm-text-sm)" }}>Абонирай личния си календар {copied ? "· линкът е копиран" : ""}</div>
          <div style={{ display: "flex", gap: "var(--bm-space-2)" }}>
            <input className="bm-input" readOnly value={feedUrl} onFocus={(e) => e.currentTarget.select()} />
            <button className="bm-btn bm-btn--secondary" onClick={async () => { try { await navigator.clipboard.writeText(feedUrl); setCopied(true); } catch { /* ignore */ } }}>{copied ? "Копирано" : "Копирай"}</button>
          </div>
          <p className="bm-text-subtle" style={{ fontSize: "var(--bm-text-xs)", margin: 0 }}>Google Calendar → „Други календари“ → „От URL“ → постави линка. Одобрените снимачни дни се появяват и се обновяват сами.</p>
        </div></div>
      )}

      {/* Опашка за одобрение */}
      <div className="bm-card">
        <div className="bm-card__header"><h3>Чакащи одобрение</h3><span className="bm-badge bm-badge--warning">{pending.length}</span></div>
        <div className="bm-card__body" style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-3)" }}>
          {pending.length === 0 && <p className="bm-text-subtle" style={{ fontSize: "var(--bm-text-sm)", margin: 0 }}>Няма чакащи заявки.</p>}
          {pending.map((b) => (
            <div key={b.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--bm-space-3)", flexWrap: "wrap", borderBottom: "1px solid var(--bm-border)", paddingBottom: "var(--bm-space-3)" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: "var(--bm-text-sm)" }}>{label(b.client_id)}</div>
                <div className="bm-text-subtle" style={{ fontSize: "var(--bm-text-xs)" }}>{new Date(b.date + "T00:00:00").getDate()} {MONTHS[new Date(b.date + "T00:00:00").getMonth()]} {b.date.slice(0, 4)}{bookingTimeLabel(b) ? ` · ${bookingTimeLabel(b)}` : ""}{b.note ? ` · ${b.note}` : ""}</div>
              </div>
              <div style={{ display: "flex", gap: "var(--bm-space-2)" }}>
                <button className="bm-btn bm-btn--primary bm-btn--sm" onClick={() => approveBooking(b.id)}>Одобри</button>
                <button className="bm-btn bm-btn--ghost bm-btn--sm" onClick={() => declineBooking(b.id)}>Откажи</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Месечен календар */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--bm-space-3)" }}>
        <h2 style={{ margin: 0 }}>Календар</h2>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--bm-space-2)" }}>
          <button className="bm-btn bm-btn--ghost bm-btn--icon" onClick={() => go(-1)} aria-label="Предишен месец"><Icon name="chevronLeft" /></button>
          <span style={{ fontWeight: 600, minWidth: 130, textAlign: "center" }}>{MONTHS[view.m]} {view.y}</span>
          <button className="bm-btn bm-btn--ghost bm-btn--icon" onClick={() => go(1)} aria-label="Следващ месец"><Icon name="chevronRight" /></button>
        </div>
      </div>

      <div style={{ border: "1px solid var(--bm-border)", borderRadius: "var(--bm-radius-lg)", overflow: "hidden", background: "var(--bm-surface)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", background: "var(--bm-slate-900)" }}>
          {WEEKDAYS.map((w) => <div key={w} style={{ padding: "var(--bm-space-2)", textAlign: "center", color: "#fff", fontSize: "var(--bm-text-xs)", fontWeight: 700 }}>{w}</div>)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
          {cells.map((date, i) => {
            if (!date) return <div key={i} className="cc-cell cc-cell--empty" />;
            const items = byDate.get(date) || [];
            const isToday = date === todayIso;
            return (
              <div key={i} className={"cc-cell" + (isToday ? " cc-cell--today" : "")}>
                <div style={{ fontSize: "var(--bm-text-xs)", fontWeight: 600, color: isToday ? "var(--bm-brand-700)" : "var(--bm-text-subtle)", textAlign: "right" }}>{Number(date.slice(8, 10))}</div>
                {items.map((b) => {
                  const approved = b.status === "approved";
                  return (
                    <div key={b.id} title={`${label(b.client_id)}${bookingTimeLabel(b) ? " · " + bookingTimeLabel(b) : ""}${b.note ? " · " + b.note : ""}`}
                      style={{ textAlign: "left", borderRadius: "var(--bm-radius-sm)", padding: "3px 6px", fontSize: "var(--bm-text-xs)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        background: approved ? "var(--bm-success-50)" : "var(--bm-warning-50)", color: approved ? "var(--bm-success-700)" : "var(--bm-warning-700)", borderLeft: `3px solid ${approved ? "var(--bm-success-500)" : "var(--bm-warning-500)"}` }}>
                      {bookingTimeLabel(b) ? bookingTimeLabel(b) + " " : ""}{label(b.client_id)}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      <p className="bm-text-subtle" style={{ fontSize: "var(--bm-text-xs)", margin: 0 }}>Зелено = одобрено · жълто = чака одобрение. Един ден може да събира няколко снимания.</p>
    </div>
  );
}
