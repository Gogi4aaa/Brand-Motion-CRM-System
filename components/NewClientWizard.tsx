"use client";

// Нов клиент в 4 кратки стъпки: кой е → пакет → достъпи и екип → старт.
// От стъпка 2 нататък може да се създаде веднага („Създай сега“) —
// останалото се попълва после от страницата на клиента.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./Icon";
import { useStore } from "./store";
import { PackageEditor, emptyPackage } from "./PackageEditor";
import { ONBOARDING_CHECKS, PLATFORMS, type ClientPackage } from "@/lib/crm";
import { todayISO } from "@/lib/data";
import { BrandImportBox, BrandImportSummary, type BrandImportData } from "./BrandImport";

const STEPS = ["Клиент", "Пакет", "Достъпи и екип", "Старт"];

export function NewClientWizard() {
  const { closeModal, clients, team, currentUser, createClientQuick, startStrategy, saveBrandAnswers } = useStore();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [website, setWebsite] = useState("");
  const [email, setEmail] = useState("");
  const [pkg, setPkg] = useState<ClientPackage>(emptyPackage());
  const [owner, setOwner] = useState(currentUser.initials);
  const [editor, setEditor] = useState("");
  const [start, setStart] = useState(todayISO());
  const [terms, setTerms] = useState(7);
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [runStrategy, setRunStrategy] = useState(true);
  // Бранд файлът се разчита веднага, а се записва заедно с клиента.
  const [brand, setBrand] = useState<BrandImportData | null>(null);

  const people = Array.from(new Set([currentUser.initials, ...team.map((m) => m.initials)]));
  const nameOf = (i: string) => team.find((m) => m.initials === i)?.name || i;
  const step1ok = name.trim().length > 0 && industry.trim().length > 0;
  const step2ok = !!pkg.videos_per_month && pkg.price > 0;

  const validate = (upTo: number) => {
    if (upTo >= 0 && !step1ok) { setStep(0); setErr("Попълни име и ниша."); return false; }
    if (upTo >= 1 && !step2ok) { setStep(1); setErr("Задай брой видеа и цена на месец."); return false; }
    setErr("");
    return true;
  };
  const next = () => { if (validate(step)) setStep((s) => Math.min(STEPS.length - 1, s + 1)); };

  const create = async () => {
    if (!validate(1) || busy) return;
    setBusy(true);
    const id = await createClientQuick({
      name, industry, website, billing_email: email, owner, editor, contract_start: start,
      payment_terms_days: terms, onboarding: checks, ...pkg,
    });
    if (id && runStrategy) await startStrategy(id);
    if (id && brand) saveBrandAnswers(id, brand.answers); // затваря прозореца — затова е последно
    setBusy(false);
    if (id) { closeModal(); router.push(`/clients/${id}`); }
  };

  return (
    <div className="bm-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
      <div className="bm-modal crm-wizard" role="dialog" aria-modal="true" aria-labelledby="crm-wiz-title">
        <div className="bm-modal__header">
          <h3 id="crm-wiz-title">Нов клиент</h3>
          <button type="button" className="bm-btn bm-btn--ghost bm-btn--icon" onClick={closeModal} aria-label="Затвори"><Icon name="close" /></button>
        </div>
        <nav className="crm-steps" aria-label="Стъпки">
          {STEPS.map((label, i) => (
            <button key={label} type="button" className={"crm-step" + (i < step ? " crm-step--done" : "")} aria-current={i === step ? "step" : undefined}
              onClick={() => { if (i <= step || validate(i - 1)) setStep(i); }}>
              {i < step ? "✓" : i + 1} · {label}
            </button>
          ))}
        </nav>
        <form onSubmit={(e) => { e.preventDefault(); if (step === STEPS.length - 1) create(); else next(); }}>
          <div className="bm-modal__body" style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-4)" }}>
            {err && <div className="bm-alert bm-alert--danger" role="alert">{err}</div>}

            {step === 0 && (
              <>
                <label className="bm-field"><span className="bm-label">Име на бизнеса</span>
                  <input className="bm-input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="напр. Filto" /></label>
                <label className="bm-field"><span className="bm-label">Ниша</span>
                  <input className="bm-input" value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="напр. филтри за вода" /></label>
                <div className="bm-form-row">
                  <label className="bm-field"><span className="bm-label">Сайт или профил</span>
                    <input className="bm-input" type="url" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" /></label>
                  <label className="bm-field"><span className="bm-label">Имейл за фактури</span>
                    <input className="bm-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="по желание" /></label>
                </div>
              </>
            )}

            {step === 1 && <PackageEditor value={pkg} onChange={setPkg} clients={clients} />}

            {step === 2 && (
              <>
                <div className="bm-form-row">
                  <label className="bm-field"><span className="bm-label">Отговорник</span>
                    <select className="bm-select" value={owner} onChange={(e) => setOwner(e.target.value)}>{people.map((p) => <option key={p} value={p}>{nameOf(p)}</option>)}</select></label>
                  <label className="bm-field"><span className="bm-label">Монтажист</span>
                    <select className="bm-select" value={editor} onChange={(e) => setEditor(e.target.value)}><option value="">— по-късно —</option>{people.map((p) => <option key={p} value={p}>{nameOf(p)}</option>)}</select></label>
                </div>
                <div className="bm-form-row">
                  <label className="bm-field"><span className="bm-label">Начало на договора</span>
                    <input className="bm-input" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
                  <label className="bm-field"><span className="bm-label">Плащане до (дни след фактура)</span>
                    <input className="bm-input" type="number" min={0} value={terms} onChange={(e) => setTerms(Number(e.target.value) || 0)} /></label>
                </div>
                <div className="bm-field">
                  <span className="bm-label">Бранд профил <span className="bm-help">— по желание, може и по-късно от таба „Бранд“</span></span>
                  <BrandImportBox clientName={name} onParsed={setBrand} compact />
                  {brand && <BrandImportSummary data={brand} />}
                </div>
                <div className="bm-field">
                  <span className="bm-label">Какво вече е готово</span>
                  {ONBOARDING_CHECKS.map((c) => (
                    <label key={c.id} className="crm-check">
                      <input type="checkbox" checked={!!checks[c.id]} onChange={(e) => setChecks((x) => ({ ...x, [c.id]: e.target.checked }))} />
                      {c.label}
                    </label>
                  ))}
                  <span className="bm-help">Неотметнатото остава като напомняне на страницата на клиента.</span>
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <dl className="crm-summary">
                  <dt>Клиент</dt><dd>{name} · {industry}</dd>
                  <dt>Пакет</dt><dd>{pkg.videos_per_month} видеа · {pkg.price} €/мес{pkg.contract_months ? ` · ${pkg.contract_months} мес.` : ""}</dd>
                  <dt>Платформи</dt><dd>{pkg.platforms.map((p) => PLATFORMS.find((x) => x.id === p)?.label || p).join(", ") || "—"}</dd>
                  <dt>Включва</dt><dd>{pkg.services.join(", ") || "—"}</dd>
                  <dt>Отговорник</dt><dd>{nameOf(owner)}{editor ? ` · монтаж ${nameOf(editor)}` : ""}</dd>
                  <dt>Бранд</dt><dd>{brand ? `${Object.keys(brand.answers).length} полета от файла` : "ще се попълни по-късно"}</dd>
                  <dt>Старт</dt><dd>{start.split("-").reverse().join(".")} · плащане до {terms} дни</dd>
                </dl>
                <label className="crm-check" style={{ alignItems: "flex-start", paddingTop: "var(--bm-space-2)" }}>
                  <input type="checkbox" checked={runStrategy} onChange={(e) => setRunStrategy(e.target.checked)} style={{ marginTop: 2 }} />
                  <span><b>Пусни стратегията веднага.</b> Агентът Strategist започва и ти праща документа в Telegram (10–20 мин).</span>
                </label>
                <div className="bm-alert bm-alert--info">Клиентът влиза като „Включване“. Месечната цел от {pkg.videos_per_month} видеа се създава за {new Date().toLocaleDateString("bg-BG", { month: "long" })}. Ако до 3 дни няма първа стъпка, ще го видиш в „Днес“.</div>
              </>
            )}
          </div>
          <div className="bm-modal__footer">
            {step > 0 ? <button type="button" className="bm-btn bm-btn--secondary" onClick={() => setStep((s) => s - 1)}>Назад</button> : <button type="button" className="bm-btn bm-btn--secondary" onClick={closeModal}>Отказ</button>}
            {step > 0 && step < STEPS.length - 1 && (
              <button type="button" className="bm-btn bm-btn--ghost" onClick={create} disabled={busy || !step1ok || !step2ok}>Създай сега</button>
            )}
            <button type="submit" className="bm-btn bm-btn--primary" disabled={busy}>
              {step === STEPS.length - 1 ? (busy ? "Създавам…" : "Създай клиента") : "Напред"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Смяна на пакета на съществуващ клиент.
export function PackageModal({ clientId }: { clientId: string }) {
  const { closeModal, openModal, clients, saveClientPackage } = useStore();
  const c = clients.find((x) => x.id === clientId);
  const [pkg, setPkg] = useState<ClientPackage>(() => ({
    videos_per_month: c?.videos_per_month ?? 8, price: c?.mrr || 0,
    platforms: c?.platforms?.length ? c.platforms : ["facebook", "instagram", "tiktok"],
    services: c?.services ?? [], contract_months: c?.contract_months ?? null,
  }));
  if (!c) return null;
  const others = clients.filter((x) => !x.archived_at && x.status !== "Churned" && !x.videos_per_month && x.id !== c.id);
  return (
    <div className="bm-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
      <div className="bm-modal crm-wizard" role="dialog" aria-modal="true" aria-labelledby="crm-pkg-title">
        <div className="bm-modal__header">
          <h3 id="crm-pkg-title">Пакет · {c.name}</h3>
          <button type="button" className="bm-btn bm-btn--ghost bm-btn--icon" onClick={closeModal} aria-label="Затвори"><Icon name="close" /></button>
        </div>
        <div className="bm-modal__body">
          <PackageEditor value={pkg} onChange={setPkg} clients={clients} excludeId={c.id} />
        </div>
        <div className="bm-modal__footer">
          <button type="button" className="bm-btn bm-btn--secondary" onClick={closeModal}>Отказ</button>
          {others.length > 0 && (
            <button type="button" className="bm-btn bm-btn--ghost" disabled={!pkg.videos_per_month}
              onClick={() => { saveClientPackage(c.id, pkg); openModal({ kind: "package", clientId: others[0].id }); }}>
              Запази · следващ без пакет ({others.length})
            </button>
          )}
          <button type="button" className="bm-btn bm-btn--primary" disabled={!pkg.videos_per_month} onClick={() => { saveClientPackage(c.id, pkg); closeModal(); }}>Запази пакета</button>
        </div>
      </div>
    </div>
  );
}
