import { describe, expect, it } from "vitest"

import { overrideBreakdown } from "./analytics"
import {
  callCustomer,
  completeCurrentService,
  emptyState,
  getRecommendedCustomer,
  holdCurrentCustomer,
  issueToken,
  queuePosition,
  releaseHold,
  startBreak,
  transferCustomer,
} from "./queue-logic"
import type { QueueState, ServiceType } from "./types"

const T0 = 1_000_000

function issue(
  state: QueueState,
  name: string,
  counterId: number,
  at = T0,
  serviceType: ServiceType = "Cash Deposit"
) {
  return issueToken(state, { name, serviceType, counterId }, at)
}

/**
 * Counter 1 with a full three-tier line and a customer in service:
 *   serving:  current
 *   released: releasedOne (hold → release while busy)
 *   priority: traveller (journey started at C2)
 *   normal:   normalA, normalB
 */
function richScenario() {
  const state = emptyState()
  const releasedOne = issue(state, "Released One", 1)
  callCustomer(state, 1, releasedOne.id, T0 + 1)
  const current = issue(state, "Current", 1, T0 + 2)
  const normalA = issue(state, "Normal A", 1, T0 + 3)
  const normalB = issue(state, "Normal B", 1, T0 + 4)
  const traveller = issue(state, "Traveller", 2, T0 + 5)
  callCustomer(state, 2, traveller.id, T0 + 6)
  holdCurrentCustomer(state, 1, "Document required", T0 + 7) // releasedOne held
  callCustomer(state, 1, current.id, T0 + 8) // current explicitly called
  transferCustomer(state, traveller.id, 1, T0 + 9) // → priority tier at C1
  releaseHold(state, releasedOne.id, T0 + 10) // → released tier
  return { state, releasedOne, current, normalA, normalB, traveller }
}

describe("recommendation engine (getRecommendedCustomer)", () => {
  it("recommends released → priority → normal without mutating state", () => {
    const { state, releasedOne, traveller, normalA } = richScenario()
    const before = JSON.stringify(state)

    expect(getRecommendedCustomer(state, 1)?.id).toBe(releasedOne.id)
    expect(JSON.stringify(state)).toBe(before) // pure, read-only

    // drain released + priority (explicit calls) → normal FIFO recommended
    completeCurrentService(state, 1, T0 + 20)
    callCustomer(state, 1, releasedOne.id, T0 + 21)
    completeCurrentService(state, 1, T0 + 22)
    expect(getRecommendedCustomer(state, 1)?.id).toBe(traveller.id)
    callCustomer(state, 1, traveller.id, T0 + 23)
    completeCurrentService(state, 1, T0 + 24)
    expect(getRecommendedCustomer(state, 1)?.id).toBe(normalA.id)
  })

  it("returns null for an empty counter", () => {
    const state = emptyState()
    expect(getRecommendedCustomer(state, 3)).toBeNull()
  })

  it("the recommended customer stays WAITING until explicitly called", () => {
    const { state, releasedOne } = richScenario()
    completeCurrentService(state, 1, T0 + 20)

    expect(getRecommendedCustomer(state, 1)?.id).toBe(releasedOne.id)
    expect(releasedOne.status).toBe("waiting")
    expect(state.counters[0].currentCustomerId).toBeNull()
  })
})

