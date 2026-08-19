"use client"

import { useState } from "react"
import { ArrowUpDown, Check, Route } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { formatDuration } from "@/lib/format"
import { notifyTransient } from "@/lib/notifications"
import { getNextEligibleCustomer } from "@/lib/queue-logic"
import { useQueueStore } from "@/lib/queue-store"
import { OVERRIDE_REASONS, type Customer, type OverrideReason } from "@/lib/types"
import { useNow } from "@/hooks/use-now"
import { cn } from "@/lib/utils"

export interface OverrideTarget {
  counterId: number
  /** jump straight to the confirmation step for this customer (⋮ menu) */
  preselectedId?: string
}

function tierLine(customer: Customer): string {
  const stops = customer.journey.length
  if (stops > 1) {
    const from = customer.journey[stops - 2].counterId
    return `Journey in progress · from Counter ${from}`
  }
  return "New request"
}

function CustomerRow({
  customer,
  now,
  recommended,
  onPick,
}: {
  customer: Customer
  now: number
  recommended: boolean
  onPick: (customer: Customer) => void
}) {
  const step = customer.journey[customer.journey.length - 1]
  return (
    <button
      type="button"
      onClick={() => onPick(customer)}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
        recommended
          ? "border-emerald-300 bg-emerald-50/60 hover:border-emerald-400"
          : "hover:border-primary/40 hover:bg-muted/50"
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2">
          <span className="font-mono text-xs font-semibold text-primary">
            {customer.token}
          </span>
          <span className="truncate text-[13px] font-medium">{customer.name}</span>
        </p>
        <p className="text-[11px] text-muted-foreground">
          {tierLine(customer)} · waiting {formatDuration(now - step.enteredAt)}
        </p>
      </div>
      {recommended ? (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
          <Check className="size-3" aria-hidden />
          Serve Recommended
        </span>
      ) : (
        <span className="shrink-0 text-[10px] font-medium text-muted-foreground">
          select
        </span>
      )}
    </button>
  )
}

/**
 * QUEUE OVERRIDE — "Choose Another": the employee may serve a different
 * eligible customer instead of the system recommendation. The queue is never
 * reordered; the choice applies exactly once, then automation resumes.
 */
export function OverrideDialog({
  target,
  onClose,
  onOpenJourney,
}: {
  target: OverrideTarget | null
  onClose: () => void
  onOpenJourney: (customerId: string) => void
}) {
  const state = useQueueStore((s) => s.state)
  const armOverride = useQueueStore((s) => s.armOverride)
  const now = useNow(1000)
  const [selectedId, setSelectedId] = useState<string | null>(
    target?.preselectedId ?? null
  )
  const [reason, setReason] = useState<OverrideReason | null>(null)

  if (!target) return null
  const counter = state.counters.find((c) => c.id === target.counterId)
  if (!counter) return null

  const recommended = getNextEligibleCustomer(state, counter.id)
  const journeyGroup = counter.releasedQueue
    .concat(counter.priorityQueue)
    .filter((id) => id !== recommended?.id)
    .map((id) => state.customers[id])
    .filter(Boolean)
  const newGroup = counter.queue
    .filter((id) => id !== recommended?.id)
    .map((id) => state.customers[id])
    .filter(Boolean)

  const selected = selectedId ? state.customers[selectedId] : null
  const serving = counter.currentCustomerId
    ? state.customers[counter.currentCustomerId]
    : null

  function close() {
    setSelectedId(null)
    setReason(null)
    onClose()
  }

  function pick(customer: Customer) {
    if (recommended && customer.id === recommended.id) {
      // choosing the recommendation = pure automation, nothing to arm
      notifyTransient(`${customer.token} stays next`, {
        description: "The automated recommendation will be served as normal.",
      })
      close()
      return
    }
    setSelectedId(customer.id)
  }

  function confirmOverride() {
    if (!selected) return
    armOverride(counter!.id, selected.id, reason)
    notifyTransient("Queue override", {
      description: serving
        ? `${selected.token} will be served next at Counter ${counter!.id} — the queue itself is unchanged.`
        : `${selected.token} is now being served at Counter ${counter!.id}.`,
    })
    close()
  }

  // ---- confirmation step ----
  if (selected) {
    return (
      <Dialog open onOpenChange={(o) => !o && close()}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowUpDown className="size-4 text-primary" aria-hidden />
              Override Queue Order?
            </DialogTitle>
            <DialogDescription>
              This customer is not the system-recommended next customer. The
              queue keeps its order — automation resumes after this service.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5 text-sm">
            <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2">
              <span className="text-xs text-muted-foreground">Recommended</span>
              <span>
                <span className="font-mono font-semibold">
                  {recommended?.token ?? "—"}
                </span>{" "}
                <span className="text-xs text-muted-foreground">
                  {recommended?.name}
                </span>
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-primary/40 bg-primary/5 px-3 py-2">
              <span className="text-xs text-muted-foreground">Selected</span>
              <span>
                <span className="font-mono font-semibold text-primary">
                  {selected.token}
                </span>{" "}
                <span className="text-xs text-muted-foreground">
                  {selected.name}
                </span>
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              Reason (optional)
            </p>
            <div className="flex flex-wrap gap-1.5">
              {OVERRIDE_REASONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setReason(reason === option ? null : option)}
                  aria-pressed={reason === option}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[11px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                    reason === option
                      ? "border-primary bg-primary/10 font-medium text-primary"
                      : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedId(null)}>
              Cancel
            </Button>
            <Button onClick={confirmOverride}>
              <ArrowUpDown data-icon="inline-start" aria-hidden />
              Serve {selected.token}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  // ---- selection step ----
  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowUpDown className="size-4 text-primary" aria-hidden />
            Choose Customer — Counter {counter.id}
          </DialogTitle>
          <DialogDescription>
            Recommended customer:{" "}
            <span className="font-mono font-semibold text-foreground">
              {recommended?.token ?? "—"}
            </span>
            {serving && (
              <> · applies when {serving.token}&apos;s service finishes</>
            )}
          </DialogDescription>
        </DialogHeader>

        {recommended ? (
          <div className="flex flex-col gap-3">
            <div>
              <p className="mb-1 text-[10px] font-semibold tracking-wide text-emerald-700 uppercase">
                Recommended
              </p>
              <CustomerRow
                customer={recommended}
                now={now}
                recommended
                onPick={pick}
              />
            </div>
            {journeyGroup.length > 0 && (
              <div>
                <p className="mb-1 text-[10px] font-semibold tracking-wide text-sky-700 uppercase">
                  Other journey-in-progress
                </p>
                <div className="flex flex-col gap-1.5">
                  {journeyGroup.map((c) => (
                    <CustomerRow
                      key={c.id}
                      customer={c}
                      now={now}
                      recommended={false}
                      onPick={pick}
                    />
                  ))}
                </div>
              </div>
            )}
            {newGroup.length > 0 && (
              <div>
                <p className="mb-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                  New requests
                </p>
                <div className="flex flex-col gap-1.5">
                  {newGroup.map((c) => (
                    <CustomerRow
                      key={c.id}
                      customer={c}
                      now={now}
                      recommended={false}
                      onPick={pick}
                    />
                  ))}
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                if (recommended) onOpenJourney(recommended.id)
              }}
              className="flex items-center justify-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              <Route className="size-3" aria-hidden />
              View recommended customer&apos;s journey
            </button>
          </div>
        ) : (
          <p className="py-4 text-center text-xs text-muted-foreground">
            Nobody is eligible to be served at this counter right now.
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
