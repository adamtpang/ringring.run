import { businessMoney, type BusinessMoney } from "./roi";
import type { Business } from "./types";
import type { Store } from "./store/types";

export type BusinessWithMoney = Business & { money: BusinessMoney | null };

/** Rebuild each business's monthly figure from its own estimate inputs (overlap rule applied). */
export async function withMoney(store: Store, businesses: Business[]): Promise<BusinessWithMoney[]> {
  const out = await Promise.all(
    businesses.map(async (b) => {
      if (b.diagnosis_status !== "ok") return { ...b, money: null };
      const [findings, roi] = await Promise.all([store.listFindings(b.id), store.listRoi(b.id)]);
      return { ...b, money: businessMoney(findings, roi) };
    }),
  );
  return rankByMoney(out);
}

/** Rank by the rebuilt monthly figure; businesses with no estimate keep their order after the estimated ones. */
export function rankByMoney<T extends { money: BusinessMoney | null }>(list: T[]): T[] {
  return list
    .map((b, i) => ({ b, i }))
    .sort((x, y) => (y.b.money?.total ?? -1) - (x.b.money?.total ?? -1) || x.i - y.i)
    .map((x) => x.b);
}

const usd0 = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const LOGGED = /est\. \$[\d,]+\/mo/;

/**
 * Step logs written before the overlap rule carry a raw sum. Show the figure the
 * business's inputs give now, so the timeline never disagrees with the list.
 */
export function stepsWithCurrentFigures<S extends { step: string; business_id: string | null; message: string }>(
  steps: S[],
  businesses: { id: string; name: string; money: BusinessMoney | null }[],
): S[] {
  const byId = new Map(businesses.map((b) => [b.id, b]));
  const top = rankByMoney(businesses.filter((b) => b.money?.total != null))[0];
  const fig = (m: BusinessMoney | null | undefined) => (m?.total != null ? `est. ${usd0(m.total)}/mo, rebuilt from its inputs` : "not estimated");
  return steps.map((s) => {
    if (!LOGGED.test(s.message)) return s;
    if (s.step === "roi" && s.business_id) {
      const b = byId.get(s.business_id);
      return b ? { ...s, message: s.message.replace(LOGGED, fig(b.money)) } : { ...s, message: s.message.replace(LOGGED, "estimate no longer on file") };
    }
    if (s.step === "rank") {
      const head = s.message.split(". Top:")[0];
      return { ...s, message: top ? `${head}. Top: ${top.name} (${fig(top.money)})` : head };
    }
    return { ...s, message: s.message.replace(LOGGED, "estimate (see the list)") };
  });
}
