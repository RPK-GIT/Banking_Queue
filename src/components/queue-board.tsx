"use client"

import { CounterColumn } from "@/components/counter-column"
import { useQueueStore } from "@/lib/queue-store"
import { useNow } from "@/hooks/use-now"

interface QueueBoardProps {
  onSelectCustomer: (customerId: string) => void
  onTransfer: (customerId: string) => void
}

export function QueueBoard({ onSelectCustomer, onTransfer }: QueueBoardProps) {
  const counters = useQueueStore((s) => s.state.counters)
  const now = useNow(1000)

  return (
    <section
      aria-label="Live queues"
      className="flex min-h-0 flex-1 flex-col gap-2"
    >
      <h2 className="shrink-0 px-0.5 text-sm font-semibold tracking-tight">
        Live Queues
      </h2>
      <div className="grid min-h-0 flex-1 auto-cols-[minmax(13rem,1fr)] grid-flow-col gap-3 overflow-x-auto lg:grid-flow-row lg:grid-cols-4 lg:overflow-x-visible">
        {counters.map((counter) => (
          <CounterColumn
            key={counter.id}
            counter={counter}
            now={now}
            onSelectCustomer={onSelectCustomer}
            onTransfer={onTransfer}
          />
        ))}
      </div>
    </section>
  )
}
