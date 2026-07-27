"use client";

// Public grouped-approval page — opened from a single magic link that covers
// many videos. No login: everything goes through /api/review/batch/<token>.
// The client decides per video; each card posts to /api/review/<approval_id>.

import { useEffect, useState, use } from "react";
import { ReviewCard, type ReviewCardItem } from "@/components/ReviewCard";

interface BatchItem extends ReviewCardItem {
  approval_id: string;
  content_item_id: string;
}
interface BatchData {
  client_name: string;
  items: BatchItem[];
}

export default function GroupReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [data, setData] = useState<BatchData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  // Локален брояч на прегледаните — вдига се, когато карта се реши.
  const [decidedIds, setDecidedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch(`/api/review/batch/${token}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Грешка");
        const d = j as BatchData;
        setData(d);
        setDecidedIds(new Set(d.items.filter((i) => i.status !== "pending").map((i) => i.approval_id)));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const shell: React.CSSProperties = { minHeight: "100vh", background: "var(--bm-surface-2)", display: "flex", justifyContent: "center", padding: "var(--bm-space-6) var(--bm-space-4)" };
  const wrap: React.CSSProperties = { width: "100%", maxWidth: 680, display: "flex", flexDirection: "column", gap: "var(--bm-space-4)" };

  if (loading) return <div style={shell}><div className="bm-card" style={{ maxWidth: 680, width: "100%", height: "fit-content" }}><div className="bm-card__body bm-text-muted">Зареждане…</div></div></div>;
  if (error && !data) return <div style={shell}><div className="bm-card" style={{ maxWidth: 680, width: "100%", height: "fit-content" }}><div className="bm-card__body"><div className="bm-alert bm-alert--danger">{error}</div></div></div></div>;
  if (!data) return null;

  const total = data.items.length;
  const done = decidedIds.size;

  return (
    <div style={shell}>
      <div style={wrap}>
        <div className="bm-card">
          <div className="bm-card__body" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--bm-space-3)", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--bm-space-3)" }}>
              <div style={{ width: 34, height: 34, borderRadius: "var(--bm-radius-md)", background: "linear-gradient(135deg, var(--bm-brand-500), var(--bm-brand-700))", display: "grid", placeItems: "center", color: "#fff", fontWeight: 700 }}>B</div>
              <div>
                <div style={{ fontWeight: 700 }}>BrandMotion — одобрение на съдържание</div>
                <div className="bm-text-subtle" style={{ fontSize: "var(--bm-text-xs)" }}>{data.client_name}</div>
              </div>
            </div>
            <span className={"bm-badge " + (done === total ? "bm-badge--success" : "bm-badge--info")}>Прегледани {done}/{total}</span>
          </div>
        </div>

        {total === 0 && <div className="bm-card"><div className="bm-card__body bm-text-subtle">Няма видеа за преглед в този линк.</div></div>}

        {data.items.map((it) => (
          <ReviewCard
            key={it.approval_id}
            token={it.approval_id}
            item={it}
            onDecided={() => setDecidedIds((s) => new Set(s).add(it.approval_id))}
          />
        ))}

        {total > 0 && done === total && (
          <div className="bm-alert bm-alert--success">Прегледа̀ всички видеа — благодарим! Екипът е уведомен.</div>
        )}
      </div>
    </div>
  );
}
