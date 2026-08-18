import { queuePosition } from "./queue-logic"
import type { Customer, CustomerStatus, QueueState } from "./types"

/**
 * The customer-facing WhatsApp view is DERIVED from queue state, never stored.
 * Same state in → same messages out, so a paused simulation shows an exact,
 * stable snapshot and resuming can never duplicate messages.
 */

export interface WhatsAppMessage {
  id: string
  at: number
  text: string
}

/** average minutes one customer ahead of you takes to serve (demo heuristic) */
const MINUTES_PER_CUSTOMER = 3.5

export function buildWhatsAppMessages(customer: Customer): WhatsAppMessage[] {
  const messages: WhatsAppMessage[] = []
  const first = customer.journey[0]

  messages.push({
    id: `${customer.id}-welcome`,
    at: customer.createdAt,
    text: `Welcome to SBI Demo Branch! 🎫 Your token is ${customer.token} for ${customer.serviceType}. Please wait near Counter ${first.counterId} (${first.counterName}) — we'll message you when it's your turn.`,
  })

  customer.journey.forEach((step, i) => {
    if (i > 0) {
      messages.push({
        id: `${customer.id}-enter-${i}`,
        at: step.enteredAt,
        text: `Counter ${customer.journey[i - 1].counterId} has finished its part. Your request now continues at Counter ${step.counterId} (${step.counterName}). You've joined the end of the queue — same token, same place in line.`,
      })
    }
    if (step.startedAt !== null) {
      messages.push({
        id: `${customer.id}-start-${i}`,
        at: step.startedAt,
        text: `It's your turn! 🔔 Please proceed to Counter ${step.counterId} (${step.counterName}).`,
      })
    }
  })

  if (customer.completedAt !== null) {
    messages.push({
      id: `${customer.id}-done`,
      at: customer.completedAt,
      text: `✅ All done! Your ${customer.serviceType} request is complete. Thank you for visiting SBI Demo Branch.`,
    })
  }

  return messages
}

export interface CustomerLiveStatus {
  status: CustomerStatus
  counterId: number | null
  counterName: string | null
  /** 1-based queue position, null unless waiting */
  position: number | null
  /** estimated wait in whole minutes, null unless waiting */
  estWaitMin: number | null
}

export function customerLiveStatus(
  state: QueueState,
  customerId: string
): CustomerLiveStatus {
  const customer = state.customers[customerId]
  if (!customer) throw new Error(`Unknown customer ${customerId}`)

  const step = customer.journey[customer.journey.length - 1]
  if (customer.status === "completed") {
    return {
      status: "completed",
      counterId: null,
      counterName: null,
      position: null,
      estWaitMin: null,
    }
  }

  const position =
    customer.status === "waiting" ? queuePosition(state, customerId) : null

  return {
    status: customer.status,
    counterId: step.counterId,
    counterName: step.counterName,
    position,
    estWaitMin:
      position !== null ? Math.floor(position * MINUTES_PER_CUSTOMER) : null,
  }
}
