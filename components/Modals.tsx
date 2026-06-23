"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Icon } from "./Icon";
import { useStore } from "./store";
import { CommentThread } from "./CommentThread";
import { fmtDuration, AD_OBJECTIVES, AD_OBJECTIVE_LABELS, CONTENT_TYPES, PRODUCTION_STAGES, stageStatusMeta, CONTENT_PACKAGES, ONBOARDING_TASKS, packageItemCount, type ContentType } from "@/lib/data";
import { clientSchema, taskSchema, invoiceSchema, leadSchema, campaignSchema, adDraftSchema, contentItemSchema, onboardSchema, type ClientForm, type TaskForm, type InvoiceForm, type LeadForm, type CampaignForm, type AdDraftForm, type ContentItemForm, type OnboardForm } from "@/lib/schemas";

const overlay: React.CSSProperties = {
  position: "fixed", inset: 0, zIndex: 40, background: "rgba(15,23,42,0.5)",
  display: "flex", alignItems: "center", justifyContent: "center", padding: "var(--bm-space-4)",
};

function Shell({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bm-modal">
        <div className="bm-modal__header">
          <h3>{title}</h3>
          <button className="bm-btn bm-btn--ghost bm-btn--icon" onClick={onClose}><Icon name="close" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Err({ msg }: { msg?: string }) {
  return msg ? <span className="bm-error">{msg}</span> : null;
}

export function Modals() {
  const store = useStore();
  const { modal, closeModal, clients } = store;
  if (!modal) return null;

  if (modal.kind === "confirm") {
    return (
      <Shell title={modal.title} onClose={closeModal}>
        <div className="bm-modal__body bm-text-muted">{modal.message}</div>
        <div className="bm-modal__footer">
          <button className="bm-btn bm-btn--secondary" onClick={closeModal}>Отказ</button>
          <button className="bm-btn bm-btn--danger" onClick={modal.onConfirm}>{modal.confirmLabel}</button>
        </div>
      </Shell>
    );
  }

  if (modal.kind === "client") return <ClientModal />;
  if (modal.kind === "task") return <TaskModal />;
  if (modal.kind === "lead") return <LeadModal />;
  if (modal.kind === "onboard") return <OnboardModal />;
  if (modal.kind === "campaign") return <CampaignModal />;
  if (modal.kind === "ad") return <AdModal />;
  if (modal.kind === "content") return <ContentModal />;
  if (modal.kind === "importScripts") return <ScriptImportModal />;
  return <InvoiceModal />;
}

function ClientModal() {
  const { modal, closeModal, addClient, updateClient, team, currentUser } = useStore();
  const editing = modal?.kind === "client" && modal.mode === "edit" ? modal.client : null;
  const ownerOpts = Array.from(new Set([currentUser.initials, ...team.map((m) => m.initials)]));
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<ClientForm>({
    resolver: zodResolver(clientSchema),
    defaultValues: editing
      ? { name: editing.name, industry: editing.industry, status: editing.status, mrr: editing.mrr, owner: editing.owner, health: editing.health, note: editing.note, editor: editing.editor ?? "", analysis_status: editing.analysis_status ?? "not_started", analysis_notes: editing.analysis_notes ?? "", brand_voice: editing.brand_voice ?? "", target_audience: editing.target_audience ?? "", brand_assets_url: editing.brand_assets_url ?? "" }
      : { name: "", industry: "", status: "Active", mrr: 0, owner: currentUser.initials, health: "good", note: "", editor: "", analysis_status: "not_started", analysis_notes: "", brand_voice: "", target_audience: "", brand_assets_url: "" },
  });
  const onSubmit = (f: ClientForm) => (editing ? updateClient(editing.id, f) : addClient(f));

  return (
    <Shell title={editing ? "Редакция на клиент" : "Нов клиент"} onClose={closeModal}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="bm-modal__body" style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-4)" }}>
          <div className="bm-field"><label className="bm-label">Име на фирма</label><input className="bm-input" {...register("name")} placeholder="напр. Фирма ООД" /><Err msg={errors.name?.message} /></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--bm-space-4)" }}>
            <div className="bm-field"><label className="bm-label">Индустрия</label><input className="bm-input" {...register("industry")} placeholder="напр. Търговия" /><Err msg={errors.industry?.message} /></div>
            <div className="bm-field"><label className="bm-label">Месечно (USD)</label><input className="bm-input" type="number" {...register("mrr", { valueAsNumber: true })} /><Err msg={errors.mrr?.message} /></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "var(--bm-space-4)" }}>
            <div className="bm-field"><label className="bm-label">Статус</label><select className="bm-select" {...register("status")}><option value="Active">Активен</option><option value="At risk">Риск</option><option value="Onboarding">Включване</option></select></div>
            <div className="bm-field"><label className="bm-label">Състояние</label><select className="bm-select" {...register("health")}><option value="good">Стабилен</option><option value="watch">Наблюдение</option><option value="risk">Риск</option></select></div>
            <div className="bm-field"><label className="bm-label">Отговорник</label><select className="bm-select" {...register("owner")}>{ownerOpts.map((k) => <option key={k} value={k}>{k}</option>)}</select></div>
          </div>
          <div className="bm-field"><label className="bm-label">Видео монтажист (за продукция)</label><select className="bm-select" {...register("editor")}><option value="">— няма —</option>{ownerOpts.map((k) => <option key={k} value={k}>{k}</option>)}</select></div>
          <div className="bm-field"><label className="bm-label">Бележки</label><textarea className="bm-textarea" {...register("note")} placeholder="Контекст за акаунта…" /></div>
          <div style={{ borderTop: "1px solid var(--bm-border)", paddingTop: "var(--bm-space-4)", display: "flex", flexDirection: "column", gap: "var(--bm-space-3)" }}>
            <div className="bm-label" style={{ fontWeight: 700 }}>Бранд профил</div>
            <div className="bm-field"><label className="bm-label">Тон на гласа</label><textarea className="bm-textarea" {...register("brand_voice")} placeholder="напр. неформален, забавен, експертен…" /></div>
            <div className="bm-field"><label className="bm-label">Целева аудитория</label><textarea className="bm-textarea" {...register("target_audience")} placeholder="напр. жени 25-40, интересуващи се от…" /></div>
            <div className="bm-field"><label className="bm-label">Линк към бранд материали</label><input className="bm-input" {...register("brand_assets_url")} placeholder="Drive / Notion линк с лого, цветове…" /></div>
          </div>
          <div style={{ borderTop: "1px solid var(--bm-border)", paddingTop: "var(--bm-space-4)", display: "flex", flexDirection: "column", gap: "var(--bm-space-3)" }}>
            <div className="bm-field"><label className="bm-label">Бизнес анализ (преди старт на видеата)</label><select className="bm-select" {...register("analysis_status")}><option value="not_started">Не е започнат</option><option value="in_progress">В процес</option><option value="done">Готов</option></select></div>
            <div className="bm-field"><label className="bm-label">Бележки от анализа</label><textarea className="bm-textarea" {...register("analysis_notes")} placeholder="Изводи, целева аудитория, послания…" /></div>
          </div>
        </div>
        <div className="bm-modal__footer">
          <button type="button" className="bm-btn bm-btn--secondary" onClick={closeModal}>Отказ</button>
          <button type="submit" className="bm-btn bm-btn--primary" disabled={isSubmitting}>{editing ? "Запази" : "Добави клиент"}</button>
        </div>
      </form>
    </Shell>
  );
}

