"use client"

import { create } from "zustand"
import { toast } from "sonner"

import {
  callNextCustomer,
  completeCurrentService,
  emptyState,
  issueToken,
  transferCustomer,
  type IssueTokenInput,
  type TransferResult,
} from "./queue-logic"
import { seedState } from "./seed"
import type { Customer, QueueState } from "./types"

const STORAGE_KEY = "smart-bank-queue-v1"

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

const DEMO_STEPS: DemoStep[] = [
  {
    note: `A new customer walks in — the teller issues token ${DEMO_TOKEN}. Aisha joins the END of Counter 1's queue.`,
    run: (s) =>
      void s.issue({
        name: "Aisha Khan",
        serviceType: "Account Opening",
        counterId: 1,
        plannedRoute: [5, 3],
      }),
  },
  {
    note: "Counter 1 finishes its current customer.",
    run: (s) => void s.completeService(1),
  },
  {
    note: "Counter 1 calls the next in line — strict FIFO, no jumping.",
    run: (s) => void s.callNext(1),
  },
  {
    note: "Counter 1 finishes serving.",
    run: (s) => void s.completeService(1),
  },
  {
    note: `${DEMO_TOKEN} is now first in line — Counter 1 calls Aisha.`,
    run: (s) => void s.callNext(1),
  },
  {
    note: `Counter 1 finishes its part and transfers ${DEMO_TOKEN} to Counter 5 — she joins the END of that queue.`,
    run: (s) => void s.transfer(byToken(s.state, DEMO_TOKEN).id, 5),
  },
  {
    note: "Counter 5 finishes its current customer.",
    run: (s) => void s.completeService(5),
  },
  {
    note: "Counter 5 calls the next customer — those already waiting keep their priority.",
    run: (s) => void s.callNext(5),
  },
  {
    note: "Counter 5 finishes serving.",
    run: (s) => void s.completeService(5),
  },
  {
    note: `${DEMO_TOKEN} reaches the front — Counter 5 calls Aisha.`,
    run: (s) => void s.callNext(5),
  },
  {
    note: `Counter 5 transfers ${DEMO_TOKEN} to Counter 3 — same token, full journey preserved.`,
    run: (s) => void s.transfer(byToken(s.state, DEMO_TOKEN).id, 3),
  },
  {
    note: "Ravi (T-101) is transferred back to Counter 1 — his 4th counter, one continuous journey.",
    run: (s) => void s.transfer(byToken(s.state, "T-101").id, 1),
  },
  {
    note: "Counter 1 calls T-101 — the system still knows he arrived first.",
    run: (s) => void s.callNext(1),
  },
  {
    note: "T-101's journey completes after 4 counters — fully traceable end to end.",
    run: (s) => void s.completeService(1),
  },
  {
    note: "Counter 3 keeps serving its queue in order.",
    run: (s) => void s.callNext(3),
  },
  { note: "Counter 3 finishes serving.", run: (s) => void s.completeService(3) },
  { note: "Counter 3 calls the next customer.", run: (s) => void s.callNext(3) },
  { note: "Counter 3 finishes serving.", run: (s) => void s.completeService(3) },
  {
    note: `${DEMO_TOKEN} is finally served at Counter 3.`,
    run: (s) => void s.callNext(3),
  },
  {
    note: `${DEMO_TOKEN}'s journey completes — fair, transparent and FIFO throughout.`,
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
      toast.success("Demo finished", {
        description: "Every customer was served in fair FIFO order.",
      })
      return false
    }
    try {
      step.run(store)
    } catch {
      set({ demoStatus: "idle" })
      toast.error("Demo stopped", {
        description: "The branch state changed — press Reset, then Play Demo.",
      })
      return false
    }
    set({ demoStepIndex: index + 1 })
    toast.info(`Step ${index + 1} of ${DEMO_STEPS.length}`, {
      description: step.note,
      duration: Math.max(1500, BASE_STEP_DELAY_MS / get().demoSpeed),
    })
    if (index + 1 >= DEMO_STEPS.length) {
      set({ demoStatus: "idle" })
      toast.success("Demo finished", {
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
    toast.info("Demo started", {
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
