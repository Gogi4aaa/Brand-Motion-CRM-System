"use client";

// Показва готовия групов линк за одобрение (създаден след избора върху дъската).
// Клиентът го отваря и решава per-video на /review/group/<token>.

import { useState } from "react";
import { Icon } from "@/components/Icon";

export function BatchLinkModal({ link, onClose }: { link: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(link); setCopied(true); } catch { /* ignore */ } };

  return (
    <div className="bm-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bm-modal">
        <div className="bm-modal__header">
          <h3>Групов линк за одобрение</h3>
          <button className="bm-btn bm-btn--ghost bm-btn--icon" onClick={onClose} aria-label="Затвори"><Icon name="close" /></button>
        </div>
        <div className="bm-modal__body" style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-3)" }}>
          <div className="bm-alert bm-alert--success">Готово! Един линк за избраните видеа.</div>
          <div className="bm-field">
            <label className="bm-label">Линк за клиента</label>
            <div style={{ display: "flex", gap: "var(--bm-space-2)" }}>
              <input className="bm-input" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
              <button className="bm-btn bm-btn--secondary" onClick={copy}>{copied ? "Копирано" : "Копирай"}</button>
            </div>
          </div>
          <p className="bm-text-subtle" style={{ fontSize: "var(--bm-text-xs)", margin: 0 }}>Клиентът отваря линка и одобрява/иска промени за всяко видео поотделно. Статусът се вижда в модала на всяко видео.</p>
        </div>
        <div className="bm-modal__footer">
          <button className="bm-btn bm-btn--primary" onClick={onClose}>Готово</button>
        </div>
      </div>
    </div>
  );
}
