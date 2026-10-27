import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AgentRecord, Business, Checkin, CheckinReview, CheckinSnapshot, Finding, KnowledgeFact, Review, RoiEstimate, Run, RunStep, TrackedBusiness, WebPage } from "../types";
import { newId, now, type Store } from "./types";

// Supabase (Postgres) store. Server side only: uses the service role key,
// which must never reach the browser. Schema: supabase/migrations.

export function createSupabaseStore(url: string, serviceRoleKey: string): Store {
  const sb: SupabaseClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  async function insert<T>(table: string, row: Record<string, unknown>): Promise<T> {
    const { data, error } = await sb.from(table).insert(row).select().single();
    if (error) throw new Error(`Supabase insert ${table}: ${error.message}`);
    return data as T;
  }
  async function update(table: string, id: string, patch: Record<string, unknown>) {
    const { id: _ignored, ...rest } = patch;
    void _ignored;
    const { error } = await sb.from(table).update(rest).eq("id", id);
    if (error) throw new Error(`Supabase update ${table}: ${error.message}`);
  }
  async function one<T>(table: string, id: string): Promise<T | null> {
    const { data, error } = await sb.from(table).select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(`Supabase select ${table}: ${error.message}`);
    return (data as T) ?? null;
  }

  return {
    kind: "supabase",
    createRun: (run) => insert<Run>("runs", { ...run, id: newId() }),
    updateRun: (id, patch) => update("runs", id, patch),
    getRun: (id) => one<Run>("runs", id),
    async listRuns(limit = 20) {
      const { data, error } = await sb.from("runs").select("*").order("created_at", { ascending: false }).limit(limit);
      if (error) throw new Error(error.message);
      return data as Run[];
    },

    addStep: (step) => insert<RunStep>("run_steps", { ...step, id: newId() }),
    updateStep: (id, patch) => update("run_steps", id, { ...patch, updated_at: now() }),
    async listSteps(runId, businessId) {
      let q = sb.from("run_steps").select("*").eq("run_id", runId).order("created_at", { ascending: true });
      if (businessId) q = q.eq("business_id", businessId);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return data as RunStep[];
    },

    insertBusiness: (b) => insert<Business>("businesses", { ...b, id: newId() }),
    updateBusiness: (id, patch) => update("businesses", id, patch),
    getBusiness: (id) => one<Business>("businesses", id),
    async listBusinesses(o = {}) {
      let q = sb
        .from("businesses")
        .select("*")
        .order("est_monthly_value", { ascending: false })
        .order("opportunity_score", { ascending: false })
        .order("name", { ascending: true })
        .limit(o.limit ?? 200);
      if (o.runId) q = q.eq("run_id", o.runId);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return data as Business[];
    },

    async insertReviews(rows) {
      if (rows.length === 0) return [];
      const { data, error } = await sb
        .from("reviews")
        .insert(rows.map((r) => ({ ...r, id: newId() })))
        .select();
      if (error) throw new Error(`Supabase insert reviews: ${error.message}`);
      return data as Review[];
    },
    async listReviews(businessId) {
      const { data, error } = await sb.from("reviews").select("*").eq("business_id", businessId).order("position");
      if (error) throw new Error(error.message);
      return data as Review[];
    },

    insertFinding: (f) => insert<Finding>("findings", { ...f, id: newId() }),
    async listFindings(businessId) {
      const { data, error } = await sb
        .from("findings")
        .select("*")
        .eq("business_id", businessId)
        .order("severity", { ascending: false });
      if (error) throw new Error(error.message);
      return data as Finding[];
    },

    insertRoi: (r) => insert<RoiEstimate>("roi_estimates", { ...r, id: newId() }),
    updateRoi: (id, patch) => update("roi_estimates", id, { ...patch, updated_at: now() }),
    getRoi: (id) => one<RoiEstimate>("roi_estimates", id),
    async listRoi(businessId) {
      const { data, error } = await sb.from("roi_estimates").select("*").eq("business_id", businessId);
      if (error) throw new Error(error.message);
      return data as RoiEstimate[];
    },

    insertWebPage: (p) => insert<WebPage>("web_pages", { ...p, id: newId() }),
    async listWebPages(businessId) {
      const { data, error } = await sb.from("web_pages").select("*").eq("business_id", businessId).order("fetched_at");
      if (error) throw new Error(error.message);
      return data as WebPage[];
    },

    async insertKnowledgeFacts(rows) {
      if (rows.length === 0) return [];
      const { data, error } = await sb
        .from("knowledge_facts")
        .insert(rows.map((r) => ({ ...r, id: newId() })))
        .select();
      if (error) throw new Error(`Supabase insert knowledge_facts: ${error.message}`);
      return data as KnowledgeFact[];
    },
    async listKnowledgeFacts(businessId) {
      const { data, error } = await sb.from("knowledge_facts").select("*").eq("business_id", businessId).order("kind");
      if (error) throw new Error(error.message);
      return data as KnowledgeFact[];
    },

    insertAgent: (a) => insert<AgentRecord>("agents", { ...a, id: newId() }),
    updateAgent: (id, patch) => update("agents", id, { ...patch, updated_at: now() }),
    async getAgentForBusiness(businessId) {
      const { data, error } = await sb
        .from("agents")
        .select("*")
        .eq("business_id", businessId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as AgentRecord) ?? null;
    },
    async listAgents(o = {}) {
      let q = sb.from("agents").select("*").order("created_at", { ascending: false }).limit(o.limit ?? 200);
      if (o.runId) q = q.eq("run_id", o.runId);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return data as AgentRecord[];
    },

    async getTracked(placeId) {
      const { data, error } = await sb.from("tracked_businesses").select("*").eq("place_id", placeId).maybeSingle();
      if (error) throw new Error(error.message);
      return (data as TrackedBusiness) ?? null;
    },
    async listTracked(o = {}) {
      let q = sb.from("tracked_businesses").select("*").order("created_at", { ascending: true });
      if (o.trackedOnly) q = q.eq("tracked", true);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return data as TrackedBusiness[];
    },
    async upsertTracked(row) {
      const { data, error } = await sb
        .from("tracked_businesses")
        .upsert({ ...row, updated_at: now() }, { onConflict: "place_id" })
        .select()
        .single();
      if (error) throw new Error(`Supabase upsert tracked_businesses: ${error.message}`);
      return data as TrackedBusiness;
    },
    insertCheckin: async (c) => checkinRow(await insert<Checkin>("checkins", { ...c, id: newId() })),
    updateCheckin: (id, patch) => update("checkins", id, patch),
    async listCheckins(o = {}) {
      let q = sb.from("checkins").select("*").order("started_at", { ascending: false }).limit(o.limit ?? 500);
      if (o.placeId) q = q.eq("place_id", o.placeId);
      if (o.since) q = q.gte("started_at", o.since);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data as Checkin[]).map(checkinRow);
    },
    insertSnapshot: async (x) => snapshotRow(await insert<CheckinSnapshot>("checkin_snapshots", { ...x, id: newId() })),
    async listSnapshots(placeId, limit = 52) {
      const { data, error } = await sb.from("checkin_snapshots").select("*").eq("place_id", placeId).order("taken_at", { ascending: false }).limit(limit);
      if (error) throw new Error(error.message);
      return (data as CheckinSnapshot[]).map(snapshotRow);
    },
    async insertCheckinReviews(rows) {
      if (rows.length === 0) return [];
      const { data, error } = await sb
        .from("checkin_reviews")
        .upsert(rows.map((r) => ({ ...r, id: newId() })), { onConflict: "place_id,external_id", ignoreDuplicates: true })
        .select();
      if (error) throw new Error(`Supabase insert checkin_reviews: ${error.message}`);
      return data as CheckinReview[];
    },
    async listCheckinReviews(placeId) {
      const { data, error } = await sb.from("checkin_reviews").select("*").eq("place_id", placeId).order("published_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data as CheckinReview[];
    },
  };
}

// Postgres numeric can arrive as a string; normalize to numbers.
const num = (v: unknown): number | null => (v == null ? null : Number(v));
function checkinRow(c: Checkin): Checkin {
  return { ...c, est_cost_usd: Number(c.est_cost_usd), actual_cost_usd: num(c.actual_cost_usd) };
}
function snapshotRow(x: CheckinSnapshot): CheckinSnapshot {
  return { ...x, rating: num(x.rating), reply_rate: num(x.reply_rate), neg_reply_rate: num(x.neg_reply_rate) };
}
