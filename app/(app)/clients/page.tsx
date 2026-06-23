"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/components/store";
import { Icon } from "@/components/Icon";
import { healthMeta, fmtK, fmtFull } from "@/lib/data";

export default function ClientsPage() {
  const { clients, openModal } = useStore();
  const router = useRouter();
  const [q, setQ] = useState("");
  const totalMrr = clients.reduce((a, b) => a + b.mrr, 0);
  const term = q.trim().toLowerCase();
  const shown = term
    ? clients.filter((c) => c.name.toLowerCase().includes(term) || c.industry.toLowerCase().includes(term))
    : clients;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-5)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--bm-space-4)", flexWrap: "wrap" }}>
        <div>
          <h1>Клиенти</h1>
          <p className="bm-text-muted" style={{ margin: "4px 0 0" }}>{clients.length} акаунта · {fmtK(totalMrr)} месечно</p>
        </div>
        <div style={{ display: "flex", gap: "var(--bm-space-3)", alignItems: "center" }}>
          <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <span style={{ position: "absolute", left: 12, color: "var(--bm-text-subtle)", display: "flex" }}><Icon name="search" size={16} /></span>
            <input className="bm-input" style={{ paddingLeft: 36, width: "100%", maxWidth: 220 }} placeholder="Търси клиенти…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <button className="bm-btn bm-btn--secondary" onClick={() => openModal({ kind: "client", mode: "create" })}><Icon name="plus" /> Добави клиент</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "var(--bm-space-4)" }}>
        {shown.map((c) => {
          const h = healthMeta(c.health);
          return (
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
                <span className={"bm-badge " + h.cls}>{h.label}</span>
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", paddingTop: "var(--bm-space-3)", borderTop: "1px solid var(--bm-border)" }}>
                <div>
                  <div style={{ fontSize: "var(--bm-text-xs)", color: "var(--bm-text-subtle)" }}>Месечно</div>
                  <div style={{ fontWeight: 700, fontSize: "var(--bm-text-lg)", fontFamily: "var(--bm-font-mono)" }}>{fmtFull(c.mrr)}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--bm-space-2)" }}>
                  <span style={{ fontSize: "var(--bm-text-xs)", color: "var(--bm-text-subtle)" }}>Отговорник</span>
                  <span className="bm-avatar bm-avatar--sm">{c.owner}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