function TaskTimer({ taskId }: { taskId: string }) {
  const { tasks, logTime } = useStore();
  const base = tasks.find((t) => t.id === taskId)?.time_logged || 0;
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (running) {
      ref.current = setInterval(() => setElapsed((e) => e + 1), 1000);
      return () => { if (ref.current) clearInterval(ref.current); };
    }
  }, [running]);

  const stop = () => { setRunning(false); if (elapsed > 0) logTime(taskId, elapsed); setElapsed(0); };

  return (
    <div style={{ borderTop: "1px solid var(--bm-border)", paddingTop: "var(--bm-space-4)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--bm-space-3)" }}>
      <div>
        <div className="bm-label">Изработено време</div>
        <div style={{ fontFamily: "var(--bm-font-mono)", fontWeight: 700, fontSize: "var(--bm-text-lg)" }}>{fmtDuration(base + elapsed)}</div>
      </div>
      {running ? (
        <button type="button" className="bm-btn bm-btn--danger" onClick={stop}>Спри таймера</button>
      ) : (
        <button type="button" className="bm-btn bm-btn--secondary" onClick={() => setRunning(true)}>Старт таймер</button>
      )}
    </div>
  );
}

function TaskModal() {
  const { modal, closeModal, addTask, updateTask, deleteTask, openModal, currentUser, clients } = useStore();
  const editing = modal?.kind === "task" && modal.mode === "edit" ? modal.task : null;
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<TaskForm>({
    resolver: zodResolver(taskSchema),
    defaultValues: editing
      ? { title: editing.title, client: editing.client, priority: editing.priority, due: editing.due }
      : { title: "", client: clients[0]?.id ?? "", priority: "medium", due: "Soon" },
  });
  const onSubmit = (f: TaskForm) => (editing ? updateTask(editing.id, f) : addTask(f));

  return (
    <Shell title={editing ? "Редакция на задача" : "Нова задача"} onClose={closeModal}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="bm-modal__body" style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-4)" }}>
          <div className="bm-field"><label className="bm-label">Заглавие на задача</label><input className="bm-input" {...register("title")} placeholder="напр. Изготви бюлетин за август" /><Err msg={errors.title?.message} /></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--bm-space-4)" }}>
            <div className="bm-field"><label className="bm-label">Клиент</label><select className="bm-select" {...register("client")}>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><Err msg={errors.client?.message} /></div>
            <div className="bm-field"><label className="bm-label">Приоритет</label><select className="bm-select" {...register("priority")}><option value="high">Висок</option><option value="medium">Среден</option><option value="low">Нисък</option></select></div>
          </div>
          <div className="bm-field"><label className="bm-label">Краен срок</label><input className="bm-input" {...register("due")} placeholder="напр. 15 юли" /></div>
          {editing && <TaskTimer taskId={editing.id} />}
          {editing && (
            <div style={{ borderTop: "1px solid var(--bm-border)", paddingTop: "var(--bm-space-4)" }}>
              <div className="bm-label" style={{ marginBottom: "var(--bm-space-2)" }}>Коментари</div>
              <CommentThread entityType="task" entityId={editing.id} />
            </div>
          )}
        </div>
        <div className="bm-modal__footer" style={{ justifyContent: editing && currentUser.isAdmin ? "space-between" : "flex-end" }}>
          {editing && currentUser.isAdmin && (
            <button
              type="button"
              className="bm-btn bm-btn--ghost"
              onClick={() => openModal({ kind: "confirm", title: "Изтриване на задача?", message: `Изтрий „${editing.title}“? Действието е необратимо.`, confirmLabel: "Изтрий", onConfirm: () => deleteTask(editing.id) })}
            >
              Delete
            </button>
          )}
          <div style={{ display: "flex", gap: "var(--bm-space-3)" }}>
            <button type="button" className="bm-btn bm-btn--secondary" onClick={closeModal}>Отказ</button>
            <button type="submit" className="bm-btn bm-btn--primary" disabled={isSubmitting}>{editing ? "Запази" : "Добави задача"}</button>
          </div>
        </div>
      </form>
    </Shell>
  );
}

