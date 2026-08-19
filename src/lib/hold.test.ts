import { describe, expect, it } from "vitest"

import { customerTotals, stepHoldMs, stepProcessingMs } from "./durations"
import {
  completeCurrentService,
  emptyState,
  holdCurrentCustomer,
  isReleasedHold,
  issueToken,
  queuePosition,
  releaseHold,
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

describe("HOLD — placing a customer on hold", () => {
  it("puts the CURRENTLY SERVED customer on hold and auto-assigns the next eligible", () => {
    const state = emptyState()
    const ravi = issue(state, "Ravi", 1) // auto-serving
    const next = issue(state, "Next In Line", 1, T0 + 1)

    const held = holdCurrentCustomer(state, 1, "Document required", T0 + 10)

    expect(held.id).toBe(ravi.id)
    expect(held.status).toBe("on-hold")
    expect(state.counters[0].heldIds).toEqual([ravi.id])
    // the counter never sits idle — the next eligible customer starts at once
    expect(state.counters[0].currentCustomerId).toBe(next.id)
    expect(next.status).toBe("serving")
  })

  it("leaves the counter idle after a hold when nobody is waiting", () => {
    const state = emptyState()
    issue(state, "Only", 1)
    holdCurrentCustomer(state, 1, "System issue", T0 + 10)
    expect(state.counters[0].currentCustomerId).toBeNull()
    expect(state.counters[0].status).toBe("available")
  })

  it("cannot hold when nobody is being served (waiting customers are not holdable)", () => {
    const state = emptyState()
    expect(() => holdCurrentCustomer(state, 1, "Other", T0 + 5)).toThrow()
  })

  it("preserves token, journey history and the employee/counter relationship", () => {
    const state = emptyState()
    const ravi = issue(state, "Ravi", 1)
    const token = ravi.token

    holdCurrentCustomer(state, 1, "Verification pending", T0 + 10)

    expect(ravi.token).toBe(token)
    expect(ravi.currentCounterId).toBe(1)
    expect(ravi.journey).toHaveLength(1)
    const step = ravi.journey[0]
    expect(step.status).toBe("on-hold")
    expect(step.startedAt).toBe(T0)
    expect(step.holds).toHaveLength(1)
    expect(step.holds[0]).toMatchObject({
      reason: "Verification pending",
      startedAt: T0 + 10,
      releasedAt: null,
      resumedAt: null,
    })
  })

  it("held customers are never selected — not by completion, not by any queue", () => {
    const state = emptyState()
    const held = issue(state, "Held Customer", 1)
    const a = issue(state, "A", 1, T0 + 1)
    const b = issue(state, "B", 1, T0 + 2)

    holdCurrentCustomer(state, 1, "System issue", T0 + 10) // A auto-assigned
    expect(state.counters[0].currentCustomerId).toBe(a.id)

    completeCurrentService(state, 1, T0 + 20) // B auto-assigned, NOT the held one
    expect(state.counters[0].currentCustomerId).toBe(b.id)
    expect(held.status).toBe("on-hold")
    expect(queuePosition(state, held.id)).toBeNull()
  })

  it("cannot transfer a customer who is actively on hold", () => {
    const state = emptyState()
    const ravi = issue(state, "Ravi", 1)
    holdCurrentCustomer(state, 1, "Document required", T0 + 10)

    expect(() => transferCustomer(state, ravi.id, 4, T0 + 20)).toThrow(
      /on hold/
    )
  })
})

describe("HOLD — release restores priority (NEXT AFTER CURRENT)", () => {
  it("released customer becomes next after current, never interrupting the current one", () => {
    const state = emptyState()
    const ravi = issue(state, "Ravi", 1)
    const current = issue(state, "Current", 1, T0 + 1)
    holdCurrentCustomer(state, 1, "Document required", T0 + 10) // current starts

    const released = releaseHold(state, ravi.id, T0 + 20)

    expect(released.status).toBe("waiting")
    expect(isReleasedHold(state, ravi.id)).toBe(true)
    expect(state.counters[0].releasedQueue).toEqual([ravi.id])
    expect(state.counters[0].heldIds).toEqual([])
    // the current customer keeps being served — no interruption
    expect(state.counters[0].currentCustomerId).toBe(current.id)
    expect(queuePosition(state, ravi.id)).toBe(1)
  })

  it("released hold precedes the JOURNEY IN PROGRESS priority queue and normal FIFO", () => {
    const state = emptyState()
    const held = issue(state, "Held", 1)
    const current = issue(state, "Current", 1, T0 + 1)
    const normal = issue(state, "Normal", 1, T0 + 2)
    // a journey-started transfer waits in the priority queue
    const travelling = issue(state, "Travelling", 2, T0 + 3) // serving at C2
    holdCurrentCustomer(state, 1, "Waiting for customer", T0 + 5) // current starts
    transferCustomer(state, travelling.id, 1, T0 + 6) // → priority tier at C1

    releaseHold(state, held.id, T0 + 10)

    // effective order: released hold → journey priority → normal FIFO
    expect(queuePosition(state, held.id)).toBe(1)
    expect(queuePosition(state, travelling.id)).toBe(2)
    expect(queuePosition(state, normal.id)).toBe(3)

    completeCurrentService(state, 1, T0 + 20)
    expect(current.status).toBe("completed")
    expect(state.counters[0].currentCustomerId).toBe(held.id) // released first

    completeCurrentService(state, 1, T0 + 30)
    expect(state.counters[0].currentCustomerId).toBe(travelling.id) // then priority

    completeCurrentService(state, 1, T0 + 40)
    expect(state.counters[0].currentCustomerId).toBe(normal.id) // then normal
  })

  it("multiple released holds keep their RELEASE order (FIFO among releases)", () => {
    const state = emptyState()
    const firstHeld = issue(state, "First Held", 1)
    const secondHeld = issue(state, "Second Held", 1, T0 + 1)
    issue(state, "Keeps Counter Busy", 1, T0 + 2)

    holdCurrentCustomer(state, 1, "Document required", T0 + 6) // second starts
    holdCurrentCustomer(state, 1, "System issue", T0 + 8) // busy-keeper starts

    // released in REVERSE arrival order — release order wins
    releaseHold(state, secondHeld.id, T0 + 10)
    releaseHold(state, firstHeld.id, T0 + 12)

    expect(state.counters[0].releasedQueue).toEqual([
      secondHeld.id,
      firstHeld.id,
    ])
    completeCurrentService(state, 1, T0 + 20)
    expect(state.counters[0].currentCustomerId).toBe(secondHeld.id)
    completeCurrentService(state, 1, T0 + 25)
    expect(state.counters[0].currentCustomerId).toBe(firstHeld.id)
  })

  it("release on an idle counter resumes the customer immediately", () => {
    const state = emptyState()
    const ravi = issue(state, "Ravi", 1)
    holdCurrentCustomer(state, 1, "Document required", T0 + 10) // counter idles
    releaseHold(state, ravi.id, T0 + 20)

    expect(ravi.status).toBe("serving")
    expect(state.counters[0].currentCustomerId).toBe(ravi.id)
    // original start time kept, hold episode fully closed
    expect(ravi.journey[0].startedAt).toBe(T0)
    expect(ravi.journey[0].holds[0]).toMatchObject({
      startedAt: T0 + 10,
      releasedAt: T0 + 20,
      resumedAt: T0 + 20,
    })
  })

  it("resuming after release keeps the original startedAt and closes the hold episode", () => {
    const state = emptyState()
    const ravi = issue(state, "Ravi", 1)
    issue(state, "Current", 1, T0 + 1)
    holdCurrentCustomer(state, 1, "Document required", T0 + 10)
    releaseHold(state, ravi.id, T0 + 20)
    completeCurrentService(state, 1, T0 + 30) // Ravi auto-resumes

    const step = ravi.journey[0]
    expect(ravi.status).toBe("serving")
    expect(step.startedAt).toBe(T0) // never reset on resume
    expect(step.holds[0]).toMatchObject({
      startedAt: T0 + 10,
      releasedAt: T0 + 20,
      resumedAt: T0 + 30,
    })
  })

  it("releasing a customer who is not on hold throws", () => {
    const state = emptyState()
    const c = issue(state, "Normal", 1)
    expect(() => releaseHold(state, c.id, T0 + 5)).toThrow()
  })
})

describe("HOLD — time accounting (processing vs hold vs journey)", () => {
  it("matches the spec example: 15m journey = 9m processing + 6m hold", () => {
    const state = emptyState()
    // Started 09:42 · hold 09:47 · released+resumed 09:53 · completed 09:57
    const start = T0
    const customer = issue(state, "Spec Example", 1, start) // service starts 09:42
    holdCurrentCustomer(state, 1, "Document required", start + 5 * MIN) // 09:47
    releaseHold(state, customer.id, start + 11 * MIN) // 09:53 — resumes at once
    completeCurrentService(state, 1, start + 15 * MIN) // 09:57

    const totals = customerTotals(customer, start + 15 * MIN)
    expect(totals.journeyMs).toBe(15 * MIN)
    expect(totals.processingMs).toBe(9 * MIN) // 5m before hold + 4m after
    expect(totals.holdMs).toBe(6 * MIN)
    expect(totals.holdEvents).toBe(1)
  })

  it("processing time is frozen while on hold and while waiting after release", () => {
    const state = emptyState()
    const c = issue(state, "Frozen", 1)
    issue(state, "Current", 1, T0 + 1)
    holdCurrentCustomer(state, 1, "Other", T0 + 4 * MIN)

    const step = c.journey[0]
    // an hour passes on hold — processing must not grow
    expect(stepProcessingMs(step, T0 + 64 * MIN)).toBe(4 * MIN)
    expect(stepHoldMs(step, T0 + 64 * MIN)).toBe(60 * MIN)

    releaseHold(state, c.id, T0 + 64 * MIN) // waits behind the current customer
    // 10 more minutes waiting as "next after current" — still frozen
    expect(stepProcessingMs(step, T0 + 74 * MIN)).toBe(4 * MIN)
    // hold time stops at RELEASE, priority wait is not hold time
    expect(stepHoldMs(step, T0 + 74 * MIN)).toBe(60 * MIN)
  })

  it("hold duration is recorded on the journey audit trail", () => {
    const state = emptyState()
    const c = issue(state, "Audit", 2)
    holdCurrentCustomer(state, 2, "Verification pending", T0 + 2 * MIN)
    issue(state, "Keeps Busy", 2, T0 + 3 * MIN) // so release stays queued
    releaseHold(state, c.id, T0 + 9 * MIN)

    const hold = c.journey[0].holds[0]
    expect(hold.releasedAt! - hold.startedAt).toBe(7 * MIN)
    expect(hold.reason).toBe("Verification pending")
  })
})
