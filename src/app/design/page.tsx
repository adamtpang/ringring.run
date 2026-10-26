import type { Metadata } from "next";
import { LogoMark, RingEmblem, Wordmark } from "@/components/Logo";
import { MarketingFooter, MarketingHeader } from "@/components/MarketingChrome";
import { Badge, Button, Card, Field, SectionHeader, Stat, StatGrid, Timeline, TimelineStep } from "@/components/ds";

export const metadata: Metadata = { title: "Design system", description: "Tokens, palette, type, and components behind ringring.run." };

// Light and dark values mirror src/app/tokens.css. Contrast is computed here, not typed in.
type Swatch = { name: string; token: string; light: string; dark: string; text?: boolean };
const palette: { group: string; swatches: Swatch[] }[] = [
  {
    group: "Brand",
    swatches: [
      { name: "Ring Blue", token: "accent", light: "#0066cc", dark: "#2997ff", text: true },
      { name: "Ring Blue Solid", token: "accent-solid", light: "#0071e3", dark: "#0071e3" },
    ],
  },
  {
    group: "Neutrals",
    swatches: [
      { name: "Ink", token: "foreground", light: "#1d1d1f", dark: "#f5f5f7", text: true },
      { name: "Graphite", token: "muted", light: "#636368", dark: "#a1a1a6", text: true },
      { name: "Pewter", token: "subtle", light: "#6f6f74", dark: "#8d8d92", text: true },
      { name: "Canvas", token: "background", light: "#fbfbfd", dark: "#000000" },
      { name: "Surface", token: "surface", light: "#ffffff", dark: "#161618" },
      { name: "Mist", token: "surface-2", light: "#f5f5f7", dark: "#1c1c1e" },
    ],
  },
  {
    group: "Status",
    swatches: [
      { name: "Success", token: "success", light: "#1a7f37", dark: "#30d158", text: true },
      { name: "Warning", token: "warning", light: "#935200", dark: "#ffb340", text: true },
      { name: "Danger", token: "danger", light: "#c9251d", dark: "#ff6961", text: true },
    ],
  },
];

const RAW: Record<string, string> = {
  accent: "--color-accent-raw",
  "accent-solid": "--color-accent-solid-raw",
  foreground: "--color-fg",
  muted: "--color-muted-raw",
  subtle: "--color-subtle-raw",
  background: "--color-bg",
  surface: "--color-surface-1",
  "surface-2": "--color-surface-2-raw",
  success: "--color-success-raw",
  warning: "--color-warning-raw",
  danger: "--color-danger-raw",
};

