import type {
  ActivityType,
  Counter,
  Customer,
  HoldReason,
  OverrideReason,
  QueueState,
  ServiceType,
} from "./types"

export const COUNTER_DEFS: ReadonlyArray<{
  id: number
  name: string
  employeeName: string
}> = [
  { id: 1, name: "General Banking", employeeName: "Priya" },
  { id: 2, name: "Cash Services", employeeName: "Arjun" },
  { id: 3, name: "Account Services", employeeName: "Kavita" },
  { id: 4, name: "Customer Service", employeeName: "Deepa" },
]

export function counterLabel(counterId: number): string {
  return `Counter ${counterId}`
}

export function counterName(counterId: number): string {
  return COUNTER_DEFS.find((c) => c.id === counterId)?.name ?? "Unknown"
}

export function emptyState(): QueueState {
  return {
    customers: {},
    counters: COUNTER_DEFS.map((def) => ({
      id: def.id,
      number: def.id,
      name: def.name,
      employeeName: def.employeeName,
      status: "available",
      currentCustomerId: null,
      queue: [],
      priorityQueue: [],
      releasedQueue: [],
      heldIds: [],
      breaks: [],
    })),
    activities: [],
    overrides: [],
    nextTokenNumber: 101,
  }
}

let idCounter = 0
function uid(prefix: string): string {
  idCounter += 1
  return `${prefix}-${idCounter}-${Math.random().toString(36).slice(2, 8)}`
}

function pushActivity(
  state: QueueState,
  type: ActivityType,
  customerId: string | null,
  message: string,
  now: number
): void {
  state.activities.unshift({
    id: uid("act"),
    timestamp: now,
    type,
    customerId,
    message,
  })
  // keep the feed bounded
  if (state.activities.length > 80) state.activities.length = 80
}

function getCounter(state: QueueState, counterId: number): Counter {
  const counter = state.counters.find((c) => c.id === counterId)
  if (!counter) throw new Error(`Unknown counter ${counterId}`)
  return counter
}

function getCustomer(state: QueueState, customerId: string): Customer {
  const customer = state.customers[customerId]
  if (!customer) throw new Error(`Unknown customer ${customerId}`)
  return customer
}

/** Has this customer's service journey started anywhere in the branch? */
export function journeyStarted(customer: Customer): boolean {
  return customer.journey.some((step) => step.startedAt !== null)
}

export type WaitingTier = "released" | "priority" | "normal"

/** Which waiting tier holds this customer, or null when not waiting. */
export function waitingTier(
  state: QueueState,
  customerId: string
): WaitingTier | null {
  for (const counter of state.counters) {
    if (counter.releasedQueue.includes(customerId)) return "released"
    if (counter.priorityQueue.includes(customerId)) return "priority"
    if (counter.queue.includes(customerId)) return "normal"
  }
  return null
}

/** Waiting with restored priority after a hold release ("next after current"). */
export function isReleasedHold(state: QueueState, customerId: string): boolean {
  return state.counters.some((c) => c.releasedQueue.includes(customerId))
}

/**
 * Rule 7 — queue position is always derived, never stored. Returns the
 * 1-based position in the counter's EFFECTIVE line: released holds first,
 * then journey-in-progress priority, then the normal FIFO queue.
 */
export function queuePosition(state: QueueState, customerId: string): number | null {
  for (const counter of state.counters) {
    const releasedIdx = counter.releasedQueue.indexOf(customerId)
    if (releasedIdx !== -1) return releasedIdx + 1
    const priorityIdx = counter.priorityQueue.indexOf(customerId)
    if (priorityIdx !== -1) {
      return counter.releasedQueue.length + priorityIdx + 1
    }
    const idx = counter.queue.indexOf(customerId)
    if (idx !== -1) {
      return (
        counter.releasedQueue.length + counter.priorityQueue.length + idx + 1
      )
    }
  }
  return null
}

/** total customers waiting in all three tiers of a counter */
export function waitingCount(counter: Counter): number {
  return (
    counter.releasedQueue.length +
    counter.priorityQueue.length +
    counter.queue.length
  )
}

