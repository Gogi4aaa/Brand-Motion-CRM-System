"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useStore } from "@/components/store";
import { Icon } from "@/components/Icon";
import { CommentThread } from "@/components/CommentThread";
import { clientsById, invStatusMeta, prioMeta, taskStatusLabel, healthMeta, analysisStatusMeta, CLIENT_CHANNELS, fmtK, fmtFull } from "@/lib/data";

function Kpi({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bm-card bm-stat">
      <div className="bm-stat__label">{label}</div>
      <div className="bm-stat__value">{value}</div>
    </div>
  );
}

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { clients, invoices, tasks, openModal, deleteClient, currentUser, team, clientConnections, setClientConnection } = useStore();
  const [tab, setTab] = useState<"overview" | "invoices" | "tasks">("overview");

  const byId = clientsById(clients);
  const c = byId[id] || clients[0];
  const h = healthMeta(c.health);
  const cInv = invoices.filter((i) => i.client === c.id);
  const cTasks = tasks.filter((t) => t.client === c.id);
  const balance = cInv.filter((i) => i.status === "pending" || i.status === "overdue").reduce((a, b) => a + b.amount, 0);
  const ltv = cInv.filter((i) => i.status === "paid").reduce((a, b) => a + b.amount, 0) + c.mrr * 6;

  const channels = [["Платено търсене", 0.5], ["Платени социални", 0.32], ["SEO", 0.12], ["Имейл", 0.06]].map(([name, r]) => {
    const v = Math.round(c.mrr * (r as number));
    return { name: name as string, valStr: fmtFull(v), w: Math.min(100, Math.round((v / 9000) * 100)) };
  });

  const TABS: ["overview" | "invoices" | "tasks", string][] = [["overview", "Преглед"], ["invoices", "Фактури"], ["tasks", "Задачи"]];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-5)" }}>
      <Link href="/clients" className="bm-btn bm-btn--ghost bm-btn--sm" style={{ alignSelf: "flex-start" }}><Icon name="back" size={16} /> Всички клиенти</Link>

      <div style={{ display: "flex", alignItems: "center", gap: "var(--bm-space-4)", flexWrap: "wrap" }}>
        <span className="bm-avatar bm-avatar--lg" style={{ width: 56, height: 56, fontSize: "var(--bm-text-lg)" }}>{c.initials}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1>{c.name}</h1>
          <p className="bm-text-muted" style={{ margin: "4px 0 0" }}>{c.industry} · Отговорник {team.find((m) => m.initials === c.owner)?.name || c.owner}</p>
        </div>
        <span className={"bm-badge " + h.cls}>{h.label}</span>
        <Link href={`/calendar?client=${c.id}`} className="bm-btn bm-btn--secondary"><Icon name="calendar" size={16} /> Календар</Link>
        <button className="bm-btn bm-btn--secondary" onClick={() => openModal({ kind: "client", mode: "edit", client: c })}>Редакция</button>
        {currentUser.isAdmin && (
          <button
            className="bm-btn bm-btn--ghost"
            onClick={() =>
              openModal({
                kind: "confirm",
                title: "Изтриване на клиент?",
                message: `Това премахва ${c.name} и всички негови фактури и задачи. Действието е необратимо.`,
                confirmLabel: "Изтрий",
                onConfirm: () => { deleteClient(c.id); router.push("/clients"); },
              })
            }
          >
            Изтрий
          </button>
        )}
        <button className="bm-btn bm-btn--primary" onClick={() => openModal({ kind: "invoice", mode: "create", clientId: c.id })}><Icon name="plus" /> Нова фактура</button>
      </div>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "var(--bm-space-4)" }}>
        <Kpi label="Месечен приход" value={fmtFull(c.mrr)} />
        <Kpi label="Дължимо салдо" value={fmtFull(balance)} />
        <Kpi label="Отворени задачи" value={cTasks.filter((t) => t.status !== "done").length} />
        <Kpi label="Обща стойност" value={fmtK(ltv)} />
      </section>

      <div className="bm-tabs">
        {TABS.map(([k, l]) => (
          <button key={k} className="bm-tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === "invoices" && (
        <div className="bm-table-wrap">
          <table className="bm-table">
            <thead><tr><th>Фактура</th><th>Статус</th><th className="bm-table__num">Сума</th><th>Издадена</th><th>Падеж</th></tr></thead>
            <tbody>
              {cInv.map((iv) => {
                const m = invStatusMeta(iv.status);
                return (
                  <tr key={iv.id}>
                    <td style={{ fontFamily: "var(--bm-font-mono)", fontSize: "var(--bm-text-xs)" }}>{iv.id}</td>
                    <td><span className={"bm-badge " + m.cls}>{m.label}</span></td>
                    <td className="bm-table__num">{fmtFull(iv.amount)}</td>
                    <td style={{ color: "var(--bm-text-subtle)" }}>{iv.issued}</td>
                    <td style={{ color: "var(--bm-text-subtle)" }}>{iv.due}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === "tasks" && (
        <div className="bm-card"><div className="bm-card__body" style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-4)" }}>
          {cTasks.map((t) => {
            const pm = prioMeta(t.priority);
            return (
              <div key={t.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--bm-space-3)", paddingBottom: "var(--bm-space-3)", borderBottom: "1px solid var(--bm-border)" }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{t.title}</div>
                  <div style={{ fontSize: "var(--bm-text-xs)", color: "var(--bm-text-subtle)" }}>{taskStatusLabel(t.status)} · краен срок {t.due}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--bm-space-3)" }}>
                  <span className={"bm-badge " + pm.cls}>{pm.label}</span>
                  <span className="bm-avatar bm-avatar--sm">{t.assignee}</span>
                </div>
              </div>
            );
          })}
        </div></div>
      )}

      {tab === "overview" && (
        <>
        <section style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: "var(--bm-space-6)", alignItems: "start" }}>
          <div className="bm-card">
            <div className="bm-card__header"><h3>Разход по канали този месец</h3></div>
            <div className="bm-card__body" style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-4)" }}>
              {channels.map((x) => (
                <div key={x.name}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--bm-text-sm)", marginBottom: 6 }}><span>{x.name}</span><span style={{ fontFamily: "var(--bm-font-mono)", color: "var(--bm-text-muted)" }}>{x.valStr}</span></div>
                  <div className="bm-progress"><div className="bm-progress__bar" style={{ width: x.w + "%" }} /></div>
                </div>
              ))}
            </div>
          </div>
          <div className="bm-card">
            <div className="bm-card__header"><h3>Бележки за акаунта</h3></div>
            <div className="bm-card__body" style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-3)", fontSize: "var(--bm-text-sm)", color: "var(--bm-text-muted)" }}>
              <p style={{ margin: 0 }}>{c.note}</p>
              <div style={{ display: "flex", gap: "var(--bm-space-2)", alignItems: "center", paddingTop: "var(--bm-space-2)" }}>
                <span className="bm-avatar bm-avatar--sm">{c.owner}</span>
                <span style={{ fontSize: "var(--bm-text-xs)" }}>Последна активност преди 2 дни</span>
              </div>
            </div>
          </div>
        </section>
        <div className="bm-card">
          <div className="bm-card__header">
            <h3>Бизнес анализ</h3>
            <span className={"bm-badge " + analysisStatusMeta(c.analysis_status ?? "not_started").cls}>{analysisStatusMeta(c.analysis_status ?? "not_started").label}</span>
          </div>
          <div className="bm-card__body" style={{ fontSize: "var(--bm-text-sm)", color: "var(--bm-text-muted)" }}>
            {c.analysis_notes ? <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{c.analysis_notes}</p> : <span className="bm-text-subtle">Няма бележки от анализа. Редактирай клиента, за да ги добавиш.</span>}
          </div>
        </div>
        {currentUser.isAdmin && (
          <div className="bm-card">
            <div className="bm-card__header"><h3>Канали за публикуване</h3></div>
            <div className="bm-card__body" style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-3)" }}>
              <p className="bm-text-subtle" style={{ fontSize: "var(--bm-text-xs)", margin: 0 }}>Свързването е симулирано. Реалното изисква OAuth приложение + одобрение и хостинг с HTTPS.</p>
              {CLIENT_CHANNELS.map((ch) => {
                const conn = clientConnections.find((x) => x.client_id === c.id && x.provider === ch.id);
                const connected = !!conn?.connected;
                return (
                  <div key={ch.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--bm-space-3)", paddingBottom: "var(--bm-space-3)", borderBottom: "1px solid var(--bm-border)" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: "var(--bm-text-sm)" }}>{ch.name}</div>
                      <div className="bm-text-subtle" style={{ fontSize: "var(--bm-text-xs)" }}>{ch.blurb}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--bm-space-2)", flexShrink: 0 }}>
                      <span className={"bm-badge " + (connected ? "bm-badge--success" : "bm-badge--neutral")}>{connected ? "Свързан" : "Не е свързан"}</span>
                      <button className={"bm-btn bm-btn--sm " + (connected ? "bm-btn--secondary" : "bm-btn--primary")} onClick={() => setClientConnection(c.id, ch.id, !connected)}>{connected ? "Прекъсни" : "Свържи"}</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <div className="bm-card">
          <div className="bm-card__header"><h3>Коментари</h3></div>
          <div className="bm-card__body"><CommentThread entityType="client" entityId={c.id} /></div>
        </div>
        </>
      )}
    </div>
  );
}
