"use client";

// „Събиране по месеци“ — за избрания месец: кой клиент колко е платил и колко
// още дължи, за да се запълни месецът. Очакваното е месечната такса на клиента
// (или корекция за конкретния месец); платеното е сборът на платените фактури,
// записани ЗА този месец (invoices.period), независимо кога са дошли парите.
// Сметката е в lib/data.ts → monthCollections (огледало на bm_month_collections).

import { useMemo, useState } from "react";
import { useStore } from "@/components/store";
import { Money } from "@/components/MoneyLock";
import { fmtFull, fmtDay, invStatusMeta, monthCollections, monthKey, monthLabel, shiftMonthKey, todayISO, type CollectionRow } from "@/lib/data";

function Kpi({ label, value, color, hint }: { label: string; value: React.ReactNode; color?: string; hint: string }) {
  return (
    <div className="bm-card bm-stat">
      <div className="bm-stat__label">{label}</div>
      <div className="bm-stat__value" style={color ? { color } : undefined}>{value}</div>
      <div className="bm-stat__delta bm-text-subtle">{hint}</div>
    </div>
  );
}

const stateOf = (r: CollectionRow) =>
  r.expected > 0 && r.remaining === 0 ? { cls: "bm-badge--success", label: r.overpaid > 0 ? "Надплатил" : "Платил" }
    : r.paid > 0 ? { cls: "bm-badge--warning", label: "Частично" }
    : r.expected > 0 ? { cls: "bm-badge--danger", label: "Нищо" }
    : { cls: "bm-badge--neutral", label: "Без такса" };

