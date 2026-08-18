import { customerTotals, stepProcessingMs } from "./durations"
import { isPriority, queuePosition } from "./queue-logic"
import type { Customer, CustomerStatus, QueueState } from "./types"
import { ESTIMATED_MINUTES_PER_CUSTOMER } from "./whatsapp"

/**
 * Main-dashboard KPI drill-downs — read-only row derivations for the records
 * BEHIND each KPI number. Pure functions of (state, now) so the panels always
 * match the KPI strip exactly and never mutate queue state.
 */

export interface ActiveCustomerRow {
  customerId: string
  token: string
  name: string
  serviceType: string
  counterId: number | null
  status: CustomerStatus
  /** true when waiting with restored priority after a hold release */
  priority: boolean
  /** 1-based position in the counter's line, null unless waiting */
  position: number | null
  /** time since entering the current counter's queue (waiting) */
  waitingMs: number
  estWaitMin: number | null
}

function toActiveRow(
  state: QueueState,
  customer: Customer,
  now: number
): ActiveCustomerRow {
  const step = customer.journey[customer.journey.length - 1]
  const position =
    customer.status === "waiting" ? queuePosition(state, customer.id) : null
  return {
    customerId: customer.id,
    token: customer.token,
    name: customer.name,
    serviceType: customer.serviceType,
    counterId: customer.currentCounterId,
    status: customer.status,
    priority: isPriority(state, customer.id),
    position,
    waitingMs: Math.max(0, now - step.enteredAt),
    estWaitMin:
      position !== null
        ? Math.floor(position * ESTIMATED_MINUTES_PER_CUSTOMER)
        : null,
  }
}

function byToken(a: { token: string }, b: { token: string }): number {
  return a.token.localeCompare(b.token, undefined, { numeric: true })
}

/** Customers in Branch — everyone currently waiting, served or on hold. */
export function customersInBranchRows(
  state: QueueState,
  now: number
): ActiveCustomerRow[] {
  return Object.values(state.customers)
    .filter((c) => c.status !== "completed")
    .map((c) => toActiveRow(state, c, now))
    .sort(byToken)
}

/** Waiting — only customers in a queue right now, grouped by counter. */
export function waitingRows(state: QueueState, now: number): ActiveCustomerRow[] {
  return Object.values(state.customers)
    .filter((c) => c.status === "waiting")
    .map((c) => toActiveRow(state, c, now))
    .sort(
      (a, b) =>
        (a.counterId ?? 0) - (b.counterId ?? 0) ||
        (a.position ?? 0) - (b.position ?? 0)
    )
}

export interface ServingRow {
  customerId: string
  token: string
  name: string
  serviceType: string
  counterId: number
  employeeName: string
  startedAt: number
  /** live active processing time — excludes any hold episodes */
  processingMs: number
}

/** Being Served — active service right now, with live processing time. */
export function servingRows(state: QueueState, now: number): ServingRow[] {
  const rows: ServingRow[] = []
  for (const counter of state.counters) {
    if (!counter.currentCustomerId) continue
    const customer = state.customers[counter.currentCustomerId]
    if (!customer) continue
    const step = customer.journey[customer.journey.length - 1]
    rows.push({
      customerId: customer.id,
      token: customer.token,
      name: customer.name,
      serviceType: customer.serviceType,
      counterId: counter.id,
      employeeName: counter.employeeName,
      startedAt: step.startedAt ?? step.enteredAt,
      processingMs: stepProcessingMs(step, now),
    })
  }
  return rows.sort((a, b) => a.counterId - b.counterId)
}

export interface CompletedRow {
  customerId: string
  token: string
  name: string
  serviceType: string
  /** counters visited in order, e.g. [1, 4, 3, 1] */
  countersVisited: number[]
  journeyMs: number
  processingMs: number
  holdMs: number
  completedAt: number
}

/** Completed — full journeys with processing vs hold time split out. */
export function completedRows(state: QueueState, now: number): CompletedRow[] {
  return Object.values(state.customers)
    .filter((c) => c.status === "completed" && c.completedAt !== null)
    .map((c) => {
      const totals = customerTotals(c, now)
      return {
        customerId: c.id,
        token: c.token,
        name: c.name,
        serviceType: c.serviceType,
        countersVisited: c.journey.map((s) => s.counterId),
        journeyMs: totals.journeyMs,
        processingMs: totals.processingMs,
        holdMs: totals.holdMs,
        completedAt: c.completedAt!,
      }
    })
    .sort((a, b) => b.completedAt - a.completedAt)
}

export interface WaitRecordRow {
  customerId: string
  token: string
  name: string
  serviceType: string
  counterId: number | null
  status: CustomerStatus
  /** the exact value contributing to the Average Wait KPI */
  waitMs: number
}

export interface AvgWaitBreakdown {
  rows: WaitRecordRow[]
  avgMs: number
  minMs: number
  maxMs: number
}

/**
 * Average Wait — the underlying records. The KPI averages time-in-branch
 * (token issued → now) over every ACTIVE customer; the same records and the
 * same formula are shown here.
 */
export function avgWaitBreakdown(state: QueueState, now: number): AvgWaitBreakdown {
  const rows = Object.values(state.customers)
    .filter((c) => c.status !== "completed")
    .map((c) => ({
      customerId: c.id,
      token: c.token,
      name: c.name,
      serviceType: c.serviceType,
      counterId: c.currentCounterId,
      status: c.status,
      waitMs: Math.max(0, now - c.createdAt),
    }))
    .sort((a, b) => b.waitMs - a.waitMs)
  const waits = rows.map((r) => r.waitMs)
  return {
    rows,
    avgMs: waits.length ? waits.reduce((a, b) => a + b, 0) / waits.length : 0,
    minMs: waits.length ? Math.min(...waits) : 0,
    maxMs: waits.length ? Math.max(...waits) : 0,
  }
}
