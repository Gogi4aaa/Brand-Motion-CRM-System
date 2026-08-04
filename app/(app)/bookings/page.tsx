"use client";

// Снимачни дни (admin): клиентите заявяват дати от портала → тук се одобряват.
// Месечен календар с всички резервации + опашка за чакащите + .ics абонамент за
// личния календар. Заявките идват live през bookings-sync канала в store-а.

import { useState } from "react";
import { useStore } from "@/components/store";
import { Icon } from "@/components/Icon";
import { clientsById, bookingTimeLabel, type Client } from "@/lib/data";

const WEEKDAYS = ["ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ", "НД"];
const MONTHS = ["Януари", "Февруари", "Март", "Април", "Май", "Юни", "Юли", "Август", "Септември", "Октомври", "Ноември", "Декември"];
const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

export default function BookingsPage() {
  const { bookings, clients, addBooking, deleteBooking, approveBooking, declineBooking, getBookingFeedUrl, openModal } = useStore();
  const byId = clientsById(clients);
  const today = new Date();
  const [view, setView] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [feedUrl, setFeedUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [adding, setAdding] = useState<string | null>(null); // предварително избраната дата (или "")

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
        <div style={{ display: "flex", gap: "var(--bm-space-2)", flexWrap: "wrap" }}>
          <button className="bm-btn bm-btn--primary" onClick={() => setAdding("")}><Icon name="plus" size={16} /> Добави снимачен ден</button>
          <button className="bm-btn bm-btn--secondary" onClick={showFeed}><Icon name="calendar" size={16} /> Календар за телефона (.ics)</button>
        </div>
      </div>

      {adding !== null && (
        <AddBookingModal
          clients={clients}
          date={adding}
          onClose={() => setAdding(null)}
          onSave={(clientId, date, start, end, note) => { addBooking(clientId, date, start, end, note); setAdding(null); }}
        />
      )}

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
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
                  <button className="bm-btn bm-btn--ghost bm-btn--sm" style={{ padding: "0 4px", minHeight: 0, opacity: 0.6 }} title="Добави снимачен ден на тази дата" onClick={() => setAdding(date)}><Icon name="plus" size={12} /></button>
                  <div style={{ fontSize: "var(--bm-text-xs)", fontWeight: 600, color: isToday ? "var(--bm-brand-700)" : "var(--bm-text-subtle)" }}>{Number(date.slice(8, 10))}</div>
                </div>
                {items.map((b) => {
                  const approved = b.status === "approved";
                  return (
                    <div key={b.id} title={`${label(b.client_id)}${bookingTimeLabel(b) ? " · " + bookingTimeLabel(b) : ""}${b.note ? " · " + b.note : ""}`}
                      style={{ display: "flex", alignItems: "center", gap: 4, textAlign: "left", borderRadius: "var(--bm-radius-sm)", padding: "3px 6px", fontSize: "var(--bm-text-xs)", fontWeight: 600, overflow: "hidden",
                        background: approved ? "var(--bm-success-50)" : "var(--bm-warning-50)", color: approved ? "var(--bm-success-700)" : "var(--bm-warning-700)", borderLeft: `3px solid ${approved ? "var(--bm-success-500)" : "var(--bm-warning-500)"}` }}>
                      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{bookingTimeLabel(b) ? bookingTimeLabel(b) + " " : ""}{label(b.client_id)}</span>
                      <button aria-label="Изтрий снимачния ден" title="Изтрий" style={{ background: "none", border: 0, cursor: "pointer", color: "inherit", opacity: 0.6, padding: 0, lineHeight: 1 }}
                        onClick={() => openModal({ kind: "confirm", title: "Изтриване на снимачен ден?", message: `${label(b.client_id)} · ${b.date}${bookingTimeLabel(b) ? " · " + bookingTimeLabel(b) : ""}. Действието е необратимо.`, confirmLabel: "Изтрий", onConfirm: () => deleteBooking(b.id) })}>
                        <Icon name="close" size={10} />
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      <p className="bm-text-subtle" style={{ fontSize: "var(--bm-text-xs)", margin: 0 }}>Зелено = одобрено · жълто = чака одобрение. Един ден може да събира няколко снимания. Плюсът в клетка добавя ден на тази дата.</p>
    </div>
  );
}

// Ръчно добавяне от админа — за клиенти, които не си заявяват деня сами.
// Записва се веднага като одобрен, без лимита от 3 активни (той е за портала).
function AddBookingModal({ clients, date, onClose, onSave }: {
  clients: Client[];
  date: string;
  onClose: () => void;
  onSave: (clientId: string, date: string, start: string, end: string, note: string) => void;
}) {
  const sorted = [...clients].sort((a, b) => a.name.localeCompare(b.name, "bg"));
  const [clientId, setClientId] = useState(sorted[0]?.id || "");
  const [day, setDay] = useState(date);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");

  const save = () => {
    if (!clientId) return setErr("Избери клиент.");
    if (!day) return setErr("Избери дата.");
    if (start && end && end <= start) return setErr("Краят трябва да е след началото.");
    onSave(clientId, day, start, end, note.trim());
  };

  return (
    <div className="bm-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bm-modal">
        <div className="bm-modal__header">
          <h3>Нов снимачен ден</h3>
          <button className="bm-btn bm-btn--ghost bm-btn--icon" onClick={onClose} aria-label="Затвори"><Icon name="close" /></button>
        </div>
        <div className="bm-modal__body" style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-3)" }}>
          <div className="bm-field">
            <label className="bm-label">Клиент</label>
            <select className="bm-select" value={clientId} onChange={(e) => setClientId(e.target.value)}>
              {sorted.length === 0 && <option value="">Няма клиенти</option>}
              {sorted.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="bm-field">
            <label className="bm-label">Дата</label>
            <input className="bm-input" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
          </div>
          <div style={{ display: "flex", gap: "var(--bm-space-3)" }}>
            <div className="bm-field" style={{ flex: 1 }}>
              <label className="bm-label">От (по избор)</label>
              <input className="bm-input" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="bm-field" style={{ flex: 1 }}>
              <label className="bm-label">До (по избор)</label>
              <input className="bm-input" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <div className="bm-field">
            <label className="bm-label">Бележка</label>
            <input className="bm-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Локация, кой снима, реквизит…" />
          </div>
          {err && <span className="bm-error">{err}</span>}
          <p className="bm-text-subtle" style={{ fontSize: "var(--bm-text-xs)", margin: 0 }}>Добавеният ръчно ден влиза директно като одобрен — клиентът го вижда в портала си и се появява в .ics календара.</p>
        </div>
        <div className="bm-modal__footer">
          <button className="bm-btn bm-btn--secondary" onClick={onClose}>Отказ</button>
          <button className="bm-btn bm-btn--primary" onClick={save}>Запази</button>
        </div>
      </div>
    </div>
  );
}
