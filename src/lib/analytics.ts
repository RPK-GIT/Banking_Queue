import type { QueueState } from "./types"

/**
 * Manager analytics — all derived live from canonical queue state, never
 * stored. Every function returns one row per counter (or service type), so
 * charts and tables always reflect the same numbers the queues show.
 */

export interface CounterMetric {
  counterId: number
  counterName: string
  employeeName: string
  /** customers this counter has started serving (incl. currently serving) */
  tokensHandled: number
  /** completed service steps at this counter */
  tokensCompleted: number
  /** total time spent serving completed steps, ms */
  totalProcessingMs: number
  /** average per completed step, ms (0 if none) */
  avgProcessingMs: number
  /** customers currently waiting in this counter's queue */
  queueLength: number
  /** is the employee serving someone right now */
  serving: boolean
}

export function counterMetrics(state: QueueState): CounterMetric[] {
  return state.counters.map((counter) => {
    let tokensHandled = 0
    let tokensCompleted = 0
    let totalProcessingMs = 0
    for (const customer of Object.values(state.customers)) {
      for (const step of customer.journey) {
        if (step.counterId !== counter.id) continue
        if (step.startedAt !== null) tokensHandled += 1
        if (step.startedAt !== null && step.completedAt !== null) {
          tokensCompleted += 1
          totalProcessingMs += step.completedAt - step.startedAt
        }
      }
    }
    return {
      counterId: counter.id,
      counterName: counter.name,
      employeeName: counter.employeeName,
      tokensHandled,
      tokensCompleted,
      totalProcessingMs,
      avgProcessingMs:
        tokensCompleted > 0 ? totalProcessingMs / tokensCompleted : 0,
      queueLength: counter.queue.length,
      serving: counter.currentCustomerId !== null,
    }
  })
}

export interface ServiceTypeMetric {
  serviceType: string
  customers: number
}

export function serviceTypeMetrics(state: QueueState): ServiceTypeMetric[] {
  const counts = new Map<string, number>()
  for (const customer of Object.values(state.customers)) {
    counts.set(customer.serviceType, (counts.get(customer.serviceType) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([serviceType, customers]) => ({ serviceType, customers }))
    .sort((a, b) => b.customers - a.customers)
}