/** all customers currently eligible to be called by this counter */
export function eligibleCustomerIds(counter: Counter): string[] {
  return [...counter.releasedQueue, ...counter.priorityQueue, ...counter.queue]
}

/**
 * THE RECOMMENDATION ENGINE — a pure, read-only peek at journey-aware FIFO:
 *
 *   1. NEXT AFTER CURRENT (released holds, in release order)
 *   2. JOURNEY IN PROGRESS (started journeys, in arrival order)
 *   3. NEW REQUESTS       (normal FIFO)
 *
 * RECOMMENDATION ≠ ASSIGNMENT. This function never mutates state, never
 * assigns, never moves anyone into NOW SERVING. A customer starts service
 * ONLY through an explicit employee callCustomer().
 */
export function getRecommendedCustomer(
  state: QueueState,
  counterId: number
): Customer | null {
  const counter = getCounter(state, counterId)
  const nextId =
    counter.releasedQueue[0] ?? counter.priorityQueue[0] ?? counter.queue[0]
  return nextId ? getCustomer(state, nextId) : null
}

/**
 * THE single way a waiting customer becomes NOW SERVING — an explicit
 * employee call (the automated demo invokes this same operation, acting as
 * the employee). Validates employee/counter availability and token
 * eligibility, moves the customer atomically out of their tier, and — when
 * the chosen customer is NOT the system recommendation — records a queue
 * override in the audit history. Everyone else keeps their exact position:
 * an override never reorders the queue.
 */
export function callCustomer(
  state: QueueState,
  counterId: number,
  customerId: string,
  now: number,
  reason: OverrideReason | null = null
): Customer {
  const counter = getCounter(state, counterId)
  if (counter.status === "on-break") {
    throw new Error(
      `${counterLabel(counterId)} — the employee is on a break and must resume work first`
    )
  }
  if (counter.currentCustomerId) {
    throw new Error(`${counterLabel(counterId)} is already serving a customer`)
  }
  const customer = getCustomer(state, customerId)
  const pools = [counter.releasedQueue, counter.priorityQueue, counter.queue]
  const pool = pools.find((p) => p.includes(customerId))
  if (!pool) {
    // held, already serving somewhere, completed or waiting at another counter
    throw new Error(
      `${customer.token} is not eligible to be called at ${counterLabel(counterId)}`
    )
  }

  const recommended = getRecommendedCustomer(state, counterId)!
  const positionBefore = queuePosition(state, customerId) ?? 1
  const isOverride = recommended.id !== customer.id

  // atomic: exactly one tier loses exactly this customer
  pool.splice(pool.indexOf(customerId), 1)

  counter.currentCustomerId = customer.id
  counter.status = "serving"
  customer.status = "serving"

  const step = customer.journey[customer.journey.length - 1]
  const resumedHold = step.holds.find(
    (h) => h.releasedAt !== null && h.resumedAt === null
  )
  if (resumedHold) {
    // resuming a released hold — service already started once; keep the
    // original startedAt and close the hold episode's priority-wait gap
    resumedHold.resumedAt = now
  } else if (step.startedAt === null) {
    step.startedAt = now
  }
  step.status = "serving"

  if (isOverride) {
    state.overrides.push({
      id: uid("ovr"),
      at: now,
      counterId: counter.id,
      employeeName: counter.employeeName,
      recommendedToken: recommended.token,
      recommendedName: recommended.name,
      selectedToken: customer.token,
      selectedName: customer.name,
      reason,
    })
    pushActivity(
      state,
      "queue-override",
      customer.id,
      `${counter.employeeName} at ${counterLabel(counter.id)} called ${customer.token} (was #${positionBefore}) instead of recommended ${recommended.token} — queue override${reason ? ` (${reason})` : ""}`,
      now
    )
  } else {
    pushActivity(
      state,
      "called",
      customer.id,
      resumedHold
        ? `${customer.token} called at ${counterLabel(counter.id)} — released hold, service resumes`
        : `${customer.token} called at ${counterLabel(counter.id)} by ${counter.employeeName} (was #${positionBefore} in line)`,
      now
    )
  }
  return customer
}

