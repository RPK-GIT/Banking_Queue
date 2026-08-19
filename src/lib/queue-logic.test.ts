import { describe, expect, it } from "vitest"

import {
  callCustomer,
  callNextCustomer,
  completeCurrentService,
  emptyState,
  getRecommendedCustomer,
  issueToken,
  queuePosition,
  transferCustomer,
} from "./queue-logic"
import { seedState } from "./seed"
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

describe("token issuing (Rules 1 & 2) — recommendation ≠ assignment", () => {
  it("a new customer WAITS even at a free counter until explicitly called", () => {
    const state = emptyState()
    const customer = issue(state, "Asha", 1)

    // the system recommends — it never assigns
    expect(customer.status).toBe("waiting")
    expect(state.counters[0].currentCustomerId).toBeNull()
    expect(state.counters[0].status).toBe("available")
    expect(customer.journey[0].startedAt).toBeNull()
    expect(getRecommendedCustomer(state, 1)?.id).toBe(customer.id)
  })

  it("an explicit call moves the customer to NOW SERVING", () => {
    const state = emptyState()
    const customer = issue(state, "Asha", 1)
    const called = callCustomer(state, 1, customer.id, T0 + 5)

    expect(called.id).toBe(customer.id)
    expect(customer.status).toBe("serving")
    expect(state.counters[0].currentCustomerId).toBe(customer.id)
    expect(customer.journey[0].startedAt).toBe(T0 + 5) // call timestamp
  })

  it("keeps strict FIFO among new requests — later arrivals never jump ahead", () => {
    const state = emptyState()
    const first = issue(state, "First", 1)
    const second = issue(state, "Second", 1, T0 + 1)
    const third = issue(state, "Third", 1, T0 + 2)

    expect(state.counters[0].queue).toEqual([first.id, second.id, third.id])
    expect(queuePosition(state, first.id)).toBe(1)
    expect(queuePosition(state, second.id)).toBe(2)
    expect(queuePosition(state, third.id)).toBe(3)
    expect(getRecommendedCustomer(state, 1)?.id).toBe(first.id)
  })

  it("assigns unique sequential tokens", () => {
    const state = emptyState()
    const a = issue(state, "A", 1)
    const b = issue(state, "B", 2)
    expect(a.token).toBe("T-101")
    expect(b.token).toBe("T-102")
    expect(a.token).not.toBe(b.token)
  })
})

describe("completion — recommends the next customer, never assigns", () => {
  it("after completion the counter stays AVAILABLE with a fresh recommendation", () => {
    const state = emptyState()
    const first = issue(state, "First", 1)
    const second = issue(state, "Second", 1, T0 + 1)
    callCustomer(state, 1, first.id, T0 + 5)

    completeCurrentService(state, 1, T0 + 10)

    expect(first.status).toBe("completed")
    // NO automatic assignment — the second customer is only recommended
    expect(state.counters[0].currentCustomerId).toBeNull()
    expect(state.counters[0].status).toBe("available")
    expect(second.status).toBe("waiting")
    expect(getRecommendedCustomer(state, 1)?.id).toBe(second.id)

    // the counter remains available until the employee explicitly calls
    callCustomer(state, 1, second.id, T0 + 20)
    expect(second.status).toBe("serving")
  })

  it("calling while already serving is rejected (no double assignment)", () => {
    const state = emptyState()
    const first = issue(state, "First", 1)
    const second = issue(state, "Second", 1, T0 + 1)
    callCustomer(state, 1, first.id, T0 + 5)

    expect(() => callCustomer(state, 1, second.id, T0 + 10)).toThrow(
      /already serving/
    )
  })

  it("a customer cannot be called by two counters (single queue membership)", () => {
    const state = emptyState()
    const customer = issue(state, "Solo", 1)
    // Counter 2 cannot call a customer waiting at Counter 1
    expect(() => callCustomer(state, 2, customer.id, T0 + 5)).toThrow(
      /not eligible/
    )
    callCustomer(state, 1, customer.id, T0 + 5)
    // once serving, no counter can call them again
    expect(() => callCustomer(state, 2, customer.id, T0 + 10)).toThrow(
      /not eligible/
    )
  })

  it("callNextCustomer calls exactly the recommendation (Rule 9)", () => {
    const state = emptyState()
    const first = issue(state, "First", 1)
    issue(state, "Second", 1, T0 + 1)
    const called = callNextCustomer(state, 1, T0 + 5)
    expect(called?.id).toBe(first.id)
    expect(callNextCustomer(state, 2, T0 + 6)).toBeNull() // empty counter
  })
})

