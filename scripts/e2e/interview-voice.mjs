// Real-browser voice interview test: real ElevenLabs session, real page, synthetic mic (TTS clips played into getUserMedia).
// Needs: a running server with ELEVENLABS_API_KEY in its env (never in this script), Chrome at /usr/bin/google-chrome, and answer clips a1..a5.mp3 in /tmp/voice.
import { chromium } from "playwright-core";
import fs from "node:fs";
const BASE = process.env.BASE ?? "http://localhost:3125";
const ID = process.env.BID ?? "b188b1f1-6cdf-4d6f-8177-ec2618b0d16e";
const OUT = "/workspace/hack/live-shots/local";
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream"] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, permissions: ["microphone"] });
const p = await ctx.newPage();
const errs = []; p.on("pageerror", (e) => errs.push(e.message));
await p.route("**/__clips/*", (r) => r.fulfill({ body: fs.readFileSync(`/tmp/voice/${r.request().url().split("/").pop()}`), contentType: "audio/mpeg" }));
await p.addInitScript(() => {
  const ac = new AudioContext({ sampleRate: 48000 });
  // One bus feeds a fresh destination per getUserMedia call, since the client stops its first (permission) stream.
  const bus = ac.createGain();
  const osc = ac.createOscillator(); const g = ac.createGain(); g.gain.value = 0.0001; osc.connect(g); g.connect(bus); osc.start();
  navigator.mediaDevices.getUserMedia = async () => { await ac.resume(); const d = ac.createMediaStreamDestination(); bus.connect(d); return d.stream; };
  window.__say = async (name) => {
    await ac.resume();
    const buf = await ac.decodeAudioData(await (await fetch(`/__clips/${name}`)).arrayBuffer());
    const s = ac.createBufferSource(); s.buffer = buf; s.connect(bus); s.start();
    return new Promise((res) => (s.onended = () => res(buf.duration)));
  };
});
await p.goto(`${BASE}/businesses/${ID}/interview`, { waitUntil: "networkidle" });
await p.waitForSelector("textarea[data-question]");
const nq = await p.locator("textarea[data-question]").count();
await p.getByRole("button", { name: "Start talking to Ringy" }).click();
await p.waitForSelector('[data-voice-state="live"]', { timeout: 20000 });
console.log("live");
let said = 0; const t0 = Date.now(); let shot = false;
while (Date.now() - t0 < 180000) {
  const state = await p.getAttribute("[data-voice-state]", "data-voice-state");
  if (state !== "live") break;
  const turns = await p.$$eval("[data-transcript] li", (els) => els.map((e) => e.textContent));
  const listening = await p.getByText("Listening…").isVisible().catch(() => false);
  const last = turns[turns.length - 1] ?? "";
  if (listening && last.startsWith("Ringy:") && said < nq && turns.filter((t) => t.startsWith("Ringy:")).length > said) {
    await p.waitForTimeout(800);
    if (!(await p.getByText("Listening…").isVisible().catch(() => false))) continue;
    said++;
    const d = await p.evaluate((n) => window.__say(n), `a${said}.mp3`);
    console.log(`said clip ${said} (${d.toFixed(1)} s) after: ${last.slice(0, 90)}`);
    if (said === 2 && !shot) { await p.screenshot({ path: `${OUT}/interview-voice-live-desktop.png`, fullPage: true }); shot = true; }
  }
  await p.waitForTimeout(400);
}
console.log("state after call:", await p.getAttribute("[data-voice-state]", "data-voice-state"));
await p.waitForSelector('[data-voice-state="done"]', { timeout: 60000 });
const transcript = await p.$$eval("[data-transcript] li", (els) => els.map((e) => e.textContent));
console.log("TRANSCRIPT\n" + transcript.join("\n"));
const answers = await p.$$eval("textarea[data-question]", (els) => els.map((e) => e.value));
console.log("ANSWERS", JSON.stringify(answers, null, 1));
console.log("msg:", await p.locator('[data-voice-state] [role="status"]').textContent().catch(() => null));
await p.screenshot({ path: `${OUT}/interview-voice-done-desktop.png`, fullPage: true });
await p.getByRole("button", { name: "Save to my profile" }).click();
await p.waitForSelector("[data-save-result]", { timeout: 15000 });
console.log("save:", await p.getAttribute("[data-save-result]", "data-save-result"));
await p.reload({ waitUntil: "networkidle" });
await p.waitForSelector("textarea[data-question]");
console.log("after reload saved markers:", await p.locator("[data-saved-answer]").count(), "first:", await p.locator("[data-saved-answer]").first().textContent());
await p.screenshot({ path: `${OUT}/interview-saved-desktop.png`, fullPage: true });
console.log("errors", errs);
await b.close();