/**
 * Convenience: explicitly call the RECOMMENDED customer (the "✓ Call T-xx"
 * button). Returns null when nobody is waiting.
 */
export function callNextCustomer(
  state: QueueState,
  counterId: number,
  now: number
): Customer | null {
  const recommended = getRecommendedCustomer(state, counterId)
  if (!recommended) return null
  return callCustomer(state, counterId, recommended.id, now)
}

export interface IssueTokenInput {
  name: string
  serviceType: ServiceType
  counterId: number
  plannedRoute?: number[]
}

/**
 * Rules 1 & 2 — unique token, appended to the END of the NEW REQUESTS queue
 * (a fresh token has never started a journey). The customer WAITS — even at
 * a free counter — until the employee explicitly calls them.
 */
export function issueToken(
  state: QueueState,
  input: IssueTokenInput,
  now: number
): Customer {
  const counter = getCounter(state, input.counterId)
  const token = `T-${state.nextTokenNumber}`
  state.nextTokenNumber += 1

  const customer: Customer = {
    id: uid("cust"),
    token,
    name: input.name.trim() || "Walk-in Customer",
    serviceType: input.serviceType,
    createdAt: now,
    status: "waiting",
    currentCounterId: counter.id,
    journey: [
      {
        counterId: counter.id,
        counterName: counter.name,
        enteredAt: now,
        startedAt: null,
        completedAt: null,
        status: "waiting",
        holds: [],
        breaks: [],
      },
    ],
    plannedRoute: input.plannedRoute ?? [],
    completedAt: null,
  }

  state.customers[customer.id] = customer
  counter.queue.push(customer.id)
  pushActivity(
    state,
    "token-issued",
    customer.id,
    `${token} issued to ${customer.name} — joined ${counterLabel(counter.id)} at position #${queuePosition(state, customer.id)}`,
    now
  )
  return customer
}

/**
 * HOLD — only the customer CURRENTLY BEING SERVED can be put on hold. The
 * token, journey and employee/counter relationship are preserved; the
 * customer leaves active service and FIFO selection entirely. The counter
 * becomes AVAILABLE with a fresh recommendation — nobody is auto-assigned;
 * the employee explicitly calls the next customer.
 */
export function holdCurrentCustomer(
  state: QueueState,
  counterId: number,
  reason: HoldReason,
  now: number
): Customer {
  const counter = getCounter(state, counterId)
  if (counter.status === "on-break") {
    throw new Error(`${counterLabel(counterId)} — employee is on break`)
  }
  if (!counter.currentCustomerId) {
    throw new Error(`${counterLabel(counterId)} is not serving anyone`)
  }
  const customer = getCustomer(state, counter.currentCustomerId)

  counter.currentCustomerId = null
  counter.status = "available"
  counter.heldIds.push(customer.id)

  customer.status = "on-hold"
  const step = customer.journey[customer.journey.length - 1]
  step.status = "on-hold"
  step.holds.push({ reason, startedAt: now, releasedAt: null, resumedAt: null })

  pushActivity(
    state,
    "held",
    customer.id,
    `${customer.token} put on hold at ${counterLabel(counterId)} — ${reason}`,
    now
  )
  return customer
}

/**
 * RELEASE HOLD — the customer becomes NEXT AFTER CURRENT: the top
 * recommendation once the currently served customer finishes, ahead of the
 * journey-in-progress and normal queues. Multiple releases keep their
 * release order. Never interrupts anyone and never auto-assigns — the
 * employee explicitly calls the released customer.
 */
