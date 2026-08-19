"use client"

import { create } from "zustand"

import { notifyTransient } from "./notifications"
import {
  callNextCustomer,
  completeCurrentService,
  COUNTER_DEFS,
  emptyState,
  endBreak,
  holdCurrentCustomer,
  issueToken,
  releaseHold,
  startBreak,
  transferCustomer,
  type IssueTokenInput,
  type TransferResult,
} from "./queue-logic"
import { seedState } from "./seed"
import type { Counter, Customer, HoldReason, QueueState } from "./types"

// v3 — journey-aware FIFO tiers (releasedQueue) and employee breaks
const STORAGE_KEY = "smart-bank-queue-v3"

export type DemoStatus = "idle" | "playing" | "paused"
export type DemoSpeed = 0.5 | 1 | 2 | 4
export const DEMO_SPEEDS: DemoSpeed[] = [0.5, 1, 2, 4]

interface QueueStore {
  /** application/business state — what the branch looks like */
  state: QueueState
  hydrated: boolean
  /** demo ENGINE state — independent from UI state (dialogs, WhatsApp, …) */
  demoStatus: DemoStatus
  demoSpeed: DemoSpeed
  /** number of scripted steps already executed (0-based next step index) */
  demoStepIndex: number
  init: () => void
  issue: (input: IssueTokenInput) => Customer
  callNext: (counterId: number) => Customer | null
  completeService: (counterId: number) => Customer
  transfer: (customerId: string, toCounterId: number) => TransferResult
  holdCurrent: (counterId: number, reason: HoldReason) => Customer
  release: (customerId: string) => Customer
  beginBreak: (counterId: number) => Counter
  finishBreak: (counterId: number) => Counter
  resetDemo: () => void
  clearAll: () => void
  playDemo: () => void
  pauseDemo: () => void
  stepDemo: () => void
  setDemoSpeed: (speed: DemoSpeed) => void
}

function loadFromStorage(): QueueState | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { state?: QueueState }
    if (!parsed.state?.counters?.length || !parsed.state.customers) return null
    // discard state saved by an older branch layout (e.g. the 5-counter era)
    const storedIds = parsed.state.counters.map((c) => c.id).join(",")
    const currentIds = COUNTER_DEFS.map((c) => c.id).join(",")
    if (storedIds !== currentIds) return null
    // discard pre-journey-aware state shapes (missing tier/break structures)
    if (
      !parsed.state.counters.every(
        (c) =>
          Array.isArray(c.priorityQueue) &&
          Array.isArray(c.releasedQueue) &&
          Array.isArray(c.heldIds) &&
          Array.isArray(c.breaks)
      )
    ) {
      return null
    }
    return parsed.state
  } catch {
    return null
  }
}

function saveToStorage(state: QueueState): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ state }))
  } catch {
    // storage full or unavailable — the demo keeps working in memory
  }
}

/** Demo script — each step narrates then applies one real store operation. */
interface DemoStep {
  note: string
  run: (store: QueueStore) => void
}

function byToken(state: QueueState, token: string): Customer {
  const customer = Object.values(state.customers).find((c) => c.token === token)
  if (!customer) throw new Error(`Token ${token} not found`)
  return customer
}

const DEMO_TOKEN = "T-115" // first token issued after the seeded scenario

/**
 * Live Demo — walks through the journey-aware queue engine end to end:
 *   A  completion auto-assigns the next eligible customer (no Call Next)
 *   B  a journey-started transfer enters the PRIORITY queue ahead of new ones
 *   C  putting a customer on hold auto-assigns the next eligible customer
 *   D  releasing a hold creates NEXT AFTER CURRENT, served on completion
 *   E  an employee break pauses the current service, counter ON BREAK
 *   F  returning from break resumes the SAME customer (same timer)
 *   G  completing after the break auto-assigns the next eligible customer
 */
