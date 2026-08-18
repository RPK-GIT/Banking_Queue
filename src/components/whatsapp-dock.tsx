"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import {
  ChevronDown,
  GripHorizontal,
  Maximize2,
  MessageCircle,
  Minimize2,
  Route,
  X,
} from "lucide-react"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { formatTime } from "@/lib/format"
import { useQueueStore } from "@/lib/queue-store"
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

type DockView = "closed" | "selector" | "phone"

/**
 * Customer Lens — the customer's simulated WhatsApp view of the SAME queue
 * state the dashboard shows. Floating, always interactive (also while the
 * demo engine is paused), everything derived from state.
 */
export function WhatsAppDock({
  onOpenJourney,
}: {
  onOpenJourney: (customerId: string) => void
}) {
  const state = useQueueStore((s) => s.state)
  const [view, setView] = useState<DockView>("closed")
  const [expanded, setExpanded] = useState(false)
  const [showCompleted, setShowCompleted] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const sorted = useMemo(
    () =>
      Object.values(state.customers).sort(
        (a, b) => tokenNumber(a) - tokenNumber(b)
      ),
    [state.customers]
  )
  const active = sorted.filter((c) => c.status !== "completed")
  const completed = sorted.filter((c) => c.status === "completed")

  // heal a stale selection (e.g. after Clear All / Restart)
  const selected = (selectedId && state.customers[selectedId]) || null
  const messages = selected ? buildWhatsAppMessages(selected) : []
  const status = selected ? customerLiveStatus(state, selected.id) : null

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length, selected?.id, view, expanded])

  function openPhone(customerId: string) {
    setSelectedId(customerId)
    setView("phone")
  }

  function selectorLine(customer: Customer): string {
    const s = customerLiveStatus(state, customer.id)
    if (s.status === "completed") return `${customer.token} · Completed`
    const where = `Counter ${s.counterId}`
    return s.position !== null
      ? `${customer.token} · ${where} · #${s.position}`
      : `${customer.token} · ${where} · being served`
  }

  const dragConstraints =
    typeof window !== "undefined"
      ? {
          left: -(window.innerWidth - (expanded ? 420 : 370)),
          right: 0,
          top: -(window.innerHeight - (expanded ? 720 : 620)),
          bottom: 0,
        }
      : undefined

  return (
    <div className="fixed right-4 bottom-4 z-50 flex flex-col items-end gap-2">
      <AnimatePresence>
        {/* customer selector */}
        {view === "selector" && (
          <motion.div
            key="selector"
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="flex max-h-[60vh] w-72 flex-col overflow-hidden rounded-xl border bg-card shadow-xl"
            role="dialog"
            aria-label="Customer WhatsApp selector"
          >
            <div className="border-b px-3 py-2">
              <p className="text-xs font-semibold tracking-wide uppercase">
                Customer WhatsApp
              </p>
              <p className="text-[10px] text-muted-foreground">
                Customer View · Simulated — pick a phone to inspect
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
              {active.map((customer) => {
                const s = customerLiveStatus(state, customer.id)
                return (
                  <button
                    key={customer.id}
                    type="button"
                    onClick={() => openPhone(customer.id)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60"
                  >
                    <span
                      className={cn(
                        "size-2 shrink-0 rounded-full",
                        s.status === "serving" ? "bg-blue-500" : "bg-amber-400"
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium">
                        {customer.name}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {selectorLine(customer)}
                      </span>
                    </span>
                  </button>
                )
              })}
              {active.length === 0 && (
                <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                  No active customers right now.
                </p>
              )}
              {completed.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowCompleted((s) => !s)}
                    className="mt-1 flex w-full items-center justify-center gap-1 rounded-lg border border-dashed px-2 py-1 text-[11px] text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60"
                  >
                    <ChevronDown
                      className={cn(
                        "size-3 transition-transform",
                        showCompleted && "rotate-180"
                      )}
                      aria-hidden
                    />
                    {showCompleted
                      ? "Hide completed"
                      : `${completed.length} completed`}
                  </button>
                  {showCompleted &&
                    completed.map((customer) => (
                      <button
                        key={customer.id}
                        type="button"
                        onClick={() => openPhone(customer.id)}
                        className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60"
                      >
                        <span
                          className="size-2 shrink-0 rounded-full bg-emerald-500"
                          aria-hidden
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-medium">
                            {customer.name}
                          </span>
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {selectorLine(customer)}
                          </span>
                        </span>
                      </button>
                    ))}
                </>
              )}
            </div>
          </motion.div>
        )}

        {/* floating phone */}
        {view === "phone" && selected && status && (
          <motion.div
            key="phone"
            drag
            dragConstraints={dragConstraints}
            dragMomentum={false}
            dragElastic={0.05}
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ duration: 0.18 }}
            className={cn(
              "flex flex-col overflow-hidden rounded-2xl border bg-card shadow-xl",
              expanded
                ? "h-[660px] max-h-[calc(100vh-6.5rem)] w-[380px]"
                : "h-[560px] max-h-[calc(100vh-6.5rem)] w-[330px]"
            )}
            role="dialog"
            aria-label={`WhatsApp view for ${selected.name}`}
          >
            {/* lens label + drag handle */}
            <div className="flex cursor-grab items-center justify-center gap-1.5 bg-[#054d44] py-1 text-[9px] font-semibold tracking-widest text-white/70 uppercase active:cursor-grabbing">
              <GripHorizontal className="size-3" aria-hidden />
              Customer View · Simulated
            </div>
            {/* phone header */}
            <div className="flex items-center gap-2 bg-[#075e54] px-3 py-2 text-white">
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
              <button
                type="button"
                onClick={() => setExpanded((e) => !e)}
                aria-label={expanded ? "Collapse window" : "Expand window"}
                className="rounded-md p-1.5 outline-none hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white/60"
              >
                {expanded ? (
                  <Minimize2 className="size-4" aria-hidden />
                ) : (
                  <Maximize2 className="size-4" aria-hidden />
                )}
              </button>
              <button
                type="button"
                onClick={() => setView("closed")}
                aria-label="Close WhatsApp window"
                className="rounded-md p-1.5 outline-none hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white/60"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>

            {/* customer switcher */}
            <div className="border-b bg-muted/40 px-2 py-1.5">
              <Select
                value={selected.id}
                onValueChange={(v) => setSelectedId(String(v))}
              >
                <SelectTrigger
                  size="sm"
                  className="w-full border-none bg-transparent shadow-none"
                  aria-label="Switch customer"
                >
                  <SelectValue>
                    {() => (
                      <span className="text-xs">
                        Viewing phone of{" "}
                        <span className="font-semibold">
                          {selected.token} — {selected.name}
                        </span>
                      </span>
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {sorted.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.token} — {c.name} ({STATUS_LABEL[c.status]})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* conversation */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto bg-[#efeae2] px-3 py-3"
            >
              <div className="flex flex-col gap-2">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className="max-w-[85%] rounded-lg rounded-tl-none bg-white px-2.5 py-1.5 shadow-sm"
                  >
                    <p className="text-[12.5px] leading-snug whitespace-pre-line">
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
            <div className="border-t bg-card px-3 py-2">
              <div className="grid grid-cols-4 gap-2 text-center">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase">
                    Queue
                  </p>
                  <p className="truncate text-xs font-semibold">
                    {status.counterName ?? "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase">
                    Position
                  </p>
                  <p className="text-xs font-semibold tabular-nums">
                    {status.position !== null ? `#${status.position}` : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase">
                    Est. wait
                  </p>
                  <p className="text-xs font-semibold tabular-nums">
                    {status.estWaitMin !== null
                      ? `~${status.estWaitMin} min`
                      : status.status === "serving"
                        ? "now"
                        : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase">
                    Status
                  </p>
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
          </motion.div>
        )}
      </AnimatePresence>

      {/* launcher */}
      <button
        type="button"
        onClick={() => setView((v) => (v === "closed" ? "selector" : "closed"))}
        aria-label={
          view === "closed" ? "Open Customer View" : "Close Customer View"
        }
        className="flex items-center gap-2 rounded-full bg-[#25d366] py-2.5 pr-4 pl-3 text-sm font-semibold text-white shadow-lg outline-none transition-transform hover:scale-[1.03] focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        {view === "closed" ? (
          <MessageCircle className="size-5" aria-hidden />
        ) : (
          <ChevronDown className="size-5" aria-hidden />
        )}
        Customer View
      </button>
    </div>
  )
}
