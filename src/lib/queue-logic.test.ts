import { describe, expect, it } from "vitest"

import {
  callNextCustomer,
  completeCurrentService,
  emptyState,
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

describe("token issuing (Rules 1 & 2)", () => {
  it("adds a new customer to an empty queue at position #1", () => {
    const state = emptyState()
    const customer = issue(state, "Asha", 1)

    expect(state.counters[0].queue).toEqual([customer.id])
    expect(queuePosition(state, customer.id)).toBe(1)
    expect(customer.status).toBe("waiting")
    expect(customer.currentCounterId).toBe(1)
  })

  it("places the second customer behind the first", () => {
    const state = emptyState()
    const first = issue(state, "First", 1)
    const second = issue(state, "Second", 1, T0 + 1)

    expect(state.counters[0].queue).toEqual([first.id, second.id])
    expect(queuePosition(state, second.id)).toBe(2)
  })

  it("places the third customer behind the second", () => {
    const state = emptyState()
    issue(state, "First", 1)
    const second = issue(state, "Second", 1, T0 + 1)
    const third = issue(state, "Third", 1, T0 + 2)

    expect(queuePosition(state, second.id)).toBe(2)
    expect(queuePosition(state, third.id)).toBe(3)
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

describe("calling customers (Rule 9)", () => {
  it("serves the first customer before the second", () => {
    const state = emptyState()
    const first = issue(state, "First", 1)
    const second = issue(state, "Second", 1, T0 + 1)

    const called = callNextCustomer(state, 1, T0 + 10)

    expect(called?.id).toBe(first.id)
    expect(called?.status).toBe("serving")
    expect(state.counters[0].currentCustomerId).toBe(first.id)
    expect(state.counters[0].queue).toEqual([second.id])
    expect(queuePosition(state, second.id)).toBe(1)
  })

  it("refuses to call while already serving", () => {
    const state = emptyState()
    issue(state, "First", 1)
    issue(state, "Second", 1, T0 + 1)
    callNextCustomer(state, 1, T0 + 10)

    expect(() => callNextCustomer(state, 1, T0 + 20)).toThrow()
  })
})

describe("transfers (Rules 4, 2, 8, 10)", () => {
  function servingCustomerAtCounter1(state: QueueState) {
    const customer = issue(state, "Traveller", 1)
    callNextCustomer(state, 1, T0 + 5)
    return customer
  }

  it("appends the transferred customer to the END of the destination queue", () => {
    const state = emptyState()
    const traveller = servingCustomerAtCounter1(state)
    const existingA = issue(state, "Existing A", 4, T0 + 1)
    const existingB = issue(state, "Existing B", 4, T0 + 2)

    const result = transferCustomer(state, traveller.id, 4, T0 + 10)

    expect(state.counters[3].queue).toEqual([
      existingA.id,
      existingB.id,
      traveller.id,
    ])
    expect(result.position).toBe(3)
    expect(queuePosition(state, traveller.id)).toBe(3)
  })

  it("keeps the priority of customers already in the destination queue", () => {
    const state = emptyState()
    const traveller = servingCustomerAtCounter1(state)
    const existing = issue(state, "Existing", 4, T0 + 1)

    transferCustomer(state, traveller.id, 4, T0 + 10)
    const called = callNextCustomer(state, 4, T0 + 20)

    expect(called?.id).toBe(existing.id)
    expect(queuePosition(state, traveller.id)).toBe(1)
  })

  it("preserves the token and all previous counters in the journey", () => {
    const state = emptyState()
    const traveller = servingCustomerAtCounter1(state)
    const token = traveller.token

    transferCustomer(state, traveller.id, 4, T0 + 10)
    callNextCustomer(state, 4, T0 + 20)
    transferCustomer(state, traveller.id, 3, T0 + 30)

    expect(traveller.token).toBe(token)
    expect(traveller.journey.map((s) => s.counterId)).toEqual([1, 4, 3])
    expect(traveller.journey[0].status).toBe("completed")
    expect(traveller.journey[1].status).toBe("completed")
    expect(traveller.journey[2].status).toBe("waiting")
  })

  it("frees the origin counter and leaves the customer waiting at exactly one queue (Rule 8)", () => {
    const state = emptyState()
    const traveller = servingCustomerAtCounter1(state)

    transferCustomer(state, traveller.id, 2, T0 + 10)

    expect(state.counters[0].currentCustomerId).toBeNull()
    expect(state.counters[0].queue).not.toContain(traveller.id)
    expect(state.counters[1].queue).toEqual([traveller.id])
    expect(traveller.currentCounterId).toBe(2)
  })
})

describe("journey completion (Rules 5 & 6)", () => {
  it("does NOT complete the customer when one counter finishes (transfer)", () => {
    const state = emptyState()
    const traveller = issue(state, "Traveller", 1)
    callNextCustomer(state, 1, T0 + 5)

    transferCustomer(state, traveller.id, 4, T0 + 10)

    expect(traveller.status).toBe("waiting")
    expect(traveller.completedAt).toBeNull()
    expect(traveller.journey[0].status).toBe("completed")
  })

  it("marks the customer Completed only on final completion", () => {
    const state = emptyState()
    const traveller = issue(state, "Traveller", 1)
    callNextCustomer(state, 1, T0 + 5)
    transferCustomer(state, traveller.id, 4, T0 + 10)
    callNextCustomer(state, 4, T0 + 20)

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

    // every waiting customer sits in exactly one queue
    for (const customer of customers.filter((c) => c.status === "waiting")) {
      const queuesContaining = state.counters.filter((counter) =>
        counter.queue.includes(customer.id)
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