const DEMO_STEPS: DemoStep[] = [
  {
    note: `A new customer walks in — token ${DEMO_TOKEN}. Aisha joins Counter 1's NEW REQUESTS queue (her journey hasn't started).`,
    run: (s) =>
      void s.issue({
        name: "Aisha Khan",
        serviceType: "Account Opening",
        counterId: 1,
        plannedRoute: [4, 3],
      }),
  },
  {
    note: "SCENARIO A — Counter 1 completes T-106. The next eligible customer (T-114) is assigned AUTOMATICALLY — no Call Next needed.",
    run: (s) => void s.completeService(1),
  },
  {
    note: `Counter 1 completes T-114 — ${DEMO_TOKEN} is automatically assigned next.`,
    run: (s) => void s.completeService(1),
  },
  {
    note: `SCENARIO B — ${DEMO_TOKEN}'s journey has STARTED, so transferring her to busy Counter 4 places her in JOURNEY IN PROGRESS — ahead of new request T-109.`,
    run: (s) => void s.transfer(byToken(s.state, DEMO_TOKEN).id, 4),
  },
  {
    note: `Counter 4 completes T-107 — ${DEMO_TOKEN} (journey in progress) is auto-assigned BEFORE T-109, who arrived earlier but never started.`,
    run: (s) => void s.completeService(4),
  },
  {
    note: `${DEMO_TOKEN} moves on to Counter 3 — journey priority again. Freed Counter 4 automatically pulls T-109 in.`,
    run: (s) => void s.transfer(byToken(s.state, DEMO_TOKEN).id, 3),
  },
  {
    note: "SCENARIO C — Ravi's (T-104) document is missing: Counter 3 puts him ON HOLD. The next eligible customer (Aisha) starts AUTOMATICALLY.",
    run: (s) => void s.holdCurrent(3, "Document required"),
  },
  {
    note: "SCENARIO D — Ravi's document arrives: the hold is RELEASED. T-104 becomes NEXT AFTER CURRENT — ahead of every queue, without interrupting Aisha.",
    run: (s) => void s.release(byToken(s.state, "T-104").id),
  },
  {
    note: `Counter 3 completes ${DEMO_TOKEN}'s 3-stop journey — released hold T-104 is served next, before the waiting queue.`,
    run: (s) => void s.completeService(3),
  },
  {
    note: "Ravi transfers to IDLE Counter 1 — no artificial wait, he is serving immediately. Counter 3 auto-assigns T-110.",
    run: (s) => void s.transfer(byToken(s.state, "T-104").id, 1),
  },
  {
    note: "SCENARIO E — Priya starts a ☕ break while serving Ravi. His service PAUSES (keeping his place); Counter 1 is ON BREAK.",
    run: (s) => void s.beginBreak(1),
  },
  {
    note: "T-116 arrives at Counter 1 — he WAITS. No customer is auto-assigned while the employee is on break.",
    run: (s) =>
      void s.issue({
        name: "Vikram Singh",
        serviceType: "Cash Withdrawal",
        counterId: 1,
      }),
  },
  {
    note: "SCENARIO F — Priya returns. Ravi's service RESUMES exactly where it paused — same timer, same priority, not Vikram.",
    run: (s) => void s.finishBreak(1),
  },
  {
    note: "SCENARIO G — T-104 completes: 4 stops, one hold, one break — fully traceable. T-116 is auto-assigned next.",
    run: (s) => void s.completeService(1),
  },
  {
    note: "Counter 4 completes T-109 — queue empty, counter idles.",
    run: (s) => void s.completeService(4),
  },
  {
    note: "Counter 3 completes T-110 — T-112 auto-assigned.",
    run: (s) => void s.completeService(3),
  },
  {
    note: "Counter 1 completes T-116 — the branch keeps flowing without a single manual Call Next.",
    run: (s) => void s.completeService(1),
  },
  {
    note: "Counter 3 completes T-112 — journey-aware FIFO, automatic assignment, holds and breaks all demonstrated.",
    run: (s) => void s.completeService(3),
  },
]

export const DEMO_STEP_COUNT = DEMO_STEPS.length

/** base (1×) delay between scripted events, in ms */
const BASE_STEP_DELAY_MS = 3200
const INITIAL_DELAY_MS = 600

/**
 * Demo engine timer bookkeeping (module-level — never touches React/UI state).
 * `baseRemainingMs` is tracked in 1×-speed units so speed changes rescale
 * cleanly and pause/resume continues from the exact remaining time.
 */
let demoTimer: ReturnType<typeof setTimeout> | null = null
let baseRemainingMs = 0
let runningSince = 0 // Date.now() when the current timer was scheduled
let runningSpeed: DemoSpeed = 1

function clearDemoTimer(): void {
  if (demoTimer) {
    clearTimeout(demoTimer)
    demoTimer = null
  }
}

/** Convert elapsed wall-clock time into consumed base-time and stop the timer. */
function captureRemaining(): void {
  if (demoTimer) {
    const elapsedBase = (Date.now() - runningSince) * runningSpeed
    baseRemainingMs = Math.max(0, baseRemainingMs - elapsedBase)
  }
  clearDemoTimer()
}

