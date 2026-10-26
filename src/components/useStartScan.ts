"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

export type ScanRequest = { name: string; city: string } | { category: string; city: string; maxCount: number };

/** Starts a scan through POST /api/scan and opens its run timeline. Shared by /dashboard, /owners and /find. */
export function useStartScan() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(
    async (input: ScanRequest) => {
      setSubmitting(true);
      setError(null);
      try {
        const res = await fetch("/api/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.issues?.join("; ") || body.error || "Scan failed to start");
        router.push(`/runs/${body.run.id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setSubmitting(false);
      }
    },
    [router],
  );

  return { start, submitting, error };
}
