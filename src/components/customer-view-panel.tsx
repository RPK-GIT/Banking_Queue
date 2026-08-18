"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { ChevronDown, MessageCircle, PanelRightOpen, Route } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { formatTime } from "@/lib/format"
import { useQueueStore } from "@/lib/queue-store"
import { HERO_TOKEN } from "@/lib/seed"
import type { Customer } from "@/lib/types"
import { buildWhatsAppMessages, customerLiveStatus } from "@/lib/whatsapp"
import { cn } from "@/lib/utils"

function tokenNumber(customer: Customer): number {
  return Number(customer.token.replace("T-", "")) || 0
}

const STATUS_LABEL = {
  waiting: "Waiting",
  serving: "Being served",
  completed: "Completed",
} as const

/**
 * Customer View — a PERMANENT right-side panel showing the customer's
 * simulated WhatsApp for the same canonical queue state the dashboard shows.
 * Always interactive, including while the demo engine is paused.
 */
export function CustomerViewPanel({
  collapsed,
  onToggleCollapsed,
  onOpenJourney,
}: {
  collapsed: boolean
  onToggleCollapsed: () => void
  onOpenJourney: (customerId: string) => void
}) {
  const state = useQueueStore((s) => s.state)
  const demoStatus = useQueueStore((s) => s.demoStatus)
  const demoStepIndex = useQueueStore((s) => s.demoStepIndex)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showCompleted, setShowCompleted] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const prevDemoStatus = useRef(demoStatus)

  const sorted = useMemo(
    () =>
      Object.values(state.customers).sort(
        (a, b) => tokenNumber(a) - tokenNumber(b)
      ),
    [state.customers]
  )
  const active = sorted.filter((c) => c.status !== "completed")
  const completed = sorted.filter((c) => c.status === "completed")
  const hero = sorted.find((c) => c.token === HERO_TOKEN)

  // when a Live Demo starts, focus the hero customer (Ravi — T-104); never
  // switch away automatically after the presenter picks someone manually
  useEffect(() => {
    if (
      prevDemoStatus.current !== "playing" &&
      demoStatus === "playing" &&
      demoStepIndex === 0 &&
      hero
    ) {
      setSelectedId(hero.id)
    }
    prevDemoStatus.current = demoStatus
  }, [demoStatus, demoStepIndex, hero])

  // heal a stale selection (Clear All / Restart) — default to the hero
  const selected =
    (selectedId && state.customers[selectedId]) || hero || sorted[0] || null
  const messages = selected ? buildWhatsAppMessages(selected) : []
  const status = selected ? customerLiveStatus(state, selected.id) : null

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length, selected?.id])

  function customerRow(customer: Customer) {
    const s = customerLiveStatus(state, customer.id)
    const line =
      s.status === "completed"
        ? "Completed"
        : s.position !== null
          ? `Counter ${s.counterId} · #${s.position}`
          : `Counter ${s.counterId} · serving`
    const isSelected = selected?.id === customer.id
    return (
      <button
        key={customer.id}
        type="button"
        onClick={() => setSelectedId(customer.id)}
        aria-pressed={isSelected}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
          isSelected ? "bg-primary/8 ring-1 ring-primary/30" : "hover:bg-muted"
        )}
      >
        <span
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            s.status === "serving"
              ? "bg-blue-500"
              : s.status === "waiting"
                ? "bg-amber-400"
                : "bg-emerald-500"
          )}
          aria-hidden
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium leading-tight">
            {customer.name}
          </span>
          <span className="block truncate text-[10px] leading-tight text-muted-foreground">
            {customer.token} · {line}
          </span>
        </span>
      </button>
    )
  }

  if (collapsed) {
    return (
      <aside
        aria-label="Customer view (collapsed)"
        className="flex w-12 shrink-0 flex-col items-center gap-2 border-l bg-card py-3"
      >
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                aria-label="Expand customer view"
                onClick={onToggleCollapsed}
              />
            }
          >
            <MessageCircle className="text-[#25d366]" aria-hidden />
          </TooltipTrigger>
          <TooltipContent side="left">Customer View</TooltipContent>
        </Tooltip>
      </aside>
    )
  }

  return (
    <aside
      aria-label="Customer view"
      className="flex w-[330px] shrink-0 flex-col border-l bg-card min-[1600px]:w-[380px]"
    >
      {/* panel header */}
      <div className="flex shrink-0 items-center justify-between border-b px-3 py-2">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <MessageCircle className="size-4 text-[#25d366]" aria-hidden />
            Customer View
          </h2>
          <p className="text-[9px] font-semibold tracking-widest text-muted-foreground uppercase">
            Simulated WhatsApp
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Collapse customer view"
          onClick={onToggleCollapsed}
        >
          <PanelRightOpen aria-hidden />
        </Button>
      </div>

      {/* active customers selector */}
      <div className="flex max-h-56 shrink-0 flex-col border-b">
        <p className="shrink-0 px-3 pt-2 pb-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
          Active Customers · {active.length}
        </p>
        <div className="min-h-0 overflow-y-auto px-1.5 pb-1.5">
          {active.map(customerRow)}
          {active.length === 0 && (
            <p className="px-2 py-2 text-center text-[11px] text-muted-foreground">
              No active customers.
            </p>
          )}
          {completed.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setShowCompleted((s) => !s)}
                className="mt-0.5 flex w-full items-center justify-center gap-1 rounded-md px-2 py-0.5 text-[10px] text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                <ChevronDown
                  className={cn("size-3 transition-transform", showCompleted && "rotate-180")}
                  aria-hidden
                />
                {showCompleted ? "Hide completed" : `${completed.length} completed`}
              </button>
              {showCompleted && completed.map(customerRow)}
            </>
          )}
        </div>
      </div>

      {/* phone */}
      {selected && status ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center gap-2 bg-[#075e54] px-3 py-2 text-white">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/20 text-xs font-bold">
              {selected.name
                .split(" ")
                .map((p) => p[0])
                .slice(0, 2)
                .join("")}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm leading-tight font-semibold">
                {selected.name}
              </p>
              <p className="text-[11px] leading-tight text-white/80">
                {selected.token} · SBI Demo Branch
              </p>
            </div>
          </div>

          <div
            ref={scrollRef}
            data-testid="wa-conversation"
            className="min-h-0 flex-1 overflow-y-auto bg-[#efeae2] px-3 py-3"
          >
            <div className="flex flex-col gap-2">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className="max-w-[90%] rounded-lg rounded-tl-none bg-white px-2.5 py-1.5 shadow-sm"
                >
                  <p className="text-[12px] leading-snug whitespace-pre-line">
                    {message.text}
                  </p>
                  <p className="mt-0.5 text-right text-[10px] text-muted-foreground">
                    {formatTime(message.at)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* live status snapshot — same state the bank sees */}
          <div className="shrink-0 border-t bg-card px-3 py-2">
            <div className="grid grid-cols-4 gap-2 text-center">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase">Queue</p>
                <p className="truncate text-xs font-semibold">
                  {status.counterName ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase">Position</p>
                <p className="text-xs font-semibold tabular-nums">
                  {status.position !== null ? `#${status.position}` : "—"}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase">Est. wait</p>
                <p className="text-xs font-semibold tabular-nums">
                  {status.estWaitMin !== null
                    ? `~${status.estWaitMin} min`
                    : status.status === "serving"
                      ? "now"
                      : "—"}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase">Status</p>
                <p
                  className={cn(
                    "text-xs font-semibold",
                    status.status === "waiting" && "text-amber-600",
                    status.status === "serving" && "text-blue-600",
                    status.status === "completed" && "text-emerald-600"
                  )}
                >
                  {STATUS_LABEL[status.status]}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onOpenJourney(selected.id)}
              className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium text-primary outline-none hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              <Route className="size-3" aria-hidden />
              View full journey (bank view)
            </button>
          </div>
        </div>
      ) : (
        <p className="px-3 py-6 text-center text-xs text-muted-foreground">
          No customers yet — issue a token to see the customer view.
        </p>
      )}
    </aside>
  )
}
