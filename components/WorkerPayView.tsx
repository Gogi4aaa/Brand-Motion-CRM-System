"use client";

// Изгледът на работника — същият маршрут /payouts, друга леща.
//
// Той пита „колко ще взема и какво още мога да спечеля“, не „на кого колко дължа“.
// Затова: едно голямо число най-горе, после целта на пакета, после какво чака
// админа (топката не е при него) и чак после какво има за правене.
//
// Сигурността НЕ е в този компонент — RLS вече връща само неговите редове.
// Тук просто няма как да се покажат чужди суми, защото ги няма в данните.

import { useMemo, useState } from "react";
import {
  fmtFull, monthLabel, inMonthKey, PAY_METHODS,
  type VideoEarning, type WorkerOwed, type PackageProgress, type Payout,
} from "@/lib/data";
import { Money } from "@/components/MoneyLock";

const money = (n: number) => fmtFull(n);
const shortDay = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, "0")}`;
};

// Знакът вляво на реда — състояние с един поглед.
function Mark({ kind }: { kind: "ok" | "bad" | "warn" | "rev" | "idle" }) {
  const ch = { ok: "✓", bad: "✕", warn: "⏱", rev: "↩", idle: "·" }[kind];
  return <span className={"pay-mk pay-mk--" + kind}>{ch}</span>;
}

export function WorkerPayView({
  me, earnings, packages, payouts, month, onSubmit,
}: {
  me: WorkerOwed | undefined;
  earnings: VideoEarning[];
  packages: PackageProgress[];
  payouts: Payout[];
  month: string | null;
  onSubmit: (id: number) => void;
}) {
  const [showAllDone, setShowAllDone] = useState(false);

  const groups = useMemo(() => {
    const waiting = earnings.filter((e) => e.timeline === "чака преглед");
    const todo = earnings
      .filter((e) => !e.accepted_at && e.timeline !== "чака преглед")
      .sort((a, b) => (a.due_at || "9999").localeCompare(b.due_at || "9999"));
    const done = earnings
      .filter((e) => e.accepted_at && inMonthKey(e.accepted_at, month))
      .sort((a, b) => (b.accepted_at || "").localeCompare(a.accepted_at || ""));
    return { waiting, todo, done };
  }, [earnings, month]);

  const pkg = packages.find((p) => p.status === "open" || p.status === "completed");
  const received = payouts.filter((p) => !p.voided_at);
  const doneShown = showAllDone ? groups.done : groups.done.slice(0, 5);

  return (
    <div className="pw">
      {/* ---- Едно голямо число: какво ще влезе в сметката ---- */}
      <div className="pw-hero">
        <div className="k">Ще получиш сега</div>
        <div className="v"><Money>{money(me?.owed || 0)}</Money></div>
        <div className="d">
          {me?.owed_count
            ? `${me.owed_count} ${me.owed_count === 1 ? "видео" : "видеа"} извън пакета`
            : pkg ? "всичко върви по пакета" : "няма завършени видеа за плащане"}
        </div>
      </div>

      <div className="pw-mini">
        <div>
          <div className="k">В пакета</div>
          <div className="v"><Money>{money(pkg?.payable_now || 0)}</Money></div>
          <div className="d">{pkg ? `като станат ${pkg.videos_total} от ${pkg.videos_total}` : "няма пакет"}</div>
        </div>
        <div>
          <div className="k">Още можеш</div>
          <div className="v" style={{ color: "var(--bm-success-600)" }}>
            +<Money>{money(me?.bonus_at_risk || 0)}</Money>
          </div>
          <div className="d">премия за срок</div>
        </div>
      </div>

      {/* ---- Пакетът като ЦЕЛ, не като статистика ---- */}
      {pkg && (
        <div className="pw-pkg">
          <div className="t">
            {pkg.videos_total} видеа · {pkg.client_name || "всички клиенти"}{" "}
            <span>· <Money>{money(pkg.price_per_video)}</Money>{pkg.bonus_per_video > 0 ? ` + ${money(pkg.bonus_per_video)} за срок` : ""}</span>
          </div>
          <div className="pay-bar2">
            <i className="done" style={{ width: `${(pkg.on_time / Math.max(1, pkg.videos_total)) * 100}%` }} />
            <i className="late" style={{ width: `${(pkg.late / Math.max(1, pkg.videos_total)) * 100}%` }} />
          </div>
          <div className="goal">
            {pkg.used} от {pkg.videos_total}
            {pkg.bonus_per_video > 0 && <> · <span style={{ color: "var(--bm-success-600)" }}>{pkg.on_time} в срок</span>
              {pkg.late > 0 && <> · <span style={{ color: "var(--bm-danger-600)" }}>{pkg.late} закъсняло</span></>}</>}
          </div>
          {pkg.used < pkg.videos_total && (
            <div className="goal" style={{ marginTop: 5 }}>
              Още <b>{pkg.videos_total - pkg.used} {pkg.videos_total - pkg.used === 1 ? "видео" : "видеа"}</b>
              {" "}и получаваш <b><Money>{money(pkg.payable_now)}</Money></b>
            </div>
          )}
        </div>
      )}

      {/* ---- Чака админа: топката НЕ е при него ---- */}
      {groups.waiting.length > 0 && (
        <>
          <div className="pw-sec">
            <span>Чака преглед</span>
            <b style={{ color: "var(--bm-primary)" }}>часовникът ти е спрян</b>
          </div>
          {groups.waiting.map((e) => (
            <div className="pw-it" key={e.id}>
              <Mark kind="rev" />
              <span className="b">
                <span className="t">{e.title}</span>
                <span className="m" style={{ color: "var(--bm-primary)" }}>
                  подадено {shortDay(e.submitted_at)}
                  {e.due_at ? ` · срокът беше ${shortDay(e.due_at)}${(e.days_late ?? 0) <= 0 ? " — хванат" : ""}` : ""}
                </span>
              </span>
              <span className="r">
                <span className="a">
                  <Money>{money(e.price)}</Money>
                  {e.bonus_amount > 0 && (
                    <b style={{ color: (e.days_late ?? 0) <= 0 ? "var(--bm-success-600)" : "var(--bm-text-subtle)" }}>
                      {" "}+<Money>{money(e.bonus_amount)}</Money>
                    </b>
                  )}
                </span>
              </span>
            </div>
          ))}
        </>
      )}

      {/* ---- За правене: премията стои ПРЕДИ работата ---- */}
      {groups.todo.length > 0 && (
        <>
          <div className="pw-sec">
            <span>За правене</span>
            <b style={{ color: "var(--bm-warning-700)" }}>
              {groups.todo.filter((e) => e.timeline === "изтича" || e.timeline === "просрочено").length || ""}
              {groups.todo.some((e) => e.timeline === "изтича" || e.timeline === "просрочено") ? " с наближаващ срок" : ""}
            </b>
          </div>
          {groups.todo.map((e) => {
            const late = e.timeline === "просрочено";
            const soon = e.timeline === "изтича";
            const days = e.due_at ? -(e.days_late ?? 0) : null;
            return (
              <div className="pw-it" key={e.id}>
                <Mark kind={late ? "bad" : soon ? "warn" : "idle"} />
                <span className="b">
                  <span className="t">{e.title}</span>
                  <span className="m" style={{ color: late ? "var(--bm-danger-600)" : soon ? "var(--bm-warning-700)" : undefined }}>
                    {e.due_at
                      ? `до ${shortDay(e.due_at)} · ${days !== null && days >= 0 ? `остават ${days} ${days === 1 ? "ден" : "дни"}` : `просрочено с ${Math.abs(days ?? 0)}`}`
                      : "без срок"}
                  </span>
                </span>
                <span className="r">
                  <span className="a">
                    <Money>{money(e.price)}</Money>
                    {e.bonus_amount > 0 && e.bonus_status === "pending" && (
                      <b style={{ color: late ? "var(--bm-text-subtle)" : "var(--bm-warning-700)" }}>
                        {" "}+<Money>{money(e.bonus_amount)}</Money>
                      </b>
                    )}
                  </span>
                  <button className="bm-btn bm-btn--primary bm-btn--sm" style={{ marginTop: 4 }}
                    onClick={() => onSubmit(e.id)}>Маркирай го</button>
                </span>
              </div>
            );
          })}
        </>
      )}

      {/* ---- Готови: какво е взел и какво е изпуснал ---- */}
      {groups.done.length > 0 && (
        <>
          <div className="pw-sec">
            <span>Готови {month ? monthLabel(month).toLowerCase() : "общо"}</span>
            <b>{groups.done.length} {groups.done.length === 1 ? "видео" : "видеа"}</b>
          </div>
          {doneShown.map((e) => {
            const got = e.bonus_status === "earned" || e.bonus_status === "granted";
            const missed = e.bonus_status === "missed";
            return (
              <div className="pw-it" key={e.id}>
                <Mark kind={missed ? "bad" : "ok"} />
                <span className="b">
                  <span className="t">{e.title}</span>
                  <span className="m" style={{ color: got ? "var(--bm-success-600)" : undefined }}>
                    {e.due_at && e.submitted_at
                      ? `подадено ${shortDay(e.submitted_at)} · срок ${shortDay(e.due_at)} → ${
                          (e.days_late ?? 0) <= 0
                            ? `${Math.abs(e.days_late ?? 0)} ${Math.abs(e.days_late ?? 0) === 1 ? "ден" : "дни"} по-рано`
                            : `${e.days_late} ${e.days_late === 1 ? "ден" : "дни"} след`}`
                      : e.client_name || ""}
                    {e.package_id ? " · по пакета" : ""}
                  </span>
                </span>
                <span className="r">
                  <span className="a">
                    <Money>{money(e.price)}</Money>
                    {e.bonus_amount > 0 && (
                      <b style={{ color: got ? "var(--bm-success-600)" : "var(--bm-text-subtle)" }}>
                        {" "}{got ? "+" + money(e.bonus_amount) : "+€0"}
                      </b>
                    )}
                  </span>
                </span>
              </div>
            );
          })}
          {groups.done.length > 5 && (
            <div className="pw-it">
              <Mark kind="idle" />
              <span className="b">
                <button className="bm-btn bm-btn--ghost bm-btn--sm" style={{ padding: 0 }}
                  onClick={() => setShowAllDone((v) => !v)}>
                  {showAllDone ? "Скрий" : `Още ${groups.done.length - 5}`}
                </button>
              </span>
            </div>
          )}
        </>
      )}

      {/* ---- Получено: историята на преводите ---- */}
      {received.length > 0 && (
        <>
          <div className="pw-sec">
            <span>Получено</span>
            <b><Money>{money(me?.paid_total || 0)}</Money></b>
          </div>
          {received.slice(0, 6).map((p) => (
            <div className="pw-it" key={p.id}>
              <Mark kind="idle" />
              <span className="b">
                <span className="t">Превод · {shortDay(p.paid_at)}</span>
                <span className="m">
                  {PAY_METHODS.find((m) => m.id === p.method)?.label || p.method || "—"}
                  {p.reference ? ` · ${p.reference}` : ""}
                </span>
              </span>
              <span className="r"><span className="a"><Money>{money(p.amount)}</Money></span></span>
            </div>
          ))}
        </>
      )}

      <div className="pw-foot">
        Сумите са само твои. Другите от екипа не се виждат — нито тук, нито през приложението.
      </div>
    </div>
  );
}
