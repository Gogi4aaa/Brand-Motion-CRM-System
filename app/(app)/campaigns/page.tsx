"use client";

import { useState } from "react";
import { useStore } from "@/components/store";
import { Icon } from "@/components/Icon";
import { clientsById, campaignStatusMeta, adStatusMeta, fmtFull, fmtK, AD_OBJECTIVE_LABELS, type CampaignStatus } from "@/lib/data";

const FILTERS: ["all" | CampaignStatus, string][] = [
  ["all", "Всички"], ["active", "Активни"], ["planning", "Планиране"], ["paused", "На пауза"], ["completed", "Завършени"],
];

function Kpi({ label, value, delta }: { label: string; value: React.ReactNode; delta?: string }) {
  return (
    <div className="bm-card bm-stat">
      <div className="bm-stat__label">{label}</div>
      <div className="bm-stat__value">{value}</div>
      {delta && <div className="bm-stat__delta bm-text-subtle">{delta}</div>}
    </div>
  );
}

export default function CampaignsPage() {
  const { campaigns, clients, adDrafts, integrations, openModal } = useStore();
  const [tab, setTab] = useState<"campaigns" | "ads">("campaigns");
  const [filter, setFilter] = useState<"all" | CampaignStatus>("all");
  const byId = clientsById(clients);

  const active = campaigns.filter((c) => c.status === "active");
  const budget = campaigns.reduce((a, b) => a + b.budget, 0);
  const activeBudget = active.reduce((a, b) => a + b.budget, 0);
  const shown = filter === "all" ? campaigns : campaigns.filter((c) => c.status === filter);

  const metaConnected = !!integrations.find((i) => i.provider === "meta_ads")?.connected;
  const publishedAds = adDrafts.filter((a) => a.status === "published");
  const adBudget = adDrafts.reduce((a, b) => a + b.budget, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-5)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--bm-space-4)", flexWrap: "wrap" }}>
        <div>
          <h1>Кампании</h1>
          <p className="bm-text-muted" style={{ margin: "4px 0 0" }}>Маркетингови кампании и Meta реклами на едно място.</p>
        </div>
        {tab === "campaigns"
          ? <button className="bm-btn bm-btn--primary" onClick={() => openModal({ kind: "campaign", mode: "create" })}><Icon name="plus" /> Нова кампания</button>
          : <button className="bm-btn bm-btn--primary" onClick={() => openModal({ kind: "ad", mode: "create" })}><Icon name="plus" /> Нова реклама</button>}
      </div>

      <div className="bm-tabs">
        <button className="bm-tab" aria-selected={tab === "campaigns"} onClick={() => setTab("campaigns")}>Кампании</button>
        <button className="bm-tab" aria-selected={tab === "ads"} onClick={() => setTab("ads")}>Реклами</button>
      </div>

      {tab === "campaigns" && (
        <>
          <section className="bm-stats">
            <Kpi label="Активни кампании" value={active.length} delta={`от общо ${campaigns.length}`} />
            <Kpi label="Активен бюджет" value={fmtK(activeBudget)} delta="в ход" />
            <Kpi label="Общ управляван бюджет" value={fmtK(budget)} delta="всички кампании" />
          </section>
          <div className="bm-tabs" style={{ border: "none" }}>
            {FILTERS.map(([k, l]) => <button key={k} className="bm-tab" aria-selected={filter === k} onClick={() => setFilter(k)}>{l}</button>)}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "var(--bm-space-4)" }}>
            {shown.map((c) => {
              const m = campaignStatusMeta(c.status);
              return (
                <div key={c.id} className="bm-card aw-card-hover" onClick={() => openModal({ kind: "campaign", mode: "edit", campaign: c })} style={{ padding: "var(--bm-space-5)", display: "flex", flexDirection: "column", gap: "var(--bm-space-3)", cursor: "pointer" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "var(--bm-space-3)" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700 }}>{c.name}</div>
                      <div style={{ fontSize: "var(--bm-text-xs)", color: "var(--bm-text-subtle)" }}>{byId[c.client]?.name || c.client} · {c.channel}</div>
                    </div>
                    <span className={"bm-badge " + m.cls}>{m.label}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", paddingTop: "var(--bm-space-3)", borderTop: "1px solid var(--bm-border)" }}>
                    <div><div style={{ fontSize: "var(--bm-text-xs)", color: "var(--bm-text-subtle)" }}>Бюджет</div><div style={{ fontWeight: 700, fontFamily: "var(--bm-font-mono)" }}>{fmtFull(c.budget)}</div></div>
                    <div style={{ fontSize: "var(--bm-text-xs)", color: "var(--bm-text-subtle)", textAlign: "right" }}>{c.starts} – {c.ends}</div>
                  </div>
                </div>
              );
            })}
            {shown.length === 0 && <div className="bm-text-subtle" style={{ fontSize: "var(--bm-text-sm)" }}>Няма кампании.</div>}
          </div>
        </>
      )}

      {tab === "ads" && (
        <>
          {!metaConnected && (
            <div className="bm-alert bm-alert--warning" style={{ alignItems: "center" }}>
              <Icon name="warn" />
              <div>Няма свързан Meta акаунт. Свържи го от „Социални → Свързани акаунти“ за публикуване — можеш да правиш чернови и сега.</div>
            </div>
          )}
          <section className="bm-stats">
            <Kpi label="Реклами" value={adDrafts.length} delta={`${publishedAds.length} публикувани`} />
            <Kpi label="Общ бюджет" value={fmtFull(adBudget)} delta="по всички чернови" />
            <Kpi label="Meta акаунт" value={metaConnected ? "Свързан" : "—"} delta={metaConnected ? "готов" : "не е свързан"} />
          </section>
          <div className="bm-table-wrap">
            <table className="bm-table">
              <thead><tr><th>Кампания</th><th>Клиент</th><th>Цел</th><th className="bm-table__num">Бюджет</th><th>Статус</th><th /></tr></thead>
              <tbody>
                {adDrafts.map((a) => {
                  const m = adStatusMeta(a.status);
                  return (
                    <tr key={a.id}>
                      <td style={{ fontWeight: 600 }}>{a.name}</td>
                      <td>{a.client ? byId[a.client]?.name || a.client : "—"}</td>
                      <td style={{ color: "var(--bm-text-muted)" }}>{AD_OBJECTIVE_LABELS[a.objective] || a.objective}</td>
                      <td className="bm-table__num">{fmtFull(a.budget)}</td>
                      <td><span className={"bm-badge " + m.cls}>{m.label}</span></td>
                      <td style={{ textAlign: "right" }}><button className="bm-btn bm-btn--ghost bm-btn--sm" onClick={() => openModal({ kind: "ad", mode: "edit", ad: a })}>Отвори</button></td>
                    </tr>
                  );
                })}
                {adDrafts.length === 0 && <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--bm-text-subtle)", padding: "var(--bm-space-8)" }}>Все още няма реклами.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
