import {
  employeeCapacityMs,
  type CapacityAssumptions,
  CAPACITY_ASSUMPTIONS,
  type TimeRange,
} from "./capacity"
import { stepHoldMs, stepProcessingMs } from "./durations"
import type {
  HoldReason,
  JourneyStepStatus,
  QueueState,
  ServiceType,
} from "./types"

/**
 * Manager analytics — all derived live from canonical queue state, never
 * stored. Every function returns one row per counter (or service type), so
 * charts and tables always reflect the same numbers the queues show.
 */

export interface CounterMetric {
  counterId: number
  counterName: string
  employeeName: string
  /** customers this counter has started serving (incl. currently serving) */
  tokensHandled: number
  /** completed service steps at this counter */
  tokensCompleted: number
  /** total time spent serving completed steps, ms */
  totalProcessingMs: number
  /** average per completed step, ms (0 if none) */
  avgProcessingMs: number
  /** customers currently waiting in this counter's queue */
  queueLength: number
  /** is the employee serving someone right now */
  serving: boolean
}

export function counterMetrics(
  state: QueueState,
  now: number = Date.now()
): CounterMetric[] {
  return state.counters.map((counter) => {
    let tokensHandled = 0
    let tokensCompleted = 0
    let totalProcessingMs = 0
    for (const customer of Object.values(state.customers)) {
      for (const step of customer.journey) {
        if (step.counterId !== counter.id) continue
        if (step.startedAt !== null) tokensHandled += 1
        if (step.startedAt !== null && step.completedAt !== null) {
          tokensCompleted += 1
          // hold time is never employee processing time
          totalProcessingMs += stepProcessingMs(step, now)
        }
      }
    }
    return {
      counterId: counter.id,
      counterName: counter.name,
      employeeName: counter.employeeName,
      tokensHandled,
      tokensCompleted,
      totalProcessingMs,
      avgProcessingMs:
        tokensCompleted > 0 ? totalProcessingMs / tokensCompleted : 0,
      queueLength: counter.queue.length + counter.priorityQueue.length,
      serving: counter.currentCustomerId !== null,
    }
  })
}

export interface ServiceTypeMetric {
  serviceType: string
  customers: number
}

