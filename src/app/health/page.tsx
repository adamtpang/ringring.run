import type { Metadata } from "next";
import { Badge, Card, SectionHeader } from "@/components/ds";
import { PageShell } from "@/components/ui";
import { ENV_KEYS, envPresence, isDemo, runtimeMode } from "@/lib/env";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Health" };

// Shows which env keys are present. Names and yes/no only: values are never read into the page.
export default function HealthPage() {
  const env = envPresence();
  const mode = runtimeMode();
  const demo = isDemo(mode);
  const rows: [string, string, boolean][] = [
    ["Scraper", mode.scraper === "apify" ? "Apify Google Maps" : "Fictional fixtures", mode.scraper === "apify"],
    ["Diagnoser", mode.diagnoser === "llm" ? `LLM: ${mode.llm_model}` : "Keyword rules", mode.diagnoser === "llm"],
    ["Store", mode.store === "supabase" ? "Supabase Postgres" : "Local JSON file", mode.store === "supabase"],
  ];
  return (
    <PageShell width="narrow">
      <SectionHeader
        level={1}
        size="lg"
        title="Health"
        description={
          <>
            {demo ? "Demo mode for at least one component. Add the missing keys to go live." : "All components are live."}{" "}
            <a href="/api/health" className="font-medium text-accent hover:underline">
              Raw JSON
            </a>
          </>
        }
        action={<Badge tone={demo ? "warning" : "success"} dot>{demo ? "Demo" : "Live"}</Badge>}
      />

      <Card padding="lg" className="space-y-3">
        <SectionHeader title="Components" size="sm" />
        <ul className="divide-y divide-hairline">
          {rows.map(([name, value, live]) => (
            <li key={name} className="flex items-center justify-between gap-4 py-3 text-callout">
              <span className="w-24 shrink-0 text-muted">{name}</span>
              <span className="min-w-0 flex-1 truncate">{value}</span>
              <Badge tone={live ? "success" : "warning"} dot>
                {live ? "Live" : "Demo"}
              </Badge>
            </li>
          ))}
        </ul>
      </Card>

      <Card padding="lg" className="space-y-3">
        <SectionHeader title="Environment keys" size="sm" description="Present or missing. Values are never shown." />
        <ul className="divide-y divide-hairline">
          {ENV_KEYS.map((k) => (
            <li key={k.name} className="flex items-start justify-between gap-4 py-3">
              <span className="min-w-0">
                <span className="block break-all font-mono text-footnote">
                  {k.name}
                  {!k.required && <span className="ml-1.5 font-sans text-caption text-subtle">optional</span>}
                </span>
                <span className="block text-caption text-muted">{k.purpose}</span>
              </span>
              <span className={`shrink-0 text-footnote font-medium ${env[k.name] ? "text-success" : "text-subtle"}`}>{env[k.name] ? "true" : "false"}</span>
            </li>
          ))}
        </ul>
      </Card>
    </PageShell>
  );
}
