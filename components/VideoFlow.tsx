"use client";

// Движение на видеото (0061): откога е в етапа, защо стои и историята му.
//   * HealthChip   — малкият знак върху картите на дъската
//   * VideoFlow    — секция в прозореца на видеото: „Чака…“ + времева линия

import { useEffect, useState } from "react";
import { useStore } from "./store";
import {
  WAITING_REASONS, stageMeta, stagesForType, videoHealth, waitingMeta,
  type ContentItem, type StageEvent, type WaitingOn,
} from "@/lib/data";

const fmtWhen = (iso: string) => new Date(iso).toLocaleString("bg-BG", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const fmtDays = (d: number | null) => (d === null ? "" : d < 1 ? "под ден" : `${Math.round(d)} ${Math.round(d) === 1 ? "ден" : "дни"}`);

export function HealthChip({ item }: { item: ContentItem }) {
  const h = videoHealth(item);
  if (!h || (h.level === "ok" && h.days < 2)) return null; // свежите карти остават чисти
  const title = item.waiting_on && item.waiting_note ? item.waiting_note : `В етап „${stageMeta(item.current_stage || "strategy").label}“ от ${h.days} дни`;
  return <span className={"bm-badge " + h.badge} style={{ alignSelf: "flex-start" }} title={title}>{h.label}</span>;
}

// ---- Секция в прозореца на видеото ----------------------------------------
export function VideoFlow({ item, canEdit }: { item: ContentItem; canEdit: boolean }) {
  const { setWaiting, loadStageEvents } = useStore();
  const [events, setEvents] = useState<StageEvent[] | null>(null);
  const [note, setNote] = useState(item.waiting_note || "");
  const stageKey = item.current_stage || "strategy";

  // Презареждаме историята при всяко преместване на видеото.
  useEffect(() => {
    let alive = true;
    loadStageEvents(item.id).then((e) => { if (alive) setEvents(e); });
    return () => { alive = false; };
  }, [item.id, stageKey, loadStageEvents]);
  // Бележката е сменена отвън (друг човек / смяна на етап) → вземаме новата.
  const [seenNote, setSeenNote] = useState(item.waiting_note || "");
  if ((item.waiting_note || "") !== seenNote) { setSeenNote(item.waiting_note || ""); setNote(item.waiting_note || ""); }

  const h = videoHealth(item);
  const w = waitingMeta(item.waiting_on);
  const order = stagesForType(item.type).map((s) => s.key);
  const moves = (events || []).filter((e) => e.from_stage);

  return (
    <div style={{ borderTop: "1px solid var(--bm-border)", paddingTop: "var(--bm-space-4)", display: "flex", flexDirection: "column", gap: "var(--bm-space-3)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--bm-space-3)", flexWrap: "wrap" }}>
        <div className="bm-label" style={{ fontWeight: 700, margin: 0 }}>Движение</div>
        {h && <span className={"bm-badge " + h.badge}>{h.level === "ok" && !item.published ? `в „${stageMeta(stageKey).label}“ · ${h.label}` : h.label}</span>}
      </div>

      {!item.published && (
        <div className="bm-form-row">
          <div className="bm-field">
            <label className="bm-label" htmlFor="vf-wait">Защо стои тук?</label>
            <select id="vf-wait" className="bm-select" disabled={!canEdit} value={item.waiting_on || ""} onChange={(e) => setWaiting(item.id, e.target.value as WaitingOn, note)}>
              <option value="">Не чака нищо — в работа</option>
              {WAITING_REASONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </div>
          <div className="bm-field">
            <label className="bm-label" htmlFor="vf-note">Бележка</label>
            <input id="vf-note" className="bm-input" disabled={!canEdit || !w} value={note} placeholder={w ? "напр. чакаме лого от клиента" : "избери причина"} onChange={(e) => setNote(e.target.value)} onBlur={() => { if (w && note.trim() !== (item.waiting_note || "")) setWaiting(item.id, item.waiting_on!, note); }} />
          </div>
        </div>
      )}

      {events === null ? (
        <span className="bm-text-subtle" style={{ fontSize: "var(--bm-text-xs)" }}>Зареждане на историята…</span>
      ) : moves.length === 0 ? (
        <span className="bm-text-subtle" style={{ fontSize: "var(--bm-text-xs)" }}>Още няма записани премествания. Историята се пази от 24.11.2026 нататък — всяко следващо местене ще се появи тук.</span>
      ) : (
        <ol className="vf-timeline">
          {moves.map((e) => {
            const back = order.indexOf(e.to_stage) < order.indexOf(e.from_stage || "");
            return (
              <li key={e.id} className={back ? "vf-ev vf-ev--back" : "vf-ev"}>
                <span className="vf-ev__dot" style={{ background: stageMeta(e.to_stage).dot }} />
                <span className="vf-ev__main">
                  <b>{stageMeta(e.from_stage || "").label} → {stageMeta(e.to_stage).label}</b>{back ? " · върнато" : ""}
                  <small>{fmtWhen(e.changed_at)} · {e.changed_by}{e.days_in_prev !== null ? ` · стояло ${fmtDays(Number(e.days_in_prev))}` : ""}</small>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
