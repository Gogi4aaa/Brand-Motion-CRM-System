"use client";

// Тук води линкът „забравена парола“ от имейла. Supabase разменя кода от URL-а
// за временна (recovery) сесия автоматично; потребителят задава нова парола и
// влиза направо в системата.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient, supabaseConfigured } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState<"checking" | "ok" | "invalid">(() => (supabaseConfigured ? "checking" : "invalid"));
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Изчаква recovery сесията от линка (code exchange-ът е асинхронен).
  useEffect(() => {
    if (!supabaseConfigured) return;
    const sb = createClient();
    let cancelled = false;
    let tries = 0;
    const check = async () => {
      const { data } = await sb.auth.getSession();
      if (cancelled) return;
      if (data.session) { setReady("ok"); return; }
      if (++tries < 10) setTimeout(check, 400);
      else setReady("invalid");
    };
    check();
    return () => { cancelled = true; };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (next.length < 8) { setError("Паролата трябва да е поне 8 знака."); return; }
    if (next !== again) { setError("Паролите не съвпадат."); return; }
    setBusy(true);
    const { error: err } = await createClient().auth.updateUser({ password: next });
    setBusy(false);
    if (err) { setError(err.message); return; }
    router.push("/dashboard");
    router.refresh();
  };

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "var(--bm-space-4)", background: "var(--bm-bg)" }}>
      <div className="bm-card" style={{ width: "100%", maxWidth: 400 }}>
        <div className="bm-card__body" style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-5)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--bm-space-3)" }}>
            <div style={{ width: 36, height: 36, borderRadius: "var(--bm-radius-md)", background: "linear-gradient(135deg, var(--bm-brand-500), var(--bm-brand-700))", display: "grid", placeItems: "center", color: "#fff", fontWeight: 700 }}>B</div>
            <div>
              <div style={{ fontWeight: 700, letterSpacing: "var(--bm-tracking-tight)" }}>BrandMotion CRM</div>
              <div className="bm-text-subtle" style={{ fontSize: "var(--bm-text-xs)" }}>Нова парола</div>
            </div>
          </div>

          {ready === "checking" && <div className="bm-text-muted">Проверка на линка…</div>}
          {ready === "invalid" && (
            <div className="bm-alert bm-alert--danger">
              Линкът е невалиден или е изтекъл. <a href="/login" style={{ fontWeight: 700 }}>Поискай нов от „Забравена парола“</a>.
            </div>
          )}
          {ready === "ok" && (
            <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-4)" }}>
              <div className="bm-field">
                <label className="bm-label" htmlFor="new">Нова парола (мин. 8 знака)</label>
                <input id="new" className="bm-input" type="password" required minLength={8} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
              </div>
              <div className="bm-field">
                <label className="bm-label" htmlFor="again">Повтори новата парола</label>
                <input id="again" className="bm-input" type="password" required autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
              </div>
              {error && <div className="bm-alert bm-alert--danger">{error}</div>}
              <button className="bm-btn bm-btn--primary" type="submit" disabled={busy} style={{ width: "100%" }}>
                {busy ? "Записване…" : "Запази и влез"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
