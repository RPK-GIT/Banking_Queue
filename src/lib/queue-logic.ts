import type {
  ActivityType,
  Counter,
  Customer,
  HoldReason,
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
      heldIds: [],
    })),
    activities: [],
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

/**
 * Rule 7 — queue position is always derived, never stored.
 * Returns 1-based position in the counter's waiting line, or null. Released
 * hold customers occupy the FRONT positions ("next after current"), so normal
 * FIFO positions are offset by the priority queue length.
 */
export function queuePosition(state: QueueState, customerId: string): number | null {
  for (const counter of state.counters) {
    const priorityIdx = counter.priorityQueue.indexOf(customerId)
    if (priorityIdx !== -1) return priorityIdx + 1
    const idx = counter.queue.indexOf(customerId)
    if (idx !== -1) return counter.priorityQueue.length + idx + 1
  }
  return null
}

/** Is this customer waiting with restored priority ("next after current")? */
export function isPriority(state: QueueState, customerId: string): boolean {
  return state.counters.some((c) => c.priorityQueue.includes(customerId))
}

export interface IssueTokenInput {
  name: string
  serviceType: ServiceType
  counterId: number
  plannedRoute?: number[]
}

/**
 * Rules 1 & 2 — unique token, appended to the END of the chosen queue.
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
    `${token} issued to ${customer.name} — joined ${counterLabel(counter.id)} at position #${counter.queue.length}`,
    now
  )
  return customer
}

/**
 * Rule 9 — only the FIRST waiting customer can be called. Released hold
 * customers ("next after current") take precedence over the normal FIFO queue,
 * in release order. Customers ON hold are never selected.
 */
export function callNextCustomer(
  state: QueueState,
  counterId: number,
  now: number
): Customer | null {
  const counter = getCounter(state, counterId)
  if (counter.currentCustomerId) {
    throw new Error(`${counterLabel(counterId)} is already serving a customer`)
  }
  const fromPriority = counter.priorityQueue.length > 0
  const nextId = fromPriority
    ? counter.priorityQueue.shift()
    : counter.queue.shift()
  if (!nextId) return null

  const customer = getCustomer(state, nextId)
  counter.currentCustomerId = customer.id
  counter.status = "serving"
  customer.status = "serving"

  const step = customer.journey[customer.journey.length - 1]
  if (fromPriority) {
    // resuming a released hold — service already started once; keep the
    // original startedAt and close the hold episode's priority-wait gap
    const openHold = step.holds.find((h) => h.resumedAt === null)
    if (openHold) openHold.resumedAt = now
  } else {
    step.startedAt = now
  }
  step.status = "serving"

  pushActivity(
    state,
    "called",
    customer.id,
    fromPriority
      ? `${customer.token} resumed at ${counterLabel(counterId)} (priority after hold)`
      : `${customer.token} called at ${counterLabel(counterId)}`,
    now
  )
  return customer
}

/**
 * HOLD — only the customer CURRENTLY BEING SERVED can be put on hold. The
 * token, journey and employee/counter relationship are preserved; the customer
 * leaves active service and normal FIFO eligibility entirely.
 */
export function holdCurrentCustomer(
  state: QueueState,
  counterId: number,
  reason: HoldReason,
  now: number
): Customer {
  const counter = getCounter(state, counterId)
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
 * RELEASE HOLD — the customer moves to the priority queue ("next after
 * current") and will be served before the normal FIFO queue, in release order.
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
  counter.priorityQueue.push(customerId)

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
 * when the employee explicitly completes it (vs. transferring). The journey
 * audit trail is preserved.
 */
export function completeCurrentService(
  state: QueueState,
  counterId: number,
  now: number
): Customer {
  const counter = getCounter(state, counterId)
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
  /** 1-based position in the destination queue */
  position: number
}

/**
 * Rule 4 — transfer preserves the token and full journey history, removes the
 * customer from their current counter and appends them to the END of the
 * destination queue (Rules 2 & 8). Never inserted at the front.
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
    const idx = from.queue.indexOf(customer.id)
    const priorityIdx = from.priorityQueue.indexOf(customer.id)
    if (idx !== -1) from.queue.splice(idx, 1)
    else if (priorityIdx !== -1) from.priorityQueue.splice(priorityIdx, 1)
    else throw new Error(`${customer.token} not found in queue`)
    const step = customer.journey[customer.journey.length - 1]
    step.completedAt = now
    step.status = "completed"
  }

  // strict FIFO: always append to the END of the destination queue
  to.queue.push(customer.id)
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
  })

  const position = to.queue.length
  pushActivity(
    state,
    "transferred",
    customer.id,
    `${customer.token} transferred ${counterLabel(fromCounterId)} → ${counterLabel(toCounterId)} — position #${position}`,
    now
  )
  return { customer, fromCounterId, toCounterId, position }
}
