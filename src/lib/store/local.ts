import fs from "node:fs";
import path from "node:path";
import type { AgentRecord, Business, ChannelOptin, Checkin, CheckinReview, CheckinSnapshot, Finding, KnowledgeFact, Review, RoiEstimate, Run, RunStep, TrackedBusiness, WebPage } from "../types";
import { newId, now, rankBusinesses, type Store } from "./types";

// DEMO / LOCAL store. In-memory tables, optionally persisted to a JSON file
// (default .data/local-db.json) so the CLI and the dev server see the same
// data. Used only when Supabase keys are missing or FORCE_DEMO=1.

interface Tables {
  runs: Run[];
  run_steps: RunStep[];
  businesses: Business[];
  reviews: Review[];
  findings: Finding[];
  roi_estimates: RoiEstimate[];
  web_pages: WebPage[];
  knowledge_facts: KnowledgeFact[];
  agents: AgentRecord[];
  tracked_businesses: TrackedBusiness[];
  checkins: Checkin[];
  checkin_snapshots: CheckinSnapshot[];
  checkin_reviews: CheckinReview[];
  channel_optins: ChannelOptin[];
}

const empty = (): Tables => ({
  runs: [],
  run_steps: [],
  businesses: [],
  reviews: [],
  findings: [],
  roi_estimates: [],
  web_pages: [],
  knowledge_facts: [],
  agents: [],
  tracked_businesses: [],
  checkins: [],
  checkin_snapshots: [],
  checkin_reviews: [],
  channel_optins: [],
});

