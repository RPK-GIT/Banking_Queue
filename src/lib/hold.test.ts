import { describe, expect, it } from "vitest"

import { customerTotals, stepHoldMs, stepProcessingMs } from "./durations"
import {
  callNextCustomer,
  completeCurrentService,
  emptyState,
  holdCurrentCustomer,
  isPriority,
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
  it("puts the CURRENTLY SERVED customer on hold and frees the counter", () => {
    const state = emptyState()
    const ravi = issue(state, "Ravi", 1)
    callNextCustomer(state, 1, T0 + 5)

    const held = holdCurrentCustomer(state, 1, "Document required", T0 + 10)

    expect(held.id).toBe(ravi.id)
    expect(held.status).toBe("on-hold")
    expect(state.counters[0].currentCustomerId).toBeNull()
    expect(state.counters[0].status).toBe("available")
    expect(state.counters[0].heldIds).toEqual([ravi.id])
  })

  it("cannot hold when nobody is being served (waiting customers are not holdable)", () => {
    const state = emptyState()
    issue(state, "Waiting Only", 1)
    expect(() => holdCurrentCustomer(state, 1, "Other", T0 + 5)).toThrow()
  })

  it("preserves token, journey history and the employee/counter relationship", () => {
    const state = emptyState()
    const ravi = issue(state, "Ravi", 1)
    const token = ravi.token
    callNextCustomer(state, 1, T0 + 5)

    holdCurrentCustomer(state, 1, "Verification pending", T0 + 10)

    expect(ravi.token).toBe(token)
    expect(ravi.currentCounterId).toBe(1)
    expect(ravi.journey).toHaveLength(1)
    const step = ravi.journey[0]
    expect(step.status).toBe("on-hold")
    expect(step.startedAt).toBe(T0 + 5)
    expect(step.holds).toHaveLength(1)
    expect(step.holds[0]).toMatchObject({
      reason: "Verification pending",
      startedAt: T0 + 10,
      releasedAt: null,
      resumedAt: null,
    })
  })

  it("removes the held customer from FIFO — Call Next never selects them", () => {
    const state = emptyState()
    issue(state, "Held Customer", 1)
    const waiting = issue(state, "Normal Waiting", 1, T0 + 1)
    callNextCustomer(state, 1, T0 + 5)
    holdCurrentCustomer(state, 1, "System issue", T0 + 10)

    const called = callNextCustomer(state, 1, T0 + 20)

    expect(called?.id).toBe(waiting.id)
    expect(state.counters[0].heldIds).toHaveLength(1)
    expect(queuePosition(state, state.counters[0].heldIds[0])).toBeNull()
  })

  it("cannot transfer a customer who is actively on hold", () => {
    const state = emptyState()
    const ravi = issue(state, "Ravi", 1)
    callNextCustomer(state, 1, T0 + 5)
    holdCurrentCustomer(state, 1, "Document required", T0 + 10)

    expect(() => transferCustomer(state, ravi.id, 4, T0 + 20)).toThrow(
      /on hold/
    )
  })
})

