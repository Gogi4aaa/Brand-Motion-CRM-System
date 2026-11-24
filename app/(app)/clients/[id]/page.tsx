"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useStore } from "@/components/store";
import { Icon } from "@/components/Icon";
import { CommentThread } from "@/components/CommentThread";
import { BrandTab } from "@/components/BrandTab";
import { clientsById, invStatusMeta, healthMeta, analysisStatusMeta, CLIENT_CHANNELS, fmtFull, fmtDay, clientLtv, monthKey, monthLabel, monthProgress } from "@/lib/data";
import { ClientVideosTab, quotaText } from "@/components/MonthProgress";
import { Money } from "@/components/MoneyLock";
import { ClientMonths } from "@/components/ClientMonths";
import { ClientPaymentCard, DueLabel } from "@/components/PaymentBehavior";
import { clientStatusMeta } from "@/lib/data";

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
  const { clients, invoices, cycles, contentItems, openModal, deleteClient, restoreClient, setClientEngagement, currentUser, team, clientConnections, setClientConnection, getPortalLink } = useStore();
  type Tab = "overview" | "videos" | "brand" | "invoices";
  const [tab, setTab] = useState<Tab>(useSearchParams().get("tab") === "videos" ? "videos" : "overview");
  const [portalCopied, setPortalCopied] = useState(false);

  const byId = clientsById(clients);
  const found = byId[id];
  // Непознат клиент (грешен линк или още се зарежда) — не показваме чужд акаунт.
  if (!found) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-4)", alignItems: "flex-start" }}>
        <Link href="/clients" className="bm-btn bm-btn--ghost bm-btn--sm"><Icon name="back" size={16} /> Всички клиенти</Link>
        <p className="bm-text-muted">{clients.length ? "Няма такъв клиент." : "Зареждане…"}</p>
      </div>
    );
  }
  const c = found;
  const copyPortal = async () => {
    const token = await getPortalLink(c.id);
    if (!token) return;
    try { await navigator.clipboard.writeText(`${window.location.origin}/portal/${token}`); } catch { /* clipboard отказан — линкът пак е валиден */ }
    setPortalCopied(true);
    setTimeout(() => setPortalCopied(false), 2500);
  };
  const h = healthMeta(c.health);
  const cInv = invoices.filter((i) => i.client === c.id);
  const balance = cInv.filter((i) => i.status === "pending" || i.status === "overdue").reduce((a, b) => a + b.amount, 0);
  const ltv = clientLtv(invoices, c.id); // реално платеното досега
  const [month] = monthProgress([c], cycles, contentItems, monthKey());

  const TABS: [Tab, string][] = [["overview", "Преглед"], ["videos", "Видеа"], ["brand", "Бранд"], ["invoices", "Фактури"]];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-5)" }}>
      <Link href="/clients" className="bm-btn bm-btn--ghost bm-btn--sm" style={{ alignSelf: "flex-start" }}><Icon name="back" size={16} /> Всички клиенти</Link>

      <div style={{ display: "flex", alignItems: "center", gap: "var(--bm-space-4)", flexWrap: "wrap" }}>
        <span className="bm-avatar bm-avatar--lg" style={{ width: 56, height: 56, fontSize: "var(--bm-text-lg)" }}>{c.initials}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1>{c.name}{c.engagement === "project" && <span className="bm-badge bm-badge--neutral" style={{ marginLeft: 10, verticalAlign: "middle" }}>проектен клиент</span>}</h1>
          <p className="bm-text-muted" style={{ margin: "4px 0 0" }}>{c.industry} · Отговорник {team.find((m) => m.initials === c.owner)?.name || c.owner}</p>
        </div>
        <span className={"bm-badge " + clientStatusMeta(c.status).cls}>{clientStatusMeta(c.status).label}</span>
        <span className={"bm-badge " + h.cls}>{h.label}</span>
        <Link href={`/calendar?client=${c.id}`} className="bm-btn bm-btn--secondary"><Icon name="calendar" size={16} /> Календар</Link>
        <button className="bm-btn bm-btn--secondary" onClick={copyPortal} title="Линк, който клиентът отваря без логин">{portalCopied ? "✓ Линкът е копиран" : "Клиентски портал"}</button>
        <button className="bm-btn bm-btn--secondary" onClick={() => openModal({ kind: "client", mode: "edit", client: c })}>Редакция</button>
        {currentUser.isAdmin && !c.archived_at && (
          <button className="bm-btn bm-btn--ghost" title={c.engagement === "project" ? "Връща клиента в месечните сметки, пакета и напомнянията" : "Остава в системата с историята си, но без месечна такса, пакет и напомняния"} onClick={() => setClientEngagement(c.id, c.engagement === "project" ? "retainer" : "project")}>
            {c.engagement === "project" ? "Направи постоянен" : "Премести в проектни"}
          </button>
        )}
        {currentUser.isAdmin && (c.archived_at ? (
          <button className="bm-btn bm-btn--secondary" onClick={() => restoreClient(c.id)}>
            Върни от архива
          </button>
        ) : (
          <button
            className="bm-btn bm-btn--ghost"
            onClick={() =>
              openModal({
                kind: "confirm",
                title: "Архивиране на клиент?",
                message: `${c.name} се скрива от списъците, но фактурите и историята му остават — за да не изчезне приходът от Анализи. Може да го върнеш по всяко време.`,
                confirmLabel: "Архивирай",
                onConfirm: () => { deleteClient(c.id); router.push("/clients"); },
              })
            }
          >
            Архивирай
          </button>
        ))}
        <button className="bm-btn bm-btn--primary" onClick={() => openModal({ kind: "invoice", mode: "create", clientId: c.id })}><Icon name="plus" /> Нова фактура</button>
      </div>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "var(--bm-space-4)" }}>
        <Kpi label="Месечен приход" value={<Money>{fmtFull(c.mrr)}</Money>} />
        <Kpi label="Дължимо салдо" value={<Money>{fmtFull(balance)}</Money>} />
        <Kpi label={`Видеа за ${monthLabel(monthKey())}`} value={month.target ? quotaText(month.done, month.target) : <span title="Задай бройката от „Редакция“">{month.done} <span className="bm-text-subtle" style={{ fontSize: "var(--bm-text-sm)", fontWeight: 400 }}>· няма бройка</span></span>} />
        <Kpi label="Платено досега" value={<Money>{fmtFull(ltv)}</Money>} />
      </section>

      <div className="bm-tabs">
        {TABS.map(([k, l]) => (
          <button key={k} role="tab" className="bm-tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === "videos" && <ClientVideosTab client={c} />}

      {tab === "brand" && <BrandTab client={c} />}

      {tab === "invoices" && <ClientPaymentCard client={c} />}

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
                    <td className="bm-table__num"><Money>{fmtFull(iv.amount)}</Money></td>
                    <td style={{ color: "var(--bm-text-subtle)" }}>{fmtDay(iv.issued)}</td>
                    <td><DueLabel iv={iv} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === "overview" && (
        <>
        <ClientMonths c={c} />
        {c.note && (
          <div className="bm-card">
            <div className="bm-card__header"><h3>Бележки за акаунта</h3></div>
            <div className="bm-card__body" style={{ fontSize: "var(--bm-text-sm)", color: "var(--bm-text-muted)", whiteSpace: "pre-wrap" }}>{c.note}</div>
          </div>
        )}
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
