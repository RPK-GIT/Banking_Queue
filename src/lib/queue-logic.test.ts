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

describe("token issuing (Rules 1 & 2, automatic assignment)", () => {
  it("assigns a new customer immediately when the counter is free", () => {
    const state = emptyState()
    const customer = issue(state, "Asha", 1)

    // idle counter + available employee → no artificial wait, no Call Next
    expect(customer.status).toBe("serving")
    expect(state.counters[0].currentCustomerId).toBe(customer.id)
    expect(customer.journey[0].startedAt).toBe(T0)
    expect(customer.currentCounterId).toBe(1)
  })

  it("queues the second customer at position #1 while the first is served", () => {
    const state = emptyState()
    const first = issue(state, "First", 1)
    const second = issue(state, "Second", 1, T0 + 1)

    expect(state.counters[0].currentCustomerId).toBe(first.id)
    expect(state.counters[0].queue).toEqual([second.id])
    expect(second.status).toBe("waiting")
    expect(queuePosition(state, second.id)).toBe(1)
  })

  it("keeps strict FIFO among new requests — later arrivals never jump ahead", () => {
    const state = emptyState()
    issue(state, "Serving", 1)
    const second = issue(state, "Second", 1, T0 + 1)
    const third = issue(state, "Third", 1, T0 + 2)
    const fourth = issue(state, "Fourth", 1, T0 + 3)

    expect(state.counters[0].queue).toEqual([second.id, third.id, fourth.id])
    expect(queuePosition(state, second.id)).toBe(1)
    expect(queuePosition(state, third.id)).toBe(2)
    expect(queuePosition(state, fourth.id)).toBe(3)
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

describe("automatic next assignment (journey-aware FIFO)", () => {
  it("completion automatically assigns the next waiting customer — no Call Next", () => {
    const state = emptyState()
    const first = issue(state, "First", 1)
    const second = issue(state, "Second", 1, T0 + 1)

    completeCurrentService(state, 1, T0 + 10)

    expect(first.status).toBe("completed")
    expect(second.status).toBe("serving")
    expect(state.counters[0].currentCustomerId).toBe(second.id)
    expect(state.counters[0].queue).toEqual([])
  })

  it("leaves the counter idle when nothing is waiting", () => {
    const state = emptyState()
    issue(state, "Only", 1)
    completeCurrentService(state, 1, T0 + 10)

    expect(state.counters[0].currentCustomerId).toBeNull()
    expect(state.counters[0].status).toBe("available")
  })

  it("manual Call Next still refuses while already serving (Rule 9)", () => {
    const state = emptyState()
    issue(state, "First", 1)
    issue(state, "Second", 1, T0 + 1)

    expect(() => callNextCustomer(state, 1, T0 + 20)).toThrow()
  })
})

describe("journey-aware transfers (Rules 4, 2, 8, 10)", () => {
  /** a customer being served at Counter 1 — their journey has started */
  function servingCustomerAtCounter1(state: QueueState) {
    return issue(state, "Traveller", 1) // auto-assigned immediately
  }

  it("a started journey joins the destination's PRIORITY queue, ahead of new requests", () => {
    const state = emptyState()
    const traveller = servingCustomerAtCounter1(state)
    const servingAt4 = issue(state, "Serving At 4", 4, T0 + 1)
    const existingA = issue(state, "Existing A", 4, T0 + 2)
    const existingB = issue(state, "Existing B", 4, T0 + 3)

    const result = transferCustomer(state, traveller.id, 4, T0 + 10)

    expect(result.tier).toBe("priority")
    expect(state.counters[3].currentCustomerId).toBe(servingAt4.id)
    expect(state.counters[3].priorityQueue).toEqual([traveller.id])
    expect(state.counters[3].queue).toEqual([existingA.id, existingB.id])
    // effective line: traveller first, then the new requests
    expect(queuePosition(state, traveller.id)).toBe(1)
    expect(queuePosition(state, existingA.id)).toBe(2)
    expect(queuePosition(state, existingB.id)).toBe(3)
  })

  it("priority customers keep their ARRIVAL order — never reordered by token number", () => {
    const state = emptyState()
    // higher token number arrives at Counter 3 FIRST — must stay first
    issue(state, "Busy At 3", 3) // keeps Counter 3 busy
    const late = issue(state, "Late Token", 2, T0 + 5) // T-102, serving at C2
    const early = issue(state, "Early Token", 1, T0 + 6) // T-103, serving at C1

    transferCustomer(state, late.id, 3, T0 + 10) // arrives first
    transferCustomer(state, early.id, 3, T0 + 20) // arrives second

    expect(state.counters[2].priorityQueue).toEqual([late.id, early.id])
    expect(queuePosition(state, late.id)).toBe(1)
    expect(queuePosition(state, early.id)).toBe(2)

    completeCurrentService(state, 3, T0 + 30)
    expect(state.counters[2].currentCustomerId).toBe(late.id)
  })

  it("priority queue is served before the normal queue on completion", () => {
    const state = emptyState()
    const serving = issue(state, "Serving", 2)
    const normalA = issue(state, "Normal A", 2, T0 + 1)
    const traveller = issue(state, "Traveller", 1, T0 + 2)
    transferCustomer(state, traveller.id, 2, T0 + 10) // journey started → priority

    completeCurrentService(state, 2, T0 + 20)

    expect(serving.status).toBe("completed")
    expect(state.counters[1].currentCustomerId).toBe(traveller.id)
    expect(queuePosition(state, normalA.id)).toBe(1)
  })

  it("a never-started journey transfers into the normal NEW REQUESTS queue", () => {
    const state = emptyState()
    issue(state, "Busy At 1", 1)
    const fresh = issue(state, "Fresh", 1, T0 + 1) // waiting — never started
    issue(state, "Busy At 2", 2, T0 + 2)
    const existing = issue(state, "Existing", 2, T0 + 3)

    const result = transferCustomer(state, fresh.id, 2, T0 + 10)

    expect(result.tier).toBe("normal")
    expect(state.counters[1].queue).toEqual([existing.id, fresh.id])
    expect(state.counters[1].priorityQueue).toEqual([])
  })

  it("transfer to an IDLE counter serves the customer immediately", () => {
    const state = emptyState()
    const traveller = servingCustomerAtCounter1(state)

    const result = transferCustomer(state, traveller.id, 4, T0 + 10)

    expect(result.assignedImmediately).toBe(true)
    expect(traveller.status).toBe("serving")
    expect(state.counters[3].currentCustomerId).toBe(traveller.id)
    expect(traveller.journey[1].startedAt).toBe(T0 + 10)
  })

  it("the freed origin counter automatically assigns its own next customer", () => {
    const state = emptyState()
    const traveller = servingCustomerAtCounter1(state)
    const waiting = issue(state, "Waiting At 1", 1, T0 + 1)
    issue(state, "Busy At 2", 2, T0 + 2)

    transferCustomer(state, traveller.id, 2, T0 + 10)

    expect(state.counters[0].currentCustomerId).toBe(waiting.id)
    expect(waiting.status).toBe("serving")
  })

  it("preserves the token and all previous counters in the journey", () => {
    const state = emptyState()
    const traveller = servingCustomerAtCounter1(state)
    const token = traveller.token

    transferCustomer(state, traveller.id, 4, T0 + 10) // idle → serving at C4
    transferCustomer(state, traveller.id, 3, T0 + 30) // idle → serving at C3

    expect(traveller.token).toBe(token)
    expect(traveller.journey.map((s) => s.counterId)).toEqual([1, 4, 3])
    expect(traveller.journey[0].status).toBe("completed")
    expect(traveller.journey[1].status).toBe("completed")
    expect(traveller.journey[2].status).toBe("serving")
  })

  it("customer is at exactly one counter after a transfer (Rule 8)", () => {
    const state = emptyState()
    const traveller = servingCustomerAtCounter1(state)
    issue(state, "Busy At 2", 2, T0 + 1)

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
    issue(state, "Busy At 4", 4, T0 + 1) // keep destination busy

    transferCustomer(state, traveller.id, 4, T0 + 10)

    expect(traveller.status).toBe("waiting")
    expect(traveller.completedAt).toBeNull()
    expect(traveller.journey[0].status).toBe("completed")
  })

  it("marks the customer Completed only on final completion", () => {
    const state = emptyState()
    const traveller = issue(state, "Traveller", 1)
    transferCustomer(state, traveller.id, 4, T0 + 10) // idle → serving

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