describe("override call — human choice without queue corruption", () => {
  it("the employee can call a different eligible customer", () => {
    const { state, normalB } = richScenario()
    completeCurrentService(state, 1, T0 + 20)

    callCustomer(state, 1, normalB.id, T0 + 21, "Customer ready")

    expect(state.counters[0].currentCustomerId).toBe(normalB.id)
    expect(normalB.status).toBe("serving")
  })

  it("does NOT reorder the queue — everyone else keeps position and timestamps", () => {
    const { state, releasedOne, normalA, normalB, traveller } = richScenario()
    const enteredBefore = [releasedOne, traveller, normalA].map(
      (c) => c.journey[c.journey.length - 1].enteredAt
    )
    completeCurrentService(state, 1, T0 + 20)

    callCustomer(state, 1, normalB.id, T0 + 21)

    expect(state.counters[0].releasedQueue).toEqual([releasedOne.id])
    expect(state.counters[0].priorityQueue).toEqual([traveller.id])
    expect(state.counters[0].queue).toEqual([normalA.id])
    expect(queuePosition(state, releasedOne.id)).toBe(1)
    expect(queuePosition(state, traveller.id)).toBe(2)
    expect(queuePosition(state, normalA.id)).toBe(3)
    expect(
      [releasedOne, traveller, normalA].map(
        (c) => c.journey[c.journey.length - 1].enteredAt
      )
    ).toEqual(enteredBefore)
  })

  it("after the override completes, the original recommendation returns — still unassigned", () => {
    const { state, releasedOne, normalB } = richScenario()
    completeCurrentService(state, 1, T0 + 20)
    callCustomer(state, 1, normalB.id, T0 + 21)

    completeCurrentService(state, 1, T0 + 30)

    // journey priority was never destroyed — released hold recommended first
    expect(getRecommendedCustomer(state, 1)?.id).toBe(releasedOne.id)
    expect(releasedOne.status).toBe("waiting") // NOT auto-assigned
    callCustomer(state, 1, releasedOne.id, T0 + 31)
    expect(releasedOne.status).toBe("serving")
  })

  it("repeated overrides never permanently reorder the priority tiers", () => {
    const state = emptyState()
    const pA = issue(state, "Priority A", 2, T0 + 1)
    callCustomer(state, 2, pA.id, T0 + 2)
    const pB = issue(state, "Priority B", 3, T0 + 3)
    callCustomer(state, 3, pB.id, T0 + 4)
    const nA = issue(state, "New A", 1, T0 + 5)
    const nB = issue(state, "New B", 1, T0 + 6)
    transferCustomer(state, pA.id, 1, T0 + 7) // priority arrival 1st
    transferCustomer(state, pB.id, 1, T0 + 8) // priority arrival 2nd

    callCustomer(state, 1, nA.id, T0 + 10) // override 1
    completeCurrentService(state, 1, T0 + 11)
    callCustomer(state, 1, nB.id, T0 + 12) // override 2
    completeCurrentService(state, 1, T0 + 13)

    expect(state.counters[0].priorityQueue).toEqual([pA.id, pB.id]) // intact
    expect(getRecommendedCustomer(state, 1)?.id).toBe(pA.id)
  })

  it("calling the recommended customer records NO override", () => {
    const { state, releasedOne } = richScenario()
    completeCurrentService(state, 1, T0 + 20)
    callCustomer(state, 1, releasedOne.id, T0 + 21)

    expect(state.overrides).toHaveLength(0)
    const activity = state.activities.find((a) => a.type === "queue-override")
    expect(activity).toBeUndefined()
  })

  it("records a full audit entry for an override call", () => {
    const { state, releasedOne, normalB } = richScenario()
    completeCurrentService(state, 1, T0 + 20)
    callCustomer(state, 1, normalB.id, T0 + 25, "Customer urgency")

    expect(state.overrides).toHaveLength(1)
    expect(state.overrides[0]).toMatchObject({
      at: T0 + 25,
      counterId: 1,
      employeeName: "Priya",
      recommendedToken: releasedOne.token,
      selectedToken: normalB.token,
      reason: "Customer urgency",
    })
    const activity = state.activities.find((a) => a.type === "queue-override")
    expect(activity?.message).toContain("instead of recommended")

    // reason is optional — never forced
    const again = richScenario()
    completeCurrentService(again.state, 1, T0 + 20)
    callCustomer(again.state, 1, again.normalB.id, T0 + 21)
    expect(again.state.overrides[0].reason).toBeNull()
  })

  it("the bypassed recommended customer keeps position #1 and normal status", () => {
    const state = emptyState()
    const w1 = issue(state, "Wait 1", 1, T0 + 1)
    const w2 = issue(state, "Wait 2", 1, T0 + 2)

    callCustomer(state, 1, w2.id, T0 + 10) // override the recommendation

    expect(w1.status).toBe("waiting")
    expect(queuePosition(state, w1.id)).toBe(1)
    expect(getRecommendedCustomer(state, 1)?.id).toBe(w1.id)
  })
})

describe("call eligibility guardrails", () => {
  it("held customers cannot be called", () => {
    const state = emptyState()
    const held = issue(state, "Held", 1)
    callCustomer(state, 1, held.id, T0 + 1)
    holdCurrentCustomer(state, 1, "Document required", T0 + 5)

    expect(held.status).toBe("on-hold")
    expect(() => callCustomer(state, 1, held.id, T0 + 10)).toThrow(
      /not eligible/
    )
  })

  it("customers serving or waiting at another counter cannot be called", () => {
    const state = emptyState()
    const elsewhere = issue(state, "Elsewhere", 2)
    expect(() => callCustomer(state, 1, elsewhere.id, T0 + 10)).toThrow(
      /not eligible/
    )
  })

  it("an employee on break cannot call anyone", () => {
    const state = emptyState()
    const waiting = issue(state, "Waiting", 1)
    startBreak(state, 1, T0 + 5)
    expect(() => callCustomer(state, 1, waiting.id, T0 + 10)).toThrow(/break/)
  })
})

describe("recommendation & override analytics (manager KPI)", () => {
  it("computes calls, recommendations, override rate and acceptance rate", () => {
    const { state, normalB } = richScenario()
    completeCurrentService(state, 1, T0 + 20)
    callCustomer(state, 1, normalB.id, T0 + 21) // 1 override call

    const info = overrideBreakdown(state, T0 + 30)
    // calls = started steps: releasedOne, current, traveller(C2), normalB
    expect(info.calls).toBe(4)
    expect(info.recommendations).toBe(4)
    expect(info.overrides).toBe(1)
    expect(info.rate).toBeCloseTo(1 / 4, 10)
    expect(info.acceptanceRate).toBeCloseTo(3 / 4, 10)
  })

  it("breaks overrides down by employee and counter", () => {
    const { state, normalB } = richScenario()
    completeCurrentService(state, 1, T0 + 20)
    callCustomer(state, 1, normalB.id, T0 + 21)

    const info = overrideBreakdown(state, T0 + 30)
    const priya = info.byEmployee.find((e) => e.employeeName === "Priya")
    expect(priya).toMatchObject({ counterId: 1, count: 1 })
    expect(
      info.byEmployee
        .filter((e) => e.employeeName !== "Priya")
        .every((e) => e.count === 0)
    ).toBe(true)
    expect(info.records[0].selectedToken).toBe(normalB.token)
  })

  it("rate is 0 with no calls and overrides respect filters", () => {
    const empty = emptyState()
    expect(overrideBreakdown(empty, T0).rate).toBe(0)
    expect(overrideBreakdown(empty, T0).acceptanceRate).toBe(0)

    const { state, normalB } = richScenario()
    completeCurrentService(state, 1, T0 + 20)
    callCustomer(state, 1, normalB.id, T0 + 21)
    const filtered = overrideBreakdown(state, T0 + 30, {
      time: "demo",
      employee: "Arjun",
      counter: "all",
      service: "all",
    })
    expect(filtered.overrides).toBe(0) // Priya's override filtered out
  })
})