export function serviceTypeMetrics(state: QueueState): ServiceTypeMetric[] {
  const counts = new Map<string, number>()
  for (const customer of Object.values(state.customers)) {
    counts.set(customer.serviceType, (counts.get(customer.serviceType) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([serviceType, customers]) => ({ serviceType, customers }))
    .sort((a, b) => b.customers - a.customers)
}

/* ------------------------------------------------------------------------- *
 * Manager drill-down layer — token-level processing records with global
 * Time / Employee / Counter / Service filters, capacity vs actual per
 * employee, and hold metrics. Everything derives from canonical queue state.
 * ------------------------------------------------------------------------- */

export interface StepRecord {
  customerId: string
  token: string
  customerName: string
  serviceType: ServiceType
  counterId: number
  counterName: string
  employeeName: string
  enteredAt: number
  startedAt: number
  completedAt: number | null
  /** active employee time — always excludes hold episodes */
  processingMs: number
  holdMs: number
  holdEvents: number
  holdReasons: HoldReason[]
  status: JourneyStepStatus
}

/** One record per journey step that has STARTED service, newest first. */
export function stepRecords(state: QueueState, now: number): StepRecord[] {
  const records: StepRecord[] = []
  for (const customer of Object.values(state.customers)) {
    for (const step of customer.journey) {
      if (step.startedAt === null) continue
      const counter = state.counters.find((c) => c.id === step.counterId)
      records.push({
        customerId: customer.id,
        token: customer.token,
        customerName: customer.name,
        serviceType: customer.serviceType,
        counterId: step.counterId,
        counterName: step.counterName,
        employeeName: counter?.employeeName ?? "Unknown",
        enteredAt: step.enteredAt,
        startedAt: step.startedAt,
        completedAt: step.completedAt,
        processingMs: stepProcessingMs(step, now),
        holdMs: stepHoldMs(step, now),
        holdEvents: step.holds.length,
        holdReasons: step.holds.map((h) => h.reason),
        status: step.status,
      })
    }
  }
  return records.sort((a, b) => b.startedAt - a.startedAt)
}

export interface ManagerFilters {
  time: TimeRange
  /** employee name or "all" */
  employee: string
  /** counter id or "all" */
  counter: number | "all"
  /** service type or "all" */
  service: ServiceType | "all"
}

export const DEFAULT_FILTERS: ManagerFilters = {
  time: "demo",
  employee: "all",
  counter: "all",
  service: "all",
}

export function isFiltered(filters: ManagerFilters): boolean {
  return (
    filters.time !== DEFAULT_FILTERS.time ||
    filters.employee !== "all" ||
    filters.counter !== "all" ||
    filters.service !== "all"
  )
}

export function filterRecords(
  records: StepRecord[],
  filters: ManagerFilters,
  state: QueueState,
  now: number
): StepRecord[] {
  const windowMs = employeeCapacityMs(filters.time, state, now)
  return records.filter((r) => {
    if (filters.employee !== "all" && r.employeeName !== filters.employee)
      return false
    if (filters.counter !== "all" && r.counterId !== filters.counter)
      return false
    if (filters.service !== "all" && r.serviceType !== filters.service)
      return false
    // time window ends now; the demo scenario always fits inside a shift/day
    if (r.startedAt < now - windowMs) return false
    return true
  })
}

export interface EmployeeUtilization {
  counterId: number
  counterName: string
  employeeName: string
  /** completed service steps in the filtered window */
  tokensProcessed: number
  /** started service steps (incl. current) */
  tokensHandled: number
  actualProcessingMs: number
  avgProcessingMs: number
  holdMs: number
  holdEvents: number
  /** customers currently waiting (priority + normal FIFO) */
  currentQueue: number
  /** customers currently on hold at this counter */
  currentlyHeld: number
  serving: boolean
  /** Estimated Capacity — see lib/capacity.ts assumptions */
  capacityMs: number
  /** actual ÷ capacity, 0..1+ (0 when capacity is 0) */
  utilization: number
  availableMs: number
}

export function employeeUtilization(
  state: QueueState,
  now: number,
  filters: ManagerFilters = DEFAULT_FILTERS,
  assumptions: CapacityAssumptions = CAPACITY_ASSUMPTIONS
): EmployeeUtilization[] {
  const records = filterRecords(stepRecords(state, now), filters, state, now)
  const capacityMs = employeeCapacityMs(filters.time, state, now, assumptions)
  return state.counters
    .filter((c) => filters.counter === "all" || c.id === filters.counter)
    .filter(
      (c) => filters.employee === "all" || c.employeeName === filters.employee
    )
    .map((counter) => {
      const mine = records.filter((r) => r.counterId === counter.id)
      const completed = mine.filter((r) => r.completedAt !== null)
      const actualProcessingMs = mine.reduce((s, r) => s + r.processingMs, 0)
      const holdMs = mine.reduce((s, r) => s + r.holdMs, 0)
      return {
        counterId: counter.id,
        counterName: counter.name,
        employeeName: counter.employeeName,
        tokensProcessed: completed.length,
        tokensHandled: mine.length,
        actualProcessingMs,
        avgProcessingMs:
          completed.length > 0
            ? completed.reduce((s, r) => s + r.processingMs, 0) / completed.length
            : 0,
        holdMs,
        holdEvents: mine.reduce((s, r) => s + r.holdEvents, 0),
        currentQueue: counter.queue.length + counter.priorityQueue.length,
        currentlyHeld: counter.heldIds.length,
        serving: counter.currentCustomerId !== null,
        capacityMs,
        utilization: capacityMs > 0 ? actualProcessingMs / capacityMs : 0,
        availableMs: Math.max(0, capacityMs - actualProcessingMs),
      }
    })
}

export interface ManagerKpis {
  tokensProcessed: number
  activeTokens: number
  totalProcessingMs: number
  avgServiceMs: number
  mostLoaded: EmployeeUtilization | null
  /** branch actual ÷ branch capacity, 0..1+ */
  utilization: number
  branchCapacityMs: number
  branchAvailableMs: number
  totalHoldMs: number
  tokensOnHold: number
}

export function managerKpis(
  state: QueueState,
  now: number,
  filters: ManagerFilters = DEFAULT_FILTERS
): ManagerKpis {
  const rows = employeeUtilization(state, now, filters)
  const records = filterRecords(stepRecords(state, now), filters, state, now)
  const completed = records.filter((r) => r.completedAt !== null)
  const totalProcessingMs = rows.reduce((s, r) => s + r.actualProcessingMs, 0)
  const branchCapacityMs = rows.reduce((s, r) => s + r.capacityMs, 0)
  const activeTokens = Object.values(state.customers).filter(
    (c) =>
      c.status !== "completed" &&
      (filters.counter === "all" || c.currentCounterId === filters.counter) &&
      (filters.service === "all" || c.serviceType === filters.service) &&
      (filters.employee === "all" ||
        state.counters.find((k) => k.id === c.currentCounterId)?.employeeName ===
          filters.employee)
  ).length
  const mostLoaded =
    rows.length > 0
      ? rows.reduce((a, b) => (b.actualProcessingMs > a.actualProcessingMs ? b : a))
      : null
  return {
    tokensProcessed: completed.length,
    activeTokens,
    totalProcessingMs,
    avgServiceMs:
      completed.length > 0
        ? completed.reduce((s, r) => s + r.processingMs, 0) / completed.length
        : 0,
    mostLoaded,
    utilization: branchCapacityMs > 0 ? totalProcessingMs / branchCapacityMs : 0,
    branchCapacityMs,
    branchAvailableMs: Math.max(0, branchCapacityMs - totalProcessingMs),
    totalHoldMs: records.reduce((s, r) => s + r.holdMs, 0),
    tokensOnHold: state.counters.reduce((s, c) => s + c.heldIds.length, 0),
  }
}

export interface ServiceAverage {
  serviceType: ServiceType
  completed: number
  avgProcessingMs: number
}

/** Average service time by service type (completed steps only). */
export function serviceAverages(records: StepRecord[]): ServiceAverage[] {
  const byService = new Map<ServiceType, { total: number; count: number }>()
  for (const r of records) {
    if (r.completedAt === null) continue
    const entry = byService.get(r.serviceType) ?? { total: 0, count: 0 }
    entry.total += r.processingMs
    entry.count += 1
    byService.set(r.serviceType, entry)
  }
  return [...byService.entries()]
    .map(([serviceType, { total, count }]) => ({
      serviceType,
      completed: count,
      avgProcessingMs: total / count,
    }))
    .sort((a, b) => b.avgProcessingMs - a.avgProcessingMs)
}

export interface HoldReasonCount {
  reason: HoldReason
  count: number
}

export function holdReasonDistribution(records: StepRecord[]): HoldReasonCount[] {
  const counts = new Map<HoldReason, number>()
  for (const r of records) {
    for (const reason of r.holdReasons) {
      counts.set(reason, (counts.get(reason) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
}
