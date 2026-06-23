"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import {
  clients as seedClients,
  invoices as seedInvoices,
  tasks as seedTasks,
  seedTeam,
  seedLeads,
  seedCampaigns,
  seedIntegrations,
  seedAdDrafts,
  seedSocialPosts,
  seedContentItems,
  defaultStages,
  PRODUCTION_STAGES,
  stageMeta,
  ROLE_LABELS,
  ONBOARDING_TASKS,
  CONTENT_PACKAGES,
  packageItemCount,
  contentTypeMeta,
  cyclePhaseMeta,
  monthKey,
  monthLabel,
  type AccessRole,
  type StageStatus,
  type Client,
  type Invoice,
  type Task,
  type TaskStatus,
  type TeamMember,
  type Comment,
  type Lead,
  type LeadStage,
  type Campaign,
  type Integration,
  type Provider,
  type AdDraft,
  type SocialPost,
  type ContentItem,
  type ContentType,
  type ContentCycle,
  type CyclePhase,
  type ClientConnection,
  type ChannelProvider,
} from "@/lib/data";
import type { ClientForm, TaskForm, InvoiceForm, LeadForm, CampaignForm, AdDraftForm, SocialPostForm, ContentItemForm, OnboardForm, CycleForm } from "@/lib/schemas";
import { createClient, supabaseConfigured } from "@/lib/supabase/client";

export interface CurrentUser { name: string; initials: string; role: string; isAdmin: boolean; level: AccessRole }
export interface ActivityItem { id: string; actor_name: string; actor_initials: string; action: string; created_at: string }
export interface NotificationItem { id: string; recipient: string; actor_name: string; actor_initials: string; body: string; link: string; entity_type: string; entity_id: string; read: boolean; created_at: string }

export type Modal =
  | { kind: "task"; mode: "create" }
  | { kind: "task"; mode: "edit"; task: Task }
  | { kind: "invoice"; mode: "create"; clientId?: string }
  | { kind: "invoice"; mode: "edit"; invoice: Invoice }
  | { kind: "client"; mode: "create" }
  | { kind: "client"; mode: "edit"; client: Client }
  | { kind: "lead"; mode: "create" }
  | { kind: "lead"; mode: "edit"; lead: Lead }
  | { kind: "onboard"; lead: Lead }
  | { kind: "campaign"; mode: "create"; clientId?: string }
  | { kind: "campaign"; mode: "edit"; campaign: Campaign }
  | { kind: "ad"; mode: "create" }
  | { kind: "ad"; mode: "edit"; ad: AdDraft }
  | { kind: "content"; mode: "create"; clientId: string; date: string }
  | { kind: "content"; mode: "edit"; item: ContentItem }
  | { kind: "importScripts" }
  | { kind: "cycle" }
  | { kind: "confirm"; title: string; message: string; confirmLabel: string; onConfirm: () => void }
  | null;

const DEFAULT_USER: CurrentUser = { name: "Georgi D.", initials: "GD", role: "Администратор", isAdmin: true, level: "admin" };

interface Store {
  clients: Client[];
  invoices: Invoice[];
  tasks: Task[];
  activity: ActivityItem[];
  notifications: NotificationItem[];
  team: TeamMember[];
  comments: Comment[];
  leads: Lead[];
  campaigns: Campaign[];
  integrations: Integration[];
  adDrafts: AdDraft[];
  socialPosts: SocialPost[];
  contentItems: ContentItem[];
  cycles: ContentCycle[];
  clientConnections: ClientConnection[];
  currentUser: CurrentUser;
  loading: boolean;
  usingMock: boolean;
  signOut: () => Promise<void>;
  toggleIntegration: (provider: Provider) => void;
  addAdDraft: (f: AdDraftForm) => void;
  updateAdDraft: (id: string, f: AdDraftForm) => void;
  deleteAdDraft: (id: string) => void;
  publishAd: (id: string) => void;
  addSocialPost: (f: SocialPostForm, status: "draft" | "scheduled") => void;
  updateSocialPost: (id: string, f: SocialPostForm) => void;
  deleteSocialPost: (id: string) => void;
  publishSocialPost: (id: string) => void;
  addContentItem: (clientId: string, f: ContentItemForm) => void;
  updateContentItem: (id: string, f: ContentItemForm) => void;
  deleteContentItem: (id: string) => void;
  importScripts: (clientId: string, type: ContentType, startStage: string, videos: { title: string; script: string }[], cycleId?: string) => void;
  startCycle: (clientId: string, month: string, targetCount: number) => void;
  advanceCycle: (cycleId: string, toPhase: CyclePhase) => void;
  scheduleContent: (id: string, date: string | null) => void;
  setClientConnection: (clientId: string, provider: ChannelProvider, connected: boolean) => void;
  advanceStage: (itemId: string, toStage: string) => void;
  setStageAssignee: (itemId: string, stageKey: string, assignee: string) => void;
  setStageStatus: (itemId: string, stageKey: string, status: StageStatus) => void;
  updateMemberRoles: (memberId: string, roles: string[]) => void;
  updateMemberRole: (memberId: string, role: AccessRole) => void;
  addComment: (entityType: "client" | "task", entityId: string, body: string) => void;
  notify: (recipient: string, body: string, opts?: { link?: string; entity_type?: string; entity_id?: string }) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  registerPush: (sub: PushSubscriptionJSON) => void;
  addLead: (f: LeadForm) => void;
  updateLead: (id: string, f: LeadForm) => void;
  deleteLead: (id: string) => void;
  moveLead: (id: string, stage: LeadStage) => void;
  onboardLead: (leadId: string, f: OnboardForm) => void;
  addCampaign: (f: CampaignForm) => void;
  updateCampaign: (id: string, f: CampaignForm) => void;
  deleteCampaign: (id: string) => void;
  logTime: (taskId: string, seconds: number) => void;
  modal: Modal;
  openModal: (m: Modal) => void;
  closeModal: () => void;
  // clients
  addClient: (f: ClientForm) => void;
  updateClient: (id: string, f: ClientForm) => void;
  deleteClient: (id: string) => void;
  // invoices
  addInvoice: (f: InvoiceForm) => void;
  updateInvoice: (id: string, f: InvoiceForm) => void;
  deleteInvoice: (id: string) => void;
  markPaid: (id: string) => void;
  // tasks
  addTask: (f: TaskForm) => void;
  updateTask: (id: string, f: TaskForm) => void;
  deleteTask: (id: string) => void;
  moveTask: (id: string, status: TaskStatus) => void;
  toggleDone: (id: string) => void;
}

