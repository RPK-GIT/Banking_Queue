/**
 * Per-chart visualization preferences (e.g. Employee Workload → donut),
 * persisted locally. Business data is never stored here.
 */

export type VizType =
  | "h-bar"
  | "v-bar"
  | "donut"
  | "pie"
  | "table"

const STORAGE_KEY = "smart-bank-queue-viz-v1"

interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

function defaultStorage(): StorageLike | null {
  return typeof window === "undefined" ? null : window.localStorage
}

export function loadVizPrefs(
  storage: StorageLike | null = defaultStorage()
): Record<string, VizType> {
  if (!storage) return {}
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return typeof parsed === "object" && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

export function saveVizPref(
  chartId: string,
  viz: VizType,
  storage: StorageLike | null = defaultStorage()
): void {
  if (!storage) return
  try {
    const prefs = loadVizPrefs(storage)
    prefs[chartId] = viz
    storage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    // storage unavailable — preference simply won't persist
  }
}

export function getVizPref(
  chartId: string,
  fallback: VizType,
  storage: StorageLike | null = defaultStorage()
): VizType {
  const stored = loadVizPrefs(storage)[chartId]
  return stored ?? fallback
}
