"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import {
  ArrowRight,
  ArrowRightLeft,
  BellRing,
  CheckCheck,
  ChevronDown,
  UserRound,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { CustomerCard } from "@/components/customer-card"
import { formatDuration } from "@/lib/format"
import { useQueueStore } from "@/lib/queue-store"
import type { Counter } from "@/lib/types"
import { cn } from "@/lib/utils"

/** waiting cards shown before collapsing behind "+ N more waiting" */
const VISIBLE_QUEUE_LIMIT = 4

interface CounterColumnProps {
  counter: Counter
  now: number
  onSelectCustomer: (customerId: string) => void
  onTransfer: (customerId: string) => void
}

export function CounterColumn({
  counter,
  now,
  onSelectCustomer,
  onTransfer,
}: CounterColumnProps) {
  const customers = useQueueStore((s) => s.state.customers)
  const callNext = useQueueStore((s) => s.callNext)
  const completeService = useQueueStore((s) => s.completeService)
  const [showAll, setShowAll] = useState(false)

  const serving = counter.currentCustomerId
    ? customers[counter.currentCustomerId]
    : null
  const servingStep = serving?.journey[serving.journey.length - 1]

  const hiddenCount = counter.queue.length - VISIBLE_QUEUE_LIMIT
  const visibleQueue =
    showAll || hiddenCount <= 0
      ? counter.queue
      : counter.queue.slice(0, VISIBLE_QUEUE_LIMIT)

  function handleCallNext() {
    const called = callNext(counter.id)
    if (called) {
      toast.info(`${called.token} called at Counter ${counter.id}`, {
        description: `${called.name} — ${called.serviceType}`,
      })
    }
  }

  function handleComplete() {
    if (!serving) return
    const completed = completeService(counter.id)
    toast.success(`${completed.token} journey completed`, {
      description: `${completed.name} served across ${completed.journey.length} counter${completed.journey.length > 1 ? "s" : ""}.`,
    })
  }

  return (
    <Card className="flex h-full min-h-0 min-w-0 flex-col gap-0 overflow-hidden p-0 shadow-xs">
      {/* Counter header */}
      <div className="shrink-0 border-b bg-muted/40 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-semibold">
            Counter {counter.number}
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset",
              serving
                ? "bg-blue-50 text-blue-700 ring-blue-600/20"
                : "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
            )}
          >
            <span
              className={cn(
                "size-1.5 rounded-full",
                serving ? "bg-blue-500" : "bg-emerald-500"
              )}
            />
            {serving ? "Serving" : "Available"}
          </span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <p className="truncate text-[11px] text-muted-foreground">
            {counter.name}
          </p>
          <p className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
            <UserRound className="size-3" aria-hidden />
            {counter.employeeName}
          </p>
        </div>
      </div>

      {/* Currently serving */}
      <div className="shrink-0 border-b px-3 py-2">
        <p className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
          Now serving
        </p>
        <AnimatePresence mode="popLayout" initial={false}>
          {serving && servingStep ? (
            <motion.div
              key={serving.id}
              layoutId={serving.id}
              layout
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={{ type: "spring", stiffness: 400, damping: 32 }}
              className="mt-1.5"
            >
              <button
                type="button"
                onClick={() => onSelectCustomer(serving.id)}
                title={`View ${serving.token}'s journey`}
                className="w-full rounded-lg border border-blue-200 bg-blue-50/70 px-2.5 py-1.5 text-left transition-colors outline-none hover:border-blue-300 focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-sm font-bold text-blue-800">
                    {serving.token}
                  </span>
                  <span className="font-mono text-[11px] tabular-nums text-blue-700/80">
                    {servingStep.startedAt
                      ? formatDuration(now - servingStep.startedAt)
                      : "00:00"}
                  </span>
                </div>
                <p className="truncate text-[13px] font-medium text-blue-950">
                  {serving.name}
                </p>
                <p className="truncate text-[11px] text-blue-800/70">
                  {serving.serviceType}
                </p>
              </button>
              <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                <Button size="xs" onClick={handleComplete} className="w-full">
                  <CheckCheck data-icon="inline-start" aria-hidden />
                  Complete
                </Button>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => onTransfer(serving.id)}
                  className="w-full"
                >
                  <ArrowRightLeft data-icon="inline-start" aria-hidden />
                  Transfer
                </Button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mt-1.5"
            >
              <div className="rounded-lg border border-dashed px-2.5 py-1.5 text-center text-xs text-muted-foreground">
                Counter free
              </div>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      size="xs"
                      variant="secondary"
                      className="mt-1.5 w-full"
                      disabled={counter.queue.length === 0}
                      onClick={handleCallNext}
                    />
                  }
                >
                  <BellRing data-icon="inline-start" aria-hidden />
                  Call Next
                </TooltipTrigger>
                <TooltipContent>
                  Only the first customer in the queue can be called (FIFO)
                </TooltipContent>
              </Tooltip>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* FIFO queue — scrolls INSIDE the card, never the page */}
      <div className="flex min-h-0 flex-1 flex-col bg-muted/20">
        <div className="flex shrink-0 items-center justify-between px-3 pt-2 pb-1.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
          <span>FIFO queue · {counter.queue.length} waiting</span>
          <span className="flex items-center gap-0.5 normal-case">
            first
            <ArrowRight className="size-2.5" aria-hidden />
            last
          </span>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-3 pb-2">
          <AnimatePresence mode="popLayout" initial={false}>
            {visibleQueue.map((customerId, index) => {
              const customer = customers[customerId]
              if (!customer) return null
              return (
                <CustomerCard
                  key={customer.id}
                  customer={customer}
                  position={index + 1}
                  now={now}
                  onSelect={onSelectCustomer}
                />
              )
            })}
          </AnimatePresence>
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setShowAll((s) => !s)}
              className="flex shrink-0 items-center justify-center gap-1 rounded-lg border border-dashed px-2 py-1.5 text-[11px] font-medium text-muted-foreground outline-none hover:bg-muted/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              <ChevronDown
                className={cn("size-3 transition-transform", showAll && "rotate-180")}
                aria-hidden
              />
              {showAll ? "Show less" : `+ ${hiddenCount} more waiting`}
            </button>
          )}
          {counter.queue.length === 0 && (
            <p className="rounded-lg border border-dashed px-2 py-2.5 text-center text-[11px] text-muted-foreground">
              Queue empty
            </p>
          )}
        </div>
      </div>
    </Card>
  )
}
