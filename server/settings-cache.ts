import { db } from "./db";
import { systemSettings } from "@shared/schema";

let cache: Map<string, string> = new Map();
let loaded = false;

export async function loadSettings(): Promise<void> {
  const rows = await db.select().from(systemSettings);
  cache = new Map(rows.map(r => [r.key, r.value]));
  loaded = true;
}

export function getSetting(key: string, defaultValue: string = ""): string {
  return cache.get(key) ?? defaultValue;
}

export async function refreshSettings(): Promise<void> {
  await loadSettings();
}

export function isSettingsLoaded(): boolean {
  return loaded;
}
