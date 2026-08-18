import type { QueueState } from "./types"

/**
 * ESTIMATED CAPACITY — a deliberately simple, deterministic prototype model of
 * theoretically available employee/counter service time. This is NOT a
 * production workforce forecasting model; the assumptions below are demo
 * configuration, clearly labeled "Estimated Capacity" in the UI.
 */

export interface CapacityAssumptions {
  /** working hours per employee per full shift/day */
  workingHoursPerShift: number
  /** break time per full shift, minutes */
  breakMinutes: number
  /** counters staffed and open */
  countersAvailable: number
}

export const CAPACITY_ASSUMPTIONS: CapacityAssumptions = {
  workingHoursPerShift: 8,
  breakMinutes: 45,
  countersAvailable: 4,
}

export type TimeRange = "today" | "shift" | "demo"

export const TIME_RANGE_LABELS: Record<TimeRange, string> = {
  today: "Today",
  shift: "Current Shift",
  demo: "Current Demo",
}

/** the observed demo window: earliest token issued → now */
export function demoWindowMs(state: QueueState, now: number): number {
  const customers = Object.values(state.customers)
  if (customers.length === 0) return 0
  const earliest = Math.min(...customers.map((c) => c.createdAt))
  return Math.max(0, now - earliest)
}

/**
 * Available service time per employee for the selected window, ms.
 * - Today:         full shift minus break (8h − 45m = 7h 15m by default)
 * - Current Shift: half a working day, break pro-rated
 * - Current Demo:  the observed demo window itself (what could have been
 *                  served since the first token was issued)
 */
export function employeeCapacityMs(
  range: TimeRange,
  state: QueueState,
  now: number,
  assumptions: CapacityAssumptions = CAPACITY_ASSUMPTIONS
): number {
  const fullShiftMs =
    (assumptions.workingHoursPerShift * 60 - assumptions.breakMinutes) * 60_000
  switch (range) {
    case "today":
      return fullShiftMs
    case "shift":
      return Math.round(fullShiftMs / 2)
    case "demo":
      return demoWindowMs(state, now)
  }
}
