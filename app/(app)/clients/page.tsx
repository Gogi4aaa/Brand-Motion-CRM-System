"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/components/store";
import { Icon } from "@/components/Icon";
import { Avatar } from "@/components/Avatar";
import { fmtK, fmtFull } from "@/lib/data";
import { Money } from "@/components/MoneyLock";
import { ClientMonthBadge } from "@/components/MonthProgress";
import { clientStatusMeta } from "@/lib/data";

export default function ClientsPage() {
  const { clients, openModal, getPortalLink } = useStore();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Магическият линк, който собственикът на бизнеса отваря без логин —
  // вижда напредъка на видеата си и резултатите след публикуване.
  const copyPortal = async (e: React.MouseEvent, clientId: string) => {
    e.stopPropagation();
    const token = await getPortalLink(clientId);
    if (!token) return;
    const url = `${window.location.origin}/portal/${token}`;
    try { await navigator.clipboard.writeText(url); } catch { /* clipboard blocked — линкът пак е валиден */ }
    setCopiedId(clientId);
    setTimeout(() => setCopiedId((id) => (id === clientId ? null : id)), 2500);
  };
  // Архивираните са скрити по подразбиране, но не са изтрити — виждат се с
  // превключвателя и продължават да носят приходната си история в Анализи.
  const active = clients.filter((c) => !c.archived_at);
  const archived = clients.filter((c) => c.archived_at);
  // Проектните клиенти са отделно: пазят се, но не влизат в месечните сметки.
  const projects = active.filter((c) => c.engagement === "project");
  const totalMrr = active.filter((c) => c.engagement !== "project" && c.status !== "Churned").reduce((a, b) => a + b.mrr, 0);
  const [showProjects, setShowProjects] = useState(false);
  const term = q.trim().toLowerCase();
  const pool = showArchived ? clients : active;
  const shown = term
    ? pool.filter((c) => c.name.toLowerCase().includes(term) || c.industry.toLowerCase().includes(term))
    : pool;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-5)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--bm-space-4)", flexWrap: "wrap" }}>
        <div>
          <h1>Клиенти</h1>
          <p className="bm-text-muted" style={{ margin: "4px 0 0" }}>{active.length - projects.length} постоянни · <Money>{fmtK(totalMrr)}</Money> месечно{projects.length ? ` · ${projects.length} проектни` : ""}{archived.length ? ` · ${archived.length} в архив` : ""}</p>
        </div>
        <div style={{ display: "flex", gap: "var(--bm-space-3)", alignItems: "center" }}>
          <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <span style={{ position: "absolute", left: 12, color: "var(--bm-text-subtle)", display: "flex" }}><Icon name="search" size={16} /></span>
            <input className="bm-input" style={{ paddingLeft: 36, width: "100%", maxWidth: 220 }} placeholder="Търси клиенти…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {archived.length > 0 && (
            <button className="bm-btn bm-btn--ghost bm-btn--sm" onClick={() => setShowArchived((v) => !v)}>
              {showArchived ? "Скрий архива" : `Архив (${archived.length})`}
            </button>
          )}
          <button className="bm-btn bm-btn--primary" onClick={() => openModal({ kind: "newClient" })}><Icon name="plus" /> Нов клиент</button>
        </div>
      </div>

      {(() => {
        const card = (c: (typeof shown)[number]) => (
            <div
              key={c.id}
              className="bm-card aw-card-hover"
              onClick={() => router.push(`/clients/${c.id}`)}
              style={{ padding: "var(--bm-space-5)", display: "flex", flexDirection: "column", gap: "var(--bm-space-4)", cursor: "pointer" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "var(--bm-space-3)" }}>
                <span className="bm-avatar bm-avatar--lg">{c.initials}</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 700 }}>{c.name}</div>
                  <div style={{ fontSize: "var(--bm-text-xs)", color: "var(--bm-text-subtle)" }}>{c.industry}</div>
                </div>
                <span className={"bm-badge " + clientStatusMeta(c.status).cls}>{clientStatusMeta(c.status).label}</span>
                {c.archived_at && <span className="bm-badge bm-badge--neutral">архивиран</span>}
                {c.engagement === "project" && <span className="bm-badge bm-badge--neutral">проектен</span>}
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", paddingTop: "var(--bm-space-3)", borderTop: "1px solid var(--bm-border)" }}>
                <div>
                  <div style={{ fontSize: "var(--bm-text-xs)", color: "var(--bm-text-subtle)" }}>Месечно</div>
                  <div style={{ fontWeight: 700, fontSize: "var(--bm-text-lg)", fontFamily: "var(--bm-font-mono)" }}><Money>{fmtFull(c.mrr)}</Money></div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--bm-space-2)" }}>
                  <span style={{ fontSize: "var(--bm-text-xs)", color: "var(--bm-text-subtle)" }}>Отговорник</span>
                  <Avatar initials={c.owner} />
                </div>
              </div>
              {!c.archived_at && c.engagement !== "project" && <ClientMonthBadge client={c} />}
              <button
                className="bm-btn bm-btn--secondary bm-btn--sm"
                onClick={(e) => copyPortal(e, c.id)}
                title="Копира линк, който клиентът отваря без логин — прогрес и резултати на видеата му"
              >
                {copiedId === c.id ? "✓ Линкът е копиран" : "Клиентски портал — копирай линк"}
              </button>
            </div>
        );
        const main = shown.filter((c) => c.engagement !== "project");
        const proj = shown.filter((c) => c.engagement === "project");
        const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "var(--bm-space-4)" };
        return (
          <>
            <div style={grid}>{main.map(card)}</div>
            {proj.length > 0 && (
              <section style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-3)" }}>
                <button type="button" className="bm-btn bm-btn--ghost" style={{ alignSelf: "flex-start" }} aria-expanded={showProjects || !!term} onClick={() => setShowProjects((v) => !v)}>
                  {showProjects || term ? "▾" : "▸"} Проектни клиенти ({proj.length}) <span className="bm-text-subtle" style={{ fontWeight: 400, marginLeft: 8 }}>без месечна такса — пазят се за следващ проект</span>
                </button>
                {(showProjects || !!term) && <div style={grid}>{proj.map(card)}</div>}
              </section>
            )}
          </>
        );
      })()}
    </div>
  );
}
