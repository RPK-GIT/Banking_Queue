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
    <section aria-label="Counter queues" className="min-w-0">
      <div className="grid auto-cols-[minmax(13rem,1fr)] grid-flow-col gap-3 overflow-x-auto pb-1 min-[1400px]:grid-flow-row min-[1400px]:grid-cols-5">
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
