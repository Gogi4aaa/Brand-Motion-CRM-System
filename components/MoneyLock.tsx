"use client";

// Блър на всички суми в админ панела (поверителност — отварям системата навсякъде).
// Всяка сума минава през <Money>. По подразбиране е замъглена; цъкане иска парола
// (акаунт паролата на текущия потребител). Верен вход отключва ВСИЧКИ суми за
// сесията (докато не се презареди или се заключи ръчно от бутона в лентата горе).

import { createContext, useContext, useState, useCallback } from "react";
import { createClient, supabaseConfigured } from "@/lib/supabase/client";

interface MoneyCtx { revealed: boolean; requestUnlock: () => void; relock: () => void; }
const Ctx = createContext<MoneyCtx>({ revealed: true, requestUnlock: () => {}, relock: () => {} });
export const useMoneyLock = () => useContext(Ctx);

export function MoneyLockProvider({ children }: { children: React.ReactNode }) {
  const [revealed, setRevealed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem("bm-money-revealed") === "1";
  });
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const reveal = () => { setRevealed(true); try { sessionStorage.setItem("bm-money-revealed", "1"); } catch { /* ignore */ } };
  const relock = useCallback(() => { setRevealed(false); try { sessionStorage.removeItem("bm-money-revealed"); } catch { /* ignore */ } }, []);
  const requestUnlock = useCallback(() => { setErr(""); setPw(""); setOpen(true); }, []);

  const submit = async () => {
    setErr(""); setBusy(true);
    // Демо/без Supabase → няма акаунт за проверка, просто отключваме.
    if (!supabaseConfigured) { reveal(); setOpen(false); setBusy(false); return; }
    try {
      const client = createClient();
      const { data: u } = await client.auth.getUser();
      const email = u.user?.email;
      if (!email) { setErr("Няма активна сесия — влез отново."); setBusy(false); return; }
      const { error } = await client.auth.signInWithPassword({ email, password: pw });
      if (error) { setErr("Грешна парола."); setBusy(false); return; }
      reveal(); setOpen(false);
    } catch { setErr("Възникна грешка. Опитай пак."); }
    finally { setBusy(false); }
  };

  return (
    <Ctx.Provider value={{ revealed, requestUnlock, relock }}>
      {children}
      {open && (
        <div className="bm-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="bm-modal" style={{ maxWidth: 380 }}>
            <div className="bm-modal__header"><h3>Отключи сумите</h3></div>
            <div className="bm-modal__body" style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-3)" }}>
              <p className="bm-text-subtle" style={{ fontSize: "var(--bm-text-sm)", margin: 0 }}>Въведи паролата на акаунта си, за да покажеш всички суми в системата.</p>
              <input className="bm-input" type="password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && pw && !busy) submit(); }} placeholder="Парола" />
              {err && <div className="bm-alert bm-alert--danger">{err}</div>}
            </div>
            <div className="bm-modal__footer">
              <button className="bm-btn bm-btn--secondary" onClick={() => setOpen(false)}>Отказ</button>
              <button className="bm-btn bm-btn--primary" disabled={!pw || busy} onClick={submit}>{busy ? "Проверка…" : "Отключи"}</button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

// Обвивка на всяка сума. Замъглена, докато не се отключи; цъкане иска парола.
export function Money({ children }: { children: React.ReactNode }) {
  const { revealed, requestUnlock } = useMoneyLock();
  if (revealed) return <>{children}</>;
  return (
    <span
      className="bm-money-locked"
      role="button"
      tabIndex={0}
      title="Скрито — цъкни, за да отключиш сумите"
      onClick={(e) => { e.stopPropagation(); requestUnlock(); }}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); requestUnlock(); } }}
    >
      {children}
    </span>
  );
}
