"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "./Icon";
import { useStore } from "./store";

function ago(iso: string) {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "току-що";
  if (s < 3600) return Math.floor(s / 60) + " мин.";
  if (s < 86400) return Math.floor(s / 3600) + " ч.";
  return Math.floor(s / 86400) + " д.";
}

function Notifications() {
  const { notifications, markNotificationRead, markAllNotificationsRead } = useStore();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const unread = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button className="bm-btn bm-btn--ghost bm-btn--icon" aria-label="Известия" onClick={() => setOpen((o) => !o)} style={{ position: "relative" }}>
        <Icon name="bell" />
        {unread > 0 && (
          <span style={{ position: "absolute", top: 2, right: 2, minWidth: 16, height: 16, padding: "0 4px", borderRadius: "var(--bm-radius-full)", background: "var(--bm-danger-500)", color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid var(--bm-surface)" }}>{unread > 9 ? "9+" : unread}</span>
        )}
      </button>
      {open && (
        <div style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", width: 340, maxHeight: 420, overflowY: "auto", background: "var(--bm-surface)", border: "1px solid var(--bm-border)", borderRadius: "var(--bm-radius-lg)", boxShadow: "var(--bm-shadow-lg)", zIndex: 20 }}>
          <div style={{ position: "sticky", top: 0, background: "var(--bm-surface)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "var(--bm-space-3) var(--bm-space-4)", borderBottom: "1px solid var(--bm-border)" }}>
            <span style={{ fontWeight: 600, fontSize: "var(--bm-text-sm)" }}>Известия</span>
            {unread > 0 && <button className="bm-btn bm-btn--ghost" style={{ fontSize: "var(--bm-text-xs)", padding: "2px 6px" }} onClick={() => markAllNotificationsRead()}>Отбележи всички</button>}
          </div>
          {notifications.length === 0 ? (
            <div style={{ padding: "var(--bm-space-4)", fontSize: "var(--bm-text-sm)", color: "var(--bm-text-subtle)" }}>Все още няма.</div>
          ) : (
            notifications.slice(0, 20).map((n) => (
              <div
                key={n.id}
                onClick={() => { markNotificationRead(n.id); if (n.entity_type === "content") router.push("/production"); setOpen(false); }}
                style={{ display: "flex", gap: "var(--bm-space-3)", padding: "var(--bm-space-3) var(--bm-space-4)", borderBottom: "1px solid var(--bm-border)", cursor: "pointer", background: n.read ? "transparent" : "var(--bm-info-50)" }}
              >
                <span className="bm-avatar bm-avatar--sm">{n.actor_initials}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: "var(--bm-text-sm)" }}>{n.body}</div>
                  <small style={{ color: "var(--bm-text-subtle)" }}>{ago(n.created_at)}</small>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function ThemeToggle() {
  const toggle = () => {
    const el = document.documentElement;
    const next = el.getAttribute("data-theme") === "dark" ? "light" : "dark";
    el.setAttribute("data-theme", next);
  };
  return (
    <button className="bm-btn bm-btn--ghost bm-btn--icon" onClick={toggle} aria-label="Смени тема" title="Смени тема">
      <Icon name="moon" />
    </button>
  );
}

export function Topbar({ onMenu }: { onMenu?: () => void }) {
  const pathname = usePathname();
  const { openModal } = useStore();
  const isTasks = pathname.startsWith("/tasks");

  return (
    <header className="bm-topbar">
      <button className="bm-btn bm-btn--ghost bm-btn--icon bm-menu-btn" onClick={onMenu} aria-label="Меню">
        <Icon name="menu" />
      </button>
      <div className="bm-search">
        <span style={{ position: "absolute", left: 12, color: "var(--bm-text-subtle)", display: "flex" }}>
          <Icon name="search" />
        </span>
        <input className="bm-input" style={{ paddingLeft: 38 }} placeholder="Търси клиенти, фактури, задачи…" />
      </div>
      <div style={{ flex: 1 }} />
      <ThemeToggle />
      <Notifications />
      <button className="bm-btn bm-btn--primary" onClick={() => openModal(isTasks ? { kind: "task", mode: "create" } : { kind: "invoice", mode: "create" })}>
        <Icon name="plus" /> {isTasks ? "Нова задача" : "Нова фактура"}
      </button>
    </header>
  );
}