const StoreContext = createContext<Store | null>(null);

type InvoiceRow = Omit<Invoice, "client"> & { client_id: string };
type TaskRow = Omit<Task, "client"> & { client_id: string };

const initialsFrom = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (name.trim().slice(0, 2) || "?").toUpperCase();
};

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [clients, setClients] = useState<Client[]>(seedClients);
  const [invoices, setInvoices] = useState<Invoice[]>(seedInvoices);
  const [tasks, setTasks] = useState<Task[]>(seedTasks);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [team, setTeam] = useState<TeamMember[]>(seedTeam);
  const [comments, setComments] = useState<Comment[]>([]);
  const [leads, setLeads] = useState<Lead[]>(seedLeads);
  const [campaigns, setCampaigns] = useState<Campaign[]>(seedCampaigns);
  const [integrations, setIntegrations] = useState<Integration[]>(seedIntegrations);
  const [adDrafts, setAdDrafts] = useState<AdDraft[]>(seedAdDrafts);
  const [socialPosts, setSocialPosts] = useState<SocialPost[]>(seedSocialPosts);
  const [contentItems, setContentItems] = useState<ContentItem[]>(seedContentItems);
  const [cycles, setCycles] = useState<ContentCycle[]>([]);
  const [clientConnections, setClientConnections] = useState<ClientConnection[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser>(DEFAULT_USER);
  const [loading, setLoading] = useState(supabaseConfigured);
  const [modal, setModal] = useState<Modal>(null);

  useEffect(() => {
    if (!supabaseConfigured) return;
    let cancelled = false;
    (async () => {
      try {
        const sb = createClient();
        const [c, iv, t, act, tm, cm, ld, cmp, intg, ad, sp, ci, cc, auth, cyc] = await Promise.all([
          sb.from("clients").select("*").order("created_at"),
          sb.from("invoices").select("*").order("created_at"),
          sb.from("tasks").select("*").order("created_at"),
          sb.from("activity").select("*").order("created_at", { ascending: false }).limit(20),
          sb.from("profiles").select("id, name, initials, role, roles").order("created_at"),
          sb.from("comments").select("*").order("created_at"),
          sb.from("leads").select("*").order("created_at"),
          sb.from("campaigns").select("*").order("created_at"),
          sb.from("integrations").select("*"),
          sb.from("ad_drafts").select("*").order("created_at"),
          sb.from("social_posts").select("*").order("created_at"),
          sb.from("content_items").select("*").order("date"),
          sb.from("client_connections").select("*"),
          sb.auth.getUser(),
          sb.from("content_cycles").select("*").order("created_at", { ascending: false }),
        ]);
        if (cancelled) return;
        if (c.data) setClients(c.data as Client[]);
        if (iv.data) setInvoices((iv.data as InvoiceRow[]).map(({ client_id, ...r }) => ({ ...r, client: client_id })));
        if (t.data) setTasks((t.data as TaskRow[]).map(({ client_id, ...r }) => ({ ...r, client: client_id })));
        if (act.data) setActivity(act.data as ActivityItem[]);
        if (tm.data && tm.data.length) setTeam(tm.data as TeamMember[]);
        if (cm.data) setComments(cm.data as Comment[]);
        if (ld.data) setLeads(ld.data as Lead[]);
        if (cmp.data) setCampaigns((cmp.data as (Omit<Campaign, "client"> & { client_id: string })[]).map(({ client_id, ...r }) => ({ ...r, client: client_id })));
        if (intg.data && intg.data.length) setIntegrations(intg.data as Integration[]);
        if (ad.data) setAdDrafts((ad.data as (Omit<AdDraft, "client"> & { client_id: string | null })[]).map(({ client_id, ...r }) => ({ ...r, client: client_id })));
        if (sp.data) setSocialPosts(sp.data as SocialPost[]);
        if (ci.data) setContentItems((ci.data as (Omit<ContentItem, "client"> & { client_id: string })[]).map(({ client_id, ...r }) => ({ ...r, client: client_id })));
        if (cyc.data) setCycles((cyc.data as (Omit<ContentCycle, "client"> & { client_id: string })[]).map(({ client_id, ...r }) => ({ ...r, client: client_id })));
        if (cc.data) setClientConnections(cc.data as ClientConnection[]);
        const uid = auth.data.user?.id;
        if (uid) {
          const me = (tm.data as (TeamMember & { role?: string })[] | null)?.find((p) => p.id === uid);
          if (me && !cancelled) {
            const lvl: AccessRole = me.role === "admin" ? "admin" : me.role === "manager" ? "manager" : "worker";
            setCurrentUser({
              name: me.name || auth.data.user?.email || "User",
              initials: (me.initials || "U").toUpperCase(),
              role: ROLE_LABELS[lvl],
              isAdmin: lvl === "admin",
              level: lvl,
            });
          }
        }
      } catch (e) {
        console.error("[BrandMotion] Supabase load failed, keeping mock data:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const sb = () => (supabaseConfigured ? createClient() : null);

  // Per-user notifications: load the recipient's recent alerts and subscribe to
  // realtime inserts so the bell updates live. Re-runs when the signed-in user
  // resolves (initials change from the default to the real profile).
  useEffect(() => {
    if (!supabaseConfigured) return;
    const me = currentUser.initials;
    if (!me) return;
    const client = createClient();
    let cancelled = false;
    client.from("notifications").select("*").eq("recipient", me).order("created_at", { ascending: false }).limit(50).then(({ data }) => {
      if (data && !cancelled) setNotifications(data as NotificationItem[]);
    });
    const ch = client
      .channel("notif-" + me)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `recipient=eq.${me}` }, (payload) => {
        const n = payload.new as NotificationItem;
        setNotifications((list) => (list.some((x) => x.id === n.id) ? list : [n, ...list]));
      })
      .subscribe();
    return () => { cancelled = true; client.removeChannel(ch); };
  }, [currentUser.initials]);

  const logActivity = useCallback((action: string) => {
    const item: ActivityItem = {
      id: "a-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
      actor_name: currentUser.name, actor_initials: currentUser.initials,
      action, created_at: new Date().toISOString(),
    };
    setActivity((list) => [item, ...list].slice(0, 20));
    sb()?.from("activity").insert({ actor_name: item.actor_name, actor_initials: item.actor_initials, action }).then(({ error }) => {
      if (error) console.error("[BrandMotion] logActivity failed:", error);
    });
  }, [currentUser]);

  const addComment = useCallback((entityType: "client" | "task", entityId: string, body: string) => {
    const text = body.trim();
    if (!text) return;
    const item: Comment = {
      id: "c-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
      entity_type: entityType, entity_id: entityId,
      author_name: currentUser.name, author_initials: currentUser.initials,
      body: text, created_at: new Date().toISOString(),
    };
    setComments((list) => [...list, item]);
    sb()?.from("comments").insert({ entity_type: entityType, entity_id: entityId, author_name: item.author_name, author_initials: item.author_initials, body: text }).then(({ error }) => {
      if (error) console.error("[BrandMotion] addComment failed:", error);
    });
  }, [currentUser]);

  // ---- Notifications ----
  // Create a "this needs you" alert for another team member. Skips self and
  // empty recipients. The recipient receives it live via their realtime channel;
  // a best-effort web push fires too (a no-op without VAPID keys / subscription).
  const notify = useCallback((recipient: string, body: string, opts: { link?: string; entity_type?: string; entity_id?: string } = {}) => {
    if (!recipient || recipient === currentUser.initials) return;
    const row = {
      id: "n-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
      recipient, actor_name: currentUser.name, actor_initials: currentUser.initials,
      body, link: opts.link || "", entity_type: opts.entity_type || "", entity_id: opts.entity_id || "", read: false,
    };
    sb()?.from("notifications").insert(row).then(({ error }) => error && console.error("[BrandMotion] notify failed:", error));
    if (supabaseConfigured) {
      fetch("/api/push/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recipient, title: "BrandMotion", body, link: opts.link || "" }) }).catch(() => {});
    }
  }, [currentUser]);

  const markNotificationRead = useCallback((id: string) => {
    setNotifications((list) => list.map((n) => (n.id === id ? { ...n, read: true } : n)));
    sb()?.from("notifications").update({ read: true }).eq("id", id).then(({ error }) => error && console.error("[BrandMotion] markNotificationRead failed:", error));
  }, []);

  const markAllNotificationsRead = useCallback(() => {
    setNotifications((list) => list.map((n) => ({ ...n, read: true })));
    sb()?.from("notifications").update({ read: true }).eq("recipient", currentUser.initials).eq("read", false).then(({ error }) => error && console.error("[BrandMotion] markAllNotificationsRead failed:", error));
  }, [currentUser.initials]);

  const registerPush = useCallback((sub: PushSubscriptionJSON) => {
    const endpoint = sub.endpoint;
    const keys = sub.keys;
    if (!endpoint || !keys?.p256dh || !keys?.auth) return;
    const row = { id: "ps-" + endpoint.slice(-32).replace(/[^a-zA-Z0-9]/g, ""), recipient: currentUser.initials, endpoint, p256dh: keys.p256dh, auth: keys.auth };
    sb()?.from("push_subscriptions").upsert(row, { onConflict: "endpoint" }).then(({ error }) => error && console.error("[BrandMotion] registerPush failed:", error));
  }, [currentUser.initials]);

  // ---- Leads (pipeline) ----
  const addLead = useCallback((f: LeadForm) => {
    const row = { id: "l-" + Date.now(), name: f.name, contact: f.contact, value: f.value, stage: f.stage, owner: f.owner };
    setLeads((list) => [...list, row]);
    sb()?.from("leads").insert(row).then(({ error }) => error && console.error("[BrandMotion] addLead failed:", error));
    logActivity(`добави клиент-възможност ${f.name}`);
    setModal(null);
  }, [logActivity]);

  const updateLead = useCallback((id: string, f: LeadForm) => {
    const patch = { name: f.name, contact: f.contact, value: f.value, stage: f.stage, owner: f.owner };
    setLeads((list) => list.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    sb()?.from("leads").update(patch).eq("id", id).then(({ error }) => error && console.error("[BrandMotion] updateLead failed:", error));
    setModal(null);
  }, []);

  const deleteLead = useCallback((id: string) => {
    setLeads((list) => list.filter((l) => l.id !== id));
    sb()?.from("leads").delete().eq("id", id).then(({ error }) => error && console.error("[BrandMotion] deleteLead failed:", error));
    setModal(null);
  }, []);

  const moveLead = useCallback((id: string, stage: LeadStage) => {
    let lead: Lead | undefined;
    setLeads((list) => list.map((l) => { if (l.id === id) lead = l; return l.id === id ? { ...l, stage } : l; }));
    sb()?.from("leads").update({ stage }).eq("id", id).then(({ error }) => error && console.error("[BrandMotion] moveLead failed:", error));
    if (stage === "won" && lead) {
      logActivity(`спечели сделка ${lead.name}`);
      // Won + not yet converted → open the onboarding confirm gate.
      if (!lead.client_id) setModal({ kind: "onboard", lead: { ...lead, stage: "won" } });
    }
  }, [logActivity]);

  // ---- Monthly content cycle ----
  // Open a client's cycle for a month at the 'ideas' phase and ping the
  // strategist to start. This replaces dumping empty cards on the board.
  const startCycle = useCallback((clientId: string, month: string, targetCount: number) => {
    const client = clients.find((c) => c.id === clientId);
    const id = `cy-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    const row = { id, client_id: clientId, month, target_count: targetCount, phase: "ideas" as CyclePhase };
    setCycles((list) => [{ id, client: clientId, month, target_count: targetCount, phase: "ideas" }, ...list]);
    sb()?.from("content_cycles").insert(row).then(({ error }) => error && console.error("[BrandMotion] startCycle failed:", error));
    const strategist = team.find((m) => (m.roles || []).includes("strategy"))?.initials || client?.owner || "";
    if (strategist) notify(strategist, `Започни идеи и сценарии за ${client?.name || clientId} (${monthLabel(month)}): ${targetCount} видеа`, { entity_type: "cycle", entity_id: id });
    logActivity(`стартира месечен цикъл за ${client?.name || clientId} (${monthLabel(month)})`);
  }, [clients, team, notify, logActivity]);

  // Move a cycle to a new phase and notify the role that owns it.
  const advanceCycle = useCallback((cycleId: string, toPhase: CyclePhase) => {
    let clientId = "";
    setCycles((list) => list.map((cy) => { if (cy.id === cycleId) clientId = cy.client; return cy.id === cycleId ? { ...cy, phase: toPhase } : cy; }));
    sb()?.from("content_cycles").update({ phase: toPhase }).eq("id", cycleId).then(({ error }) => error && console.error("[BrandMotion] advanceCycle failed:", error));
    const client = clients.find((c) => c.id === clientId);
    const role = cyclePhaseMeta(toPhase).role;
    const owner = role ? (team.find((m) => (m.roles || []).includes(role))?.initials || "") : "";
    if (owner) notify(owner, `${client?.name || clientId}: време е за „${cyclePhaseMeta(toPhase).label}“`, { entity_type: "cycle", entity_id: cycleId });
    logActivity(`придвижи цикъл на ${client?.name || clientId} към „${cyclePhaseMeta(toPhase).label}“`);
  }, [clients, team, notify, logActivity]);

  // Convert a won lead into a fully set-up client: client record + brand profile
  // stub + onboarding checklist (tasks) + this month's content cycle (no empty
  // cards — videos appear when scripts are imported). Idempotent via client_id.
  const onboardLead = useCallback((leadId: string, f: OnboardForm) => {
    const lead = leads.find((l) => l.id === leadId);
    const pkg = CONTENT_PACKAGES.find((p) => p.id === f.packageId) || CONTENT_PACKAGES[0];
    const slug = f.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "client";
    const id = clients.some((c) => c.id === slug) ? slug + "-" + (Date.now() % 10000) : slug;
    const now = Date.now();

    // 1. Client with an empty brand profile (filled via the checklist).
    const clientRow = { id, name: f.name, initials: initialsFrom(f.name), industry: f.industry, status: "Onboarding" as const, mrr: f.mrr, owner: f.owner, health: "good" as const, note: lead?.contact ? `Контакт: ${lead.contact}` : "", editor: f.editor, analysis_status: "not_started" as const, analysis_notes: "", brand_voice: "", target_audience: "", brand_assets_url: "" };
    setClients((list) => [...list, clientRow as Client]);
    sb()?.from("clients").insert(clientRow).then(({ error }) => error && console.error("[BrandMotion] onboard client failed:", error));

    // 2. Onboarding checklist as tasks, assigned to the account owner.
    const taskRows = ONBOARDING_TASKS.map((t, i) => ({ id: `t-${now}-${i}`, title: t.title, client_id: id, status: "todo" as TaskStatus, priority: t.priority, assignee: f.owner || currentUser.initials, due: "До 7 дни", progress: 0 }));
    setTasks((list) => [...list, ...taskRows.map(({ client_id, ...r }) => ({ ...r, client: client_id }))]);
    sb()?.from("tasks").insert(taskRows).then(({ error }) => error && console.error("[BrandMotion] onboard tasks failed:", error));

    // 3. Open this month's content cycle at 'ideas' (notifies the strategist to
    //    start). No empty cards — the videos appear when scripts are imported.
    startCycle(id, monthKey(), packageItemCount(pkg));

    // 4. Link the lead to its new client (idempotency guard).
    setLeads((list) => list.map((l) => (l.id === leadId ? { ...l, stage: "won", client_id: id } : l)));
    sb()?.from("leads").update({ stage: "won", client_id: id }).eq("id", leadId).then(({ error }) => error && console.error("[BrandMotion] onboard link failed:", error));

    logActivity(`включи клиент ${f.name} · ${taskRows.length} задачи`);
    setModal(null);
  }, [leads, clients, team, currentUser.initials, startCycle, logActivity]);

  // ---- Campaigns ----
  const addCampaign = useCallback((f: CampaignForm) => {
    const base = f.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "campaign";
    setCampaigns((list) => {
      const id = list.some((c) => c.id === base) ? base + "-" + (Date.now() % 10000) : base;
      const row = { id, name: f.name, client_id: f.client, status: f.status, channel: f.channel, budget: f.budget, starts: f.starts, ends: f.ends };
      sb()?.from("campaigns").insert(row).then(({ error }) => error && console.error("[BrandMotion] addCampaign failed:", error));
      return [...list, { id, name: f.name, client: f.client, status: f.status, channel: f.channel, budget: f.budget, starts: f.starts, ends: f.ends }];
    });
    logActivity(`стартира кампания ${f.name}`);
    setModal(null);
  }, [logActivity]);

  const updateCampaign = useCallback((id: string, f: CampaignForm) => {
    const patch = { name: f.name, client_id: f.client, status: f.status, channel: f.channel, budget: f.budget, starts: f.starts, ends: f.ends };
    setCampaigns((list) => list.map((c) => (c.id === id ? { ...c, name: f.name, client: f.client, status: f.status, channel: f.channel, budget: f.budget, starts: f.starts, ends: f.ends } : c)));
    sb()?.from("campaigns").update(patch).eq("id", id).then(({ error }) => error && console.error("[BrandMotion] updateCampaign failed:", error));
    setModal(null);
  }, []);

  const deleteCampaign = useCallback((id: string) => {
    setCampaigns((list) => list.filter((c) => c.id !== id));
    sb()?.from("campaigns").delete().eq("id", id).then(({ error }) => error && console.error("[BrandMotion] deleteCampaign failed:", error));
    setModal(null);
  }, []);

  const logTime = useCallback((taskId: string, seconds: number) => {
    if (seconds <= 0) return;
    let total = 0;
    setTasks((list) => list.map((t) => {
      if (t.id !== taskId) return t;
      total = (t.time_logged || 0) + seconds;
      return { ...t, time_logged: total };
    }));
    sb()?.from("tasks").update({ time_logged: total }).eq("id", taskId).then(({ error }) => error && console.error("[BrandMotion] logTime failed:", error));
  }, []);

  // ---- Phase 5: integrations ----
  const toggleIntegration = useCallback((provider: Provider) => {
    let nowConnected = false;
    setIntegrations((list) => list.map((i) => {
      if (i.provider !== provider) return i;
      nowConnected = !i.connected;
      return { ...i, connected: nowConnected, account_label: nowConnected ? "Demo account" : "" };
    }));
    sb()?.from("integrations").update({ connected: nowConnected, account_label: nowConnected ? "Demo account" : "", updated_at: new Date().toISOString() }).eq("provider", provider).then(({ error }) => error && console.error("[BrandMotion] toggleIntegration failed:", error));
  }, []);

  const addAdDraft = useCallback((f: AdDraftForm) => {
    const row = { id: "ad-" + Date.now(), client_id: f.client || null, name: f.name, objective: f.objective, budget: f.budget, audience: f.audience, primary_text: f.primary_text, headline: f.headline, status: "draft" as const };
    setAdDrafts((list) => [{ id: row.id, client: row.client_id, name: f.name, objective: f.objective, budget: f.budget, audience: f.audience, primary_text: f.primary_text, headline: f.headline, status: "draft" }, ...list]);
    sb()?.from("ad_drafts").insert(row).then(({ error }) => error && console.error("[BrandMotion] addAdDraft failed:", error));
    logActivity(`създаде рекламна чернова ${f.name}`);
    setModal(null);
  }, [logActivity]);

  const updateAdDraft = useCallback((id: string, f: AdDraftForm) => {
    const patch = { client_id: f.client || null, name: f.name, objective: f.objective, budget: f.budget, audience: f.audience, primary_text: f.primary_text, headline: f.headline };
    setAdDrafts((list) => list.map((a) => (a.id === id ? { ...a, client: f.client || null, name: f.name, objective: f.objective, budget: f.budget, audience: f.audience, primary_text: f.primary_text, headline: f.headline } : a)));
    sb()?.from("ad_drafts").update(patch).eq("id", id).then(({ error }) => error && console.error("[BrandMotion] updateAdDraft failed:", error));
    setModal(null);
  }, []);

  const deleteAdDraft = useCallback((id: string) => {
    setAdDrafts((list) => list.filter((a) => a.id !== id));
    sb()?.from("ad_drafts").delete().eq("id", id).then(({ error }) => error && console.error("[BrandMotion] deleteAdDraft failed:", error));
    setModal(null);
  }, []);

  const publishAd = useCallback((id: string) => {
    // SIMULATED: a real publish calls the Meta Marketing API server-side with the
    // connected account's access token. Here we just flip status to 'published'.
    let name = "";
    setAdDrafts((list) => list.map((a) => { if (a.id === id) name = a.name; return a.id === id ? { ...a, status: "published" } : a; }));
    sb()?.from("ad_drafts").update({ status: "published" }).eq("id", id).then(({ error }) => error && console.error("[BrandMotion] publishAd failed:", error));
    if (name) logActivity(`публикува реклама ${name} в Meta`);
    setModal(null);
  }, [logActivity]);

  const addSocialPost = useCallback((f: SocialPostForm, status: "draft" | "scheduled") => {
    const row = { id: "sp-" + Date.now(), caption: f.caption, media_url: f.media_url, platforms: f.platforms, scheduled_for: f.scheduled_for, status };
    setSocialPosts((list) => [{ ...row }, ...list]);
    sb()?.from("social_posts").insert(row).then(({ error }) => error && console.error("[BrandMotion] addSocialPost failed:", error));
    logActivity(status === "scheduled" ? `насрочи публикация за ${f.platforms.join(", ")}` : "запази чернова на публикация");
  }, [logActivity]);

  const updateSocialPost = useCallback((id: string, f: SocialPostForm) => {
    setSocialPosts((list) => list.map((p) => (p.id === id ? { ...p, ...f } : p)));
    sb()?.from("social_posts").update({ caption: f.caption, media_url: f.media_url, platforms: f.platforms, scheduled_for: f.scheduled_for }).eq("id", id).then(({ error }) => error && console.error("[BrandMotion] updateSocialPost failed:", error));
  }, []);

  const deleteSocialPost = useCallback((id: string) => {
    setSocialPosts((list) => list.filter((p) => p.id !== id));
    sb()?.from("social_posts").delete().eq("id", id).then(({ error }) => error && console.error("[BrandMotion] deleteSocialPost failed:", error));
  }, []);

  const publishSocialPost = useCallback((id: string) => {
    // SIMULATED: a real publish uploads media + posts via each platform's API.
    let plats: string[] = [];
    setSocialPosts((list) => list.map((p) => { if (p.id === id) plats = p.platforms; return p.id === id ? { ...p, status: "published" } : p; }));
    sb()?.from("social_posts").update({ status: "published" }).eq("id", id).then(({ error }) => error && console.error("[BrandMotion] publishSocialPost failed:", error));
    logActivity(`публикува в ${plats.join(", ")}`);
  }, [logActivity]);

  // ---- Content calendar ----
  const addContentItem = useCallback((clientId: string, f: ContentItemForm) => {
    const client = clients.find((c) => c.id === clientId);
    const stages = defaultStages(team, client?.editor || "", currentUser.initials);
    const date = f.date || null;
    const row = { id: "ct-" + Date.now(), client_id: clientId, date, type: f.type, title: f.title, notes: f.notes, script: f.script, notion_url: f.notion_url, published: f.published, current_stage: "strategy", stages };
    setContentItems((list) => [...list, { id: row.id, client: clientId, date, type: f.type, title: f.title, notes: f.notes, script: f.script, notion_url: f.notion_url, published: f.published, current_stage: "strategy", stages }]);
    sb()?.from("content_items").insert(row).then(({ error }) => error && console.error("[BrandMotion] addContentItem failed:", error));
    logActivity(`планира съдържание „${f.title}“`);
    setModal(null);
  }, [clients, team, currentUser.initials, logActivity]);

  // Import many videos from a parsed .docx: each becomes a content item placed at
  // `startStage` with the prior stages pre-marked done (strategy + script were
  // written in the doc). Reuses defaultStages so the camera/editor owners are
  // auto-assigned — i.e. the work is distributed to the team on confirm.
  const importScripts = useCallback((clientId: string, type: ContentType, startStage: string, videos: { title: string; script: string }[], cycleId?: string) => {
    if (!videos.length) return;
    const client = clients.find((c) => c.id === clientId);
    const order = PRODUCTION_STAGES.map((s) => s.key);
    const ti = Math.max(0, order.indexOf(startStage));
    const base = Date.now();
    const rows = videos.map((v, i) => {
      const stages = defaultStages(team, client?.editor || "", currentUser.initials).map((s) => {
        const idx = order.indexOf(s.key);
        return { ...s, status: (idx < ti ? "done" : idx === ti ? "doing" : "todo") as StageStatus };
      });
      return { id: `ct-${base}-${i}`, client_id: clientId, date: null as string | null, type, title: v.title, notes: "", script: v.script, cycle_id: cycleId || null, notion_url: "", published: false, current_stage: order[ti], stages };
    });
    setContentItems((list) => [...list, ...rows.map(({ client_id, ...r }) => ({ ...r, client: client_id }))]);
    sb()?.from("content_items").insert(rows).then(({ error }) => error && console.error("[BrandMotion] importScripts failed:", error));
    logActivity(`импортира ${videos.length} сценария за ${client?.name || clientId}`);
    // Scripts are in → flip this client's open cycle into production.
    if (cycleId) advanceCycle(cycleId, "production");
    setModal(null);
  }, [clients, team, currentUser.initials, advanceCycle, logActivity]);

  // ---- Production pipeline ----
  const persistItem = (id: string, patch: Record<string, unknown>) =>
    sb()?.from("content_items").update(patch).eq("id", id).then(({ error }) => error && console.error("[BrandMotion] content update failed:", error));

  const advanceStage = useCallback((itemId: string, toStage: string) => {
    const order = PRODUCTION_STAGES.map((s) => s.key);
    const ti = order.indexOf(toStage);
    let nextStages: { key: string; assignee: string; status: StageStatus }[] = [];
    let title = "";
    setContentItems((list) => list.map((c) => {
      if (c.id !== itemId) return c;
      title = c.title;
      const existing = c.stages || defaultStages(team, "", currentUser.initials);
      nextStages = existing.map((s) => {
        const idx = order.indexOf(s.key);
        return { ...s, status: idx < ti ? "done" : idx === ti ? "doing" : "todo" };
      });
      return { ...c, current_stage: toStage, stages: nextStages };
    }));
    persistItem(itemId, { current_stage: toStage, stages: nextStages });
    // Hand-off: tell whoever owns the stage it just moved into.
    const owner = nextStages.find((s) => s.key === toStage)?.assignee;
    if (owner) notify(owner, `Видео „${title || "(без заглавие)"}“ чака твоя етап: ${stageMeta(toStage).label}`, { entity_type: "content", entity_id: itemId, link: itemId });
  }, [team, currentUser.initials, notify]);

  const setStageAssignee = useCallback((itemId: string, stageKey: string, assignee: string) => {
    let next: unknown = null;
    setContentItems((list) => list.map((c) => {
      if (c.id !== itemId) return c;
      const stages = (c.stages || []).map((s) => (s.key === stageKey ? { ...s, assignee } : s));
      next = stages;
      return { ...c, stages };
    }));
    if (next) persistItem(itemId, { stages: next });
  }, []);

  const setStageStatus = useCallback((itemId: string, stageKey: string, status: StageStatus) => {
    const order = PRODUCTION_STAGES.map((s) => s.key);
    let patch: Record<string, unknown> | null = null;
    let handoff: { to: string; stageKey: string; title: string } | null = null;
    setContentItems((list) => list.map((c) => {
      if (c.id !== itemId) return c;
      const cur = c.current_stage || order[0];
      // Auto-advance: marking the CURRENT stage "done" moves the video forward.
      if (status === "done" && stageKey === cur) {
        const idx = order.indexOf(cur);
        const nextKey = idx < order.length - 1 ? order[idx + 1] : cur;
        const isLast = idx >= order.length - 1;
        const ti = order.indexOf(nextKey);
        const stages = (c.stages || []).map((s) => {
          const i = order.indexOf(s.key);
          if (isLast) return { ...s, status: i <= idx ? "done" as StageStatus : s.status };
          return { ...s, status: i < ti ? "done" as StageStatus : i === ti ? "doing" as StageStatus : "todo" as StageStatus };
        });
        const published = isLast ? true : c.published;
        patch = { current_stage: nextKey, stages, published };
        if (!isLast) {
          const to = stages.find((s) => s.key === nextKey)?.assignee || "";
          if (to) handoff = { to, stageKey: nextKey, title: c.title };
        }
        return { ...c, current_stage: nextKey, stages, published };
      }
      // Otherwise just set this stage's status.
      const stages = (c.stages || []).map((s) => (s.key === stageKey ? { ...s, status } : s));
      patch = { stages };
      return { ...c, stages };
    }));
    if (patch) persistItem(itemId, patch);
    if (handoff) {
      const h = handoff as { to: string; stageKey: string; title: string };
      notify(h.to, `Видео „${h.title || "(без заглавие)"}“ чака твоя етап: ${stageMeta(h.stageKey).label}`, { entity_type: "content", entity_id: itemId, link: itemId });
    }
  }, [notify]);

  const updateMemberRoles = useCallback((memberId: string, roles: string[]) => {
    setTeam((list) => list.map((m) => (m.id === memberId ? { ...m, roles } : m)));
    sb()?.from("profiles").update({ roles }).eq("id", memberId).then(({ error }) => error && console.error("[BrandMotion] updateMemberRoles failed:", error));
  }, []);

  const updateMemberRole = useCallback((memberId: string, role: AccessRole) => {
    setTeam((list) => list.map((m) => (m.id === memberId ? { ...m, role } : m)));
    sb()?.from("profiles").update({ role }).eq("id", memberId).then(({ error }) => error && console.error("[BrandMotion] updateMemberRole failed:", error));
  }, []);

  const updateContentItem = useCallback((id: string, f: ContentItemForm) => {
    const date = f.date || null;
    setContentItems((list) => list.map((c) => (c.id === id ? { ...c, date, type: f.type, title: f.title, notes: f.notes, script: f.script, notion_url: f.notion_url, published: f.published } : c)));
    sb()?.from("content_items").update({ date, type: f.type, title: f.title, notes: f.notes, script: f.script, notion_url: f.notion_url, published: f.published }).eq("id", id).then(({ error }) => error && console.error("[BrandMotion] updateContentItem failed:", error));
    setModal(null);
  }, []);

  // SIMULATED connect/disconnect until real OAuth is wired (see /api/oauth).
  const setClientConnection = useCallback((clientId: string, provider: ChannelProvider, connected: boolean) => {
    const label = connected ? "Демо акаунт" : "";
    setClientConnections((list) => {
      const exists = list.some((x) => x.client_id === clientId && x.provider === provider);
      return exists
        ? list.map((x) => (x.client_id === clientId && x.provider === provider ? { ...x, connected, account_label: label } : x))
        : [...list, { client_id: clientId, provider, connected, account_label: label }];
    });
    sb()?.from("client_connections").upsert({ client_id: clientId, provider, connected, account_label: label, updated_at: new Date().toISOString() }).then(({ error }) => error && console.error("[BrandMotion] setClientConnection failed:", error));
  }, []);

  const scheduleContent = useCallback((id: string, date: string | null) => {
    setContentItems((list) => list.map((c) => (c.id === id ? { ...c, date } : c)));
    sb()?.from("content_items").update({ date }).eq("id", id).then(({ error }) => error && console.error("[BrandMotion] scheduleContent failed:", error));
  }, []);

  const deleteContentItem = useCallback((id: string) => {
    setContentItems((list) => list.filter((c) => c.id !== id));
    sb()?.from("content_items").delete().eq("id", id).then(({ error }) => error && console.error("[BrandMotion] deleteContentItem failed:", error));
    setModal(null);
  }, []);

  const signOut = useCallback(async () => {
    if (supabaseConfigured) { try { await createClient().auth.signOut(); } catch (e) { console.error(e); } }
    window.location.href = "/login";
  }, []);

  // ---- Clients ----
  const addClient = useCallback((f: ClientForm) => {
    const base = f.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "client";
    setClients((list) => {
      const id = list.some((c) => c.id === base) ? base + "-" + (Date.now() % 10000) : base;
      const row = { id, name: f.name, initials: initialsFrom(f.name), industry: f.industry, status: f.status, mrr: f.mrr, owner: f.owner, health: f.health, note: f.note, editor: f.editor, analysis_status: f.analysis_status, analysis_notes: f.analysis_notes, brand_voice: f.brand_voice, target_audience: f.target_audience, brand_assets_url: f.brand_assets_url };
      sb()?.from("clients").insert(row).then(({ error }) => error && console.error("[BrandMotion] addClient failed:", error));
      return [...list, row as Client];
    });
    logActivity(`добави клиент ${f.name}`);
    setModal(null);
  }, [logActivity]);

  const updateClient = useCallback((id: string, f: ClientForm) => {
    const patch = { name: f.name, initials: initialsFrom(f.name), industry: f.industry, status: f.status, mrr: f.mrr, owner: f.owner, health: f.health, note: f.note, editor: f.editor, analysis_status: f.analysis_status, analysis_notes: f.analysis_notes, brand_voice: f.brand_voice, target_audience: f.target_audience, brand_assets_url: f.brand_assets_url };
    setClients((list) => list.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    sb()?.from("clients").update(patch).eq("id", id).then(({ error }) => error && console.error("[BrandMotion] updateClient failed:", error));
    logActivity(`обнови клиент ${f.name}`);
    setModal(null);
  }, [logActivity]);

  const deleteClient = useCallback((id: string) => {
    const name = clients.find((c) => c.id === id)?.name || id;
    setClients((list) => list.filter((c) => c.id !== id));
    setInvoices((list) => list.filter((iv) => iv.client !== id));
    setTasks((list) => list.filter((t) => t.client !== id));
    sb()?.from("clients").delete().eq("id", id).then(({ error }) => error && console.error("[BrandMotion] deleteClient failed:", error));
    logActivity(`изтри клиент ${name}`);
    setModal(null);
  }, [clients, logActivity]);

  // ---- Invoices ----
  const addInvoice = useCallback((f: InvoiceForm) => {
    setInvoices((list) => {
      const id = "INV-" + (1042 + list.length + 10);
      const row = { id, client_id: f.client, amount: f.amount, status: f.status, issued: "Today", due: f.due || "—" };
      sb()?.from("invoices").insert(row).then(({ error }) => error && console.error("[BrandMotion] addInvoice failed:", error));
      return [{ id, client: f.client, amount: f.amount, status: f.status, issued: "Today", due: f.due || "—" }, ...list];
    });
    logActivity(`създаде фактура за ${clients.find((c) => c.id === f.client)?.name || f.client}`);
    setModal(null);
  }, [clients, logActivity]);

  const updateInvoice = useCallback((id: string, f: InvoiceForm) => {
    const patch = { client_id: f.client, amount: f.amount, status: f.status, due: f.due || "—" };
    setInvoices((list) => list.map((iv) => (iv.id === id ? { ...iv, client: f.client, amount: f.amount, status: f.status, due: f.due || "—" } : iv)));
    sb()?.from("invoices").update(patch).eq("id", id).then(({ error }) => error && console.error("[BrandMotion] updateInvoice failed:", error));
    logActivity(`обнови фактура ${id}`);
    setModal(null);
  }, [logActivity]);

  const deleteInvoice = useCallback((id: string) => {
    setInvoices((list) => list.filter((iv) => iv.id !== id));
    sb()?.from("invoices").delete().eq("id", id).then(({ error }) => error && console.error("[BrandMotion] deleteInvoice failed:", error));
    logActivity(`изтри фактура ${id}`);
    setModal(null);
  }, [logActivity]);

  const markPaid = useCallback((id: string) => {
    setInvoices((list) => list.map((iv) => (iv.id === id ? { ...iv, status: "paid" } : iv)));
    sb()?.from("invoices").update({ status: "paid" }).eq("id", id).then(({ error }) => error && console.error("[BrandMotion] markPaid failed:", error));
    logActivity(`отбеляза ${id} като платена`);
  }, [logActivity]);

  // ---- Tasks ----
  const addTask = useCallback((f: TaskForm) => {
    const row = { id: "t-" + Date.now(), title: f.title, client_id: f.client, status: "todo" as TaskStatus, priority: f.priority, assignee: currentUser.initials, due: f.due || "Soon", progress: 0 };
    setTasks((list) => [...list, { ...row, client: row.client_id }]);
    sb()?.from("tasks").insert(row).then(({ error }) => error && console.error("[BrandMotion] addTask failed:", error));
    logActivity(`създаде задача „${f.title}“`);
    setModal(null);
  }, [currentUser.initials, logActivity]);

  const updateTask = useCallback((id: string, f: TaskForm) => {
    const patch = { title: f.title, client_id: f.client, priority: f.priority, due: f.due || "Soon" };
    setTasks((list) => list.map((t) => (t.id === id ? { ...t, title: f.title, client: f.client, priority: f.priority, due: f.due || "Soon" } : t)));
    sb()?.from("tasks").update(patch).eq("id", id).then(({ error }) => error && console.error("[BrandMotion] updateTask failed:", error));
    logActivity(`обнови задача „${f.title}“`);
    setModal(null);
  }, [logActivity]);

  const deleteTask = useCallback((id: string) => {
    const title = tasks.find((t) => t.id === id)?.title || id;
    setTasks((list) => list.filter((t) => t.id !== id));
    sb()?.from("tasks").delete().eq("id", id).then(({ error }) => error && console.error("[BrandMotion] deleteTask failed:", error));
    logActivity(`изтри задача „${title}“`);
    setModal(null);
  }, [tasks, logActivity]);

  const moveTask = useCallback((id: string, status: TaskStatus) => {
    setTasks((list) => list.map((t) => (t.id === id ? { ...t, status } : t)));
    sb()?.from("tasks").update({ status }).eq("id", id).then(({ error }) => error && console.error("[BrandMotion] moveTask failed:", error));
  }, []);

  const toggleDone = useCallback((id: string) => {
    let next: { status: TaskStatus; progress: number } | null = null;
    setTasks((list) => list.map((t) => {
      if (t.id !== id) return t;
      next = { status: t.status === "done" ? "todo" : "done", progress: t.status === "done" ? Math.min(t.progress, 90) : 100 };
      return { ...t, ...next };
    }));
    if (next) sb()?.from("tasks").update(next).eq("id", id).then(({ error }) => error && console.error("[BrandMotion] toggleDone failed:", error));
  }, []);

  const value: Store = {
    clients, invoices, tasks, activity, notifications, team, comments, leads, campaigns, integrations, adDrafts, socialPosts, contentItems, cycles, currentUser, loading, usingMock: !supabaseConfigured, signOut,
    addComment, notify, markNotificationRead, markAllNotificationsRead, registerPush, addLead, updateLead, deleteLead, moveLead, onboardLead, startCycle, advanceCycle, addCampaign, updateCampaign, deleteCampaign, logTime,
    toggleIntegration, addAdDraft, updateAdDraft, deleteAdDraft, publishAd, addSocialPost, updateSocialPost, deleteSocialPost, publishSocialPost,
    addContentItem, updateContentItem, deleteContentItem, importScripts, scheduleContent, clientConnections, setClientConnection,
    advanceStage, setStageAssignee, setStageStatus, updateMemberRoles, updateMemberRole,
    modal, openModal: setModal, closeModal: () => setModal(null),
    addClient, updateClient, deleteClient,
    addInvoice, updateInvoice, deleteInvoice, markPaid,
    addTask, updateTask, deleteTask, moveTask, toggleDone,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
