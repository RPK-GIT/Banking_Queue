import { describe, expect, it } from "vitest"

import {
  counterMetrics,
  DEFAULT_FILTERS,
  employeeUtilization,
  filterRecords,
  holdReasonDistribution,
  isFiltered,
  managerKpis,
  serviceAverages,
  serviceTypeMetrics,
  stepRecords,
  type ManagerFilters,
} from "./analytics"
import { demoWindowMs, employeeCapacityMs } from "./capacity"
import {
  completeCurrentService,
  emptyState,
  endBreak,
  holdCurrentCustomer,
  issueToken,
  releaseHold,
  startBreak,
  waitingCount,
} from "./queue-logic"
import { seedState } from "./seed"

const NOW = 1_755_000_000_000
const MIN = 60_000

describe("manager analytics (derived from canonical queue state)", () => {
  it("produces exactly one row per counter — four counters, four employees", () => {
    const metrics = counterMetrics(seedState(NOW))
    expect(metrics).toHaveLength(4)
    expect(metrics.map((m) => m.counterId)).toEqual([1, 2, 3, 4])
    expect(metrics.map((m) => m.employeeName)).toEqual([
      "Priya",
      "Arjun",
      "Kavita",
      "Deepa",
    ])
  })

  it("stays synchronized with queue state", () => {
    const state = seedState(NOW)
    const metrics = counterMetrics(state)
    for (const metric of metrics) {
      const counter = state.counters.find((c) => c.id === metric.counterId)!
      expect(metric.queueLength).toBe(waitingCount(counter))
      expect(metric.serving).toBe(counter.currentCustomerId !== null)
    }
  })

  it("computes processing time only from completed service steps", () => {
    const metrics = counterMetrics(seedState(NOW))
    for (const metric of metrics) {
      if (metric.tokensCompleted === 0) {
        expect(metric.avgProcessingMs).toBe(0)
      } else {
        expect(metric.avgProcessingMs).toBeGreaterThan(0)
        expect(metric.totalProcessingMs).toBeGreaterThanOrEqual(
          metric.avgProcessingMs
        )
      }
    }
  })

  it("is a pure derivation — same state yields identical analytics", () => {
    const state = seedState(NOW)
    expect(counterMetrics(state)).toEqual(counterMetrics(state))
    expect(serviceTypeMetrics(state)).toEqual(serviceTypeMetrics(state))
  })

  it("aggregates customers by service type", () => {
    const state = seedState(NOW)
    const metrics = serviceTypeMetrics(state)
    const total = metrics.reduce((sum, m) => sum + m.customers, 0)
    expect(total).toBe(Object.keys(state.customers).length)
    // sorted descending for readable charts
    for (let i = 1; i < metrics.length; i++) {
      expect(metrics[i - 1].customers).toBeGreaterThanOrEqual(metrics[i].customers)
    }
  })
})

describe("Estimated Capacity (deterministic prototype model)", () => {
  it("Today = full shift minus break (8h − 45m)", () => {
    const state = seedState(NOW)
    expect(employeeCapacityMs("today", state, NOW)).toBe(435 * MIN)
  })

  it("Current Shift = half a working day", () => {
    const state = seedState(NOW)
    expect(employeeCapacityMs("shift", state, NOW)).toBe(Math.round((435 * MIN) / 2))
  })

  it("Current Demo = observed demo window (first token → now)", () => {
    const state = seedState(NOW)
    // earliest seeded token was issued 45 minutes ago
    expect(demoWindowMs(state, NOW)).toBe(45 * MIN)
    expect(employeeCapacityMs("demo", state, NOW)).toBe(45 * MIN)
    expect(demoWindowMs(emptyState(), NOW)).toBe(0)
  })

  it("is deterministic — same inputs, same capacity", () => {
    const state = seedState(NOW)
    expect(employeeCapacityMs("demo", state, NOW)).toBe(
      employeeCapacityMs("demo", state, NOW)
    )
  })
})

