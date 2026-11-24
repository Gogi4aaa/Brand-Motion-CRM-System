"use client";

// Изпълнение на месечния пакет (0059): колко видеа са готови за клиент към
// бройката на даден месец. Видеото се брои към месеца на ПАКЕТА; датата на
// предаване се показва отделно, за да личи закъснението.
//
// Визуалният език е „лента с кадри“ (app/design-system/quota.css): всяко
// деление е едно видео от договорената бройка.

import { useState } from "react";
import Link from "next/link";
import { useStore } from "./store";
import {
  activeClients, clientCycleProgress, deliveredLate, expectedByToday, isDelivered, monthKey, monthLabel,
  monthProgress, stageMeta, type Client, type ContentItem, type CycleProgress,
} from "@/lib/data";

const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("bg-BG", { day: "2-digit", month: "2-digit", year: "numeric" }) : "";
const videoWord = (n: number) => (n === 1 ? "видео" : "видеа");

// „6/10“ — или само „6 видеа“, ако бройката още не е зададена.
export const quotaText = (done: number, target: number) => (target ? `${done}/${target}` : `${done} ${videoWord(done)}`);

// ---- Темпо: изпълнен / в график / изостава -------------------------------
type Tone = "done" | "ok" | "behind" | "none";
interface Pace { tone: Tone; label: string; badge: string }
export function paceOf(done: number, target: number, month: string): Pace {
  if (!target) return { tone: "none", label: "няма бройка", badge: "bm-badge--neutral" };
  if (done >= target) return { tone: "done", label: done > target ? `изпълнен +${done - target}` : "изпълнен", badge: "bm-badge--success" };
  if (month < monthKey()) return { tone: "behind", label: `недостиг ${target - done}`, badge: "bm-badge--danger" };
  const gap = expectedByToday(target, month) - done;
  if (gap > 0) return { tone: "behind", label: `изостава с ${gap}`, badge: "bm-badge--danger" };
  return { tone: "ok", label: "в график", badge: "bm-badge--brand" };
}

// ---- Лентата с кадри -------------------------------------------------------
// Делението е едно видео от пакета: готово или още празно. Над бройката → сини деления.
// Видеата в работа НЕ се показват — месецът е само за готовото.
export function QuotaStrip({ done, late = 0, target, month, size }: { done: number; late?: number; target: number; month: string; size?: "sm" | "lg" }) {
  const slots = Math.max(target, done, 1);
  const onTime = done - late;
  const segs: string[] = [];
  for (let i = 0; i < slots; i++) {
    if (i < done) segs.push(target && i >= target ? "over" : i < onTime ? "done" : "late");
    else segs.push("");
  }
  const expected = target && month === monthKey() ? expectedByToday(target, month) : 0;
  const showPace = expected > 0 && expected < target && done < target;
  const label = target
    ? `${done} от ${target} видеа готови${late ? `, ${late} със закъснение` : ""}`
    : `${done} готови, няма зададена бройка`;
  return (
    <div className={"qt-strip" + (size ? ` qt-strip--${size}` : "")} role="img" aria-label={label} title={label}>
      {segs.map((s, i) => <span key={i} className={"qt-seg" + (s ? ` qt-seg--${s}` : "")} />)}
      {showPace && <span className="qt-pace" style={{ left: `${(expected / slots) * 100}%` }} title={`До днес трябва да са готови ${expected}`} />}
    </div>
  );
}

export function QuotaRing({ done, target, month, size = 44 }: { done: number; target: number; month: string; size?: number }) {
  const stroke = Math.max(4, Math.round(size / 9));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = target ? Math.min(1, done / target) : 0;
  const pace = paceOf(done, target, month);
  return (
    <span className={`qt-ring qt-tone--${pace.tone}`} style={{ width: size, height: size }} aria-hidden="true">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle className="qt-ring__track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} />
        <circle className="qt-ring__bar" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} />
      </svg>
      <span className="qt-ring__label" style={{ fontSize: Math.max(10, Math.round(size / 3.6)) }}>{done}</span>
    </span>
  );
}