function LeadModal() {
  const { modal, closeModal, addLead, updateLead, deleteLead, openModal, currentUser, team } = useStore();
  const editing = modal?.kind === "lead" && modal.mode === "edit" ? modal.lead : null;
  const ownerOpts = Array.from(new Set([currentUser.initials, ...team.map((m) => m.initials)]));
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LeadForm>({
    resolver: zodResolver(leadSchema),
    defaultValues: editing
      ? { name: editing.name, contact: editing.contact, value: editing.value, stage: editing.stage, owner: editing.owner }
      : { name: "", contact: "", value: 0, stage: "new", owner: currentUser.initials },
  });
  const onSubmit = (f: LeadForm) => (editing ? updateLead(editing.id, f) : addLead(f));

  return (
    <Shell title={editing ? "Редакция на сделка" : "Нова сделка"} onClose={closeModal}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="bm-modal__body" style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-4)" }}>
          <div className="bm-field"><label className="bm-label">Сделка / фирма</label><input className="bm-input" {...register("name")} placeholder="напр. Халсион Хотели" /><Err msg={errors.name?.message} /></div>
          <div className="bm-field"><label className="bm-label">Контакт</label><input className="bm-input" {...register("contact")} placeholder="напр. Иван Петров" /></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "var(--bm-space-4)" }}>
            <div className="bm-field"><label className="bm-label">Стойност (USD)</label><input className="bm-input" type="number" {...register("value", { valueAsNumber: true })} /><Err msg={errors.value?.message} /></div>
            <div className="bm-field"><label className="bm-label">Етап</label><select className="bm-select" {...register("stage")}><option value="new">Нов</option><option value="contacted">Свързан</option><option value="proposal">Оферта</option><option value="won">Спечелен</option><option value="lost">Загубен</option></select></div>
            <div className="bm-field"><label className="bm-label">Отговорник</label><select className="bm-select" {...register("owner")}>{ownerOpts.map((k) => <option key={k} value={k}>{k}</option>)}</select></div>
          </div>
        </div>
        <div className="bm-modal__footer" style={{ justifyContent: editing && currentUser.isAdmin ? "space-between" : "flex-end" }}>
          {editing && currentUser.isAdmin && (
            <button type="button" className="bm-btn bm-btn--ghost" onClick={() => openModal({ kind: "confirm", title: "Изтриване на сделка?", message: `Изтрий ${editing.name}? Действието е необратимо.`, confirmLabel: "Изтрий", onConfirm: () => deleteLead(editing.id) })}>Изтрий</button>
          )}
          <div style={{ display: "flex", gap: "var(--bm-space-3)" }}>
            <button type="button" className="bm-btn bm-btn--secondary" onClick={closeModal}>Отказ</button>
            {editing && editing.stage === "won" && !editing.client_id && (
              <button type="button" className="bm-btn bm-btn--secondary" onClick={() => openModal({ kind: "onboard", lead: editing })}>Включи като клиент</button>
            )}
            <button type="submit" className="bm-btn bm-btn--primary" disabled={isSubmitting}>{editing ? "Запази" : "Добави сделка"}</button>
          </div>
        </div>
      </form>
    </Shell>
  );
}

