"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
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
  seedIdeas,
  visibleClientsFor,
  type Idea,
  type IdeaStatus,
  type Approval,
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
  type VideoMetric,
} from "@/lib/data";
import type { ClientForm, TaskForm, InvoiceForm, LeadForm, CampaignForm, AdDraftForm, SocialPostForm, ContentItemForm, OnboardForm, CycleForm, IdeaForm } from "@/lib/schemas";
import { createClient, supabaseConfigured } from "@/lib/supabase/client";

export interface CurrentUser { name: string; initials: string; role: string; isAdmin: boolean; level: AccessRole }
export interface ActivityItem { id: string; actor_name: string; actor_initials: string; action: string; created_at: string; audience?: "team" | "admin" }
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
  | { kind: "idea"; mode: "create" }
  | { kind: "idea"; mode: "edit"; idea: Idea }
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
  ideas: Idea[];
  approvals: Approval[];
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
  addIdea: (f: IdeaForm) => void;
  updateIdea: (id: string, f: IdeaForm) => void;
  deleteIdea: (id: string) => void;
  voteIdea: (id: string, delta: number) => void;
  setIdeaStatus: (id: string, status: IdeaStatus) => void;
  promoteIdea: (id: string) => void;
  addAiIdeas: (clientId: string, list: { title: string; description: string; hook: string }[]) => void;
  requestApproval: (contentItemId: string) => Promise<string | null>;
  dismissSuggestion: (approvalId: string) => void;
  startCycle: (clientId: string, month: string, targetCount: number) => void;
  advanceCycle: (cycleId: string, toPhase: CyclePhase) => void;
  scheduleContent: (id: string, date: string | null) => void;
  setClientConnection: (clientId: string, provider: ChannelProvider, connected: boolean) => void;
  advanceStage: (itemId: string, toStage: string) => void;
  setStageAssignee: (itemId: string, stageKey: string, assignee: string) => void;
  setStageStatus: (itemId: string, stageKey: string, status: StageStatus) => void;
  updateMemberRoles: (memberId: string, roles: string[]) => void;
  updateMemberRole: (memberId: string, role: AccessRole) => void;
  updateMemberClients: (memberId: string, clientIds: string[]) => void;
  visibleClients: Client[];
  videoMetrics: VideoMetric[];
  saveVideoMetrics: (contentItemId: string, m: { platform: string; url: string; views: number; likes: number; comments: number; shares: number; source?: "manual" | "auto" }) => void;
  getPortalLink: (clientId: string) => Promise<string | null>;
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
  markWorkerPaid: (initials: string) => void;
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
  const [ideas, setIdeas] = useState<Idea[]>(seedIdeas);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [clientConnections, setClientConnections] = useState<ClientConnection[]>([]);
  const [videoMetrics, setVideoMetrics] = useState<VideoMetric[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser>(DEFAULT_USER);
  const [loading, setLoading] = useState(supabaseConfigured);
  const [modal, setModal] = useState<Modal>(null);
  // Failed saves surface as toasts — console-only errors made the optimistic UI
  // look flaky (e.g. "Платено" reverting on reload while the DB write had failed).
  const [toasts, setToasts] = useState<{ id: string; msg: string }[]>([]);
  const notifyError = useCallback((msg: string) => {
    const id = "e-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6);
    setToasts((list) => [...list, { id, msg }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 8000);
  }, []);

  useEffect(() => {
    if (!supabaseConfigured) return;
    let cancelled = false;
    (async () => {
      try {
        const sb = createClient();
        const [c, iv, t, act, tm, cm, ld, cmp, intg, ad, sp, ci, cc, auth, cyc, idv, apv, vm] = await Promise.all([
          sb.from("clients").select("*").order("created_at"),
          sb.from("invoices").select("*").order("created_at"),
          sb.from("tasks").select("*").order("created_at"),
          sb.from("activity").select("*").order("created_at", { ascending: false }).limit(20),
          sb.from("profiles").select("id, name, initials, role, roles, client_ids").order("created_at"),
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
          sb.from("ideas").select("*").order("created_at", { ascending: false }),
          sb.from("approvals").select("*").order("created_at", { ascending: false }),
          sb.from("video_metrics").select("*"),
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
        if (idv.data) setIdeas((idv.data as (Omit<Idea, "client"> & { client_id: string | null })[]).map(({ client_id, ...r }) => ({ ...r, client: client_id })));
        if (apv.data) setApprovals(apv.data as Approval[]);
        if (vm.data) setVideoMetrics(vm.data as VideoMetric[]);
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

  // Realtime auth: supabase-js подава access token-а към realtime сокета само
  // при SIGNED_IN / TOKEN_REFRESHED. При зареждане на страница с възстановена
  // сесия (INITIAL_SESSION) сокетът остава с anon ключа и RLS блокира всички
  // postgres_changes събития — затова "live" изглеждаше мъртво. Освен това
  // postgres_changes абонамент, създаден ПРЕДИ токена, остава анонимен —
  // затова каналите по-долу се (пре)абонират чак когато rtToken е наличен.
  const [rtToken, setRtToken] = useState<string | null>(null);
  useEffect(() => {
    if (!supabaseConfigured) return;
    const client = createClient();
    const { data: sub } = client.auth.onAuthStateChange((_event, session) => {
      const token = session?.access_token ?? null;
      client.realtime.setAuth(token);
      setRtToken(token);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Per-user notifications: load the recipient's recent alerts and subscribe to
  // realtime inserts so the bell updates live. Re-runs when the signed-in user
  // resolves (initials change from the default to the real profile).
  useEffect(() => {
    if (!supabaseConfigured || !rtToken) return;
    const me = currentUser.initials;
    if (!me) return;
    const client = createClient();
    client.realtime.setAuth(rtToken);
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
  }, [currentUser.initials, rtToken]);

  // Live task sync: assignments, status moves and "Платено" made by one user
  // show up in everyone else's open session without a reload (tasks is in the
  // supabase_realtime publication — migration 0019).
  useEffect(() => {
    if (!supabaseConfigured || !rtToken) return;
    const client = createClient();
    client.realtime.setAuth(rtToken);
    const toTask = (r: TaskRow): Task => { const { client_id, ...rest } = r; return { ...rest, client: client_id }; };
    const ch = client
      .channel("tasks-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, (payload) => {
        if (payload.eventType === "INSERT") {
          const t = toTask(payload.new as TaskRow);
          setTasks((list) => (list.some((x) => x.id === t.id) ? list : [...list, t]));
        } else if (payload.eventType === "UPDATE") {
          const t = toTask(payload.new as TaskRow);
          setTasks((list) => list.map((x) => (x.id === t.id ? t : x)));
        } else if (payload.eventType === "DELETE") {
          const id = (payload.old as { id?: string })?.id;
          if (id) setTasks((list) => list.filter((x) => x.id !== id));
        }
      })
      .subscribe();
    return () => { client.removeChannel(ch); };
  }, [rtToken]);

  // Live продукция: смяна на етап/изпълнител/дата от един човек се появява
  // веднага при всички останали (content_items + content_cycles са в
  // supabase_realtime — миграция 0023). Собствените промени просто се
  // презаписват със същите данни — безвредно.
  useEffect(() => {
    if (!supabaseConfigured || !rtToken) return;
    const client = createClient();
    client.realtime.setAuth(rtToken);
    type ItemRow = Omit<ContentItem, "client"> & { client_id: string };
    type CycleRow = Omit<ContentCycle, "client"> & { client_id: string };
    const toItem = (r: ItemRow): ContentItem => { const { client_id, ...rest } = r; return { ...rest, client: client_id }; };
    const toCycle = (r: CycleRow): ContentCycle => { const { client_id, ...rest } = r; return { ...rest, client: client_id }; };
    const ch = client
      .channel("content-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "content_items" }, (payload) => {
        if (payload.eventType === "INSERT") {
          const c = toItem(payload.new as ItemRow);
          setContentItems((list) => (list.some((x) => x.id === c.id) ? list : [...list, c]));
        } else if (payload.eventType === "UPDATE") {
          const c = toItem(payload.new as ItemRow);
          setContentItems((list) => list.map((x) => (x.id === c.id ? c : x)));
        } else if (payload.eventType === "DELETE") {
          const id = (payload.old as { id?: string })?.id;
          if (id) setContentItems((list) => list.filter((x) => x.id !== id));
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "content_cycles" }, (payload) => {
        if (payload.eventType === "INSERT") {
          const c = toCycle(payload.new as CycleRow);
          setCycles((list) => (list.some((x) => x.id === c.id) ? list : [c, ...list]));
        } else if (payload.eventType === "UPDATE") {
          const c = toCycle(payload.new as CycleRow);
          setCycles((list) => list.map((x) => (x.id === c.id ? c : x)));
        } else if (payload.eventType === "DELETE") {
          const id = (payload.old as { id?: string })?.id;
          if (id) setCycles((list) => list.filter((x) => x.id !== id));
        }
      })
      .subscribe();
    return () => { client.removeChannel(ch); };
  }, [rtToken]);

  // audience: 'admin' за пари/клиенти/сделки — RLS (миграция 0025) не ги
  // връща на мениджъри и сътрудници; 'team' за производствената работа.
  const logActivity = useCallback((action: string, audience: "team" | "admin" = "team") => {
    const item: ActivityItem = {
      id: "a-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
      actor_name: currentUser.name, actor_initials: currentUser.initials,
      action, created_at: new Date().toISOString(), audience,
    };
    setActivity((list) => [item, ...list].slice(0, 20));
    sb()?.from("activity").insert({ actor_name: item.actor_name, actor_initials: item.actor_initials, action, audience }).then(({ error }) => {
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
    logActivity(`добави клиент-възможност ${f.name}`, "admin");
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
      logActivity(`спечели сделка ${lead.name}`, "admin");
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

    logActivity(`включи клиент ${f.name} · ${taskRows.length} задачи`, "admin");
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
    logActivity(`стартира кампания ${f.name}`, "admin");
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
    logActivity(`създаде рекламна чернова ${f.name}`, "admin");
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
    if (name) logActivity(`публикува реклама ${name} в Meta`, "admin");
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

  // ---- Production → team task board bridge ----
  // Every video keeps ONE live task on the board. Moving the card between
  // stages RETARGETS that task (title, stage, assignee) instead of piling up
  // a new task per move. A fresh task is created only when the previous one
  // was genuinely completed by its worker (justCompletedTaskId) — so his done
  // history survives — or when the video has no open task yet. Pass
  // toStage=null to only close (final publish).
  const justCompletedTaskId = useRef<string | null>(null);
  const syncStageTask = useCallback((itemId: string, title: string, clientId: string, toStage: string | null, assignee: string) => {
    const completedId = justCompletedTaskId.current;
    justCompletedTaskId.current = null;
    // Derive from current state, not inside updaters — React may defer those.
    const open = tasks.filter((t) => t.content_item_id === itemId && t.status !== "done" && t.id !== completedId);
    const closeIds = (ids: string[]) => {
      if (!ids.length) return;
      const doneAt = new Date().toISOString();
      setTasks((list) => list.map((t) => (ids.includes(t.id) ? { ...t, status: "done" as TaskStatus, progress: 100, done_at: doneAt } : t)));
      sb()?.from("tasks").update({ status: "done", progress: 100, done_at: doneAt }).in("id", ids).then(({ error }) => {
        if (error) { console.error("[BrandMotion] syncStageTask close failed:", error); notifyError("Затварянето на предишния етап не се запази: " + error.message); }
      });
    };
    if (!toStage || !assignee) { closeIds(open.map((t) => t.id)); return; }

    const taskTitle = `Видео „${title || "(без заглавие)"}“ — ${stageMeta(toStage).label}`;
    if (open.length) {
      // Reuse the live task; surplus duplicates (from older double-creates)
      // get swept: paid/valued ones close as done, worthless ones are deleted.
      const [keep, ...extras] = open;
      const patch = { title: taskTitle, client_id: clientId, assignee, status: "todo" as TaskStatus, progress: 0, stage_key: toStage };
      setTasks((list) => list.map((t) => (t.id === keep.id ? { ...t, title: taskTitle, client: clientId, assignee, status: "todo", progress: 0, stage_key: toStage } : t)));
      sb()?.from("tasks").update(patch).eq("id", keep.id).then(({ error }) => {
        if (error) { console.error("[BrandMotion] syncStageTask retarget failed:", error); notifyError("Преместването на задачата не се запази: " + error.message); }
      });
      const junk = extras.filter((t) => !(t.pay_amount || 0) && !(t.time_logged || 0)).map((t) => t.id);
      const worth = extras.filter((t) => (t.pay_amount || 0) || (t.time_logged || 0)).map((t) => t.id);
      if (junk.length) {
        setTasks((list) => list.filter((t) => !junk.includes(t.id)));
        sb()?.from("tasks").delete().in("id", junk).then(({ error }) => error && console.error("[BrandMotion] syncStageTask dedupe failed:", error));
      }
      closeIds(worth);
      return;
    }

    const row = {
      id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: taskTitle,
      client_id: clientId,
      status: "todo" as TaskStatus,
      priority: "medium" as const,
      assignee,
      due: "Според етапа",
      progress: 0,
      estimate_hours: 0,
      pay_amount: 0,
      visibility: "private" as const,
      content_item_id: itemId,
      stage_key: toStage,
    };
    const { client_id: rowClientId, ...rest } = row;
    setTasks((list) => [...list, { ...rest, client: rowClientId }]);
    sb()?.from("tasks").insert(row).then(({ error }) => {
      if (error) { console.error("[BrandMotion] syncStageTask insert failed:", error); notifyError("Задачата за следващия етап не се запази: " + error.message); }
    });
  }, [tasks, notifyError]);

  // ---- Content calendar ----
  const addContentItem = useCallback((clientId: string, f: ContentItemForm) => {
    const client = clients.find((c) => c.id === clientId);
    const stages = defaultStages(team, client?.editor || "", currentUser.initials);
    const date = f.date || null;
    const row = { id: "ct-" + Date.now(), client_id: clientId, date, type: f.type, title: f.title, notes: f.notes, script: f.script, hook: f.hook, hook_type: f.hook_type, cta: f.cta, caption: f.caption, hashtags: f.hashtags, notion_url: f.notion_url, published: f.published, current_stage: "strategy", stages };
    const { client_id: newClient, ...restRow } = row;
    setContentItems((list) => [...list, { ...restRow, client: newClient }]);
    sb()?.from("content_items").insert(row).then(({ error }) => error && console.error("[BrandMotion] addContentItem failed:", error));
    syncStageTask(row.id, f.title, clientId, "strategy", stages.find((s) => s.key === "strategy")?.assignee || "");
    logActivity(`планира съдържание „${f.title}“`);
    setModal(null);
  }, [clients, team, currentUser.initials, syncStageTask, logActivity]);

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
    rows.forEach((r) => syncStageTask(r.id, r.title, clientId, r.current_stage, r.stages.find((s) => s.key === r.current_stage)?.assignee || ""));
    logActivity(`импортира ${videos.length} сценария за ${client?.name || clientId}`);
    // Scripts are in → flip this client's open cycle into production.
    if (cycleId) advanceCycle(cycleId, "production");
    setModal(null);
  }, [clients, team, currentUser.initials, advanceCycle, syncStageTask, logActivity]);

  // ---- Idea Bank ----
  const addIdea = useCallback((f: IdeaForm) => {
    const row = { id: "id-" + Date.now(), client_id: f.client || null, title: f.title, description: f.description, hook: f.hook, source: f.source, status: "backlog" as IdeaStatus, votes: 0, created_by: currentUser.initials };
    setIdeas((list) => [{ id: row.id, client: row.client_id, title: f.title, description: f.description, hook: f.hook, source: f.source, status: "backlog", votes: 0, created_by: currentUser.initials }, ...list]);
    sb()?.from("ideas").insert(row).then(({ error }) => error && console.error("[BrandMotion] addIdea failed:", error));
    logActivity(`добави идея „${f.title}“`);
    setModal(null);
  }, [currentUser.initials, logActivity]);

  const updateIdea = useCallback((id: string, f: IdeaForm) => {
    const patch = { client_id: f.client || null, title: f.title, description: f.description, hook: f.hook, source: f.source };
    setIdeas((list) => list.map((i) => (i.id === id ? { ...i, client: f.client || null, title: f.title, description: f.description, hook: f.hook, source: f.source } : i)));
    sb()?.from("ideas").update(patch).eq("id", id).then(({ error }) => error && console.error("[BrandMotion] updateIdea failed:", error));
    setModal(null);
  }, []);

  const deleteIdea = useCallback((id: string) => {
    setIdeas((list) => list.filter((i) => i.id !== id));
    sb()?.from("ideas").delete().eq("id", id).then(({ error }) => error && console.error("[BrandMotion] deleteIdea failed:", error));
    setModal(null);
  }, []);

  const voteIdea = useCallback((id: string, delta: number) => {
    let votes = 0;
    setIdeas((list) => list.map((i) => { if (i.id !== id) return i; votes = Math.max(0, (i.votes || 0) + delta); return { ...i, votes }; }));
    sb()?.from("ideas").update({ votes }).eq("id", id).then(({ error }) => error && console.error("[BrandMotion] voteIdea failed:", error));
  }, []);

  const setIdeaStatus = useCallback((id: string, status: IdeaStatus) => {
    setIdeas((list) => list.map((i) => (i.id === id ? { ...i, status } : i)));
    sb()?.from("ideas").update({ status }).eq("id", id).then(({ error }) => error && console.error("[BrandMotion] setIdeaStatus failed:", error));
  }, []);

  // Promote an idea into production: create a content_item carrying the hook
  // over, and mark the idea as promoted. The card lands at 'strategy'.
  const promoteIdea = useCallback((id: string) => {
    const idea = ideas.find((i) => i.id === id);
    if (!idea) return;
    const clientId = idea.client || clients[0]?.id;
    if (!clientId) return;
    const client = clients.find((c) => c.id === clientId);
    const stages = defaultStages(team, client?.editor || "", currentUser.initials);
    const row = { id: "ct-" + Date.now(), client_id: clientId, date: null as string | null, type: "reel" as ContentType, title: idea.title, notes: idea.description, script: "", hook: idea.hook, hook_type: "", cta: "", caption: "", hashtags: "", notion_url: "", published: false, current_stage: "strategy", stages };
    const { client_id: rowClient, ...rest } = row;
    setContentItems((list) => [...list, { ...rest, client: rowClient }]);
    sb()?.from("content_items").insert(row).then(({ error }) => error && console.error("[BrandMotion] promoteIdea insert failed:", error));
    syncStageTask(row.id, idea.title, clientId, "strategy", stages.find((s) => s.key === "strategy")?.assignee || "");
    setIdeaStatus(id, "promoted");
    logActivity(`промотира идея „${idea.title}“ в продукция`);
  }, [ideas, clients, team, currentUser.initials, setIdeaStatus, syncStageTask, logActivity]);

  // Bulk-insert AI-generated ideas (source='ai', status='backlog').
  const addAiIdeas = useCallback((clientId: string, list: { title: string; description: string; hook: string }[]) => {
    if (!list.length) return;
    const base = Date.now();
    const rows = list.map((x, i) => ({ id: `id-${base}-${i}`, client_id: clientId || null, title: x.title, description: x.description, hook: x.hook, source: "ai" as const, status: "backlog" as IdeaStatus, votes: 0, created_by: currentUser.initials }));
    setIdeas((prev) => [...rows.map(({ client_id, ...r }) => ({ ...r, client: client_id })), ...prev]);
    sb()?.from("ideas").insert(rows).then(({ error }) => error && console.error("[BrandMotion] addAiIdeas failed:", error));
    logActivity(`генерира ${list.length} AI идеи`);
  }, [currentUser.initials, logActivity]);

  // ---- Client approval (magic link) ----
  // Creates a pending approval whose id doubles as the unguessable token in
  // the public /review/<token> URL. Reuses an existing pending link if any.
  const requestApproval = useCallback(async (contentItemId: string): Promise<string | null> => {
    const existing = approvals.find((a) => a.content_item_id === contentItemId && a.status === "pending");
    if (existing) return existing.id;
    const item = contentItems.find((c) => c.id === contentItemId);
    const token = "rv" + (typeof crypto !== "undefined" && "randomUUID" in crypto ? (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "") : Math.random().toString(36).slice(2) + Date.now());
    const row: Approval = { id: token, content_item_id: contentItemId, client_id: item?.client || "", owner: currentUser.initials, status: "pending", approver_email: "", feedback: "" };
    setApprovals((list) => [row, ...list]);
    const client = sb();
    if (client) {
      const { error } = await client.from("approvals").insert(row);
      if (error) { console.error("[BrandMotion] requestApproval failed:", error); return null; }
    }
    logActivity(`изпрати „${item?.title || contentItemId}“ за одобрение от клиента`);
    return token;
  }, [approvals, contentItems, currentUser.initials, logActivity]);

  // Изчиства предложената от клиента редакция, след като екипът я приеме или
  // отхвърли — статусът и бележката на одобрението остават.
  const dismissSuggestion = useCallback((approvalId: string) => {
    setApprovals((list) => list.map((a) => (a.id === approvalId ? { ...a, suggested_script: "" } : a)));
    sb()?.from("approvals").update({ suggested_script: "" }).eq("id", approvalId).then(({ error }) => {
      if (error) { console.error("[BrandMotion] dismissSuggestion failed:", error); notifyError("Изчистването на предложението не се запази: " + error.message); }
    });
  }, [notifyError]);

  // ---- Client portal & video results ----
  // One metrics row per video (unique on content_item_id) — the public portal
  // reads it through portal_get, the admin edits it in the content modal.
  const saveVideoMetrics = useCallback((contentItemId: string, m: { platform: string; url: string; views: number; likes: number; comments: number; shares: number; source?: "manual" | "auto" }) => {
    const row: VideoMetric = {
      id: "vm-" + contentItemId, content_item_id: contentItemId,
      platform: m.platform, url: m.url,
      views: m.views || 0, likes: m.likes || 0, comments: m.comments || 0, shares: m.shares || 0,
      source: m.source || "manual", updated_at: new Date().toISOString(),
    };
    setVideoMetrics((list) => (list.some((x) => x.content_item_id === contentItemId) ? list.map((x) => (x.content_item_id === contentItemId ? { ...x, ...row } : x)) : [...list, row]));
    sb()?.from("video_metrics").upsert(row, { onConflict: "content_item_id" }).then(({ error }) => {
      if (error) { console.error("[BrandMotion] saveVideoMetrics failed:", error); notifyError("Резултатите не се запазиха: " + error.message + " — провери миграция 0021."); }
    });
  }, [notifyError]);

  // Portal magic link for a client: reuse the active token or mint one.
  const getPortalLink = useCallback(async (clientId: string): Promise<string | null> => {
    const client = sb();
    if (!client) return null;
    const { data } = await client.from("client_portals").select("token").eq("client_id", clientId).eq("active", true).limit(1);
    if (data?.length) return data[0].token as string;
    const token = "pt" + (typeof crypto !== "undefined" && "randomUUID" in crypto ? (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "") : Math.random().toString(36).slice(2) + Date.now());
    const { error } = await client.from("client_portals").insert({ token, client_id: clientId });
    if (error) {
      console.error("[BrandMotion] getPortalLink failed:", error);
      notifyError("Порталният линк не се създаде: " + error.message + " — провери миграция 0021.");
      return null;
    }
    return token;
  }, [notifyError]);

  // ---- Production pipeline ----
  const persistItem = (id: string, patch: Record<string, unknown>) =>
    sb()?.from("content_items").update(patch).eq("id", id).then(({ error }) => {
      if (error) { console.error("[BrandMotion] content update failed:", error); notifyError("Промяната по видеото не се запази: " + error.message); }
    });

  const advanceStage = useCallback((itemId: string, toStage: string) => {
    const item = contentItems.find((c) => c.id === itemId);
    if (!item) return;
    const order = PRODUCTION_STAGES.map((s) => s.key);
    const ti = order.indexOf(toStage);
    const existing = item.stages || defaultStages(team, "", currentUser.initials);
    const nextStages = existing.map((s) => {
      const idx = order.indexOf(s.key);
      return { ...s, status: (idx < ti ? "done" : idx === ti ? "doing" : "todo") as StageStatus };
    });
    setContentItems((list) => list.map((c) => (c.id === itemId ? { ...c, current_stage: toStage, stages: nextStages } : c)));
    persistItem(itemId, { current_stage: toStage, stages: nextStages });
    // Hand-off: tell whoever owns the stage it just moved into + surface it on
    // the team task board (closes the previous stage's task).
    const owner = nextStages.find((s) => s.key === toStage)?.assignee;
    syncStageTask(itemId, item.title, item.client, toStage, owner || "");
    if (owner) notify(owner, `Видео „${item.title || "(без заглавие)"}“ чака твоя етап: ${stageMeta(toStage).label}`, { entity_type: "content", entity_id: itemId, link: itemId });
  }, [contentItems, team, currentUser.initials, syncStageTask, notify]);

  const setStageAssignee = useCallback((itemId: string, stageKey: string, assignee: string) => {
    const item = contentItems.find((c) => c.id === itemId);
    if (!item) return;
    const stages = (item.stages || []).map((s) => (s.key === stageKey ? { ...s, assignee } : s));
    setContentItems((list) => list.map((c) => (c.id === itemId ? { ...c, stages } : c)));
    persistItem(itemId, { stages });
    // Selecting who works the CURRENT stage re-targets the video's open task on
    // the team board (or creates it if the stage had no owner until now).
    if ((item.current_stage || "strategy") === stageKey) {
      const openIds = tasks.filter((t) => t.content_item_id === itemId && t.status !== "done").map((t) => t.id);
      if (openIds.length) {
        setTasks((list) => list.map((t) => (openIds.includes(t.id) ? { ...t, assignee } : t)));
        sb()?.from("tasks").update({ assignee }).in("id", openIds).then(({ error }) => {
          if (error) { console.error("[BrandMotion] stage task reassign failed:", error); notifyError("Смяната на изпълнителя не се запази: " + error.message); }
        });
        if (assignee) notify(assignee, `Видео „${item.title || "(без заглавие)"}“ е при теб: ${stageMeta(stageKey).label}`, { entity_type: "content", entity_id: itemId, link: itemId });
      } else if (assignee) {
        syncStageTask(itemId, item.title, item.client, stageKey, assignee);
      }
    }
  }, [contentItems, tasks, syncStageTask, notify, notifyError]);

  const setStageStatus = useCallback((itemId: string, stageKey: string, status: StageStatus) => {
    const order = PRODUCTION_STAGES.map((s) => s.key);
    const c = contentItems.find((x) => x.id === itemId);
    if (!c) return;
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
      const publishedAt = isLast && !c.published ? new Date().toISOString() : c.published_at ?? null;
      setContentItems((list) => list.map((x) => (x.id === itemId ? { ...x, current_stage: nextKey, stages, published, published_at: publishedAt } : x)));
      persistItem(itemId, { current_stage: nextKey, stages, published, published_at: publishedAt });
      // Завършеният етап затваря СВОЯ таск като done (историята на работника
      // остава), за да не бъде преизползван за следващия етап.
      const stageTask = tasks.find((t) => t.content_item_id === itemId && t.stage_key === cur && t.status !== "done");
      if (stageTask) {
        const doneAt = new Date().toISOString();
        justCompletedTaskId.current = stageTask.id;
        setTasks((list) => list.map((t) => (t.id === stageTask.id ? { ...t, status: "done" as TaskStatus, progress: 100, done_at: doneAt } : t)));
        sb()?.from("tasks").update({ status: "done", progress: 100, done_at: doneAt }).eq("id", stageTask.id).then(({ error }) => error && console.error("[BrandMotion] stage task close failed:", error));
      }
      const to = isLast ? "" : stages.find((s) => s.key === nextKey)?.assignee || "";
      syncStageTask(itemId, c.title, c.client, isLast ? null : nextKey, to);
      if (!isLast && to) notify(to, `Видео „${c.title || "(без заглавие)"}“ чака твоя етап: ${stageMeta(nextKey).label}`, { entity_type: "content", entity_id: itemId, link: itemId });
      return;
    }
    // Otherwise just set this stage's status.
    const stages = (c.stages || []).map((s) => (s.key === stageKey ? { ...s, status } : s));
    setContentItems((list) => list.map((x) => (x.id === itemId ? { ...x, stages } : x)));
    persistItem(itemId, { stages });
  }, [contentItems, tasks, syncStageTask, notify]);

  // Profile edits go through RLS: without the "profiles admin update" policy
  // (migration 0020) an admin's update of ANOTHER member matches 0 rows and
  // Supabase reports success — so we select the row back and treat 0 rows as
  // a failed save instead of silently losing the change.
  const updateProfile = useCallback((memberId: string, patch: Record<string, unknown>, what: string) => {
    sb()?.from("profiles").update(patch).eq("id", memberId).select("id").then(({ data, error }) => {
      if (error || !data?.length) {
        console.error(`[BrandMotion] ${what} failed:`, error || "0 rows updated (RLS?)");
        notifyError(`Промяната (${what}) не се запази${error ? ": " + error.message : " — приложи миграция 0020 (права за админ върху профили)."}`);
      }
    });
  }, [notifyError]);

  const updateMemberRoles = useCallback((memberId: string, roles: string[]) => {
    setTeam((list) => list.map((m) => (m.id === memberId ? { ...m, roles } : m)));
    updateProfile(memberId, { roles }, "роли в продукция");
  }, [updateProfile]);

  const updateMemberRole = useCallback((memberId: string, role: AccessRole) => {
    setTeam((list) => list.map((m) => (m.id === memberId ? { ...m, role } : m)));
    updateProfile(memberId, { role }, "ниво на достъп");
  }, [updateProfile]);

  const updateMemberClients = useCallback((memberId: string, clientIds: string[]) => {
    setTeam((list) => list.map((m) => (m.id === memberId ? { ...m, client_ids: clientIds } : m)));
    updateProfile(memberId, { client_ids: clientIds }, "достъп до клиенти");
  }, [updateProfile]);

  // The clients THIS user is allowed to see — drives every client dropdown and
  // the calendar/production/ideas filtering.
  const me = team.find((m) => m.initials === currentUser.initials);
  const visibleClients = visibleClientsFor(currentUser.level, me?.client_ids, clients);

  const updateContentItem = useCallback((id: string, f: ContentItemForm) => {
    const date = f.date || null;
    const prev = contentItems.find((c) => c.id === id);
    // Първото минаване през "публикувано" печата published_at — по него бордът
    // архивира картата след BOARD_RETENTION_DAYS.
    const publishedAt = f.published ? (prev?.published ? prev.published_at ?? null : new Date().toISOString()) : null;
    const patch = { date, type: f.type, title: f.title, notes: f.notes, script: f.script, hook: f.hook, hook_type: f.hook_type, cta: f.cta, caption: f.caption, hashtags: f.hashtags, notion_url: f.notion_url, published: f.published, published_at: publishedAt };
    setContentItems((list) => list.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    sb()?.from("content_items").update(patch).eq("id", id).then(({ error }) => error && console.error("[BrandMotion] updateContentItem failed:", error));
    setModal(null);
  }, [contentItems]);

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
  // Cyrillic names transliterate before slugging — otherwise „Евро Програми“
  // and every other кирилско име collapse to the same id ("client") and the
  // second insert dies on the duplicate primary key.
  const translit = (s: string) => {
    const map: Record<string, string> = { а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sht", ъ: "a", ь: "y", ю: "yu", я: "ya" };
    return s.toLowerCase().replace(/[а-яё]/g, (ch) => map[ch] ?? "");
  };
  const addClient = useCallback((f: ClientForm) => {
    const base = translit(f.name).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "client-" + (Date.now() % 100000);
    setClients((list) => {
      const id = list.some((c) => c.id === base) ? base + "-" + (Date.now() % 10000) : base;
      const row = { id, name: f.name, initials: initialsFrom(f.name), industry: f.industry, status: f.status, mrr: f.mrr, owner: f.owner, health: f.health, note: f.note, editor: f.editor, analysis_status: f.analysis_status, analysis_notes: f.analysis_notes, brand_voice: f.brand_voice, target_audience: f.target_audience, brand_assets_url: f.brand_assets_url };
      sb()?.from("clients").insert(row).then(({ error }) => {
        if (error) {
          console.error("[BrandMotion] addClient failed:", error.message || error);
          notifyError(`Клиентът не се запази: ${error.message || "неизвестна грешка"}`);
          setClients((cur) => cur.filter((c) => c.id !== id));
        }
      });
      return [...list, row as Client];
    });
    logActivity(`добави клиент ${f.name}`, "admin");
    setModal(null);
  }, [logActivity, notifyError]);

  const updateClient = useCallback((id: string, f: ClientForm) => {
    const patch = { name: f.name, initials: initialsFrom(f.name), industry: f.industry, status: f.status, mrr: f.mrr, owner: f.owner, health: f.health, note: f.note, editor: f.editor, analysis_status: f.analysis_status, analysis_notes: f.analysis_notes, brand_voice: f.brand_voice, target_audience: f.target_audience, brand_assets_url: f.brand_assets_url };
    setClients((list) => list.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    sb()?.from("clients").update(patch).eq("id", id).then(({ error }) => {
      if (error) { console.error("[BrandMotion] updateClient failed:", error.message || error); notifyError(`Промяната по клиента не се запази: ${error.message || "неизвестна грешка"}`); }
    });
    logActivity(`обнови клиент ${f.name}`, "admin");
    setModal(null);
  }, [logActivity, notifyError]);

  const deleteClient = useCallback((id: string) => {
    const name = clients.find((c) => c.id === id)?.name || id;
    setClients((list) => list.filter((c) => c.id !== id));
    setInvoices((list) => list.filter((iv) => iv.client !== id));
    setTasks((list) => list.filter((t) => t.client !== id));
    sb()?.from("clients").delete().eq("id", id).then(({ error }) => {
      if (error) { console.error("[BrandMotion] deleteClient failed:", error.message || error); notifyError(`Клиентът не се изтри: ${error.message || "неизвестна грешка"}`); }
    });
    logActivity(`изтри клиент ${name}`, "admin");
    setModal(null);
  }, [clients, logActivity, notifyError]);

  // ---- Invoices ----
  const addInvoice = useCallback((f: InvoiceForm) => {
    setInvoices((list) => {
      const id = "INV-" + (1042 + list.length + 10);
      const row = { id, client_id: f.client, amount: f.amount, status: f.status, issued: "Today", due: f.due || "—" };
      sb()?.from("invoices").insert(row).then(({ error }) => error && console.error("[BrandMotion] addInvoice failed:", error));
      return [{ id, client: f.client, amount: f.amount, status: f.status, issued: "Today", due: f.due || "—" }, ...list];
    });
    logActivity(`създаде фактура за ${clients.find((c) => c.id === f.client)?.name || f.client}`, "admin");
    setModal(null);
  }, [clients, logActivity]);

  const updateInvoice = useCallback((id: string, f: InvoiceForm) => {
    const patch = { client_id: f.client, amount: f.amount, status: f.status, due: f.due || "—" };
    setInvoices((list) => list.map((iv) => (iv.id === id ? { ...iv, client: f.client, amount: f.amount, status: f.status, due: f.due || "—" } : iv)));
    sb()?.from("invoices").update(patch).eq("id", id).then(({ error }) => error && console.error("[BrandMotion] updateInvoice failed:", error));
    logActivity(`обнови фактура ${id}`, "admin");
    setModal(null);
  }, [logActivity]);

  const deleteInvoice = useCallback((id: string) => {
    setInvoices((list) => list.filter((iv) => iv.id !== id));
    sb()?.from("invoices").delete().eq("id", id).then(({ error }) => error && console.error("[BrandMotion] deleteInvoice failed:", error));
    logActivity(`изтри фактура ${id}`, "admin");
    setModal(null);
  }, [logActivity]);

  const markPaid = useCallback((id: string) => {
    setInvoices((list) => list.map((iv) => (iv.id === id ? { ...iv, status: "paid" } : iv)));
    sb()?.from("invoices").update({ status: "paid" }).eq("id", id).then(({ error }) => error && console.error("[BrandMotion] markPaid failed:", error));
    logActivity(`отбеляза ${id} като платена`, "admin");
  }, [logActivity]);

  // ---- Tasks ----
  // Admin-created tasks are private (admin + assignee) unless "видима за целия
  // екип" is checked; everyone else's tasks stay team-visible as before.
  const addTask = useCallback((f: TaskForm) => {
    const assignee = (currentUser.isAdmin || currentUser.level === "manager") && f.assignee ? f.assignee : currentUser.initials;
    const visibility = currentUser.isAdmin && !f.team_visible ? ("private" as const) : ("team" as const);
    const row = { id: "t-" + Date.now(), title: f.title, client_id: f.client, status: "todo" as TaskStatus, priority: f.priority, assignee, due: f.due || "Soon", progress: 0, estimate_hours: f.estimate_hours || 0, pay_amount: f.pay_amount || 0, visibility };
    const { client_id: rowClient, ...rest } = row;
    setTasks((list) => [...list, { ...rest, client: rowClient }]);
    sb()?.from("tasks").insert(row).then(({ error }) => {
      if (error) { console.error("[BrandMotion] addTask failed:", error); notifyError("Задачата не се запази и няма да стигне до изпълнителя: " + error.message); }
    });
    if (assignee !== currentUser.initials) notify(assignee, `Нова задача за теб: „${f.title}“`, { entity_type: "task", entity_id: row.id });
    logActivity(`създаде задача „${f.title}“`);
    setModal(null);
  }, [currentUser.initials, currentUser.isAdmin, currentUser.level, notify, notifyError, logActivity]);

  const updateTask = useCallback((id: string, f: TaskForm) => {
    const prev = tasks.find((t) => t.id === id);
    const canAssign = currentUser.isAdmin || currentUser.level === "manager";
    const assignee = canAssign && f.assignee ? f.assignee : prev?.assignee || currentUser.initials;
    const visibility = currentUser.isAdmin ? (f.team_visible ? ("team" as const) : ("private" as const)) : prev?.visibility || "team";
    const patch = { title: f.title, client_id: f.client, priority: f.priority, due: f.due || "Soon", estimate_hours: f.estimate_hours || 0, pay_amount: f.pay_amount || 0, assignee, visibility };
    setTasks((list) => list.map((t) => (t.id === id ? { ...t, title: f.title, client: f.client, priority: f.priority, due: f.due || "Soon", estimate_hours: f.estimate_hours || 0, pay_amount: f.pay_amount || 0, assignee, visibility } : t)));
    sb()?.from("tasks").update(patch).eq("id", id).then(({ error }) => {
      if (error) { console.error("[BrandMotion] updateTask failed:", error); notifyError("Промяната по задачата не се запази: " + error.message); }
    });
    if (prev && assignee !== prev.assignee && assignee !== currentUser.initials) notify(assignee, `Задача „${f.title}“ е прехвърлена на теб`, { entity_type: "task", entity_id: id });
    logActivity(`обнови задача „${f.title}“`);
    setModal(null);
  }, [tasks, currentUser.initials, currentUser.isAdmin, currentUser.level, notify, notifyError, logActivity]);

  const deleteTask = useCallback((id: string) => {
    const title = tasks.find((t) => t.id === id)?.title || id;
    setTasks((list) => list.filter((t) => t.id !== id));
    sb()?.from("tasks").delete().eq("id", id).then(({ error }) => error && console.error("[BrandMotion] deleteTask failed:", error));
    logActivity(`изтри задача „${title}“`);
    setModal(null);
  }, [tasks, logActivity]);

  // Completing a production task (done column / toggle) closes its stage too —
  // setStageStatus then auto-advances the video and opens the next worker's
  // task. justCompletedTaskId keeps this task out of syncStageTask's "reuse"
  // path, so the worker's done card survives and the next stage gets a fresh one.
  const completeStageFor = useCallback((t: Task | undefined) => {
    if (t && t.status !== "done" && t.content_item_id && t.stage_key) {
      justCompletedTaskId.current = t.id;
      setStageStatus(t.content_item_id, t.stage_key, "done");
    }
  }, [setStageStatus]);

  const moveTask = useCallback((id: string, status: TaskStatus) => {
    const cur = tasks.find((t) => t.id === id);
    const patch = status === "done" ? { status, done_at: new Date().toISOString() } : { status, done_at: null };
    setTasks((list) => list.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    sb()?.from("tasks").update(patch).eq("id", id).then(({ error }) => {
      if (error) { console.error("[BrandMotion] moveTask failed:", error); notifyError("Смяната на статуса не се запази: " + error.message); }
    });
    if (status === "done") completeStageFor(cur);
  }, [tasks, completeStageFor, notifyError]);

  const toggleDone = useCallback((id: string) => {
    // Compute from state, not inside the updater — React may defer updaters, so
    // `next` would still be null when the DB write below fires.
    const cur = tasks.find((t) => t.id === id);
    if (!cur) return;
    const next = cur.status === "done"
      ? { status: "todo" as TaskStatus, progress: Math.min(cur.progress, 90), done_at: null }
      : { status: "done" as TaskStatus, progress: 100, done_at: new Date().toISOString() };
    setTasks((list) => list.map((t) => (t.id === id ? { ...t, ...next } : t)));
    sb()?.from("tasks").update(next).eq("id", id).then(({ error }) => {
      if (error) { console.error("[BrandMotion] toggleDone failed:", error); notifyError("Смяната на статуса не се запази: " + error.message); }
    });
    if (next.status === "done") completeStageFor(cur);
  }, [tasks, completeStageFor, notifyError]);

  // Settle a worker's dues: mark every DONE unpaid task of theirs as paid and
  // tell them. The per-task paid flag keeps history (what was paid when).
  const markWorkerPaid = useCallback((initials: string) => {
    const now = new Date().toISOString();
    // Compute from state, not inside the updater (see toggleDone) — this is why
    // "Платено" used to revert: `ids` was empty when the DB write was skipped.
    const due = tasks.filter((t) => t.assignee === initials && t.status === "done" && !t.paid);
    if (!due.length) return;
    const ids = due.map((t) => t.id);
    const total = due.reduce((a, t) => a + (t.pay_amount || 0), 0);
    setTasks((list) => list.map((t) => (ids.includes(t.id) ? { ...t, paid: true, paid_at: now } : t)));
    sb()?.from("tasks").update({ paid: true, paid_at: now }).in("id", ids).then(({ error }) => {
      if (error) { console.error("[BrandMotion] markWorkerPaid failed:", error); notifyError("„Платено“ не се запази: " + error.message); }
    });
    notify(initials, `Плащане към теб е отбелязано: €${Math.round(total).toLocaleString("bg-BG")} за ${ids.length} задачи`, { entity_type: "pay", entity_id: initials });
    logActivity(`отбеляза плащане €${Math.round(total).toLocaleString("bg-BG")} към ${initials}`, "admin");
  }, [tasks, notify, notifyError, logActivity]);

  const value: Store = {
    clients, invoices, tasks, activity, notifications, team, comments, leads, campaigns, integrations, adDrafts, socialPosts, contentItems, cycles, ideas, approvals, currentUser, loading, usingMock: !supabaseConfigured, signOut,
    addIdea, updateIdea, deleteIdea, voteIdea, setIdeaStatus, promoteIdea, addAiIdeas, requestApproval, dismissSuggestion,
    addComment, notify, markNotificationRead, markAllNotificationsRead, registerPush, addLead, updateLead, deleteLead, moveLead, onboardLead, startCycle, advanceCycle, addCampaign, updateCampaign, deleteCampaign,
    toggleIntegration, addAdDraft, updateAdDraft, deleteAdDraft, publishAd, addSocialPost, updateSocialPost, deleteSocialPost, publishSocialPost,
    addContentItem, updateContentItem, deleteContentItem, importScripts, scheduleContent, clientConnections, setClientConnection,
    advanceStage, setStageAssignee, setStageStatus, updateMemberRoles, updateMemberRole, updateMemberClients, visibleClients,
    videoMetrics, saveVideoMetrics, getPortalLink,
    modal, openModal: setModal, closeModal: () => setModal(null),
    addClient, updateClient, deleteClient,
    addInvoice, updateInvoice, deleteInvoice, markPaid,
    addTask, updateTask, deleteTask, moveTask, toggleDone, markWorkerPaid,
  };

  return (
    <StoreContext.Provider value={value}>
      {children}
      {toasts.length > 0 && (
        <div style={{ position: "fixed", bottom: 16, right: 16, zIndex: "var(--bm-z-toast)" as unknown as number, display: "flex", flexDirection: "column", gap: 8, maxWidth: 380 }}>
          {toasts.map((t) => (
            <div key={t.id} className="bm-alert bm-alert--danger" role="alert" style={{ boxShadow: "var(--bm-shadow-lg)", cursor: "pointer" }} onClick={() => setToasts((list) => list.filter((x) => x.id !== t.id))}>
              {t.msg}
            </div>
          ))}
        </div>
      )}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
