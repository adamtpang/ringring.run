import { afterEach, describe, expect, it } from "vitest";
import { GET as getBusiness } from "@/app/api/businesses/[id]/route";
import { POST as postScan } from "@/app/api/scan/route";
import { createRun, executeRun } from "@/lib/pipeline";
import { buildGamePlan } from "@/lib/gameplan";
import { buildBoard, toSubjectInput } from "@/lib/peers";
import { findSnapshot, reportOrSnapshot, runFallback, scanFallback, SNAPSHOTS, snapshotLabel } from "@/lib/snapshot";
import type { Store } from "@/lib/store/types";
import { deps } from "./helpers";

const SNAP = SNAPSHOTS[0]!;
const ID = SNAP.business_id;
const PHONE = /\(?\b\d{3}\)?[ .-]?\d{3}[ .-]\d{4}\b/;
const g = globalThis as unknown as { __ringringStore?: Store };

/** A store whose every call fails the way a dead Supabase does, or never answers. */
function brokenStore(how: "error" | "hang"): Store {
  return new Proxy({} as Store, {
    get: () => () => (how === "error" ? Promise.reject(new Error("fetch failed: Supabase unreachable")) : new Promise(() => {})),
  });
}

describe("saved snapshot (demo-safe fallback)", () => {
  afterEach(() => {
    delete g.__ringringStore;
  });

  it("is a real Aire Serv report with no phone numbers", () => {
    expect(SNAP.name).toMatch(/Aire Serv/);
    expect(SNAP.report.reviews.length).toBeGreaterThan(0);
    expect(SNAP.report.findings.length).toBeGreaterThan(0);
    expect(PHONE.test(JSON.stringify(SNAP))).toBe(false);
    expect(snapshotLabel(SNAP.saved_at)).toMatch(/^saved snapshot from [A-Z][a-z]{2} \d{1,2}, 20\d\d$/);
  });

  it("Supabase error: the report API serves the labeled snapshot", async () => {
    g.__ringringStore = brokenStore("error");
    const res = await getBusiness(new Request(`http://x/api/businesses/${ID}`), { params: Promise.resolve({ id: ID }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.business.id).toBe(ID);
    expect(body.snapshot.label).toBe(snapshotLabel(SNAP.saved_at));
    expect(body.snapshot.reason).toMatch(/Supabase unreachable/);
  });

  it("Supabase timeout: falls back after the time limit", async () => {
    const r = await reportOrSnapshot(ID, () => new Promise(() => {}), { timeoutMs: 30 });
    expect(r.kind).toBe("snapshot");
    if (r.kind === "snapshot") expect(r.report.snapshot.reason).toMatch(/did not answer/);
  });

  it("misconfigured store: getStore throwing also falls back", async () => {
    const r = await reportOrSnapshot(ID, async () => {
      throw new Error("supabaseUrl is required.");
    });
    expect(r.kind).toBe("snapshot");
  });

  it("live data wins when it works, and other businesses never get a snapshot", async () => {
    const live = await reportOrSnapshot(ID, async () => SNAP.report);
    expect(live.kind).toBe("live");
    expect("snapshot" in (live.kind === "live" ? live.report : {})).toBe(false);
    expect((await reportOrSnapshot("other", () => Promise.reject(new Error("down")))).kind).toBe("error");
    expect((await reportOrSnapshot("other", async () => null)).kind).toBe("not_found");
    expect((await reportOrSnapshot(ID, async () => SNAP.report, { force: true })).kind).toBe("snapshot");
  });

  it("the game plan and peers render from the snapshot", () => {
    const r = SNAP.report;
    const subject = toSubjectInput(r.business, r.reviews, null);
    const board = buildBoard(subject);
    const plan = buildGamePlan({ business: r.business, findings: r.findings, roi: r.roi, reviews: r.reviews, knowledge: r.knowledge, board, subject, scanDate: r.business.created_at });
    expect(plan.items.length).toBeGreaterThan(0);
    expect(plan.prognosis.money?.total).toBe(3897);
    expect(board.status).toBe("ok");
  });

  it("Supabase down when starting a scan: the scan API sends the demo to the snapshot", async () => {
    g.__ringringStore = brokenStore("error");
    const res = await postScan(new Request("http://x/api/scan", { method: "POST", body: JSON.stringify({ name: "Aire Serv of Central and North Austin", city: "Austin TX" }) }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.fallback.url).toBe(`/businesses/${ID}?snapshot=1`);
    // Any other name still reports the failure.
    const other = await postScan(new Request("http://x/api/scan", { method: "POST", body: JSON.stringify({ name: "Joe's Plumbing", city: "Austin TX" }) }));
    expect(other.status).toBe(500);
  });

  it("Apify fails: the failed run offers the snapshot", async () => {
    const d = deps();
    d.scraper = { mode: "apify", scrape: () => Promise.reject(new Error("Apify actor run failed")) };
    const run = await createRun({ kind: "name", category: "Aire Serv of Central and North Austin", city: "Austin TX", maxCount: 1 }, d);
    await executeRun(run.id, d).catch(() => undefined);
    const after = (await d.store.getRun(run.id))!;
    expect(after.status).toBe("failed");
    const fb = runFallback(after, await d.store.listBusinesses({ runId: run.id }));
    expect(fb?.url).toBe(`/businesses/${ID}?snapshot=1`);
    expect(fb?.reason).toMatch(/live scan failed/);
  });

  it("xAI fails: the failed diagnosis offers the snapshot", async () => {
    const d = deps();
    d.diagnoser = { mode: "llm", model: "grok", diagnose: () => Promise.reject(new Error("xAI 503 Service Unavailable")) };
    const run = await createRun({ kind: "name", category: "Aire Serv of Central and North Austin", city: "Austin TX", maxCount: 1 }, d);
    await executeRun(run.id, d).catch(() => undefined);
    const after = (await d.store.getRun(run.id))!;
    const fb = runFallback(after, await d.store.listBusinesses({ runId: run.id }));
    expect(fb?.url).toBe(`/businesses/${ID}?snapshot=1`);
    expect(fb?.reason).toMatch(/fail/);
  });

  it("a stuck run offers the snapshot after 2 minutes, and unrelated runs never do", () => {
    const run = { search_kind: "name", category: "Aire Serv", status: "running", error: null, created_at: new Date(0).toISOString() };
    expect(runFallback(run, [], 60_000)).toBeNull();
    expect(runFallback(run, [], 121_000)?.reason).toMatch(/2 minutes/);
    expect(runFallback({ ...run, category: "Joe's Plumbing", status: "failed" }, [])).toBeNull();
    expect(scanFallback({ name: "joe" }, "x")).toBeNull();
    expect(findSnapshot({ name: "AIRE SERV of Austin" })?.business_id).toBe(ID);
  });
});
