"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient, supabaseConfigured } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (!supabaseConfigured) {
      router.push("/dashboard"); // mock mode: no auth
      return;
    }

    setBusy(true);
    try {
      const sb = createClient();
      if (mode === "forgot") {
        // Линкът от имейла връща тук на /reset-password, където се задава нова парола.
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
        if (error) throw error;
        setNotice("Изпратихме линк за нова парола на " + email + ". Провери пощата си (и спам папката).");
        return;
      }
      if (mode === "signup") {
        const res = await fetch("/api/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim(), email, password }),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || "Регистрацията не мина.");
        setPending(true); // брандираният екран „чака одобрение“
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) {
          // Непотвърден имейл = заявката още чака одобрение от администратора.
          if (/not confirmed/i.test(error.message)) { setPending(true); return; }
          throw error;
        }
        router.push("/dashboard");
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Възникна грешка.");
    } finally {
      setBusy(false);
    }
  }

  if (pending) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "var(--bm-space-4)", background: "linear-gradient(160deg, var(--bm-brand-600), var(--bm-brand-800, var(--bm-brand-700)))" }}>
        <div className="bm-card" style={{ width: "100%", maxWidth: 420, textAlign: "center" }}>
          <div className="bm-card__body" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--bm-space-4)", padding: "var(--bm-space-8) var(--bm-space-6)" }}>
            <div style={{ width: 56, height: 56, borderRadius: "var(--bm-radius-lg)", background: "linear-gradient(135deg, var(--bm-brand-500), var(--bm-brand-700))", display: "grid", placeItems: "center", color: "#fff", fontWeight: 800, fontSize: 26 }}>B</div>
            <h2 style={{ margin: 0 }}>Заявката е приета</h2>
            <p className="bm-text-muted" style={{ margin: 0, lineHeight: 1.6 }}>
              Акаунтът ти очаква <b>одобрение от администратора</b> на BrandMotion.
              Щом бъде одобрен, ще получиш имейл за потвърждение и ще можеш да влезеш.
            </p>
            <button className="bm-btn bm-btn--secondary" onClick={() => { setPending(false); setMode("signin"); setError(null); }}>Обратно към входа</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "var(--bm-space-4)", background: "var(--bm-bg)" }}>
      <div className="bm-card" style={{ width: "100%", maxWidth: 400 }}>
        <div className="bm-card__body" style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-5)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--bm-space-3)" }}>
            <div style={{ width: 36, height: 36, borderRadius: "var(--bm-radius-md)", background: "linear-gradient(135deg, var(--bm-brand-500), var(--bm-brand-700))", display: "grid", placeItems: "center", color: "#fff", fontWeight: 700 }}>B</div>
            <div>
              <div style={{ fontWeight: 700, letterSpacing: "var(--bm-tracking-tight)" }}>BrandMotion CRM</div>
              <div className="bm-text-subtle" style={{ fontSize: "var(--bm-text-xs)" }}>{mode === "signin" ? "Влез в работното пространство" : "Създай акаунт"}</div>
            </div>
          </div>

          {error && <div className="bm-alert bm-alert--danger">{error}</div>}
          {notice && <div className="bm-alert bm-alert--success">{notice}</div>}

          <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-4)" }}>
            {mode === "signup" && (
              <div className="bm-field">
                <label className="bm-label" htmlFor="name">Пълно име</label>
                <input id="name" className="bm-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Георги Димитров" autoComplete="name" />
              </div>
            )}
            <div className="bm-field">
              <label className="bm-label" htmlFor="email">Имейл</label>
              <input id="email" className="bm-input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@agency.com" autoComplete="email" />
            </div>
            {mode !== "forgot" && (
            <div className="bm-field">
              <label className="bm-label" htmlFor="password">Парола</label>
              <input id="password" className="bm-input" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete={mode === "signin" ? "current-password" : "new-password"} />
            </div>
            )}
            <button className="bm-btn bm-btn--primary" type="submit" disabled={busy} data-loading={busy} style={{ width: "100%" }}>
              {busy && <span className="bm-spinner" />} {mode === "signin" ? "Вход" : mode === "signup" ? "Създай акаунт" : "Изпрати линк за нова парола"}
            </button>
          </form>

          <div style={{ fontSize: "var(--bm-text-sm)", textAlign: "center", color: "var(--bm-text-muted)" }}>
            {mode === "signin" ? (
              <>
                <div>Нов потребител?{" "}<button className="bm-btn bm-btn--ghost bm-btn--sm" onClick={() => { setMode("signup"); setError(null); }}>Създай акаунт</button></div>
                <div><button className="bm-btn bm-btn--ghost bm-btn--sm" onClick={() => { setMode("forgot"); setError(null); setNotice(null); }}>Забравена парола?</button></div>
              </>
            ) : (
              <>Вече имаш акаунт?{" "}<button className="bm-btn bm-btn--ghost bm-btn--sm" onClick={() => { setMode("signin"); setError(null); setNotice(null); }}>Вход</button></>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
