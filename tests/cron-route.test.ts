import { afterEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/cron/checkin/route";

const req = (auth?: string) => new Request("http://x/api/cron/checkin", { headers: auth ? { authorization: auth } : {} });

describe("/api/cron/checkin auth", () => {
  const prev = process.env.CRON_SECRET;
  afterEach(() => {
    if (prev === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prev;
  });

  it("refuses to run without CRON_SECRET", async () => {
    delete process.env.CRON_SECRET;
    expect((await GET(req("Bearer anything"))).status).toBe(503);
  });

  it("rejects a missing or wrong bearer token", async () => {
    process.env.CRON_SECRET = "test-secret-value";
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req("Bearer nope"))).status).toBe(401);
  });
});