export function createLocalStore(opts: { file?: string | null } = {}): Store {
  const file = opts.file ?? null;
  let db: Tables = empty();
  let loadedMtime = -1;
  let writeChain: Promise<void> = Promise.resolve();

  function load() {
    if (!file) return;
    try {
      const st = fs.statSync(/*turbopackIgnore: true*/ file);
      if (st.mtimeMs !== loadedMtime) {
        db = { ...empty(), ...JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ file, "utf8")) };
        loadedMtime = st.mtimeMs;
      }
    } catch {
      // first run: no file yet
    }
  }

  function persist(): Promise<void> {
    if (!file) return Promise.resolve();
    writeChain = writeChain.then(() => {
      fs.mkdirSync(/*turbopackIgnore: true*/ path.dirname(file), { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      fs.writeFileSync(/*turbopackIgnore: true*/ tmp, JSON.stringify(db));
      fs.renameSync(/*turbopackIgnore: true*/ tmp, file);
      loadedMtime = fs.statSync(/*turbopackIgnore: true*/ file).mtimeMs;
    });
    return writeChain;
  }

  async function mutate<T>(fn: () => T): Promise<T> {
    load();
    const out = fn();
    await persist();
    return structuredClone(out);
  }

  function read<T>(fn: () => T): Promise<T> {
    load();
    return Promise.resolve(structuredClone(fn()));
  }

  function patchRow<T extends { id: string }>(rows: T[], id: string, patch: Partial<T>) {
    const i = rows.findIndex((r) => r.id === id);
    const row = rows[i];
    if (row) rows[i] = { ...row, ...patch, id };
  }

  return {
    kind: "local",
    createRun: (run) => mutate(() => {
      const row: Run = { ...run, id: newId(), created_at: now() };
      db.runs.push(row);
      return row;
    }),
    updateRun: (id, patch) => mutate(() => patchRow(db.runs, id, patch)),
    getRun: (id) => read(() => db.runs.find((r) => r.id === id) ?? null),
    listRuns: (limit = 20) => read(() => [...db.runs].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit)),

    addStep: (step) => mutate(() => {
      const t = now();
      const row: RunStep = { ...step, id: newId(), created_at: t, updated_at: t };
      db.run_steps.push(row);
      return row;
    }),
    updateStep: (id, patch) => mutate(() => patchRow(db.run_steps, id, { ...patch, updated_at: now() })),
    listSteps: (runId, businessId) =>
      read(() => db.run_steps.filter((s) => s.run_id === runId && (!businessId || s.business_id === businessId))),

    insertBusiness: (b) => mutate(() => {
      // Same constraint as Postgres: unique (run_id, place_id).
      if (db.businesses.some((x) => x.run_id === b.run_id && x.place_id === b.place_id)) {
        throw new Error(`duplicate place_id ${b.place_id} in run`);
      }
      const row: Business = { ...b, id: newId(), created_at: now() };
      db.businesses.push(row);
      return row;
    }),
    updateBusiness: (id, patch) => mutate(() => patchRow(db.businesses, id, patch)),
    getBusiness: (id) => read(() => db.businesses.find((b) => b.id === id) ?? null),
    listBusinesses: (o = {}) =>
      read(() => rankBusinesses(db.businesses.filter((b) => !o.runId || b.run_id === o.runId)).slice(0, o.limit ?? 200)),

    insertReviews: (rows) => mutate(() => {
      const out = rows.map((r) => ({ ...r, id: newId() }));
      db.reviews.push(...out);
      return out;
    }),
    listReviews: (businessId) =>
      read(() => db.reviews.filter((r) => r.business_id === businessId).sort((a, b) => a.position - b.position)),

    insertFinding: (f) => mutate(() => {
      const row: Finding = { ...f, id: newId(), created_at: now() };
      db.findings.push(row);
      return row;
    }),
    listFindings: (businessId) =>
      read(() => db.findings.filter((f) => f.business_id === businessId).sort((a, b) => b.severity - a.severity)),

    insertRoi: (r) => mutate(() => {
      const row: RoiEstimate = { ...r, id: newId(), updated_at: now() };
      db.roi_estimates.push(row);
      return row;
    }),
    updateRoi: (id, patch) => mutate(() => patchRow(db.roi_estimates, id, { ...patch, updated_at: now() })),
    getRoi: (id) => read(() => db.roi_estimates.find((r) => r.id === id) ?? null),
    listRoi: (businessId) => read(() => db.roi_estimates.filter((r) => r.business_id === businessId)),

    insertWebPage: (p) => mutate(() => {
      const row: WebPage = { ...p, id: newId(), fetched_at: now() };
      db.web_pages.push(row);
      return row;
    }),
    listWebPages: (businessId) => read(() => db.web_pages.filter((p) => p.business_id === businessId)),

    insertKnowledgeFacts: (rows) => mutate(() => {
      const out = rows.map((r) => ({ ...r, id: newId(), created_at: now() }));
      db.knowledge_facts.push(...out);
      return out;
    }),
    listKnowledgeFacts: (businessId) => read(() => db.knowledge_facts.filter((k) => k.business_id === businessId)),

    insertAgent: (a) => mutate(() => {
      const t = now();
      const row: AgentRecord = { ...a, id: newId(), created_at: t, updated_at: t };
      db.agents.push(row);
      return row;
    }),
    updateAgent: (id, patch) => mutate(() => patchRow(db.agents, id, { ...patch, updated_at: now() })),
    getAgentForBusiness: (businessId) =>
      read(() => db.agents.filter((a) => a.business_id === businessId).sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null),
    listAgents: (o = {}) =>
      read(() =>
        db.agents
          .filter((a) => !o.runId || a.run_id === o.runId)
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .slice(0, o.limit ?? 200),
      ),

    getTracked: (placeId) => read(() => db.tracked_businesses.find((t) => t.place_id === placeId) ?? null),
    listTracked: (o = {}) => read(() => db.tracked_businesses.filter((t) => !o.trackedOnly || t.tracked)),
    upsertTracked: (row) => mutate(() => {
      const t = now();
      const i = db.tracked_businesses.findIndex((x) => x.place_id === row.place_id);
      const prev = db.tracked_businesses[i];
      const next: TrackedBusiness = { ...row, created_at: prev?.created_at ?? t, updated_at: t };
      if (prev) db.tracked_businesses[i] = next;
      else db.tracked_businesses.push(next);
      return next;
    }),
    insertCheckin: (c) => mutate(() => {
      const row: Checkin = { ...c, id: newId() };
      db.checkins.push(row);
      return row;
    }),
    updateCheckin: (id, patch) => mutate(() => patchRow(db.checkins, id, patch)),
    listCheckins: (o = {}) =>
      read(() =>
        db.checkins
          .filter((c) => (!o.placeId || c.place_id === o.placeId) && (!o.since || c.started_at >= o.since))
          .sort((a, b) => b.started_at.localeCompare(a.started_at))
          .slice(0, o.limit ?? 500),
      ),
    insertSnapshot: (x) => mutate(() => {
      const row: CheckinSnapshot = { ...x, id: newId() };
      db.checkin_snapshots.push(row);
      return row;
    }),
    listSnapshots: (placeId, limit = 52) =>
      read(() => db.checkin_snapshots.filter((x) => x.place_id === placeId).sort((a, b) => b.taken_at.localeCompare(a.taken_at)).slice(0, limit)),
    insertCheckinReviews: (rows) => mutate(() => {
      const out: CheckinReview[] = [];
      for (const r of rows) {
        if (db.checkin_reviews.some((x) => x.place_id === r.place_id && x.external_id === r.external_id)) continue;
        const row: CheckinReview = { ...r, id: newId(), created_at: now() };
        db.checkin_reviews.push(row);
        out.push(row);
      }
      return out;
    }),
    listCheckinReviews: (placeId) =>
      read(() => db.checkin_reviews.filter((x) => x.place_id === placeId).sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? ""))),
    addChannelOptin: (row) => mutate(() => {
      const r: ChannelOptin = { ...row, id: newId(), created_at: now() };
      db.channel_optins.push(r);
      return r;
    }),
    listChannelOptins: (businessId) =>
      read(() => db.channel_optins.filter((x) => x.business_id === businessId).sort((a, b) => b.consented_at.localeCompare(a.consented_at))),
  };
}