export function releaseHold(
  state: QueueState,
  customerId: string,
  now: number
): Customer {
  const customer = getCustomer(state, customerId)
  if (customer.status !== "on-hold") {
    throw new Error(`${customer.token} is not on hold`)
  }
  const counter = state.counters.find((c) => c.heldIds.includes(customerId))
  if (!counter) throw new Error(`${customer.token} not found in any hold list`)

  counter.heldIds.splice(counter.heldIds.indexOf(customerId), 1)
  counter.releasedQueue.push(customerId)

  customer.status = "waiting"
  const step = customer.journey[customer.journey.length - 1]
  step.status = "waiting"
  const openHold = step.holds.find((h) => h.releasedAt === null)
  if (openHold) openHold.releasedAt = now

  pushActivity(
    state,
    "hold-released",
    customer.id,
    `${customer.token} hold released at ${counterLabel(counter.id)} — next after current`,
    now
  )
  return customer
}

function finishCurrentStep(customer: Customer, now: number): void {
  const step = customer.journey[customer.journey.length - 1]
  step.completedAt = now
  step.status = "completed"
}

/**
 * Rules 6 & 5 — completing service at a counter ends the whole journey ONLY
 * when the employee explicitly completes it (vs. transferring). The counter
 * becomes AVAILABLE and the engine shows the next RECOMMENDATION — no
 * customer is auto-assigned; a "Now Serving" only happens on an explicit
 * call (the customer must never be notified before the employee decides).
 */
export function completeCurrentService(
  state: QueueState,
  counterId: number,
  now: number
): Customer {
  const counter = getCounter(state, counterId)
  if (counter.status === "on-break") {
    throw new Error(`${counterLabel(counterId)} — employee is on break`)
  }
  if (!counter.currentCustomerId) {
    throw new Error(`${counterLabel(counterId)} is not serving anyone`)
  }
  const customer = getCustomer(state, counter.currentCustomerId)
  finishCurrentStep(customer, now)

  counter.currentCustomerId = null
  counter.status = "available"

  customer.status = "completed"
  customer.currentCounterId = null
  customer.completedAt = now
  customer.plannedRoute = []

  pushActivity(
    state,
    "journey-completed",
    customer.id,
    `${customer.token} journey completed at ${counterLabel(counterId)}`,
    now
  )
  return customer
}

export interface TransferResult {
  customer: Customer
  fromCounterId: number
  toCounterId: number
  /** which tier the customer landed in at the destination */
  tier: WaitingTier
  /** 1-based position in the destination's effective line */
  position: number
  /** true when the customer is now the destination's top recommendation */
  recommendedNext: boolean
}

/**
 * Rule 4 — transfer preserves the token and full journey history. Placement
 * is journey-aware: a started journey joins the destination's JOURNEY IN
 * PROGRESS queue (ahead of new requests, FIFO by arrival); a never-started
 * customer joins the normal NEW REQUESTS queue. NOBODY is auto-assigned —
 * even at an idle destination the customer becomes the RECOMMENDATION and
 * waits for the employee's explicit call.
 */