function Legend() {
  return (
    <div className="qt-legend" aria-hidden="true">
      <span><i className="qt-seg--done" /> готово</span>
      <span><i className="qt-seg--late" /> готово със закъснение</span>
      <span><i className="qt-seg" /> остава</span>
    </div>
  );
}

// ---- Списък „Клиенти“: малка лента в картата -------------------------------
export function ClientMonthBadge({ client }: { client: Client }) {
  const { cycles, contentItems } = useStore();
  const key = monthKey();
  const [row] = monthProgress([client], cycles, contentItems, key);
  const pace = paceOf(row.done, row.target, key);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--bm-space-2)", fontSize: "var(--bm-text-xs)", color: "var(--bm-text-subtle)", marginBottom: 8 }}>
        <span>Видеа за {monthLabel(key).split(" ")[0]}</span>
        <span style={{ display: "flex", alignItems: "center", gap: "var(--bm-space-2)" }}>
          {row.target > 0 && <span className={"bm-badge " + pace.badge}>{pace.label}</span>}
          <b style={{ color: "var(--bm-text)", fontFamily: "var(--bm-font-mono)", fontSize: "var(--bm-text-sm)" }}>{row.target ? quotaText(row.done, row.target) : row.done || "—"}</b>
        </span>
      </div>
      {row.target || row.total ? (
        <QuotaStrip done={row.done} late={row.late} target={row.target} month={key} size="sm" />
      ) : (
        <div className="bm-text-subtle" style={{ fontSize: "var(--bm-text-xs)" }}>Няма зададена бройка</div>
      )}
    </div>
  );
}