describe("manager filters (time / employee / counter / service)", () => {
  function filters(partial: Partial<ManagerFilters>): ManagerFilters {
    return { ...DEFAULT_FILTERS, ...partial }
  }

  it("Actual records derive one row per STARTED service step", () => {
    const state = seedState(NOW)
    const records = stepRecords(state, NOW)
    let started = 0
    for (const c of Object.values(state.customers)) {
      for (const s of c.journey) if (s.startedAt !== null) started += 1
    }
    expect(records).toHaveLength(started)
  })

  it("employee filter keeps only that employee's records", () => {
    const state = seedState(NOW)
    const all = stepRecords(state, NOW)
    const priya = filterRecords(all, filters({ employee: "Priya" }), state, NOW)
    expect(priya.length).toBeGreaterThan(0)
    expect(priya.every((r) => r.employeeName === "Priya")).toBe(true)
    expect(priya.every((r) => r.counterId === 1)).toBe(true)
  })

  it("counter filter keeps only that counter's records", () => {
    const state = seedState(NOW)
    const all = stepRecords(state, NOW)
    const c4 = filterRecords(all, filters({ counter: 4 }), state, NOW)
    expect(c4.length).toBeGreaterThan(0)
    expect(c4.every((r) => r.counterId === 4)).toBe(true)
  })

  it("service type filter keeps only that service's records", () => {
    const state = seedState(NOW)
    const all = stepRecords(state, NOW)
    const kyc = filterRecords(all, filters({ service: "KYC Update" }), state, NOW)
    expect(kyc.length).toBeGreaterThan(0)
    expect(kyc.every((r) => r.serviceType === "KYC Update")).toBe(true)
  })

  it("time filter drops records that started outside the window", () => {
    const state = emptyState()
    // one step started 500 minutes ago — outside Today's 435-minute window
    // (issuing to an idle counter starts service automatically)
    issueToken(
      state,
      { name: "Old", serviceType: "Cash Deposit", counterId: 1 },
      NOW - 500 * MIN
    )
    completeCurrentService(state, 1, NOW - 490 * MIN)
    issueToken(
      state,
      { name: "Recent", serviceType: "Cash Deposit", counterId: 1 },
      NOW - 10 * MIN
    )

    const all = stepRecords(state, NOW)
    expect(all).toHaveLength(2)
    const today = filterRecords(all, filters({ time: "today" }), state, NOW)
    expect(today.map((r) => r.customerName)).toEqual(["Recent"])
  })

  it("Clear Filters restores the unfiltered view (DEFAULT_FILTERS)", () => {
    const state = seedState(NOW)
    const all = stepRecords(state, NOW)
    expect(isFiltered(DEFAULT_FILTERS)).toBe(false)
    expect(isFiltered(filters({ employee: "Priya" }))).toBe(true)
    expect(filterRecords(all, DEFAULT_FILTERS, state, NOW)).toHaveLength(all.length)
  })

  it("filters update utilization and KPIs consistently", () => {
    const state = seedState(NOW)
    const rows = employeeUtilization(state, NOW, filters({ employee: "Priya" }))
    expect(rows).toHaveLength(1)
    expect(rows[0].employeeName).toBe("Priya")

    const kpis = managerKpis(state, NOW, filters({ counter: 2 }))
    const unfiltered = managerKpis(state, NOW)
    expect(kpis.tokensProcessed).toBeLessThanOrEqual(unfiltered.tokensProcessed)
  })
})

describe("capacity vs actual (Actual vs Capacity view)", () => {
  it("utilization = actual processing ÷ estimated capacity, with available time", () => {
    const state = seedState(NOW)
    const rows = employeeUtilization(state, NOW)
    expect(rows).toHaveLength(4)
    for (const row of rows) {
      expect(row.capacityMs).toBe(45 * MIN) // demo window
      expect(row.utilization).toBeCloseTo(
        row.capacityMs > 0 ? row.actualProcessingMs / row.capacityMs : 0,
        10
      )
      expect(row.availableMs).toBe(
        Math.max(0, row.capacityMs - row.actualProcessingMs)
      )
    }
  })

  it("branch KPIs aggregate the same rows the tables show", () => {
    const state = seedState(NOW)
    const rows = employeeUtilization(state, NOW)
    const kpis = managerKpis(state, NOW)
    expect(kpis.totalProcessingMs).toBe(
      rows.reduce((s, r) => s + r.actualProcessingMs, 0)
    )
    expect(kpis.branchCapacityMs).toBe(rows.reduce((s, r) => s + r.capacityMs, 0))
    expect(kpis.mostLoaded?.actualProcessingMs).toBe(
      Math.max(...rows.map((r) => r.actualProcessingMs))
    )
  })
})

