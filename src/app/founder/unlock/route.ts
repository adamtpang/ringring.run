import { NextResponse } from "next/server";
import { FOUNDER_COOKIE, founderKeyOk } from "@/lib/founder-gate";

/** Sets a cookie when the key matches, then opens /founder without the key in the address. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key") ?? "";
  if (!founderKeyOk(key)) return new NextResponse(null, { status: 404 });
  const res = NextResponse.redirect(new URL("/founder", url));
  res.cookies.set(FOUNDER_COOKIE, key, {
    httpOnly: true,
    sameSite: "lax",
    path: "/founder",
    maxAge: 60 * 60 * 24 * 14,
    secure: url.protocol === "https:",
  });
  return res;
}