describe("HOLD — release restores priority (next after current)", () => {
  it("released customer joins the priority queue, not the FIFO queue", () => {
    const state = emptyState()
    const ravi = issue(state, "Ravi", 1)
    issue(state, "B", 1, T0 + 1)
    callNextCustomer(state, 1, T0 + 5)
    holdCurrentCustomer(state, 1, "Document required", T0 + 10)

    const released = releaseHold(state, ravi.id, T0 + 20)

    expect(released.status).toBe("waiting")
    expect(isPriority(state, ravi.id)).toBe(true)
    expect(state.counters[0].priorityQueue).toEqual([ravi.id])
    expect(state.counters[0].heldIds).toEqual([])
    expect(state.counters[0].queue).not.toContain(ravi.id)
    expect(queuePosition(state, ravi.id)).toBe(1)
  })

  it("released customer is served immediately after the CURRENT customer, ahead of normal FIFO", () => {
    const state = emptyState()
    // T-101 held, T-102 serving, T-103/T-104 normal FIFO
    const held = issue(state, "Held", 1)
    const current = issue(state, "Current", 1, T0 + 1)
    const fifoA = issue(state, "Fifo A", 1, T0 + 2)
    const fifoB = issue(state, "Fifo B", 1, T0 + 3)

    callNextCustomer(state, 1, T0 + 5) // held customer starts
    holdCurrentCustomer(state, 1, "Waiting for customer", T0 + 10)
    callNextCustomer(state, 1, T0 + 11) // current starts
    releaseHold(state, held.id, T0 + 15)

    // normal FIFO positions shift behind the released customer
    expect(queuePosition(state, held.id)).toBe(1)
    expect(queuePosition(state, fifoA.id)).toBe(2)
    expect(queuePosition(state, fifoB.id)).toBe(3)

    completeCurrentService(state, 1, T0 + 20)
    expect(current.status).toBe("completed")

    const next = callNextCustomer(state, 1, T0 + 25)
    expect(next?.id).toBe(held.id) // released hold precedes the FIFO queue

    completeCurrentService(state, 1, T0 + 30)
    const after = callNextCustomer(state, 1, T0 + 35)
    expect(after?.id).toBe(fifoA.id) // then normal FIFO resumes
  })

  it("multiple released holds keep their RELEASE order (FIFO among releases)", () => {
    const state = emptyState()
    const firstHeld = issue(state, "First Held", 1)
    const secondHeld = issue(state, "Second Held", 1, T0 + 1)
    issue(state, "Fifo", 1, T0 + 2)

    callNextCustomer(state, 1, T0 + 5)
    holdCurrentCustomer(state, 1, "Document required", T0 + 6)
    callNextCustomer(state, 1, T0 + 7)
    holdCurrentCustomer(state, 1, "System issue", T0 + 8)

    // released in REVERSE arrival order — release order wins
    releaseHold(state, secondHeld.id, T0 + 10) // released 10:05
    releaseHold(state, firstHeld.id, T0 + 12) // released 10:07

    expect(state.counters[0].priorityQueue).toEqual([
      secondHeld.id,
      firstHeld.id,
    ])
    expect(callNextCustomer(state, 1, T0 + 20)?.id).toBe(secondHeld.id)
    completeCurrentService(state, 1, T0 + 25)
    expect(callNextCustomer(state, 1, T0 + 30)?.id).toBe(firstHeld.id)
  })

  it("resuming after release keeps the original startedAt and closes the hold episode", () => {
    const state = emptyState()
    const ravi = issue(state, "Ravi", 1)
    callNextCustomer(state, 1, T0 + 5)
    holdCurrentCustomer(state, 1, "Document required", T0 + 10)
    releaseHold(state, ravi.id, T0 + 20)
    callNextCustomer(state, 1, T0 + 30)

    const step = ravi.journey[0]
    expect(ravi.status).toBe("serving")
    expect(step.startedAt).toBe(T0 + 5) // never reset on resume
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
    const customer = issue(state, "Spec Example", 1, start)
    callNextCustomer(state, 1, start) // service starts 09:42
    holdCurrentCustomer(state, 1, "Document required", start + 5 * MIN) // 09:47
    releaseHold(state, customer.id, start + 11 * MIN) // 09:53
    callNextCustomer(state, 1, start + 11 * MIN) // resumes 09:53
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
    callNextCustomer(state, 1, T0)
    holdCurrentCustomer(state, 1, "Other", T0 + 4 * MIN)

    const step = c.journey[0]
    // an hour passes on hold — processing must not grow
    expect(stepProcessingMs(step, T0 + 64 * MIN)).toBe(4 * MIN)
    expect(stepHoldMs(step, T0 + 64 * MIN)).toBe(60 * MIN)

    releaseHold(state, c.id, T0 + 64 * MIN)
    // 10 more minutes waiting as "next after current" — still frozen
    expect(stepProcessingMs(step, T0 + 74 * MIN)).toBe(4 * MIN)
    // hold time stops at RELEASE, priority wait is not hold time
    expect(stepHoldMs(step, T0 + 74 * MIN)).toBe(60 * MIN)
  })

  it("hold duration is recorded on the journey audit trail", () => {
    const state = emptyState()
    const c = issue(state, "Audit", 2)
    callNextCustomer(state, 2, T0)
    holdCurrentCustomer(state, 2, "Verification pending", T0 + 2 * MIN)
    releaseHold(state, c.id, T0 + 9 * MIN)

    const hold = c.journey[0].holds[0]
    expect(hold.releasedAt! - hold.startedAt).toBe(7 * MIN)
    expect(hold.reason).toBe("Verification pending")
  })
})
