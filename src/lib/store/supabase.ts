import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Business, Finding, Review, RoiEstimate, Run, RunStep } from "../types";
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
  };
}
