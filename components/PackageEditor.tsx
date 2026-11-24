"use client";

// Гъвкав пакет за един клиент: брой видеа, цена, платформи, услуги, срок.
// Няма фиксирани 8/16/20 — „Като …“ само копира пакета на друг клиент.

import { PLATFORMS, SERVICES, type ClientPackage } from "@/lib/crm";
import type { Client } from "@/lib/data";

export function PackageEditor({ value, onChange, clients, excludeId }: {
  value: ClientPackage;
  onChange: (v: ClientPackage) => void;
  clients: Client[];
  excludeId?: string;
}) {
  const set = (patch: Partial<ClientPackage>) => onChange({ ...value, ...patch });
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  // Шаблони = реалните пакети на други клиенти (уникални по видеа + цена).
  const seen = new Set<string>();
  const templates = clients
    .filter((c) => c.id !== excludeId && !c.archived_at && c.videos_per_month)
    .filter((c) => { const k = `${c.videos_per_month}-${c.mrr}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, 6);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-5)" }}>
      {templates.length > 0 && (
        <div className="bm-field">
          <span className="bm-label">Започни от пакета на</span>
          <div className="crm-chips">
            {templates.map((c) => (
              <button key={c.id} type="button" className="crm-chip" onClick={() => set({ videos_per_month: c.videos_per_month ?? null, price: c.mrr, platforms: c.platforms?.length ? c.platforms : value.platforms, services: c.services?.length ? c.services : value.services })}>
                {c.name} · {c.videos_per_month} видеа · {c.mrr} €
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--bm-space-6)", alignItems: "flex-end" }}>
        <div className="bm-field">
          <span className="bm-label">Видеа на месец</span>
          <div className="crm-stepper">
            <button type="button" aria-label="По-малко видеа" onClick={() => set({ videos_per_month: Math.max(1, (value.videos_per_month || 1) - 1) })}>−</button>
            <output aria-live="polite">{value.videos_per_month ?? "—"}</output>
            <button type="button" aria-label="Повече видеа" onClick={() => set({ videos_per_month: (value.videos_per_month || 0) + 1 })}>+</button>
          </div>
        </div>
        <label className="bm-field" style={{ width: 160 }}>
          <span className="bm-label">Цена на месец, €</span>
          <input className="bm-input" type="number" min={0} inputMode="decimal" value={value.price || ""} onChange={(e) => set({ price: Number(e.target.value) || 0 })} placeholder="напр. 990" />
        </label>
        <label className="bm-field" style={{ width: 160 }}>
          <span className="bm-label">Срок, месеци</span>
          <input className="bm-input" type="number" min={0} value={value.contract_months ?? ""} onChange={(e) => set({ contract_months: e.target.value ? Number(e.target.value) : null })} placeholder="безсрочен" />
        </label>
      </div>

      <div className="bm-field">
        <span className="bm-label">Платформи</span>
        <div className="crm-chips">
          {PLATFORMS.map((p) => (
            <button key={p.id} type="button" className="crm-chip" aria-pressed={value.platforms.includes(p.id)} onClick={() => set({ platforms: toggle(value.platforms, p.id) })}>{p.label}</button>
          ))}
        </div>
      </div>

      <div className="bm-field">
        <span className="bm-label">Какво включва</span>
        <div className="crm-chips">
          {SERVICES.map((s) => (
            <button key={s} type="button" className="crm-chip" aria-pressed={value.services.includes(s)} onClick={() => set({ services: toggle(value.services, s) })}>{s}</button>
          ))}
        </div>
      </div>

      {value.videos_per_month && value.price > 0 ? (
        <p className="bm-text-subtle" style={{ margin: 0, fontSize: "var(--bm-text-sm)" }}>
          {Math.round((value.price / value.videos_per_month) * 100) / 100} € на видео. Смяната на пакета важи от този месец; минали месеци пазят стария брой.
        </p>
      ) : null}
    </div>
  );
}

export const emptyPackage = (): ClientPackage => ({
  videos_per_month: 8,
  price: 0,
  platforms: ["facebook", "instagram", "tiktok"],
  services: ["Стратегия", "Сценарии", "Снимане", "Монтаж", "Публикуване", "Месечен отчет"],
  contract_months: null,
});

export const packageOf = (c: Client): ClientPackage => ({
  videos_per_month: c.videos_per_month ?? null,
  price: c.mrr || 0,
  platforms: c.platforms ?? [],
  services: c.services ?? [],
  contract_months: c.contract_months ?? null,
});
