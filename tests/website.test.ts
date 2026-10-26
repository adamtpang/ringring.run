import { describe, expect, it } from "vitest";
import { assertPublicUrl, htmlToText, readWebsite } from "@/lib/website";

const html = (body: string, status = 200, headers: Record<string, string> = { "content-type": "text/html" }) =>
  new Response(body, { status, headers });

describe("website reader", () => {
  it("extracts visible text and the title", () => {
    const r = htmlToText("<html><head><title>Joe &amp; Co</title><style>.a{}</style></head><body><p>Call to book.</p><script>x()</script><ul><li>Drains</li></ul></body></html>");
    expect(r.title).toBe("Joe & Co");
    expect(r.text).toContain("Call to book.");
    expect(r.text).toContain("Drains");
    expect(r.text).not.toContain("x()");
  });

  it("returns skipped when there is no website", async () => {
    expect((await readWebsite(null)).status).toBe("skipped");
  });

  it("reads a page and follows a redirect", async () => {
    let calls = 0;
    const fetchImpl = (async (url: string) => {
      calls++;
      return calls === 1 ? new Response(null, { status: 301, headers: { location: "/home" } }) : html(`<p>Hello from ${url}</p>`);
    }) as unknown as typeof fetch;
    const r = await readWebsite("https://shop.test", { fetchImpl, skipHostCheck: true });
    expect(r.status).toBe("ok");
    expect(r.final_url).toBe("https://shop.test/home");
    expect(r.text).toContain("Hello from https://shop.test/home");
  });

  it("fails gracefully on HTTP errors, non-HTML, and timeouts", async () => {
    const e500 = (async () => html("oops", 500)) as unknown as typeof fetch;
    expect(await readWebsite("https://a.test", { fetchImpl: e500, skipHostCheck: true })).toMatchObject({ status: "failed", error: "HTTP 500" });

    const pdf = (async () => html("%PDF", 200, { "content-type": "application/pdf" })) as unknown as typeof fetch;
    expect((await readWebsite("https://a.test", { fetchImpl: pdf, skipHostCheck: true })).status).toBe("failed");

    const hang = ((_u: string, init: RequestInit) =>
      new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(new Error("aborted"))))) as unknown as typeof fetch;
    const r = await readWebsite("https://slow.test", { fetchImpl: hang, timeoutMs: 50, skipHostCheck: true });
    expect(r.status).toBe("failed");
    expect(r.error).toMatch(/timed out/);
  });

  it("blocks private and non-http targets", async () => {
    await expect(assertPublicUrl("http://localhost:3000")).rejects.toThrow();
    await expect(assertPublicUrl("http://10.0.0.5/")).rejects.toThrow();
    await expect(assertPublicUrl("http://169.254.169.254/latest")).rejects.toThrow();
    await expect(assertPublicUrl("file:///etc/passwd")).rejects.toThrow();
    const r = await readWebsite("http://127.0.0.1:8080");
    expect(r.status).toBe("failed");
  });
});
