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

  it("demonstrates the HOLD scenario deterministically (hold → held → release → priority → served)", () => {
    store().setDemoSpeed(1) // speed persists across tests — pin it
    store().playDemo()

    // advance until Ravi (T-104) is ON HOLD at Counter 1
    const raviId = () =>
      Object.values(store().state.customers).find((c) => c.token === "T-104")!.id
    let safety = 0
    while (
      store().state.customers[raviId()]?.status !== "on-hold" &&
      safety < DEMO_STEP_COUNT
    ) {
      vi.advanceTimersByTime(STEP_DELAY)
      safety += 1
    }
    const heldState = store().state
    const counter1 = heldState.counters[0]
    const ravi = heldState.customers[raviId()]
    expect(ravi.status).toBe("on-hold")
    expect(counter1.heldIds).toContain(ravi.id)
    expect(counter1.currentCustomerId).toBeNull()
    // another customer (T-116 Vikram) remains waiting in normal FIFO
    const vikram = Object.values(heldState.customers).find(
      (c) => c.token === "T-116"
    )
    expect(vikram).toBeDefined()

    // next step: Counter 1 calls next — the HELD ticket is skipped
    vi.advanceTimersByTime(STEP_DELAY)
    expect(store().state.counters[0].currentCustomerId).toBe(vikram!.id)
    expect(store().state.customers[raviId()].status).toBe("on-hold")

    // release → Ravi becomes NEXT AFTER CURRENT (priority queue)
    vi.advanceTimersByTime(STEP_DELAY)
    expect(store().state.counters[0].priorityQueue).toEqual([raviId()])
    expect(store().state.customers[raviId()].status).toBe("waiting")

    // current (Vikram) completes, then Ravi is served FIRST despite T-116's
    // hold-time arrival — the released hold restores his priority
    vi.advanceTimersByTime(STEP_DELAY) // complete Vikram
    vi.advanceTimersByTime(STEP_DELAY) // call next → Ravi
    expect(store().state.counters[0].currentCustomerId).toBe(raviId())

    // run to the end — Ravi's journey completes with exactly one hold episode
    vi.advanceTimersByTime(DEMO_STEP_COUNT * STEP_DELAY)
    const done = store().state.customers[raviId()]
    expect(done.status).toBe("completed")
    const lastStep = done.journey[done.journey.length - 1]
    expect(lastStep.holds).toHaveLength(1)
    expect(lastStep.holds[0].reason).toBe("Document required")
    expect(lastStep.holds[0].releasedAt).not.toBeNull()
    expect(lastStep.holds[0].resumedAt).not.toBeNull()
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
