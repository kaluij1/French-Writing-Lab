"use client";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { LocalStore } from "./local";
import { SupabaseStore } from "./supabase";
import type { DataStore } from "./types";

let store: DataStore | null = null;

export function getStore(): DataStore {
  store ??= isSupabaseConfigured ? new SupabaseStore(getSupabaseBrowserClient()) : new LocalStore();
  return store;
}

export * from "./types";