function OnboardModal() {
  const { modal, closeModal, onboardLead, team, currentUser } = useStore();
  const lead = modal?.kind === "onboard" ? modal.lead : null;
  const ownerOpts = Array.from(new Set([currentUser.initials, ...team.map((m) => m.initials)]));
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<OnboardForm>({
    resolver: zodResolver(onboardSchema),
    defaultValues: { name: lead?.name ?? "", industry: "", mrr: lead?.value ?? 0, owner: lead?.owner ?? currentUser.initials, editor: "", packageId: CONTENT_PACKAGES[0]?.id ?? "" },
  });
  if (!lead) return null;
  const selPkg = CONTENT_PACKAGES.find((p) => p.id === watch("packageId")) || CONTENT_PACKAGES[0];
  const onSubmit = (f: OnboardForm) => onboardLead(lead.id, f);

  return (
    <Shell title="Включване на нов клиент" onClose={closeModal}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="bm-modal__body" style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-4)" }}>
          <div className="bm-alert bm-alert--info">Това ще създаде клиент, чеклист за включване и съдържателен план. Прегледай преди да потвърдиш.</div>
          <div className="bm-field"><label className="bm-label">Име на клиент</label><input className="bm-input" {...register("name")} /><Err msg={errors.name?.message} /></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--bm-space-4)" }}>
            <div className="bm-field"><label className="bm-label">Индустрия</label><input className="bm-input" {...register("industry")} placeholder="напр. Търговия" /><Err msg={errors.industry?.message} /></div>
            <div className="bm-field"><label className="bm-label">Месечно (USD)</label><input className="bm-input" type="number" {...register("mrr", { valueAsNumber: true })} /><Err msg={errors.mrr?.message} /></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--bm-space-4)" }}>
            <div className="bm-field"><label className="bm-label">Отговорник</label><select className="bm-select" {...register("owner")}>{ownerOpts.map((k) => <option key={k} value={k}>{k}</option>)}</select></div>
            <div className="bm-field"><label className="bm-label">Видео монтажист</label><select className="bm-select" {...register("editor")}><option value="">— няма —</option>{ownerOpts.map((k) => <option key={k} value={k}>{k}</option>)}</select></div>
          </div>
          <div className="bm-field"><label className="bm-label">Съдържателен пакет</label><select className="bm-select" {...register("packageId")}>{CONTENT_PACKAGES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select><Err msg={errors.packageId?.message} /></div>

          <div style={{ borderTop: "1px solid var(--bm-border)", paddingTop: "var(--bm-space-4)", display: "flex", flexDirection: "column", gap: "var(--bm-space-2)" }}>
            <div className="bm-label" style={{ fontWeight: 700 }}>Какво ще се създаде</div>
            <div className="bm-text-muted" style={{ fontSize: "var(--bm-text-sm)" }}>{ONBOARDING_TASKS.length} задачи за включване + {selPkg ? packageItemCount(selPkg) : 0} видеа в бек-лога.</div>
            <ul style={{ margin: 0, paddingLeft: "1.1rem", display: "flex", flexDirection: "column", gap: 2 }}>
              {ONBOARDING_TASKS.map((t) => <li key={t.title} style={{ fontSize: "var(--bm-text-xs)", color: "var(--bm-text-subtle)" }}>{t.title}</li>)}
            </ul>
          </div>
        </div>
        <div className="bm-modal__footer">
          <button type="button" className="bm-btn bm-btn--secondary" onClick={closeModal}>Отказ</button>
          <button type="submit" className="bm-btn bm-btn--primary" disabled={isSubmitting}>Включи клиента</button>
        </div>
      </form>
    </Shell>
  );
}

