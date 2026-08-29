"use client";

// Графиките за Анализи — чист SVG, без библиотека (пренесени от дизайна
// analytics-v2). Две правила, които не се нарушават:
//   1. Приход и разход са в едни и същи евра → ЕДНА вертикална ос.
//   2. Цветът значи КАКВО е серията (приход/разход/печалба), не подредбата —
//      смяната на периода не разменя значенията.

import { useRef, useState } from "react";
import type { MonthPnl } from "@/lib/data";

// Кръгла стъпка за оста: 1 / 2 / 2.5 / 5 / 10 × 10^k
function niceStep(max: number, ticks = 4) {
  const raw = max / ticks;
  const p = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const f = raw / p;
  const m = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return m * p;
}
const niceMax = (v: number, t = 4) => { const st = niceStep(v || 1, t); return Math.ceil((v || 1) / st) * st; };
const kfmt = (v: number) => (v >= 1000 ? "€" + (v / 1000).toLocaleString("bg-BG", { maximumFractionDigits: 1 }) + "k" : "€" + Math.round(v));
const eur = (n: number) => "€" + n.toLocaleString("bg-BG", { minimumFractionDigits: Math.abs(n % 1) > 0.001 ? 2 : 0, maximumFractionDigits: 2 });

interface TipState { x: number; y: number; i: number }

// Общият hover слой: намира колоната под мишката и позиционира балона.
function useHover(count: number, left: number, step: number) {
  const box = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<TipState | null>(null);
  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget.getBoundingClientRect();
    const sx = ((e.clientX - svg.left) / svg.width) * 880;
    const i = Math.floor((sx - left) / step);
    if (i < 0 || i >= count) { setTip(null); return; }
    const b = box.current?.getBoundingClientRect();
    if (!b) return;
    let px = e.clientX - b.left + 14;
    if (px + 170 > b.width) px = e.clientX - b.left - 180;
    setTip({ x: Math.max(4, px), y: Math.max(4, e.clientY - b.top - 10), i });
  };
  return { box, tip, onMove, onLeave: () => setTip(null) };
}

// ---- Приход · разход · печалба -------------------------------------------
export function MoneyChart({ data }: { data: MonthPnl[] }) {
  const W = 880, H = 250, L = 66, R = 14, T = 18, B = 26;
  const iw = W - L - R, ih = H - T - B;
  const max = niceMax(Math.max(1, ...data.map((d) => Math.max(d.revenue, d.cost))));
  const y = (v: number) => T + ih - (v / max) * ih;
  const n = Math.max(1, data.length), step = iw / n;
  const bw = Math.min(26, step * 0.26), gap = 2;
  const st = niceStep(max);
  const ticks: number[] = [];
  for (let v = 0; v <= max + 0.001; v += st) ticks.push(v);
  const pts = data.map((d, i) => [L + step * i + step / 2, y(d.profit)] as const);
  const { box, tip, onMove, onLeave } = useHover(data.length, L, step);

  return (
    <div className="an-chartbox" ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Приход, разход и печалба по месеци"
        onMouseMove={onMove} onMouseLeave={onLeave}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--bm-border)" strokeWidth={1} />
            <text x={L - 10} y={y(v) + 4} textAnchor="end" fill="var(--bm-text-subtle)" fontSize={11}
              fontFamily="var(--bm-font-mono)">{kfmt(v)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = L + step * i + step / 2;
          return (
            <g key={d.key}>
              <rect x={cx - bw - gap / 2} y={y(d.revenue)} width={bw} height={Math.max(2, (d.revenue / max) * ih)} rx={4} fill="var(--s1)" />
              <rect x={cx + gap / 2} y={y(d.cost)} width={bw} height={Math.max(2, (d.cost / max) * ih)} rx={4} fill="var(--s2)" />
              <text x={cx} y={H - 8} textAnchor="middle" fill="var(--bm-text-subtle)" fontSize={11.5}>{d.label.split(" ")[0]}</text>
            </g>
          );
        })}
        {pts.length > 1 && (
          <polyline fill="none" stroke="var(--s3)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
            points={pts.map((p) => p.join(",")).join(" ")} />
        )}
        {pts.map((p, i) => (
          <circle key={i} cx={p[0]} cy={p[1]} r={4.5} fill="var(--s3)" stroke="var(--bm-surface)" strokeWidth={2} />
        ))}
        {tip && (
          <line x1={L + step * tip.i + step / 2} x2={L + step * tip.i + step / 2} y1={T} y2={T + ih}
            stroke="var(--bm-border)" strokeWidth={1} />
        )}
      </svg>
      {tip && data[tip.i] && (
        <div className="an-tip" style={{ opacity: 1, left: tip.x, top: tip.y }}>
          <div className="th">{data[tip.i].label}</div>
          <div className="tr"><span><i style={{ background: "var(--s1)" }} />Приход</span><b>{eur(data[tip.i].revenue)}</b></div>
          <div className="tr"><span><i style={{ background: "var(--s2)" }} />Разход</span><b>{eur(data[tip.i].cost)}</b></div>
          <div className="tr"><span><i style={{ background: "var(--s3)" }} />Печалба</span><b>{eur(data[tip.i].profit)}</b></div>
          <div className="tr"><span>Марж</span><b>{data[tip.i].revenue > 0 ? Math.round((data[tip.i].profit / data[tip.i].revenue) * 100) + "%" : "—"}</b></div>
        </div>
      )}
    </div>
  );
}

