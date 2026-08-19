import { describe, expect, it } from "vitest"

import {
  callNextCustomer,
  emptyState,
  endBreak,
  getRecommendedCustomer,
  holdCurrentCustomer,
  issueToken,
  releaseHold,
  startBreak,
} from "./queue-logic"
import { seedState } from "./seed"
import { buildWhatsAppMessages, customerLiveStatus } from "./whatsapp"
import type { Customer, QueueState } from "./types"

const NOW = 1_755_000_000_000
const MIN = 60_000

function byToken(state: QueueState, token: string): Customer {
  const customer = Object.values(state.customers).find((c) => c.token === token)
  if (!customer) throw new Error(`missing ${token}`)
  return customer
}

describe("WhatsApp customer view (derived, pause-safe)", () => {
  it("builds the full conversation for a multi-counter journey", () => {
    const state = seedState(NOW)
    const ravi = byToken(state, "T-104") // C1 ✓ → C4 ✓ → C3 (serving)

    const texts = buildWhatsAppMessages(ravi).map((m) => m.text)
    expect(texts).toHaveLength(6) // welcome + 3× "your turn" + 2× transfer
    expect(texts[0]).toContain("Your token is T-104")
    expect(texts[1]).toContain("Counter 1")
    expect(texts[2]).toContain("continues at Counter 4")
    expect(texts[4]).toContain("continues at Counter 3")
    expect(texts.some((t) => t.includes("All done"))).toBe(false)
  })

  it("adds a completion message when the journey finishes", () => {
    const state = seedState(NOW)
    const anil = byToken(state, "T-101") // completed at Counter 2
    const texts = buildWhatsAppMessages(anil).map((m) => m.text)
    expect(texts[texts.length - 1]).toContain("✅ All done")
  })

  it("is a pure derivation — identical state yields identical messages (no duplicates while paused)", () => {
    const state = seedState(NOW)
    const ravi = byToken(state, "T-104")
    const a = buildWhatsAppMessages(ravi)
    const b = buildWhatsAppMessages(ravi)
    expect(a).toEqual(b)
    expect(new Set(a.map((m) => m.id)).size).toBe(a.length) // unique ids
  })

  it("reports queue, position and estimated wait for a waiting customer", () => {
    const state = seedState(NOW)
    const joseph = byToken(state, "T-109") // waiting #1 at Counter 4
    const status = customerLiveStatus(state, joseph.id)

    expect(status.status).toBe("waiting")
    expect(status.counterId).toBe(4)
    expect(status.counterName).toBe("Customer Service")
    expect(status.position).toBe(1)
    expect(status.estWaitMin).toBe(3)
  })

  it("status snapshot is stable for unchanged state (frozen while paused)", () => {
    const state = seedState(NOW)
    const sunita = byToken(state, "T-112") // waiting #2 at Counter 3
    const first = customerLiveStatus(state, sunita.id)
    const second = customerLiveStatus(state, sunita.id)
    expect(first).toEqual(second)
    expect(first.position).toBe(2)
  })

  it("handles serving and completed customers", () => {
    const state = seedState(NOW)
    const ravi = byToken(state, "T-104")
    const serving = customerLiveStatus(state, ravi.id)
    expect(serving.status).toBe("serving")
    expect(serving.counterId).toBe(3)
    expect(serving.position).toBeNull()

    const anil = byToken(state, "T-101")
    const done = customerLiveStatus(state, anil.id)
    expect(done.status).toBe("completed")
    expect(done.counterId).toBeNull()
    expect(done.estWaitMin).toBeNull()
  })
})

describe("WhatsApp — recommendation ≠ assignment", () => {
  it("a RECOMMENDED customer still shows Waiting until explicitly called", () => {
    const state = emptyState()
    const customer = issueToken(
      state,
      { name: "Waiting One", serviceType: "Cash Deposit", counterId: 1 },
      NOW - 5 * MIN
    )
    expect(getRecommendedCustomer(state, 1)?.id).toBe(customer.id)

    // recommended — but the status is WAITING, position #1, no turn message
    const status = customerLiveStatus(state, customer.id)
    expect(status.status).toBe("waiting")
    expect(status.position).toBe(1)
    const texts = buildWhatsAppMessages(customer).map((m) => m.text)
    expect(texts.some((t) => t.includes("It's your turn"))).toBe(false)

    // the explicit call flips the customer to serving + turn message
    callNextCustomer(state, 1, NOW - MIN)
    expect(customerLiveStatus(state, customer.id).status).toBe("serving")
    const after = buildWhatsAppMessages(customer).map((m) => m.text)
    expect(after.some((t) => t.includes("It's your turn"))).toBe(true)
  })
})

