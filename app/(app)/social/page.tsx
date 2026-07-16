"use client";

import { useState } from "react";
import { useStore } from "@/components/store";
import { Icon } from "@/components/Icon";
import { SOCIAL_PLATFORMS, postStatusMeta, PROVIDERS } from "@/lib/data";

export default function SocialPage() {
  const { socialPosts, integrations, addSocialPost, publishSocialPost, deleteSocialPost, toggleIntegration, currentUser } = useStore();
  const [tab, setTab] = useState<"posts" | "accounts">("posts");
  const [caption, setCaption] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [when, setWhen] = useState("");
  const [error, setError] = useState<string | null>(null);

  const anyConnected = integrations.some((i) => ["instagram", "tiktok", "youtube"].includes(i.provider) && i.connected);
  const toggle = (id: string) => setPlatforms((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const save = (status: "draft" | "scheduled") => {
    if (!caption.trim()) { setError("Първо напиши текст."); return; }
    if (platforms.length === 0) { setError("Избери поне една платформа."); return; }
    addSocialPost({ caption: caption.trim(), media_url: mediaUrl.trim(), platforms, scheduled_for: when.trim() }, status);
    setCaption(""); setMediaUrl(""); setPlatforms([]); setWhen(""); setError(null);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-5)" }}>
      <div>
        <h1>Социални мрежи</h1>
        <p className="bm-text-muted" style={{ margin: "4px 0 0" }}>Създавай публикации и управлявай свързаните акаунти.</p>
      </div>

      <div className="bm-tabs">
        <button role="tab" className="bm-tab" aria-selected={tab === "posts"} onClick={() => setTab("posts")}>Публикации</button>
        {currentUser.isAdmin && <button role="tab" className="bm-tab" aria-selected={tab === "accounts"} onClick={() => setTab("accounts")}>Свързани акаунти</button>}
      </div>

      {tab === "posts" && (
        <>
          {!anyConnected && (
            <div className="bm-alert bm-alert--warning" style={{ alignItems: "center" }}>
              <Icon name="warn" />
              <div>Няма свързани социални акаунти. Свържи Instagram, TikTok или YouTube от таб „Свързани акаунти“ — черновите и насрочването работят и без това.</div>
            </div>
          )}
          <section className="bm-split bm-split--even">
            <div className="bm-card">
              <div className="bm-card__header"><h3>Нова публикация</h3></div>
              <div className="bm-card__body" style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-4)" }}>
                {error && <div className="bm-alert bm-alert--danger">{error}</div>}
                <div className="bm-field"><label className="bm-label">Текст</label><textarea className="bm-textarea" value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Напиши текста…" /></div>
                <div className="bm-field"><label className="bm-label">Медия URL (видео / снимка)</label><input className="bm-input" value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} placeholder="https://… (качване по-късно)" /></div>
                <div className="bm-field">
                  <label className="bm-label">Платформи</label>
                  <div style={{ display: "flex", gap: "var(--bm-space-3)", flexWrap: "wrap" }}>
                    {SOCIAL_PLATFORMS.map((p) => (
                      <label key={p.id} className="bm-checkbox"><input type="checkbox" checked={platforms.includes(p.id)} onChange={() => toggle(p.id)} /> {p.name}</label>
                    ))}
                  </div>
                </div>
                <div className="bm-field"><label className="bm-label">Насрочи за (по избор)</label><input className="bm-input" value={when} onChange={(e) => setWhen(e.target.value)} placeholder="напр. 15 юли, 9:00" /></div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--bm-space-3)" }}>
                  <button className="bm-btn bm-btn--secondary" onClick={() => save("draft")}>Запази чернова</button>
                  <button className="bm-btn bm-btn--primary" onClick={() => save("scheduled")}>{when.trim() ? "Насрочи" : "В опашка"}</button>
                </div>
              </div>
            </div>

            <div className="bm-card">
              <div className="bm-card__header"><h3>Опашка</h3><span className="bm-badge bm-badge--brand">{socialPosts.length}</span></div>
              <div className="bm-card__body" style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-4)" }}>
                {socialPosts.length === 0 && <p className="bm-text-subtle" style={{ fontSize: "var(--bm-text-sm)", margin: 0 }}>Все още няма нищо в опашката.</p>}
                {socialPosts.map((p) => {
                  const m = postStatusMeta(p.status);
                  return (
                    <div key={p.id} style={{ borderBottom: "1px solid var(--bm-border)", paddingBottom: "var(--bm-space-3)", display: "flex", flexDirection: "column", gap: "var(--bm-space-2)" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "var(--bm-space-3)" }}>
                        <div style={{ fontSize: "var(--bm-text-sm)" }}>{p.caption}</div>
                        <span className={"bm-badge " + m.cls}>{m.label}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--bm-space-2)" }}>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {p.platforms.map((pl) => <span key={pl} className="bm-badge bm-badge--neutral">{SOCIAL_PLATFORMS.find((s) => s.id === pl)?.name || pl}</span>)}
                          {p.scheduled_for && <span style={{ fontSize: "var(--bm-text-xs)", color: "var(--bm-text-subtle)", alignSelf: "center" }}>· {p.scheduled_for}</span>}
                        </div>
                        <div style={{ display: "flex", gap: "var(--bm-space-2)" }}>
                          {p.status !== "published" && <button className="bm-btn bm-btn--secondary bm-btn--sm" onClick={() => publishSocialPost(p.id)}>Публикувай</button>}
                          <button className="bm-btn bm-btn--ghost bm-btn--sm" onClick={() => deleteSocialPost(p.id)}>Изтрий</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        </>
      )}

      {tab === "accounts" && currentUser.isAdmin && (
        <>
          <div className="bm-alert bm-alert--info">Свързването е симулирано. Реалното публикуване изисква OAuth приложение и API токен за всеки доставчик, настроени на сървъра.</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "var(--bm-space-4)" }}>
            {PROVIDERS.map((p) => {
              const s = integrations.find((i) => i.provider === p.id);
              const connected = !!s?.connected;
              return (
                <div key={p.id} className="bm-card" style={{ padding: "var(--bm-space-5)", display: "flex", flexDirection: "column", gap: "var(--bm-space-4)" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "var(--bm-space-3)" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700 }}>{p.name}</div>
                      <div style={{ fontSize: "var(--bm-text-sm)", color: "var(--bm-text-muted)", marginTop: 4 }}>{p.blurb}</div>
                    </div>
                    <span className={"bm-badge " + (connected ? "bm-badge--success" : "bm-badge--neutral")}>{connected ? "Свързан" : "Не е свързан"}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: "var(--bm-space-3)", borderTop: "1px solid var(--bm-border)" }}>
                    <span style={{ fontSize: "var(--bm-text-xs)", color: "var(--bm-text-subtle)" }}>{connected ? s?.account_label || "Свързан" : "—"}</span>
                    <button className={"bm-btn bm-btn--sm " + (connected ? "bm-btn--secondary" : "bm-btn--primary")} onClick={() => toggleIntegration(p.id)}>{connected ? "Прекъсни" : "Свържи"}</button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