describe("journey-aware transfers (Rules 4, 2, 8, 10)", () => {
  /** a customer being served at Counter 1 — their journey has started */
  function servingCustomerAtCounter1(state: QueueState) {
    const traveller = issue(state, "Traveller", 1)
    callCustomer(state, 1, traveller.id, T0 + 5)
    return traveller
  }

  it("a started journey joins the destination's PRIORITY queue, ahead of new requests", () => {
    const state = emptyState()
    const traveller = servingCustomerAtCounter1(state)
    const servingAt4 = issue(state, "Serving At 4", 4, T0 + 1)
    callCustomer(state, 4, servingAt4.id, T0 + 2)
    const existingA = issue(state, "Existing A", 4, T0 + 3)

    const result = transferCustomer(state, traveller.id, 4, T0 + 10)

    expect(result.tier).toBe("priority")
    expect(state.counters[3].priorityQueue).toEqual([traveller.id])
    expect(state.counters[3].queue).toEqual([existingA.id])
    expect(queuePosition(state, traveller.id)).toBe(1)
    expect(queuePosition(state, existingA.id)).toBe(2)
  })

  it("priority customers keep their ARRIVAL order — never reordered by token number", () => {
    const state = emptyState()
    const busy = issue(state, "Busy At 3", 3)
    callCustomer(state, 3, busy.id, T0 + 1)
    const late = issue(state, "Late Token", 2, T0 + 5) // higher token number
    callCustomer(state, 2, late.id, T0 + 6)
    const early = issue(state, "Early Token", 1, T0 + 7)
    callCustomer(state, 1, early.id, T0 + 8)

    transferCustomer(state, late.id, 3, T0 + 10) // arrives first
    transferCustomer(state, early.id, 3, T0 + 20) // arrives second

    expect(state.counters[2].priorityQueue).toEqual([late.id, early.id])
    completeCurrentService(state, 3, T0 + 30)
    expect(getRecommendedCustomer(state, 3)?.id).toBe(late.id)
  })

  it("transfer to an IDLE counter creates a RECOMMENDATION, not an assignment", () => {
    const state = emptyState()
    const traveller = servingCustomerAtCounter1(state)

    const result = transferCustomer(state, traveller.id, 4, T0 + 10)

    // this is the key product change — nobody is served without a call
    expect(result.recommendedNext).toBe(true)
    expect(traveller.status).toBe("waiting")
    expect(state.counters[3].currentCustomerId).toBeNull()
    expect(state.counters[3].priorityQueue).toEqual([traveller.id])
    expect(getRecommendedCustomer(state, 4)?.id).toBe(traveller.id)

    // the employee must explicitly call the transferred customer
    callCustomer(state, 4, traveller.id, T0 + 20)
    expect(traveller.status).toBe("serving")
    expect(traveller.journey[1].startedAt).toBe(T0 + 20)
  })

  it("the freed origin counter gets a recommendation — no auto-call", () => {
    const state = emptyState()
    const traveller = servingCustomerAtCounter1(state)
    const waiting = issue(state, "Waiting At 1", 1, T0 + 1)

    transferCustomer(state, traveller.id, 2, T0 + 10)

    expect(state.counters[0].currentCustomerId).toBeNull()
    expect(waiting.status).toBe("waiting")
    expect(getRecommendedCustomer(state, 1)?.id).toBe(waiting.id)
  })

  it("preserves the token and all previous counters in the journey", () => {
    const state = emptyState()
    const traveller = servingCustomerAtCounter1(state)
    const token = traveller.token

    transferCustomer(state, traveller.id, 4, T0 + 10)
    callCustomer(state, 4, traveller.id, T0 + 20)
    transferCustomer(state, traveller.id, 3, T0 + 30)

    expect(traveller.token).toBe(token)
    expect(traveller.journey.map((s) => s.counterId)).toEqual([1, 4, 3])
    expect(traveller.journey[0].status).toBe("completed")
    expect(traveller.journey[1].status).toBe("completed")
    expect(traveller.journey[2].status).toBe("waiting")
  })

  it("customer is at exactly one counter after a transfer (Rule 8)", () => {
    const state = emptyState()
    const traveller = servingCustomerAtCounter1(state)

    transferCustomer(state, traveller.id, 2, T0 + 10)

    expect(state.counters[0].currentCustomerId).toBeNull()
    expect(state.counters[0].queue).not.toContain(traveller.id)
    expect(state.counters[1].priorityQueue).toEqual([traveller.id])
    expect(traveller.currentCounterId).toBe(2)
  })
})

