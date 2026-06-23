"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./Icon";
import { useStore } from "./store";
import { fmtK, canAccess } from "@/lib/data";

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: "/dashboard", label: "Табло", icon: "dashboard" },
  { href: "/tasks", label: "Задачи", icon: "tasks" },
  { href: "/pipeline", label: "Сделки", icon: "pipeline" },
  { href: "/clients", label: "Клиенти", icon: "clients" },
  { href: "/calendar", label: "Съдържание", icon: "calendar" },
  { href: "/production", label: "Продукция", icon: "production" },
  { href: "/campaigns", label: "Кампании", icon: "campaign" },
  { href: "/invoices", label: "Фактури", icon: "invoices" },
  { href: "/analytics", label: "Анализи", icon: "analytics" },
  { href: "/social", label: "Социални", icon: "video" },
  { href: "/team", label: "Екип", icon: "team" },
];

export function Sidebar({ open = false, onClose }: { open?: boolean; onClose?: () => void }) {
  const pathname = usePathname();
  const { invoices, currentUser, signOut } = useStore();
  const collected = invoices.filter((i) => i.status === "paid").reduce((a, b) => a + b.amount, 0);

  return (
    <aside className={"bm-sidebar" + (open ? " bm-sidebar--open" : "")}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--bm-space-3)", padding: "var(--bm-space-2)" }}>
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: "var(--bm-radius-md)",
            background: "linear-gradient(135deg, var(--bm-brand-500), var(--bm-brand-700))",
            display: "grid",
            placeItems: "center",
            color: "#fff",
            fontWeight: 700,
          }}
        >
          B
        </div>
        <span style={{ fontWeight: 700, letterSpacing: "var(--bm-tracking-tight)", fontSize: "var(--bm-text-base)" }}>
          BrandMotion
        </span>
      </div>

      <nav className="bm-nav">
        <span
          style={{
            fontSize: "var(--bm-text-xs)",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "var(--bm-tracking-wide)",
            color: "var(--bm-text-subtle)",
            padding: "0 var(--bm-space-3) var(--bm-space-1)",
          }}
        >
          Работно пространство
        </span>
        {NAV.filter((item) => canAccess(currentUser.level, item.href.replace("/", ""))).map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link key={item.href} href={item.href} onClick={onClose} className={"bm-nav__item" + (active ? " bm-nav__item--active" : "")}>
              <Icon name={item.icon} /> {item.label}
            </Link>
          );
        })}
      </nav>

      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: "var(--bm-space-3)" }}>
        <div
          style={{
            background: "var(--bm-surface-2)",
            borderRadius: "var(--bm-radius-lg)",
            padding: "var(--bm-space-4)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--bm-space-2)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ fontSize: "var(--bm-text-xs)", color: "var(--bm-text-subtle)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "var(--bm-tracking-wide)" }}>
              Събрано · Юни
            </span>
            <span style={{ fontSize: "var(--bm-text-xs)", color: "var(--bm-success-600)", fontWeight: 700 }}>72%</span>
          </div>
          <div style={{ fontSize: "var(--bm-text-xl)", fontWeight: 700, letterSpacing: "var(--bm-tracking-tight)" }}>{fmtK(collected)}</div>
          <div className="bm-progress">
            <div className="bm-progress__bar" style={{ width: "72%" }} />
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--bm-space-3)", padding: "var(--bm-space-3)", borderTop: "1px solid var(--bm-border)" }}>
          <span className="bm-avatar">{currentUser.initials}</span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: "var(--bm-text-sm)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentUser.name}</div>
            <div className="bm-text-subtle" style={{ fontSize: "var(--bm-text-xs)" }}>{currentUser.role}</div>
          </div>
          <button className="bm-btn bm-btn--ghost bm-btn--icon" onClick={signOut} aria-label="Изход" title="Изход">
            <Icon name="back" size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}
