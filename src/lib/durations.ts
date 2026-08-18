import type { Customer, JourneyStep } from "./types"

/**
 * Time accounting — the critical distinction for Manager Analytics:
 *
 *   Processing Time  = time an employee actively served the customer
 *   Hold Time        = hold start → hold release (NEVER counted as processing)
 *   Priority wait    = hold release → service resumed (neither of the above)
 *   Journey Time     = token issued → journey completed
 *
 * All values are derived from the journey audit trail, never stored.
 */

/** Total hold time for one service step (open holds run until `now`). */
export function stepHoldMs(step: JourneyStep, now: number): number {
  return step.holds.reduce(
    (sum, h) => sum + Math.max(0, (h.releasedAt ?? now) - h.startedAt),
    0
  )
}

/**
 * Active processing time for one service step — excludes every hold episode
 * and the priority wait after a release (hold start → service resumed).
 */
export function stepProcessingMs(step: JourneyStep, now: number): number {
  if (step.startedAt === null) return 0
  const end = step.completedAt ?? now
  const nonProcessing = step.holds.reduce(
    (sum, h) => sum + Math.max(0, Math.min(h.resumedAt ?? end, end) - h.startedAt),
    0
  )
  return Math.max(0, end - step.startedAt - nonProcessing)
}

/** Number of hold episodes recorded on a step. */
export function stepHoldCount(step: JourneyStep): number {
  return step.holds.length
}

export interface CustomerTotals {
  /** token issued → completed (or now) */
  journeyMs: number
  /** active employee processing across all counters */
  processingMs: number
  /** total time spent on hold across all counters */
  holdMs: number
  holdEvents: number
}

export function customerTotals(customer: Customer, now: number): CustomerTotals {
  const end = customer.completedAt ?? now
  let processingMs = 0
  let holdMs = 0
  let holdEvents = 0
  for (const step of customer.journey) {
    processingMs += stepProcessingMs(step, now)
    holdMs += stepHoldMs(step, now)
    holdEvents += step.holds.length
  }
  return {
    journeyMs: Math.max(0, end - customer.createdAt),
    processingMs,
    holdMs,
    holdEvents,
  }
}
