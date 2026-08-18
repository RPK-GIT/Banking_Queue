"use client"

import { useState } from "react"
import { PauseCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { notifyTransient } from "@/lib/notifications"
import { useQueueStore } from "@/lib/queue-store"
import { HOLD_REASONS, type HoldReason } from "@/lib/types"
import { cn } from "@/lib/utils"

/**
 * Compact confirmation for putting the CURRENTLY SERVED customer on hold.
 * Held tickets leave FIFO entirely; releasing restores their priority.
 */
export function HoldDialog({
  customerId,
  onClose,
}: {
  customerId: string | null
  onClose: () => void
}) {
  const customer = useQueueStore((s) =>
    customerId ? s.state.customers[customerId] : undefined
  )
  const holdCurrent = useQueueStore((s) => s.holdCurrent)
  const [reason, setReason] = useState<HoldReason>("Waiting for customer")

  function close() {
    setReason("Waiting for customer")
    onClose()
  }

  function handleHold() {
    if (!customer || customer.currentCounterId === null) return
    holdCurrent(customer.currentCounterId, reason)
    notifyTransient(`${customer.token} put on hold`, {
      description: `${reason} — release restores priority (next after current).`,
    })
    close()
  }

  if (!customer) return null

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PauseCircle className="size-4 text-orange-600" aria-hidden />
            Put on Hold
          </DialogTitle>
          <DialogDescription>
            The customer leaves active service but keeps their token, journey
            and counter. On release they are served{" "}
            <strong>next after the current customer</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2 text-sm">
          <div>
            <p className="font-mono font-semibold text-primary">
              {customer.token}
            </p>
            <p className="text-xs text-muted-foreground">{customer.name}</p>
          </div>
          <span className="text-xs font-medium">
            Counter {customer.currentCounterId}
          </span>
        </div>

        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Reason
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {HOLD_REASONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setReason(option)}
                aria-pressed={reason === option}
                className={cn(
                  "rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                  reason === option
                    ? "border-orange-400 bg-orange-50 font-medium text-orange-900"
                    : "hover:border-orange-200 hover:bg-muted/50"
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button
            onClick={handleHold}
            className="bg-orange-600 text-white hover:bg-orange-700"
          >
            <PauseCircle data-icon="inline-start" aria-hidden />
            Put on Hold
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
