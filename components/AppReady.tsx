"use client";

import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { Modals } from "./Modals";
import { AccessGuard } from "./AccessGuard";
import { PushInit } from "./PushInit";
import { useStore } from "./store";

export function AppReady({ children }: { children: React.ReactNode }) {
  const { loading } = useStore();

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
      <div style={{ display: "grid", gridTemplateColumns: "var(--bm-sidebar-width) 1fr", minHeight: "100vh" }}>
        <Sidebar />
        <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          <Topbar />
          <main style={{ padding: "var(--bm-space-6)", display: "flex", flexDirection: "column", gap: "var(--bm-space-6)", maxWidth: "var(--bm-container-max)", width: "100%" }}>
            <AccessGuard>{children}</AccessGuard>
          </main>
        </div>
      </div>
      <Modals />
      <PushInit />
    </>
  );
}
