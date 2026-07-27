"use client";

// Единична карта за одобрение на съдържание, ползвана и от единичния линк
// (/review/<token>) и от груповия (/review/group/<token>). Решението се праща
// към POST /api/review/<token>, където token е approval id-то на конкретното
// видео — затова груповата страница подава item.approval_id.

import { useState } from "react";

export interface ReviewCardItem {
  status: "pending" | "approved" | "changes_requested";
  feedback: string;
  title: string;
  type: string;
  script: string;
  hook: string;
  cta: string;
  caption: string;
  hashtags: string;
  notes: string;
  date: string | null;
}

const TYPE_LABELS: Record<string, string> = { promo: "Промо", info: "Инфо", reel: "Рийл", project: "Реализиран проект", post: "Пост" };

export function ReviewCard({ token, item, onDecided }: { token: string; item: ReviewCardItem; onDecided?: (status: "approved" | "changes_requested") => void }) {
  const [status, setStatus] = useState(item.status);
  const [feedback, setFeedback] = useState("");
  const [draftScript, setDraftScript] = useState(item.script || "");
  const [mode, setMode] = useState<"view" | "changes">("view");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const scriptChanged = draftScript.trim() !== (item.script || "").trim();
  const decided = status !== "pending";

  const decide = async (decision: "approved" | "changes_requested") => {
    setSubmitting(true);
    setError("");
    try {
      const r = await fetch(`/api/review/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, feedback, suggested_script: decision === "changes_requested" && scriptChanged ? draftScript : "" }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Грешка");
      setStatus(decision);
      onDecided?.(decision);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Грешка");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bm-card" style={{ width: "100%" }}>
      <div className="bm-card__body" style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-4)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--bm-space-2)", flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: "var(--bm-text-xl)" }}>{item.title}</h2>
          <span className="bm-badge bm-badge--info">{TYPE_LABELS[item.type] || item.type}</span>
          {item.date && <span className="bm-text-subtle" style={{ fontSize: "var(--bm-text-sm)" }}>Планирано за {item.date}</span>}
          {decided && <span className={"bm-badge " + (status === "approved" ? "bm-badge--success" : "bm-badge--warning")}>{status === "approved" ? "Одобрено" : "Иска промени"}</span>}
        </div>

        {item.hook && (
          <div>
            <div className="bm-label">Кука (първите секунди)</div>
            <div style={{ fontWeight: 600 }}>{item.hook}</div>
          </div>
        )}
        {(item.script || mode === "changes") && (
          <div>
            <div className="bm-label">Сценарий{mode === "changes" ? " — редактирай директно в текста" : ""}</div>
            {mode === "changes" && status === "pending" ? (
              <>
                <textarea
                  className="bm-textarea"
                  style={{ minHeight: 220, fontSize: "var(--bm-text-sm)" }}
                  value={draftScript}
                  onChange={(e) => setDraftScript(e.target.value)}
                  placeholder="Напиши как искаш да звучи сценарият…"
                />
                {scriptChanged && <span className="bm-badge bm-badge--warning" style={{ marginTop: 6 }}>Има редакции — екипът ще ги получи като предложение</span>}
              </>
            ) : (
              <div style={{ whiteSpace: "pre-wrap", fontSize: "var(--bm-text-sm)", background: "var(--bm-surface-2)", padding: "var(--bm-space-3)", borderRadius: "var(--bm-radius-md)" }}>{item.script}</div>
            )}
          </div>
        )}
        {item.cta && (
          <div>
            <div className="bm-label">Призив към действие</div>
            <div style={{ fontSize: "var(--bm-text-sm)" }}>{item.cta}</div>
          </div>
        )}
        {(item.caption || item.hashtags) && (
          <div>
            <div className="bm-label">Описание за публикацията</div>
            <div style={{ whiteSpace: "pre-wrap", fontSize: "var(--bm-text-sm)" }}>{item.caption}</div>
            {item.hashtags && <div className="bm-text-subtle" style={{ fontSize: "var(--bm-text-xs)", marginTop: 4 }}>{item.hashtags}</div>}
          </div>
        )}

        {decided ? (
          <div className={"bm-alert " + (status === "approved" ? "bm-alert--success" : "bm-alert--warning")}>
            {status === "approved" ? "Одобрено — благодарим! Екипът е уведомен и видеото влиза за насрочване." : "Екипът получи редакцията ти и ще я отрази. Благодарим!"}
          </div>
        ) : (
          <>
            {mode === "changes" && (
              <div className="bm-field">
                <label className="bm-label">Бележка към екипа (по избор)</label>
                <textarea className="bm-textarea" value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Ако предпочиташ, опиши промените с думи…" />
              </div>
            )}
            {error && <div className="bm-alert bm-alert--danger">{error}</div>}
            <div style={{ display: "flex", gap: "var(--bm-space-3)", justifyContent: "flex-end" }}>
              {mode === "view" ? (
                <>
                  <button className="bm-btn bm-btn--secondary" onClick={() => setMode("changes")}>Искам промени</button>
                  <button className="bm-btn bm-btn--primary" disabled={submitting} onClick={() => decide("approved")}>{submitting ? "Записване…" : "Одобрявам"}</button>
                </>
              ) : (
                <>
                  <button className="bm-btn bm-btn--ghost" onClick={() => { setMode("view"); setDraftScript(item.script || ""); }}>Назад</button>
                  <button className="bm-btn bm-btn--danger" disabled={submitting || (!feedback.trim() && !scriptChanged)} onClick={() => decide("changes_requested")}>{submitting ? "Записване…" : "Изпрати промените"}</button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
