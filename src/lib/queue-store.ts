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

type DemoStatus = "idle" | "playing" | "paused"

interface QueueStore {
  state: QueueState
  hydrated: boolean
  demoStatus: DemoStatus
  init: () => void
  issue: (input: IssueTokenInput) => Customer
  callNext: (counterId: number) => Customer | null
  completeService: (counterId: number) => Customer
  transfer: (customerId: string, toCounterId: number) => TransferResult
  resetDemo: () => void
  clearAll: () => void
  playDemo: () => void
  pauseDemo: () => void
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

const DEMO_STEP_DELAY_MS = 3200

let demoTimer: ReturnType<typeof setTimeout> | null = null
let demoStepIndex = 0

function stopDemoTimer(): void {
  if (demoTimer) {
    clearTimeout(demoTimer)
    demoTimer = null
  }
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

  function scheduleDemoStep(): void {
    stopDemoTimer()
    demoTimer = setTimeout(() => {
      const store = get()
      if (store.demoStatus !== "playing") return
      const step = DEMO_STEPS[demoStepIndex]
      if (!step) {
        set({ demoStatus: "idle" })
        toast.success("Demo finished", {
          description: "Every customer was served in fair FIFO order.",
        })
        return
      }
      try {
        step.run(store)
        toast.info(`Step ${demoStepIndex + 1} of ${DEMO_STEPS.length}`, {
          description: step.note,
          duration: DEMO_STEP_DELAY_MS,
        })
      } catch {
        set({ demoStatus: "idle" })
        toast.error("Demo stopped", {
          description: "The branch state changed — press Reset, then Play Demo.",
        })
        return
      }
      demoStepIndex += 1
      scheduleDemoStep()
    }, demoStepIndex === 0 ? 600 : DEMO_STEP_DELAY_MS)
  }

  return {
    state: emptyState(),
    hydrated: false,
    demoStatus: "idle",

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
      stopDemoTimer()
      demoStepIndex = 0
      const state = seedState(Date.now())
      saveToStorage(state)
      set({ state, demoStatus: "idle" })
    },

    clearAll: () => {
      stopDemoTimer()
      demoStepIndex = 0
      const state = emptyState()
      saveToStorage(state)
      set({ state, demoStatus: "idle" })
    },

    playDemo: () => {
      const { demoStatus } = get()
      if (demoStatus === "playing") return
      if (demoStatus === "paused") {
        set({ demoStatus: "playing" })
        scheduleDemoStep()
        return
      }
      // start fresh from the seeded scenario so the script is deterministic
      stopDemoTimer()
      demoStepIndex = 0
      const state = seedState(Date.now())
      saveToStorage(state)
      set({ state, demoStatus: "playing" })
      toast.info("Demo started", {
        description: "Watch one token travel across multiple counters.",
      })
      scheduleDemoStep()
    },

    pauseDemo: () => {
      if (get().demoStatus !== "playing") return
      stopDemoTimer()
      set({ demoStatus: "paused" })
    },
  }
})
