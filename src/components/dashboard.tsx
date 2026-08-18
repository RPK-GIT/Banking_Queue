"use client"

import { useEffect, useState } from "react"

import { ActivityFeed } from "@/components/activity-feed"
import { AppHeader } from "@/components/app-header"
import { DemoControls } from "@/components/demo-controls"
import { JourneyDialog } from "@/components/journey-dialog"
import { KpiStrip } from "@/components/kpi-strip"
import { NewCustomerCard } from "@/components/new-customer-card"
import { QueueBoard } from "@/components/queue-board"
import { TransferDialog } from "@/components/transfer-dialog"
import { WhyPanel } from "@/components/why-panel"
import { useQueueStore } from "@/lib/queue-store"

export function Dashboard() {
  const hydrated = useQueueStore((s) => s.hydrated)
  const init = useQueueStore((s) => s.init)
  const [journeyCustomerId, setJourneyCustomerId] = useState<string | null>(null)
  const [transferCustomerId, setTransferCustomerId] = useState<string | null>(null)

  useEffect(() => {
    init()
  }, [init])

  if (!hydrated) {
    return (
      <div className="flex min-h-screen flex-col">
        <AppHeader />
        <div className="mx-auto flex w-full max-w-[1800px] flex-1 flex-col gap-4 px-4 py-4 lg:px-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
          <div className="h-96 animate-pulse rounded-xl bg-muted" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <main className="mx-auto flex w-full max-w-[1800px] flex-1 flex-col gap-4 px-4 py-4 lg:px-6">
        <KpiStrip />
        <div className="grid flex-1 grid-cols-1 gap-4 xl:grid-cols-[17rem_minmax(0,1fr)_16rem]">
          <div className="flex flex-col gap-4">
            <NewCustomerCard />
            <DemoControls />
          </div>
          <QueueBoard
            onSelectCustomer={setJourneyCustomerId}
            onTransfer={setTransferCustomerId}
          />
          <ActivityFeed onSelectCustomer={setJourneyCustomerId} />
        </div>
        <WhyPanel />
      </main>

      <JourneyDialog
        customerId={journeyCustomerId}
        onClose={() => setJourneyCustomerId(null)}
      />
      <TransferDialog
        customerId={transferCustomerId}
        onClose={() => setTransferCustomerId(null)}
      />
    </div>
  )
}
