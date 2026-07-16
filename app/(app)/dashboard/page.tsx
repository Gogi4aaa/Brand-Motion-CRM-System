"use client";

import { useState } from "react";
import Link from "next/link";
import { useStore } from "@/components/store";
import { Icon } from "@/components/Icon";
import { clientsById, invStatusMeta, prioMeta, fmtK, fmtFull, payoutFor, inCurrentMonth } from "@/lib/data";

type Period = "today" | "week" | "month";
const PERIODS: { key: Period; label: string; word: string }[] = [
  { key: "today", label: "Днес", word: "днес" },
  { key: "week", label: "Тази седмица", word: "тази седмица" },
  { key: "month", label: "Месец", word: "този месец" },
];

// Dashboard section that folds under its header on phones (chevron + tap);
// on desktop the header is inert and the body is always visible (CSS-gated).
function Collapse({ title, badge, defaultOpen = false, children }: { title: string; badge?: React.ReactNode; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={"bm-card bm-collapse" + (open ? " bm-collapse--open" : " bm-collapse--closed")}>
      <div className="bm-card__header bm-collapse__head" onClick={() => setOpen((o) => !o)}>
        <h3>{title}</h3>
        <span style={{ display: "flex", alignItems: "center", gap: "var(--bm-space-2)" }}>
          {badge}
          <span className="bm-collapse__chev"><Icon name="chevronRight" size={16} /></span>
        </span>
      </div>
      <div className="bm-collapse__body">{children}</div>
    </div>
  );
}

function ago(iso: string) {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + " min ago";
  if (s < 86400) return Math.floor(s / 3600) + " hr ago";
  return Math.floor(s / 86400) + "d ago";
}

function Kpi({ label, value, deltaCls, delta }: { label: string; value: React.ReactNode; deltaCls: string; delta: string }) {
  return (
    <div className="bm-card bm-stat">
      <div className="bm-stat__label">{label}</div>
      <div className="bm-stat__value">{value}</div>
      <div className={"bm-stat__delta " + deltaCls}>{delta}</div>
    </div>
  );
}

