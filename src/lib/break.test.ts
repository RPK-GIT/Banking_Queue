import { describe, expect, it } from "vitest"

import {
  counterBreakMs,
  customerTotals,
  stepBreakMs,
  stepProcessingMs,
} from "./durations"
import {
  callCustomer,
  completeCurrentService,
  emptyState,
  endBreak,
  getRecommendedCustomer,
  holdCurrentCustomer,
  issueToken,
  releaseHold,
  startBreak,
  transferCustomer,
} from "./queue-logic"
import type { QueueState, ServiceType } from "./types"

const T0 = 1_000_000
const MIN = 60_000

function issue(
  state: QueueState,
  name: string,
  counterId: number,
  at = T0,
  serviceType: ServiceType = "Cash Deposit"
) {
  return issueToken(state, { name, serviceType, counterId }, at)
}

function issueAndCall(
  state: QueueState,
  name: string,
  counterId: number,
  at = T0
) {
  const customer = issue(state, name, counterId, at)
  callCustomer(state, counterId, customer.id, at)
  return customer
}

describe("EMPLOYEE BREAK — counter becomes unavailable, customer keeps their place", () => {
  it("starting a break while serving pauses the service (not a hold, not a re-queue)", () => {
    const state = emptyState()
    const customer = issueAndCall(state, "Paused", 2)

    startBreak(state, 2, T0 + 5 * MIN)

    const counter = state.counters[1]
    expect(counter.status).toBe("on-break")
    // the customer keeps their EXACT service position
    expect(counter.currentCustomerId).toBe(customer.id)
    expect(customer.status).toBe("serving")
    expect(counter.heldIds).toEqual([])
    expect(counter.queue).toEqual([])
    // pause recorded on the journey step
    expect(customer.journey[0].breaks).toEqual([
      { startedAt: T0 + 5 * MIN, endedAt: null },
    ])
  })

  it("no customer can be called while the employee is on break", () => {
    const state = emptyState()
    issueAndCall(state, "Paused", 2)
    startBreak(state, 2, T0 + 1)

    const waiting = issue(state, "Arrives During Break", 2, T0 + 2)

    expect(waiting.status).toBe("waiting")
    expect(state.counters[1].queue).toEqual([waiting.id])
    expect(() => callCustomer(state, 2, waiting.id, T0 + 3)).toThrow(/break/)
  })

  it("returning from a break with no paused customer only RECOMMENDS — explicit call required", () => {
    const state = emptyState()
    startBreak(state, 3, T0)
    const waiting = issue(state, "Waits", 3, T0 + 1)
    expect(waiting.status).toBe("waiting")

    endBreak(state, 3, T0 + 10)

    // counter AVAILABLE, customer recommended, nobody auto-assigned
    expect(state.counters[2].status).toBe("available")
    expect(state.counters[2].currentCustomerId).toBeNull()
    expect(waiting.status).toBe("waiting")
    expect(getRecommendedCustomer(state, 3)?.id).toBe(waiting.id)

    callCustomer(state, 3, waiting.id, T0 + 11)
    expect(waiting.status).toBe("serving")
  })

  it("returning from break RESUMES the paused customer — same timer, same priority", () => {
    const state = emptyState()
    const paused = issueAndCall(state, "Paused", 2)
    issue(state, "Still Waiting", 2, T0 + 1)
    startBreak(state, 2, T0 + 5)

    endBreak(state, 2, T0 + 20)

    const counter = state.counters[1]
    expect(counter.status).toBe("serving")
    expect(counter.currentCustomerId).toBe(paused.id) // NOT the waiting one
    expect(paused.journey[0].startedAt).toBe(T0) // timer never restarted
    expect(paused.journey[0].breaks[0]).toEqual({
      startedAt: T0 + 5,
      endedAt: T0 + 20,
    })
  })

  it("completing after the break recommends the next customer — no auto-assign", () => {
    const state = emptyState()
    issueAndCall(state, "Paused", 2)
    const next = issue(state, "Next", 2, T0 + 1)
    startBreak(state, 2, T0 + 5)
    endBreak(state, 2, T0 + 20)

    completeCurrentService(state, 2, T0 + 30)

    expect(state.counters[1].currentCustomerId).toBeNull()
    expect(next.status).toBe("waiting")
    expect(getRecommendedCustomer(state, 2)?.id).toBe(next.id)
  })

  it("cannot complete, hold or transfer the paused customer while the employee is away", () => {
    const state = emptyState()
    const paused = issueAndCall(state, "Paused", 2)
    startBreak(state, 2, T0 + 5)

    expect(() => completeCurrentService(state, 2, T0 + 10)).toThrow(/break/)
    expect(() => transferCustomer(state, paused.id, 3, T0 + 10)).toThrow(
      /paused/
    )
  })

  it("double start / double end are rejected", () => {
    const state = emptyState()
    startBreak(state, 1, T0)
    expect(() => startBreak(state, 1, T0 + 1)).toThrow()
    endBreak(state, 1, T0 + 2)
    expect(() => endBreak(state, 1, T0 + 3)).toThrow()
  })
})

