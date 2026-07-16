"use client";

import { useState } from "react";
import { useStore } from "@/components/store";
import { Icon } from "@/components/Icon";
import { clientsById, invStatusMeta, fmtK, fmtFull, monthStart, type InvStatus } from "@/lib/data";

function Kpi({ label, value, color, deltaCls, delta }: { label: string; value: React.ReactNode; color?: string; deltaCls: string; delta: string }) {
  return (
    <div className="bm-card bm-stat">
      <div className="bm-stat__label">{label}</div>
      <div className="bm-stat__value" style={color ? { color } : undefined}>{value}</div>
      <div className={"bm-stat__delta " + deltaCls}>{delta}</div>
    </div>
  );
}

const TABS: [string, string][] = [["all", "Всички"], ["paid", "Платени"], ["pending", "Чакащи"], ["overdue", "Просрочени"], ["draft", "Чернови"]];

export default function InvoicesPage() {
  const { clients, invoices, markPaid, deleteInvoice, openModal, currentUser } = useStore();
  const [filter, setFilter] = useState("all");
  const byId = clientsById(clients);

  const outstanding = invoices.filter((i) => i.status === "pending" || i.status === "overdue");
  const overdue = invoices.filter((i) => i.status === "overdue");
  const drafts = invoices.filter((i) => i.status === "draft");
  const filtered = filter === "all" ? invoices : invoices.filter((i) => i.status === (filter as InvStatus));
  const sum = (a: typeof invoices) => a.reduce((x, b) => x + b.amount, 0);

  // „Платени този месец“ смята само фактурите от текущия месец; делтата е
  // реално сравнение с предходния, не декоративен процент.
  const ms = monthStart();
  const prevMs = (() => { const d = new Date(ms); d.setMonth(d.getMonth() - 1); return d.getTime(); })();
  const ts = (i: { created_at?: string }) => (i.created_at ? new Date(i.created_at).getTime() : 0);
  const paidThisMonth = invoices.filter((i) => i.status === "paid" && ts(i) >= ms);
  const paidPrevMonth = invoices.filter((i) => i.status === "paid" && ts(i) >= prevMs && ts(i) < ms);
  const prevSum = sum(paidPrevMonth);
  const curSum = sum(paidThisMonth);
  const paidDelta = prevSum > 0
    ? { cls: curSum >= prevSum ? "bm-stat__delta--up" : "bm-stat__delta--down", text: `${curSum >= prevSum ? "▲" : "▼"} ${Math.abs(Math.round(((curSum - prevSum) / prevSum) * 100))}% спрямо ${fmtK(prevSum)} м.м.` }
    : { cls: "bm-text-subtle", text: `${paidThisMonth.length} ${paidThisMonth.length === 1 ? "фактура" : "фактури"}` };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-5)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--bm-space-4)", flexWrap: "wrap" }}>
        <div>
          <h1>Фактури</h1>
          <p className="bm-text-muted" style={{ margin: "4px 0 0" }}>Проследявай фактурирането и паричния поток по клиенти.</p>
        </div>
        <button className="bm-btn bm-btn--primary" onClick={() => openModal({ kind: "invoice", mode: "create" })}><Icon name="plus" /> Нова фактура</button>
      </div>

      <section className="bm-stats">
        <Kpi label="Несъбрани" value={fmtK(sum(outstanding))} deltaCls="bm-text-subtle" delta={`${outstanding.length} отворени фактури`} />
        <Kpi label="Просрочени" value={fmtK(sum(overdue))} color="var(--bm-danger-600)" deltaCls="bm-stat__delta--down" delta={`${overdue.length} изискват внимание`} />
        <Kpi label="Платени този месец" value={fmtK(curSum)} color="var(--bm-success-600)" deltaCls={paidDelta.cls} delta={paidDelta.text} />
        <Kpi label="Чернови" value={drafts.length} deltaCls="bm-text-subtle" delta="Готови за изпращане" />
      </section>

      <div className="bm-card">
        <div className="bm-card__header" style={{ paddingBottom: 0, borderBottom: "none" }}>
          <div className="bm-tabs" style={{ border: "none" }}>
            {TABS.map(([k, l]) => (
              <button key={k} role="tab" className="bm-tab" aria-selected={filter === k} onClick={() => setFilter(k)}>{l}</button>
            ))}
          </div>
        </div>
        {/* Телефон: картов списък вместо широката таблица */}
        <div className="bm-show-mobile" style={{ padding: "var(--bm-space-3)", display: "flex", flexDirection: "column", gap: "var(--bm-space-3)" }}>
          {filtered.length === 0 && <p className="bm-text-subtle" style={{ fontSize: "var(--bm-text-sm)", margin: 0 }}>Няма фактури в тази категория.</p>}
          {filtered.map((iv) => {
            const m = invStatusMeta(iv.status);
            const c = byId[iv.client];
            const canPay = iv.status !== "paid" && iv.status !== "draft";
            return (
              <div key={iv.id} style={{ border: "1px solid var(--bm-border)", borderRadius: "var(--bm-radius-md)", padding: "var(--bm-space-3)", display: "flex", flexDirection: "column", gap: "var(--bm-space-2)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: "var(--bm-text-sm)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c?.name || iv.client}</span>
                  <span className={"bm-badge " + m.cls}>{m.label}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span className="bm-text-subtle" style={{ fontSize: "var(--bm-text-xs)", fontFamily: "var(--bm-font-mono)" }}>{iv.id} · {iv.issued}{iv.due ? ` → ${iv.due}` : ""}</span>
                  <span style={{ fontWeight: 700 }}>{fmtFull(iv.amount)}</span>
                </div>
                <div style={{ display: "flex", gap: "var(--bm-space-2)", flexWrap: "wrap" }}>
                  {canPay && <button className="bm-btn bm-btn--secondary bm-btn--sm" onClick={() => markPaid(iv.id)}>Платена</button>}
                  {iv.status === "paid" && <span style={{ fontSize: "var(--bm-text-xs)", color: "var(--bm-success-600)", fontWeight: 600, alignSelf: "center" }}>✓ Уредена</span>}
                  <button className="bm-btn bm-btn--ghost bm-btn--sm" onClick={() => openModal({ kind: "invoice", mode: "edit", invoice: iv })}>Редакция</button>
                  {currentUser.isAdmin && (
                    <button className="bm-btn bm-btn--ghost bm-btn--sm" onClick={() => openModal({ kind: "confirm", title: "Изтриване на фактура?", message: `Изтрий ${iv.id}? Действието е необратимо.`, confirmLabel: "Изтрий", onConfirm: () => deleteInvoice(iv.id) })}>Изтрий</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="bm-table-wrap bm-hide-mobile" style={{ border: "none", borderRadius: 0 }}>
          <table className="bm-table">
            <thead><tr><th>Фактура</th><th>Клиент</th><th>Статус</th><th className="bm-table__num">Сума</th><th>Издадена</th><th>Падеж</th><th /></tr></thead>
            <tbody>
              {filtered.map((iv) => {
                const m = invStatusMeta(iv.status);
                const c = byId[iv.client];
                const canPay = iv.status !== "paid" && iv.status !== "draft";
                return (
                  <tr key={iv.id}>
                    <td style={{ fontFamily: "var(--bm-font-mono)", fontSize: "var(--bm-text-xs)" }}>{iv.id}</td>
                    <td><div style={{ display: "flex", alignItems: "center", gap: "var(--bm-space-2)" }}><span className="bm-avatar bm-avatar--sm" style={{ width: 24, height: 24, fontSize: 10 }}>{c?.initials || "—"}</span> {c?.name || iv.client}</div></td>
                    <td><span className={"bm-badge " + m.cls}>{m.label}</span></td>
                    <td className="bm-table__num">{fmtFull(iv.amount)}</td>
                    <td style={{ color: "var(--bm-text-subtle)" }}>{iv.issued}</td>
                    <td style={{ color: "var(--bm-text-subtle)" }}>{iv.due}</td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "flex", gap: "var(--bm-space-2)", justifyContent: "flex-end" }}>
                        {canPay && <button className="bm-btn bm-btn--secondary bm-btn--sm" onClick={() => markPaid(iv.id)}>Маркирай платена</button>}
                        {iv.status === "paid" && <span style={{ fontSize: "var(--bm-text-xs)", color: "var(--bm-success-600)", fontWeight: 600, alignSelf: "center" }}>✓ Уредена</span>}
                        <button className="bm-btn bm-btn--ghost bm-btn--sm" onClick={() => openModal({ kind: "invoice", mode: "edit", invoice: iv })}>Редакция</button>
                        {currentUser.isAdmin && (
                          <button
                            className="bm-btn bm-btn--ghost bm-btn--sm"
                            onClick={() =>
                              openModal({
                                kind: "confirm",
                                title: "Delete invoice?",
                                message: `Delete ${iv.id}? This can't be undone.`,
                                confirmLabel: "Delete",
                                onConfirm: () => deleteInvoice(iv.id),
                              })
                            }
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
