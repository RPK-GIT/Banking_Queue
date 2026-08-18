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

export type CounterStatus = "available" | "serving"

export interface Counter {
  id: number
  number: number
  name: string
  employeeName: string
  status: CounterStatus
  currentCustomerId: string | null
  /** customer ids in strict FIFO order — index 0 is served next */
  queue: string[]
  /**
   * released-from-hold customers, in release order — served BEFORE the normal
   * FIFO queue ("next after current"). They already started service, so a
   * release restores their priority rather than sending them to the back.
   */
  priorityQueue: string[]
  /** customers currently ON HOLD at this counter — outside FIFO entirely */
  heldIds: string[]
}

export type ActivityType =
  | "token-issued"
  | "called"
  | "service-completed"
  | "transferred"
  | "journey-completed"
  | "held"
  | "hold-released"
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
  nextTokenNumber: number
}
