"use client";

import { useState, useEffect } from "react";
import { useStore } from "@/components/store";
import { Icon } from "@/components/Icon";
import { Avatar } from "@/components/Avatar";
import { ContentCalendar } from "@/components/ContentCalendar";
import { BatchLinkModal } from "@/components/BatchLinkModal";
import { HealthChip } from "@/components/VideoFlow";
import { clientsById, contentTypeMeta, clientReviewMeta, isArchived, BOARD_RETENTION_DAYS, PRODUCTION_STAGES, POST_STAGES, videoHealth, type ContentItem } from "@/lib/data";

// "2026-11-28" -> "28.11"
const dm = (d?: string | null) => (d ? `${d.slice(8, 10)}.${d.slice(5, 7)}` : "");

export default function ProductionPage() {
  const { contentItems, clients, currentUser, advanceStage, completeVideo, openModal, visibleClients, team, requestBatchApproval } = useStore();
  // Импортът на сценарии е и за стратезите/сценаристите — тяхната работа е
  // да вкарват готовите текстове, без това да им дава екипни права. Циклите
  // обаче са координация и остават за admin/manager.
  const myRoles = team.find((m) => m.initials === currentUser.initials)?.roles || [];
  const canManageCycles = currentUser.level === "admin" || currentUser.level === "manager";
  const canImport = canManageCycles || myRoles.includes("strategy") || myRoles.includes("script");
  // „Приключени“ приема drop само от Публикуващия кръг.
  const canPublish = canManageCycles || myRoles.includes("review");
  const byId = clientsById(clients);
  const allowedIds = new Set(visibleClients.map((c) => c.id));
  const [clientFilter, setClientFilter] = useState("all");
  // Два борда: видеата минават през видео етапите, постовете — през своите.
  const [boardTab, setBoardTab] = useState<"videos" | "posts">("videos");
  const [mine, setMine] = useState(false);
  // „Искат внимание“: само видеата след датата, заседналите и чакащите (0061).
  // „Чака теб“ на „Днес“ води право тук: /production?attention=1
  const [attention, setAttention] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (new URLSearchParams(window.location.search).get("attention") === "1") setAttention(true); }, []);
  const needsAttention = (c: ContentItem) => {
    if (c.published || c.type === "post") return false;
    const lvl = videoHealth(c)?.level;
    return lvl === "late" || lvl === "stuck" || lvl === "waiting";
  };
  // „По месеци“ — колко е готово за всеки клиент всеки месец. Дъската е за текущата работа.
  const [showArchive, setShowArchive] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  // Дъската на цял екран: разгъва борда до целия прозорец (отгоре до долу),
  // за да се вижда целият прогрес без скролване през останалата страница.
  const [fullscreen, setFullscreen] = useState(false);
  // Групово одобрение: избираш видеата директно върху картите на дъската
  // (режим на избор), а контролите са във фиксирана лента долу — без да местят
  // интерфейса. Резултатният линк се показва в малък модал.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchLink, setBatchLink] = useState("");
  const toggleSelect = (id: string) => setSelectedIds((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const exitSelect = () => { setSelectMode(false); setSelectedIds(new Set()); };
  // Смяна на клиент/таб излиза от избора, за да не се смесват видеа на клиенти.
  const changeClient = (id: string) => { exitSelect(); setClientFilter(id); };
  const changeTab = (t: "videos" | "posts") => { exitSelect(); setBoardTab(t); };
  const createBatchLink = async () => {
    if (!selectedIds.size) return;
    setBatchBusy(true);
    const token = await requestBatchApproval(Array.from(selectedIds));
    setBatchBusy(false);
    if (token) { setBatchLink(`${window.location.origin}/review/group/${token}`); exitSelect(); }
  };
  // Esc затваря режима „цял екран“ и заключваме скрола на страницата отдолу.
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setFullscreen(false); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [fullscreen]);

  // Публикуваното отпреди BOARD_RETENTION_DAYS дни се архивира от борда —
  // видеата остават в базата (клиентският портал и пакетът ги ползват).
  const inScope = contentItems.filter((c) => {
    if (!allowedIds.has(c.client)) return false;
    if (clientFilter !== "all" && c.client !== clientFilter) return false;
    if (attention && !needsAttention(c)) return false;
    if (mine) {
      const cur = (c.stages || []).find((s) => s.key === (c.current_stage || "strategy"));
      if (cur?.assignee !== currentUser.initials) return false;
    }
    return true;
  });
  // Видеа в работа по клиент (за бутоните отгоре) — без публикуваните.
  const openByClient = (() => {
    const by: Record<string, number> = {};
    for (const c of contentItems) if (allowedIds.has(c.client) && !c.published && c.type !== "post") by[c.client] = (by[c.client] || 0) + 1;
    return { by, total: Object.values(by).reduce((a, b) => a + b, 0) };
  })();
  const attentionCount = contentItems.filter((c) => allowedIds.has(c.client) && (clientFilter === "all" || c.client === clientFilter) && needsAttention(c)).length;
  const archivedCount = inScope.filter((c) => c.published && isArchived(c.published_at)).length;
  const visible = showArchive ? inScope : inScope.filter((c) => !(c.published && isArchived(c.published_at)));

  const inTab = (c: { type: string }) => (boardTab === "posts" ? c.type === "post" : c.type !== "post");
  const tabItems = visible.filter(inTab);
  const stagesSet = boardTab === "posts" ? POST_STAGES : PRODUCTION_STAGES;
  const colItems = (stageKey: string) => tabItems.filter((c) => !c.published && (c.current_stage || "strategy") === stageKey);
  // Публикуваните (ръчно, през етапите или от нощния job при минала дата)
  // живеят в отделната колона „Приключени“.
  const completed = tabItems.filter((c) => c.published);
  const videosCount = visible.filter((c) => c.type !== "post").length;
  const postsCount = visible.filter((c) => c.type === "post").length;

  // Самата дъска (колони + „Приключени“) — рендерира се на страницата и в
  // режима „цял екран“, затова е изнесена тук като функция.
  const renderBoard = () => (
    <div className={"bm-board " + (boardTab === "posts" ? "bm-board--6" : "bm-board--7")}>
      {stagesSet.map((col) => {
        const items = colItems(col.key);
        return (
          <div
            key={col.key}
            className={"bm-kcol" + (items.length === 0 ? " bm-kcol--empty" : "")}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (!dragId) return;
              // Пускане в СЪЩАТА колона е no-op — без излишен retarget на таска.
              const it = contentItems.find((c) => c.id === dragId);
              if (it && (it.current_stage || "strategy") !== col.key) advanceStage(dragId, col.key);
              setDragId(null);
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "var(--bm-space-1) var(--bm-space-2)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--bm-space-2)", minWidth: 0 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: col.dot, flexShrink: 0 }} />
                <span title={col.label} className="pf-col-title">{col.label}</span>
              </div>
              <span style={{ fontSize: "var(--bm-text-xs)", color: "var(--bm-text-subtle)", fontWeight: 600, background: "var(--bm-surface)", borderRadius: "var(--bm-radius-full)", padding: "1px 8px" }}>{items.length}</span>
            </div>

            <div className="bm-noscrollbar bm-kcol__list">
            {items.map((it) => {
              const ct = contentTypeMeta(it.type);
              const cur = (it.stages || []).find((s) => s.key === (it.current_stage || "strategy"));
              const canMove = currentUser.isAdmin || currentUser.level === "manager" || cur?.assignee === currentUser.initials;
              const picked = selectMode && selectedIds.has(it.id);
              return (
                <div
                  key={it.id}
                  className={!selectMode && canMove ? "aw-tcard" : undefined}
                  draggable={!selectMode && canMove}
                  onDragStart={!selectMode && canMove ? () => setDragId(it.id) : undefined}
                  onClick={() => (selectMode ? toggleSelect(it.id) : openModal({ kind: "content", mode: "edit", item: it }))}
                  style={{ position: "relative", background: "var(--bm-surface)", border: "1px solid var(--bm-border)", borderLeft: `3px solid ${ct.fg}`, borderRadius: "var(--bm-radius-md)", padding: "var(--bm-space-3)", display: "flex", flexDirection: "column", gap: "var(--bm-space-2)", boxShadow: "var(--bm-shadow-xs)", cursor: "pointer", outline: picked ? "2px solid var(--bm-brand-500)" : undefined, outlineOffset: picked ? 1 : undefined }}
                >
                  {selectMode && (
                    <span aria-hidden="true" style={{ position: "absolute", top: 6, right: 6, width: 18, height: 18, borderRadius: 4, border: "2px solid var(--bm-brand-500)", background: picked ? "var(--bm-brand-500)" : "var(--bm-surface)", color: "#fff", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 800, lineHeight: 1 }}>{picked ? "✓" : ""}</span>
                  )}
                  <div style={{ fontWeight: 600, fontSize: "var(--bm-text-sm)", lineHeight: "var(--bm-leading-snug)", paddingRight: selectMode ? 22 : 0 }}>{it.published ? "✓ " : ""}{it.title || "(без заглавие)"}</div>
                  {!it.published && clientReviewMeta(it.client_review_status) && (
                    <span className={"bm-badge " + clientReviewMeta(it.client_review_status)!.cls} style={{ alignSelf: "flex-start" }}>{clientReviewMeta(it.client_review_status)!.short}</span>
                  )}
                  <HealthChip item={it} />
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: "var(--bm-text-xs)", color: "var(--bm-text-muted)", fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{byId[it.client]?.name || it.client}</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                      {it.date && <span style={{ fontSize: "var(--bm-text-xs)", color: "var(--bm-text-subtle)" }} title="Дата за публикуване">{dm(it.date)}</span>}
                      {cur?.assignee && <Avatar initials={cur.assignee} style={{ width: 22, height: 22, fontSize: 9 }} />}
                    </span>
                  </div>

                  {/* Телефон: HTML5 влаченето не работи на тъч, а работниците
                      гледат борда от телефон. Списъкът дава СЪЩОТО, което дава
                      влаченето на десктоп — местене в кой да е етап, не само
                      съседния. Правата са същите: чий е текущият етап (canMove),
                      а „Приключени“ иска и права за публикуване. */}
                  {!selectMode && canMove && (
                    <div className="bm-card-move">
                      <select
                        className="bm-select"
                        value={it.current_stage || stagesSet[0].key}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          e.stopPropagation();
                          const to = e.target.value;
                          if (to === "__done__") completeVideo(it.id);
                          else if (to !== (it.current_stage || stagesSet[0].key)) advanceStage(it.id, to);
                        }}
                        aria-label="Премести видеото в друг етап"
                      >
                        {stagesSet.map((x) => (
                          <option key={x.key} value={x.key}>{x.label}</option>
                        ))}
                        {canPublish && <option value="__done__">✓ Приключени</option>}
                      </select>
                    </div>
                  )}
                </div>
              );
            })}

            {items.length === 0 && (
              <div style={{ border: "1px dashed var(--bm-border-strong)", borderRadius: "var(--bm-radius-md)", padding: "var(--bm-space-3)", textAlign: "center", fontSize: "var(--bm-text-xs)", color: "var(--bm-text-subtle)" }}>—</div>
            )}
            </div>
          </div>
        );
      })}

      {/* Приключени: публикувани ръчно, през етапите или от нощния job при
          минала дата. Drop тук маркира видеото публикувано (само canPublish). */}
      <div
        className={"bm-kcol" + (completed.length === 0 ? " bm-kcol--empty" : "")}
        onDragOver={(e) => e.preventDefault()}
        onDrop={() => {
          if (dragId && canPublish) completeVideo(dragId);
          setDragId(null);
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "var(--bm-space-1) var(--bm-space-2)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--bm-space-2)", minWidth: 0 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--bm-success-600)", flexShrink: 0 }} />
            <span title="Приключени" className="pf-col-title">Приключени</span>
          </div>
          <span style={{ fontSize: "var(--bm-text-xs)", color: "var(--bm-text-subtle)", fontWeight: 600, background: "var(--bm-surface)", borderRadius: "var(--bm-radius-full)", padding: "1px 8px" }}>{completed.length}</span>
        </div>
        <div className="bm-noscrollbar bm-kcol__list">
          {completed.map((it) => {
            const ct = contentTypeMeta(it.type);
            return (
              <div
                key={it.id}
                onClick={() => openModal({ kind: "content", mode: "edit", item: it })}
                style={{ background: "var(--bm-success-50)", border: "1px solid var(--bm-border)", borderLeft: `3px solid ${ct.fg}`, borderRadius: "var(--bm-radius-md)", padding: "var(--bm-space-3)", display: "flex", flexDirection: "column", gap: "var(--bm-space-2)", boxShadow: "var(--bm-shadow-xs)", cursor: "pointer" }}
              >
                <div style={{ fontWeight: 600, fontSize: "var(--bm-text-sm)", lineHeight: "var(--bm-leading-snug)" }}>✓ {it.title || "(без заглавие)"}</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "var(--bm-text-xs)", color: "var(--bm-text-subtle)" }}>{byId[it.client]?.name || it.client}</span>
                  <span style={{ fontSize: "var(--bm-text-xs)", color: "var(--bm-text-subtle)" }}>{dm(it.date)}</span>
                </div>
              </div>
            );
          })}
          {completed.length === 0 && (
            <div style={{ border: "1px dashed var(--bm-border-strong)", borderRadius: "var(--bm-radius-md)", padding: "var(--bm-space-3)", textAlign: "center", fontSize: "var(--bm-text-xs)", color: "var(--bm-text-subtle)" }}>—</div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-5)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--bm-space-4)", flexWrap: "wrap" }}>
        <div>
          <h1>Продукция</h1>
          <p className="bm-text-muted" style={{ margin: "4px 0 0" }}>Всяко видео минава през етапите отляво надясно. Клик върху видеото го отваря.</p>
        </div>
        <div style={{ display: "flex", gap: "var(--bm-space-3)", alignItems: "center", flexWrap: "wrap" }}>
          {!currentUser.isAdmin && <label className="bm-checkbox"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Моята работа</label>}
          <label className="bm-checkbox" title={`Показва публикуваното отпреди повече от ${BOARD_RETENTION_DAYS} дни в колоната „Приключени“ (данните винаги остават в клиентския портал)`}>
            <input type="checkbox" checked={showArchive} onChange={(e) => setShowArchive(e.target.checked)} /> Архив ({archivedCount})
          </label>
          {canImport && (
            <button className="bm-btn bm-btn--primary" onClick={() => openModal({ kind: "importScripts" })}>Импортирай сценарии</button>
          )}
          {clientFilter !== "all" && (
            <button className="bm-btn bm-btn--secondary" title="Цветове, тон на гласа и правила на този клиент" onClick={() => openModal({ kind: "brandView", clientId: clientFilter })}>Бранд</button>
          )}
        </div>
      </div>

      {/* Клиентите като бутони: колко видеа има всеки в работа — един клик филтрира дъската и календара. */}
      <div className="pf-clients" role="group" aria-label="Клиент">
        {attentionCount > 0 || attention ? (
          <button type="button" className={"crm-chip pf-attn" + (attentionCount > 0 ? " pf-attn--hot" : "")} aria-pressed={attention} onClick={() => setAttention((v) => !v)} title="Видеа след датата, стоящи над 7 дни в един етап или чакащи нещо">Искат внимание · {attentionCount}</button>
        ) : null}
        <button type="button" className="crm-chip" aria-pressed={clientFilter === "all"} onClick={() => changeClient("all")}>Всички · {openByClient.total}</button>
        {visibleClients.filter((c) => !c.archived_at && (openByClient.by[c.id] || clientFilter === c.id)).map((c) => (
          <button key={c.id} type="button" className="crm-chip" aria-pressed={clientFilter === c.id} onClick={() => changeClient(c.id)}>{c.name} · {openByClient.by[c.id] || 0}</button>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--bm-space-3)", flexWrap: "wrap" }}>
        <div className="bm-tabs" style={{ border: "none" }}>
          <button role="tab" className="bm-tab" aria-selected={boardTab === "videos"} onClick={() => changeTab("videos")}>Видеа ({videosCount})</button>
          <button role="tab" className="bm-tab" aria-selected={boardTab === "posts"} onClick={() => changeTab("posts")}>Постове ({postsCount})</button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--bm-space-2)" }}>
          {boardTab === "posts" && (canImport || myRoles.includes("posts")) && (
            <button className="bm-btn bm-btn--primary bm-btn--sm" onClick={() => openModal({ kind: "createPosts" })}>+ Нови постове</button>
          )}
          {boardTab === "videos" && clientFilter !== "all" && (
            <button
              className={"bm-btn bm-btn--sm " + (selectMode ? "bm-btn--primary" : "bm-btn--secondary")}
              title="Избери видеа върху дъската и ги прати за одобрение с един линк"
              onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
            >{selectMode ? "Изход от избор" : "Групово одобрение"}</button>
          )}
          <button className="bm-btn bm-btn--secondary bm-btn--sm" title="Виж дъската на цял екран" onClick={() => setFullscreen(true)}>
            <ExpandIcon /> Цял екран
          </button>
        </div>
      </div>

      {renderBoard()}

      {contentItems.length === 0 && (
        <div className="bm-card"><div className="bm-card__body bm-text-subtle">Все още няма видеа. Добави съдържание в календара по-долу и то ще се появи тук като карта за продукция.</div></div>
      )}

      {/* Контент календарът живее тук, под дъската: работниците виждат кога
          какво излиза и в каква последователност се правят видеата. */}
      <div style={{ borderTop: "1px solid var(--bm-border)", paddingTop: "var(--bm-space-5)", display: "flex", flexDirection: "column", gap: "var(--bm-space-4)" }}>
        <div>
          <h2 style={{ margin: 0 }}>Контент календар</h2>
          <p className="bm-text-muted" style={{ margin: "4px 0 0" }}>Планът за месеца — кое видео кога излиза. Филтърът по клиент горе важи и за дъската, и за календара.</p>
        </div>
        <ContentCalendar clientId={clientFilter} onClientChange={changeClient} />
      </div>

      {/* Фиксирана лента за груповия избор — не мести интерфейса. */}
      {selectMode && (
        <div className="pf-batchbar">
          <span style={{ fontWeight: 600, fontSize: "var(--bm-text-sm)" }}>{selectedIds.size} избрани за одобрение</span>
          <button className="bm-btn bm-btn--ghost bm-btn--sm" onClick={exitSelect}>Отказ</button>
          <button className="bm-btn bm-btn--primary bm-btn--sm" disabled={!selectedIds.size || batchBusy} onClick={createBatchLink}>{batchBusy ? "Създаване…" : "Създай линк"}</button>
        </div>
      )}

      {batchLink && <BatchLinkModal link={batchLink} onClose={() => setBatchLink("")} />}

      {/* Дъската на цял екран — целият прогрес отгоре до долу, без страничен скрол. */}
      {fullscreen && (
        <div className="pf-fs">
          <div className="pf-fs__bar">
            <div className="bm-tabs" style={{ border: "none" }}>
              <button role="tab" className="bm-tab" aria-selected={boardTab === "videos"} onClick={() => changeTab("videos")}>Видеа ({videosCount})</button>
              <button role="tab" className="bm-tab" aria-selected={boardTab === "posts"} onClick={() => changeTab("posts")}>Постове ({postsCount})</button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--bm-space-3)", flexWrap: "wrap" }}>
              <label className="bm-checkbox"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Моята работа</label>
              <select className="bm-select" style={{ width: "auto", minWidth: 160 }} value={clientFilter} onChange={(e) => changeClient(e.target.value)}>
                <option value="all">Всички клиенти</option>
                {visibleClients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button className="bm-btn bm-btn--secondary" onClick={() => setFullscreen(false)}><Icon name="close" size={16} /> Затвори</button>
            </div>
          </div>
          <div className="pf-fs__board">
            {renderBoard()}
          </div>
        </div>
      )}
    </div>
  );
}

// Иконка „разгъни на цял екран“ — четири стрелки към ъглите.
function ExpandIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
    </svg>
  );
}
