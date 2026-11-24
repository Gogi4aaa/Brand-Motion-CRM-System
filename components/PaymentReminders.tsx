"use client";

// Напомняния за плащане (0064): кое е ред да се напомни днес, с готов текст.
// Засега се изпраща от теб с един клик (копирай / отвори имейл) и се отбелязва
// в дневника, за да не се напомня два пъти. Когато има свързана услуга за
// имейли, същите текстове ще тръгват автоматично.

import { useEffect, useState } from "react";
import { useStore } from "./store";
import { Money } from "./MoneyLock";
import { fmtFull } from "@/lib/data";
import { REMINDER_STAGES, paymentReminders, type Reminder, type ReminderLogRow } from "@/lib/reminders";

const fmtWhen = (iso: string) => new Date(iso).toLocaleDateString("bg-BG", { day: "2-digit", month: "2-digit" });

function Row({ r, onLogged }: { r: Reminder; onLogged: (channel: string) => void }) {
  const { openModal } = useStore();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const st = REMINDER_STAGES[r.stage];
  const email = r.client?.billing_email || "";
  const copy = async () => {
    try { await navigator.clipboard.writeText(r.body); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { setOpen(true); }
  };
  const mailto = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(r.subject)}&body=${encodeURIComponent(r.body)}`;
  return (
    <div className="pr-row">
      <div className="pr-row__main">
        <div className="pr-row__title">
          <b>{r.client?.name || r.invoice.client}</b>
          <span className={"bm-badge " + st.badge}>{st.label}</span>
          {r.done && <span className="bm-badge bm-badge--success" title={`от ${r.done.sent_by || "екипа"}`}>✓ напомнено на {fmtWhen(r.done.sent_at)}</span>}
        </div>
        <div className="pr-row__meta">
          {r.invoice.id} · <Money>{fmtFull(r.invoice.amount)}</Money> · {r.days > 0 ? `${r.days} ${r.days === 1 ? "ден" : "дни"} след срока` : r.days === 0 ? "срокът е днес" : `след ${-r.days} ${r.days === -1 ? "ден" : "дни"}`}
          {!r.done && r.lastSent ? ` · последно напомняне на ${fmtWhen(r.lastSent.sent_at)}` : ""}
          {!email ? " · няма имейл за фактури" : ""}
        </div>
        {open && <pre className="pr-row__text">{r.subject + "\n\n" + r.body}</pre>}
      </div>
      <div className="pr-row__actions">
        <button type="button" className="bm-btn bm-btn--ghost bm-btn--sm" aria-expanded={open} onClick={() => setOpen((v) => !v)}>{open ? "Скрий" : "Текст"}</button>
        <button type="button" className="bm-btn bm-btn--secondary bm-btn--sm" onClick={copy}>{copied ? "✓ Копирано" : "Копирай"}</button>
        {email
          ? <a className="bm-btn bm-btn--secondary bm-btn--sm" href={mailto}>Отвори имейл</a>
          : r.client && <button type="button" className="bm-btn bm-btn--ghost bm-btn--sm" onClick={() => openModal({ kind: "client", mode: "edit", client: r.client! })}>+ Имейл</button>}
        {!r.done && <button type="button" className="bm-btn bm-btn--primary bm-btn--sm" onClick={() => onLogged(email ? "email" : "manual")} title="Отбелязва, че клиентът е напомнен на този етап">Напомнено</button>}
      </div>
    </div>
  );
}

export function PaymentReminders() {
  const { invoices, clients, loadReminderLog, logReminder } = useStore();
  const [log, setLog] = useState<ReminderLogRow[] | null>(null);
  useEffect(() => { let alive = true; loadReminderLog().then((l) => { if (alive) setLog(l); }); return () => { alive = false; }; }, [loadReminderLog]);
  const list = paymentReminders(invoices, clients, log || []);
  if (!list.length) return null;
  const todo = list.filter((r) => !r.done).length;
  return (
    <div className="bm-card" style={{ overflow: "hidden" }}>
      <div className="bm-card__header" style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "var(--bm-space-3)", flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>Напомняния за плащане</h3>
        <span className="bm-text-subtle" style={{ fontSize: "var(--bm-text-xs)" }}>{todo ? `${todo} за изпращане днес` : "всички са напомнени за този етап"} · 3 дни преди срока → в деня → +1 → +7 → +14 (обаждане)</span>
      </div>
      <div>
        {list.map((r) => (
          <Row key={r.invoice.id + r.stage} r={r} onLogged={async (channel) => {
            const row = await logReminder(r.invoice.id, r.stage, channel);
            if (row) setLog((l) => [...(l || []), row]);
          }} />
        ))}
      </div>
    </div>
  );
}
