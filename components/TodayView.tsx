"use client";

// „Днес“ — началният екран на админа. Отговаря на един въпрос:
// какво трябва да направя сега? Всеки ред в „Чака теб“ е сметнат от реалните
// данни и има бутон, който води директно към действието.

import { useState } from "react";
import Link from "next/link";
import { useStore } from "./store";
import { Icon } from "./Icon";
import { Money, useMoneyLock } from "./MoneyLock";
import { MonthProgressCard } from "./MonthProgress";
import { fmtFull, clientsById } from "@/lib/data";
import {
  buildNudges, liveClients, ymNow, ymLong, contractedMonthly,
  invoicedFor, cashIn, sumAmt, fmtDM, type Nudge,
} from "@/lib/crm";

function NudgeRow({ n, onAction }: { n: Nudge; onAction: (n: Nudge) => void }) {
  const { revealed } = useMoneyLock();
  // Сумите в текста следват заключването на парите.
  const hide = (t: string) => (revealed ? t : t.replace(/[\d][\d\s.,]*\s€/g, "••• €"));
  const a = n.action;
  return (
    <div className="crm-nudge">
      <div className={`crm-nudge__badge crm-nudge__badge--${n.tone}`} aria-hidden="true">{n.badge}</div>
      <div className="crm-nudge__body">
        <div className="crm-nudge__title">{hide(n.title)}</div>
        <div className="crm-nudge__detail">{hide(n.detail)}</div>
      </div>
      {a && (
        <div className="crm-nudge__actions">
          {a.href ? (
            <Link href={a.href} className={"bm-btn bm-btn--sm " + (a.primary ? "bm-btn--primary" : "bm-btn--secondary")}>{a.label}</Link>
          ) : (
            <button type="button" className={"bm-btn bm-btn--sm " + (a.primary ? "bm-btn--primary" : "bm-btn--secondary")} onClick={() => onAction(n)}>{a.label}</button>
          )}
        </div>
      )}
    </div>
  );
}

