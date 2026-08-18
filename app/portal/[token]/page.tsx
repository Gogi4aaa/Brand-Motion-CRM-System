"use client";

// Public client portal — the business owner opens this from the magic link
// the agency sends. No login: /api/portal/<token> resolves the token
// server-side (SECURITY DEFINER RPC). The owner sees:
//   * прогреса на всяко видео през етапите,
//   * контент календара — кога какво излиза,
//   * пакета за месеца и напомняне за плащане, когато е изпълнен,
//   * фактурите и общо инвестираното по офертата,
//   * резултатите на публикуваните видеа.
// Internal details (сценарии, изпълнители, вътрешни бележки) never reach here.

import { useEffect, useState, use, useCallback } from "react";

interface PortalStage { key: string; status: "todo" | "doing" | "done" | "blocked" }
interface PortalMetrics { platform: string; url: string; views: number; likes: number; comments: number; shares: number; updated_at: string }
interface PortalItem {
  id: string; title: string; type: string; date: string | null;
  published: boolean; current_stage: string; stages: PortalStage[];
  metrics: PortalMetrics | null;
}
interface PortalInvoice { id: string; amount: number; status: "paid" | "pending" | "overdue"; issued: string; due: string }
interface PortalCycle { month: string; target_count: number; done_count: number; phase: string }
interface PortalBusy { date: string; start: string | null; end: string | null }
interface PortalBooking { id: string; date: string; start: string | null; end: string | null; status: "pending" | "approved" | "declined" }
interface PortalData {
  client_name: string; monthly_fee: number; paid_total: number; pending_total: number;
  first_paid_at: string | null; invoices: PortalInvoice[]; cycle: PortalCycle | null; items: PortalItem[];
  busy: PortalBusy[]; bookings: PortalBooking[];
}

const TYPE_LABELS: Record<string, string> = { promo: "Промо", info: "Инфо", reel: "Рийл", project: "Проект", post: "Пост" };
const STAGE_LABELS: Record<string, string> = {
  strategy: "Идея", script: "Сценарий", shoot: "Снимки", edit: "Монтаж",
  copy: "Текст", design: "Дизайн", review: "Преглед", publish: "Качване",
};
// Редът на етапите идва от самия елемент (видеата и постовете имат различни
// вериги); резервен ред за стари записи без stages.
const FALLBACK_ORDER = ["strategy", "script", "shoot", "edit", "review", "publish"];
const stageOrderOf = (item: PortalItem) =>
  item.stages.length ? item.stages.map((s) => s.key) : FALLBACK_ORDER;
const INV_LABELS: Record<string, { label: string; cls: string }> = {
  paid: { label: "Платена", cls: "bm-badge--success" },
  pending: { label: "Чака плащане", cls: "bm-badge--warning" },
  overdue: { label: "Просрочена", cls: "bm-badge--danger" },
};
const MONTHS = ["януари", "февруари", "март", "април", "май", "юни", "юли", "август", "септември", "октомври", "ноември", "декември"];

const nf = new Intl.NumberFormat("bg-BG");
// Показва стотинки само когато сумата има такива (€50,30), иначе кръгло (€1 425).
const money = (n: number) => "€" + (n || 0).toLocaleString("bg-BG", { minimumFractionDigits: Math.round((n || 0) * 100) % 100 !== 0 ? 2 : 0, maximumFractionDigits: 2 });
const fmtDay = (iso: string) => {
  const d = new Date(iso + "T00:00:00");
  return isNaN(d.getTime()) ? iso : `${d.getDate()} ${MONTHS[d.getMonth()]}`;
};
const monthName = (ym: string) => {
  const m = parseInt(ym.split("-")[1] || "", 10);
  return m >= 1 && m <= 12 ? MONTHS[m - 1] : ym;
};

function Progress({ item }: { item: PortalItem }) {
  const order = stageOrderOf(item);
  const doneCount = item.published ? order.length : order.filter((k) => item.stages.find((s) => s.key === k)?.status === "done").length;
  const pct = Math.round((doneCount / order.length) * 100);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="pt-track"><div className="pt-fill" style={{ width: pct + "%" }} /></div>
      <div className="pt-stages">
        {order.map((k) => {
          const st = item.published ? "done" : item.stages.find((s) => s.key === k)?.status || "todo";
          const active = !item.published && k === item.current_stage;
          const cls = st === "done" ? "pt-chip pt-chip--done" : active || st === "doing" ? "pt-chip pt-chip--active" : "pt-chip";
          return <span key={k} className={cls}>{st === "done" ? "✓ " : ""}{STAGE_LABELS[k] || k}</span>;
        })}
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: React.ReactNode; accent?: boolean }) {
  return (
    <div className="pt-stat">
      <div className="pt-stat__value" style={accent ? { color: "var(--bm-brand-600)" } : undefined}>{value}</div>
      <div className="pt-stat__label">{label}</div>
    </div>
  );
}