function CampaignModal() {
  const { modal, closeModal, addCampaign, updateCampaign, deleteCampaign, openModal, currentUser, clients } = useStore();
  const editing = modal?.kind === "campaign" && modal.mode === "edit" ? modal.campaign : null;
  const presetClient = modal?.kind === "campaign" && modal.mode === "create" ? modal.clientId : undefined;
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<CampaignForm>({
    resolver: zodResolver(campaignSchema),
    defaultValues: editing
      ? { name: editing.name, client: editing.client, status: editing.status, channel: editing.channel, budget: editing.budget, starts: editing.starts, ends: editing.ends }
      : { name: "", client: presetClient ?? clients[0]?.id ?? "", status: "planning", channel: "", budget: 0, starts: "", ends: "" },
  });
  const onSubmit = (f: CampaignForm) => (editing ? updateCampaign(editing.id, f) : addCampaign(f));

  return (
    <Shell title={editing ? "Редакция на кампания" : "Нова кампания"} onClose={closeModal}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="bm-modal__body" style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-4)" }}>
          <div className="bm-field"><label className="bm-label">Име на кампания</label><input className="bm-input" {...register("name")} placeholder="напр. Лятна разпродажба" /><Err msg={errors.name?.message} /></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--bm-space-4)" }}>
            <div className="bm-field"><label className="bm-label">Клиент</label><select className="bm-select" {...register("client")}>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><Err msg={errors.client?.message} /></div>
            <div className="bm-field"><label className="bm-label">Статус</label><select className="bm-select" {...register("status")}><option value="planning">Планиране</option><option value="active">Активна</option><option value="paused">На пауза</option><option value="completed">Завършена</option></select></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--bm-space-4)" }}>
            <div className="bm-field"><label className="bm-label">Канал</label><input className="bm-input" {...register("channel")} placeholder="напр. Платени социални" /></div>
            <div className="bm-field"><label className="bm-label">Бюджет (USD)</label><input className="bm-input" type="number" {...register("budget", { valueAsNumber: true })} /><Err msg={errors.budget?.message} /></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--bm-space-4)" }}>
            <div className="bm-field"><label className="bm-label">Започва</label><input className="bm-input" {...register("starts")} placeholder="напр. 1 юли" /></div>
            <div className="bm-field"><label className="bm-label">Завършва</label><input className="bm-input" {...register("ends")} placeholder="напр. 31 авг." /></div>
          </div>
        </div>
        <div className="bm-modal__footer" style={{ justifyContent: editing && currentUser.isAdmin ? "space-between" : "flex-end" }}>
          {editing && currentUser.isAdmin && (
            <button type="button" className="bm-btn bm-btn--ghost" onClick={() => openModal({ kind: "confirm", title: "Изтриване на кампания?", message: `Изтрий ${editing.name}? Действието е необратимо.`, confirmLabel: "Изтрий", onConfirm: () => deleteCampaign(editing.id) })}>Изтрий</button>
          )}
          <div style={{ display: "flex", gap: "var(--bm-space-3)" }}>
            <button type="button" className="bm-btn bm-btn--secondary" onClick={closeModal}>Отказ</button>
            <button type="submit" className="bm-btn bm-btn--primary" disabled={isSubmitting}>{editing ? "Запази" : "Създай кампания"}</button>
          </div>
        </div>
      </form>
    </Shell>
  );
}

