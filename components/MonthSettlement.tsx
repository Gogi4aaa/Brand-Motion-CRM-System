"use client";

// Месечна сметка — „кой колко получава този месец“, на едно място.
//
// Плащането е месечно, не след всяко видео. Този панел затваря месеца: събира
// самостоятелните видеа и завършените пакети, показва от какво е съставена
// всяка сума и чак тогава плащаш — човек по човек, за да има референция на
// всеки превод.
//
// САМОПРОВЕРКА: сборът на редовете трябва да е ТОЧНО дължимото от v_worker_owed.
// Ако се разминат, панелът показва предупреждение вместо числа. По-добре шумна
// грешка, отколкото тих грешен превод.

import { useEffect, useMemo, useState } from "react";
import { fmtFull, monthLabel, type SettlementLine, type SettlementCheck } from "@/lib/data";
import { Money } from "@/components/MoneyLock";
import { Avatar } from "@/components/Avatar";

const money = (n: number) => fmtFull(n);
const dayMonth = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, "0")}`;
};

interface Person {
  profile_id: string;
  initials: string;
  name: string;
  packages: SettlementLine[];
  videos: SettlementLine[];
  carried: SettlementLine[];
  total: number;
  check?: SettlementCheck;
}

export function MonthSettlement({
  month, load, onPay, onClose,
}: {
  month: string | null;
  load: (m: string | null) => Promise<{ lines: SettlementLine[]; checks: SettlementCheck[] } | null>;
  onPay: (profileId: string, earningIds: number[], packageIds: number[], total: number) => void;
  onClose: () => void;
}) {
  // Резултатът се пази ЗАЕДНО с месеца, за който важи. Така „зарежда се“ е
  // изведено състояние, а не отделен флаг, който трябва да се вдига синхронно
  // в ефекта — и никога не се показва сметка от друг месец.
  const [state, setState] = useState<
    { month: string | null; lines: SettlementLine[]; checks: SettlementCheck[] } | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const fresh = state && state.month === month;
  const loading = !fresh;
  const data = fresh ? state : null;

  useEffect(() => {
    let cancelled = false;
    load(month).then((res) => {
      if (cancelled) return;
      setState({ month, lines: res?.lines || [], checks: res?.checks || [] });
    });
    return () => { cancelled = true; };
  }, [month, load]);

  const people: Person[] = useMemo(() => {
    if (!data) return [];
    const byId = new Map<string, Person>();
    for (const l of data.lines) {
      let p = byId.get(l.profile_id);
      if (!p) {
        p = { profile_id: l.profile_id, initials: l.initials, name: l.worker_name,
              packages: [], videos: [], carried: [], total: 0 };
        byId.set(l.profile_id, p);
      }
      // Пренесеното се вади отделно, за да се вижда кое е ново за месеца.
      if (l.carried_over) p.carried.push(l);
      else if (l.kind === "package") p.packages.push(l);
      else p.videos.push(l);
      p.total += l.amount;
    }
    for (const c of data.checks) {
      const p = byId.get(c.profile_id);
      if (p) p.check = c;
    }
    return Array.from(byId.values())
      .filter((p) => p.total > 0)          // нула не се показва
      .sort((a, b) => b.total - a.total);
  }, [data]);

  const grand = people.reduce((a, p) => a + p.total, 0);
  const broken = (data?.checks || []).filter((c) => !c.ok);

  const toggle = (id: string) =>
    setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const payPerson = (p: Person) => {
    const all = [...p.packages, ...p.videos, ...p.carried];
    onPay(
      p.profile_id,
      all.filter((l) => l.kind === "video").map((l) => l.ref_id),
      all.filter((l) => l.kind === "package").map((l) => l.ref_id),
      p.total,
    );
  };

  return (
    <div className="bm-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bm-modal ms-panel">
        <div className="bm-modal__header" style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
          <h3>Сметка · {month ? monthLabel(month).toLowerCase() : "цял период"}</h3>
          <span className="ms-grand">общо <Money>{money(grand)}</Money></span>
        </div>

        <div className="bm-modal__body" style={{ maxHeight: "62vh", overflowY: "auto" }}>
          {loading && <p className="bm-text-subtle" style={{ margin: 0 }}>Смятам…</p>}

          {!loading && broken.length > 0 && (
            <div className="bm-alert bm-alert--danger" style={{ marginBottom: "var(--bm-space-3)" }}>
              <b>Сметката не се връзва.</b> Не плащай по нея, докато не се изясни:
              {broken.map((c) => (
                <div key={c.profile_id} style={{ fontFamily: "var(--bm-font-mono)", fontSize: 12.5, marginTop: 4 }}>
                  {c.initials}: от редовете {money(c.from_lines)} · дължимо {money(c.from_view)}
                </div>
              ))}
            </div>
          )}

          {!loading && people.length === 0 && (
            <p className="bm-text-subtle" style={{ margin: 0 }}>
              Няма какво да се плаща — всичко заработено е преведено.
            </p>
          )}

          {people.map((p) => {
            const isOpen = open.has(p.profile_id);
            return (
              <div key={p.profile_id} className="ms-person">
                <button type="button" className="ms-head" onClick={() => toggle(p.profile_id)}>
                  <span className="ms-chev" style={{ transform: isOpen ? "rotate(90deg)" : "none" }}>▶</span>
                  <Avatar initials={p.initials} style={{ width: 26, height: 26, fontSize: 10 }} />
                  <span className="ms-name">{p.name}</span>
                  <span className="ms-sum"><Money>{money(p.total)}</Money></span>
                  <span role="button" tabIndex={0} className="bm-btn bm-btn--primary bm-btn--sm"
                    onClick={(e) => { e.stopPropagation(); payPerson(p); }}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); payPerson(p); } }}>
                    Плати
                  </span>
                </button>

                {isOpen && (
                  <div className="ms-body">
                    <Group title="Пакети" lines={p.packages} />
                    <Group title="Самостоятелни видеа" lines={p.videos} />
                    <Group title="Пренесено от предишни месеци" lines={p.carried} muted />
                    {p.check && (
                      <div className="pay-recon" style={{ marginTop: 8 }}>
                        <span>Сбор от редовете <b>{money(p.check.from_lines)}</b></span>
                        <span>Дължимо в системата <b>{money(p.check.from_view)}</b></span>
                        <span style={{ color: p.check.ok ? "var(--bm-success-600)" : "var(--bm-danger-600)" }}>
                          {p.check.ok ? "✓ връзва се" : "✕ РАЗМИНАВАНЕ"}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="bm-modal__footer" style={{ justifyContent: "space-between" }}>
          <span className="bm-text-subtle" style={{ fontSize: "var(--bm-text-xs)" }}>
            {broken.length === 0 && !loading && people.length > 0
              ? "✓ Сметката се връзва с дължимото при всички"
              : "Плаща се човек по човек — всеки превод със свой метод и референция."}
          </span>
          <button className="bm-btn bm-btn--secondary" onClick={onClose}>Затвори</button>
        </div>
      </div>
    </div>
  );
}

function Group({ title, lines, muted }: { title: string; lines: SettlementLine[]; muted?: boolean }) {
  if (lines.length === 0) return null;
  const sum = lines.reduce((a, l) => a + l.amount, 0);
  return (
    <div className={"ms-group" + (muted ? " is-muted" : "")}>
      <div className="ms-grp-head">
        <span>{title} · {lines.length}</span>
        <b><Money>{money(sum)}</Money></b>
      </div>
      {lines.map((l) => (
        <div className="ms-line" key={l.kind + l.ref_id}>
          <span className="ms-t">
            {l.kind === "package" ? "📦 " : ""}{l.title}
          </span>
          <span className="ms-m">
            {l.role_label}{l.client_name ? " · " + l.client_name : ""}
            {l.earned_on ? " · " + dayMonth(l.earned_on) : ""}
          </span>
          <span className="ms-a">
            <Money>{money(l.price)}</Money>
            {l.bonus > 0 && <b style={{ color: "var(--bm-success-600)" }}> +<Money>{money(l.bonus)}</Money></b>}
          </span>
        </div>
      ))}
    </div>
  );
}
