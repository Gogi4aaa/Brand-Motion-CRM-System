"use client";

// Анализи — редизайн по analytics-v2.
//
// Водещото правило: всеки блок отговаря на РАЗЛИЧЕН въпрос и никое число не се
// появява два пъти на екрана. Затова „Топ приход по клиент“ отпадна (таблицата
// вече го дава) и „Задържане“ се сля в колоната „месеци активен“.
//
// Приходът е касов (платени фактури по paid_at). Разходът за екипа е НАЧИСЛЕН
// (video_earnings по earned_at) — цената на свършената работа. Реално
// преведеното се показва отделно, защото преводът идва по-късно от работата.

import { useMemo, useState } from "react";
import { useStore } from "@/components/store";
import {
  fmtFull, monthKey, monthLabel, monthlyPnl, receivablesAging, spendBreakdown,
  clientPnlRows, accruedLiability, clientTenureDays, fmtTenure, clientStatusMeta,
  PIPELINE_STAGES,
} from "@/lib/data";
import { Money } from "@/components/MoneyLock";
import { MoneyTruth } from "@/components/MoneyTruth";
import { PaymentBehavior } from "@/components/PaymentBehavior";
import { MoneyChart, VideosChart, Spark } from "@/components/AnalyticsCharts";

const money = (n: number) => fmtFull(n);
type SortKey = "name" | "revenue" | "cost" | "profit" | "margin" | "videos" | "costPerVideo";

// Промяна спрямо предходния месец. Извън компонента — иначе React Compiler
// пресъздава типа при всеки render.
function Delta({ v }: { v: number }) {
  return <span className={"an-delta " + (v >= 0 ? "up" : "down")}>{v >= 0 ? "▲" : "▼"} {Math.abs(v)}%</span>;
}

