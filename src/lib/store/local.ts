import fs from "node:fs";
import path from "node:path";
import type { Business, Finding, Review, RoiEstimate, Run, RunStep } from "../types";
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
}

const empty = (): Tables => ({ runs: [], run_steps: [], businesses: [], reviews: [], findings: [], roi_estimates: [] });

export function createLocalStore(opts: { file?: string | null } = {}): Store {
  const file = opts.file ?? null;
  let db: Tables = empty();
  let loadedMtime = -1;
  let writeChain: Promise<void> = Promise.resolve();

  function load() {
    if (!file) return;
    try {
      const st = fs.statSync(file);
      if (st.mtimeMs !== loadedMtime) {
        db = { ...empty(), ...JSON.parse(fs.readFileSync(file, "utf8")) };
        loadedMtime = st.mtimeMs;
      }
    } catch {
      // first run: no file yet
    }
  }

  function persist(): Promise<void> {
    if (!file) return Promise.resolve();
    writeChain = writeChain.then(() => {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(db));
      fs.renameSync(tmp, file);
      loadedMtime = fs.statSync(file).mtimeMs;
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
    if (i >= 0) rows[i] = { ...rows[i], ...patch, id };
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
  };
}
