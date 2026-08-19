import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  }),
}))

import { DEMO_STEP_COUNT, useQueueStore } from "./queue-store"

const INITIAL_DELAY = 600
const STEP_DELAY = 3200

function store() {
  return useQueueStore.getState()
}

function snapshot(): string {
  return JSON.stringify(store().state)
}

beforeEach(() => {
  vi.useFakeTimers()
  store().clearAll()
})

afterEach(() => {
  store().clearAll()
  vi.useRealTimers()
})

describe("demo engine — pause freezes the simulation, not the app", () => {
  it("pause stops the demo timer and all automated business events", () => {
    store().playDemo()
    vi.advanceTimersByTime(INITIAL_DELAY)
    expect(store().demoStepIndex).toBe(1)

    store().pauseDemo()
    const frozen = snapshot()

    vi.advanceTimersByTime(10 * STEP_DELAY)
    expect(store().demoStepIndex).toBe(1)
    expect(snapshot()).toBe(frozen)
    expect(store().demoStatus).toBe("paused")
  })

  it("manual interactions still work while paused (UI is not disabled)", () => {
    store().playDemo()
    vi.advanceTimersByTime(INITIAL_DELAY)
    store().pauseDemo()

    // a presenter-driven mutation must still be possible while the ENGINE is
    // paused — pause is engine state, not an application lock
    const customer = store().issue({
      name: "Paused Probe",
      serviceType: "Cash Deposit",
      counterId: 2,
    })
    expect(store().state.customers[customer.id]).toBeDefined()
    expect(store().demoStatus).toBe("paused")
  })

  it("resume continues from the exact remaining time — no restart, skip or replay", () => {
    store().playDemo()
    vi.advanceTimersByTime(INITIAL_DELAY) // step 1 fires, 3200ms scheduled
    vi.advanceTimersByTime(1000) // 2200ms remain
    store().pauseDemo()

    vi.advanceTimersByTime(60_000) // frozen
    store().playDemo() // resume

    vi.advanceTimersByTime(2199)
    expect(store().demoStepIndex).toBe(1) // not yet — no skipped events
    vi.advanceTimersByTime(1)
    expect(store().demoStepIndex).toBe(2) // fires exactly on time — no replay
  })

  it("speed can be changed while paused and applies only on resume", () => {
    store().playDemo()
    vi.advanceTimersByTime(INITIAL_DELAY) // step 1 done, full 3200 remaining
    store().pauseDemo()

    store().setDemoSpeed(2)
    vi.advanceTimersByTime(60_000)
    expect(store().demoStepIndex).toBe(1) // nothing happens immediately
    expect(store().demoStatus).toBe("paused")

    store().playDemo() // resume at 2× → 3200 base / 2 = 1600ms
    vi.advanceTimersByTime(1599)
    expect(store().demoStepIndex).toBe(1)
    vi.advanceTimersByTime(1)
    expect(store().demoStepIndex).toBe(2)
  })

  it("step executes exactly ONE event and remains paused", () => {
    store().playDemo()
    vi.advanceTimersByTime(INITIAL_DELAY)
    store().pauseDemo()
    expect(store().demoStepIndex).toBe(1)

    store().stepDemo()
    expect(store().demoStepIndex).toBe(2)
    expect(store().demoStatus).toBe("paused")

    // staying paused: time passing runs nothing
    vi.advanceTimersByTime(10 * STEP_DELAY)
    expect(store().demoStepIndex).toBe(2)
  })

  it("step from idle starts a fresh scripted demo in paused inspect mode", () => {
    store().stepDemo()
    expect(store().demoStepIndex).toBe(1)
    expect(store().demoStatus).toBe("paused")
  })

  it("runs to completion with no duplicated events", () => {
    store().playDemo()
    vi.advanceTimersByTime(INITIAL_DELAY + DEMO_STEP_COUNT * STEP_DELAY)

    expect(store().demoStepIndex).toBe(DEMO_STEP_COUNT)
    expect(store().demoStatus).toBe("idle")

    const issued = store().state.activities.filter((a) =>
      a.message.startsWith("T-115 issued")
    )
    expect(issued).toHaveLength(1) // the demo customer was created exactly once

    const aisha = Object.values(store().state.customers).find(
      (c) => c.token === "T-115"
    )
    expect(aisha?.status).toBe("completed")
    expect(aisha?.journey.map((s) => s.counterId)).toEqual([1, 4, 3])
  })

  it("pause/step/resume cycles never duplicate or drop events", () => {
    store().playDemo()
    vi.advanceTimersByTime(INITIAL_DELAY)
    store().pauseDemo()
    store().stepDemo()
    store().stepDemo()
    store().playDemo()
    vi.advanceTimersByTime(DEMO_STEP_COUNT * STEP_DELAY)

    expect(store().demoStepIndex).toBe(DEMO_STEP_COUNT)
    const issued = store().state.activities.filter((a) =>
      a.message.startsWith("T-115 issued")
    )
    expect(issued).toHaveLength(1)
  })

  it("completes the hero's four-stop journey (C1 → C4 → C3 → C1)", () => {
    store().playDemo()
    vi.advanceTimersByTime(INITIAL_DELAY + DEMO_STEP_COUNT * STEP_DELAY)

    const ravi = Object.values(store().state.customers).find(
      (c) => c.token === "T-104"
    )
    expect(ravi?.status).toBe("completed")
    expect(ravi?.journey.map((s) => s.counterId)).toEqual([1, 4, 3, 1])
  })

  it("demonstrates the manual-call model: recommendation → employee call → Now Serving", () => {
    store().setDemoSpeed(1) // speed persists across tests — pin it
    store().playDemo()

    const byToken = (token: string) =>
      Object.values(store().state.customers).find((c) => c.token === token)
    const counter = (id: number) => store().state.counters[id - 1]
    const step = (n: number) => {
      while (store().demoStepIndex < n) vi.advanceTimersByTime(STEP_DELAY)
    }

    // completion RECOMMENDS — nobody becomes Now Serving automatically
    step(2) // Counter 1 completes T-106
    expect(byToken("T-106")?.status).toBe("completed")
    expect(counter(1).currentCustomerId).toBeNull() // no auto-assignment
    expect(byToken("T-114")?.status).toBe("waiting")

    // the demo performs the EXPLICIT call (same business action as a human)
    step(3)
    expect(counter(1).currentCustomerId).toBe(byToken("T-114")!.id)

    // journey-started transfer → PRIORITY queue at busy Counter 4
    step(6)
    expect(counter(4).priorityQueue).toEqual([byToken("T-115")!.id])
    expect(counter(4).queue).toContain(byToken("T-109")!.id)
    step(7) // C4 completes T-107 → T-115 is recommended, still waiting
    expect(counter(4).currentCustomerId).toBeNull()
    expect(byToken("T-115")?.status).toBe("waiting")
    step(8) // Deepa calls T-115 — journey priority honored explicitly
    expect(counter(4).currentCustomerId).toBe(byToken("T-115")!.id)

    // HOLD frees the counter but assigns nobody
    step(11)
    expect(byToken("T-104")?.status).toBe("on-hold")
    expect(counter(3).heldIds).toEqual([byToken("T-104")!.id])
    expect(counter(3).currentCustomerId).toBeNull() // available, no auto-call
    step(12) // Kavita explicitly calls Aisha
    expect(counter(3).currentCustomerId).toBe(byToken("T-115")!.id)

    // release → NEXT AFTER CURRENT; completion only recommends the released
    step(14)
    expect(byToken("T-115")?.status).toBe("completed")
    expect(counter(3).releasedQueue).toEqual([byToken("T-104")!.id])
    expect(counter(3).currentCustomerId).toBeNull() // recommended, not served
    step(15)
    expect(counter(3).currentCustomerId).toBe(byToken("T-104")!.id)

    // transfer to IDLE counter → recommendation, NOT assignment
    step(16)
    expect(counter(1).currentCustomerId).toBeNull()
    expect(byToken("T-104")?.status).toBe("waiting")
    expect(counter(1).priorityQueue).toEqual([byToken("T-104")!.id])
    step(17) // Priya explicitly calls Ravi
    expect(counter(1).currentCustomerId).toBe(byToken("T-104")!.id)

    // employee break pauses the current service; arrivals wait
    step(19)
    expect(counter(1).status).toBe("on-break")
    expect(counter(1).currentCustomerId).toBe(byToken("T-104")!.id)
    expect(byToken("T-116")?.status).toBe("waiting")

    // return from break resumes the SAME customer
    step(20)
    expect(counter(1).status).toBe("serving")
    expect(counter(1).currentCustomerId).toBe(byToken("T-104")!.id)

    // completion after the break: T-116 recommended, not assigned
    step(21)
    const ravi = byToken("T-104")!
    expect(ravi.status).toBe("completed")
    expect(counter(1).currentCustomerId).toBeNull()
    expect(byToken("T-116")?.status).toBe("waiting")

    // Ravi's audit trail carries exactly one hold and one break pause
    expect(ravi.journey.flatMap((s) => s.holds)).toHaveLength(1)
    expect(ravi.journey.flatMap((s) => s.breaks)).toHaveLength(1)
    expect(ravi.journey.flatMap((s) => s.holds)[0].resumedAt).not.toBeNull()

    // run to the end cleanly
    step(DEMO_STEP_COUNT)
    expect(store().demoStatus).toBe("idle")
  })

  it("demonstrates QUEUE OVERRIDE: recommendation → override call → recommendation returns", () => {
    store().setDemoSpeed(1)
    store().playDemo()

    const byToken = (token: string) =>
      Object.values(store().state.customers).find((c) => c.token === token)
    const counter2 = () => store().state.counters[1]
    const step = (n: number) => {
      while (store().demoStepIndex < n) vi.advanceTimersByTime(STEP_DELAY)
    }

    // step 22: Counter 2 completes T-108 — T-111 recommended, nobody assigned
    step(22)
    expect(counter2().currentCustomerId).toBeNull()
    expect(counter2().queue).toEqual([byToken("T-111")!.id, byToken("T-113")!.id])

    // step 23: Arjun CALLS T-113 instead — override audited, T-111 untouched
    step(23)
    expect(counter2().currentCustomerId).toBe(byToken("T-113")!.id)
    expect(counter2().queue).toEqual([byToken("T-111")!.id]) // position kept
    expect(store().state.overrides).toHaveLength(1)
    expect(store().state.overrides[0]).toMatchObject({
      counterId: 2,
      employeeName: "Arjun",
      recommendedToken: "T-111",
      selectedToken: "T-113",
      reason: "Customer ready",
    })

    // step 24: T-113 completes — T-111 recommended again, NOT auto-assigned
    step(24)
    expect(counter2().currentCustomerId).toBeNull()
    expect(byToken("T-111")?.status).toBe("waiting")

    // step 25: Arjun calls T-111 — back to following the recommendation
    step(25)
    expect(counter2().currentCustomerId).toBe(byToken("T-111")!.id)

    step(DEMO_STEP_COUNT)
    expect(store().demoStatus).toBe("idle")
    expect(byToken("T-111")?.status).toBe("completed")
    expect(store().state.overrides).toHaveLength(1) // exactly one, never repeated
  })

  it("pause prevents any new notifications from being generated", async () => {
    const { toast } = await import("sonner")
    store().playDemo()
    vi.advanceTimersByTime(INITIAL_DELAY)
    store().pauseDemo()

    const calls = () =>
      (toast.info as ReturnType<typeof vi.fn>).mock.calls.length +
      (toast.success as ReturnType<typeof vi.fn>).mock.calls.length +
      (toast.error as ReturnType<typeof vi.fn>).mock.calls.length

    const before = calls()
    vi.advanceTimersByTime(20 * STEP_DELAY)
    expect(calls()).toBe(before) // frozen engine → zero new notifications
  })

  it("restart (play after completion) resets and replays cleanly", () => {
    store().playDemo()
    vi.advanceTimersByTime(INITIAL_DELAY + DEMO_STEP_COUNT * STEP_DELAY)
    expect(store().demoStepIndex).toBe(DEMO_STEP_COUNT)

    store().playDemo() // replay from scratch
    expect(store().demoStepIndex).toBe(0)
    expect(store().demoStatus).toBe("playing")
    vi.advanceTimersByTime(INITIAL_DELAY)
    expect(store().demoStepIndex).toBe(1)
  })

  it("reset returns to the seeded scenario and stops the engine", () => {
    store().playDemo()
    vi.advanceTimersByTime(INITIAL_DELAY)
    store().resetDemo()

    expect(store().demoStatus).toBe("idle")
    expect(store().demoStepIndex).toBe(0)
    const tokens = Object.values(store().state.customers).map((c) => c.token)
    expect(tokens).toContain("T-104")
    expect(tokens).not.toContain("T-115")

    vi.advanceTimersByTime(60_000)
    expect(snapshot()).toContain("T-104") // nothing keeps running
    expect(store().demoStepIndex).toBe(0)
  })
})
