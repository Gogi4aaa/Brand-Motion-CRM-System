"use client";

import Link from "next/link";
import { useStore } from "@/components/store";
import { Icon } from "@/components/Icon";
import { clientsById, invStatusMeta, prioMeta, fmtK, fmtFull, payoutFor } from "@/lib/data";

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
  const { clients, invoices, tasks, toggleDone, currentUser, activity, team, contentItems, notifications, markNotificationRead } = useStore();
  const byId = clientsById(clients);
  const firstName = currentUser.name.split(" ")[0] || "колега";
  const showMoney = currentUser.level !== "worker";
  const myOpen = tasks.filter((t) => t.assignee === currentUser.initials && t.status !== "done").length;
  const myDone = tasks.filter((t) => t.assignee === currentUser.initials && t.status === "done").length;
  const myVideos = contentItems.filter((c) => (c.stages || []).some((s) => s.key === (c.current_stage || "strategy") && s.assignee === currentUser.initials)).length;
  const feed = activity.map((a) => ({ who: a.actor_initials, name: a.actor_name.split(" ")[0] || a.actor_name, text: a.action, when: ago(a.created_at) }));

  const outstanding = invoices.filter((i) => i.status === "pending" || i.status === "overdue");
  const overdue = invoices.filter((i) => i.status === "overdue");
  const paid = invoices.filter((i) => i.status === "paid");
  const recent = invoices.slice(0, 5);
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
          <p className="bm-text-muted" style={{ margin: "4px 0 0" }}>{showMoney ? "Ето какво се случва в агенцията днес." : "Ето твоите задачи за деня."}</p>
        </div>
        {showMoney && (
          <div className="bm-tabs" style={{ border: "none" }}>
            <button className="bm-tab" aria-selected>Днес</button>
            <button className="bm-tab">Тази седмица</button>
            <button className="bm-tab">Месец</button>
          </div>
        )}
      </div>

      <section className="bm-stats">
        {showMoney ? (
          <>
            <Kpi label="Активни клиенти" value={clients.filter((c) => c.status === "Active").length} deltaCls="bm-stat__delta--up" delta="▲ 12% спрямо м.м." />
            <Kpi label="Несъбрани" value={fmtK(sum(outstanding))} deltaCls="bm-stat__delta--down" delta="▼ 4% по-бавно събиране" />
            <Kpi label="Отворени задачи" value={openTasks.length} deltaCls="bm-text-subtle" delta="5 с краен срок тази седмица" />
            <Kpi label="Платени този месец" value={fmtK(sum(paid))} deltaCls="bm-stat__delta--up" delta="▲ 23%" />
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

      <section className={showMoney ? "bm-split" : undefined} style={showMoney ? undefined : { display: "flex", flexDirection: "column", gap: "var(--bm-space-6)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-6)" }}>
          <div className="bm-card">
            <div className="bm-card__header"><h3>Известия</h3>{notifications.filter((n) => !n.read).length > 0 && <span className="bm-badge bm-badge--brand">{notifications.filter((n) => !n.read).length} нови</span>}</div>
            <div className="bm-card__body" style={{ paddingTop: 0 }}>
              {notifications.length === 0 && <p className="bm-text-subtle" style={{ fontSize: "var(--bm-text-sm)" }}>Няма известия.</p>}
              {notifications.slice(0, 4).map((n) => (
                <div key={n.id} onClick={() => markNotificationRead(n.id)} style={{ display: "flex", gap: "var(--bm-space-3)", padding: "var(--bm-space-3) 0", borderBottom: "1px solid var(--bm-border)", cursor: "pointer" }}>
                  <span className="bm-avatar bm-avatar--sm">{n.actor_initials}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: "var(--bm-text-sm)", fontWeight: n.read ? 400 : 600 }}>{n.body}</div>
                    <small style={{ color: "var(--bm-text-subtle)" }}>{ago(n.created_at)}</small>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {showMoney && (
          <div className="bm-card">
            <div className="bm-card__header">
              <h3>Последни фактури</h3>
              <Link href="/invoices" className="bm-btn bm-btn--ghost bm-btn--sm">Виж всички</Link>
            </div>
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
          </div>
          )}

          <div className="bm-card">
            <div className="bm-card__header"><h3>Моите задачи</h3><span className="bm-badge bm-badge--brand">{myTasks.filter((t) => t.status !== "done").length} активни</span></div>
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
          </div>
        </div>

        {showMoney && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-6)" }}>
          <div className="bm-alert bm-alert--danger" style={{ alignItems: "center" }}>
            <Icon name="warn" />
            <div><b>{overdue.length} просрочени фактури</b> — {fmtFull(sum(overdue))} се нуждаят от напомняне.</div>
          </div>

          <div className="bm-card">
            <div className="bm-card__header"><h3>Активност на екипа</h3></div>
            <div className="bm-card__body" style={{ paddingTop: 0 }}>
              {feed.length === 0 && <p className="bm-text-subtle" style={{ fontSize: "var(--bm-text-sm)" }}>Все още няма активност.</p>}
              {feed.map((a, i) => (
                <div key={i} style={{ display: "flex", gap: "var(--bm-space-3)", padding: "var(--bm-space-3) 0", borderBottom: "1px solid var(--bm-border)" }}>
                  <span className="bm-avatar bm-avatar--sm">{a.who}</span>
                  <div><div><b>{a.name}</b> {a.text}</div><small style={{ color: "var(--bm-text-subtle)" }}>{a.when}</small></div>
                </div>
              ))}
            </div>
          </div>

          <div className="bm-card">
            <div className="bm-card__header"><h3>Натовареност на екипа</h3><div className="bm-avatar-group">{team.slice(0,4).map((m) => <span key={m.id} className="bm-avatar bm-avatar--sm">{m.initials}</span>)}</div></div>
            <div className="bm-card__body" style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-3)" }}>
              {workload.map((w) => (
                <div key={w.name}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--bm-text-sm)" }}><span>{w.name}</span><span style={{ color: "var(--bm-text-subtle)" }}>{w.count} задачи</span></div>
                  <div className="bm-progress" style={{ marginTop: 6 }}><div className="bm-progress__bar" style={{ width: w.w + "%" }} /></div>
                </div>
              ))}
            </div>
          </div>
        </div>
        )}
      </section>
    </>
  );
}