export function MonthCollections() {
  const { clients, invoices, monthTargets, setMonthTarget, openModal } = useStore();
  const [month, setMonth] = useState(monthKey());
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ amount: "", note: "" });

  const rows = useMemo(() => monthCollections(clients, invoices, monthTargets, month), [clients, invoices, monthTargets, month]);
  const expected = rows.reduce((a, r) => a + r.expected, 0);
  const paid = rows.reduce((a, r) => a + r.paid, 0);
  const remaining = rows.reduce((a, r) => a + r.remaining, 0);
  const debtors = rows.filter((r) => r.remaining > 0);
  const pct = expected > 0 ? Math.min(100, Math.round((Math.min(paid, expected) / expected) * 100)) : 0;
  const isCurrent = month === monthKey();

  const startEdit = (r: CollectionRow) => {
    setEditing(r.client.id);
    setDraft({ amount: String(r.expected), note: r.note });
  };
  const saveEdit = (r: CollectionRow) => {
    const n = parseFloat(draft.amount.replace(",", "."));
    if (!Number.isNaN(n) && n >= 0) setMonthTarget(r.client.id, month, n, draft.note);
    setEditing(null);
  };
  // „+ Плащане“: готова платена фактура за остатъка, записана към този месец.
  const addPayment = (r: CollectionRow) =>
    openModal({ kind: "invoice", mode: "create", clientId: r.client.id, prefill: { amount: r.remaining || 0, status: "paid", period: month, issued: todayISO(), paid_at: todayISO() } });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-5)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--bm-space-3)", flexWrap: "wrap" }}>
        <button className="bm-btn bm-btn--secondary bm-btn--sm" aria-label="Предишен месец" onClick={() => setMonth((m) => shiftMonthKey(m, -1))}>‹</button>
        <span style={{ fontWeight: 700, minWidth: 130, textAlign: "center", textTransform: "capitalize" }}>{monthLabel(month)}</span>
        <button className="bm-btn bm-btn--secondary bm-btn--sm" aria-label="Следващ месец" onClick={() => setMonth((m) => shiftMonthKey(m, 1))}>›</button>
        {!isCurrent && <button className="bm-btn bm-btn--ghost bm-btn--sm" onClick={() => setMonth(monthKey())}>Този месец</button>}
      </div>

      <section className="bm-stats">
        <Kpi label="Очаквано за месеца" value={<Money>{fmtFull(expected)}</Money>} hint={`${rows.filter((r) => r.expected > 0).length} клиента`} />
        <Kpi label="Събрано" value={<Money>{fmtFull(paid)}</Money>} color="var(--bm-success-600)" hint={`${pct}% от очакваното`} />
        <Kpi label="Остава да се събере" value={<Money>{fmtFull(remaining)}</Money>} color={remaining > 0 ? "var(--bm-danger-600)" : undefined} hint={debtors.length ? `от ${debtors.length} ${debtors.length === 1 ? "клиент" : "клиента"}` : "всичко е събрано"} />
      </section>

      <div className="bm-card">
        <div className="bm-card__header"><h3 style={{ margin: 0 }}>Кой колко дължи за {monthLabel(month)}</h3></div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {rows.length === 0 && <p className="bm-text-subtle" style={{ fontSize: "var(--bm-text-sm)", margin: 0, padding: "var(--bm-space-4)" }}>Няма очаквани плащания за този месец. Месечната такса се задава в картата на клиента.</p>}
          {rows.map((r) => {
            const st = stateOf(r);
            const p = r.expected > 0 ? Math.min(100, Math.round((r.paid / r.expected) * 100)) : r.paid > 0 ? 100 : 0;
            const isOpen = open === r.client.id;
            return (
              <div key={r.client.id} style={{ borderTop: "1px solid var(--bm-border)", padding: "var(--bm-space-3) var(--bm-space-4)", display: "flex", flexDirection: "column", gap: "var(--bm-space-2)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--bm-space-3)", flexWrap: "wrap" }}>
                  <button type="button" onClick={() => setOpen(isOpen ? null : r.client.id)} aria-expanded={isOpen} style={{ flex: "1 1 180px", minWidth: 0, textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer", color: "inherit", font: "inherit" }}>
                    <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{isOpen ? "▾" : "▸"} {r.client.name}</div>
                    <div className="bm-text-subtle" style={{ fontSize: "var(--bm-text-xs)" }}>
                      платил <Money>{fmtFull(r.paid)}</Money> от <Money>{fmtFull(r.expected)}</Money>
                      {r.hasOverride ? " · коригирано" : ""}{r.invoices.length ? ` · ${r.invoices.length} ${r.invoices.length === 1 ? "запис" : "записа"}` : ""}
                    </div>
                  </button>
                  <div style={{ flex: "0 0 auto", textAlign: "right", minWidth: 96 }}>
                    <div style={{ fontWeight: 800, fontSize: "var(--bm-text-lg)", color: r.remaining > 0 ? "var(--bm-danger-600)" : "var(--bm-success-600)" }}>
                      <Money>{r.remaining > 0 ? fmtFull(r.remaining) : r.overpaid > 0 ? "+" + fmtFull(r.overpaid) : "✓"}</Money>
                    </div>
                    <div className="bm-text-subtle" style={{ fontSize: "var(--bm-text-xs)" }}>{r.remaining > 0 ? "остава" : r.overpaid > 0 ? "над очакваното" : "изплатено"}</div>
                  </div>
                  <span className={"bm-badge " + st.cls} style={{ flex: "0 0 auto" }}>{st.label}</span>
                  <button className="bm-btn bm-btn--primary bm-btn--sm" style={{ flex: "0 0 auto" }} onClick={() => addPayment(r)}>+ Плащане</button>
                </div>
                <div style={{ height: 6, background: "var(--bm-surface-2)", borderRadius: 99, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: p + "%", borderRadius: "inherit", background: p >= 100 ? "var(--bm-success-500)" : "var(--bm-brand-500)" }} />
                </div>

                {isOpen && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-3)", background: "var(--bm-surface-2)", borderRadius: "var(--bm-radius-md)", padding: "var(--bm-space-3)" }}>
                    {editing === r.client.id ? (
                      <div style={{ display: "flex", gap: "var(--bm-space-2)", flexWrap: "wrap", alignItems: "flex-end" }}>
                        <label className="bm-field" style={{ flex: "0 0 130px" }}><span className="bm-label">Очаквано (EUR)</span><input className="bm-input" type="number" min={0} step="0.01" autoFocus value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} /></label>
                        <label className="bm-field" style={{ flex: "1 1 180px" }}><span className="bm-label">Бележка (по избор)</span><input className="bm-input" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} placeholder="напр. +2 допълнителни видеа" /></label>
                        <button className="bm-btn bm-btn--primary bm-btn--sm" onClick={() => saveEdit(r)}>Запази</button>
                        <button className="bm-btn bm-btn--ghost bm-btn--sm" onClick={() => setEditing(null)}>Отказ</button>
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: "var(--bm-space-2)", flexWrap: "wrap", alignItems: "center", fontSize: "var(--bm-text-sm)" }}>
                        <span>Очаквано за месеца: <b><Money>{fmtFull(r.expected)}</Money></b>{r.hasOverride ? <> (такса <Money>{fmtFull(r.client.mrr || 0)}</Money>)</> : " (месечната такса)"}{r.note ? ` — ${r.note}` : ""}</span>
                        <button className="bm-btn bm-btn--secondary bm-btn--sm" onClick={() => startEdit(r)}>Коригирай за този месец</button>
                        {r.hasOverride && <button className="bm-btn bm-btn--ghost bm-btn--sm" onClick={() => setMonthTarget(r.client.id, month, null)}>Върни таксата</button>}
                      </div>
                    )}
                    {r.invoices.length === 0 ? (
                      <span className="bm-text-subtle" style={{ fontSize: "var(--bm-text-sm)" }}>Няма записани плащания за този месец.</span>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {r.invoices.map((iv) => {
                          const m = invStatusMeta(iv.status);
                          return (
                            <button key={iv.id} type="button" onClick={() => openModal({ kind: "invoice", mode: "edit", invoice: iv })} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--bm-space-2)", flexWrap: "wrap", background: "var(--bm-surface)", border: "1px solid var(--bm-border)", borderRadius: "var(--bm-radius-md)", padding: "8px 10px", cursor: "pointer", font: "inherit", color: "inherit", textAlign: "left" }}>
                              <span style={{ fontSize: "var(--bm-text-sm)" }}><span className="bm-text-subtle" style={{ fontFamily: "var(--bm-font-mono)", fontSize: "var(--bm-text-xs)" }}>{iv.id}</span> · {iv.status === "paid" && iv.paid_at ? "платена " + fmtDay(iv.paid_at) : "издадена " + fmtDay(iv.issued)}</span>
                              <span style={{ display: "flex", alignItems: "center", gap: 8 }}><b><Money>{fmtFull(iv.amount)}</Money></b><span className={"bm-badge " + m.cls}>{m.label}</span></span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
