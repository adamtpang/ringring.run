import { CALC } from "./calculator";
import { computeMonthlyValue, defaultAvgTicket } from "./roi";
import type { Assumption } from "./types";

// Starter-pack ROI for the demo. Money is the same product computeMonthlyValue
// already uses. Time is minutes x volume. Review revenue uplift is omitted:
// this repo has no cited source for it.

export interface StarterInputs {
  callsPerDay: number;
  /** 0 to 1 */
  missRate: number;
  /** 0 to 1 */
  closeRate: number;
  avgTicket: number;
  /** Days the money total covers. */
  days: number;
  /** Placeholder monthly price. Not a published price. */
  pricePerMonth: number;
  hourlyRate: number;
  daysPerWeek: number;
  minutesPerCall: number;
  repliesPerWeek: number;
  minutesPerReply: number;
  seoTasksPerWeek: number;
  minutesPerSeo: number;
  webTasksPerWeek: number;
  minutesPerWeb: number;
}

export interface TimeTask {
  id: string;
  label: string;
  minutes: number;
  volume: number;
  volumeLabel: string;
  hours: number;
  source: string;
}

export interface StarterResult {
  recovered: number;
  net: number;
  /** Days of recovered revenue that cover one month of the placeholder price. Null when recovered is 0. */
  paybackDays: number | null;
  moneyMath: string;
  netMath: string;
  paybackMath: string;
  tasks: TimeTask[];
  hoursPerWeek: number;
  timeDollarsPerWeek: number;
  timeMath: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

function moneyAssumptions(i: StarterInputs): Assumption[] {
  const a = (key: string, label: string, value: number, unit: Assumption["unit"]): Assumption => ({
    key,
    label,
    value,
    unit,
    source: "assumption",
  });
  return [
    a("calls_per_day", "Calls per day", i.callsPerDay, "count"),
    a("miss_rate", "Miss rate", i.missRate, "ratio"),
    a("close_rate", "Close rate", i.closeRate, "ratio"),
    a("avg_ticket", "Average ticket", i.avgTicket, "usd"),
    a("days", "Days", i.days, "count"),
  ];
}

export function starterResult(i: StarterInputs): StarterResult {
  const assumptions = moneyAssumptions(i);
  const recovered = computeMonthlyValue(assumptions);
  const net = recovered - Math.round(i.pricePerMonth);
  const perDay = i.days > 0 ? recovered / i.days : 0;
  const paybackDays = perDay <= 0 ? null : Math.ceil(Math.max(0, i.pricePerMonth) / perDay);
  const callsPerWeek = i.callsPerDay * i.missRate * i.daysPerWeek;
  const tasks: TimeTask[] = [
    {
      id: "calls",
      label: "Answered calls",
      minutes: i.minutesPerCall,
      volume: round2(callsPerWeek),
      volumeLabel: "missed calls per week",
      hours: round2((i.minutesPerCall * callsPerWeek) / 60),
      source: "Volume is calls per day x miss rate x days per week. Minutes per call is a labeled default.",
    },
    {
      id: "replies",
      label: "Drafted review replies",
      minutes: i.minutesPerReply,
      volume: i.repliesPerWeek,
      volumeLabel: "replies per week",
      hours: round2((i.minutesPerReply * i.repliesPerWeek) / 60),
      source: "About 10 minutes to read and approve a draft, from the coaching estimate in the ROI calculator. Weekly count is a labeled default.",
    },
    {
      id: "seo",
      label: "Local SEO fixes",
      minutes: i.minutesPerSeo,
      volume: i.seoTasksPerWeek,
      volumeLabel: "fixes per week",
      hours: round2((i.minutesPerSeo * i.seoTasksPerWeek) / 60),
      source: "Labeled default. No coaching estimate is on file for SEO minutes.",
    },
    {
      id: "web",
      label: "Website draft",
      minutes: i.minutesPerWeb,
      volume: i.webTasksPerWeek,
      volumeLabel: "pages per week",
      hours: round2((i.minutesPerWeb * i.webTasksPerWeek) / 60),
      source: "Labeled default for reviewing a draft page. Not a scanned time.",
    },
  ];
  const hoursPerWeek = round2(tasks.reduce((s, t) => s + (t.minutes * (t.id === "calls" ? callsPerWeek : t.volume)) / 60, 0));
  const timeDollarsPerWeek = Math.round(hoursPerWeek * i.hourlyRate);
  const moneyMath = `${i.callsPerDay} x ${Math.round(i.missRate * 100)}% x ${Math.round(i.closeRate * 100)}% x ${usd(i.avgTicket)} x ${i.days} days = ${usd(recovered)}`;
  const netMath = `${usd(recovered)} minus ${usd(i.pricePerMonth)} = ${net < 0 ? "-" : ""}${usd(Math.abs(net))}`;
  const paybackMath =
    paybackDays == null
      ? "Payback: no recovered revenue at these inputs"
      : `${usd(i.pricePerMonth)} / (${usd(recovered)} / ${i.days} days) = ${paybackDays} ${paybackDays === 1 ? "day" : "days"}`;
  const timeMath = tasks.map((t) => `${t.minutes} min x ${t.volume} ${t.volumeLabel}`).join(" + ") + ` = ${hoursPerWeek} h/week`;
  return { recovered, net, paybackDays, moneyMath, netMath, paybackMath, tasks, hoursPerWeek, timeDollarsPerWeek, timeMath };
}

/** Home-services defaults. Every number here is a labeled default, not a scanned fact. */
export const STARTER_DEFAULTS: StarterInputs = {
  callsPerDay: 8,
  missRate: 0.3,
  closeRate: 0.4,
  avgTicket: defaultAvgTicket("HVAC"),
  days: 30,
  pricePerMonth: 149,
  hourlyRate: CALC.hourly_value_usd,
  daysPerWeek: 6,
  minutesPerCall: 8,
  repliesPerWeek: 1.4,
  minutesPerReply: 10,
  seoTasksPerWeek: 1,
  minutesPerSeo: 45,
  webTasksPerWeek: 1,
  minutesPerWeb: 30,
};

export const STARTER_SOURCES: { key: keyof StarterInputs; value: number; source: string }[] = [
  { key: "callsPerDay", value: STARTER_DEFAULTS.callsPerDay, source: "Labeled default for a plumber or HVAC shop. Not from a scan." },
  { key: "missRate", value: STARTER_DEFAULTS.missRate, source: "Labeled default. Not from a scan." },
  { key: "closeRate", value: STARTER_DEFAULTS.closeRate, source: "Same 40% close rate default as the existing ROI engine (src/lib/roi.ts)." },
  { key: "avgTicket", value: STARTER_DEFAULTS.avgTicket, source: "Category default for HVAC from defaultAvgTicket in src/lib/roi.ts. Not a scanned price." },
  { key: "days", value: STARTER_DEFAULTS.days, source: "Labeled default: 30 days, the month this total covers." },
  { key: "pricePerMonth", value: STARTER_DEFAULTS.pricePerMonth, source: "Placeholder. ringring has not set a price." },
  { key: "hourlyRate", value: STARTER_DEFAULTS.hourlyRate, source: "Hourly default in src/data/calculator.json ($50). Labeled default." },
  { key: "daysPerWeek", value: STARTER_DEFAULTS.daysPerWeek, source: "Labeled default. Not from a scan." },
  { key: "minutesPerCall", value: STARTER_DEFAULTS.minutesPerCall, source: "Labeled default for one call the owner would have taken." },
  { key: "repliesPerWeek", value: STARTER_DEFAULTS.repliesPerWeek, source: "Coaching estimate in calculator.json: about 6 replies a month (6 / 4.3 weeks, rounded to 1.4)." },
  { key: "minutesPerReply", value: STARTER_DEFAULTS.minutesPerReply, source: "Coaching estimate in calculator.json: about 10 minutes to read and approve a draft." },
  { key: "seoTasksPerWeek", value: STARTER_DEFAULTS.seoTasksPerWeek, source: "Labeled default. Not from a scan." },
  { key: "minutesPerSeo", value: STARTER_DEFAULTS.minutesPerSeo, source: "Labeled default. No coaching estimate is on file for SEO minutes." },
  { key: "webTasksPerWeek", value: STARTER_DEFAULTS.webTasksPerWeek, source: "Labeled default. Not from a scan." },
  { key: "minutesPerWeb", value: STARTER_DEFAULTS.minutesPerWeb, source: "Labeled default for reviewing one draft page." },
];

export interface ScanPrefill {
  slug: string;
  name: string;
  category: string;
  reviewCount: number;
  /** Under-5 reviews in the sample that have no reply. A count, not a weekly rate. */
  unansweredInSample: number | null;
  sampleRead: number | null;
  /** Category default from defaultAvgTicket. Not a price from the listing. */
  avgTicket: number;
  /** Where the name and review count came from. */
  sourceLabel: string;
}

export function prefillFromCategories(categories: string[], reviewCount: number, unanswered: number | null, sampleRead: number | null, slug: string, name: string): ScanPrefill {
  const category = categories[0] ?? "";
  return {
    slug,
    name,
    category: categories.join(" / ") || category,
    reviewCount,
    unansweredInSample: unanswered,
    sampleRead,
    avgTicket: defaultAvgTicket(categories.join(" ")),
    sourceLabel: "From the Oct 28 scan",
  };
}
