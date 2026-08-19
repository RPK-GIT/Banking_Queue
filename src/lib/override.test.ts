import { describe, expect, it } from "vitest"

import { overrideBreakdown } from "./analytics"
import {
  completeCurrentService,
  emptyState,
  getNextEligibleCustomer,
  holdCurrentCustomer,
  issueToken,
  queuePosition,
  releaseHold,
  setNextOverride,
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
 * Counter 1: serving + a full three-tier queue.
 *   serving:  current
 *   released: (via hold+release of releasedOne while busy)
 *   priority: traveller (journey started at C2)
 *   normal:   normalA, normalB
 */
function richScenario() {
  const state = emptyState()
  const releasedOne = issue(state, "Released One", 1) // serving first
  const current = issue(state, "Current", 1, T0 + 1)
  const normalA = issue(state, "Normal A", 1, T0 + 2)
  const normalB = issue(state, "Normal B", 1, T0 + 3)
  const traveller = issue(state, "Traveller", 2, T0 + 4) // serving at C2
  holdCurrentCustomer(state, 1, "Document required", T0 + 5) // current starts
  transferCustomer(state, traveller.id, 1, T0 + 6) // → priority tier at C1
  releaseHold(state, releasedOne.id, T0 + 7) // → released tier (busy counter)
  return { state, releasedOne, current, normalA, normalB, traveller }
}

describe("recommended customer (getNextEligibleCustomer)", () => {
  it("peeks released → priority → normal without mutating anything", () => {
    const { state, releasedOne, normalA } = richScenario()
    const before = JSON.stringify(state)

    expect(getNextEligibleCustomer(state, 1)?.id).toBe(releasedOne.id)
    expect(JSON.stringify(state)).toBe(before) // pure peek

    // drain released + priority → normal FIFO becomes the recommendation
    completeCurrentService(state, 1, T0 + 10) // releasedOne resumes
    completeCurrentService(state, 1, T0 + 11) // traveller (priority)
    expect(getNextEligibleCustomer(state, 1)?.id).toBe(normalA.id)
  })

  it("returns null for an empty counter", () => {
    const state = emptyState()
    expect(getNextEligibleCustomer(state, 3)).toBeNull()
  })
})

describe("queue override — human choice without queue corruption", () => {
  it("armed while serving, the override is applied at the next assignment", () => {
    const { state, current, normalB } = richScenario()

    setNextOverride(state, 1, normalB.id, T0 + 10, "Customer ready")
    // nothing happens while the current customer is still being served
    expect(state.counters[0].currentCustomerId).toBe(current.id)
    expect(state.counters[0].nextOverrideId).toBe(normalB.id)

    completeCurrentService(state, 1, T0 + 20)
    expect(state.counters[0].currentCustomerId).toBe(normalB.id)
    expect(normalB.status).toBe("serving")
  })

  it("does NOT reorder the queue — everyone else keeps position and timestamps", () => {
    const { state, releasedOne, normalA, normalB, traveller } = richScenario()
    const enteredBefore = [releasedOne, traveller, normalA].map(
      (c) => c.journey[c.journey.length - 1].enteredAt
    )

    setNextOverride(state, 1, normalB.id, T0 + 10)
    completeCurrentService(state, 1, T0 + 20) // override serves normalB

    // the three tiers are untouched apart from normalB's removal
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

  it("after the overridden customer completes, automation resumes with the original recommendation", () => {
    const { state, releasedOne, normalB } = richScenario()
    setNextOverride(state, 1, normalB.id, T0 + 10)
    completeCurrentService(state, 1, T0 + 20) // normalB serving (override)

    completeCurrentService(state, 1, T0 + 30) // normalB done
    // journey priority was never destroyed — released hold first
    expect(state.counters[0].currentCustomerId).toBe(releasedOne.id)
  })

  it("repeated overrides never permanently reorder the priority tiers", () => {
    const state = emptyState()
    issue(state, "Serving", 1)
    const pA = issue(state, "Priority A", 2, T0 + 1) // serving at C2
    const pB = issue(state, "Priority B", 3, T0 + 2) // serving at C3
    const nA = issue(state, "New A", 1, T0 + 3)
    const nB = issue(state, "New B", 1, T0 + 4)
    transferCustomer(state, pA.id, 1, T0 + 5) // priority arrival 1st
    transferCustomer(state, pB.id, 1, T0 + 6) // priority arrival 2nd

    setNextOverride(state, 1, nA.id, T0 + 10)
    completeCurrentService(state, 1, T0 + 11) // serves New A (override 1)
    setNextOverride(state, 1, nB.id, T0 + 12)
    completeCurrentService(state, 1, T0 + 13) // serves New B (override 2)

    expect(state.counters[0].priorityQueue).toEqual([pA.id, pB.id]) // intact
    completeCurrentService(state, 1, T0 + 20)
    expect(state.counters[0].currentCustomerId).toBe(pA.id) // automation resumes
  })

  it("choosing the recommended customer is a no-override (pure automation)", () => {
    const { state, releasedOne } = richScenario()
    setNextOverride(state, 1, releasedOne.id, T0 + 10) // = the recommendation
    completeCurrentService(state, 1, T0 + 20)

    expect(state.counters[0].currentCustomerId).toBe(releasedOne.id)
    expect(state.overrides).toHaveLength(0) // not an override — no audit entry
  })

  it("the bypassed recommended customer keeps position #1 and normal status", () => {
    const state = emptyState()
    issue(state, "Busy", 1)
    const w1 = issue(state, "Wait 1", 1, T0 + 1)
    const w2 = issue(state, "Wait 2", 1, T0 + 2)

    setNextOverride(state, 1, w2.id, T0 + 10)
    expect(state.counters[0].nextOverrideId).toBe(w2.id)
    completeCurrentService(state, 1, T0 + 20) // w2 served via override

    // the bypassed customer is simply still first in line — no side effects
    expect(w1.status).toBe("waiting")
    expect(queuePosition(state, w1.id)).toBe(1)
    expect(getNextEligibleCustomer(state, 1)?.id).toBe(w1.id)
  })

  it("records a full audit entry when the override takes effect", () => {
    const { state, releasedOne, normalB } = richScenario()
    setNextOverride(state, 1, normalB.id, T0 + 10, "Customer urgency")
    completeCurrentService(state, 1, T0 + 20)

    expect(state.overrides).toHaveLength(1)
    const record = state.overrides[0]
    expect(record).toMatchObject({
      at: T0 + 20,
      counterId: 1,
      employeeName: "Priya",
      recommendedToken: releasedOne.token,
      selectedToken: normalB.token,
      reason: "Customer urgency",
    })
    // reason is optional — never forced
    const again = richScenario()
    setNextOverride(again.state, 1, again.normalB.id, T0 + 10)
    completeCurrentService(again.state, 1, T0 + 20)
    expect(again.state.overrides[0].reason).toBeNull()
  })

  it("appears in the live activity feed as a subtle queue-override event", () => {
    const { state, normalB } = richScenario()
    setNextOverride(state, 1, normalB.id, T0 + 10)
    completeCurrentService(state, 1, T0 + 20)
    const activity = state.activities.find((a) => a.type === "queue-override")
    expect(activity?.message).toContain("manually selected")
    expect(activity?.message).toContain(normalB.token)
  })
})

describe("queue override — eligibility guardrails", () => {
  it("held customers cannot be overridden into service", () => {
    const state = emptyState()
    const held = issue(state, "Held", 1)
    issue(state, "Current", 1, T0 + 1)
    holdCurrentCustomer(state, 1, "Document required", T0 + 5)

    expect(held.status).toBe("on-hold")
    expect(() => setNextOverride(state, 1, held.id, T0 + 10)).toThrow(
      /not eligible/
    )
  })

  it("customers serving or waiting at another counter are not eligible", () => {
    const state = emptyState()
    const elsewhere = issue(state, "Elsewhere", 2) // serving at C2
    issue(state, "Busy At 1", 1, T0 + 1)
    expect(() => setNextOverride(state, 1, elsewhere.id, T0 + 10)).toThrow(
      /not eligible/
    )
  })

  it("an employee on break cannot override", () => {
    const state = emptyState()
    issue(state, "Paused", 1)
    const waiting = issue(state, "Waiting", 1, T0 + 1)
    startBreak(state, 1, T0 + 5)
    expect(() => setNextOverride(state, 1, waiting.id, T0 + 10)).toThrow(
      /resume work/i
    )
  })

  it("a stale override (customer transferred away) is discarded silently", () => {
    const { state, normalA, normalB } = richScenario()
    issue(state, "Busy At 2", 2, T0 + 8) // keep C2 busy
    setNextOverride(state, 1, normalB.id, T0 + 10)
    transferCustomer(state, normalB.id, 2, T0 + 12) // target leaves C1

    expect(state.counters[0].nextOverrideId).toBeNull()
    completeCurrentService(state, 1, T0 + 20)
    // normal automation — released hold first, no audit entry, no crash
    expect(state.overrides).toHaveLength(0)
    expect(queuePosition(state, normalA.id)).toBe(2)
  })
})

describe("override analytics (manager KPI)", () => {
  it("computes overrides, assignments and the override rate", () => {
    const { state, normalB } = richScenario()
    setNextOverride(state, 1, normalB.id, T0 + 10)
    completeCurrentService(state, 1, T0 + 20)

    const info = overrideBreakdown(state, T0 + 30)
    expect(info.overrides).toBe(1)
    // started service steps so far: releasedOne, current, traveller(C2),
    // traveller resumed?—no; started steps: releasedOne@C1, current@C1,
    // traveller@C2, normalB@C1(override) = 4
    expect(info.assignments).toBe(4)
    expect(info.rate).toBeCloseTo(1 / 4, 10)
  })

  it("breaks overrides down by employee and counter", () => {
    const { state, normalB } = richScenario()
    setNextOverride(state, 1, normalB.id, T0 + 10)
    completeCurrentService(state, 1, T0 + 20)

    const info = overrideBreakdown(state, T0 + 30)
    const priya = info.byEmployee.find((e) => e.employeeName === "Priya")
    expect(priya).toMatchObject({ counterId: 1, count: 1 })
    expect(
      info.byEmployee.filter((e) => e.employeeName !== "Priya")
        .every((e) => e.count === 0)
    ).toBe(true)
    expect(info.records[0].selectedToken).toBe(normalB.token)
  })

  it("rate is 0 with no assignments and overrides respect filters", () => {
    const empty = emptyState()
    expect(overrideBreakdown(empty, T0).rate).toBe(0)

    const { state, normalB } = richScenario()
    setNextOverride(state, 1, normalB.id, T0 + 10)
    completeCurrentService(state, 1, T0 + 20)
    const filtered = overrideBreakdown(state, T0 + 30, {
      time: "demo",
      employee: "Arjun",
      counter: "all",
      service: "all",
    })
    expect(filtered.overrides).toBe(0) // Priya's override filtered out
  })
})