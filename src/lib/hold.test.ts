import { describe, expect, it } from "vitest"

import { customerTotals, stepHoldMs, stepProcessingMs } from "./durations"
import {
  callCustomer,
  completeCurrentService,
  emptyState,
  getRecommendedCustomer,
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

describe("HOLD — placing a customer on hold", () => {
  it("frees the counter and RECOMMENDS the next customer — never auto-assigns", () => {
    const state = emptyState()
    const ravi = issueAndCall(state, "Ravi", 1)
    const next = issue(state, "Next In Line", 1, T0 + 1)

    const held = holdCurrentCustomer(state, 1, "Document required", T0 + 10)

    expect(held.id).toBe(ravi.id)
    expect(held.status).toBe("on-hold")
    expect(state.counters[0].heldIds).toEqual([ravi.id])
    // counter is AVAILABLE with a recommendation — the employee decides
    expect(state.counters[0].currentCustomerId).toBeNull()
    expect(state.counters[0].status).toBe("available")
    expect(next.status).toBe("waiting")
    expect(getRecommendedCustomer(state, 1)?.id).toBe(next.id)
  })

  it("leaves the counter available after a hold when nobody is waiting", () => {
    const state = emptyState()
    issueAndCall(state, "Only", 1)
    holdCurrentCustomer(state, 1, "System issue", T0 + 10)
    expect(state.counters[0].currentCustomerId).toBeNull()
    expect(state.counters[0].status).toBe("available")
    expect(getRecommendedCustomer(state, 1)).toBeNull()
  })

  it("cannot hold when nobody is being served (waiting customers are not holdable)", () => {
    const state = emptyState()
    issue(state, "Waiting Only", 1)
    expect(() => holdCurrentCustomer(state, 1, "Other", T0 + 5)).toThrow()
  })

  it("preserves token, journey history and the employee/counter relationship", () => {
    const state = emptyState()
    const ravi = issueAndCall(state, "Ravi", 1)
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

  it("held customers are never recommended and never callable", () => {
    const state = emptyState()
    const held = issueAndCall(state, "Held Customer", 1)
    const a = issue(state, "A", 1, T0 + 1)

    holdCurrentCustomer(state, 1, "System issue", T0 + 10)

    expect(getRecommendedCustomer(state, 1)?.id).toBe(a.id) // not the held one
    expect(queuePosition(state, held.id)).toBeNull()
    expect(() => callCustomer(state, 1, held.id, T0 + 20)).toThrow(
      /not eligible/
    )
  })

  it("cannot transfer a customer who is actively on hold", () => {
    const state = emptyState()
    const ravi = issueAndCall(state, "Ravi", 1)
    holdCurrentCustomer(state, 1, "Document required", T0 + 10)

    expect(() => transferCustomer(state, ravi.id, 4, T0 + 20)).toThrow(
      /on hold/
    )
  })
})

describe("HOLD — release restores priority (NEXT AFTER CURRENT)", () => {
  it("released customer becomes next after current, never interrupting the current one", () => {
    const state = emptyState()
    const ravi = issueAndCall(state, "Ravi", 1)
    const current = issue(state, "Current", 1, T0 + 1)
    holdCurrentCustomer(state, 1, "Document required", T0 + 10)
    callCustomer(state, 1, current.id, T0 + 11) // employee calls the next one

    const released = releaseHold(state, ravi.id, T0 + 20)

    expect(released.status).toBe("waiting")
    expect(isReleasedHold(state, ravi.id)).toBe(true)
    expect(state.counters[0].releasedQueue).toEqual([ravi.id])
    expect(state.counters[0].heldIds).toEqual([])
    // the current customer keeps being served — no interruption
    expect(state.counters[0].currentCustomerId).toBe(current.id)
    expect(queuePosition(state, ravi.id)).toBe(1)
  })

  it("released hold is the TOP RECOMMENDATION but stays unassigned until called", () => {
    const state = emptyState()
    const held = issueAndCall(state, "Held", 1)
    const current = issue(state, "Current", 1, T0 + 1)
    const normal = issue(state, "Normal", 1, T0 + 2)
    const travelling = issueAndCall(state, "Travelling", 2, T0 + 3)
    holdCurrentCustomer(state, 1, "Waiting for customer", T0 + 5)
    callCustomer(state, 1, current.id, T0 + 6)
    transferCustomer(state, travelling.id, 1, T0 + 7) // → priority tier at C1

    releaseHold(state, held.id, T0 + 10)

    // effective order: released hold → journey priority → normal FIFO
    expect(queuePosition(state, held.id)).toBe(1)
    expect(queuePosition(state, travelling.id)).toBe(2)
    expect(queuePosition(state, normal.id)).toBe(3)

    completeCurrentService(state, 1, T0 + 20)
    // the released hold is recommended — NOT auto-assigned
    expect(getRecommendedCustomer(state, 1)?.id).toBe(held.id)
    expect(held.status).toBe("waiting")
    expect(state.counters[0].currentCustomerId).toBeNull()

    callCustomer(state, 1, held.id, T0 + 21) // explicit employee call
    expect(state.counters[0].currentCustomerId).toBe(held.id)

    completeCurrentService(state, 1, T0 + 30)
    expect(getRecommendedCustomer(state, 1)?.id).toBe(travelling.id)
  })

  it("multiple released holds keep their RELEASE order (FIFO among releases)", () => {
    const state = emptyState()
    const firstHeld = issueAndCall(state, "First Held", 1)
    const secondHeld = issue(state, "Second Held", 1, T0 + 1)
    const busyKeeper = issue(state, "Keeps Counter Busy", 1, T0 + 2)

    holdCurrentCustomer(state, 1, "Document required", T0 + 6)
    callCustomer(state, 1, secondHeld.id, T0 + 7)
    holdCurrentCustomer(state, 1, "System issue", T0 + 8)
    callCustomer(state, 1, busyKeeper.id, T0 + 9)

    // released in REVERSE arrival order — release order wins
    releaseHold(state, secondHeld.id, T0 + 10)
    releaseHold(state, firstHeld.id, T0 + 12)

    expect(state.counters[0].releasedQueue).toEqual([
      secondHeld.id,
      firstHeld.id,
    ])
    completeCurrentService(state, 1, T0 + 20)
    expect(getRecommendedCustomer(state, 1)?.id).toBe(secondHeld.id)
    callCustomer(state, 1, secondHeld.id, T0 + 21)
    completeCurrentService(state, 1, T0 + 25)
    expect(getRecommendedCustomer(state, 1)?.id).toBe(firstHeld.id)
  })

  it("release on an idle counter makes them the recommendation — call resumes service", () => {
    const state = emptyState()
    const ravi = issueAndCall(state, "Ravi", 1)
    holdCurrentCustomer(state, 1, "Document required", T0 + 10) // counter idles
    releaseHold(state, ravi.id, T0 + 20)

    // recommended, NOT auto-resumed
    expect(ravi.status).toBe("waiting")
    expect(state.counters[0].currentCustomerId).toBeNull()
    expect(getRecommendedCustomer(state, 1)?.id).toBe(ravi.id)

    callCustomer(state, 1, ravi.id, T0 + 25)
    expect(ravi.status).toBe("serving")
    // original start time kept, hold episode fully closed at the call
    expect(ravi.journey[0].startedAt).toBe(T0)
    expect(ravi.journey[0].holds[0]).toMatchObject({
      startedAt: T0 + 10,
      releasedAt: T0 + 20,
      resumedAt: T0 + 25,
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
    // Started 09:42 · hold 09:47 · released+called 09:53 · completed 09:57
    const start = T0
    const customer = issueAndCall(state, "Spec Example", 1, start) // 09:42
    holdCurrentCustomer(state, 1, "Document required", start + 5 * MIN) // 09:47
    releaseHold(state, customer.id, start + 11 * MIN) // 09:53
    callCustomer(state, 1, customer.id, start + 11 * MIN) // resumes 09:53
    completeCurrentService(state, 1, start + 15 * MIN) // 09:57

    const totals = customerTotals(customer, start + 15 * MIN)
    expect(totals.journeyMs).toBe(15 * MIN)
    expect(totals.processingMs).toBe(9 * MIN) // 5m before hold + 4m after
    expect(totals.holdMs).toBe(6 * MIN)
    expect(totals.holdEvents).toBe(1)
  })

  it("processing time is frozen while on hold and while waiting after release", () => {
    const state = emptyState()
    const c = issueAndCall(state, "Frozen", 1)
    issue(state, "Waiting", 1, T0 + 1)
    holdCurrentCustomer(state, 1, "Other", T0 + 4 * MIN)

    const step = c.journey[0]
    // an hour passes on hold — processing must not grow
    expect(stepProcessingMs(step, T0 + 64 * MIN)).toBe(4 * MIN)
    expect(stepHoldMs(step, T0 + 64 * MIN)).toBe(60 * MIN)

    releaseHold(state, c.id, T0 + 64 * MIN) // waits as "next after current"
    expect(stepProcessingMs(step, T0 + 74 * MIN)).toBe(4 * MIN)
    // hold time stops at RELEASE, priority wait is not hold time
    expect(stepHoldMs(step, T0 + 74 * MIN)).toBe(60 * MIN)
  })

  it("hold duration is recorded on the journey audit trail", () => {
    const state = emptyState()
    const c = issueAndCall(state, "Audit", 2)
    holdCurrentCustomer(state, 2, "Verification pending", T0 + 2 * MIN)
    releaseHold(state, c.id, T0 + 9 * MIN)

    const hold = c.journey[0].holds[0]
    expect(hold.releasedAt! - hold.startedAt).toBe(7 * MIN)
    expect(hold.reason).toBe("Verification pending")
  })
})
