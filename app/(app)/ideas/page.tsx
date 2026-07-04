"use client";

import { useState } from "react";
import { useStore } from "@/components/store";
import { Icon } from "@/components/Icon";
import { ideaSourceMeta, ideaStatusMeta, clientsById, type IdeaStatus } from "@/lib/data";

// Idea Bank — raw ideas and hooks collected before production. Ideas are
// voted on, then "promoted" into a content_item on the production board.
export default function IdeasPage() {
  const { ideas, openModal, voteIdea, setIdeaStatus, promoteIdea, addAiIdeas, currentUser, visibleClients } = useStore();
  const clients = visibleClients;
  const byId = clientsById(clients);
  const allowedIds = new Set(clients.map((c) => c.id));
  const [clientFilter, setClientFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<IdeaStatus | "">("");
  const [aiClient, setAiClient] = useState("");
  const [aiContext, setAiContext] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");

  // General ideas (no client) are visible to everyone; client ideas only to
  // people with access to that client.
  const filtered = ideas.filter(
    (i) => (!i.client || allowedIds.has(i.client)) && (!clientFilter || i.client === clientFilter) && (!statusFilter || i.status === statusFilter)
  );

  const generate = async () => {
    setAiLoading(true);
    setAiError("");
    try {
      const client = clients.find((c) => c.id === aiClient);
      const res = await fetch("/api/ai/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          count: 10,
          clientName: client?.name,
          industry: client?.industry,
          brandVoice: client?.brand_voice,
          targetAudience: client?.target_audience,
          extraContext: aiContext.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Грешка при генериране.");
      addAiIdeas(aiClient, (data.ideas as { title: string; description: string; hook: string }[]).map((x) => ({ title: x.title, description: x.description, hook: x.hook })));
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "Грешка при генериране.");
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-5)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "var(--bm-space-3)", flexWrap: "wrap" }}>
        <div>
          <h1>Банка с идеи</h1>
          <p className="bm-text-muted" style={{ margin: "4px 0 0" }}>Събирай идеи и куки, гласувайте, и промотирай най-добрите в продукция.</p>
        </div>
        <button className="bm-btn bm-btn--primary" onClick={() => openModal({ kind: "idea", mode: "create" })}><Icon name="plus" size={16} /> Нова идея</button>
      </div>

      <div className="bm-card">
        <div className="bm-card__header"><h3>AI идеи от бранд профила</h3></div>
        <div className="bm-card__body" style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-3)" }}>
          {aiError && <div className="bm-alert bm-alert--danger">{aiError}</div>}
          <div className="bm-ai-row">
            <div className="bm-field">
              <label className="bm-label">Клиент</label>
              <select className="bm-select" value={aiClient} onChange={(e) => setAiClient(e.target.value)}>
                <option value="">— общи идеи —</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="bm-field">
              <label className="bm-label">Допълнителен контекст (по избор)</label>
              <input className="bm-input" value={aiContext} onChange={(e) => setAiContext(e.target.value)} placeholder="напр. лятна кампания, ново меню, откриване на обект…" />
            </div>
            <button className="bm-btn bm-btn--secondary" disabled={aiLoading} onClick={generate}>{aiLoading ? "Генерирам…" : "Генерирай 10 идеи"}</button>
          </div>
          <p className="bm-text-subtle" style={{ fontSize: "var(--bm-text-xs)", margin: 0 }}>Използва тона на гласа и целевата аудитория от бранд профила на клиента. Идеите падат в бек-лога с етикет AI.</p>
        </div>
      </div>

      <div style={{ display: "flex", gap: "var(--bm-space-3)", flexWrap: "wrap" }}>
        <select className="bm-select" style={{ maxWidth: 220 }} value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}>
          <option value="">Всички клиенти</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="bm-select" style={{ maxWidth: 200 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as IdeaStatus | "")}>
          <option value="">Всички статуси</option>
          <option value="backlog">Бек-лог</option>
          <option value="approved">Одобрени</option>
          <option value="promoted">В продукция</option>
          <option value="archived">Архив</option>
        </select>
      </div>

      {filtered.length === 0 && (
        <div className="bm-card"><div className="bm-card__body bm-text-muted">Няма идеи по тези филтри. Добави ръчно или генерирай с AI.</div></div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "var(--bm-space-4)" }}>
        {filtered.map((i) => {
          const src = ideaSourceMeta(i.source);
          const st = ideaStatusMeta(i.status);
          return (
            <div key={i.id} className="bm-card" style={{ padding: "var(--bm-space-4)", display: "flex", flexDirection: "column", gap: "var(--bm-space-3)" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "var(--bm-space-2)" }}>
                <div style={{ fontWeight: 700, cursor: "pointer" }} onClick={() => openModal({ kind: "idea", mode: "edit", idea: i })}>{i.title}</div>
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  <span className={"bm-badge " + src.cls}>{src.label}</span>
                  <span className={"bm-badge " + st.cls}>{st.label}</span>
                </div>
              </div>
              {i.hook && <div style={{ fontSize: "var(--bm-text-sm)" }}>🪝 {i.hook}</div>}
              {i.description && <div className="bm-text-muted" style={{ fontSize: "var(--bm-text-sm)" }}>{i.description}</div>}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto", paddingTop: "var(--bm-space-2)", borderTop: "1px solid var(--bm-border)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--bm-space-2)" }}>
                  <button className="bm-btn bm-btn--ghost bm-btn--sm" title="Гласувай" onClick={() => voteIdea(i.id, 1)}>▲ {i.votes || 0}</button>
                  <span className="bm-text-subtle" style={{ fontSize: "var(--bm-text-xs)" }}>{i.client ? byId[i.client]?.name || i.client : "Общa"}</span>
                </div>
                <div style={{ display: "flex", gap: "var(--bm-space-2)" }}>
                  {i.status !== "promoted" && i.status !== "archived" && (
                    <button className="bm-btn bm-btn--secondary bm-btn--sm" onClick={() => promoteIdea(i.id)} title="Създава видео карта на дъската за продукция">В продукция</button>
                  )}
                  {i.status === "backlog" && currentUser.level !== "worker" && (
                    <button className="bm-btn bm-btn--ghost bm-btn--sm" onClick={() => setIdeaStatus(i.id, "archived")}>Архив</button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
