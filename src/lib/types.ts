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

export type CustomerStatus = "waiting" | "serving" | "completed"

export type JourneyStepStatus = "waiting" | "serving" | "completed"

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
}

export type ActivityType =
  | "token-issued"
  | "called"
  | "service-completed"
  | "transferred"
  | "journey-completed"
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