function AdModal() {
  const { modal, closeModal, addAdDraft, updateAdDraft, deleteAdDraft, publishAd, openModal, currentUser, clients, integrations } = useStore();
  const editing = modal?.kind === "ad" && modal.mode === "edit" ? modal.ad : null;
  const metaConnected = integrations.find((i) => i.provider === "meta_ads")?.connected;
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<AdDraftForm>({
    resolver: zodResolver(adDraftSchema),
    defaultValues: editing
      ? { name: editing.name, client: editing.client ?? "", objective: editing.objective, budget: editing.budget, audience: editing.audience, primary_text: editing.primary_text, headline: editing.headline }
      : { name: "", client: clients[0]?.id ?? "", objective: "traffic", budget: 0, audience: "", primary_text: "", headline: "" },
  });
  const onSubmit = (f: AdDraftForm) => (editing ? updateAdDraft(editing.id, f) : addAdDraft(f));

  return (
    <Shell title={editing ? "Редакция на реклама" : "Нова реклама"} onClose={closeModal}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="bm-modal__body" style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-4)" }}>
          <div className="bm-field"><label className="bm-label">Име на кампания</label><input className="bm-input" {...register("name")} placeholder="напр. Лято — Привличане" /><Err msg={errors.name?.message} /></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "var(--bm-space-4)" }}>
            <div className="bm-field"><label className="bm-label">Клиент</label><select className="bm-select" {...register("client")}>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div className="bm-field"><label className="bm-label">Цел</label><select className="bm-select" {...register("objective")}>{AD_OBJECTIVES.map((o) => <option key={o} value={o}>{AD_OBJECTIVE_LABELS[o] || o}</option>)}</select></div>
            <div className="bm-field"><label className="bm-label">Бюджет (USD)</label><input className="bm-input" type="number" {...register("budget", { valueAsNumber: true })} /><Err msg={errors.budget?.message} /></div>
          </div>
          <div className="bm-field"><label className="bm-label">Аудитория</label><input className="bm-input" {...register("audience")} placeholder="напр. BG · 25-45 · купувачи" /></div>
          <div className="bm-field"><label className="bm-label">Заглавие</label><input className="bm-input" {...register("headline")} placeholder="Кратко заглавие" /></div>
          <div className="bm-field"><label className="bm-label">Основен текст</label><textarea className="bm-textarea" {...register("primary_text")} placeholder="Основният рекламен текст…" /><Err msg={errors.primary_text?.message} /></div>
          {editing && (
            <div className={"bm-alert " + (metaConnected ? "bm-alert--info" : "bm-alert--warning")}>
              {metaConnected ? "Meta акаунтът е свързан — публикуването е симулирано в тази версия." : "Свържи Meta акаунт в Интеграции, за да публикуваш."}
            </div>
          )}
        </div>
        <div className="bm-modal__footer" style={{ justifyContent: editing && currentUser.isAdmin ? "space-between" : "flex-end" }}>
          {editing && currentUser.isAdmin && (
            <button type="button" className="bm-btn bm-btn--ghost" onClick={() => openModal({ kind: "confirm", title: "Изтриване на реклама?", message: `Изтрий ${editing.name}? Действието е необратимо.`, confirmLabel: "Изтрий", onConfirm: () => deleteAdDraft(editing.id) })}>Изтрий</button>
          )}
          <div style={{ display: "flex", gap: "var(--bm-space-3)" }}>
            <button type="button" className="bm-btn bm-btn--secondary" onClick={closeModal}>Отказ</button>
            {editing && editing.status !== "published" && (
              <button type="button" className="bm-btn bm-btn--primary" disabled={!metaConnected} title={metaConnected ? "" : "Първо свържи Meta"} onClick={() => publishAd(editing.id)}>Публикувай в Meta</button>
            )}
            <button type="submit" className="bm-btn bm-btn--secondary" disabled={isSubmitting}>{editing ? "Запази" : "Запази чернова"}</button>
          </div>
        </div>
      </form>
    </Shell>
  );
}

