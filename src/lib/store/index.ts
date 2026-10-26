import path from "node:path";
import { runtimeMode } from "../env";
import { createLocalStore } from "./local";
import { createSupabaseStore } from "./supabase";
import type { Store } from "./types";

const g = globalThis as unknown as { __ringringStore?: Store };

export function localDbPath(): string {
  return process.env.LOCAL_DB_PATH || path.join(process.cwd(), ".data", "local-db.json");
}

export function getStore(): Store {
  if (g.__ringringStore) return g.__ringringStore;
  const mode = runtimeMode();
  g.__ringringStore =
    mode.store === "supabase"
      ? createSupabaseStore(process.env.SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string)
      : createLocalStore({ file: localDbPath() });
  return g.__ringringStore;
}

export type { Store } from "./types";