// ---- Табло: всички клиенти за текущия месец, най-изоставащите първи --------
export function MonthProgressCard() {
  const { clients, cycles, contentItems } = useStore();
  const key = monthKey();
  const live = activeClients(clients).filter((c) => c.status !== "Churned" && c.engagement !== "project");
  const rows = monthProgress(live, cycles, contentItems, key)
    .filter((r) => r.target > 0 || r.total > 0)
    .sort((a, b) => (a.target ? a.done / a.target : 2) - (b.target ? b.done / b.target : 2));
  const noQuota = live.filter((c) => !c.videos_per_month);
  const done = rows.reduce((n, r) => n + r.done, 0);
  // Общото „X от Y“ има смисъл само ако всеки клиент в списъка има бройка —
  // иначе готовите на клиентите без бройка надуват числителя.
  const withQuota = rows.filter((r) => r.target > 0);
  const allQuota = withQuota.length === rows.length;
  const target = allQuota ? rows.reduce((n, r) => n + r.target, 0) : 0;
  const behind = rows.filter((r) => paceOf(r.done, r.target, key).tone === "behind").length;
  if (!rows.length && !noQuota.length) return null;
  return (
    <div className="bm-card">
      <div className="bm-card__header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--bm-space-3)", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--bm-space-3)", minWidth: 0 }}>
          <QuotaRing done={done} target={target} month={key} size={48} />
          <div style={{ minWidth: 0 }}>
            <h3 style={{ margin: 0 }}>Видеа за {monthLabel(key)}</h3>
            <div className="bm-text-subtle" style={{ fontSize: "var(--bm-text-xs)" }}>
              {target ? `${done} от ${target} готови` : `${done} готови`}
              {!allQuota ? ` · бройка има при ${withQuota.length} от ${rows.length} клиента` : ""}
              {behind > 0 ? ` · ${behind} ${behind === 1 ? "изостава" : "изостават"}` : target ? " · всички са в график" : ""}
            </div>
          </div>
        </div>
        <Link href="/production" className="bm-btn bm-btn--secondary bm-btn--sm">Продукция</Link>
      </div>
      <div className="bm-card__body" style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-1)" }}>
        {rows.map((r) => {
          const pace = paceOf(r.done, r.target, key);
          return (
            <Link key={r.client.id} href={`/clients/${r.client.id}?tab=videos`} className="qt-row">
              <span className="qt-row__name">
                <b>{r.client.name}</b>
                <span className={"bm-badge " + pace.badge} style={{ flex: "0 0 auto" }}>{pace.label}</span>
              </span>
              <span className="qt-row__count">{quotaText(r.done, r.target)}</span>
              <QuotaStrip done={r.done} late={r.late} target={r.target} month={key} />
            </Link>
          );
        })}
        {rows.length > 0 && <div style={{ paddingTop: "var(--bm-space-2)" }}><Legend /></div>}
        {noQuota.length > 0 && (
          <div className="bm-alert bm-alert--info" style={{ marginTop: "var(--bm-space-3)", fontSize: "var(--bm-text-xs)" }}>
            <div><b>Без зададена бройка:</b> {noQuota.map((c) => c.name).join(", ")}. Задай я от „Редакция“ на клиента — без нея не се вижда дали изостава.</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Таб „Видеа“ в страницата на клиента -----------------------------------
function VideoRow({ v, month, onOpen }: { v: ContentItem; month: string; onOpen: () => void }) {
  const done = isDelivered(v);
  const late = deliveredLate(v, month);
  const stage = stageMeta(v.current_stage || "strategy");
  return (
    <button type="button" className="qt-video" onClick={onOpen}>
      <span className={"qt-video__mark" + (late ? " qt-video__mark--late" : done ? "" : " qt-video__mark--work")} style={done ? undefined : ({ "--qt-dot": stage.dot } as React.CSSProperties)} aria-hidden="true">{done ? "✓" : ""}</span>
      <span style={{ minWidth: 0 }}>
        <span className="qt-video__title" style={{ display: "block" }}>{v.title || "(без заглавие)"}</span>
        <span className="qt-video__meta" style={{ display: "block" }}>
          {done ? `Предадено на ${fmtDate(v.delivered_at) || "—"}` : `Етап: ${stage.label}`}
          {v.date ? ` · публикуване ${fmtDate(v.date)}` : ""}
        </span>
      </span>
      <span className={"bm-badge " + (late ? "bm-badge--warning" : done ? "bm-badge--success" : "bm-badge--neutral")}>
        {late ? "със закъснение" : done ? "готово" : stage.label}
      </span>
    </button>
  );
}

export function ClientVideosTab({ client }: { client: Client }) {
  const { cycles, contentItems, openModal, currentUser } = useStore();
  const cur = monthKey();
  // Месец без готови видеа и без бройка е празен (държал е само идеи) — не го показваме.
  const months: CycleProgress[] = clientCycleProgress(client.id, cycles, contentItems).filter((m) => m.done > 0 || m.target > 0 || m.cycle.month === cur);
  const [picked, setPicked] = useState<string | null>(null);
  const sel = months.find((m) => m.cycle.id === picked) ?? months.find((m) => m.cycle.month === cur) ?? months[0] ?? null;
  const canEdit = currentUser.isAdmin || currentUser.level === "manager";
  const totalDone = months.reduce((n, m) => n + m.done, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-4)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--bm-space-3)", flexWrap: "wrap" }}>
        <p className="bm-text-muted" style={{ margin: 0, fontSize: "var(--bm-text-sm)" }}>
          Договорено: <b style={{ color: "var(--bm-text)" }}>{client.videos_per_month ? `${client.videos_per_month} видеа на месец` : "няма зададена бройка"}</b>
          {" · "}готови досега: <b style={{ color: "var(--bm-text)" }}>{totalDone}</b> за {months.length} {months.length === 1 ? "месец" : "месеца"}
        </p>
        {canEdit && (
          <div style={{ display: "flex", gap: "var(--bm-space-2)", flexWrap: "wrap" }}>
            <button className={"bm-btn bm-btn--sm " + (client.videos_per_month ? "bm-btn--secondary" : "bm-btn--primary")} onClick={() => openModal({ kind: "package", clientId: client.id })}>{client.videos_per_month ? "Смени пакета" : "Задай пакет"}</button>
            <button className="bm-btn bm-btn--secondary bm-btn--sm" onClick={() => openModal({ kind: "content", mode: "create", clientId: client.id, date: "" })}>+ Видео</button>
          </div>
        )}
      </div>

      {months.length === 0 || !sel ? (
        <div className="bm-card"><div className="qt-empty">Още няма видеа за този клиент. Първото видео ще отвори месеца автоматично.</div></div>
      ) : (
        <>
          <div className="qt-months" role="group" aria-label="Месеци">
            {months.map((m) => (
              <button key={m.cycle.id} type="button" className="qt-month" aria-pressed={m.cycle.id === sel.cycle.id} onClick={() => setPicked(m.cycle.id)}>
                <QuotaRing done={m.done} target={m.target} month={m.cycle.month} size={40} />
                <span>
                  <span className="qt-month__name">{monthLabel(m.cycle.month)}{m.cycle.month === cur && <span className="qt-month__now" title="текущ месец" />}</span>
                  <span className="qt-month__sub" style={{ display: "block" }}>{m.target ? `от ${m.target}` : "без бройка"}{m.late ? ` · ${m.late} късно` : ""}</span>
                </span>
              </button>
            ))}
          </div>

          <MonthDetail m={sel} isCurrent={sel.cycle.month === cur} canEdit={canEdit} />
        </>
      )}
    </div>
  );
}