export const useQueueStore = create<QueueStore>((set, get) => {
  /** Clone, apply a pure mutation, commit and persist. */
  function mutate<T>(fn: (draft: QueueState) => T): T {
    const draft = structuredClone(get().state)
    const result = fn(draft)
    set({ state: draft })
    saveToStorage(draft)
    return result
  }

  /**
   * Execute exactly one scripted event. Returns false when the script is
   * exhausted (and marks the demo finished).
   */
  function runOneStep(): boolean {
    const store = get()
    const index = store.demoStepIndex
    const step = DEMO_STEPS[index]
    if (!step) {
      set({ demoStatus: "idle" })
      notifyTransient("Demo finished", {
        kind: "success",
        description: "Every customer was served in fair FIFO order.",
      })
      return false
    }
    try {
      step.run(store)
    } catch {
      set({ demoStatus: "idle" })
      notifyTransient("Demo stopped", {
        kind: "error",
        description: "The branch state changed — press Restart, then Play Demo.",
      })
      return false
    }
    set({ demoStepIndex: index + 1 })
    // one calm transient at a time — each step REPLACES the previous note
    notifyTransient(`Step ${index + 1} of ${DEMO_STEPS.length}`, {
      description: step.note,
      durationMs: Math.max(1500, Math.min(BASE_STEP_DELAY_MS / get().demoSpeed, 3000)),
    })
    if (index + 1 >= DEMO_STEPS.length) {
      set({ demoStatus: "idle" })
      notifyTransient("Demo finished", {
        kind: "success",
        description: "Every customer was served in fair FIFO order.",
      })
      return false
    }
    return true
  }

  /** Schedule the next event after the remaining base-time at current speed. */
  function scheduleNext(): void {
    clearDemoTimer()
    runningSpeed = get().demoSpeed
    runningSince = Date.now()
    demoTimer = setTimeout(() => {
      demoTimer = null
      if (get().demoStatus !== "playing") return
      if (runOneStep()) {
        baseRemainingMs = BASE_STEP_DELAY_MS
        scheduleNext()
      }
    }, baseRemainingMs / runningSpeed)
  }

  function startFresh(): void {
    clearDemoTimer()
    const state = seedState(Date.now())
    saveToStorage(state)
    set({ state, demoStatus: "playing", demoStepIndex: 0 })
    baseRemainingMs = INITIAL_DELAY_MS
    notifyTransient("Demo started", {
      description: "Watch one token travel across multiple counters.",
    })
    scheduleNext()
  }

  return {
    state: emptyState(),
    hydrated: false,
    demoStatus: "idle",
    demoSpeed: 1,
    demoStepIndex: 0,

    init: () => {
      if (get().hydrated) return
      const stored = loadFromStorage()
      const state = stored ?? seedState(Date.now())
      if (!stored) saveToStorage(state)
      set({ state, hydrated: true })
    },

    issue: (input) => mutate((draft) => issueToken(draft, input, Date.now())),

    callNext: (counterId) =>
      mutate((draft) => callNextCustomer(draft, counterId, Date.now())),

    completeService: (counterId) =>
      mutate((draft) => completeCurrentService(draft, counterId, Date.now())),

    transfer: (customerId, toCounterId) =>
      mutate((draft) =>
        transferCustomer(draft, customerId, toCounterId, Date.now())
      ),

    holdCurrent: (counterId, reason) =>
      mutate((draft) => holdCurrentCustomer(draft, counterId, reason, Date.now())),

    release: (customerId) =>
      mutate((draft) => releaseHold(draft, customerId, Date.now())),

    beginBreak: (counterId) =>
      mutate((draft) => startBreak(draft, counterId, Date.now())),

    finishBreak: (counterId) =>
      mutate((draft) => endBreak(draft, counterId, Date.now())),

    resetDemo: () => {
      clearDemoTimer()
      const state = seedState(Date.now())
      saveToStorage(state)
      set({ state, demoStatus: "idle", demoStepIndex: 0 })
    },

    clearAll: () => {
      clearDemoTimer()
      const state = emptyState()
      saveToStorage(state)
      set({ state, demoStatus: "idle", demoStepIndex: 0 })
    },

    playDemo: () => {
      const { demoStatus } = get()
      if (demoStatus === "playing") return
      if (demoStatus === "paused") {
        // resume from the exact remaining time — never restart or skip a step
        set({ demoStatus: "playing" })
        scheduleNext()
        return
      }
      startFresh()
    },

    pauseDemo: () => {
      if (get().demoStatus !== "playing") return
      // freeze the ENGINE only — business state and UI stay fully interactive
      captureRemaining()
      set({ demoStatus: "paused" })
    },

    stepDemo: () => {
      const { demoStatus, demoStepIndex } = get()
      if (demoStatus === "playing") return
      if (demoStatus === "idle") {
        if (demoStepIndex > 0) return // finished script — Reset to run again
        // start a fresh scripted demo directly in inspect (paused) mode
        clearDemoTimer()
        const state = seedState(Date.now())
        saveToStorage(state)
        set({ state, demoStatus: "paused", demoStepIndex: 0 })
      }
      // execute exactly ONE event, then stay paused with a full interval ahead
      if (runOneStep()) {
        baseRemainingMs = BASE_STEP_DELAY_MS
        set({ demoStatus: "paused" })
      }
    },

    setDemoSpeed: (speed) => {
      const { demoStatus } = get()
      if (speed === get().demoSpeed) return
      if (demoStatus === "playing") {
        // rescale the in-flight wait so the change applies immediately
        captureRemaining()
        set({ demoSpeed: speed })
        scheduleNext()
      } else {
        // while paused/idle nothing moves — the new speed applies on resume
        set({ demoSpeed: speed })
      }
    },
  }
})
