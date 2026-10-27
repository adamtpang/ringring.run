import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import { GET, POST } from "@/app/api/businesses/[id]/channels/route";
import { CHANNELS, CONSENT_VERSION, consentText, currentStates, maskContact, optinRow, OptinRequestSchema } from "@/lib/channels";
import { createLocalStore } from "@/lib/store/local";
import type { Store } from "@/lib/store";

const g = globalThis as unknown as { __ringringStore?: Store };
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const post = (id: string, body: unknown) => POST(new Request("http://x", { method: "POST", body: JSON.stringify(body) }), ctx(id));

describe("channel list", () => {
  it("only browser voice is live; phone, SMS and WhatsApp are coming soon", () => {
    expect(CHANNELS.filter((c) => c.live).map((c) => c.id)).toEqual(["browser_voice"]);
    for (const id of ["email", "phone", "sms", "whatsapp"]) expect(CHANNELS.find((c) => c.id === id)!.today).toMatch(/^Coming soon/);
  });
  it("claims no Spanish, no sending, and no em dashes", () => {
    const all = JSON.stringify(CHANNELS) + CHANNELS.map((c) => consentText(c.id, "X")).join(" ");
    expect(all).not.toMatch(/spanish|español|\u2014/i);
    for (const c of CHANNELS.filter((x) => !x.live)) expect(consentText(c.id, "X")).toMatch(/not live yet.*will not contact me/);
  });
});

describe("opt-in validation", () => {
  it("needs the box ticked, the current consent version and a valid contact", () => {
    expect(OptinRequestSchema.safeParse({ channel: "browser_voice", consent: false, consent_version: CONSENT_VERSION }).success).toBe(false);
    expect(OptinRequestSchema.safeParse({ channel: "browser_voice", consent: true, consent_version: "old" }).success).toBe(false);
    expect(OptinRequestSchema.safeParse({ channel: "browser_voice", consent: true, consent_version: CONSENT_VERSION }).success).toBe(true);
    expect(OptinRequestSchema.safeParse({ channel: "email", consent: true, consent_version: CONSENT_VERSION, contact: "nope" }).success).toBe(false);
    expect(OptinRequestSchema.safeParse({ channel: "sms", consent: true, consent_version: CONSENT_VERSION, contact: "12" }).success).toBe(false);
    expect(OptinRequestSchema.safeParse({ channel: "sms", consent: true, consent_version: CONSENT_VERSION, contact: "+1 512 555 0100" }).success).toBe(true);
    expect(OptinRequestSchema.safeParse({ channel: "sms", action: "withdraw" }).success).toBe(true);
  });
  it("the server writes its own consent text and a timestamp; coming-soon channels are a waitlist", () => {
    const req = OptinRequestSchema.parse({ channel: "whatsapp", consent: true, consent_version: CONSENT_VERSION, contact: "+15125550100" });
    const row = optinRow("b1", "Acme", req, "2026-10-27T23:00:00.000Z");
    expect(row).toMatchObject({ status: "waitlist", consent_text: consentText("whatsapp", "Acme"), consented_at: "2026-10-27T23:00:00.000Z", consent_version: CONSENT_VERSION });
    expect(optinRow("b1", "Acme", OptinRequestSchema.parse({ channel: "browser_voice", consent: true, consent_version: CONSENT_VERSION, contact: "x@y.co" }), "t").contact).toBeNull();
  });
  it("masks contacts and lets the latest row win", () => {
    expect(maskContact("owner@acme.com")).toBe("o***@acme.com");
    expect(maskContact("+1 512 555 0100")).toBe("***00");
    const base = { business_id: "b", contact: "a@b.co", consent_text: "t", consent_version: "v", source: "s", created_at: "" };
    const s = currentStates([
      { ...base, id: "1", channel: "email", status: "waitlist", consented_at: "2026-10-27T01:00:00Z" },
      { ...base, id: "2", channel: "email", status: "withdrawn", consented_at: "2026-10-27T02:00:00Z" },
    ]);
    expect(s.find((x) => x.channel === "email")).toMatchObject({ status: "withdrawn", contact: null });
    expect(s.find((x) => x.channel === "sms")!.status).toBe("none");
  });
});

describe("/api/businesses/[id]/channels (local store, never a real profile)", () => {
  const file = `/tmp/channels-test-${process.pid}.json`;
  let id = "";
  beforeEach(async () => {
    const store = createLocalStore({ file: null });
    g.__ringringStore = store;
    const run = await store.createRun({ kind: "name", query: "t", status: "done" } as never);
    const b = await store.insertBusiness({ run_id: run.id, name: "Test Fixture Co", is_fixture: true } as never);
    id = b.id;
  });
  afterEach(() => {
    delete g.__ringringStore;
    fs.rmSync(file, { force: true });
  });

  it("saves consent, returns masked state, and withdraws", async () => {
    expect((await post(id, { channel: "email", consent: false, consent_version: CONSENT_VERSION, contact: "o@acme.com" })).status).toBe(400);
    const r = await post(id, { channel: "email", consent: true, consent_version: CONSENT_VERSION, contact: "o@acme.com" });
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.saved.status).toBe("waitlist");
    expect(d.channels.find((c: { channel: string }) => c.channel === "email").contact).toBe("o***@acme.com");
    const rows = await g.__ringringStore!.listChannelOptins(id);
    expect(rows[0]!.consent_text).toContain("Test Fixture Co");
    expect(Date.parse(rows[0]!.consented_at)).not.toBeNaN();
    await post(id, { channel: "email", action: "withdraw" });
    const g2 = await (await GET(new Request("http://x"), ctx(id))).json();
    expect(g2.channels.find((c: { channel: string }) => c.channel === "email").status).toBe("withdrawn");
    expect(JSON.stringify(g2)).not.toContain("o@acme.com");
  });

  it("404s for an unknown business", async () => {
    expect((await post("00000000-0000-0000-0000-000000000000", { channel: "browser_voice", consent: true, consent_version: CONSENT_VERSION })).status).toBe(404);
  });
});

describe("migration", () => {
  it("creates channel_optins with RLS on, a deny policy and no client grants", () => {
    const sql = fs.readFileSync("supabase/migrations/20261030000000_channel_optins.sql", "utf8");
    expect(sql).toMatch(/create table if not exists public\.channel_optins/);
    expect(sql).toMatch(/consent_text text not null/);
    expect(sql).toMatch(/consented_at timestamptz not null/);
    expect(sql).toMatch(/enable row level security/);
    expect(sql).toMatch(/as restrictive for all to anon, authenticated using \(false\)/);
    expect(sql).toMatch(/revoke all on table public\.channel_optins from anon, authenticated/);
  });
});
