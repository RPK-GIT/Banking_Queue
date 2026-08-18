import { describe, expect, it } from "vitest"

import { seedState } from "./seed"
import { buildWhatsAppMessages, customerLiveStatus } from "./whatsapp"
import type { Customer, QueueState } from "./types"

const NOW = 1_755_000_000_000

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
    const joseph = byToken(state, "T-109") // waiting #2 at Counter 4
    const status = customerLiveStatus(state, joseph.id)

    expect(status.status).toBe("waiting")
    expect(status.counterId).toBe(4)
    expect(status.counterName).toBe("Customer Service")
    expect(status.position).toBe(2)
    expect(status.estWaitMin).toBe(7)
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
