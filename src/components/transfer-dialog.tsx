"use client"

import { useState } from "react"
import { ArrowRight, ArrowRightLeft } from "lucide-react"
import { notifyTransient } from "@/lib/notifications"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { COUNTER_DEFS } from "@/lib/queue-logic"
import { useQueueStore } from "@/lib/queue-store"
import { cn } from "@/lib/utils"

interface TransferDialogProps {
  customerId: string | null
  onClose: () => void
}

export function TransferDialog({ customerId, onClose }: TransferDialogProps) {
  const customer = useQueueStore((s) =>
    customerId ? s.state.customers[customerId] : undefined
  )
  const counters = useQueueStore((s) => s.state.counters)
  const transfer = useQueueStore((s) => s.transfer)
  const [destination, setDestination] = useState<number | null>(null)

  function close() {
    setDestination(null)
    onClose()
  }

  function handleTransfer() {
    if (!customer || destination === null) return
    const result = transfer(customer.id, destination)
    notifyTransient(`${customer.token} transferred`, {
      kind: "success",
      description: `Added to Counter ${destination} queue at position #${result.position}`,
    })
    close()
  }

  if (!customer) return null

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="size-4 text-primary" aria-hidden />
            Transfer to Another Counter
          </DialogTitle>
          <DialogDescription>
            The customer keeps their token and joins the <strong>end</strong> of
            the destination queue — FIFO is never broken.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2 text-sm">
          <div>
            <p className="font-mono font-semibold text-primary">
              {customer.token}
            </p>
            <p className="text-xs text-muted-foreground">{customer.name}</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">
              Counter {customer.currentCounterId}
            </span>
            <ArrowRight className="size-3.5" aria-hidden />
            <span
              className={cn(
                "font-medium",
                destination ? "text-foreground" : "text-muted-foreground"
              )}
            >
              {destination ? `Counter ${destination}` : "?"}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {COUNTER_DEFS.filter((c) => c.id !== customer.currentCounterId).map(
            (def) => {
              const queueLength =
                counters.find((c) => c.id === def.id)?.queue.length ?? 0
              const selected = destination === def.id
              return (
                <button
                  key={def.id}
                  type="button"
                  onClick={() => setDestination(def.id)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-left text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                    selected
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "hover:border-primary/40 hover:bg-muted/50"
                  )}
                >
                  <p className="font-medium">Counter {def.id}</p>
                  <p className="text-xs text-muted-foreground">{def.name}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {queueLength} waiting → joins at #{queueLength + 1}
                  </p>
                </button>
              )
            }
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button onClick={handleTransfer} disabled={destination === null}>
            Transfer Customer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