function MonthDetail({ m, isCurrent, canEdit }: { m: CycleProgress; isCurrent: boolean; canEdit: boolean }) {
  const { openModal } = useStore();
  const pace = paceOf(m.done, m.target, m.cycle.month);
  // Последно предадените първи.
  const list = [...m.videos].sort((a, b) => {
    const da = isDelivered(a), db = isDelivered(b);
    if (da !== db) return da ? 1 : -1;
    return (b.delivered_at || "").localeCompare(a.delivered_at || "");
  });
  return (
    <div className="bm-card" style={{ overflow: "hidden" }}>
      <div className="qt-detail__head">
        <div>
          <h3 className="qt-detail__title">{monthLabel(m.cycle.month)}</h3>
          <div className="bm-text-subtle" style={{ fontSize: "var(--bm-text-sm)" }}>
            {m.target ? `${m.done} от ${m.target} видеа са готови` : `${m.done} ${videoWord(m.done)} готови · бройката за месеца не е зададена`}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--bm-space-2)", flexWrap: "wrap" }}>
          {isCurrent && <span className="bm-badge bm-badge--neutral">текущ месец</span>}
          <span className={"bm-badge " + pace.badge}>{pace.label}</span>
          {canEdit && <button className="bm-btn bm-btn--ghost bm-btn--sm" onClick={() => openModal({ kind: "cycle" })}>{m.target ? "Смени бройката" : "Задай бройка за месеца"}</button>}
        </div>
      </div>
      <div className="qt-detail__body">
        <QuotaStrip done={m.done} late={m.late} target={m.target} month={m.cycle.month} size="lg" />
        <div className="qt-stats" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
          <div className="qt-statbox"><b>{m.done}</b><span>готови</span></div>
          <div className="qt-statbox"><b>{m.target ? m.remaining : "—"}</b><span>остават до бройката</span></div>
          <div className="qt-statbox"><b style={m.late ? { color: "var(--bm-warning-600)" } : undefined}>{m.late}</b><span>със закъснение</span></div>
        </div>
        <Legend />
      </div>
      <div className="qt-videos">
        {list.length === 0
          ? <div className="qt-empty">Няма видеа за този месец.</div>
          : list.map((v) => <VideoRow key={v.id} v={v} month={m.cycle.month} onOpen={() => openModal({ kind: "content", mode: "edit", item: v })} />)}
      </div>
    </div>
  );
}