describe("journey completion (Rules 5 & 6)", () => {
  it("does NOT complete the customer when one counter finishes (transfer)", () => {
    const state = emptyState()
    const traveller = issue(state, "Traveller", 1)
    callCustomer(state, 1, traveller.id, T0 + 5)

    transferCustomer(state, traveller.id, 4, T0 + 10)

    expect(traveller.status).toBe("waiting")
    expect(traveller.completedAt).toBeNull()
    expect(traveller.journey[0].status).toBe("completed")
  })

  it("marks the customer Completed only on final completion", () => {
    const state = emptyState()
    const traveller = issue(state, "Traveller", 1)
    callCustomer(state, 1, traveller.id, T0 + 5)
    transferCustomer(state, traveller.id, 4, T0 + 10)
    callCustomer(state, 4, traveller.id, T0 + 20)

    const completed = completeCurrentService(state, 4, T0 + 30)

    expect(completed.status).toBe("completed")
    expect(completed.completedAt).toBe(T0 + 30)
    expect(completed.currentCounterId).toBeNull()
    expect(state.counters[3].currentCustomerId).toBeNull()
    expect(completed.journey.every((s) => s.status === "completed")).toBe(true)
  })
})

describe("branch layout (4 counters)", () => {
  it("initializes exactly four counters with no Counter 5", () => {
    const state = emptyState()
    expect(state.counters).toHaveLength(4)
    expect(state.counters.map((c) => c.id)).toEqual([1, 2, 3, 4])
    expect(state.counters.map((c) => c.name)).toEqual([
      "General Banking",
      "Cash Services",
      "Account Services",
      "Customer Service",
    ])
    expect(state.counters.some((c) => c.id === 5)).toBe(false)
  })

  it("seeded scenario never references a fifth counter", () => {
    const state = seedState(Date.now())
    expect(state.counters).toHaveLength(4)
    for (const customer of Object.values(state.customers)) {
      for (const step of customer.journey) {
        expect(step.counterId).toBeGreaterThanOrEqual(1)
        expect(step.counterId).toBeLessThanOrEqual(4)
      }
      for (const planned of customer.plannedRoute) {
        expect(planned).toBeGreaterThanOrEqual(1)
        expect(planned).toBeLessThanOrEqual(4)
      }
    }
  })
})

describe("reset (demo scenario)", () => {
  it("returns the application to a valid seeded demo state", () => {
    const now = Date.now()
    const state = seedState(now)

    const customers = Object.values(state.customers)
    expect(customers.length).toBeGreaterThanOrEqual(8)

    // the hero's complex multi-counter journey exists: C1 → C4 → C3 (→ C1)
    const ravi = customers.find((c) => c.token === "T-104")
    expect(ravi?.name).toBe("Ravi Kumar")
    expect(ravi?.journey.map((s) => s.counterId)).toEqual([1, 4, 3])
    expect(ravi?.plannedRoute).toEqual([1])
    expect(ravi?.status).toBe("serving")

    // every waiting customer sits in exactly one queue tier
    for (const customer of customers.filter((c) => c.status === "waiting")) {
      const queuesContaining = state.counters.filter(
        (counter) =>
          counter.queue.includes(customer.id) ||
          counter.priorityQueue.includes(customer.id) ||
          counter.releasedQueue.includes(customer.id)
      )
      expect(queuesContaining).toHaveLength(1)
    }

    // completed customers are in no queue
    for (const customer of customers.filter((c) => c.status === "completed")) {
      expect(queuePosition(state, customer.id)).toBeNull()
      expect(customer.completedAt).not.toBeNull()
    }

    // serving customers match counter assignments
    for (const counter of state.counters.filter((c) => c.currentCustomerId)) {
      const serving = state.customers[counter.currentCustomerId!]
      expect(serving.status).toBe("serving")
      expect(serving.currentCounterId).toBe(counter.id)
    }

    // seeding twice produces the same scenario shape (deterministic reset)
    const again = seedState(now)
    expect(Object.values(again.customers).map((c) => c.token)).toEqual(
      customers.map((c) => c.token)
    )
  })
})