// ---- Завършени видеа ------------------------------------------------------
export function VideosChart({ data }: { data: MonthPnl[] }) {
  const W = 880, H = 150, L = 66, R = 14, T = 16, B = 26;
  const iw = W - L - R, ih = H - T - B;
  const max = niceMax(Math.max(1, ...data.map((d) => d.videos)), 2);
  const y = (v: number) => T + ih - (v / max) * ih;
  const n = Math.max(1, data.length), step = iw / n, bw = Math.min(40, step * 0.42);
  const { box, tip, onMove, onLeave } = useHover(data.length, L, step);

  return (
    <div className="an-chartbox" ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Брой завършени видеа по месеци"
        onMouseMove={onMove} onMouseLeave={onLeave}>
        {[0, max / 2, max].map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--bm-border)" strokeWidth={1} />
            <text x={L - 9} y={y(v) + 4} textAnchor="end" fill="var(--bm-text-subtle)" fontSize={11}
              fontFamily="var(--bm-font-mono)">{Math.round(v)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = L + step * i + step / 2;
          return (
            <g key={d.key}>
              <rect x={cx - bw / 2} y={y(d.videos)} width={bw} height={Math.max(2, (d.videos / max) * ih)} rx={4} fill="var(--s1)" />
              <text x={cx} y={y(d.videos) - 7} textAnchor="middle" fill="var(--bm-text-muted)" fontSize={11.5}
                fontFamily="var(--bm-font-mono)">{d.videos}</text>
              <text x={cx} y={H - 8} textAnchor="middle" fill="var(--bm-text-subtle)" fontSize={11.5}>{d.label.split(" ")[0]}</text>
            </g>
          );
        })}
      </svg>
      {tip && data[tip.i] && (
        <div className="an-tip" style={{ opacity: 1, left: tip.x, top: tip.y }}>
          <div className="th">{data[tip.i].label}</div>
          <div className="tr"><span>Завършени видеа</span><b>{data[tip.i].videos}</b></div>
          <div className="tr"><span>Разход за екип</span><b>{eur(data[tip.i].cost)}</b></div>
          <div className="tr"><span>Средно на видео</span><b>{eur(+data[tip.i].costPerVideo.toFixed(2))}</b></div>
        </div>
      )}
    </div>
  );
}

// Спарклайн за KPI картите.
export function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const w = 54, h = 18;
  const mx = Math.max(...values), mn = Math.min(...values);
  const pts = values.map((v, i) => [
    (i / (values.length - 1)) * w,
    h - (mx === mn ? h / 2 : ((v - mn) / (mx - mn)) * (h - 3)) - 1.5,
  ]);
  const last = pts[pts.length - 1];
  return (
    <svg width={w} height={h} aria-hidden="true" style={{ flex: "none" }}>
      <polyline fill="none" stroke="var(--bm-text-subtle)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round"
        points={pts.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ")} />
      <circle cx={last[0].toFixed(1)} cy={last[1].toFixed(1)} r={2.5} fill="var(--bm-text-muted)" />
    </svg>
  );
}
