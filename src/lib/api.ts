import { NextResponse } from "next/server";
import { errorMessage } from "./retry";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export function fail(error: unknown, status = 500) {
  return json({ error: errorMessage(error) }, status);
}
