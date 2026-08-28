"use client";

// Възнаграждения — плащане ПО ВИДЕО (миграция 0046).
//
// Единицата е (видео × човек × роля), не етап: монтажист, който прави и монтажа,
// и прегледа, взима ЕДНА сума за видеото. Дължимо става, щом той си свърши своята
// част — не се чака публикуване или одобрение от клиента.
//
// Оформлението следва мокъпа „Възнаграждения по видео“: плътен списък, тарифата
// като чип до името, чекбокс на всеки ред, пакетът като прогрес бар.

import { useMemo, useState } from "react";
import { useStore } from "@/components/store";
import {
  fmtFull, clientsById, monthKey, monthLabel, shiftMonthKey, inMonthKey,
  owedFor, packageProgress, payRoleLabel, videoPriceFor, collectedRevenue, payoutCost,
  PAY_METHODS, type VideoEarning, type PayRole,
} from "@/lib/data";
import { Money } from "@/components/MoneyLock";
import { Avatar } from "@/components/Avatar";

const money = (n: number) => fmtFull(n);
// „12.08“ — къса дата за реда на видеото
const shortDay = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export default function PayoutsPage() {
  const {
    team, clients, invoices, contentItems, currentUser,
    payRoles, videoEarnings, workerPackages, payouts, videoRates,
    setVideoPrice, payVideos, payAllFor, undoPayout,
  } = useStore();

  const [month, setMonth] = useState<string | null>(monthKey());
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [pickedPkgs, setPickedPkgs] = useState<Set<number>>(new Set());
  const [histFor, setHistFor] = useState<Set<string>>(new Set());
  const [payFor, setPayFor] = useState<string | null>(null);

  const byId = clientsById(clients);
  const itemsById = useMemo(() => Object.fromEntries(contentItems.map((c) => [c.id, c])), [contentItems]);
  const isAdmin = currentUser.isAdmin;

  const source = isAdmin
    ? team.filter((m) => m.initials !== currentUser.initials)
    : team.filter((m) => m.initials === currentUser.initials);

  const rows = source
    .map((m) => {
      const totals = owedFor(videoEarnings, workerPackages, payouts, m.id);
      const mine = videoEarnings.filter((e) => e.profile_id === m.id);

      // Заработени/платени позиции за избрания месец (по датата на заработване).
      const done = mine
        .filter((e) => e.earned_at && !e.package_id && inMonthKey(e.earned_at, month))
        .sort((a, b) => (b.earned_at || "").localeCompare(a.earned_at || ""));
      // Предстоящото няма дата — показва се винаги. (`upcoming` от owedFor е сумата.)
      const pendingRows = mine.filter((e) => !e.earned_at && !e.package_id);
      const packs = workerPackages.filter((w) => w.profile_id === m.id && w.status !== "cancelled");

      const payable = done.filter((e) => !e.payout_id);
      const roleKeys = Array.from(new Set(mine.map((e) => e.role_key)));
      const chips = roleKeys
        .map((k) => ({ key: k, label: payRoleLabel(payRoles, k), price: videoPriceFor(videoRates, m.id, k, null, m.pay_rate) }))
        .sort((a, b) => a.label.localeCompare(b.label));

      const hist = payouts.filter((p) => p.profile_id === m.id);
      return { m, ...totals, done, pendingRows, packs, chips, payable, hist,
        videoCount: new Set([...done, ...pendingRows].map((e) => e.content_item_id || e.legacy_item_id)).size };
    })
    .filter((r) => r.owed || r.upcoming || r.paidTotal || r.done.length || r.packs.length)
    .sort((a, b) => b.owed - a.owed);

  // ---- Заглавните числа: за админ са на екипа, за работник — неговите ----
  const totalOwed = rows.reduce((a, r) => a + r.owed, 0);
  const totalUpcoming = rows.reduce((a, r) => a + r.upcoming, 0);
  const totalVideos = rows.reduce((a, r) => a + r.done.length, 0);
  const paidInMonth = rows.reduce((a, r) =>
    a + r.hist.filter((p) => !p.voided_at && inMonthKey(p.paid_at, month)).reduce((s, p) => s + p.amount, 0), 0);
  const transfers = rows.reduce((a, r) =>
    a + r.hist.filter((p) => !p.voided_at && inMonthKey(p.paid_at, month)).length, 0);
  const owedCount = rows.reduce((a, r) => a + r.payable.length, 0);

  const toggle = (set: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) =>
    set((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleNum = (set: React.Dispatch<React.SetStateAction<Set<number>>>, id: number) =>
    set((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const selectionFor = (r: (typeof rows)[number]) => {
    const ids = r.payable.filter((e) => picked.has(e.id)).map((e) => e.id);
    const pkgs = r.packs.filter((w) => w.status === "completed" && !w.payout_id && pickedPkgs.has(w.id)).map((w) => w.id);
    const sum = r.payable.filter((e) => ids.includes(e.id)).reduce((a, e) => a + e.price, 0)
      + r.packs.filter((w) => pkgs.includes(w.id)).reduce((a, w) => a + w.total_price, 0);
    return { ids, pkgs, sum, all: ids.length === r.payable.length && r.payable.length > 0 };
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-5)" }}>
      <div className="pay-app">
        {/* ---- Заглавие + месечна навигация ---- */}
        <div className="pay-head">
          <div>
            <h2>{isAdmin ? "Възнаграждения" : "Моето възнаграждение"}</h2>
            <p>{isAdmin ? "Кой колко да получи, за кои видеа и с каква роля." : "Твоите видеа, роля и суми."}</p>
          </div>
          <div className="pay-monthnav">
            <button type="button" aria-label="Предишен месец" disabled={!month}
              onClick={() => month && setMonth(shiftMonthKey(month, -1))}>‹</button>
            <span className="m">{month ? monthLabel(month) : "Цял период"}</span>
            <button type="button" aria-label="Следващ месец" disabled={!month || month >= monthKey()}
              onClick={() => month && setMonth(shiftMonthKey(month, 1))}>›</button>
            <button type="button" className="today"
              onClick={() => setMonth((m) => (m ? null : monthKey()))}
              title={month ? "Покажи целия период" : "Върни се на текущия месец"}>
              {month ? "Всичко" : "Днес"}
            </button>
          </div>
        </div>

        {/* ---- Заглавни числа ---- */}
        <div className="pay-kpis">
          <div className="pay-kpi">
            <div className="k">Видеа {month ? "този месец" : "общо"}</div>
            <div className="v">{totalVideos}</div>
            <div className="s">от {rows.length} {rows.length === 1 ? "човек" : "души"}</div>
          </div>
          <div className="pay-kpi owed">
            <div className="k">Дължимо сега</div>
            <div className="v"><Money>{money(totalOwed)}</Money></div>
            <div className="s">за {owedCount} {owedCount === 1 ? "видео" : "видеа"}</div>
          </div>
          <div className="pay-kpi">
            <div className="k">Предстоящо</div>
            <div className="v"><Money>{money(totalUpcoming)}</Money></div>
            <div className="s">в процес</div>
          </div>
          <div className="pay-kpi paid">
            <div className="k">Изплатено</div>
            <div className="v"><Money>{money(paidInMonth)}</Money></div>
            <div className="s">{transfers} {transfers === 1 ? "превод" : "превода"}</div>
          </div>
        </div>

        {/* ---- Редове ---- */}
        <div className="pay-rows">
          {rows.length === 0 && (
            <p className="bm-text-subtle" style={{ fontSize: "var(--bm-text-sm)", margin: 0, padding: "18px 20px" }}>
              Няма възнаграждения за показване.
            </p>
          )}

          {rows.map((r) => {
            const isOpen = open.has(r.m.id) || !isAdmin;
            const sel = selectionFor(r);
            const canPay = isAdmin && r.owed > 0;
            return (
              <div key={r.m.id} className={"pay-row" + (isOpen ? " is-open" : "")}>
                <button type="button" className="pay-phead" onClick={() => toggle(setOpen, r.m.id)}>
                  <span className="pay-chev">▶</span>
                  <Avatar initials={r.m.initials} style={{ width: 32, height: 32, fontSize: 11.5 }} />
                  <span className="pay-who">
                    <span className="n">{r.m.name}</span>
                    <span className="m">
                      <span>
                        {r.videoCount} {r.videoCount === 1 ? "видео" : "видеа"}
                        {r.payable.length ? ` · ${r.payable.length} за плащане` : r.pendingRows.length ? " · в процес" : ""}
                      </span>
                      {r.chips.map((c) => (
                        <span key={c.key} className="pay-chip-rate" title={`Текуща тарифа за ${c.label}`}>
                          <Money>{money(c.price)}</Money>/видео · {c.label.toLowerCase()}
                        </span>
                      ))}
                    </span>
                  </span>
                  <span className={"pay-owed" + (r.owed ? "" : " is-zero")}><Money>{money(r.owed)}</Money></span>
                  {isAdmin && (
                    <span
                      role="button" tabIndex={0}
                      className={"bm-btn bm-btn--sm " + (canPay ? "bm-btn--primary" : "bm-btn--secondary")}
                      aria-disabled={!canPay}
                      style={canPay ? undefined : { opacity: .4, pointerEvents: "none" }}
                      onClick={(e) => { e.stopPropagation(); if (canPay) setPayFor(r.m.id); }}
                      onKeyDown={(e) => { if (canPay && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); e.stopPropagation(); setPayFor(r.m.id); } }}
                    >
                      {canPay ? `Плати ${money(r.owed)}` : "Плати"}
                    </span>
                  )}
                </button>

                {isOpen && (
                  <div className="pay-detail">
                    {/* ---- Пакети ---- */}
                    {r.packs.map((w) => {
                      const pg = packageProgress(videoEarnings, w);
                      const pct = Math.min(100, Math.round((pg.done / Math.max(1, pg.total)) * 100));
                      const payable = w.status === "completed" && !w.payout_id;
                      const per = w.target_count ? w.total_price / w.target_count : 0;
                      return (
                        <div key={"p" + w.id}>
                          <div className="pay-pack">
                            <div className="pay-pack-top">
                              <span className="pay-pack-t">
                                {isAdmin && payable && (
                                  <input type="checkbox" className="pay-cb" style={{ marginRight: 8 }}
                                    checked={pickedPkgs.has(w.id)} onChange={() => toggleNum(setPickedPkgs, w.id)} />
                                )}
                                Пакет „{w.label || `${w.target_count} видеа`}“ <span>· <Money>{money(per)}</Money>/видео</span>
                              </span>
                              <span className="pay-pack-amt">
                                <Money>{money(w.total_price)}</Money>{" "}
                                {w.status === "paid" ? "платен" : payable ? "дължим" : "при завършване"}
                              </span>
                            </div>
                            <div className="pay-bar"><i style={{ width: `${pct}%` }} /></div>
                            <div className="pay-pack-b">
                              {pg.done} от {pg.total} готови · остават {Math.max(0, pg.total - pg.done)} ·
                              {" "}плаща се наведнъж, когато пакетът се затвори
                            </div>
                          </div>
                          {videoEarnings.filter((e) => e.package_id === w.id).slice(0, 4).map((e, i, arr) => (
                            <EarningRow key={e.id} e={e} roles={payRoles} isAdmin={isAdmin}
                              title={itemsById[e.content_item_id || ""]?.title || e.content_title || "(видео)"}
                              client={byId[e.client_id || ""]?.name || ""}
                              inPackage={`${arr.length - i}/${w.target_count}`}
                              checked={false} onCheck={() => {}} onPrice={() => {}} />
                          ))}
                        </div>
                      );
                    })}

                    {/* ---- Дължими / платени видеа ---- */}
                    {(r.done.length > 0 || r.pendingRows.length > 0) && (
                      <div className="pay-dhead"><span>Видео · роля</span><span>цена</span></div>
                    )}
                    {r.done.length === 0 && r.pendingRows.length === 0 && r.packs.length === 0 && (
                      <p className="bm-text-subtle" style={{ fontSize: 12.5, margin: 0, padding: "10px 12px" }}>
                        Няма видеа за периода.
                      </p>
                    )}
                    {r.done.map((e) => (
                      <EarningRow key={e.id} e={e} roles={payRoles} isAdmin={isAdmin}
                        title={itemsById[e.content_item_id || ""]?.title || e.content_title || "(видео)"}
                        client={byId[e.client_id || ""]?.name || ""}
                        checked={picked.has(e.id)} onCheck={() => toggleNum(setPicked, e.id)}
                        onPrice={(v) => setVideoPrice(e.id, v)} />
                    ))}
                    {r.pendingRows.map((e) => (
                      <EarningRow key={e.id} e={e} roles={payRoles} isAdmin={isAdmin} upcoming
                        title={itemsById[e.content_item_id || ""]?.title || e.content_title || "(видео)"}
                        client={byId[e.client_id || ""]?.name || ""}
                        checked={false} onCheck={() => {}} onPrice={(v) => setVideoPrice(e.id, v)} />
                    ))}

                    {/* ---- История ---- */}
                    {histFor.has(r.m.id) && (
                      <div className="pay-hist">
                        {r.hist.length === 0 && (
                          <div className="pay-hist-row">Още няма отбелязани плащания.</div>
                        )}
                        {r.hist.map((p) => (
                          <div key={p.id} className={"pay-hist-row" + (p.voided_at ? " is-void" : "")}>
                            <span className="amt"><Money>{money(p.amount)}</Money></span>
                            <span>{shortDay(p.paid_at)}</span>
                            <span>{PAY_METHODS.find((x) => x.id === p.method)?.label || p.method || "—"}</span>
                            {p.reference && <span>· {p.reference}</span>}
                            {p.voided_at ? <span>· отменено</span> : isAdmin && (
                              <button className="bm-btn bm-btn--ghost bm-btn--sm" style={{ marginLeft: "auto" }}
                                onClick={() => undoPayout(p.id)}>Отмени</button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* ---- Долен ред ---- */}
                    <div className="pay-dfoot">
                      <span className="sel">
                        {r.payable.length > 0
                          ? <>Избрани <b>{sel.ids.length}</b> от {r.payable.length} · <b>{money(sel.sum)}</b></>
                          : r.packs.length > 0
                            ? "Пакетът се плаща наведнъж — отделните видеа не се маркират"
                            : "Няма дължими позиции"}
                      </span>
                      <button className="bm-btn bm-btn--ghost bm-btn--sm" onClick={() => toggle(setHistFor, r.m.id)}>
                        {histFor.has(r.m.id) ? "Скрий историята" : "Виж историята"}
                      </button>
                      {isAdmin && r.payable.length > 0 && (
                        <button className="bm-btn bm-btn--primary bm-btn--sm"
                          disabled={sel.ids.length === 0 && sel.pkgs.length === 0}
                          onClick={() => setPayFor(r.m.id)}>
                          {sel.all ? "Плати всичко" : `Плати избраните (${money(sel.sum)})`}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {isAdmin && (
        <ProfitStrip month={month} invoices={invoices} payouts={payouts} />
      )}

      {payFor && (() => {
        const r = rows.find((x) => x.m.id === payFor);
        if (!r) return null;
        const s = selectionFor(r);
        const use = s.sum > 0 ? s : { ids: [] as number[], pkgs: [] as number[], sum: r.owed };
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

// Ред за едно (видео × роля). Сумата се редактира на място и се заключва.
function EarningRow({
  e, title, client, roles, isAdmin, checked, onCheck, onPrice, upcoming, inPackage,
}: {
  e: VideoEarning; title: string; client: string; roles: PayRole[]; isAdmin: boolean;
  checked: boolean; onCheck: () => void; onPrice: (v: number) => void;
  upcoming?: boolean; inPackage?: string;
}) {
  const paid = !!e.payout_id;
  const locked = paid || !isAdmin || !!inPackage;
  const state = inPackage ? "по пакет" : paid ? "платено" : upcoming ? "предстоящо" : "дължимо";
  const cls = inPackage || upcoming ? "pending" : paid ? "paid" : "owed";
  return (
    <label className={"pay-vrow" + (paid || upcoming || inPackage ? " is-muted" : "")}>
      <input type="checkbox" className="pay-cb" checked={checked} onChange={onCheck}
        disabled={locked || upcoming} aria-label={`Избери ${title}`}
        style={{ visibility: isAdmin ? "visible" : "hidden" }} />
      <span className="pay-vinfo">
        <span className="pay-vt">{title}</span>
        <span className="pay-vm">
          <span className="pay-rolechip">{payRoleLabel(roles, e.role_key)}</span>
          {client && <span>{client}</span>}
          <span>
            {upcoming ? "в процес" : paid ? "платено" : "готово"}
            {e.earned_at && !upcoming ? " " + shortDay(e.earned_at) : ""}
          </span>
          {e.price_locked && !inPackage && <span>· ръчна цена</span>}
        </span>
      </span>
      {inPackage ? (
        <span className="pay-vprice" style={{ color: "var(--bm-text-subtle)" }}>{inPackage}</span>
      ) : (
        <span className="pay-vprice">
          €
          <input type="number" step="0.01" min="0" defaultValue={e.price} key={e.id + ":" + e.price}
            disabled={locked}
            onClick={(ev) => ev.preventDefault()}
            onBlur={(ev) => {
              if (locked) return;
              const n = parseFloat(ev.currentTarget.value);
              if (!Number.isNaN(n) && n !== e.price) onPrice(n);
            }}
            title={locked ? "Не се редактира" : "Ръчна цена — заключва се и тарифата вече не я пипа"} />
        </span>
      )}
      <span className={"pay-status pay-status--" + cls}>{state}</span>
    </label>
  );
}

// Чиста печалба за периода — под списъка, за да не се бърка с дължимото.
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
      <div className="pay-kpi">
        <div className="k">Събрано {month ? monthLabel(month) : "общо"}</div>
        <div className="v"><Money>{money(rev)}</Money></div>
        <div className="s">платени фактури</div>
      </div>
      <div className="pay-kpi">
        <div className="k">Изплатено на екипа</div>
        <div className="v" style={{ color: "var(--bm-danger-600)" }}><Money>{money(cost)}</Money></div>
        <div className="s">реални преводи</div>
      </div>
      <div className="pay-kpi">
        <div className="k">Чиста печалба</div>
        <div className="v" style={{ color: net >= 0 ? "var(--bm-success-600)" : "var(--bm-danger-600)" }}>
          <Money>{money(net)}</Money>
        </div>
        <div className="s">преди другите разходи</div>
      </div>
    </div>
  );
}

function PayModal({ name, selection, onClose, onConfirm }: {
  name: string;
  selection: { ids: number[]; pkgs: number[]; sum: number };
  onClose: () => void;
  onConfirm: (method: string, reference: string) => void;
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
          <div className="bm-field">
            <label className="bm-label">Метод</label>
            <select className="bm-input" value={method} onChange={(ev) => setMethod(ev.target.value)}>
              {PAY_METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>
          <div className="bm-field">
            <label className="bm-label">Референция</label>
            <input className="bm-input" value={reference} onChange={(ev) => setReference(ev.target.value)}
              placeholder="напр. номер на превод" />
          </div>
          <p className="bm-text-subtle" style={{ fontSize: "var(--bm-text-xs)", margin: 0 }}>
            Записва се с дата и може да бъде отменено от „Виж историята“.
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
