import type {
  ActivityType,
  Counter,
  Customer,
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
 * Returns 1-based position in the counter's waiting queue, or null.
 */
export function queuePosition(state: QueueState, customerId: string): number | null {
  for (const counter of state.counters) {
    const idx = counter.queue.indexOf(customerId)
    if (idx !== -1) return idx + 1
  }
  return null
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
 * Rule 9 — only the FIRST waiting customer can be called.
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
  const nextId = counter.queue.shift()
  if (!nextId) return null

  const customer = getCustomer(state, nextId)
  counter.currentCustomerId = customer.id
  counter.status = "serving"
  customer.status = "serving"

  const step = customer.journey[customer.journey.length - 1]
  step.startedAt = now
  step.status = "serving"

  pushActivity(
    state,
    "called",
    customer.id,
    `${customer.token} called at ${counterLabel(counterId)}`,
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
    if (idx === -1) throw new Error(`${customer.token} not found in queue`)
    from.queue.splice(idx, 1)
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
