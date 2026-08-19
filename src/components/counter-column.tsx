"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import {
  ArrowRight,
  ArrowRightLeft,
  BellRing,
  CheckCheck,
  ChevronDown,
  Coffee,
  PauseCircle,
  PlayCircle,
  UserRound,
  Zap,
} from "lucide-react"
import { notifyTransient } from "@/lib/notifications"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { CustomerCard } from "@/components/customer-card"
import { stepProcessingMs } from "@/lib/durations"
import { formatDuration } from "@/lib/format"
import { getRecommendedCustomer } from "@/lib/queue-logic"
import { useQueueStore } from "@/lib/queue-store"
import type { Counter } from "@/lib/types"
import { cn } from "@/lib/utils"

/** waiting cards shown before collapsing behind "+ N more waiting" */
const VISIBLE_QUEUE_LIMIT = 3

interface CounterColumnProps {
  counter: Counter
  now: number
  onSelectCustomer: (customerId: string) => void
  onTransfer: (customerId: string) => void
  onHold: (customerId: string) => void
  /** open the Choose Customer (queue override) panel for this counter */
  onOverride: (counterId: number, preselectedId?: string) => void
}

export function CounterColumn({
  counter,
  now,
  onSelectCustomer,
  onTransfer,
  onHold,
  onOverride,
}: CounterColumnProps) {
  const state = useQueueStore((s) => s.state)
  const customers = state.customers
  const call = useQueueStore((s) => s.call)
  const completeService = useQueueStore((s) => s.completeService)
  const release = useQueueStore((s) => s.release)
  const beginBreak = useQueueStore((s) => s.beginBreak)
  const finishBreak = useQueueStore((s) => s.finishBreak)
  const [showAll, setShowAll] = useState(false)

  const onBreak = counter.status === "on-break"
  const serving = counter.currentCustomerId
    ? customers[counter.currentCustomerId]
    : null
  const servingStep = serving?.journey[serving.journey.length - 1]

  const recommended = getRecommendedCustomer(state, counter.id)

  const hiddenCount = counter.queue.length - VISIBLE_QUEUE_LIMIT
  const visibleQueue =
    showAll || hiddenCount <= 0
      ? counter.queue
      : counter.queue.slice(0, VISIBLE_QUEUE_LIMIT)
  /** NEW REQUESTS positions sit behind the released + priority tiers */
  const newOffset = counter.releasedQueue.length + counter.priorityQueue.length

  function handleCallRecommended() {
    if (!recommended) return
    const called = call(counter.id, recommended.id)
    notifyTransient(`${called.token} called at Counter ${counter.id}`, {
      description: `${called.name} — ${called.serviceType}`,
    })
  }

  function handleComplete() {
    if (!serving) return
    const completed = completeService(counter.id)
    notifyTransient(`${completed.token} journey completed`, {
      kind: "success",
      description:
        "The system recommends the next customer — call when ready.",
    })
  }

  function handleRelease(customerId: string) {
    const released = release(customerId)
    notifyTransient(`${released.token} hold released`, {
      description: "Priority restored — next after the current customer.",
    })
  }

  function handleBreakToggle() {
    if (onBreak) {
      finishBreak(counter.id)
      notifyTransient(`${counter.employeeName} is back at Counter ${counter.id}`, {
        description: serving
          ? `${serving.token}'s service resumed from where it paused.`
          : "The next eligible customer is assigned automatically.",
      })
    } else {
      beginBreak(counter.id)
      notifyTransient(`${counter.employeeName} is on a break`, {
        description: serving
          ? `${serving.token}'s service is paused — their place is kept.`
          : `Counter ${counter.id} is unavailable until the employee returns.`,
      })
    }
  }

  function tierCustomer(customerId: string) {
    return customers[customerId] ?? null
  }

  return (
    <Card
      data-testid={`counter-card-${counter.id}`}
      className={cn(
        "flex h-full min-h-0 min-w-0 flex-col gap-0 overflow-hidden p-0 shadow-xs",
        onBreak && "ring-2 ring-rose-300"
      )}
    >
      {/* Counter header */}
      <div
        className={cn(
          "shrink-0 border-b px-3 py-2",
          onBreak ? "bg-rose-50" : "bg-muted/40"
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-semibold">
            Counter {counter.number}
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset",
              onBreak
                ? "bg-rose-100 text-rose-700 ring-rose-600/20"
                : serving
                  ? "bg-blue-50 text-blue-700 ring-blue-600/20"
                  : "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
            )}
          >
            {onBreak ? (
              <Coffee className="size-2.5" aria-hidden />
            ) : (
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  serving ? "bg-blue-500" : "bg-emerald-500"
                )}
              />
            )}
            {onBreak ? "On Break" : serving ? "Serving" : "Available"}
          </span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <p className="truncate text-[11px] text-muted-foreground">
            {counter.name}
          </p>
          <span className="flex shrink-0 items-center gap-1">
            <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <UserRound className="size-3" aria-hidden />
              {counter.employeeName}
            </p>
            {!onBreak && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      aria-label={`Start break — ${counter.employeeName}`}
                      onClick={handleBreakToggle}
                      className="rounded-md p-0.5 text-muted-foreground outline-none hover:bg-rose-100 hover:text-rose-700 focus-visible:ring-2 focus-visible:ring-ring/60"
                    />
                  }
                >
                  <Coffee className="size-3.5" aria-hidden />
                </TooltipTrigger>
                <TooltipContent>
                  Start Break — pauses the current service, keeps every place
                </TooltipContent>
              </Tooltip>
            )}
          </span>
        </div>
      </div>

      {/* EMPLOYEE BREAK banner + resume */}
      {onBreak && (
        <div className="shrink-0 border-b border-rose-200 bg-rose-50/70 px-3 py-1.5">
          <p className="flex items-center gap-1 text-[10px] font-semibold tracking-wide text-rose-700 uppercase">
            <Coffee className="size-3" aria-hidden />
            Employee on break
            {serving && " — service paused"}
          </p>
          <Button
            size="xs"
            onClick={handleBreakToggle}
            className="mt-1 w-full bg-rose-600 text-white hover:bg-rose-700"
          >
            <PlayCircle data-icon="inline-start" aria-hidden />
            Resume Service
          </Button>
        </div>
      )}

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
                data-testid={`now-serving-${counter.id}`}
                className={cn(
                  "w-full rounded-lg border px-2.5 py-1.5 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                  onBreak
                    ? "border-rose-300 bg-rose-50/70 hover:border-rose-400"
                    : "border-blue-200 bg-blue-50/70 hover:border-blue-300"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      "font-mono text-sm font-bold",
                      onBreak ? "text-rose-800" : "text-blue-800"
                    )}
                  >
                    {serving.token}
                  </span>
                  <span
                    className={cn(
                      "font-mono text-[11px] tabular-nums",
                      onBreak ? "text-rose-700/80" : "text-blue-700/80"
                    )}
                  >
                    {/* active processing only — frozen during breaks/holds */}
                    {formatDuration(stepProcessingMs(servingStep, now))}
                  </span>
                </div>
                <p
                  className={cn(
                    "truncate text-[13px] font-medium",
                    onBreak ? "text-rose-950" : "text-blue-950"
                  )}
                >
                  {serving.name}
                </p>
                <p
                  className={cn(
                    "truncate text-[11px]",
                    onBreak ? "text-rose-800/70" : "text-blue-800/70"
                  )}
                >
                  {onBreak ? "SERVICE PAUSED" : serving.serviceType}
                </p>
              </button>
              {!onBreak && (
                <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                  <Button size="xs" onClick={handleComplete} className="w-full">
                    <CheckCheck data-icon="inline-start" aria-hidden />
                    Complete
                  </Button>
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => onHold(serving.id)}
                    className="w-full border-orange-300 text-orange-700 hover:bg-orange-50 hover:text-orange-800"
                  >
                    <PauseCircle data-icon="inline-start" aria-hidden />
                    Hold
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
              )}
            </motion.div>
          ) : (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mt-1.5"
            >
              {onBreak ? (
                <div className="rounded-lg border border-dashed px-2.5 py-1.5 text-center text-xs text-muted-foreground">
                  Counter unavailable
                </div>
              ) : recommended ? (
                /* RECOMMENDATION ≠ ASSIGNMENT — the customer is still
                   waiting; only the explicit Call below starts service */
                <div
                  data-testid={`recommended-${counter.id}`}
                  className="rounded-lg border border-dashed border-emerald-400 bg-emerald-50/50 px-2.5 py-1.5"
                >
                  <p className="text-[10px] font-semibold tracking-wide text-emerald-700 uppercase">
                    Next recommended
                  </p>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm font-bold text-emerald-800">
                      {recommended.token}
                    </span>
                    <span className="font-mono text-[11px] tabular-nums text-emerald-700/80">
                      waiting{" "}
                      {formatDuration(
                        now -
                          recommended.journey[recommended.journey.length - 1]
                            .enteredAt
                      )}
                    </span>
                  </div>
                  <p className="truncate text-[13px] font-medium text-emerald-950">
                    {recommended.name}
                  </p>
                  <p className="truncate text-[11px] text-emerald-800/70">
                    {recommended.journey.length > 1
                      ? `Journey already started · from Counter ${recommended.journey[recommended.journey.length - 2].counterId}`
                      : "New request"}
                  </p>
                  <div className="mt-1.5 flex flex-col gap-1">
                    <Button
                      size="xs"
                      onClick={handleCallRecommended}
                      className="w-full bg-emerald-600 text-white hover:bg-emerald-700"
                    >
                      <BellRing data-icon="inline-start" aria-hidden />
                      Call {recommended.token}
                    </Button>
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => onOverride(counter.id)}
                      className="w-full"
                    >
                      ↕ Choose Another
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed px-2.5 py-1.5 text-center text-xs text-muted-foreground">
                  No customers waiting — counter available
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* passive preview while serving — the recommendation is NOT assigned */}
      {serving && !onBreak && recommended && (
        <div className="shrink-0 border-b bg-emerald-50/40 px-3 py-1">
          <p className="truncate text-[11px]">
            <span className="text-[10px] font-semibold tracking-wide text-emerald-700 uppercase">
              Next recommended
            </span>{" "}
            <span className="font-mono font-semibold text-emerald-800">
              {recommended.token}
            </span>{" "}
            <span className="text-emerald-950">{recommended.name}</span>
            <span className="text-emerald-800/60"> · still waiting</span>
          </p>
        </div>
      )}

      {/* NEXT AFTER CURRENT — released holds, first precedence */}
      {counter.releasedQueue.length > 0 && (
        <div className="shrink-0 border-b border-violet-200 bg-violet-50/70 px-3 py-1.5">
          <p className="flex items-center gap-1 text-[10px] font-semibold tracking-wide text-violet-700 uppercase">
            <Zap className="size-3" aria-hidden />
            Next after current
          </p>
          <div className="mt-1 flex flex-col gap-1">
            {counter.releasedQueue.map((customerId) => {
              const customer = tierCustomer(customerId)
              if (!customer) return null
              return (
                <button
                  key={customer.id}
                  type="button"
                  onClick={() => onSelectCustomer(customer.id)}
                  title={`View ${customer.token}'s journey`}
                  className="w-full rounded-lg border border-violet-300 bg-white px-2.5 py-1.5 text-left outline-none hover:border-violet-400 focus-visible:ring-2 focus-visible:ring-ring/60"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-semibold text-violet-800">
                      {customer.token}
                    </span>
                    <span className="rounded-full bg-violet-100 px-1.5 py-px text-[10px] font-semibold text-violet-700">
                      released hold
                    </span>
                  </div>
                  <p className="truncate text-[12px] font-medium text-violet-950">
                    {customer.name}
                  </p>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* JOURNEY IN PROGRESS — started journeys outrank new requests */}
      {counter.priorityQueue.length > 0 && (
        <div className="shrink-0 border-b border-sky-200 bg-sky-50/70 px-3 py-1.5">
          <p className="flex items-center gap-1 text-[10px] font-semibold tracking-wide text-sky-700 uppercase">
            <ArrowRightLeft className="size-3" aria-hidden />
            Journey in progress · {counter.priorityQueue.length}
          </p>
          <div className="mt-1 flex flex-col gap-1">
            {counter.priorityQueue.map((customerId, index) => {
              const customer = tierCustomer(customerId)
              if (!customer) return null
              return (
                <div
                  key={customer.id}
                  className="group rounded-lg border border-sky-300 bg-white px-2.5 py-1.5"
                >
                  <button
                    type="button"
                    onClick={() => onSelectCustomer(customer.id)}
                    title={`View ${customer.token}'s journey`}
                    className="w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-semibold text-sky-800">
                        {customer.token}
                      </span>
                      <span className="rounded-full bg-sky-100 px-1.5 py-px text-[10px] font-semibold tabular-nums text-sky-700">
                        priority #{counter.releasedQueue.length + index + 1}
                      </span>
                    </div>
                    <p className="truncate text-[12px] font-medium text-sky-950">
                      {customer.name}
                    </p>
                    <p className="truncate text-[10px] text-sky-800/70">
                      stop {customer.journey.length} of a continuing journey
                    </p>
                  </button>
                  <div className="mt-1 flex items-center gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                    {!onBreak && !serving && (
                      <button
                        type="button"
                        aria-label={`Call ${customer.token} (queue override)`}
                        onClick={() => onOverride(counter.id, customer.id)}
                        className="rounded-md border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground outline-none hover:bg-violet-50 hover:text-violet-700 focus-visible:ring-2 focus-visible:ring-ring/60"
                      >
                        Call
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label={`Transfer ${customer.token} to another counter`}
                      onClick={() => onTransfer(customer.id)}
                      className="rounded-md border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
                    >
                      Transfer
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* NEW REQUESTS — journeys that never started; strict FIFO */}
      <div className="flex min-h-0 flex-1 flex-col bg-muted/20">
        <div className="flex shrink-0 items-center justify-between px-3 pt-2 pb-1.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
          <span>New requests · {counter.queue.length}</span>
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
                  position={newOffset + index + 1}
                  now={now}
                  onSelect={onSelectCustomer}
                  onServeNext={
                    onBreak || serving
                      ? undefined
                      : (id) => onOverride(counter.id, id)
                  }
                  onTransfer={onTransfer}
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
              No new requests
            </p>
          )}
        </div>
      </div>

      {/* ON HOLD — outside FIFO entirely, visually distinct at the bottom */}
      {counter.heldIds.length > 0 && (
        <div className="shrink-0 border-t-2 border-dashed border-orange-300 bg-orange-50/70 px-3 py-2">
          <p className="flex items-center gap-1 text-[10px] font-semibold tracking-wide text-orange-700 uppercase">
            <PauseCircle className="size-3" aria-hidden />
            On hold · {counter.heldIds.length}
          </p>
          <div className="mt-1 flex flex-col gap-1.5">
            {counter.heldIds.map((customerId) => {
              const customer = customers[customerId]
              if (!customer) return null
              const step = customer.journey[customer.journey.length - 1]
              const hold = step.holds.find((h) => h.releasedAt === null)
              return (
                <div
                  key={customer.id}
                  className="rounded-lg border border-orange-300 bg-white px-2.5 py-1.5"
                >
                  <button
                    type="button"
                    onClick={() => onSelectCustomer(customer.id)}
                    title={`View ${customer.token}'s journey`}
                    className="w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-semibold text-orange-800">
                        {customer.token}
                      </span>
                      <span className="font-mono text-[11px] tabular-nums text-orange-700/80">
                        {hold ? formatDuration(now - hold.startedAt) : ""}
                      </span>
                    </div>
                    <p className="truncate text-[12px] font-medium text-orange-950">
                      {customer.name}
                    </p>
                    {hold && (
                      <p className="truncate text-[11px] text-orange-800/70">
                        {hold.reason}
                      </p>
                    )}
                  </button>
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => handleRelease(customer.id)}
                    className="mt-1.5 w-full border-violet-300 text-violet-700 hover:bg-violet-50 hover:text-violet-800"
                  >
                    <PlayCircle data-icon="inline-start" aria-hidden />
                    Release Hold
                  </Button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </Card>
  )
}
