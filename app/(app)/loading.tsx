export default function Loading() {
  return (
    <div style={{ display: "grid", placeItems: "center", padding: "var(--bm-space-16)", color: "var(--bm-text-subtle)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--bm-space-3)", fontSize: "var(--bm-text-sm)" }}>
        <span className="bm-spinner" style={{ color: "var(--bm-primary)" }} />
        Loading…
      </div>
    </div>
  );
}
