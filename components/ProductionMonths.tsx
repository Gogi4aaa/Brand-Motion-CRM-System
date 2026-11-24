"use client";

// Продукция по месеци: клиент × месец = колко видеа са готови спрямо пакета.
// Броим по месеца на пакета (cycle_id, 0059) — същото правило като картата
// „Видеа за месеца“ и раздела „Видеа“ на клиента, за да няма две различни числа.

import Link from "next/link";
import { useStore } from "./store";
import { monthProgress } from "@/lib/data";
import { liveClients, ymNow, ymShift, ymShort, lastPublished, fmtDM, daysSince } from "@/lib/crm";

const STAGE_BG: Record<string, string> = {
  strategy: "идея", script: "сценарий", shoot: "снимане", edit: "монтаж", review: "преглед", publish: "готови",
};

export function ProductionMonths() {
  const { clients, contentItems, cycles, visibleClients, currentUser } = useStore();
  const allowed = new Set(visibleClients.map((c) => c.id));
  const live = liveClients(clients).filter((c) => allowed.has(c.id));
  const now = ymNow();
  const months = [ymShift(now, -3), ymShift(now, -2), ymShift(now, -1), now];

  const rows = live.map((c) => {
    const per = months.map((ym) => { const [mp] = monthProgress([c], cycles, contentItems, ym); return { ym, n: mp.done, t: mp.target || null, late: mp.late }; });
    const open = contentItems.filter((it) => it.client === c.id && !it.published);
    const stages = open.reduce<Record<string, number>>((a, it) => { const k = it.current_stage || "strategy"; a[k] = (a[k] || 0) + 1; return a; }, {});
    const last = lastPublished(contentItems, c.id);
    const start = (c.contract_start || c.created_at || "").slice(0, 7);
    return { c, per, open, stages, last, start };
  }).sort((a, b) => b.per[3].n - a.per[3].n || b.open.length - a.open.length);

  const totals = months.map((_, i) => rows.reduce((a, r) => a + r.per[i].n, 0));
  const totalOpen = rows.reduce((a, r) => a + r.open.length, 0);
  const idle = rows.filter((r) => r.open.length === 0 && !r.last);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-4)" }}>
      <div className="bm-table-wrap">
        <table className="bm-table crm-mtable">
          <thead>
            <tr>
              <th>Клиент</th>
              <th className="bm-table__num">Пакет</th>
              {months.map((ym) => <th key={ym} className={"bm-table__num" + (ym === now ? " crm-now" : "")}>{ymShort(ym)}</th>)}
              <th>В работа сега</th>
              <th>Последно видео</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ c, per, open, stages, last, start }) => (
              <tr key={c.id}>
                <td>{currentUser.isAdmin ? <Link href={`/clients/${c.id}`} style={{ fontWeight: 600 }}>{c.name}</Link> : <b>{c.name}</b>}</td>
                <td className={"bm-table__num" + (c.videos_per_month ? "" : " crm-na")}>{c.videos_per_month ?? "—"}</td>
                {per.map(({ ym, n, t, late }) => {
                  const before = start && ym < start;
                  return (
                    <td key={ym} className={"bm-table__num " + (before ? "crm-na" : n === 0 && ym < now ? "crm-zero" : "crm-n") + (ym === now ? " crm-now" : "")}>
                      {before ? "—" : t ? `${n} / ${t}` : n}{!before && late ? <span className="bm-text-subtle" style={{ fontWeight: 400, fontSize: "var(--bm-text-xs)" }} title="готови след края на месеца"> ({late} късно)</span> : null}
                    </td>
                  );
                })}
                <td style={{ whiteSpace: "normal" }}>
                  {open.length === 0 ? <span className="bm-text-subtle">нищо</span> : (
                    <span style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {Object.entries(stages).map(([k, v]) => <span key={k} className={"bm-badge " + (k === "publish" ? "bm-badge--success" : k === "shoot" ? "bm-badge--warning" : "bm-badge--info")}>{v} {STAGE_BG[k] || k}</span>)}
                    </span>
                  )}
                </td>
                <td className={last && (daysSince(last) ?? 0) > 21 ? "crm-zero" : ""}>{last ? fmtDM(last) : <span className="crm-zero">никога</span>}</td>
              </tr>
            ))}
            <tr>
              <td style={{ fontWeight: 700 }}>Общо</td>
              <td />
              {totals.map((t, i) => <td key={i} className={"bm-table__num crm-n" + (months[i] === now ? " crm-now" : "")}>{t}</td>)}
              <td className="bm-text-subtle">{totalOpen} видеа</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      <div className="bm-text-subtle" style={{ fontSize: "var(--bm-text-sm)" }}>
        Видеото се брои към месеца на пакета си, дори да е готово по-късно (тогава пише „късно“). „4 / 8“ = готови / по пакет.
        {idle.length > 0 && <> Без нито едно видео: <b style={{ color: "var(--bm-danger-600)" }}>{idle.map((r) => r.c.name).join(", ")}</b>.</>}
      </div>
    </div>
  );
}
