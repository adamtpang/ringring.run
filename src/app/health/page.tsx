import type { Metadata } from "next";
import { AppHeader, Card } from "@/components/ui";
import { ENV_KEYS, envPresence, isDemo, runtimeMode } from "@/lib/env";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Health | ringring.run" };

// Shows which env keys are present. Names and yes/no only: values are never read into the page.
export default function HealthPage() {
  const env = envPresence();
  const mode = runtimeMode();
  const demo = isDemo(mode);
  const rows: [string, string, boolean][] = [
    ["Scraper", mode.scraper === "apify" ? "Apify Google Maps (live)" : "Fictional fixtures (demo)", mode.scraper === "apify"],
    ["Diagnoser", mode.diagnoser === "llm" ? `LLM: ${mode.llm_model}` : "Keyword rules (demo)", mode.diagnoser === "llm"],
    ["Store", mode.store === "supabase" ? "Supabase Postgres" : "Local JSON file (demo)", mode.store === "supabase"],
  ];
  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-3xl space-y-6 px-5 py-10">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Health</h1>
          <p className="mt-1 text-sm text-muted">
            {demo ? "Running in demo mode for at least one component. Add the missing keys to go live." : "All components are live."} Raw
            JSON at{" "}
            <a href="/api/health" className="text-accent">
              /api/health
            </a>
            .
          </p>
        </div>

        <Card>
          <h2 className="text-lg font-semibold">Components</h2>
          <table className="mt-3 w-full text-left text-sm">
            <tbody>
              {rows.map(([name, value, live]) => (
                <tr key={name} className="border-b border-hairline last:border-0">
                  <td className="py-2 pr-3 text-muted">{name}</td>
                  <td className="py-2 pr-3">{value}</td>
                  <td className="py-2 text-right">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${live ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
                      {live ? "Live" : "Demo"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold">Environment keys</h2>
          <p className="mt-1 text-xs text-muted">Present or missing only. Values are never shown.</p>
          <table className="mt-3 w-full text-left text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="py-1 font-normal">Name</th>
                <th className="py-1 font-normal">Used for</th>
                <th className="py-1 text-right font-normal">Present</th>
              </tr>
            </thead>
            <tbody>
              {ENV_KEYS.map((k) => (
                <tr key={k.name} className="border-t border-hairline">
                  <td className="py-2 pr-3 font-mono text-xs">
                    {k.name}
                    {k.required ? "" : <span className="ml-1 text-muted">(optional)</span>}
                  </td>
                  <td className="py-2 pr-3 text-muted">{k.purpose}</td>
                  <td className={`py-2 text-right font-medium ${env[k.name] ? "text-emerald-700" : "text-muted"}`}>{env[k.name] ? "true" : "false"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </main>
    </>
  );
}