export function transferCustomer(
  state: QueueState,
  customerId: string,
  toCounterId: number,
  now: number
): TransferResult {
  const customer = getCustomer(state, customerId)
  if (customer.status === "on-hold") {
    // no ambiguous queue states: release the hold and resume service first
    throw new Error(
      `${customer.token} is on hold — release the hold before transferring`
    )
  }
  const fromCounterId = customer.currentCounterId
  if (fromCounterId === null) {
    throw new Error(`${customer.token} is not at any counter`)
  }
  if (fromCounterId === toCounterId) {
    throw new Error(`${customer.token} is already at ${counterLabel(toCounterId)}`)
  }
  const from = getCounter(state, fromCounterId)
  const to = getCounter(state, toCounterId)

  if (from.currentCustomerId === customer.id) {
    if (from.status === "on-break") {
      throw new Error(
        `${customer.token}'s service is paused — the employee must resume before transferring`
      )
    }
    // finishing this counter's part of the service does NOT complete the journey
    finishCurrentStep(customer, now)
    from.currentCustomerId = null
    from.status = "available"
    pushActivity(
      state,
      "service-completed",
      customer.id,
      `${customer.token} finished at ${counterLabel(fromCounterId)}`,
      now
    )
  } else {
    const pools = [from.queue, from.priorityQueue, from.releasedQueue]
    const pool = pools.find((p) => p.includes(customer.id))
    if (!pool) throw new Error(`${customer.token} not found in queue`)
    pool.splice(pool.indexOf(customer.id), 1)
    const step = customer.journey[customer.journey.length - 1]
    step.completedAt = now
    step.status = "completed"
  }

  // journey-aware placement — started journeys outrank new requests,
  // strictly FIFO within each tier (arrival order at THIS counter)
  const started = journeyStarted(customer)
  const tier: WaitingTier = started ? "priority" : "normal"

  customer.currentCounterId = to.id
  customer.status = "waiting"
  // consume the planned route if the transfer follows it
  if (customer.plannedRoute[0] === to.id) customer.plannedRoute.shift()

  customer.journey.push({
    counterId: to.id,
    counterName: to.name,
    enteredAt: now,
    startedAt: null,
    completedAt: null,
    status: "waiting",
    holds: [],
    breaks: [],
  })

  if (started) to.priorityQueue.push(customer.id)
  else to.queue.push(customer.id)

  const position = queuePosition(state, customer.id) ?? 1
  pushActivity(
    state,
    "transferred",
    customer.id,
    `${customer.token} transferred ${counterLabel(fromCounterId)} → ${counterLabel(toCounterId)} — ${
      started ? "journey in progress, priority" : "new request"
    } position #${position}`,
    now
  )

  return {
    customer,
    fromCounterId,
    toCounterId,
    tier,
    position,
    recommendedNext: getRecommendedCustomer(state, toCounterId)?.id === customer.id,
  }
}

/**
 * EMPLOYEE BREAK — the employee becomes unavailable WITHOUT losing the
 * current customer's place. An in-progress service is paused (never held,
 * never re-queued); no customer can be called until the employee returns.
 */
export function startBreak(
  state: QueueState,
  counterId: number,
  now: number
): Counter {
  const counter = getCounter(state, counterId)
  if (counter.status === "on-break") {
    throw new Error(`${counterLabel(counterId)} is already on break`)
  }
  counter.status = "on-break"
  counter.breaks.push({ startedAt: now, endedAt: null })

  const customer = counter.currentCustomerId
    ? getCustomer(state, counter.currentCustomerId)
    : null
  if (customer) {
    const step = customer.journey[customer.journey.length - 1]
    step.breaks.push({ startedAt: now, endedAt: null })
  }

  pushActivity(
    state,
    "break-started",
    customer?.id ?? null,
    customer
      ? `${counter.employeeName} started a break at ${counterLabel(counterId)} — ${customer.token}'s service is paused`
      : `${counter.employeeName} started a break at ${counterLabel(counterId)}`,
    now
  )
  return counter
}

/**
 * RESUME AFTER BREAK — if a customer's service was paused, exactly that
 * customer resumes (same timer, same priority, no new queue entry).
 * Otherwise the counter is simply AVAILABLE again with a recommendation —
 * the employee explicitly calls the next customer; nothing is auto-assigned.
 */
export function endBreak(
  state: QueueState,
  counterId: number,
  now: number
): Counter {
  const counter = getCounter(state, counterId)
  if (counter.status !== "on-break") {
    throw new Error(`${counterLabel(counterId)} is not on break`)
  }
  const openBreak = counter.breaks.find((b) => b.endedAt === null)
  if (openBreak) openBreak.endedAt = now

  const customer = counter.currentCustomerId
    ? getCustomer(state, counter.currentCustomerId)
    : null

  if (customer) {
    // resume the paused customer — never restart the timer or reassign
    const step = customer.journey[customer.journey.length - 1]
    const openPause = step.breaks.find((b) => b.endedAt === null)
    if (openPause) openPause.endedAt = now
    counter.status = "serving"
    pushActivity(
      state,
      "break-ended",
      customer.id,
      `${counter.employeeName} returned at ${counterLabel(counterId)} — ${customer.token}'s service resumed`,
      now
    )
  } else {
    counter.status = "available"
    pushActivity(
      state,
      "break-ended",
      null,
      `${counter.employeeName} returned at ${counterLabel(counterId)}`,
      now
    )
  }
  return counter
}