export default function DashboardPage() {
  const { clients, invoices, tasks, toggleDone, currentUser, activity, team, contentItems, notifications, markNotificationRead, visibleClients } = useStore();
  // Мениджърските числа се смятат само по клиентите, до които има достъп.
  const visibleIds = new Set(visibleClients.map((c) => c.id));
  const scopedItems = contentItems.filter((c) => visibleIds.has(c.client));
  const byId = clientsById(clients);
  const firstName = currentUser.name.split(" ")[0] || "колега";
  // Money (invoices, суми) is strictly the admin's; managers get the ops view
  // (екип, продукция), workers get only their own work.
  const showMoney = currentUser.isAdmin;
  const showTeamOps = currentUser.level !== "worker";

  // Period tabs: filter everything time-stamped (invoices, activity, alerts)
  // to today / last 7 days / last 30 days. Rows without created_at (mock or
  // legacy data) always stay visible.
  const [period, setPeriod] = useState<Period>("month");
  const periodWord = PERIODS.find((p) => p.key === period)?.word || "";
  const since = (() => {
    const d = new Date();
    if (period === "today") d.setHours(0, 0, 0, 0);
    else d.setDate(d.getDate() - (period === "week" ? 7 : 30));
    return d.getTime();
  })();
  const inPeriod = (iso?: string) => !iso || new Date(iso).getTime() >= since;
  const myOpen = tasks.filter((t) => t.assignee === currentUser.initials && t.status !== "done").length;
  const myDone = tasks.filter((t) => t.assignee === currentUser.initials && t.status === "done").length;
  const myVideos = contentItems.filter((c) => (c.stages || []).some((s) => s.key === (c.current_stage || "strategy") && s.assignee === currentUser.initials)).length;
  // RLS вече не връща 'admin' записи на не-админи; филтърът тук е втора защита.
  const feed = activity
    .filter((a) => inPeriod(a.created_at) && (currentUser.isAdmin || a.audience !== "admin"))
    .map((a) => ({ who: a.actor_initials, name: a.actor_name.split(" ")[0] || a.actor_name, text: a.action, when: ago(a.created_at) }));
  const shownNotifications = notifications.filter((n) => inPeriod(n.created_at));

  const outstanding = invoices.filter((i) => i.status === "pending" || i.status === "overdue");
  const overdue = invoices.filter((i) => i.status === "overdue");
  const paid = invoices.filter((i) => i.status === "paid" && inPeriod(i.created_at));
  const recent = invoices.filter((i) => inPeriod(i.created_at)).slice(0, 5);
  const myTasks = tasks.filter((t) => t.assignee === currentUser.initials);
  const openTasks = tasks.filter((t) => t.status !== "done");
  const sum = (a: typeof invoices) => a.reduce((x, b) => x + b.amount, 0);

  const workload = team.map((m) => {
    const count = tasks.filter((t) => t.assignee === m.initials && t.status !== "done").length;
    return { name: m.name, count, w: Math.min(100, count * 22 + 10) };
  });

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--bm-space-4)", flexWrap: "wrap" }}>
        <div>
          <h1>Добро утро, {firstName}</h1>
          <p className="bm-text-muted" style={{ margin: "4px 0 0" }}>{showTeamOps ? "Ето какво се случва в агенцията днес." : "Ето твоите задачи за деня."}</p>
        </div>
        {showTeamOps && (
          <div className="bm-tabs" style={{ border: "none" }}>
            {PERIODS.map((p) => (
              <button key={p.key} role="tab" className="bm-tab" aria-selected={period === p.key} onClick={() => setPeriod(p.key)}>{p.label}</button>
            ))}
          </div>
        )}
      </div>

      <section className="bm-stats">
        {showMoney ? (
          <>
            <Kpi label="Активни клиенти" value={clients.filter((c) => c.status === "Active").length} deltaCls="bm-text-subtle" delta={`от общо ${clients.length}`} />
            <Kpi label="Несъбрани" value={fmtK(sum(outstanding))} deltaCls={overdue.length ? "bm-stat__delta--down" : "bm-text-subtle"} delta={overdue.length ? `${overdue.length} просрочени` : "няма просрочени"} />
            <Kpi label="Отворени задачи" value={openTasks.length} deltaCls="bm-text-subtle" delta={`${openTasks.filter((t) => t.priority === "high").length} с висок приоритет`} />
            <Kpi label={"Платени " + periodWord} value={fmtK(sum(paid))} deltaCls="bm-stat__delta--up" delta={`${paid.length} фактури`} />
          </>
        ) : showTeamOps ? (
          <>
            <Kpi label="Публикувани този месец" value={scopedItems.filter((c) => c.published && inCurrentMonth(c.published_at)).length} deltaCls="bm-stat__delta--up" delta="видеа и постове" />
            <Kpi label="Отворени задачи" value={openTasks.length} deltaCls="bm-text-subtle" delta="по целия екип" />
            <Kpi label="В продукция" value={scopedItems.filter((c) => !c.published).length} deltaCls="bm-text-subtle" delta="видеа и постове по етапите" />
            <Kpi label="Членове на екипа" value={team.length} deltaCls="bm-text-subtle" delta="активни" />
          </>
        ) : (
          <>
            <Kpi label="Моите отворени задачи" value={myOpen} deltaCls="bm-text-subtle" delta="за вършене" />
            <Kpi label="Завършени от мен" value={myDone} deltaCls="bm-stat__delta--up" delta="готови" />
            <Kpi label="Видеа при мен" value={myVideos} deltaCls="bm-text-subtle" delta="в продукция" />
            <Kpi label="За получаване" value={fmtFull(payoutFor(tasks, currentUser.initials).owed)} deltaCls="bm-stat__delta--up" delta="от завършени задачи" />
          </>
        )}
      </section>

      <section className={showTeamOps ? "bm-split" : undefined} style={showTeamOps ? undefined : { display: "flex", flexDirection: "column", gap: "var(--bm-space-6)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-6)" }}>
          <Collapse title="Известия" defaultOpen badge={shownNotifications.filter((n) => !n.read).length > 0 && <span className="bm-badge bm-badge--brand">{shownNotifications.filter((n) => !n.read).length} нови</span>}>
            <div className="bm-card__body" style={{ paddingTop: 0 }}>
              {shownNotifications.length === 0 && <p className="bm-text-subtle" style={{ fontSize: "var(--bm-text-sm)" }}>Няма известия.</p>}
              {shownNotifications.slice(0, 4).map((n) => (
                <div key={n.id} onClick={() => markNotificationRead(n.id)} style={{ display: "flex", gap: "var(--bm-space-3)", padding: "var(--bm-space-3) 0", borderBottom: "1px solid var(--bm-border)", cursor: "pointer" }}>
                  <span className="bm-avatar bm-avatar--sm">{n.actor_initials}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: "var(--bm-text-sm)", fontWeight: n.read ? 400 : 600 }}>{n.body}</div>
                    <small style={{ color: "var(--bm-text-subtle)" }}>{ago(n.created_at)}</small>
                  </div>
                </div>
              ))}
            </div>
          </Collapse>

          {showMoney && (
          <Collapse title="Последни фактури" badge={<Link href="/invoices" className="bm-btn bm-btn--ghost bm-btn--sm" onClick={(e) => e.stopPropagation()}>Виж всички</Link>}>
            <div className="bm-table-wrap" style={{ border: "none", borderRadius: 0 }}>
              <table className="bm-table">
                <thead><tr><th>Фактура</th><th>Клиент</th><th>Статус</th><th className="bm-table__num">Сума</th><th>Падеж</th></tr></thead>
                <tbody>
                  {recent.map((iv) => {
                    const m = invStatusMeta(iv.status);
                    return (
                      <tr key={iv.id}>
                        <td style={{ fontFamily: "var(--bm-font-mono)", fontSize: "var(--bm-text-xs)" }}>{iv.id}</td>
                        <td>{byId[iv.client]?.name}</td>
                        <td><span className={"bm-badge " + m.cls}>{m.label}</span></td>
                        <td className="bm-table__num">{fmtFull(iv.amount)}</td>
                        <td style={{ color: "var(--bm-text-subtle)" }}>{iv.due}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Collapse>
          )}

          <Collapse title="Моите задачи" defaultOpen badge={<span className="bm-badge bm-badge--brand">{myTasks.filter((t) => t.status !== "done").length} активни</span>}>
            <div className="bm-card__body" style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-4)" }}>
              {myTasks.map((t) => {
                const pm = prioMeta(t.priority);
                const done = t.status === "done";
                return (
                  <div key={t.id}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--bm-space-3)" }}>
                      <label className="bm-checkbox">
                        <input type="checkbox" checked={done} onChange={() => toggleDone(t.id)} />{" "}
                        <span style={done ? { textDecoration: "line-through", color: "var(--bm-text-subtle)" } : undefined}>{t.title}</span>
                      </label>
                      <span className={"bm-badge " + pm.cls}>{pm.label}</span>
                    </div>
                    <div className="bm-progress" style={{ marginTop: "var(--bm-space-2)" }}><div className="bm-progress__bar" style={{ width: t.progress + "%" }} /></div>
                  </div>
                );
              })}
            </div>
          </Collapse>
        </div>

        {showTeamOps && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-6)" }}>
          {showMoney && (
          <div className="bm-alert bm-alert--danger" style={{ alignItems: "center" }}>
            <Icon name="warn" />
            <div><b>{overdue.length} просрочени фактури</b> — {fmtFull(sum(overdue))} се нуждаят от напомняне.</div>
          </div>
          )}

          <Collapse title="Активност на екипа">
            <div className="bm-card__body" style={{ paddingTop: 0 }}>
              {feed.length === 0 && <p className="bm-text-subtle" style={{ fontSize: "var(--bm-text-sm)" }}>Все още няма активност.</p>}
              {feed.map((a, i) => (
                <div key={i} style={{ display: "flex", gap: "var(--bm-space-3)", padding: "var(--bm-space-3) 0", borderBottom: "1px solid var(--bm-border)" }}>
                  <span className="bm-avatar bm-avatar--sm">{a.who}</span>
                  <div><div><b>{a.name}</b> {a.text}</div><small style={{ color: "var(--bm-text-subtle)" }}>{a.when}</small></div>
                </div>
              ))}
            </div>
          </Collapse>

          <Collapse title="Натовареност на екипа" badge={<div className="bm-avatar-group">{team.slice(0,4).map((m) => <span key={m.id} className="bm-avatar bm-avatar--sm">{m.initials}</span>)}</div>}>
            <div className="bm-card__body" style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-3)" }}>
              {workload.map((w) => (
                <div key={w.name}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--bm-text-sm)" }}><span>{w.name}</span><span style={{ color: "var(--bm-text-subtle)" }}>{w.count} задачи</span></div>
                  <div className="bm-progress" style={{ marginTop: 6 }}><div className="bm-progress__bar" style={{ width: w.w + "%" }} /></div>
                </div>
              ))}
            </div>
          </Collapse>
        </div>
        )}
      </section>
    </>
  );
}
