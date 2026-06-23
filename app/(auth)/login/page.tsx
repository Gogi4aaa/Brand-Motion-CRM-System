"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient, supabaseConfigured } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
      if (mode === "signup") {
        const { error } = await sb.auth.signUp({
          email,
          password,
          options: { data: { name: name.trim() || email.split("@")[0] } },
        });
        if (error) throw error;
        const { data } = await sb.auth.getSession();
        if (data.session) {
          router.push("/dashboard");
          router.refresh();
        } else {
          setNotice("Акаунтът е създаден. Провери имейла си за потвърждение, после влез.");
          setMode("signin");
        }
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push("/dashboard");
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Възникна грешка.");
    } finally {
      setBusy(false);
    }
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
            <div className="bm-field">
              <label className="bm-label" htmlFor="password">Парола</label>
              <input id="password" className="bm-input" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete={mode === "signin" ? "current-password" : "new-password"} />
            </div>
            <button className="bm-btn bm-btn--primary" type="submit" disabled={busy} data-loading={busy} style={{ width: "100%" }}>
              {busy && <span className="bm-spinner" />} {mode === "signin" ? "Вход" : "Създай акаунт"}
            </button>
          </form>

          <div style={{ fontSize: "var(--bm-text-sm)", textAlign: "center", color: "var(--bm-text-muted)" }}>
            {mode === "signin" ? (
              <>Нов потребител?{" "}<button className="bm-btn bm-btn--ghost bm-btn--sm" onClick={() => { setMode("signup"); setError(null); }}>Създай акаунт</button></>
            ) : (
              <>Вече имаш акаунт?{" "}<button className="bm-btn bm-btn--ghost bm-btn--sm" onClick={() => { setMode("signin"); setError(null); }}>Вход</button></>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
