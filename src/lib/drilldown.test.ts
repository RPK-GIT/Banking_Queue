import { describe, expect, it } from "vitest"

import {
  avgWaitBreakdown,
  completedRows,
  customersInBranchRows,
  servingRows,
  waitingRows,
} from "./drilldown"
import {
  callNextCustomer,
  completeCurrentService,
  emptyState,
  holdCurrentCustomer,
  issueToken,
  releaseHold,
} from "./queue-logic"
import { seedState } from "./seed"

const NOW = 1_755_000_000_000
const MIN = 60_000

describe("main KPI drill-downs — the records behind each number", () => {
  it("Customers in Branch = every non-completed customer (matches the KPI)", () => {
    const state = seedState(NOW)
    const rows = customersInBranchRows(state, NOW)
    const active = Object.values(state.customers).filter(
      (c) => c.status !== "completed"
    )
    expect(rows).toHaveLength(active.length)
    // read-only: deriving rows never mutates state
    const before = JSON.stringify(state)
    customersInBranchRows(state, NOW)
    expect(JSON.stringify(state)).toBe(before)
  })

  it("Waiting rows show correct counter, position and estimated wait", () => {
    const state = seedState(NOW)
    const rows = waitingRows(state, NOW)
    const waiting = Object.values(state.customers).filter(
      (c) => c.status === "waiting"
    )
    expect(rows).toHaveLength(waiting.length)
    for (const row of rows) {
      expect(row.position).not.toBeNull()
      expect(row.estWaitMin).toBe(Math.floor(row.position! * 3.5))
      const counter = state.counters.find((c) => c.id === row.counterId)!
      expect([...counter.queue, ...counter.priorityQueue]).toContain(row.customerId)
    }
    // grouped by counter, then position
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1]
      const cur = rows[i]
      expect(
        cur.counterId! > prev.counterId! ||
          (cur.counterId === prev.counterId && cur.position! >= prev.position!)
      ).toBe(true)
    }
  })

  it("Being Served rows show employee, start time and live processing time", () => {
    const state = seedState(NOW)
    const rows = servingRows(state, NOW)
    const servingCounters = state.counters.filter((c) => c.currentCustomerId)
    expect(rows).toHaveLength(servingCounters.length)
    for (const row of rows) {
      const counter = state.counters.find((c) => c.id === row.counterId)!
      expect(counter.currentCustomerId).toBe(row.customerId)
      expect(row.employeeName).toBe(counter.employeeName)
      expect(row.processingMs).toBe(NOW - row.startedAt) // no holds in seed
    }
    // the clock ticks with the application's time model
    const later = servingRows(state, NOW + 30_000)
    expect(later[0].processingMs).toBe(rows[0].processingMs + 30_000)
  })

  it("Completed rows split journey vs processing vs hold time", () => {
    const state = emptyState()
    const c = issueToken(
      state,
      { name: "Done", serviceType: "Cash Deposit", counterId: 1 },
      NOW - 15 * MIN
    )
    callNextCustomer(state, 1, NOW - 15 * MIN)
    holdCurrentCustomer(state, 1, "Document required", NOW - 10 * MIN)
    releaseHold(state, c.id, NOW - 4 * MIN)
    callNextCustomer(state, 1, NOW - 4 * MIN)
    completeCurrentService(state, 1, NOW)

    const [row] = completedRows(state, NOW)
    expect(row.token).toBe(c.token)
    expect(row.countersVisited).toEqual([1])
    expect(row.journeyMs).toBe(15 * MIN)
    expect(row.processingMs).toBe(9 * MIN)
    expect(row.holdMs).toBe(6 * MIN)
    expect(row.completedAt).toBe(NOW)
  })

  it("Average Wait breakdown reproduces the KPI formula exactly", () => {
    const state = seedState(NOW)
    const breakdown = avgWaitBreakdown(state, NOW)
    const active = Object.values(state.customers).filter(
      (c) => c.status !== "completed"
    )
    expect(breakdown.rows).toHaveLength(active.length)
    const expectedAvg =
      active.map((c) => NOW - c.createdAt).reduce((a, b) => a + b, 0) /
      active.length
    expect(breakdown.avgMs).toBeCloseTo(expectedAvg, 6)
    expect(breakdown.maxMs).toBe(Math.max(...active.map((c) => NOW - c.createdAt)))
    expect(breakdown.minMs).toBe(Math.min(...active.map((c) => NOW - c.createdAt)))
  })
})