export default function AnalyticsPage() {
  const { clients, invoices, leads, payouts, videoEarnings, team } = useStore();
  const [range, setRange] = useState<number | null>(6);
  const [sortKey, setSortKey] = useState<SortKey>("margin");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const series = useMemo(() => monthlyPnl(invoices, videoEarnings, payouts, range),
    [invoices, videoEarnings, payouts, range]);
  const cur = series[series.length - 1];
  const prev = series[series.length - 2];
  const owedToTeam = accruedLiability(videoEarnings);
  const aging = receivablesAging(invoices);
  const spend = spendBreakdown(payouts, videoEarnings, team, monthKey());
  const unpaid = aging.reduce((a, b) => a + b.amount, 0);

  // ---- Рентабилност по клиент, сортируема ----
  const rows = useMemo(() => {
    const base = clientPnlRows(clients, invoices, videoEarnings).map((r) => {
      const c = clients.find((x) => x.id === r.id);
      return { ...r, days: c ? clientTenureDays(c) : 0, archived: !!c?.archived_at, margin: r.margin ?? -Infinity };
    });
    return base.sort((a, b) => {
      const A = a[sortKey], B = b[sortKey];
      const cmp = typeof A === "string" ? A.localeCompare(String(B), "bg") : (A as number) - (B as number);
      return sortDir === "desc" ? -cmp : cmp;
    });
  }, [clients, invoices, videoEarnings, sortKey, sortDir]);

  const sortBy = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(k); setSortDir("desc"); }
  };
  const dirOf = (k: SortKey) => (sortKey === k ? sortDir : undefined);

  const pct = (a: number, b: number) => (b ? Math.round(((a - b) / b) * 100) : 0);

  // ---- Сделки ----
  const won = leads.filter((l) => l.stage === "won");
  const lost = leads.filter((l) => l.stage === "lost");
  const winRate = won.length + lost.length ? Math.round((won.length / (won.length + lost.length)) * 100) : 0;
  const wonSum = won.reduce((a, l) => a + (l.value || 0), 0);
  const lostSum = lost.reduce((a, l) => a + (l.value || 0), 0);
  const dealMax = Math.max(1, wonSum, lostSum);
  const openDeals = PIPELINE_STAGES
    .filter((s) => s.key !== "won" && s.key !== "lost" && s.key !== "waiting")
    .map((s) => ({ title: s.title, val: leads.filter((l) => l.stage === s.key).reduce((a, b) => a + (b.value || 0), 0) }))
    .filter((s) => s.val > 0);

  const spendMax = Math.max(1, ...spend.rows.map((r) => r.amount));
  const agingMax = Math.max(1, ...aging.map((a) => a.amount));
  const toneVar = (t: string) =>
    t === "ok" ? "var(--bm-success-600)" : t === "warn" ? "var(--bm-warning-600)"
      : t === "bad" ? "var(--bm-danger-600)" : "var(--bm-text-subtle)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-5)" }}>
      <MoneyTruth />
      <PaymentBehavior />
      <div className="an-app">
        <div className="an-head">
          <div>
            <h2>Анализи</h2>
            <p>Печеля ли · кой клиент носи пари · расте ли обемът · къде отиват парите</p>
          </div>
          <div className="an-segs">
            {([[6, "6 месеца"], [12, "12 месеца"], [null, "Цял период"]] as const).map(([v, l]) => (
              <button key={l} type="button" aria-pressed={range === v} onClick={() => setRange(v)}>{l}</button>
            ))}
          </div>
        </div>

        {/* ---- Четири KPI-та с четири различни числа ---- */}
        <div className="an-kpis">
          <div className="an-kpi">
            <div className="k">Събрано · {cur ? cur.label.toLowerCase() : "—"}</div>
            <div className="v"><Money>{money(cur?.revenue || 0)}</Money></div>
            <div className="r">
              {prev && <Delta v={pct(cur.revenue, prev.revenue)} />}
              <Spark values={series.map((s) => s.revenue)} />
              {prev && <span>спрямо {prev.label.split(" ")[0]}</span>}
            </div>
          </div>
          <div className="an-kpi">
            <div className="k">Разход за екипа</div>
            <div className="v" style={{ color: "var(--s2)" }}><Money>{money(cur?.cost || 0)}</Money></div>
            <div className="r"><span>начислено · преведено <Money>{money(cur?.paidOut || 0)}</Money></span></div>
          </div>
          <div className="an-kpi">
            <div className="k">Чиста печалба</div>
            <div className="v" style={{ color: "var(--s3)" }}><Money>{money(cur?.profit || 0)}</Money></div>
            <div className="r">
              {prev && <Delta v={pct(cur.profit, prev.profit)} />}
              <Spark values={series.map((s) => s.profit)} />
              <span>марж {cur && cur.revenue > 0 ? Math.round((cur.profit / cur.revenue) * 100) : 0}%</span>
            </div>
          </div>
          <div className="an-kpi">
            <div className="k">{unpaid > 0 ? "Несъбрано" : "Дължиш на екипа"}</div>
            <div className="v" style={{ color: "var(--bm-warning-600)" }}>
              <Money>{money(unpaid > 0 ? unpaid : owedToTeam)}</Money>
            </div>
            <div className="r">
              <span>{unpaid > 0
                ? `${aging.reduce((a, b) => a + b.count, 0)} отворени фактури`
                : "начислено, още непреведено"}</span>
            </div>
          </div>
        </div>

        {/* ---- Приход · разход · печалба ---- */}
        <div className="an-block">
          <div className="an-bh">
            <span className="an-bt">Приход, разход и печалба по месеци</span>
            <span className="an-bs">EUR · приход по плащане, разход по завършена работа</span>
          </div>
          <div className="an-legend">
            <span className="an-lg"><i style={{ background: "var(--s1)" }} />Приход</span>
            <span className="an-lg"><i style={{ background: "var(--s2)" }} />Разход</span>
            <span className="an-lg line"><i style={{ background: "var(--s3)" }} />Печалба</span>
          </div>
          {series.length ? <MoneyChart data={series} />
            : <p className="an-empty">Няма данни за периода.</p>}
        </div>

        {/* ---- Видеа ---- */}
        <div className="an-block">
          <div className="an-bh">
            <span className="an-bt">Завършени видеа по месеци</span>
            <span className="an-bs">брой · и средна себестойност на видео</span>
          </div>
          {series.length ? <VideosChart data={series} />
            : <p className="an-empty">Няма завършени видеа за периода.</p>}
        </div>

        {/* ---- Рентабилност по клиент ---- */}
        <div className="an-block">
          <div className="an-bh">
            <span className="an-bt">Рентабилност по клиент</span>
            <span className="an-bs">клик върху заглавие подрежда · разходът е начисленото към екипа</span>
          </div>
          <div className="an-tbl">
            <table>
              <thead>
                <tr>
                  <th data-dir={dirOf("name")} onClick={() => sortBy("name")}>Клиент</th>
                  <th data-dir={dirOf("revenue")} onClick={() => sortBy("revenue")} style={{ textAlign: "right" }}>Приход</th>
                  <th data-dir={dirOf("cost")} onClick={() => sortBy("cost")} style={{ textAlign: "right" }}>Разход</th>
                  <th data-dir={dirOf("profit")} onClick={() => sortBy("profit")} style={{ textAlign: "right" }}>Печалба</th>
                  <th data-dir={dirOf("margin")} onClick={() => sortBy("margin")} style={{ textAlign: "right" }}>Марж</th>
                  <th data-dir={dirOf("videos")} onClick={() => sortBy("videos")} style={{ textAlign: "right" }}>Видеа</th>
                  <th data-dir={dirOf("costPerVideo")} onClick={() => sortBy("costPerVideo")} style={{ textAlign: "right" }}>Цена/видео</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const neg = r.profit < 0;
                  const hasRev = r.margin !== -Infinity;
                  const mw = hasRev ? Math.max(0, Math.min(100, r.margin)) : 0;
                  const mc = !hasRev || r.margin < 0 ? "var(--bm-danger-600)"
                    : r.margin < 25 ? "var(--bm-warning-600)" : "var(--s3)";
                  const meta = clientStatusMeta(r.status);
                  return (
                    <tr key={r.id}>
                      <td className="name">
                        {r.name}{" "}
                        {(r.status === "Churned" || r.status === "At risk") && (
                          <span className={"bm-badge " + meta.cls} style={{ fontSize: 10 }}>{meta.label}</span>
                        )}
                        {r.archived && <span className="bm-badge bm-badge--neutral" style={{ fontSize: 10 }}>архивиран</span>}
                        <div className="bm-text-subtle" style={{ fontSize: 11.5 }}>{fmtTenure(r.days)} активен</div>
                      </td>
                      <td className="n"><Money>{money(r.revenue)}</Money></td>
                      <td className="n" style={{ color: "var(--bm-text-muted)" }}><Money>{money(r.cost)}</Money></td>
                      <td className="n" style={{ color: neg ? "var(--bm-danger-600)" : "var(--s3)" }}>
                        <Money>{(neg ? "−" : "") + money(Math.abs(r.profit))}</Money>
                      </td>
                      <td className="n">
                        {!hasRev ? <span style={{ color: "var(--bm-danger-600)" }}>няма приход</span> : (
                          <span className="an-mbar">
                            <span className="track"><i style={{ width: `${mw}%`, background: mc }} /></span>
                            <span style={{ minWidth: 38, display: "inline-block", color: mc }}>{Math.round(r.margin)}%</span>
                          </span>
                        )}
                      </td>
                      <td className="n" style={{ color: "var(--bm-text-muted)" }}>{r.videos}</td>
                      <td className="n" style={{ color: "var(--bm-text-muted)" }}>
                        {r.costPerVideo ? <Money>{money(+r.costPerVideo.toFixed(2))}</Money> : "—"}
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--bm-text-subtle)", padding: "var(--bm-space-6)" }}>
                    Няма клиенти с приход или начисления.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ---- Къде отиват парите · вземания · сделки ---- */}
        <div className="an-two">
          <div>
            <div className="an-bh">
              <span className="an-bt">Къде отиват парите</span>
              <span className="an-bs">{monthLabel(monthKey()).toLowerCase()}</span>
            </div>
            <div className="an-subhead" style={{ marginTop: 6 }}>
              <span>Екип {spend.accrued ? "· начислено" : "· преведено"}</span>
              <b><Money>{money(spend.total)}</Money></b>
            </div>
            {spend.rows.length === 0 && <p className="an-empty">Няма разход за екипа този месец.</p>}
            {spend.rows.map((r) => (
              <div className="an-row" key={r.label}>
                <span className="hl">{r.label}</span>
                <span className="hb"><i style={{ width: `${(r.amount / spendMax) * 100}%` }} /></span>
                <span className="hv"><Money>{money(r.amount)}</Money></span>
              </div>
            ))}
            {spend.accrued && spend.rows.length > 0 && (
              <p className="an-empty">Още няма отбелязани преводи — показва се начисленото.</p>
            )}
            <div className="an-subhead"><span>Други разходи</span><b>—</b></div>
            <p className="an-empty">
              Реклама, софтуер, техника и наем още не се водят в системата, затова печалбата е преди тях.
            </p>
          </div>

          <div>
            <div className="an-bh">
              <span className="an-bt">Несъбрано по давност</span>
              <span className="an-bs">{unpaid > 0 ? <Money>{money(unpaid)} общо</Money> : "чисто"}</span>
            </div>
            {aging.length === 0 && <p className="an-empty">Всички фактури са платени.</p>}
            {aging.map((a) => (
              <div className="an-row" key={a.label}>
                <span className="hl"><span className="dot" style={{ background: toneVar(a.tone) }} />{a.label}</span>
                <span className="hb"><i style={{ width: `${(a.amount / agingMax) * 100}%`, background: toneVar(a.tone) }} /></span>
                <span className="hv" style={{ color: toneVar(a.tone) }}><Money>{money(a.amount)}</Money></span>
              </div>
            ))}

            <div className="an-bh" style={{ marginTop: 20 }}>
              <span className="an-bt">Сделки</span>
              <span className="an-bs">{won.length + lost.length} затворени</span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, margin: "2px 0 10px" }}>
              <span style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-.02em" }}>{winRate}%</span>
              <span style={{ fontSize: 13, color: "var(--bm-text-subtle)" }}>успеваемост</span>
            </div>
            <div className="an-row">
              <span className="hl"><span className="dot" style={{ background: "var(--bm-success-600)" }} />Спечелени</span>
              <span className="hb"><i style={{ width: `${(wonSum / dealMax) * 100}%`, background: "var(--bm-success-600)" }} /></span>
              <span className="hv" style={{ color: "var(--bm-success-600)" }}><Money>{money(wonSum)}</Money></span>
            </div>
            <div className="an-row">
              <span className="hl"><span className="dot" style={{ background: "var(--bm-danger-600)" }} />Загубени</span>
              <span className="hb"><i style={{ width: `${(lostSum / dealMax) * 100}%`, background: "var(--bm-danger-600)" }} /></span>
              <span className="hv" style={{ color: "var(--bm-danger-600)" }}><Money>{money(lostSum)}</Money></span>
            </div>
            {openDeals.map((d) => (
              <div className="an-row" key={d.title}>
                <span className="hl"><span className="dot" style={{ background: "var(--bm-text-subtle)" }} />{d.title}</span>
                <span className="hb"><i style={{ width: `${(d.val / dealMax) * 100}%`, background: "var(--bm-text-subtle)" }} /></span>
                <span className="hv"><Money>{money(d.val)}</Money></span>
              </div>
            ))}
            {wonSum > 0 && lostSum / wonSum > 0.8 && (
              <p className="an-empty">Изпускаш почти толкова, колкото печелиш.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
