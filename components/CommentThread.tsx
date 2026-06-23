"use client";

import { useState } from "react";
import { useStore } from "./store";

function ago(iso: string) {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "току-що";
  if (s < 3600) return Math.floor(s / 60) + " мин.";
  if (s < 86400) return Math.floor(s / 3600) + " ч.";
  return Math.floor(s / 86400) + " д.";
}

export function CommentThread({ entityType, entityId }: { entityType: "client" | "task"; entityId: string }) {
  const { comments, addComment } = useStore();
  const [body, setBody] = useState("");
  const thread = comments
    .filter((c) => c.entity_type === entityType && c.entity_id === entityId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  const submit = () => {
    if (!body.trim()) return;
    addComment(entityType, entityId, body);
    setBody("");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-3)" }}>
      {thread.length === 0 && (
        <p className="bm-text-subtle" style={{ fontSize: "var(--bm-text-sm)", margin: 0 }}>Все още няма коментари.</p>
      )}
      {thread.map((c) => (
        <div key={c.id} style={{ display: "flex", gap: "var(--bm-space-3)" }}>
          <span className="bm-avatar bm-avatar--sm">{c.author_initials}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "var(--bm-text-sm)" }}>
              <b>{c.author_name}</b>{" "}
              <span className="bm-text-subtle" style={{ fontSize: "var(--bm-text-xs)" }}>{ago(c.created_at)}</span>
            </div>
            <div style={{ fontSize: "var(--bm-text-sm)", color: "var(--bm-text-muted)" }}>{c.body}</div>
          </div>
        </div>
      ))}
      <div style={{ display: "flex", gap: "var(--bm-space-2)", marginTop: "var(--bm-space-1)" }}>
        <input
          className="bm-input"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
          placeholder="Напиши коментар…"
        />
        <button className="bm-btn bm-btn--primary" onClick={submit} disabled={!body.trim()}>Публикувай</button>
      </div>
    </div>
  );
}
