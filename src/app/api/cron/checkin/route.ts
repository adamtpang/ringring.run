import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { runCheckins } from "@/lib/checkin/run";
import { pickChecker, pickClassifier, trackedTargets } from "@/lib/checkin/targets";

// Weekly check-in, called by Vercel Cron (see vercel.json; Hobby runs at most
// once a day, within the scheduled hour). Only opted-in businesses are checked,
// under the hard monthly cap in src/lib/checkin/logic.ts.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(header: string | null, secret: string): boolean {
  const want = Buffer.from(`Bearer ${secret}`);
  const got = Buffer.from(header ?? "");
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  if (!authorized(req.headers.get("authorization"), secret)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const started = Date.now();
  const store = getStore();
  const { targets, missing } = await trackedTargets(store);
  const summary = await runCheckins({
    store,
    checker: pickChecker(targets),
    classifier: pickClassifier(),
    trigger: "cron",
    targets,
    deadline: started + 240_000,
  });
  return NextResponse.json({
    tracked: targets.length,
    missing,
    cap_usd: summary.cap,
    spent_before_usd: summary.spentBefore,
    spent_after_usd: summary.spentAfter,
    outcomes: summary.outcomes.map(({ placeId, kind, status, estCostUsd, actualCostUsd }) => ({ placeId, kind, status, estCostUsd, actualCostUsd })),
  });
}
