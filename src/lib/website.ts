import dns from "node:dns/promises";
import net from "node:net";
import { errorMessage } from "./retry";

// "Read website" step: fetch a business homepage and keep its visible text so
// findings can cite it. Every failure is returned, never thrown, so one bad
// site cannot break a run.

export interface WebsiteReadResult {
  status: "ok" | "failed" | "skipped";
  url: string;
  final_url: string | null;
  http_status: number | null;
  title: string | null;
  text: string;
  error: string | null;
}

export const MAX_PAGE_BYTES = 1_000_000;
export const MAX_TEXT_CHARS = 20_000;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

export function htmlToText(html: string): { title: string | null; text: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const decode = (s: string) =>
    s
      .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
      .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
      .replace(/&([a-z0-9#]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
  const body = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template|iframe|head)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|section|article|header|footer|tr|td|th)>/gi, ".\n")
    .replace(/<[^>]+>/g, " ");
  const text = decode(body)
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l && l !== ".")
    .map((l) => l.replace(/^\.\s*/, "").replace(/\s*\.$/, (m) => (/[.!?:]$/.test(l.slice(0, -1)) ? "" : m)))
    .join("\n")
    .replace(/\.\./g, ".")
    .slice(0, MAX_TEXT_CHARS);
  return { title: titleMatch?.[1] ? decode(titleMatch[1]).replace(/\s+/g, " ").trim() || null : null, text };
}

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a = 0, b = 0] = ip.split(".").map(Number);
    return (
      a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
    );
  }
  const v = ip.toLowerCase();
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:127.") || v.startsWith("::ffff:10.") || v.startsWith("::ffff:192.168.");
}

/** Only public http(s) hosts. Blocks localhost and private ranges (the URL comes from scraped data). */
export async function assertPublicUrl(raw: string): Promise<URL> {
  const u = new URL(raw);
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error(`unsupported protocol ${u.protocol}`);
  if (u.username || u.password) throw new Error("credentials in URL are not allowed");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) throw new Error("private host");
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
  if (addrs.length === 0 || addrs.some((a) => isPrivateIp(a.address))) throw new Error("host resolves to a private address");
  return u;
}

export interface ReadOptions {
  timeoutMs?: number;
  maxRedirects?: number;
  fetchImpl?: typeof fetch;
  /** Tests only: skip DNS and private address checks. */
  skipHostCheck?: boolean;
}

export async function readWebsite(url: string | null, opts: ReadOptions = {}): Promise<WebsiteReadResult> {
  const base = { url: url ?? "", final_url: null, http_status: null, title: null, text: "" };
  if (!url) return { ...base, status: "skipped", error: "No website on the listing" };
  const timeoutMs = opts.timeoutMs ?? 8000;
  const f = opts.fetchImpl ?? fetch;
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    let current = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    let res: Response | null = null;
    for (let hop = 0; hop <= (opts.maxRedirects ?? 3); hop++) {
      if (!opts.skipHostCheck) await assertPublicUrl(current);
      res = await f(current, {
        redirect: "manual",
        signal,
        headers: { "User-Agent": "ringring.run-scanner/0.1 (reads public homepages)", Accept: "text/html,*/*;q=0.5" },
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        current = new URL(res.headers.get("location") as string, current).toString();
        continue;
      }
      break;
    }
    if (!res) throw new Error("no response");
    if (res.status >= 300 && res.status < 400) throw new Error("too many redirects");
    if (!res.ok) return { ...base, status: "failed", final_url: current, http_status: res.status, error: `HTTP ${res.status}` };
    const type = res.headers.get("content-type") ?? "";
    if (type && !/html|text\/plain/i.test(type)) {
      return { ...base, status: "failed", final_url: current, http_status: res.status, error: `not an HTML page (${type.split(";")[0]})` };
    }
    const html = await readCapped(res, MAX_PAGE_BYTES);
    const { title, text } = /html/i.test(type) || /<html|<body/i.test(html) ? htmlToText(html) : { title: null, text: html.slice(0, MAX_TEXT_CHARS) };
    if (!text.trim()) return { ...base, status: "failed", final_url: current, http_status: res.status, title, error: "page has no readable text (it may need JavaScript)" };
    return { status: "ok", url, final_url: current, http_status: res.status, title, text, error: null };
  } catch (e) {
    const msg = signal.aborted ? `timed out after ${timeoutMs} ms` : errorMessage(e);
    return { ...base, status: "failed", error: msg };
  }
}

async function readCapped(res: Response, max: number): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    total += value.byteLength;
    if (total >= max) {
      await reader.cancel().catch(() => undefined);
      break;
    }
  }
  return new TextDecoder().decode(Buffer.concat(chunks).subarray(0, max));
}