describe("WhatsApp hold experience (driven by ACTUAL state, never faked)", () => {
  function heldScenario() {
    const state = emptyState()
    const customer = issueToken(
      state,
      { name: "Ravi Kumar", serviceType: "Account Opening", counterId: 1 },
      NOW - 10 * MIN
    )
    callNextCustomer(state, 1, NOW - 10 * MIN) // explicit call
    holdCurrentCustomer(state, 1, "Document required", NOW - 5 * MIN)
    // another customer is called, so a release stays NEXT AFTER CURRENT
    issueToken(
      state,
      { name: "Keeps Busy", serviceType: "Cash Deposit", counterId: 1 },
      NOW - 4 * MIN
    )
    callNextCustomer(state, 1, NOW - 4 * MIN)
    return { state, customer }
  }

  it("shows the on-hold message with the reason, and status On Hold without a queue position", () => {
    const { state, customer } = heldScenario()

    const texts = buildWhatsAppMessages(customer).map((m) => m.text)
    const holdMessage = texts.find((t) => t.includes("temporarily on hold"))
    expect(holdMessage).toBeDefined()
    expect(holdMessage).toContain("Reason: Document required")
    expect(holdMessage).toContain("We will resume your service shortly")

    const status = customerLiveStatus(state, customer.id)
    expect(status.status).toBe("on-hold")
    expect(status.holdReason).toBe("Document required")
    expect(status.position).toBeNull() // never a normal queue position on hold
    expect(status.priority).toBe(false)
  })

  it("shows the resumed message and Priority — Next After Current when released", () => {
    const { state, customer } = heldScenario()
    releaseHold(state, customer.id, NOW - 2 * MIN)

    const texts = buildWhatsAppMessages(customer).map((m) => m.text)
    expect(texts.some((t) => t.includes("Your request has been resumed"))).toBe(true)
    expect(texts.some((t) => t.includes("You will be served next"))).toBe(true)

    const status = customerLiveStatus(state, customer.id)
    expect(status.status).toBe("waiting")
    expect(status.priority).toBe(true) // Priority — Next After Current
    expect(status.position).toBe(1)
    expect(status.holdReason).toBeNull()
  })

  it("hold messages are a pure derivation — stable while paused", () => {
    const { customer } = heldScenario()
    const a = buildWhatsAppMessages(customer)
    const b = buildWhatsAppMessages(customer)
    expect(a).toEqual(b)
    expect(new Set(a.map((m) => m.id)).size).toBe(a.length)
  })
})

describe("WhatsApp employee-break experience (customer-friendly, no staff internals)", () => {
  function pausedScenario() {
    const state = emptyState()
    const customer = issueToken(
      state,
      { name: "Lakshmi Rao", serviceType: "Cash Withdrawal", counterId: 2 },
      NOW - 10 * MIN
    )
    callNextCustomer(state, 2, NOW - 10 * MIN) // explicit call
    startBreak(state, 2, NOW - 5 * MIN)
    return { state, customer }
  }

  it("shows SERVICE TEMPORARILY PAUSED without exposing employee details", () => {
    const { state, customer } = pausedScenario()

    const texts = buildWhatsAppMessages(customer).map((m) => m.text)
    const pauseMessage = texts.find((t) => t.includes("temporarily paused"))
    expect(pauseMessage).toBe(
      "Your service is temporarily paused and will resume shortly."
    )
    // never leak internal staff information to the customer
    expect(pauseMessage).not.toMatch(/break|employee|Arjun/i)

    const status = customerLiveStatus(state, customer.id)
    expect(status.status).toBe("serving")
    expect(status.paused).toBe(true)
  })

  it("announces the resume when the employee returns", () => {
    const { state, customer } = pausedScenario()
    endBreak(state, 2, NOW - MIN)

    const texts = buildWhatsAppMessages(customer).map((m) => m.text)
    expect(texts.some((t) => t.includes("Your service has resumed"))).toBe(true)

    const status = customerLiveStatus(state, customer.id)
    expect(status.paused).toBe(false)
    expect(status.status).toBe("serving")
  })

  it("break messages never duplicate — pure derivation", () => {
    const { customer } = pausedScenario()
    const a = buildWhatsAppMessages(customer)
    expect(a).toEqual(buildWhatsAppMessages(customer))
    expect(new Set(a.map((m) => m.id)).size).toBe(a.length)
  })
})
