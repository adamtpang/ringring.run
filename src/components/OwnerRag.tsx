import { ragSections, type RagItem } from "@/lib/walk";

const TONE: Record<RagItem["status"], string> = {
  green: "bg-accent-soft text-accent",
  amber: "bg-warning-soft text-warning",
  red: "bg-danger-soft text-danger",
  neutral: "bg-surface-2 text-muted",
};

function Row({ item }: { item: RagItem }) {
  return (
    <li className="flex items-baseline justify-between gap-3 border-b border-hairline py-2 last:border-b-0">
      <span className="min-w-0 text-footnote">{item.label}</span>
      <span className={`shrink-0 rounded-pill px-2 py-0.5 text-caption font-medium ${TONE[item.status]}`}>{item.value}</span>
    </li>
  );
}

/** Doing well / to improve, colors from the Oct 28 rag rule. Values are the scraped items. */
export function OwnerRag({ kit }: { kit: string }) {
  const { doingWell, improve, header, recency } = ragSections(kit);
  if (!doingWell.length && !improve.length) return null;
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <section className="rounded-lg bg-surface p-4 shadow-card">
        <h2 className="text-eyebrow uppercase text-accent">What you&apos;re doing well</h2>
        <ul className="mt-1">
          {doingWell.map((item) => (
            <Row key={`${item.label}-${item.value}`} item={item} />
          ))}
        </ul>
      </section>
      <section className="rounded-lg bg-surface p-4 shadow-card">
        <h2 className="text-eyebrow uppercase text-danger">What to improve</h2>
        <ul className="mt-1">
          {improve.map((item) => (
            <Row key={`${item.label}-${item.value}`} item={item} />
          ))}
        </ul>
      </section>
      {(header || recency) && (
        <p className="text-caption text-subtle sm:col-span-2">
          {header ? `Rating ${header.value} is ${header.status}. ` : ""}
          {recency ? `Newest unanswered 1 to 3 star: ${recency.value}.` : ""}
        </p>
      )}
    </div>
  );
}

export function ragTone(status: RagItem["status"] | undefined): string {
  if (status === "green") return "text-accent";
  if (status === "amber") return "text-warning";
  if (status === "red") return "text-danger";
  return "";
}