describe("EMPLOYEE BREAK — time accounting", () => {
  it("matches the spec example: 20m elapsed = 10m processing + 10m break", () => {
    const state = emptyState()
    // Started 09:42 · break 09:47 · returned 09:57 · completed 10:02
    const customer = issueAndCall(state, "Spec", 2, T0) // 09:42
    startBreak(state, 2, T0 + 5 * MIN) // 09:47
    endBreak(state, 2, T0 + 15 * MIN) // 09:57
    completeCurrentService(state, 2, T0 + 20 * MIN) // 10:02

    const totals = customerTotals(customer, T0 + 20 * MIN)
    expect(totals.journeyMs).toBe(20 * MIN)
    expect(totals.processingMs).toBe(10 * MIN) // 5m before + 5m after break
    expect(totals.breakMs).toBe(10 * MIN)
    expect(totals.holdMs).toBe(0)
  })

  it("processing time is frozen while the employee is on break", () => {
    const state = emptyState()
    const c = issueAndCall(state, "Frozen", 1)
    startBreak(state, 1, T0 + 3 * MIN)

    const step = c.journey[0]
    expect(stepProcessingMs(step, T0 + 33 * MIN)).toBe(3 * MIN) // half hour later
    expect(stepBreakMs(step, T0 + 33 * MIN)).toBe(30 * MIN)
  })

  it("employee break time is tracked on the counter for workforce analytics", () => {
    const state = emptyState()
    startBreak(state, 4, T0)
    endBreak(state, 4, T0 + 12 * MIN)
    startBreak(state, 4, T0 + 30 * MIN)

    const counter = state.counters[3]
    expect(counter.breaks).toHaveLength(2)
    expect(counterBreakMs(counter.breaks, T0 + 40 * MIN)).toBe(22 * MIN)
  })

  it("break time and hold time are tracked independently on the same journey", () => {
    const state = emptyState()
    const c = issueAndCall(state, "Both", 1, T0)
    startBreak(state, 1, T0 + 2 * MIN)
    endBreak(state, 1, T0 + 4 * MIN) // 2m break
    holdCurrentCustomer(state, 1, "Document required", T0 + 6 * MIN)
    releaseHold(state, c.id, T0 + 9 * MIN) // 3m hold — recommended again
    callCustomer(state, 1, c.id, T0 + 9 * MIN) // employee resumes immediately
    completeCurrentService(state, 1, T0 + 12 * MIN)

    const totals = customerTotals(c, T0 + 12 * MIN)
    expect(totals.breakMs).toBe(2 * MIN)
    expect(totals.holdMs).toBe(3 * MIN)
    expect(totals.processingMs).toBe(7 * MIN) // 12 − 2 break − 3 hold
    expect(totals.journeyMs).toBe(12 * MIN)
  })
})