export function TodayView() {
  const { clients, contentItems, invoices, cycles, pipeline, currentUser, openModal, setClientStatus, startStrategy } = useStore();
  const ym = ymNow();
  const monthWord = ymLong(ym);
  const live = liveClients(clients);
  const byId = clientsById(clients);
  const nudges = buildNudges({ clients, items: contentItems, invoices, cycles, pipeline });
  const [showAll, setShowAll] = useState(false);

  const publishedNow = contentItems.filter((it) => it.published && (it.published_at || it.date || "").slice(0, 7) === ym);
  const publishedClients = new Set(publishedNow.map((it) => it.client)).size;
  const contracted = contractedMonthly(clients);
  const invoiced = invoicedFor(invoices, ym);
  const invoicedClients = new Set(invoiced.map((i) => i.client)).size;
  const cash = cashIn(invoices, ym);
  const waiting = invoiced.filter((i) => i.status !== "paid");

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = contentItems
    .filter((it) => !it.published && it.date && it.date >= today)
    .sort((a, b) => a.date!.localeCompare(b.date!))
    .slice(0, 6);

  const firstName = currentUser.name.split(" ")[0] || "";
  const hour = new Date().getHours();
  const hello = hour < 11 ? "Добро утро" : hour < 18 ? "Добър ден" : "Добър вечер";
  const urgent = nudges.filter((n) => n.tone === "danger").length;

  const onAction = (n: Nudge) => {
    const a = n.action;
    if (!a?.payload) return;
    if (a.kind === "set_active") a.payload.split(",").forEach((id) => setClientStatus(id, "Active"));
    if (a.kind === "open_package") openModal({ kind: "package", clientId: a.payload });
    if (a.kind === "start_strategy") {
      const c = byId[a.payload];
      openModal({
        kind: "confirm", title: `Стратегия за ${c?.name}?`,
        message: "Агентът Strategist започва стратегията (10–20 мин) и ти я праща в Telegram за одобрение.",
        confirmLabel: "Пусни стратегията", onConfirm: () => { startStrategy(a.payload!); },
      });
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-6)" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "var(--bm-space-4)", flexWrap: "wrap" }}>
        <div>
          <div className="bm-text-subtle" style={{ fontSize: "var(--bm-text-sm)" }}>{new Date().toLocaleDateString("bg-BG", { weekday: "long", day: "numeric", month: "long" })}</div>
          <h1 style={{ margin: "4px 0 0" }}>{hello}{firstName ? `, ${firstName}` : ""}</h1>
          <p className="bm-text-muted" style={{ margin: "6px 0 0" }}>
            {nudges.length === 0 ? "Нищо не чака теб. Всичко върви по план." : `${nudges.length} ${nudges.length === 1 ? "нещо чака" : "неща чакат"} теб${urgent ? `, ${urgent} от тях са спешни` : ""}.`}
          </p>
        </div>
        <div style={{ display: "flex", gap: "var(--bm-space-2)", flexWrap: "wrap" }}>
          <Link href="/production" className="bm-btn bm-btn--secondary"><Icon name="production" size={16} /> Продукция</Link>
          <button type="button" className="bm-btn bm-btn--primary" onClick={() => openModal({ kind: "newClient" })}><Icon name="plus" size={16} /> Нов клиент</button>
        </div>
      </div>

      <section className="bm-stats" aria-label={`Числата за ${monthWord}`}>
        <div className="bm-card bm-stat">
          <div className="bm-stat__label">Публикувани видеа · {monthWord}</div>
          <div className="bm-stat__value">{publishedNow.length}</div>
          <div className="bm-stat__delta bm-text-subtle">в профилите на {publishedClients} {publishedClients === 1 ? "клиент" : "клиента"}</div>
        </div>
        <div className="bm-card bm-stat">
          <div className="bm-stat__label">Договорено на месец</div>
          <div className="bm-stat__value"><Money>{fmtFull(contracted)}</Money></div>
          <div className="bm-stat__delta bm-text-subtle">сбор от пакетите на {live.length} клиента</div>
        </div>
        <div className="bm-card bm-stat">
          <div className="bm-stat__label">Фактурирано за {monthWord}</div>
          <div className="bm-stat__value"><Money>{fmtFull(sumAmt(invoiced))}</Money></div>
          <div className={"bm-stat__delta " + (invoicedClients < live.length ? "bm-stat__delta--down" : "bm-stat__delta--up")}>{invoicedClients} от {live.length} клиента имат фактура</div>
        </div>
        <div className="bm-card bm-stat">
          <div className="bm-stat__label">Постъпили пари · {monthWord}</div>
          <div className="bm-stat__value"><Money>{fmtFull(sumAmt(cash))}</Money></div>
          <div className="bm-stat__delta bm-text-subtle">{waiting.length ? <><Money>{fmtFull(sumAmt(waiting))}</Money> чакат плащане</> : "нищо не чака плащане"}</div>
        </div>
      </section>

      <section className="bm-split" style={{ alignItems: "start" }}>
        <div className="bm-card">
          <div className="bm-card__header">
            <h3>Чака теб</h3>
            <span className="bm-text-subtle" style={{ fontSize: "var(--bm-text-xs)" }}>подредено по закъснение и пари</span>
          </div>
          {nudges.length === 0 ? (
            <div className="bm-card__body bm-text-subtle">Няма нищо спешно.</div>
          ) : (
            <div className="crm-nudges">
              {(showAll ? nudges : nudges.slice(0, 6)).map((n) => <NudgeRow key={n.id} n={n} onAction={onAction} />)}
              {nudges.length > 6 && (
                <button type="button" className="bm-btn bm-btn--ghost" style={{ margin: "var(--bm-space-2) var(--bm-space-5) var(--bm-space-4)", alignSelf: "flex-start" }} onClick={() => setShowAll((v) => !v)}>
                  {showAll ? "Покажи по-малко" : `Покажи още ${nudges.length - 6}`}
                </button>
              )}
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-6)" }}>
          <MonthProgressCard />

          <div className="bm-card">
            <div className="bm-card__header"><h3>Следващи публикации</h3><Link href="/production" className="bm-btn bm-btn--ghost bm-btn--sm">Продукция</Link></div>
            <div className="bm-card__body" style={{ paddingTop: 0 }}>
              {upcoming.length === 0 && <p className="bm-text-subtle" style={{ fontSize: "var(--bm-text-sm)" }}>Нищо не е насрочено.</p>}
              {upcoming.map((it) => (
                <div key={it.id} className="crm-vid">
                  <span className="crm-vid__date">{fmtDM(it.date)}</span>
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.title}</span>
                  <span className="bm-text-subtle" style={{ fontSize: "var(--bm-text-xs)" }}>{byId[it.client]?.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
