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

export async function setSetting(key: string, value: string): Promise<void> {
  await db
    .insert(systemSettings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: systemSettings.key, set: { value, updatedAt: new Date() } });
  cache.set(key, value);
}

export async function refreshSettings(): Promise<void> {
  await loadSettings();
}

export function isSettingsLoaded(): boolean {
  return loaded;
}

/** إرجاع كل الإعدادات من الكاش مباشرةً (بدون DB) */
export function getAllSettings(): Record<string, string> {
  return Object.fromEntries(cache);
}