export default function PortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [data, setData] = useState<PortalData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(() =>
    fetch(`/api/portal/${token}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Грешка");
        setData(j as PortalData);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false)), [token]);

  useEffect(() => { load(); }, [load]);

  // ---- Заявка за снимачен ден (визуален календар + избор на ден) ----
  const [bkMonthOff, setBkMonthOff] = useState(0);
  const [bkDate, setBkDate] = useState("");
  const [bkStart, setBkStart] = useState("");
  const [bkEnd, setBkEnd] = useState("");
  const [bkNote, setBkNote] = useState("");
  const [bkBusy, setBkBusy] = useState(false);
  const [bkMsg, setBkMsg] = useState("");
  const [bkErr, setBkErr] = useState("");
  const submitBooking = async () => {
    setBkErr(""); setBkMsg("");
    if (!bkDate) { setBkErr("Избери дата."); return; }
    setBkBusy(true);
    try {
      const r = await fetch(`/api/portal/${token}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: bkDate, start: bkStart, end: bkEnd, note: bkNote }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Грешка");
      setBkMsg("Заявката е изпратена — очаквай потвърждение.");
      setBkDate(""); setBkStart(""); setBkEnd(""); setBkNote("");
      await load();
    } catch (e) { setBkErr(e instanceof Error ? e.message : "Грешка"); }
    finally { setBkBusy(false); }
  };

  const items = data?.items || [];
  const inProgress = items.filter((i) => !i.published);
  const published = items.filter((i) => i.published);
  const totalViews = published.reduce((a, i) => a + (i.metrics?.views || 0), 0);

  // Контент календар: месечна решетка с заглавията на видеата за избрания
  // месец (данните вече идват ограничени до този клиент от portal_get).
  const [monthOff, setMonthOff] = useState(0);
  // Тапнат ден: на телефон решетката показва само точки, а тук се отваря
  // изскачащ прозорец с видеата за деня (вместо дълъг списък под календара).
  const [dayView, setDayView] = useState<number | null>(null);
  const now = new Date();
  const y = new Date(now.getFullYear(), now.getMonth() + monthOff, 1).getFullYear();
  const m = new Date(now.getFullYear(), now.getMonth() + monthOff, 1).getMonth();
  const ymKey = `${y}-${String(m + 1).padStart(2, "0")}`;
  const monthItems = items.filter((i) => i.date?.startsWith(ymKey));
  const byDay = new Map<number, PortalItem[]>();
  for (const it of monthItems) {
    const day = parseInt(it.date!.slice(8, 10), 10);
    byDay.set(day, [...(byDay.get(day) || []), it]);
  }
  const firstDow = (new Date(y, m, 1).getDay() + 6) % 7; // понеделник = 0
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const monthAgenda = [...monthItems].sort((a, b) => (a.date! < b.date! ? -1 : 1));

  const cycle = data?.cycle || null;
  const cycleDone = !!cycle && cycle.target_count > 0 && cycle.done_count >= cycle.target_count;
  const pendingInv = (data?.invoices || []).find((i) => i.status === "pending" || i.status === "overdue");
  const showPayReminder = cycleDone || !!pendingInv;

  // ---- Данни за визуалния календар за снимачни дни ----
  const activeBookings = (data?.bookings || []).filter((b) => b.status !== "declined");
  const atLimit = activeBookings.length >= 3;
  const bkFirst = new Date(now.getFullYear(), now.getMonth() + bkMonthOff, 1);
  const bkY = bkFirst.getFullYear();
  const bkM = bkFirst.getMonth();
  const bkYmKey = `${bkY}-${String(bkM + 1).padStart(2, "0")}`;
  const bkFirstDow = (bkFirst.getDay() + 6) % 7; // понеделник = 0
  const bkDays = new Date(bkY, bkM + 1, 0).getDate();
  const bkCells: (number | null)[] = [...Array(bkFirstDow).fill(null), ...Array.from({ length: bkDays }, (_, i) => i + 1)];
  while (bkCells.length % 7 !== 0) bkCells.push(null);
  // Заетите одобрени слотове по ден (всички клиенти, без имена) + собствените заявки.
  const busyByDate = new Map<string, PortalBusy[]>();
  for (const b of data?.busy || []) busyByDate.set(b.date, [...(busyByDate.get(b.date) || []), b]);
  const mineByDate = new Map<string, PortalBooking[]>();
  for (const b of activeBookings) mineByDate.set(b.date, [...(mineByDate.get(b.date) || []), b]);
  const selectedBusy = bkDate ? busyByDate.get(bkDate) || [] : [];

  return (
    <div className="pt-page">
      <style>{`
        .pt-page { min-height: 100dvh; background: var(--bm-surface-2); padding-bottom: var(--bm-space-8); }
        /* Centered on every device; generous top space above the logo and a
           bottom pad big enough that the stat cards never cover the text. */
        .pt-hero { background: linear-gradient(135deg, var(--bm-brand-600), var(--bm-brand-800, var(--bm-brand-700))); color: #fff; padding: calc(var(--bm-space-8) + env(safe-area-inset-top)) var(--bm-space-4) var(--bm-space-6); text-align: center; }
        .pt-hero__inner, .pt-body { max-width: 780px; margin: 0 auto; }
        .pt-hero__brand { display: flex; align-items: center; justify-content: center; gap: 10px; font-weight: 700; opacity: .9; font-size: var(--bm-text-sm); letter-spacing: .04em; text-transform: uppercase; }
        .pt-hero__logo { width: 30px; height: 30px; border-radius: 8px; background: rgba(255,255,255,.18); display: grid; place-items: center; font-weight: 800; }
        .pt-hero h1 { color: #fff; margin: 18px 0 6px; font-size: clamp(1.5rem, 4vw, 2.1rem); }
        .pt-hero p { margin: 0 auto; opacity: .85; max-width: 520px; }
        .pt-body { padding: 0 var(--bm-space-4); display: flex; flex-direction: column; gap: var(--bm-space-5); margin-top: var(--bm-space-5); }
        .pt-card { background: var(--bm-surface); border-radius: var(--bm-radius-xl); box-shadow: var(--bm-shadow-md); border: 1px solid var(--bm-border); overflow: hidden; }
        .pt-card__head { padding: var(--bm-space-4) var(--bm-space-5); border-bottom: 1px solid var(--bm-border); display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .pt-card__head h2 { margin: 0; font-size: var(--bm-text-base); }
        .pt-card__body { padding: var(--bm-space-5); display: flex; flex-direction: column; gap: var(--bm-space-5); }
        .pt-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: var(--bm-space-3); }
        .pt-stat { background: var(--bm-surface); border: 1px solid var(--bm-border); border-radius: var(--bm-radius-lg); box-shadow: var(--bm-shadow-sm); padding: var(--bm-space-4); text-align: center; }
        .pt-stat__value { font-size: var(--bm-text-xl); font-weight: 800; letter-spacing: -.02em; }
        .pt-stat__label { font-size: var(--bm-text-xs); color: var(--bm-text-subtle); margin-top: 2px; }
        .pt-track { height: 8px; background: var(--bm-surface-2); border-radius: 99px; overflow: hidden; }
        .pt-fill { height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--bm-brand-400), var(--bm-brand-600)); transition: width .4s ease; }
        .pt-stages { display: flex; flex-wrap: wrap; gap: 6px; }
        .pt-chip { font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 99px; background: var(--bm-surface-2); color: var(--bm-text-subtle); border: 1px solid var(--bm-border); }
        .pt-chip--done { background: var(--bm-success-50); color: var(--bm-success-700); border-color: var(--bm-success-500); }
        .pt-chip--active { background: var(--bm-brand-50); color: var(--bm-brand-700); border-color: var(--bm-brand-500); }
        .pt-item + .pt-item { border-top: 1px dashed var(--bm-border); padding-top: var(--bm-space-4); }
        .pt-grid { display: grid; grid-template-columns: repeat(7, 1fr); border: 1px solid var(--bm-border); border-radius: var(--bm-radius-lg); overflow: hidden; }
        .pt-grid__wd { background: var(--bm-brand-600); color: #fff; text-align: center; font-size: 11px; font-weight: 700; padding: 6px 2px; text-transform: uppercase; letter-spacing: .03em; }
        .pt-grid__cell { min-height: 72px; border-top: 1px solid var(--bm-border); border-right: 1px solid var(--bm-border); padding: 4px; display: flex; flex-direction: column; gap: 3px; background: var(--bm-surface); }
        .pt-grid__cell:nth-child(7n) { border-right: none; }
        .pt-grid__cell--empty { background: var(--bm-surface-2); }
        .pt-grid__cell--today { background: var(--bm-brand-50); }
        .pt-grid__day { font-size: 10px; font-weight: 700; color: var(--bm-text-subtle); text-align: right; }
        .pt-grid__cell--today .pt-grid__day { color: var(--bm-brand-700); }
        .pt-ev { font-size: 10px; font-weight: 600; line-height: 1.25; border-radius: 6px; padding: 2px 5px; background: var(--bm-brand-50); color: var(--bm-brand-700); border-left: 2px solid var(--bm-brand-500); overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
        .pt-ev--done { background: var(--bm-success-50); color: var(--bm-success-700); border-left-color: var(--bm-success-500); }
        .pt-mnav { display: flex; align-items: center; gap: 10px; }
        .pt-mnav button { border: 1px solid var(--bm-border); background: var(--bm-surface); border-radius: 8px; width: 28px; height: 28px; cursor: pointer; font-weight: 700; color: var(--bm-text-muted); }
        .pt-mnav button:hover { background: var(--bm-surface-2); }
        .pt-grid__cell--has { cursor: pointer; }
        /* Точките се показват само на телефон; на десктоп клетките носят заглавията.
           Дефолтът трябва да е ПРЕДИ media-заявката, иначе с еднаква специфичност
           по-долното правило печели и точките изчезват и на телефон. */
        .pt-grid__dots { display: none; }
        .pt-grid__dot { width: 6px; height: 6px; border-radius: 50%; background: var(--bm-brand-500); }
        .pt-grid__dot--done { background: var(--bm-success-500); }
        @media (max-width: 600px) {
          .pt-grid__cell { min-height: 44px; }
          .pt-ev { display: none; }
          .pt-grid__dots { display: flex; gap: 2px; flex-wrap: wrap; justify-content: center; margin-top: auto; }
        }
        /* Подсказката „тапни ден“ е нужна само там, където клетките са точки. */
        .pt-cal__hint { display: none; }
        @media (max-width: 600px) { .pt-cal__hint { display: block; } }
        /* Заявка за снимачен ден: часовете От/До един до друг. */
        .pt-book__grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--bm-space-3); }
        .pt-book__f { display: flex; flex-direction: column; gap: 4px; }
        /* „зает" маркер в календарна клетка (одобрен слот на друг клиент, без име). */
        .pt-book__busy { margin-top: auto; display: flex; }
        .pt-book__busy span { font-size: 9px; font-weight: 700; letter-spacing: .02em; color: var(--bm-text-subtle); background: var(--bm-surface-2); border: 1px solid var(--bm-border); border-radius: 99px; padding: 0 6px; }
        /* Изскачащ прозорец „видеа за деня“. */
        .pt-dv { position: fixed; inset: 0; background: rgba(15,23,42,.55); display: flex; align-items: flex-end; justify-content: center; padding: var(--bm-space-4); z-index: 50; }
        @media (min-width: 601px) { .pt-dv { align-items: center; } }
        .pt-dv__box { background: var(--bm-surface); border-radius: var(--bm-radius-xl); box-shadow: var(--bm-shadow-lg, var(--bm-shadow-md)); width: 100%; max-width: 460px; max-height: 80vh; display: flex; flex-direction: column; overflow: hidden; }
        .pt-dv__head { padding: var(--bm-space-4) var(--bm-space-5); border-bottom: 1px solid var(--bm-border); display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .pt-dv__head h3 { margin: 0; font-size: var(--bm-text-base); text-transform: capitalize; }
        .pt-dv__head button { border: none; background: var(--bm-surface-2); border-radius: 8px; width: 30px; height: 30px; cursor: pointer; font-weight: 700; color: var(--bm-text-muted); flex-shrink: 0; }
        .pt-dv__body { padding: var(--bm-space-4) var(--bm-space-5); display: flex; flex-direction: column; gap: 10px; overflow-y: auto; }
        .pt-dv__ev { border-left: 3px solid var(--bm-brand-500); background: var(--bm-brand-50); border-radius: var(--bm-radius-md); padding: 10px 12px; }
        .pt-dv__ev--done { border-left-color: var(--bm-success-500); background: var(--bm-success-50); }
        .pt-metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(90px, 1fr)); gap: 8px; background: var(--bm-surface-2); border-radius: var(--bm-radius-lg); padding: var(--bm-space-3); }
        .pt-pay { border-radius: var(--bm-radius-xl); padding: var(--bm-space-5); background: linear-gradient(135deg, var(--bm-warning-50), var(--bm-surface)); border: 1px solid var(--bm-warning-500); display: flex; flex-direction: column; gap: 6px; box-shadow: var(--bm-shadow-md); }
        .pt-invrow { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; padding: 10px 0; border-bottom: 1px solid var(--bm-border); font-size: var(--bm-text-sm); }
        .pt-invrow:last-child { border-bottom: none; }
        @media (max-width: 480px) { .pt-card__body { padding: var(--bm-space-4); } }
      `}</style>

      <div className="pt-hero">
        <div className="pt-hero__inner">
          <div className="pt-hero__brand"><span className="pt-hero__logo">B</span> BrandMotion</div>
          <h1>{data ? `Здравейте, ${data.client_name}!` : "Клиентски портал"}</h1>
          <p>Всичко за вашите видеа — прогрес, календар, резултати и плащания.</p>
        </div>
      </div>

      <div className="pt-body">
        {loading && <div className="pt-card"><div className="pt-card__body bm-text-subtle">Зареждане…</div></div>}
        {error && <div className="bm-alert bm-alert--danger">{error}</div>}

        {data && (
          <>
            <div className="pt-stats">
              <Stat label="Публикувани видеа" value={published.length} />
              <Stat label="В работа" value={inProgress.length} />
              <Stat label="Общо гледания" value={nf.format(totalViews)} accent />
              <Stat label="Инвестирано до момента" value={money(data.paid_total)} />
            </div>

            {showPayReminder && (
              <div className="pt-pay">
                <div style={{ fontWeight: 800, fontSize: "var(--bm-text-base)" }}>
                  {cycleDone ? `🎬 Пакетът за ${cycle ? monthName(cycle.month) : "месеца"} е изпълнен — ${cycle?.done_count}/${cycle?.target_count} видеа са публикувани!` : "Имате фактура за плащане"}
                </div>
                <div style={{ fontSize: "var(--bm-text-sm)", color: "var(--bm-text-muted)" }}>
                  {pendingInv
                    ? <>Фактура {pendingInv.id} на стойност <b>{money(pendingInv.amount)}</b> очаква плащане{pendingInv.due ? <> · падеж {pendingInv.due}</> : null}.</>
                    : "Очаквайте фактурата за периода — благодарим за доверието!"}
                </div>
              </div>
            )}

            {cycle && cycle.target_count > 0 && (
              <div className="pt-card">
                <div className="pt-card__head"><h2>Пакет за {monthName(cycle.month)}</h2><span className="bm-badge bm-badge--brand">{cycle.done_count}/{cycle.target_count} видеа</span></div>
                <div className="pt-card__body" style={{ gap: 10 }}>
                  <div className="pt-track"><div className="pt-fill" style={{ width: Math.min(100, Math.round((cycle.done_count / cycle.target_count) * 100)) + "%" }} /></div>
                  <span className="bm-text-subtle" style={{ fontSize: "var(--bm-text-xs)" }}>
                    {cycleDone ? "Всички видеа от пакета са публикувани." : `Още ${cycle.target_count - cycle.done_count} ${cycle.target_count - cycle.done_count === 1 ? "видео" : "видеа"} до изпълнение на пакета.`}
                  </span>
                </div>
              </div>
            )}

            <div className="pt-card">
              <div className="pt-card__head">
                <h2>📅 Контент календар</h2>
                <div className="pt-mnav">
                  <button type="button" aria-label="Предишен месец" onClick={() => setMonthOff((o) => o - 1)}>‹</button>
                  <span style={{ fontWeight: 700, fontSize: "var(--bm-text-sm)", textTransform: "capitalize" }}>{MONTHS[m]} {y}</span>
                  <button type="button" aria-label="Следващ месец" onClick={() => setMonthOff((o) => o + 1)}>›</button>
                </div>
              </div>
              <div className="pt-card__body" style={{ gap: "var(--bm-space-4)" }}>
                <div className="pt-grid">
                  {["пн", "вт", "ср", "чт", "пт", "сб", "нд"].map((w) => <div key={w} className="pt-grid__wd">{w}</div>)}
                  {cells.map((day, i) => {
                    if (!day) return <div key={"e" + i} className="pt-grid__cell pt-grid__cell--empty" />;
                    const iso = `${ymKey}-${String(day).padStart(2, "0")}`;
                    const dayItems = byDay.get(day) || [];
                    return (
                      <div
                        key={iso}
                        className={"pt-grid__cell" + (iso === todayIso ? " pt-grid__cell--today" : "") + (dayItems.length ? " pt-grid__cell--has" : "")}
                        onClick={dayItems.length ? () => setDayView(day) : undefined}
                      >
                        <div className="pt-grid__day">{day}</div>
                        {dayItems.map((it) => (
                          <div key={it.id} className={"pt-ev" + (it.published ? " pt-ev--done" : "")} title={it.title}>{it.published ? "✓ " : ""}{it.title || "(без заглавие)"}</div>
                        ))}
                        {dayItems.length > 0 && (
                          <div className="pt-grid__dots">
                            {dayItems.map((it) => <span key={it.id} className={"pt-grid__dot" + (it.published ? " pt-grid__dot--done" : "")} />)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {/* На телефон решетката показва точки; тап на ден отваря видеата за него. */}
                <p className="pt-cal__hint bm-text-subtle" style={{ fontSize: "var(--bm-text-xs)", margin: 0 }}>Тапни ден с точки, за да видиш видеата за него.</p>
                {monthAgenda.length === 0 && (
                  <p className="bm-text-subtle" style={{ fontSize: "var(--bm-text-sm)", margin: 0 }}>Няма планирани видеа за {MONTHS[m]} — разгледай съседните месеци със стрелките.</p>
                )}
              </div>
            </div>

            {/* Заяви снимачен ден — заявката чака потвърждение от екипа. */}
            <div className="pt-card">
              <div className="pt-card__head"><h2>📸 Заяви снимачен ден</h2><span className={"bm-badge " + (atLimit ? "bm-badge--warning" : "bm-badge--brand")}>{activeBookings.length}/3</span></div>
              <div className="pt-card__body" style={{ gap: "var(--bm-space-4)" }}>
                <p className="bm-text-subtle" style={{ fontSize: "var(--bm-text-sm)", margin: 0 }}>Цъкни на ден от календара, за да заявиш снимки. Можеш да имаш до 3 активни заявки. Зелено = твои одобрени, жълто = твои чакащи, точка = вече зает час.</p>

                {atLimit && <div className="bm-alert bm-alert--warning">Имаш 3 активни заявки — това е максимумът. Изчакай потвърждение или се свържи с нас за още.</div>}

                {/* Навигация по месеци */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <button type="button" className="pt-mnav" aria-label="Предишен месец" onClick={() => setBkMonthOff((o) => o - 1)} style={{ border: "1px solid var(--bm-border)", background: "var(--bm-surface)", borderRadius: 8, width: 28, height: 28, cursor: "pointer", fontWeight: 700, color: "var(--bm-text-muted)" }}>‹</button>
                  <span style={{ fontWeight: 700, fontSize: "var(--bm-text-sm)", textTransform: "capitalize" }}>{MONTHS[bkM]} {bkY}</span>
                  <button type="button" className="pt-mnav" aria-label="Следващ месец" onClick={() => setBkMonthOff((o) => o + 1)} style={{ border: "1px solid var(--bm-border)", background: "var(--bm-surface)", borderRadius: 8, width: 28, height: 28, cursor: "pointer", fontWeight: 700, color: "var(--bm-text-muted)" }}>›</button>
                </div>

                <div className="pt-grid">
                  {["пн", "вт", "ср", "чт", "пт", "сб", "нд"].map((w) => <div key={w} className="pt-grid__wd">{w}</div>)}
                  {bkCells.map((day, i) => {
                    if (!day) return <div key={"e" + i} className="pt-grid__cell pt-grid__cell--empty" />;
                    const dIso = `${bkYmKey}-${String(day).padStart(2, "0")}`;
                    const past = dIso < todayIso;
                    const mine = mineByDate.get(dIso) || [];
                    const busy = busyByDate.get(dIso) || [];
                    const selectable = !past && !atLimit;
                    const sel = dIso === bkDate;
                    return (
                      <div
                        key={dIso}
                        className={"pt-grid__cell" + (dIso === todayIso ? " pt-grid__cell--today" : "")}
                        onClick={selectable ? () => { setBkDate(dIso); setBkErr(""); setBkMsg(""); } : undefined}
                        style={{ cursor: selectable ? "pointer" : "default", opacity: past ? 0.45 : 1, outline: sel ? "2px solid var(--bm-brand-500)" : undefined, outlineOffset: sel ? -2 : undefined }}
                      >
                        <div className="pt-grid__day">{day}</div>
                        {mine.map((b) => (
                          <div key={b.id} className={"pt-ev" + (b.status === "approved" ? " pt-ev--done" : "")} style={b.status === "pending" ? { background: "var(--bm-warning-50)", color: "var(--bm-warning-700)", borderLeftColor: "var(--bm-warning-500)" } : undefined} title={b.status === "approved" ? "Одобрен" : "Чака одобрение"}>{b.start || "снимки"}</div>
                        ))}
                        {mine.length === 0 && busy.length > 0 && (
                          <div className="pt-book__busy"><span>зает</span></div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Форма за избрания ден */}
                {bkDate && !atLimit && (
                  <div style={{ border: "1px solid var(--bm-border)", borderRadius: "var(--bm-radius-lg)", padding: "var(--bm-space-4)", display: "flex", flexDirection: "column", gap: "var(--bm-space-3)", background: "var(--bm-surface-2)" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                      <div style={{ fontWeight: 700 }}>Снимачен ден · {fmtDay(bkDate)}</div>
                      <button type="button" className="bm-btn bm-btn--ghost bm-btn--sm" onClick={() => setBkDate("")}>Смени ден</button>
                    </div>
                    {selectedBusy.length > 0 && (
                      <div style={{ fontSize: "var(--bm-text-xs)", color: "var(--bm-text-subtle)" }}>Вече заети този ден: {selectedBusy.map((b) => b.start ? `${b.start}${b.end ? "–" + b.end : ""}` : "цял ден").join(", ")}</div>
                    )}
                    <div className="pt-book__grid">
                      <label className="pt-book__f"><span className="bm-label">От</span><input className="bm-input" type="time" value={bkStart} onChange={(e) => setBkStart(e.target.value)} /></label>
                      <label className="pt-book__f"><span className="bm-label">До</span><input className="bm-input" type="time" value={bkEnd} onChange={(e) => setBkEnd(e.target.value)} /></label>
                    </div>
                    <label className="pt-book__f"><span className="bm-label">Бележка (локация, детайли — по избор)</span><input className="bm-input" value={bkNote} onChange={(e) => setBkNote(e.target.value)} placeholder="напр. Студио / екстериор, реквизит…" /></label>
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <button className="bm-btn bm-btn--primary" disabled={bkBusy} onClick={submitBooking}>{bkBusy ? "Изпращане…" : "Заяви деня"}</button>
                    </div>
                  </div>
                )}

                {bkErr && <div className="bm-alert bm-alert--danger">{bkErr}</div>}
                {bkMsg && <div className="bm-alert bm-alert--success">{bkMsg}</div>}

                {(data.bookings?.length || 0) > 0 && (
                  <div>
                    <div className="bm-label" style={{ marginBottom: 6 }}>Твоите заявки</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {data.bookings.map((b) => {
                        const meta = b.status === "approved" ? { c: "bm-badge--success", t: "Одобрен" } : b.status === "declined" ? { c: "bm-badge--danger", t: "Отказан" } : { c: "bm-badge--warning", t: "Чака одобрение" };
                        return (
                          <div key={b.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, fontSize: "var(--bm-text-sm)" }}>
                            <span>{fmtDay(b.date)}{b.start ? ` · ${b.start}${b.end ? "–" + b.end : ""}` : ""}</span>
                            <span className={"bm-badge " + meta.c}>{meta.t}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="pt-card">
              <div className="pt-card__head"><h2>🎥 В работа в момента</h2><span className="bm-badge bm-badge--brand">{inProgress.length}</span></div>
              <div className="pt-card__body">
                {inProgress.length === 0 && <p className="bm-text-subtle" style={{ fontSize: "var(--bm-text-sm)", margin: 0 }}>Няма видеа в процес на работа.</p>}
                {inProgress.map((it) => (
                  <div key={it.id} className="pt-item" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 700 }}>{it.title || "(без заглавие)"}</span>
                      <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <span className="bm-badge bm-badge--neutral">{TYPE_LABELS[it.type] || it.type}</span>
                        {it.date && <span className="bm-text-subtle" style={{ fontSize: "var(--bm-text-xs)" }}>план: {fmtDay(it.date)}</span>}
                      </span>
                    </div>
                    <Progress item={it} />
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-card">
              <div className="pt-card__head"><h2>🚀 Публикувани и резултати</h2><span className="bm-badge bm-badge--success">{published.length}</span></div>
              <div className="pt-card__body">
                {published.length === 0 && <p className="bm-text-subtle" style={{ fontSize: "var(--bm-text-sm)", margin: 0 }}>Все още няма публикувани видеа.</p>}
                {published.map((it) => (
                  <div key={it.id} className="pt-item" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 700 }}>✓ {it.title || "(без заглавие)"}</span>
                      <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        {it.metrics?.platform && <span className="bm-badge bm-badge--info">{it.metrics.platform}</span>}
                        {it.date && <span className="bm-text-subtle" style={{ fontSize: "var(--bm-text-xs)" }}>{fmtDay(it.date)}</span>}
                      </span>
                    </div>
                    {it.metrics ? (
                      <>
                        <div className="pt-metrics">
                          <Stat label="Гледания" value={nf.format(it.metrics.views)} accent />
                          <Stat label="Харесвания" value={nf.format(it.metrics.likes)} />
                          <Stat label="Коментари" value={nf.format(it.metrics.comments)} />
                          <Stat label="Споделяния" value={nf.format(it.metrics.shares)} />
                        </div>
                        {it.metrics.url && <a href={it.metrics.url} target="_blank" rel="noreferrer" style={{ fontSize: "var(--bm-text-sm)", color: "var(--bm-brand-600)", fontWeight: 700 }}>Виж публикацията ↗</a>}
                      </>
                    ) : (
                      <p className="bm-text-subtle" style={{ fontSize: "var(--bm-text-sm)", margin: 0 }}>Резултатите се обновяват скоро.</p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-card">
              <div className="pt-card__head"><h2>💳 Инвестиция и плащания</h2>{data.monthly_fee > 0 && <span className="bm-badge bm-badge--neutral">{money(data.monthly_fee)} / месец по оферта</span>}</div>
              <div className="pt-card__body" style={{ gap: "var(--bm-space-4)" }}>
                <div className="pt-stats">
                  <Stat label="Платено общо" value={money(data.paid_total)} />
                  <Stat label="Чака плащане" value={money(data.pending_total)} accent={data.pending_total > 0} />
                  {data.first_paid_at && <Stat label="Партньори от" value={fmtDay(data.first_paid_at.slice(0, 10))} />}
                </div>
                {data.invoices.length > 0 ? (
                  <div>
                    {data.invoices.map((iv) => {
                      const m = INV_LABELS[iv.status] || INV_LABELS.pending;
                      return (
                        <div key={iv.id} className="pt-invrow">
                          <span style={{ fontFamily: "var(--bm-font-mono)", fontSize: "var(--bm-text-xs)", color: "var(--bm-text-subtle)" }}>{iv.id}</span>
                          <span className="bm-text-subtle" style={{ fontSize: "var(--bm-text-xs)" }}>издадена {fmtDay(iv.issued)}{iv.due ? ` · падеж ${iv.due}` : ""}</span>
                          <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ fontWeight: 700 }}>{money(iv.amount)}</span>
                            <span className={"bm-badge " + m.cls}>{m.label}</span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="bm-text-subtle" style={{ fontSize: "var(--bm-text-sm)", margin: 0 }}>Все още няма издадени фактури.</p>
                )}
              </div>
            </div>

            <p className="bm-text-subtle" style={{ fontSize: "var(--bm-text-xs)", textAlign: "center" }}>
              Страницата се обновява автоматично с напредъка на екипа. При въпроси — просто ни пишете. 💙
            </p>

            {/* Изскачащ прозорец с видеата за тапнатия ден (телефон). */}
            {dayView !== null && (
              <div className="pt-dv" onClick={(e) => { if (e.target === e.currentTarget) setDayView(null); }}>
                <div className="pt-dv__box">
                  <div className="pt-dv__head">
                    <h3>{dayView} {MONTHS[m]} · видеа за деня</h3>
                    <button type="button" aria-label="Затвори" onClick={() => setDayView(null)}>✕</button>
                  </div>
                  <div className="pt-dv__body">
                    {(byDay.get(dayView) || []).map((it) => (
                      <div key={it.id} className={"pt-dv__ev" + (it.published ? " pt-dv__ev--done" : "")}>
                        <div style={{ fontWeight: 700, fontSize: "var(--bm-text-sm)" }}>{it.published ? "✓ " : ""}{it.title || "(без заглавие)"}</div>
                        <div className="bm-text-subtle" style={{ fontSize: "var(--bm-text-xs)" }}>{TYPE_LABELS[it.type] || it.type} · {it.published ? "публикувано" : `сега: ${STAGE_LABELS[it.current_stage] || it.current_stage}`}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
