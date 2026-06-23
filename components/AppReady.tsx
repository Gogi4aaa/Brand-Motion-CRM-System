"use client";

import { useState } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { Modals } from "./Modals";
import { AccessGuard } from "./AccessGuard";
import { PushInit } from "./PushInit";
import { useStore } from "./store";

export function AppReady({ children }: { children: React.ReactNode }) {
  const { loading } = useStore();
  const [navOpen, setNavOpen] = useState(false);

  // While the user's profile/role is loading, show only a spinner — never the
  // shell. This prevents workers from briefly seeing the admin layout/data.
  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--bm-bg)" }}>
        <span className="bm-spinner" style={{ color: "var(--bm-primary)", width: 28, height: 28 }} />
      </div>
    );
  }

  return (
    <>
      <div className="bm-shell">
        <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
        {navOpen && <div className="bm-nav-backdrop" onClick={() => setNavOpen(false)} />}
        <div className="bm-content">
          <Topbar onMenu={() => setNavOpen(true)} />
          <main className="bm-main">
            <AccessGuard>{children}</AccessGuard>
          </main>
        </div>
      </div>
      <Modals />
      <PushInit />
    </>
  );
}
