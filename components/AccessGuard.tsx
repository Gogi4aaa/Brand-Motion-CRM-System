"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useStore } from "./store";
import { canAccess, sectionForPath } from "@/lib/data";

export function AccessGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { currentUser, loading, team, signOut } = useStore();
  const allowed = canAccess(currentUser.level, sectionForPath(pathname));
  // Регистрация, която още не е одобрена от админ, вижда само чакащия екран.
  const me = team.find((m) => m.initials === currentUser.initials);
  const pendingApproval = !loading && !!me && me.approved === false;

  useEffect(() => {
    if (!loading && !allowed && !pendingApproval) router.replace("/dashboard");
  }, [loading, allowed, pendingApproval, router]);

  if (pendingApproval) {
    return (
      <div style={{ minHeight: "60vh", display: "grid", placeItems: "center" }}>
        <div className="bm-card" style={{ maxWidth: 420, textAlign: "center" }}>
          <div className="bm-card__body" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--bm-space-4)", padding: "var(--bm-space-8) var(--bm-space-6)" }}>
            <div style={{ width: 56, height: 56, borderRadius: "var(--bm-radius-lg)", background: "linear-gradient(135deg, var(--bm-brand-500), var(--bm-brand-700))", display: "grid", placeItems: "center", color: "#fff", fontWeight: 800, fontSize: 26 }}>B</div>
            <h2 style={{ margin: 0 }}>Очаква се одобрение</h2>
            <p className="bm-text-muted" style={{ margin: 0, lineHeight: 1.6 }}>Акаунтът ти чака одобрение от администратора на BrandMotion. Ще получиш имейл, щом е готов.</p>
            <button className="bm-btn bm-btn--secondary" onClick={signOut}>Изход</button>
          </div>
        </div>
      </div>
    );
  }

  if (!loading && !allowed) {
    return (
      <div className="bm-card"><div className="bm-card__body bm-text-subtle">
        Нямате достъп до тази секция.
      </div></div>
    );
  }
  return <>{children}</>;
}
