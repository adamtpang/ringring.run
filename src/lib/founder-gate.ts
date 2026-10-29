import { timingSafeEqual } from "node:crypto";

/** True only when FOUNDER_KEY is set and the presented value matches it. */
export function founderKeyOk(presented: string | undefined, expected = process.env.FOUNDER_KEY): boolean {
  if (!expected || !presented) return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export const FOUNDER_COOKIE = "rr_founder";
