"use client";

// Възнаграждения (admin): кой колко пари трябва да получи (дължимо сега + за
// избрания период), колко видеа е свършил всеки и с каква роля по всяко видео.
// Плюс контекст за чистата печалба (събрано − изплатено).

import { useState } from "react";
import { useStore } from "@/components/store";
import {
  fmtFull, payoutFor, inCurrentMonth, stageMeta, clientsById,
  collectedRevenue, workerPaidCost,
} from "@/lib/data";
import { Money } from "@/components/MoneyLock";

export default function PayoutsPage() {
  const { tasks, team, contentItems, clients, invoices, markWorkerPaid, setTaskPay, currentUser } = useStore();
  const [period, setPeriod] = useState<"month" | "all">("month");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const byId = clientsById(clients);
  const itemsById = Object.fromEntries(contentItems.map((c) => [c.id, c]));
  const inPeriod = (iso?: string | null) => period === "all" || inCurrentMonth(iso);

  // Чиста печалба за периода.
  const rev = collectedRevenue(invoices, period === "month");
  const cost = workerPaidCost(tasks, period === "month");
  const net = rev - cost;

  const toggle = (ini: string) => setOpen((s) => { const n = new Set(s); if (n.has(ini)) n.delete(ini); else n.add(ini); return n; });

  // Админ вижда целия екип (без себе си); работник/мениджър вижда САМО себе си —
  // и без това RLS му дава само неговите task_pay редове.
  const isAdmin = currentUser.isAdmin;
  const source = isAdmin ? team.filter((m) => m.initials !== currentUser.initials) : team.filter((m) => m.initials === currentUser.initials);
  const rows = source
    .map((m) => {
      const mine = tasks.filter((t) => t.assignee === m.initials);
      const p = payoutFor(tasks, m.initials);
      const earned = mine.filter((t) => t.status === "done" && inPeriod(t.done_at)).reduce((a, t) => a + (t.pay_amount || 0), 0);
      const paid = mine.filter((t) => t.paid && inPeriod(t.paid_at)).reduce((a, t) => a + (t.pay_amount || 0), 0);
      // Всяка стъпка-задача по видео е отделен ред (за да е редактируема сумата).
      const lines = mine
        .filter((t) => t.content_item_id && t.status === "done" && (period === "all" || inCurrentMonth(t.done_at)))
        .map((t) => {
          const it = itemsById[t.content_item_id || ""];
          return { taskId: t.id, videoId: t.content_item_id || "", title: it?.title || "(видео)", client: byId[it?.client || ""]?.name || "", role: stageMeta(t.stage_key || "").label, pay: t.pay_amount || 0, paid: !!t.paid };
        });
      const videoCount = new Set(lines.map((l) => l.videoId)).size;
      return { m, owed: p.owed, upcoming: p.upcoming, paidTotal: p.paidTotal, earned, paid, lines, videoCount };
    })
    .filter((r) => r.owed || r.upcoming || r.paidTotal || r.lines.length)
    .sort((a, b) => b.owed - a.owed);

  const money = (n: number) => fmtFull(n);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-5)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--bm-space-4)", flexWrap: "wrap" }}>
        <div>
          <h1>{isAdmin ? "Възнаграждения" : "Моето възнаграждение"}</h1>
          <p className="bm-text-muted" style={{ margin: "4px 0 0" }}>{isAdmin ? "Кой колко трябва да получи, колко видеа е свършил и с каква роля." : "Твоите видеа, роля и суми · какво ще получиш и какво вече е платено."}</p>
        </div>
        <div className="bm-tabs" style={{ border: "none" }}>
          <button role="tab" className="bm-tab" aria-selected={period === "month"} onClick={() => setPeriod("month")}>Този месец</button>
          <button role="tab" className="bm-tab" aria-selected={period === "all"} onClick={() => setPeriod("all")}>Цял период</button>
        </div>
      </div>

      {/* Чиста печалба за периода — само за админ. */}
      {isAdmin && (
        <section className="bm-stats">
          <div className="bm-card bm-stat"><div className="bm-stat__label">Събрано {period === "month" ? "този месец" : "общо"}</div><div className="bm-stat__value"><Money>{money(rev)}</Money></div></div>
          <div className="bm-card bm-stat"><div className="bm-stat__label">Изплатено на екипа</div><div className="bm-stat__value" style={{ color: "var(--bm-danger-600)" }}><Money>{money(cost)}</Money></div></div>
          <div className="bm-card bm-stat"><div className="bm-stat__label">Чиста печалба</div><div className="bm-stat__value" style={{ color: net >= 0 ? "var(--bm-success-600)" : "var(--bm-danger-600)" }}><Money>{money(net)}</Money></div></div>
        </section>
      )}

      <div className="bm-card">
        <div className="bm-card__header"><h3>{isAdmin ? "По работник" : "Моите видеа"}</h3><span className="bm-text-subtle" style={{ fontSize: "var(--bm-text-xs)" }}>дължимо = завършени, неплатени задачи</span></div>
        <div className="bm-card__body" style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-3)" }}>
          {rows.length === 0 && <p className="bm-text-subtle" style={{ fontSize: "var(--bm-text-sm)", margin: 0 }}>Няма възнаграждения за показване.</p>}
          {rows.map((r) => {
            const isOpen = open.has(r.m.initials) || !isAdmin;
            return (
              <div key={r.m.id} style={{ borderBottom: "1px solid var(--bm-border)", paddingBottom: "var(--bm-space-3)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--bm-space-3)", flexWrap: "wrap" }}>
                  <button type="button" onClick={() => toggle(r.m.initials)} style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", padding: 0, font: "inherit", minWidth: 0 }}>
                    <span style={{ display: "inline-flex", transform: isOpen ? "rotate(90deg)" : "none", transition: "transform .15s ease", color: "var(--bm-text-muted)" }}>›</span>
                    <span className="bm-avatar bm-avatar--sm" style={{ width: 26, height: 26, fontSize: 10 }}>{r.m.initials}</span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ fontWeight: 600, fontSize: "var(--bm-text-sm)", display: "block" }}>{r.m.name}</span>
                      <span className="bm-text-subtle" style={{ fontSize: "var(--bm-text-xs)" }}>{r.videoCount} {r.videoCount === 1 ? "видео" : "видеа"} {period === "month" ? "този месец" : "общо"}</span>
                    </span>
                  </button>
                  <span style={{ display: "flex", alignItems: "center", gap: "var(--bm-space-3)", flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <span className="bm-text-subtle" style={{ fontSize: "var(--bm-text-xs)" }}>заработено <Money>{money(r.earned)}</Money> · изплатено <Money>{money(r.paid)}</Money>{r.upcoming ? ` · предстоящо ${money(r.upcoming)}` : ""}</span>
                    <span style={{ fontWeight: 700 }} title={isAdmin ? "Дължимо сега (завършени неплатени задачи)" : "Какво ще получиш (завършено, още неплатено)"}><Money>{money(r.owed)}</Money></span>
                    {isAdmin && <button className="bm-btn bm-btn--secondary bm-btn--sm" disabled={r.owed === 0} onClick={() => markWorkerPaid(r.m.initials)} title="Маркира завършените неплатени задачи като платени">Платено</button>}
                  </span>
                </div>

                {isOpen && (
                  <div style={{ marginTop: "var(--bm-space-3)", marginLeft: 34, display: "flex", flexDirection: "column", gap: 6 }}>
                    {r.lines.length === 0 && <span className="bm-text-subtle" style={{ fontSize: "var(--bm-text-xs)" }}>Няма видеа за периода.</span>}
                    {r.lines.map((v) => (
                      <div key={v.taskId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, fontSize: "var(--bm-text-sm)", padding: "6px 8px", background: "var(--bm-surface-2)", borderRadius: "var(--bm-radius-sm)" }}>
                        <span style={{ minWidth: 0 }}>
                          <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>{v.title}</span>
                          <span className="bm-text-subtle" style={{ fontSize: "var(--bm-text-xs)" }}>{v.client}{v.client && v.role ? " · " : ""}{v.role}</span>
                        </span>
                        <span style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                            <span className="bm-text-subtle">€</span>
                            <input
                              type="number" step="0.01" min="0" defaultValue={v.pay} key={v.taskId + ":" + v.pay}
                              disabled={v.paid || !isAdmin}
                              onBlur={(e) => { if (!isAdmin) return; const n = parseFloat(e.currentTarget.value); if (!Number.isNaN(n) && n !== v.pay) setTaskPay(v.taskId, n); }}
                              style={{ width: 66, textAlign: "right", padding: "3px 5px", border: "1px solid var(--bm-border)", borderRadius: "var(--bm-radius-sm)", background: (v.paid || !isAdmin) ? "var(--bm-surface-2)" : "var(--bm-surface)", color: "var(--bm-text)" }}
                              title={!isAdmin ? "Сумата се определя от админа" : v.paid ? "Платено — не се редактира" : "Сума за тази задача"}
                            />
                          </span>
                          <span className={"bm-badge " + (v.paid ? "bm-badge--success" : "bm-badge--warning")}>{v.paid ? "платено" : "дължимо"}</span>
                        </span>
                      </div>
                    ))}
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
