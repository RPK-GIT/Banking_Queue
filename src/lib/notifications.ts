import { toast } from "sonner"

import type { ActivityType } from "./types"

/**
 * Calm-notification policy: at most ONE transient notification is visible at
 * any time. Every transient shares the same toast id, so a new event REPLACES
 * the previous one instead of stacking. Full history lives in the Activity
 * Center — nothing is lost.
 */

export const TRANSIENT_TOAST_ID = "live-event"
export const TRANSIENT_DURATION_MS = 2500

export type NotificationPriority = "high" | "low"

/**
 * High-value events earn a transient notification; low-value events are only
 * recorded in the Activity Center.
 */
export function activityPriority(type: ActivityType): NotificationPriority {
  switch (type) {
    case "token-issued":
    case "called":
    case "transferred":
    case "journey-completed":
      return "high"
    default:
      // service-completed (a counter finishing its part before a transfer),
      // reset and other routine events stay out of the way
      return "low"
  }
}

interface TransientOptions {
  description?: string
  kind?: "info" | "success" | "error"
  durationMs?: number
}

/** Show (or replace) THE single transient notification. Never stacks. */
export function notifyTransient(
  title: string,
  { description, kind = "info", durationMs = TRANSIENT_DURATION_MS }: TransientOptions = {}
): void {
  const fn =
    kind === "success" ? toast.success : kind === "error" ? toast.error : toast.info
  fn(title, {
    id: TRANSIENT_TOAST_ID,
    description,
    duration: durationMs,
  })
}
