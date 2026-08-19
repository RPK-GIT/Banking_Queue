export const SERVICE_TYPES = [
  "Cash Deposit",
  "Cash Withdrawal",
  "Account Opening",
  "KYC Update",
  "Cheque Services",
  "Demand Draft",
  "Loan Enquiry",
  "Address Update",
  "Other",
] as const

export type ServiceType = (typeof SERVICE_TYPES)[number]

export type CustomerStatus = "waiting" | "serving" | "on-hold" | "completed"

export type JourneyStepStatus = "waiting" | "serving" | "on-hold" | "completed"

export const HOLD_REASONS = [
  "Waiting for customer",
  "Document required",
  "Verification pending",
  "System issue",
  "Other",
] as const

export type HoldReason = (typeof HOLD_REASONS)[number]

/**
 * One hold episode inside a service step. Hold time = releasedAt − startedAt.
 * The gap releasedAt → resumedAt (waiting as "next after current") counts as
 * neither hold nor processing time.
 */
export interface HoldRecord {
  reason: HoldReason
  /** epoch ms — when the employee put the customer on hold */
  startedAt: number
  /** epoch ms — when the hold was released (priority wait begins) */
  releasedAt: number | null
  /** epoch ms — when service actually resumed after the release */
  resumedAt: number | null
}

/**
 * One employee-break pause inside a service step — the customer keeps their
 * exact service position while the employee is away. Break time is never
 * counted as active processing time.
 */
export interface BreakRecord {
  /** epoch ms — when the employee's break paused this service */
  startedAt: number
  /** epoch ms — when the employee returned and service resumed */
  endedAt: number | null
}

export interface JourneyStep {
  counterId: number
  counterName: string
  /** epoch ms — when the customer entered this counter's queue */
  enteredAt: number
  /** epoch ms — when service started at this counter */
  startedAt: number | null
  /** epoch ms — when service finished at this counter */
  completedAt: number | null
  status: JourneyStepStatus
  /** hold episodes at this counter, oldest first */
  holds: HoldRecord[]
  /** employee-break pauses while this step was being served, oldest first */
  breaks: BreakRecord[]
}

export interface Customer {
  id: string
  token: string
  name: string
  serviceType: ServiceType
  /** epoch ms — journey start (token issued) */
  createdAt: number
  status: CustomerStatus
  /** counter the customer is currently waiting at / being served by */
  currentCounterId: number | null
  /** complete audit trail, oldest first */
  journey: JourneyStep[]
  /** planned upcoming counters (demo storytelling only — not a queue) */
  plannedRoute: number[]
  /** epoch ms — when the overall journey completed */
  completedAt: number | null
}

export type CounterStatus = "available" | "serving" | "on-break"

/**
 * Journey-aware FIFO — each counter holds THREE ordered waiting tiers,
 * always consumed top-down, strictly FIFO within each tier:
 *
 *   1. releasedQueue  — NEXT AFTER CURRENT: released holds, in release order
 *   2. priorityQueue  — JOURNEY IN PROGRESS: customers whose journey already
 *                       started elsewhere, in arrival order at THIS counter
 *   3. queue          — NEW REQUESTS: journeys that have never started
 *
 * ON HOLD customers live outside all tiers; EMPLOYEE BREAK is counter state.
 */
export interface Counter {
  id: number
  number: number
  name: string
  employeeName: string
  status: CounterStatus
  /** kept during an employee break — the paused customer's service resumes */
  currentCustomerId: string | null
  /** NEW REQUESTS — journeys never started; strict FIFO */
  queue: string[]
  /** JOURNEY IN PROGRESS — started elsewhere; FIFO by arrival at this counter */
  priorityQueue: string[]
  /** NEXT AFTER CURRENT — released holds; FIFO by release time */
  releasedQueue: string[]
  /** customers currently ON HOLD at this counter — outside FIFO entirely */
  heldIds: string[]
  /** employee break log, oldest first — open break = last entry, endedAt null */
  breaks: BreakRecord[]
  /**
   * QUEUE OVERRIDE — an employee's pending "serve this one next" choice.
   * Applied exactly ONCE by the assignment engine when the counter next
   * becomes free; the queue tiers themselves are NEVER reordered.
   */
  nextOverrideId: string | null
  nextOverrideReason: string | null
}

export const OVERRIDE_REASONS = [
  "Customer ready",
  "Customer urgency",
  "Operational reason",
  "Customer request",
  "Other",
] as const

export type OverrideReason = (typeof OVERRIDE_REASONS)[number]

/** Audit record — every manual queue override, recorded when it takes effect. */
export interface OverrideRecord {
  id: string
  /** epoch ms — when the override actually assigned the selected customer */
  at: number
  counterId: number
  employeeName: string
  recommendedToken: string
  recommendedName: string
  selectedToken: string
  selectedName: string
  /** reason is always OPTIONAL — never force the employee to justify */
  reason: OverrideReason | null
}

export type ActivityType =
  | "token-issued"
  | "called"
  | "service-completed"
  | "transferred"
  | "journey-completed"
  | "held"
  | "hold-released"
  | "break-started"
  | "break-ended"
  | "queue-override"
  | "reset"

export interface Activity {
  id: string
  timestamp: number
  type: ActivityType
  customerId: string | null
  message: string
}

export interface QueueState {
  customers: Record<string, Customer>
  counters: Counter[]
  activities: Activity[]
  /** full queue-override audit history, oldest first */
  overrides: OverrideRecord[]
  nextTokenNumber: number
}
