"use client";

// Възнаграждения — един екран, две лещи.
//
// Админът пита „на кого колко дължа“; монтажистът пита „колко ще взема и какво
// още мога да спечеля“. Един и същ маршрут, едни и същи данни, различна подредба.
//
// Правилото, което държи екрана честен: ДЪЛЖИМОТО НЕ СЕ СМЯТА ТУК. Идва наготово
// от v_worker_owed. Фронтендът само подрежда — и показва равносметка под всеки
// човек, за да се вижда от какво е съставено голямото число.
//
// Сроковете не са отделен екран, а филтър. „Горят“ е екранът Срокове, „Чакат теб“
// е входящата кутия, „Пакети“ е прегледът на договорките.

import { useMemo, useState } from "react";
import { useStore } from "@/components/store";
import {
  fmtFull, monthKey, monthLabel, shiftMonthKey, inMonthKey, videoPriceFor,
  payRoleLabel, PAY_METHODS, collectedRevenue, payoutCost,
  type VideoEarning, type PackageProgress, type WorkerOwed,
} from "@/lib/data";
import { Money } from "@/components/MoneyLock";
import { Avatar } from "@/components/Avatar";
import { WorkerPayView } from "@/components/WorkerPayView";

const money = (n: number) => fmtFull(n);
const shortDay = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, "0")}`;
};

type FilterKey = "all" | "owed" | "burn" | "review" | "pkg";
type RowState = "paid" | "review" | "owed" | "ontime" | "late" | "due" | "open";

const HINTS: Record<FilterKey, string> = {
  all: "Кой е на каква цена, за кои видеа, докъде е и какво чака от теб.",
  owed: "Само хората, на които дължиш пари в момента.",
  burn: "Изтичащи и просрочени срокове — това е екранът „Срокове“, само тук.",
  review: "Подадени видеа, на които часовникът е спрял. Докато ги гледаш, човекът не губи премия.",
  pkg: "Хората с пакетна договорка и докъде е стигнал всеки пакет.",
};

// Състоянието на реда — комбинация от статуса на парите и часовника.
function rowState(e: VideoEarning): RowState {
  if (e.status === "paid") return "paid";
  if (e.timeline === "чака преглед") return "review";
  if (e.accepted_at) {
    if (e.bonus_status === "missed") return "late";
    return e.status === "owed" ? "owed" : "ontime";
  }
  if (e.timeline === "просрочено") return "late";
  if (e.timeline === "изтича") return "due";
  return "open";
}
const MARK: Record<RowState, [string, string]> = {
  ontime: ["ok", "✓"], owed: ["ok", "✓"], late: ["bad", "✕"], review: ["rev", "↩"],
  due: ["warn", "⏱"], open: ["idle", "·"], paid: ["idle", "✓"],
};

// Един маршрут, две лещи. Разделени са на компоненти, за да не се извикват
// хукове зад условие — иначе редът им се мени между рендерите.
export default function PayoutsPage() {
  const { currentUser } = useStore();
  return currentUser.isAdmin ? <AdminPayouts /> : <MyPayouts />;
}

// ---- Изгледът на работника ----
function MyPayouts() {
  const { currentUser, videoEarnings, packageProgress, workerOwed, payouts, submitVideo } = useStore();
  const [month, setMonth] = useState<string | null>(monthKey());
  const me = workerOwed.find((w) => w.profile_id === currentUser.id);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-4)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1>Моето възнаграждение</h1>
          <p className="bm-text-muted" style={{ margin: "4px 0 0" }}>{currentUser.name}</p>
        </div>
        <div className="pay-monthnav">
          <button type="button" aria-label="Предишен месец" disabled={!month}
            onClick={() => month && setMonth(shiftMonthKey(month, -1))}>‹</button>
          <span className="m">{month ? monthLabel(month) : "Цял период"}</span>
          <button type="button" aria-label="Следващ месец" disabled={!month || month >= monthKey()}
            onClick={() => month && setMonth(shiftMonthKey(month, 1))}>›</button>
        </div>
      </div>
      <WorkerPayView
        me={me}
        earnings={videoEarnings.filter((e) => e.profile_id === currentUser.id)}
        packages={packageProgress.filter((p) => p.profile_id === currentUser.id)}
        payouts={payouts.filter((p) => p.profile_id === currentUser.id)}
        month={month}
        onSubmit={submitVideo}
      />
    </div>
  );
}

// ---- Изгледът на админа ----
function AdminPayouts() {
  const {
    team, currentUser, payRoles, videoEarnings, packageProgress, workerOwed,
    payouts, videoRates, invoices,
    setVideoPrice, payVideos, payAllFor, undoPayout,
    acceptVideo, returnVideo, grantBonus, createPackage, clients: clientList,
  } = useStore();

  const [month, setMonth] = useState<string | null>(monthKey());
  const [filter, setFilter] = useState<FilterKey>("all");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [pickedPkgs, setPickedPkgs] = useState<Set<number>>(new Set());
  const [payFor, setPayFor] = useState<string | null>(null);
  const [histFor, setHistFor] = useState<Set<string>>(new Set());
  const [newPkgFor, setNewPkgFor] = useState<string | null>(null);
  const isAdmin = true;
  const rows = useMemo(() => {
    return team
      .filter((m) => m.initials !== currentUser.initials)
      .map((m) => {
        const owed: WorkerOwed | undefined = workerOwed.find((w) => w.profile_id === m.id);
        const mine = videoEarnings.filter((e) => e.profile_id === m.id);
        const pkg = packageProgress.find((p) => p.profile_id === m.id && p.status !== "cancelled");
        const inPkg = mine.filter((e) => e.package_id);
        const outPkg = mine.filter((e) => !e.package_id);
        const burning = mine.filter((e) => !e.accepted_at && (e.timeline === "изтича" || e.timeline === "просрочено")).length;
        const review = mine.filter((e) => e.timeline === "чака преглед").length;
        const chips = Array.from(new Set(mine.map((e) => e.role_key))).map((k) => ({
          key: k, label: payRoleLabel(payRoles, k),
          price: videoPriceFor(videoRates, m.id, k, null, m.pay_rate),
        }));
        const hist = payouts.filter((p) => p.profile_id === m.id);
        return { m, owed, mine, pkg, inPkg, outPkg, burning, review, chips, hist };
      })
      .filter((r) => r.mine.length || r.owed?.owed || r.hist.length)
      .sort((a, b) => (b.owed?.owed || 0) - (a.owed?.owed || 0)
        || (b.burning + b.review) - (a.burning + a.review));
  }, [team, currentUser.initials, workerOwed, videoEarnings, packageProgress, payRoles, videoRates, payouts]);

  const counts = {
    all: rows.length,
    owed: rows.filter((r) => (r.owed?.owed || 0) > 0).length,
    burn: rows.reduce((a, r) => a + r.burning, 0),
    review: rows.reduce((a, r) => a + r.review, 0),
    pkg: rows.filter((r) => r.pkg).length,
  };
  const matches = (r: (typeof rows)[number]) =>
    filter === "all" ? true
      : filter === "owed" ? (r.owed?.owed || 0) > 0
      : filter === "burn" ? r.burning > 0
      : filter === "review" ? r.review > 0
      : !!r.pkg;
  const shown = rows.filter(matches);

  // Стъпка 3 от спецификацията: филтърът реже и редовете с видеа, не само хората.
  const keepRow = (e: VideoEarning) =>
    filter === "all" ? true
      : filter === "owed" ? e.status === "owed"
      : filter === "burn" ? !e.accepted_at && (e.timeline === "изтича" || e.timeline === "просрочено")
      : filter === "review" ? e.timeline === "чака преглед"
      : true;

  // ---- KPI: четири различни числа ----
  const kpiOwed = rows.reduce((a, r) => a + (r.owed?.owed || 0), 0);
  const kpiOpenPkg = packageProgress.filter((p) => p.status === "open").reduce((a, p) => a + p.payable_now, 0);
  const kpiAtRisk = rows.reduce((a, r) => a + (r.owed?.bonus_at_risk || 0), 0);
  const monthPayouts = payouts.filter((p) => !p.voided_at && inMonthKey(p.paid_at, month));
  const kpiPaid = monthPayouts.reduce((a, p) => a + p.amount, 0);

  const toggle = (set: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) =>
    set((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleNum = (set: React.Dispatch<React.SetStateAction<Set<number>>>, id: number) =>
    set((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const selectionFor = (r: (typeof rows)[number]) => {
    const payable = r.outPkg.filter((e) => e.status === "owed");
    const ids = payable.filter((e) => picked.has(e.id)).map((e) => e.id);
    const pkgs = r.pkg && r.pkg.status === "completed" && !r.pkg.payout_id && pickedPkgs.has(r.pkg.id) ? [r.pkg.id] : [];
    const sum = payable.filter((e) => ids.includes(e.id)).reduce((a, e) => a + e.payable, 0)
      + (pkgs.length && r.pkg ? r.pkg.payable_now : 0);
    return { payable, ids, pkgs, sum, all: ids.length === payable.length && payable.length > 0 };
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-5)" }}>
      <div className="pay-app">
        <div className="pay-head">
          <div>
            <h2>Възнаграждения</h2>
            <p>{HINTS[filter]}</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div className="pay-monthnav">
            <button type="button" aria-label="Предишен месец" disabled={!month}
              onClick={() => month && setMonth(shiftMonthKey(month, -1))}>‹</button>
            <span className="m">{month ? monthLabel(month) : "Цял период"}</span>
            <button type="button" aria-label="Следващ месец" disabled={!month || month >= monthKey()}
              onClick={() => month && setMonth(shiftMonthKey(month, 1))}>›</button>
            <button type="button" className="today" onClick={() => setMonth((m) => (m ? null : monthKey()))}>
              {month ? "Всичко" : "Днес"}
            </button>
          </div>
          <button className="bm-btn bm-btn--secondary bm-btn--sm" onClick={() => setNewPkgFor("")}>
            + Пакет
          </button>
          </div>
        </div>

        {/* ---- Филтрите заместват три отделни екрана ---- */}
        <div className="pay-chips">
          {([
            ["all", "Всички", ""], ["owed", "Дължимо", "g"],
            ["burn", "⏱ Горят", "w"], ["review", "↩ Чакат теб", "b"], ["pkg", "Пакети", ""],
          ] as const).map(([k, label, cls]) => (
            <button key={k} type="button" className={"pay-chip " + cls} aria-pressed={filter === k}
              onClick={() => setFilter(k)}>
              {label}<span className="c">{counts[k as FilterKey]}</span>
            </button>
          ))}
        </div>

        <div className="pay-kpis">
          <div className="pay-kpi owed">
            <div className="k">Дължимо сега</div>
            <div className="v"><Money>{money(kpiOwed)}</Money></div>
            <div className="s">извън пакетите</div>
          </div>
          <div className="pay-kpi">
            <div className="k">В отворени пакети</div>
            <div className="v"><Money>{money(kpiOpenPkg)}</Money></div>
            <div className="s">плаща се при затваряне</div>
          </div>
          <div className="pay-kpi">
            <div className="k">Премия в риск</div>
            <div className="v" style={{ color: "var(--bm-success-600)" }}><Money>{money(kpiAtRisk)}</Money></div>
            <div className="s">още може да се спечели</div>
          </div>
          <div className="pay-kpi paid">
            <div className="k">Изплатено {month ? monthLabel(month).split(" ")[0].toLowerCase() : "общо"}</div>
            <div className="v"><Money>{money(kpiPaid)}</Money></div>
            <div className="s">{monthPayouts.length} {monthPayouts.length === 1 ? "превод" : "превода"}</div>
          </div>
        </div>

        <div className="pay-rows">
          {shown.length === 0 && (
            <p className="bm-text-subtle" style={{ fontSize: "var(--bm-text-sm)", margin: 0, padding: "18px 20px" }}>
              {filter === "burn" ? "Няма горящи срокове."
                : filter === "review" ? "Нищо не чака преглед."
                : filter === "owed" ? "Не дължиш пари в момента."
                : filter === "pkg" ? "Няма пакетни договорки."
                : "Няма възнаграждения за показване."}
            </p>
          )}

          {shown.map((r) => {
            // Активен филтър разгъва автоматично — иначе трябва да цъкаш всеки.
            const isOpen = filter !== "all" || open.has(r.m.id);
            const sel = selectionFor(r);
            const owedNow = r.owed?.owed || 0;

            const visIn = r.inPkg.filter(keepRow);
            const visOut = r.outPkg.filter(keepRow);

            return (
              <div key={r.m.id} className={"pay-row" + (isOpen ? " is-open" : "")}>
                <button type="button" className="pay-phead" onClick={() => toggle(setOpen, r.m.id)}>
                  <span className="pay-chev">▶</span>
                  <Avatar initials={r.m.initials} style={{ width: 31, height: 31, fontSize: 11 }} />
                  <span className="pay-who">
                    <span className="n">{r.m.name}</span>
                    <span className="m">
                      {/* Знакът за цена — отговорът на „с кого работя на пакет“ */}
                      {r.pkg ? (
                        <span className="pay-mode pay-mode--pkg">
                          ПАКЕТ {r.pkg.used}/{r.pkg.videos_total} · <Money>{money(r.pkg.price_per_video)}</Money>
                        </span>
                      ) : (
                        <span className="pay-mode pay-mode--per">
                          {r.chips.length
                            ? r.chips.map((c) => `${money(c.price)} ${c.label.toLowerCase()}`).join(" · ")
                            : "без тарифа"}
                        </span>
                      )}
                      {r.mine.filter((e) => !e.accepted_at && e.timeline === "просрочено").length > 0 && (
                        <span className="pay-flag pay-flag--bad">
                          ✕ {r.mine.filter((e) => !e.accepted_at && e.timeline === "просрочено").length} просрочено
                        </span>
                      )}
                      {r.mine.filter((e) => !e.accepted_at && e.timeline === "изтича").length > 0 && (
                        <span className="pay-flag pay-flag--warn">
                          ⏱ {r.mine.filter((e) => !e.accepted_at && e.timeline === "изтича").length} изтича
                        </span>
                      )}
                      {r.review > 0 && <span className="pay-flag pay-flag--rev">↩ {r.review} чака теб</span>}
                    </span>
                  </span>
                  <span className={"pay-owed" + (owedNow ? "" : " is-zero")}><Money>{money(owedNow)}</Money></span>
                  <span role="button" tabIndex={0}
                    className={"bm-btn bm-btn--sm " + (owedNow ? "bm-btn--primary" : "bm-btn--secondary")}
                    aria-disabled={!owedNow}
                    style={owedNow ? undefined : { opacity: .4, pointerEvents: "none" }}
                    onClick={(e) => { e.stopPropagation(); if (owedNow) setPayFor(r.m.id); }}
                    onKeyDown={(e) => { if (owedNow && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); e.stopPropagation(); setPayFor(r.m.id); } }}>
                    {owedNow ? `Плати ${money(owedNow)}` : "Плати"}
                  </span>
                </button>

                {isOpen && (
                  <div className="pay-detail">
                    {/* ---- Група „По пакета“ ---- */}
                    {r.pkg && (visIn.length > 0 || filter === "all" || filter === "pkg") && (
                      <div>
                        <div className="pay-grp">
                          <span>По пакета</span>
                          <b>{visIn.length} {visIn.length === 1 ? "видео" : "видеа"}</b>
                        </div>
                        <PackageCard pkg={r.pkg}
                          selectable={isAdmin && r.pkg.status === "completed" && !r.pkg.payout_id}
                          checked={pickedPkgs.has(r.pkg.id)}
                          onCheck={() => r.pkg && toggleNum(setPickedPkgs, r.pkg.id)} />
                        {visIn.length > 0 && <RowHead />}
                        {visIn.map((e) => (
                          <EarningRow key={e.id} e={e} checked={false} onCheck={() => {}}
                            onPrice={(v) => setVideoPrice(e.id, v)}
                            onAccept={() => acceptVideo(e.id)} onGrant={grantBonus} onReturn={returnVideo} />
                        ))}
                      </div>
                    )}

                    {/* ---- Група „Извън пакета“ ---- */}
                    {visOut.length > 0 && (
                      <div>
                        <div className="pay-grp">
                          <span>{r.pkg ? "Извън пакета — плаща се отделно" : "Видеа"}</span>
                          <b>{visOut.length} {visOut.length === 1 ? "видео" : "видеа"}</b>
                        </div>
                        <RowHead />
                        {visOut.map((e) => (
                          <EarningRow key={e.id} e={e} checked={picked.has(e.id)}
                            onCheck={() => toggleNum(setPicked, e.id)}
                            onPrice={(v) => setVideoPrice(e.id, v)}
                            onAccept={() => acceptVideo(e.id)} onGrant={grantBonus} onReturn={returnVideo} />
                        ))}
                      </div>
                    )}

                    {visIn.length === 0 && visOut.length === 0 && !r.pkg && (
                      <p className="bm-text-subtle" style={{ fontSize: 12.5, margin: 0, padding: "10px 8px" }}>
                        Няма видеа по този филтър.
                      </p>
                    )}

                    {/* ---- История ---- */}
                    {histFor.has(r.m.id) && (
                      <div className="pay-hist">
                        {r.hist.length === 0 && <div className="pay-hist-row">Още няма отбелязани плащания.</div>}
                        {r.hist.map((p) => (
                          <div key={p.id} className={"pay-hist-row" + (p.voided_at ? " is-void" : "")}>
                            <span className="amt"><Money>{money(p.amount)}</Money></span>
                            <span>{shortDay(p.paid_at)}</span>
                            <span>{PAY_METHODS.find((x) => x.id === p.method)?.label || p.method || "—"}</span>
                            {p.reference && <span>· {p.reference}</span>}
                            {p.voided_at ? <span>· отменено</span> : (
                              <button className="bm-btn bm-btn--ghost bm-btn--sm" style={{ marginLeft: "auto" }}
                                onClick={() => undoPayout(p.id)}>Отмени</button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="pay-dfoot">
                      <span className="sel">
                        {sel.payable.length > 0
                          ? <>Избрани <b>{sel.ids.length}</b> от {sel.payable.length} · <b>{money(sel.sum)}</b></>
                          : r.pkg && r.pkg.status === "open"
                            ? "Пакетът се плаща наведнъж — отделните видеа не се маркират"
                            : "Няма дължими позиции"}
                      </span>
                      <button className="bm-btn bm-btn--ghost bm-btn--sm" onClick={() => toggle(setHistFor, r.m.id)}>
                        {histFor.has(r.m.id) ? "Скрий историята" : "История на плащанията"}
                      </button>
                      {(sel.payable.length > 0 || sel.pkgs.length > 0) && (
                        <button className="bm-btn bm-btn--primary bm-btn--sm"
                          disabled={sel.ids.length === 0 && sel.pkgs.length === 0}
                          onClick={() => setPayFor(r.m.id)}>
                          {sel.all && !sel.pkgs.length ? "Плати всичко" : `Плати избраните (${money(sel.sum)})`}
                        </button>
                      )}
                    </div>

                    {/* ---- Равносметката е диагностиката, не украса ---- */}
                    <div className="pay-recon">
                      <span>Дължимо сега <b>{money(r.owed?.owed_videos || 0)}</b> — видеата извън пакета</span>
                      {r.pkg && r.pkg.status === "open" && (
                        <span>При затваряне на пакета <b>{money(r.pkg.payable_now)}</b></span>
                      )}
                      {(r.owed?.owed_packages || 0) > 0 && (
                        <span>Завършени пакети <b>{money(r.owed?.owed_packages || 0)}</b></span>
                      )}
                      <span>Общо в реда горе <b>{money(owedNow)}</b></span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <ProfitStrip month={month} invoices={invoices} payouts={payouts} />

      {newPkgFor !== null && (
        <PackageModal
          team={team.filter((m) => m.initials !== currentUser.initials)}
          roles={payRoles}
          clients={clientList}
          preset={newPkgFor}
          onClose={() => setNewPkgFor(null)}
          onCreate={(profileId, target, total, label, role, client, base, bonus) => {
            createPackage(profileId, target, total, label, role, client, base, bonus);
            setNewPkgFor(null);
          }}
        />
      )}

      {payFor && (() => {
        const r = rows.find((x) => x.m.id === payFor);
        if (!r) return null;
        const s = selectionFor(r);
        const use = s.sum > 0 ? s : { ids: [] as number[], pkgs: [] as number[], sum: r.owed?.owed || 0 };
        return (
          <PayModal name={r.m.name} selection={use} onClose={() => setPayFor(null)}
            onConfirm={(method, reference) => {
              if (use.ids.length || use.pkgs.length) payVideos(payFor, use.ids, use.pkgs, method, reference);
              else payAllFor(payFor, method, reference);
              setPicked(new Set()); setPickedPkgs(new Set()); setPayFor(null);
            }} />
        );
      })()}
    </div>
  );
}

function RowHead() {
  return (
    <div className="pay-vhd">
      <span /><span /><span>Видео</span><span>Срок</span>
      <span style={{ textAlign: "right" }}>Плащане</span><span />
    </div>
  );
}

// Ред с видео — осемте състояния от спецификацията.
function EarningRow({
  e, checked, onCheck, onPrice, onAccept, onGrant, onReturn,
}: {
  e: VideoEarning; checked: boolean; onCheck: () => void; onPrice: (v: number) => void;
  onAccept: () => void; onGrant: (id: number, reason: string) => void;
  onReturn: (id: number, reason: string) => void;
}) {
  const st = rowState(e);
  const [cls, ch] = MARK[st];
  const selectable = e.status === "owed";
  const paid = e.status === "paid";
  const got = e.bonus_status === "earned" || e.bonus_status === "granted";

  const caption =
    st === "ontime" ? <span style={{ color: "var(--bm-success-600)" }}>в срок</span>
      : st === "owed" ? <span style={{ color: "var(--bm-success-600)" }}>дължимо</span>
      : st === "late" && e.accepted_at ? <span style={{ color: "var(--bm-danger-600)" }}>{e.days_late} дни късно</span>
      : st === "late" ? <span style={{ color: "var(--bm-danger-600)" }}>просрочено</span>
      : st === "review" ? <span style={{ color: "var(--bm-primary)" }}>часовникът спрял</span>
      : st === "due" ? <span style={{ color: "var(--bm-warning-700)" }}>изтича</span>
      : st === "paid" ? <span className="bm-text-subtle">платено</span>
      : <span className="bm-text-subtle">в игра</span>;

  return (
    <label className="pay-vr2">
      {selectable
        ? <input type="checkbox" className="pay-cb" checked={checked} onChange={onCheck} aria-label={`Избери ${e.title}`} />
        : <span />}
      <span className={"pay-mk pay-mk--" + cls}>{ch}</span>
      <span style={{ minWidth: 0 }}>
        <span className="pay-vt">{e.title}</span>
        <span className="pay-vm">
          {e.role_label || e.role_key}{e.client_name ? " · " + e.client_name : ""}
          {e.redos > 0 ? ` · ${e.redos} преправк${e.redos === 1 ? "а" : "и"}` : ""}
          {e.price_locked ? " · 🔒 ръчна цена" : ""}
        </span>
      </span>
      <span className="pay-dt">
        {e.due_at ? <>срок <b>{shortDay(e.due_at)}</b></> : <span className="bm-text-subtle">без срок</span>}
        {e.submitted_at && <><br />подадено <b>{shortDay(e.submitted_at)}</b></>}
      </span>
      <span className="pay-amt">
        <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
          €<input type="number" step="0.01" min="0" defaultValue={e.price} key={e.id + ":" + e.price}
            disabled={paid || !!e.package_id}
            onClick={(ev) => ev.preventDefault()}
            onBlur={(ev) => {
              const n = parseFloat(ev.currentTarget.value);
              if (!Number.isNaN(n) && n !== e.price) onPrice(n);
            }}
            style={{ width: 54, textAlign: "right", padding: "2px 4px", border: "1px solid var(--bm-border)",
              borderRadius: 4, background: paid || e.package_id ? "var(--bm-surface-2)" : "var(--bm-surface)",
              color: "var(--bm-text)", font: "inherit" }}
            title={e.package_id ? "Цената идва от пакета" : paid ? "Платено" : "Ръчна цена — заключва се"} />
        </span>
        {e.bonus_amount > 0 && (
          <b style={{ color: got ? "var(--bm-success-600)" : e.bonus_status === "missed" ? "var(--bm-text-subtle)" : "var(--bm-warning-700)" }}>
            {" "}{e.bonus_status === "missed" ? "+€0" : "+" + money(e.bonus_amount)}
          </b>
        )}
        <span className="cap">{caption}</span>
      </span>
      <span className="pay-act">
        {st === "review" && (
          <span style={{ display: "inline-flex", gap: 4 }}>
            <button className="bm-btn bm-btn--primary bm-btn--sm" onClick={(ev) => { ev.preventDefault(); onAccept(); }}>Приеми</button>
            <button className="bm-btn bm-btn--ghost bm-btn--sm" onClick={(ev) => {
              ev.preventDefault();
              const why = window.prompt("Защо се връща за преправка?");
              if (why) onReturn(e.id, why);
            }}>Върни</button>
          </span>
        )}
        {st === "late" && e.accepted_at && e.bonus_amount > 0 && e.bonus_status === "missed" && (
          <button className="bm-btn bm-btn--secondary bm-btn--sm" onClick={(ev) => {
            ev.preventDefault();
            const why = window.prompt("Защо все пак получава премията?");
            if (why) onGrant(e.id, why);
          }}>дай премията</button>
        )}
      </span>
    </label>
  );
}

function PackageCard({ pkg, selectable, checked, onCheck }: {
  pkg: PackageProgress; selectable: boolean; checked: boolean; onCheck: () => void;
}) {
  const pct = (v: number) => (v / Math.max(1, pkg.videos_total)) * 100;
  return (
    <div className="pay-pkgcard">
      <div className="pay-pkgtop">
        <span className="pay-pkgt">
          {selectable && (
            <input type="checkbox" className="pay-cb" style={{ marginRight: 8 }} checked={checked} onChange={onCheck} />
          )}
          {pkg.label || `${pkg.videos_total} видеа`}{" "}
          <span>· <Money>{money(pkg.price_per_video)}</Money>/видео
            {pkg.bonus_per_video > 0 ? <> · премия <Money>{money(pkg.bonus_per_video)}</Money></> : null}</span>
        </span>
        <span className="bm-text-subtle" style={{ fontFamily: "var(--bm-font-mono)", fontSize: 12 }}>
          {pkg.client_name || "всички клиенти"}{pkg.role_key ? " · " + pkg.role_key : ""}
        </span>
      </div>
      <div className="pay-bar2">
        <i className="done" style={{ width: `${pct(pkg.on_time || pkg.used - pkg.late)}%` }} />
        <i className="late" style={{ width: `${pct(pkg.late)}%` }} />
      </div>
      <div style={{ fontSize: 12, color: "var(--bm-text-subtle)" }}>
        {pkg.used} от {pkg.videos_total} приети
        {pkg.bonus_per_video > 0 && <> · <span style={{ color: "var(--bm-success-600)" }}>{pkg.on_time} в срок</span>
          {pkg.late > 0 && <> · <span style={{ color: "var(--bm-danger-600)" }}>{pkg.late} закъсняло</span></>}</>}
        {" "}· остават {Math.max(0, pkg.videos_total - pkg.used)}
        {pkg.days_running > 40 && pkg.status === "open" && (
          <> · <span style={{ color: "var(--bm-warning-700)" }}>{pkg.days_running} дни — стои</span></>
        )}
      </div>
      <div className="pay-pkgn">
        <div className="pay-pn"><div className="k">Пакетна цена</div><div className="v"><Money>{money(pkg.price_total)}</Money></div></div>
        {pkg.bonus_per_video > 0 && (
          <>
            <div className="pay-pn"><div className="k">Заслужена премия</div>
              <div className="v" style={{ color: "var(--bm-success-600)" }}><Money>{money(pkg.bonus_earned)}</Money></div></div>
            <div className="pay-pn"><div className="k">Премия в риск</div>
              <div className="v" style={{ color: "var(--bm-warning-700)" }}><Money>{money(pkg.bonus_at_risk)}</Money></div></div>
          </>
        )}
        <div className="pay-pn"><div className="k">При затваряне</div><div className="v"><Money>{money(pkg.payable_now)}</Money></div></div>
        {pkg.saved_vs_base !== null && pkg.saved_vs_base !== undefined && (
          <div className="pay-pn"><div className="k">Спестено</div>
            <div className="v" style={{ color: pkg.saved_vs_base >= 0 ? "var(--bm-success-600)" : "var(--bm-danger-600)" }}>
              <Money>{money(pkg.saved_vs_base)}</Money></div></div>
        )}
      </div>
      <div className="pay-pkghint">
        <span>↳</span>
        <span>
          {pkg.status === "completed"
            ? <>Пакетът е пълен — сумата е дължима сега.</>
            : <>Плаща се наведнъж при <b style={{ fontFamily: "var(--bm-font-mono)" }}>{pkg.videos_total} от {pkg.videos_total}</b>. Затова дължимото сега не включва тези видеа.</>}
        </span>
      </div>
    </div>
  );
}

function ProfitStrip({ month, invoices, payouts }: {
  month: string | null;
  invoices: Parameters<typeof collectedRevenue>[0];
  payouts: Parameters<typeof payoutCost>[0];
}) {
  const rev = collectedRevenue(invoices, month === monthKey());
  const cost = payoutCost(payouts, month);
  const net = rev - cost;
  return (
    <div className="pay-kpis" style={{ border: "1px solid var(--bm-border)", borderRadius: "var(--bm-radius-lg)", overflow: "hidden" }}>
      <div className="pay-kpi"><div className="k">Събрано {month ? monthLabel(month) : "общо"}</div>
        <div className="v"><Money>{money(rev)}</Money></div><div className="s">платени фактури</div></div>
      <div className="pay-kpi"><div className="k">Изплатено на екипа</div>
        <div className="v" style={{ color: "var(--bm-danger-600)" }}><Money>{money(cost)}</Money></div>
        <div className="s">реални преводи</div></div>
      <div className="pay-kpi"><div className="k">Чиста печалба</div>
        <div className="v" style={{ color: net >= 0 ? "var(--bm-success-600)" : "var(--bm-danger-600)" }}><Money>{money(net)}</Money></div>
        <div className="s">преди другите разходи</div></div>
    </div>
  );
}

function PayModal({ name, selection, onClose, onConfirm }: {
  name: string; selection: { ids: number[]; pkgs: number[]; sum: number };
  onClose: () => void; onConfirm: (method: string, reference: string) => void;
}) {
  const [method, setMethod] = useState(PAY_METHODS[0].id);
  const [reference, setReference] = useState("");
  const count = selection.ids.length + selection.pkgs.length;
  return (
    <div className="bm-modal-overlay" onClick={(ev) => { if (ev.target === ev.currentTarget) onClose(); }}>
      <div className="bm-modal" style={{ maxWidth: 420 }}>
        <div className="bm-modal__header"><h3>Плащане към {name}</h3></div>
        <div className="bm-modal__body" style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-3)" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <span className="bm-text-muted" style={{ fontSize: "var(--bm-text-sm)" }}>
              {count ? `${count} избрани позиции` : "Всичко дължимо"}
            </span>
            <span style={{ fontSize: "var(--bm-text-xl)", fontWeight: 700, fontFamily: "var(--bm-font-mono)" }}>
              <Money>{money(selection.sum)}</Money>
            </span>
          </div>
          <div className="bm-field"><label className="bm-label">Метод</label>
            <select className="bm-input" value={method} onChange={(ev) => setMethod(ev.target.value)}>
              {PAY_METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select></div>
          <div className="bm-field"><label className="bm-label">Референция</label>
            <input className="bm-input" value={reference} onChange={(ev) => setReference(ev.target.value)}
              placeholder="напр. REV-0812" /></div>
          <p className="bm-text-subtle" style={{ fontSize: "var(--bm-text-xs)", margin: 0 }}>
            Референцията е разликата между „платих му“ и „ето превод REV-0812 от 14.08“.
          </p>
        </div>
        <div className="bm-modal__footer">
          <button className="bm-btn bm-btn--secondary" onClick={onClose}>Отказ</button>
          <button className="bm-btn bm-btn--primary" onClick={() => onConfirm(method, reference)}>Отбележи платено</button>
        </div>
      </div>
    </div>
  );
}

// Създаване на пакет. Ограничението „един активен пакет на човек+клиент+роля“
// се налага от базата — второ видео иначе би влязло в първия пакет.
function PackageModal({
  team, roles, clients, preset, onClose, onCreate,
}: {
  team: { id: string; name: string; initials: string }[];
  roles: { key: string; label: string }[];
  clients: { id: string; name: string; archived_at?: string | null }[];
  preset: string;
  onClose: () => void;
  onCreate: (profileId: string, target: number, total: number, label: string,
    role: string | null, client: string | null, base: number | null, bonus: number) => void;
}) {
  const [profileId, setProfileId] = useState(preset || team[0]?.id || "");
  const [target, setTarget] = useState(10);
  const [total, setTotal] = useState(160);
  const [role, setRole] = useState("");
  const [client, setClient] = useState("");
  const [base, setBase] = useState("");
  const [bonus, setBonus] = useState(0);
  const [label, setLabel] = useState("");

  const perVideo = target > 0 ? total / target : 0;
  const baseNum = base === "" ? null : parseFloat(base);
  const saved = baseNum !== null && !Number.isNaN(baseNum) ? baseNum * target - (total + bonus * target) : null;

  return (
    <div className="bm-modal-overlay" onClick={(ev) => { if (ev.target === ev.currentTarget) onClose(); }}>
      <div className="bm-modal" style={{ maxWidth: 480 }}>
        <div className="bm-modal__header"><h3>Нов пакет</h3></div>
        <div className="bm-modal__body" style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-3)" }}>
          <div className="bm-field"><label className="bm-label">Човек</label>
            <select className="bm-input" value={profileId} onChange={(e) => setProfileId(e.target.value)}>
              {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select></div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--bm-space-3)" }}>
            <div className="bm-field"><label className="bm-label">Брой видеа</label>
              <input className="bm-input" type="number" min={1} value={target}
                onChange={(e) => setTarget(Math.max(1, parseInt(e.target.value) || 1))} /></div>
            <div className="bm-field"><label className="bm-label">Обща цена (€)</label>
              <input className="bm-input" type="number" step="0.01" min={0} value={total}
                onChange={(e) => setTotal(parseFloat(e.target.value) || 0)} /></div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--bm-space-3)" }}>
            <div className="bm-field"><label className="bm-label">Роля</label>
              <select className="bm-input" value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="">всяка роля</option>
                {roles.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
              </select></div>
            <div className="bm-field"><label className="bm-label">Клиент</label>
              <select className="bm-input" value={client} onChange={(e) => setClient(e.target.value)}>
                <option value="">всеки клиент</option>
                {clients.filter((c) => !c.archived_at).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--bm-space-3)" }}>
            <div className="bm-field"><label className="bm-label">Базова цена (€)</label>
              <input className="bm-input" type="number" step="0.01" min={0} value={base} placeholder="без пакет"
                onChange={(e) => setBase(e.target.value)} /></div>
            <div className="bm-field"><label className="bm-label">Премия за срок (€)</label>
              <input className="bm-input" type="number" step="0.01" min={0} value={bonus}
                onChange={(e) => setBonus(parseFloat(e.target.value) || 0)} /></div>
          </div>

          <div className="bm-field"><label className="bm-label">Име</label>
            <input className="bm-input" value={label} onChange={(e) => setLabel(e.target.value)}
              placeholder={`${target} видеа`} /></div>

          <div className="pay-recon" style={{ marginTop: 0 }}>
            <span>Цена на видео <b>{money(perVideo)}</b></span>
            {bonus > 0 && <span>С премия <b>{money(perVideo + bonus)}</b></span>}
            {saved !== null && (
              <span style={{ color: saved >= 0 ? "var(--bm-success-600)" : "var(--bm-danger-600)" }}>
                {saved >= 0 ? "Спестяваш" : "Плащаш повече с"} <b>{money(Math.abs(saved))}</b>
              </span>
            )}
          </div>
          <p className="bm-text-subtle" style={{ fontSize: "var(--bm-text-xs)", margin: 0 }}>
            Базовата цена е колко би струвало без пакет — от нея излиза „Спестено“. Премията се
            получава само ако видеото е подадено до срока си.
          </p>
        </div>
        <div className="bm-modal__footer">
          <button className="bm-btn bm-btn--secondary" onClick={onClose}>Отказ</button>
          <button className="bm-btn bm-btn--primary" disabled={!profileId || target < 1}
            onClick={() => onCreate(profileId, target, total, label || `${target} видеа`,
              role || null, client || null, baseNum !== null && !Number.isNaN(baseNum) ? baseNum : null, bonus)}>
            Създай пакет
          </button>
        </div>
      </div>
    </div>
  );
}
