"use client";

// Страницата на клиента, CRM v2: пакет, работа по месеци, път на клиента.
// Публикуваното видео остава в месеца си завинаги — не се крие и не се мести.

import { useStore } from "./store";
import { Money } from "./MoneyLock";
import { fmtFull, type Client } from "@/lib/data";
import { fmtDM, clientStart, daysSince, lastPublished, PLATFORMS, ONBOARDING_CHECKS } from "@/lib/crm";

export function ClientMonths({ c }: { c: Client }) {
  const { contentItems, invoices, pipeline, openModal, setOnboardingCheck, currentUser } = useStore();
  const cInv = invoices.filter((i) => i.client === c.id);

  // Път на клиента: статусът се вижда от реалните стъпки, не от ръчен етикет.
  const checks = c.onboarding || {};
  const accessDone = ONBOARDING_CHECKS.every((k) => checks[k.id]);
  const pl = pipeline.find((p) => p.client_id === c.id);
  const strategyDone = c.analysis_status === "done" || (!!pl && !["strategy_requested", "strategy_revising", "failed", "cancelled"].includes(pl.status));
  const anyVideo = contentItems.some((it) => it.client === c.id && it.published);
  const last = lastPublished(contentItems, c.id);
  const regular = (daysSince(last) ?? 999) <= 21 && contentItems.filter((it) => it.client === c.id && it.published).length >= 3;
  const path = [
    { label: "Договор", done: true },
    { label: "Пакет", done: !!c.videos_per_month },
    { label: "Достъпи", done: accessDone },
    { label: "Стратегия", done: strategyDone },
    { label: "Първо видео", done: anyVideo },
    { label: "Редовно публикуване", done: regular },
  ];
  const nowIdx = path.findIndex((p) => !p.done);

  // Договор срещу фактури: ако се разминават, анализите лъжат.
  const lastInv = [...cInv].sort((a, b) => (b.issued || "").localeCompare(a.issued || ""))[0];
  const lastPeriod = lastInv ? (lastInv.period || (lastInv.issued || "").slice(0, 7)) : null;
  const billedLast = lastPeriod ? cInv.filter((i) => (i.period || (i.issued || "").slice(0, 7)) === lastPeriod).reduce((a, i) => a + Number(i.amount || 0), 0) : 0;
  const mismatch = !!lastPeriod && c.mrr > 0 && (billedLast < c.mrr * 0.5 || billedLast > c.mrr * 1.5);

  return (
    <>
      <section className="bm-split" style={{ alignItems: "start" }}>
          <div className="bm-card">
            <div className="bm-card__header">
              <h3>Пакет</h3>
              {currentUser.isAdmin && <button type="button" className="bm-btn bm-btn--ghost bm-btn--sm" onClick={() => openModal({ kind: "package", clientId: c.id })}>{c.videos_per_month ? "Промени" : "Задай пакет"}</button>}
            </div>
            <div className="bm-card__body">
              {c.videos_per_month ? (
                <dl className="crm-summary">
                  <dt>Видеа на месец</dt><dd>{c.videos_per_month}</dd>
                  <dt>Цена</dt><dd><Money>{fmtFull(c.mrr)}</Money> / мес</dd>
                  <dt>Платформи</dt><dd>{(c.platforms || []).map((p) => PLATFORMS.find((x) => x.id === p)?.label || p).join(", ") || "—"}</dd>
                  <dt>Включва</dt><dd>{(c.services || []).join(", ") || "—"}</dd>
                  <dt>Договор</dt><dd>от {fmtDM(clientStart(c))}{c.contract_months ? ` · ${c.contract_months} мес.` : " · безсрочен"}</dd>
                  <dt>Плащане</dt><dd>до {c.payment_terms_days ?? 7} дни след фактура</dd>
                  <dt>Имейл за фактури</dt><dd>{c.billing_email || "—"}</dd>
                </dl>
              ) : (
                <div className="bm-alert bm-alert--warning">Няма зададен пакет, затова прогресът по месеци не се смята.</div>
              )}
              {currentUser.isAdmin && mismatch && (
                <div className="bm-alert bm-alert--danger" style={{ marginTop: "var(--bm-space-4)" }}>
                  <div>Договорът е <Money>{fmtFull(c.mrr)}</Money>/мес, а за последния месец са фактурирани <Money>{fmtFull(billedLast)}</Money>. Провери кое е вярно.</div>
                </div>
              )}
            </div>
          </div>

          <div className="bm-card">
            <div className="bm-card__header"><h3>Път на клиента</h3></div>
            <div className="bm-card__body" style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-4)" }}>
              <div className="crm-path">
                {path.map((p, i) => (
                  <div key={p.label} className={"crm-path__step" + (p.done ? " crm-path__step--done" : i === nowIdx ? " crm-path__step--now" : "")}>
                    {p.done ? "✓ " : ""}{p.label}
                  </div>
                ))}
              </div>
              {!accessDone && (
                <div>
                  {ONBOARDING_CHECKS.map((k) => (
                    <label key={k.id} className="crm-check">
                      <input type="checkbox" checked={!!checks[k.id]} disabled={!currentUser.isAdmin} onChange={(e) => setOnboardingCheck(c.id, k.id, e.target.checked)} />
                      {k.label}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
      </section>
    </>
  );
}
