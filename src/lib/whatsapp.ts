import { isPriority, queuePosition } from "./queue-logic"
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
export const ESTIMATED_MINUTES_PER_CUSTOMER = 3.5
const MINUTES_PER_CUSTOMER = ESTIMATED_MINUTES_PER_CUSTOMER

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
    step.holds.forEach((hold, h) => {
      messages.push({
        id: `${customer.id}-hold-${i}-${h}`,
        at: hold.startedAt,
        text: `Your request is temporarily on hold.\nReason: ${hold.reason}.\nWe will resume your service shortly.`,
      })
      if (hold.releasedAt !== null) {
        messages.push({
          id: `${customer.id}-hold-released-${i}-${h}`,
          at: hold.releasedAt,
          text: `Your request has been resumed. ✅\nYou will be served next at Counter ${step.counterId} (${step.counterName}).`,
        })
      }
    })
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
  /**
   * waiting with restored priority after a hold release —
   * "Priority — Next After Current"
   */
  priority: boolean
  /** current hold reason, only while on hold */
  holdReason: string | null
  /** 1-based queue position, null unless waiting (never shown while held) */
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
      priority: false,
      holdReason: null,
      position: null,
      estWaitMin: null,
    }
  }

  // no normal queue position while held — the ticket is outside FIFO
  const position =
    customer.status === "waiting" ? queuePosition(state, customerId) : null
  const openHold =
    customer.status === "on-hold"
      ? step.holds.find((h) => h.releasedAt === null)
      : undefined

  return {
    status: customer.status,
    counterId: step.counterId,
    counterName: step.counterName,
    priority: customer.status === "waiting" && isPriority(state, customerId),
    holdReason: openHold?.reason ?? null,
    position,
    estWaitMin:
      position !== null ? Math.floor(position * MINUTES_PER_CUSTOMER) : null,
  }
}
