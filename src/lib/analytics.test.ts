import { describe, expect, it } from "vitest"

import { counterMetrics, serviceTypeMetrics } from "./analytics"
import { seedState } from "./seed"

const NOW = 1_755_000_000_000

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
      expect(metric.queueLength).toBe(counter.queue.length)
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
