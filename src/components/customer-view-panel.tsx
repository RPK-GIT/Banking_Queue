"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  CheckCheck,
  MessageCircle,
  PanelRightOpen,
  PauseCircle,
  Route,
  Zap,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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

/**
 * Customer View — the right pane IS the customer's phone. A compact dropdown
 * picks the customer; the simulated WhatsApp experience fills the rest of the
 * pane (~85–90%). Fully interactive while the demo engine is paused.
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

  const statusLabel =
    status === null
      ? ""
      : status.status === "on-hold"
        ? "On Hold"
        : status.paused
          ? "Service Temporarily Paused"
          : status.priority
            ? "Priority — Next After Current"
            : status.status === "serving"
              ? "Being served"
              : status.status === "completed"
                ? "Completed"
                : "Waiting"

  return (
    <aside
      aria-label="Customer view"
      className="flex w-[330px] shrink-0 flex-col border-l bg-card min-[1600px]:w-[380px]"
    >
      {/* pane header + compact customer selector */}
      <div className="flex shrink-0 flex-col gap-1.5 border-b px-3 py-2">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <MessageCircle className="size-4 text-[#25d366]" aria-hidden />
            Customer View
          </h2>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Collapse customer view"
            onClick={onToggleCollapsed}
          >
            <PanelRightOpen aria-hidden />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-[11px] text-muted-foreground">
            Customer
          </span>
          <Select
            value={selected?.id ?? ""}
            onValueChange={(v) => v && setSelectedId(v as string)}
          >
            <SelectTrigger
              size="sm"
              aria-label="Select customer"
              className="w-full min-w-0 flex-1 text-xs"
            >
              <SelectValue>
                {() =>
                  selected ? (
                    <span className="truncate">
                      {selected.name} — {selected.token}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">No customers</span>
                  )
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectGroup>
                <SelectLabel>Active customers</SelectLabel>
                {active.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} — {c.token}
                  </SelectItem>
                ))}
              </SelectGroup>
              {completed.length > 0 && (
                <SelectGroup>
                  <SelectLabel>Completed</SelectLabel>
                  {completed.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} — {c.token} ✓
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* THE PHONE — the WhatsApp simulation fills the rest of the pane */}
      {selected && status ? (
        <div className="flex min-h-0 flex-1 flex-col" data-testid="wa-phone">
          <p className="shrink-0 bg-muted/60 py-0.5 text-center text-[8px] font-semibold tracking-[0.2em] text-muted-foreground/80 uppercase">
            Simulated customer view
          </p>

          {/* WhatsApp header */}
          <div className="flex shrink-0 items-center gap-2 bg-[#075e54] px-3 py-2 text-white">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/20 text-xs font-bold">
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
              <p className="truncate text-[11px] leading-tight text-white/80">
                {selected.token} · SBI Demo Branch · online
              </p>
            </div>
          </div>

          {/* conversation */}
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
                  <p className="mt-0.5 flex items-center justify-end gap-1 text-right text-[10px] text-muted-foreground">
                    {formatTime(message.at)}
                    <CheckCheck className="size-3 text-[#53bdeb]" aria-hidden />
                  </p>
                </div>
              ))}
            </div>

            {/* live status card — pinned as the latest "message" */}
            <div className="mt-2 max-w-[90%] rounded-lg rounded-tl-none bg-white px-2.5 py-2 shadow-sm ring-1 ring-[#25d366]/40">
              <p className="text-[10px] font-semibold tracking-wide text-[#075e54] uppercase">
                Live status
              </p>
              <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                <span className="text-muted-foreground">Token</span>
                <span className="text-right font-mono font-semibold">
                  {selected.token}
                </span>
                <span className="text-muted-foreground">Queue</span>
                <span className="truncate text-right font-medium">
                  {status.counterName ?? "—"}
                </span>
                <span className="text-muted-foreground">Counter</span>
                <span className="text-right font-medium">
                  {status.counterId !== null ? `Counter ${status.counterId}` : "—"}
                </span>
                <span className="text-muted-foreground">Position</span>
                <span className="text-right font-medium tabular-nums">
                  {status.status === "on-hold"
                    ? "—"
                    : status.priority
                      ? "Next"
                      : status.position === 1
                        ? "#1 — you're next"
                        : status.position !== null
                          ? `#${status.position}`
                          : "—"}
                </span>
                <span className="text-muted-foreground">Est. wait</span>
                <span className="text-right font-medium tabular-nums">
                  {status.status === "on-hold"
                    ? "on hold"
                    : status.paused
                      ? "resuming soon"
                      : status.estWaitMin !== null
                        ? `~${status.estWaitMin} min`
                        : status.status === "serving"
                          ? "now"
                          : "—"}
                </span>
                <span className="text-muted-foreground">Status</span>
                <span
                  className={cn(
                    "flex items-center justify-end gap-1 text-right font-semibold",
                    status.status === "waiting" && !status.priority && "text-amber-600",
                    status.priority && "text-violet-600",
                    status.status === "serving" && !status.paused && "text-blue-600",
                    status.paused && "text-rose-600",
                    status.status === "on-hold" && "text-orange-600",
                    status.status === "completed" && "text-emerald-600"
                  )}
                >
                  {(status.status === "on-hold" || status.paused) && (
                    <PauseCircle className="size-3" aria-hidden />
                  )}
                  {status.priority && <Zap className="size-3" aria-hidden />}
                  {statusLabel}
                </span>
                {status.holdReason && (
                  <>
                    <span className="text-muted-foreground">Reason</span>
                    <span className="truncate text-right font-medium">
                      {status.holdReason}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* footer — bank-side shortcut */}
          <div className="shrink-0 border-t bg-card px-3 py-1.5">
            <button
              type="button"
              onClick={() => onOpenJourney(selected.id)}
              className="flex w-full items-center justify-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium text-primary outline-none hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring/60"
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
