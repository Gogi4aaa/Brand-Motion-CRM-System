"use client";

// Public client-approval page — opened from the magic link the agency sends.
// No login: everything goes through /api/review/<token>, which resolves the
// unguessable token server-side. The client sees the video content (script,
// caption) styled as a simple review card and decides Approve / Request changes.

import { useEffect, useState, use } from "react";

interface ReviewData {
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
  client_name: string;
  date: string | null;
}

const TYPE_LABELS: Record<string, string> = { promo: "Промо", info: "Инфо", reel: "Рийл", project: "Реализиран проект", post: "Пост" };

export default function ReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [data, setData] = useState<ReviewData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");
  // В режим „Искам промени“ клиентът пише директно в сценария; изпраща се
  // само ако реално се различава от оригинала.
  const [draftScript, setDraftScript] = useState("");
  const [mode, setMode] = useState<"view" | "changes">("view");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(`/api/review/${token}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Грешка");
        setData(j as ReviewData);
        setDraftScript((j as ReviewData).script || "");
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const scriptChanged = !!data && draftScript.trim() !== (data.script || "").trim();

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
      setData((d) => (d ? { ...d, status: decision, feedback } : d));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Грешка");
    } finally {
      setSubmitting(false);
    }
  };

  const shell: React.CSSProperties = { minHeight: "100vh", background: "var(--bm-surface-2)", display: "flex", justifyContent: "center", padding: "var(--bm-space-6) var(--bm-space-4)" };
  const card: React.CSSProperties = { width: "100%", maxWidth: 640, height: "fit-content" };

  if (loading) return <div style={shell}><div className="bm-card" style={card}><div className="bm-card__body bm-text-muted">Зареждане…</div></div></div>;
  if (error && !data) return <div style={shell}><div className="bm-card" style={card}><div className="bm-card__body"><div className="bm-alert bm-alert--danger">{error}</div></div></div></div>;
  if (!data) return null;

  const decided = data.status !== "pending";

  return (
    <div style={shell}>
      <div className="bm-card" style={card}>
        <div className="bm-card__body" style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-4)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--bm-space-3)" }}>
            <div style={{ width: 34, height: 34, borderRadius: "var(--bm-radius-md)", background: "linear-gradient(135deg, var(--bm-brand-500), var(--bm-brand-700))", display: "grid", placeItems: "center", color: "#fff", fontWeight: 700 }}>B</div>
            <div>
              <div style={{ fontWeight: 700 }}>BrandMotion — одобрение на съдържание</div>
              <div className="bm-text-subtle" style={{ fontSize: "var(--bm-text-xs)" }}>{data.client_name}</div>
            </div>
          </div>

          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--bm-space-2)", flexWrap: "wrap" }}>
              <h2 style={{ margin: 0, fontSize: "var(--bm-text-xl)" }}>{data.title}</h2>
              <span className="bm-badge bm-badge--info">{TYPE_LABELS[data.type] || data.type}</span>
              {data.date && <span className="bm-text-subtle" style={{ fontSize: "var(--bm-text-sm)" }}>Планирано за {data.date}</span>}
            </div>
          </div>

          {data.hook && (
            <div>
              <div className="bm-label">Кука (първите секунди)</div>
              <div style={{ fontWeight: 600 }}>{data.hook}</div>
            </div>
          )}
          {(data.script || mode === "changes") && (
            <div>
              <div className="bm-label">Сценарий{mode === "changes" ? " — редактирай директно в текста" : ""}</div>
              {mode === "changes" && data.status === "pending" ? (
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
                <div style={{ whiteSpace: "pre-wrap", fontSize: "var(--bm-text-sm)", background: "var(--bm-surface-2)", padding: "var(--bm-space-3)", borderRadius: "var(--bm-radius-md)" }}>{data.script}</div>
              )}
            </div>
          )}
          {data.cta && (
            <div>
              <div className="bm-label">Призив към действие</div>
              <div style={{ fontSize: "var(--bm-text-sm)" }}>{data.cta}</div>
            </div>
          )}
          {(data.caption || data.hashtags) && (
            <div>
              <div className="bm-label">Описание за публикацията</div>
              <div style={{ whiteSpace: "pre-wrap", fontSize: "var(--bm-text-sm)" }}>{data.caption}</div>
              {data.hashtags && <div className="bm-text-subtle" style={{ fontSize: "var(--bm-text-xs)", marginTop: 4 }}>{data.hashtags}</div>}
            </div>
          )}

          {decided ? (
            <div className={"bm-alert " + (data.status === "approved" ? "bm-alert--success" : "bm-alert--warning")}>
              {data.status === "approved" ? "Одобрено — благодарим! Екипът е уведомен и видеото влиза за насрочване." : "Екипът получи редакцията ти и ще я отрази. Благодарим!"}
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
                    <button className="bm-btn bm-btn--ghost" onClick={() => { setMode("view"); setDraftScript(data.script || ""); }}>Назад</button>
                    <button className="bm-btn bm-btn--danger" disabled={submitting || (!feedback.trim() && !scriptChanged)} onClick={() => decide("changes_requested")}>{submitting ? "Записване…" : "Изпрати промените"}</button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