function ContentModal() {
  const { modal, closeModal, addContentItem, updateContentItem, deleteContentItem, openModal, currentUser, team, contentItems, setStageAssignee, setStageStatus } = useStore();
  const editing = modal?.kind === "content" && modal.mode === "edit" ? modal.item : null;
  const live = editing ? contentItems.find((c) => c.id === editing.id) : null;
  const stages = live?.stages || [];
  const assigneeOpts = Array.from(new Set([currentUser.initials, ...team.map((m) => m.initials)]));
  const createCtx = modal?.kind === "content" && modal.mode === "create" ? modal : null;
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<ContentItemForm>({
    resolver: zodResolver(contentItemSchema),
    defaultValues: editing
      ? { date: editing.date ?? "", type: editing.type, title: editing.title, notes: editing.notes, script: editing.script ?? "", notion_url: editing.notion_url, published: editing.published ?? false }
      : { date: createCtx?.date ?? "", type: "promo", title: "", notes: "", script: "", notion_url: "", published: false },
  });
  const onSubmit = (f: ContentItemForm) => (editing ? updateContentItem(editing.id, f) : addContentItem(createCtx!.clientId, f));

  return (
    <Shell title={editing ? "Редакция на съдържание" : "Ново съдържание"} onClose={closeModal}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="bm-modal__body" style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-4)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--bm-space-4)" }}>
            <div className="bm-field"><label className="bm-label">Дата</label><input className="bm-input" type="date" {...register("date")} /><Err msg={errors.date?.message} /></div>
            <div className="bm-field"><label className="bm-label">Тип</label><select className="bm-select" {...register("type")}>{CONTENT_TYPES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></div>
          </div>
          <div className="bm-field"><label className="bm-label">Заглавие</label><input className="bm-input" {...register("title")} placeholder="напр. промо продукт" /><Err msg={errors.title?.message} /></div>
          <div className="bm-field"><label className="bm-label">Бележки</label><textarea className="bm-textarea" {...register("notes")} placeholder="Бриф, кука, бележки за сценарий…" /></div>
          <div className="bm-field"><label className="bm-label">Сценарий</label><textarea className="bm-textarea" style={{ minHeight: 160 }} {...register("script")} placeholder="Текстът на сценария (импортира се от .docx или се пише тук)…" /></div>
          <div className="bm-field"><label className="bm-label">Notion линк (по избор)</label><input className="bm-input" {...register("notion_url")} placeholder="https://notion.so/…" /></div>
          <label className="bm-checkbox"><input type="checkbox" {...register("published")} /> Публикувано</label>

          {editing && stages.length > 0 && (
            <div style={{ borderTop: "1px solid var(--bm-border)", paddingTop: "var(--bm-space-4)", display: "flex", flexDirection: "column", gap: "var(--bm-space-2)" }}>
              <div className="bm-label">Продукция — кой какво прави</div>
              {PRODUCTION_STAGES.map((st) => {
                const s = stages.find((x) => x.key === st.key) || { assignee: "", status: "todo" as const };
                return (
                  <div key={st.key} style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr", gap: "var(--bm-space-2)", alignItems: "center" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--bm-text-sm)" }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: st.dot }} />{st.label}</span>
                    {currentUser.isAdmin ? (
                      <select className="bm-select" style={{ minHeight: 32, fontSize: "var(--bm-text-xs)" }} value={s.assignee} onChange={(e) => setStageAssignee(editing.id, st.key, e.target.value)}>
                        <option value="">—</option>
                        {assigneeOpts.map((a) => <option key={a} value={a}>{a}</option>)}
                      </select>
                    ) : (
                      <span style={{ fontSize: "var(--bm-text-xs)", color: "var(--bm-text-muted)", display: "flex", alignItems: "center", gap: 6 }} title={team.find((m) => m.initials === s.assignee)?.name || ""}>
                        {s.assignee ? <span className="bm-avatar bm-avatar--sm" style={{ width: 20, height: 20, fontSize: 9 }}>{s.assignee}</span> : "—"}
                        {team.find((m) => m.initials === s.assignee)?.name || ""}
                      </span>
                    )}
                    {(currentUser.isAdmin || s.assignee === currentUser.initials) ? (
                      <select className="bm-select" style={{ minHeight: 32, fontSize: "var(--bm-text-xs)" }} value={s.status} onChange={(e) => setStageStatus(editing.id, st.key, e.target.value as "todo" | "doing" | "done" | "blocked")}>
                        <option value="todo">Чакащо</option>
                        <option value="doing">В процес</option>
                        <option value="done">Готово</option>
                        <option value="blocked">Блокирано</option>
                      </select>
                    ) : (
                      <span className={"bm-badge " + stageStatusMeta(s.status as "todo" | "doing" | "done" | "blocked").cls}>{stageStatusMeta(s.status as "todo" | "doing" | "done" | "blocked").label}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="bm-modal__footer" style={{ justifyContent: editing && currentUser.isAdmin ? "space-between" : "flex-end" }}>
          {editing && currentUser.isAdmin && (
            <button type="button" className="bm-btn bm-btn--ghost" onClick={() => openModal({ kind: "confirm", title: "Изтриване на съдържание?", message: `Изтрий „${editing.title}“? Действието е необратимо.`, confirmLabel: "Изтрий", onConfirm: () => deleteContentItem(editing.id) })}>Изтрий</button>
          )}
          <div style={{ display: "flex", gap: "var(--bm-space-3)" }}>
            <button type="button" className="bm-btn bm-btn--secondary" onClick={closeModal}>Отказ</button>
            <button type="submit" className="bm-btn bm-btn--primary" disabled={isSubmitting}>{editing ? "Запази" : "Добави"}</button>
          </div>
        </div>
      </form>
    </Shell>
  );
}

interface ImportRow { title: string; script: string; include: boolean }

function ScriptImportModal() {
  const { closeModal, clients, importScripts } = useStore();
  const [step, setStep] = useState<"upload" | "preview">("upload");
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [type, setType] = useState<ContentType>("reel");
  const [startStage, setStartStage] = useState("shoot");
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const analyze = async () => {
    if (!file) { setError("Избери .docx файл."); return; }
    setLoading(true); setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/import/scripts", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Грешка при анализа."); return; }
      setRows((data.videos as { title: string; script: string }[]).map((v) => ({ ...v, include: true })));
      setStep("preview");
    } catch {
      setError("Файлът не можа да бъде качен.");
    } finally {
      setLoading(false);
    }
  };

  const kept = rows.filter((r) => r.include && r.title.trim());
  const create = () => {
    if (!clientId || kept.length === 0) return;
    importScripts(clientId, type, startStage, kept.map((r) => ({ title: r.title.trim(), script: r.script })));
  };

  return (
    <Shell title="Импортирай сценарии от .docx" onClose={closeModal}>
      <div className="bm-modal__body" style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-4)" }}>
        {step === "upload" ? (
          <>
            <div className="bm-alert bm-alert--info">Всяко видео трябва да започва със заглавие (Heading) в документа. Текстът след заглавието става сценарий на това видео.</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--bm-space-4)" }}>
              <div className="bm-field"><label className="bm-label">Клиент</label><select className="bm-select" value={clientId} onChange={(e) => setClientId(e.target.value)}>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
              <div className="bm-field"><label className="bm-label">Тип съдържание</label><select className="bm-select" value={type} onChange={(e) => setType(e.target.value as ContentType)}>{CONTENT_TYPES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></div>
            </div>
            <div className="bm-field"><label className="bm-label">Започни от етап</label><select className="bm-select" value={startStage} onChange={(e) => setStartStage(e.target.value)}>{PRODUCTION_STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></div>
            <div className="bm-field"><label className="bm-label">Файл (.docx)</label><input className="bm-input" type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
            <Err msg={error} />
          </>
        ) : (
          <>
            <div className="bm-text-muted" style={{ fontSize: "var(--bm-text-sm)" }}>Намерени {rows.length} видеа. Махни отметката на тези, които не искаш да създаваш.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-3)", maxHeight: 360, overflowY: "auto" }}>
              {rows.map((r, i) => (
                <div key={i} style={{ border: "1px solid var(--bm-border)", borderRadius: "var(--bm-radius-md)", padding: "var(--bm-space-3)", display: "flex", flexDirection: "column", gap: "var(--bm-space-2)", opacity: r.include ? 1 : 0.5 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--bm-space-2)" }}>
                    <input type="checkbox" checked={r.include} onChange={(e) => setRows((list) => list.map((x, j) => (j === i ? { ...x, include: e.target.checked } : x)))} />
                    <input className="bm-input" style={{ fontWeight: 600 }} value={r.title} onChange={(e) => setRows((list) => list.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
                  </div>
                  <div className="bm-text-subtle" style={{ fontSize: "var(--bm-text-xs)", whiteSpace: "pre-wrap", maxHeight: 64, overflow: "hidden" }}>{r.script.slice(0, 280) || "(празен сценарий)"}{r.script.length > 280 ? "…" : ""}</div>
                </div>
              ))}
            </div>
            <Err msg={error} />
          </>
        )}
      </div>
      <div className="bm-modal__footer" style={{ justifyContent: "space-between" }}>
        {step === "preview"
          ? <button type="button" className="bm-btn bm-btn--ghost" onClick={() => setStep("upload")}>Назад</button>
          : <span />}
        <div style={{ display: "flex", gap: "var(--bm-space-3)" }}>
          <button type="button" className="bm-btn bm-btn--secondary" onClick={closeModal}>Отказ</button>
          {step === "upload"
            ? <button type="button" className="bm-btn bm-btn--primary" disabled={loading || !file} onClick={analyze}>{loading ? "Анализирам…" : "Анализирай файла"}</button>
            : <button type="button" className="bm-btn bm-btn--primary" disabled={kept.length === 0} onClick={create}>Създай {kept.length} видеа</button>}
        </div>
      </div>
    </Shell>
  );
}

function InvoiceModal() {
  const { modal, closeModal, addInvoice, updateInvoice, clients } = useStore();
  const editing = modal?.kind === "invoice" && modal.mode === "edit" ? modal.invoice : null;
  const presetClient = modal?.kind === "invoice" && modal.mode === "create" ? modal.clientId : undefined;
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<InvoiceForm>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: editing
      ? { client: editing.client, amount: editing.amount, status: editing.status, due: editing.due }
      : { client: presetClient ?? clients[0]?.id ?? "", amount: 0, status: "draft", due: "—" },
  });
  const onSubmit = (f: InvoiceForm) => (editing ? updateInvoice(editing.id, f) : addInvoice(f));

  return (
    <Shell title={editing ? "Редакция на фактура" : "Нова фактура"} onClose={closeModal}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="bm-modal__body" style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-4)" }}>
          <div className="bm-field"><label className="bm-label">Клиент</label><select className="bm-select" {...register("client")}>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><Err msg={errors.client?.message} /></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--bm-space-4)" }}>
            <div className="bm-field"><label className="bm-label">Сума (USD)</label><input className="bm-input" type="number" {...register("amount", { valueAsNumber: true })} placeholder="0" /><Err msg={errors.amount?.message} /></div>
            <div className="bm-field"><label className="bm-label">Падеж</label><input className="bm-input" {...register("due")} placeholder="15 юли" /></div>
          </div>
          <div className="bm-field"><label className="bm-label">Статус</label><select className="bm-select" {...register("status")}><option value="draft">Чернова</option><option value="pending">Чакаща</option><option value="overdue">Просрочена</option><option value="paid">Платена</option></select></div>
        </div>
        <div className="bm-modal__footer">
          <button type="button" className="bm-btn bm-btn--secondary" onClick={closeModal}>Отказ</button>
          <button type="submit" className="bm-btn bm-btn--primary" disabled={isSubmitting}>{editing ? "Запази" : "Създай фактура"}</button>
        </div>
      </form>
    </Shell>
  );
}