describe("hold metrics in manager analytics", () => {
  function stateWithHold() {
    const state = emptyState()
    const c = issueToken(
      state,
      { name: "Held", serviceType: "KYC Update", counterId: 1 },
      NOW - 30 * MIN // idle counter → serving immediately
    )
    holdCurrentCustomer(state, 1, "Document required", NOW - 25 * MIN)
    releaseHold(state, c.id, NOW - 15 * MIN) // idle → resumes immediately
    completeCurrentService(state, 1, NOW - 10 * MIN)
    return state
  }

  it("separates processing time from hold time in records and KPIs", () => {
    const state = stateWithHold()
    const [record] = stepRecords(state, NOW)
    expect(record.holdMs).toBe(10 * MIN)
    expect(record.processingMs).toBe(10 * MIN) // 5m before + 5m after hold
    expect(record.holdEvents).toBe(1)

    const kpis = managerKpis(state, NOW)
    expect(kpis.totalHoldMs).toBe(10 * MIN)
    expect(kpis.totalProcessingMs).toBe(10 * MIN)
  })

  it("counts tokens currently on hold", () => {
    const state = emptyState()
    issueToken(
      state,
      { name: "Now Held", serviceType: "Other", counterId: 2 },
      NOW - 5 * MIN // serving immediately
    )
    holdCurrentCustomer(state, 2, "System issue", NOW - MIN)
    expect(managerKpis(state, NOW).tokensOnHold).toBe(1)
  })

  it("aggregates hold reasons for the distribution drill-down", () => {
    const state = stateWithHold()
    const reasons = holdReasonDistribution(stepRecords(state, NOW))
    expect(reasons).toEqual([{ reason: "Document required", count: 1 }])
  })

  it("computes per-service averages from completed steps", () => {
    const state = stateWithHold()
    const averages = serviceAverages(stepRecords(state, NOW))
    expect(averages).toEqual([
      { serviceType: "KYC Update", completed: 1, avgProcessingMs: 10 * MIN },
    ])
  })
})

describe("employee break metrics in manager analytics", () => {
  it("separates processing, hold and break time (never double-counted)", () => {
    const state = emptyState()
    issueToken(
      state,
      { name: "Pausee", serviceType: "Cash Deposit", counterId: 1 },
      NOW - 20 * MIN // serving immediately
    )
    startBreak(state, 1, NOW - 15 * MIN)
    endBreak(state, 1, NOW - 5 * MIN) // 10-minute break
    completeCurrentService(state, 1, NOW)

    const [record] = stepRecords(state, NOW)
    expect(record.breakMs).toBe(10 * MIN)
    expect(record.processingMs).toBe(10 * MIN) // 20m elapsed − 10m break
    expect(record.holdMs).toBe(0)

    const rows = employeeUtilization(state, NOW)
    const priya = rows.find((r) => r.counterId === 1)!
    expect(priya.breakMs).toBe(10 * MIN)
    expect(priya.actualProcessingMs).toBe(10 * MIN)

    const kpis = managerKpis(state, NOW)
    expect(kpis.totalBreakMs).toBe(10 * MIN)
    expect(kpis.totalProcessingMs).toBe(10 * MIN)
  })

  it("reports employees currently on break", () => {
    const state = emptyState()
    startBreak(state, 2, NOW - MIN)
    const kpis = managerKpis(state, NOW)
    expect(kpis.employeesOnBreak).toBe(1)
    expect(kpis.totalBreakMs).toBe(MIN)
  })
})