function lum(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string) {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const type = [
  { token: "display", cls: "text-display", sample: "Every missed call" },
  { token: "title-1", cls: "text-title-1", sample: "Ranked by opportunity" },
  { token: "title-2", cls: "text-title-2", sample: "Agent timeline" },
  { token: "title-3", cls: "text-title-3", sample: "Example Plumbing Co" },
  { token: "headline", cls: "text-headline", sample: "Missed calls after hours" },
  { token: "body", cls: "text-body", sample: "Each finding quotes its source." },
  { token: "callout", cls: "text-callout", sample: "Scan a business on Google Maps." },
  { token: "footnote", cls: "text-footnote", sample: "Estimates. Edit the assumptions." },
  { token: "caption", cls: "text-caption", sample: "12:04:31 PM · 1.2s" },
  { token: "eyebrow", cls: "text-eyebrow", sample: "How it works" },
];

const motion = [
  { token: "duration-instant", value: "100ms", use: "Press feedback" },
  { token: "duration-fast", value: "200ms", use: "Hover, color" },
  { token: "duration-base", value: "300ms", use: "Fades" },
  { token: "ease-spring", value: "damping 1.0, response 0.35s", use: "Layout, new rows" },
  { token: "ease-spring-bouncy", value: "damping 0.8, response 0.35s", use: "Segmented thumb" },
];

function Ratio({ fg, bg }: { fg: string; bg: string }) {
  const r = contrast(fg, bg);
  return (
    <span className={r >= 4.5 ? "text-success" : r >= 3 ? "text-warning" : "text-danger"}>
      {r.toFixed(1)}
      {r >= 4.5 ? " AA" : r >= 3 ? " AA large" : ""}
    </span>
  );
}

export default function DesignPage() {
  return (
    <>
      <MarketingHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-[var(--space-section)] px-[var(--space-gutter)] py-12">
        <SectionHeader level={1} size="lg" eyebrow="Design system" title="ringring.run" description="Tokens, palette, type, and components. Every value here comes from tokens.css." />

        <section className="space-y-6">
          <SectionHeader title="Logo" description="A handset inside a ring. It reads at 16px and scales to a hero." />
          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="flex items-center justify-center gap-4">
              <LogoMark className="h-16 w-16 text-accent-solid" />
              <LogoMark className="h-8 w-8 text-accent-solid" />
              <LogoMark className="h-4 w-4 text-accent-solid" />
            </Card>
            <Card className="flex items-center justify-center">
              <Wordmark className="text-title-2" />
            </Card>
            <Card padding="sm" className="flex items-center justify-center">
              <RingEmblem className="h-40 w-40" />
            </Card>
          </div>
        </section>

        <section className="space-y-6">
          <SectionHeader title="Color" description="Swatches follow your system theme. Ratios are WCAG 2 contrast against Canvas and Surface." />
          {palette.map((g) => (
            <div key={g.group}>
              <h3 className="mb-3 text-headline">{g.group}</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {g.swatches.map((s) => (
                  <Card key={s.token} padding="none" as="div" className="overflow-hidden">
                    <div className="h-16 ring-1 ring-inset ring-hairline" style={{ background: `var(${RAW[s.token]})` }} />
                    <div className="space-y-1 p-4">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-callout font-semibold">{s.name}</span>
                        <code className="font-mono text-caption text-subtle">{s.token}</code>
                      </div>
                      <div className="grid grid-cols-[3rem_1fr_auto] gap-x-2 font-mono text-caption text-muted">
                        <span>Light</span>
                        <span>{s.light}</span>
                        {s.text ? <Ratio fg={s.light} bg="#fbfbfd" /> : s.token === "accent-solid" ? <span className="text-subtle">white <Ratio fg="#ffffff" bg={s.light} /></span> : <span />}
                        <span>Dark</span>
                        <span>{s.dark}</span>
                        {s.text ? <Ratio fg={s.dark} bg="#161618" /> : <span />}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </section>

        <section className="space-y-6">
          <SectionHeader title="Type" description="Inter for interface text, with tighter tracking as size grows. Geist Mono for timings and IDs." />
          <Card padding="none" as="div">
            <ul className="divide-y divide-hairline">
              {type.map((t) => (
                <li key={t.token} className="grid grid-cols-[6.5rem_1fr] items-baseline gap-4 px-5 py-4">
                  <code className="font-mono text-caption text-subtle">{t.token}</code>
                  <span className={`${t.cls} truncate ${t.token === "eyebrow" ? "uppercase text-accent" : ""}`}>{t.sample}</span>
                </li>
              ))}
              <li className="grid grid-cols-[6.5rem_1fr] items-baseline gap-4 px-5 py-4">
                <code className="font-mono text-caption text-subtle">mono</code>
                <span className="font-mono text-callout tabular-nums">c2b1ac48 · 00:01.84 · $1,240</span>
              </li>
            </ul>
          </Card>
        </section>

        <section className="space-y-6">
          <SectionHeader title="Shape and motion" description="Radii nest: outer radius equals inner radius plus padding. Motion is springs, short, and interruptible." />
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <h3 className="mb-4 text-headline">Radius and shadow</h3>
              <div className="flex flex-wrap items-end gap-4">
                {([["sm", "rounded-sm"], ["md", "rounded-md"], ["lg", "rounded-lg"], ["xl", "rounded-xl"]] as const).map(([r, rc]) => (
                  <div key={r} className="text-center">
                    <div className={`h-14 w-14 bg-surface-2 shadow-raised ring-1 ring-inset ring-hairline ${rc}`} />
                    <code className="mt-2 block font-mono text-caption text-subtle">{r}</code>
                  </div>
                ))}
              </div>
            </Card>
            <Card>
              <h3 className="mb-4 text-headline">Motion</h3>
              <ul className="space-y-2">
                {motion.map((m) => (
                  <li key={m.token} className="flex items-baseline justify-between gap-3 text-footnote">
                    <code className="font-mono text-caption">{m.token}</code>
                    <span className="text-right text-muted">
                      {m.value} · {m.use}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-caption text-subtle">Reduced motion swaps movement for fades.</p>
            </Card>
          </div>
        </section>

        <section className="space-y-6">
          <SectionHeader title="Components" description="Buttons respond on press. Badges carry status. Cards group." />
          <Card className="space-y-6">
            <div className="flex flex-wrap items-center gap-3">
              <Button>Run scan</Button>
              <Button variant="secondary">Timeline</Button>
              <Button variant="plain">How it works</Button>
              <Button variant="inverse" size="sm">Try the demo</Button>
              <Button disabled>Disabled</Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge>Queued</Badge>
              <Badge tone="accent" dot live>Running</Badge>
              <Badge tone="success" dot>Completed</Badge>
              <Badge tone="warning" dot>Demo data</Badge>
              <Badge tone="danger" dot>Failed</Badge>
            </div>
            <StatGrid>
              <Stat label="Businesses" value="8" />
              <Stat label="Diagnosed" value="8" />
              <Stat label="Est./month" value="$4,820" emphasis />
              <Stat label="Elapsed" value="41s" />
            </StatGrid>
            <div className="grid gap-6 sm:grid-cols-2">
              <Timeline>
                <TimelineStep status="ok" label="Search" meta="12:04:01">Found 8 businesses</TimelineStep>
                <TimelineStep status="retry" label="Reviews" meta="12:04:09">Rate limited, retrying</TimelineStep>
                <TimelineStep status="running" label="Diagnose" meta="12:04:22" last>Reading reviews</TimelineStep>
              </Timeline>
              <div className="space-y-4">
                <Field label="City" placeholder="Austin, TX" />
                <Field label="Max" defaultValue="8" inputMode="numeric" hint="Businesses per scan." />
              </div>
            </div>
          </Card>
        </section>
      </main>
      <MarketingFooter />
    </>
  );
}
