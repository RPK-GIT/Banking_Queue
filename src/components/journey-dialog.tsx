"use client"

import { Check, CircleDashed, Flag, MapPin } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { StatusBadge } from "@/components/status-badge"
import { formatTime } from "@/lib/format"
import { counterName } from "@/lib/queue-logic"
import { useQueueStore } from "@/lib/queue-store"
import type { Customer } from "@/lib/types"
import { cn } from "@/lib/utils"

interface JourneyDialogProps {
  customerId: string | null
  onClose: () => void
}

type NodeState = "done" | "current" | "upcoming"

interface JourneyNode {
  key: string
  label: string
  sublabel?: string
  state: NodeState
}

function buildNodes(customer: Customer): JourneyNode[] {
  const nodes: JourneyNode[] = [
    { key: "start", label: "START", state: "done" },
  ]
  customer.journey.forEach((step, i) => {
    nodes.push({
      key: `step-${i}`,
      label: `Counter ${step.counterId}`,
      sublabel: step.counterName,
      state: step.status === "completed" ? "done" : "current",
    })
  })
  customer.plannedRoute.forEach((counterId, i) => {
    nodes.push({
      key: `planned-${i}`,
      label: `Counter ${counterId}`,
      sublabel: counterName(counterId),
      state: "upcoming",
    })
  })
  nodes.push({
    key: "end",
    label: "Completed",
    state: customer.status === "completed" ? "done" : "upcoming",
  })
  return nodes
}

interface TimelineEvent {
  at: number
  text: string
}

function buildTimeline(customer: Customer): TimelineEvent[] {
  const events: TimelineEvent[] = [
    { at: customer.createdAt, text: "Token issued" },
  ]
  customer.journey.forEach((step, i) => {
    if (i > 0) {
      events.push({
        at: step.enteredAt,
        text: `Transferred to Counter ${step.counterId}`,
      })
    }
    if (step.startedAt) {
      events.push({ at: step.startedAt, text: `Counter ${step.counterId} started` })
    }
    for (const hold of step.holds) {
      events.push({
        at: hold.startedAt,
        text: `Put on hold at Counter ${step.counterId} — ${hold.reason}`,
      })
      if (hold.releasedAt) {
        events.push({
          at: hold.releasedAt,
          text: `Hold released — next after current at Counter ${step.counterId}`,
        })
      }
      if (hold.resumedAt) {
        events.push({
          at: hold.resumedAt,
          text: `Service resumed at Counter ${step.counterId}`,
        })
      }
    }
    if (step.completedAt) {
      events.push({
        at: step.completedAt,
        text: `Counter ${step.counterId} completed`,
      })
    }
  })
  if (customer.completedAt) {
    events.push({ at: customer.completedAt, text: "Journey completed" })
  }
  return events
}

function statusLine(customer: Customer): string {
  if (customer.status === "completed") return "Journey completed"
  if (customer.status === "serving")
    return `Being served at Counter ${customer.currentCounterId}`
  if (customer.status === "on-hold")
    return `On hold at Counter ${customer.currentCounterId}`
  return `Waiting at Counter ${customer.currentCounterId}`
}

export function JourneyDialog({ customerId, onClose }: JourneyDialogProps) {
  const customer = useQueueStore((s) =>
    customerId ? s.state.customers[customerId] : undefined
  )

  return (
    <Dialog open={Boolean(customer)} onOpenChange={(open) => !open && onClose()}>
      {customer && (
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <div className="flex items-start justify-between gap-3 pr-8">
              <div>
                <DialogTitle className="font-mono text-xl font-bold text-primary">
                  {customer.token}
                </DialogTitle>
                <p className="mt-1 text-base font-semibold">{customer.name}</p>
              </div>
              <StatusBadge status={customer.status} className="mt-1" />
            </div>
            <DialogDescription className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span>
                Service:{" "}
                <span className="font-medium text-foreground">
                  {customer.serviceType}
                </span>
              </span>
              <span className="flex items-center gap-1">
                <MapPin className="size-3.5" aria-hidden />
                {statusLine(customer)}
              </span>
            </DialogDescription>
          </DialogHeader>

          {/* Visual journey */}
          <div>
            <p className="mb-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              Customer journey
            </p>
            <ol className="flex flex-col">
              {buildNodes(customer).map((node, i, nodes) => (
                <li key={node.key} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span
                      className={cn(
                        "flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px]",
                        node.state === "done" &&
                          "border-emerald-500 bg-emerald-500 text-white",
                        node.state === "current" &&
                          "border-blue-500 bg-blue-500 text-white",
                        node.state === "upcoming" &&
                          "border-border bg-background text-muted-foreground"
                      )}
                      aria-hidden
                    >
                      {node.state === "done" ? (
                        <Check className="size-3.5" strokeWidth={3} />
                      ) : node.state === "current" ? (
                        <span className="relative flex size-2">
                          <span className="absolute inline-flex size-full animate-ping rounded-full bg-white/80" />
                          <span className="relative inline-flex size-2 rounded-full bg-white" />
                        </span>
                      ) : node.key === "end" ? (
                        <Flag className="size-3" />
                      ) : (
                        <CircleDashed className="size-3.5" />
                      )}
                    </span>
                    {i < nodes.length - 1 && (
                      <span
                        className={cn(
                          "my-0.5 w-px flex-1 min-h-4",
                          node.state === "done" ? "bg-emerald-300" : "bg-border"
                        )}
                        aria-hidden
                      />
                    )}
                  </div>
                  <div className="pb-3">
                    <p
                      className={cn(
                        "text-sm leading-6 font-medium",
                        node.state === "current" && "text-blue-700",
                        node.state === "upcoming" && "text-muted-foreground"
                      )}
                    >
                      {node.label}
                      {node.state === "current" && (
                        <span className="ml-2 rounded-full bg-blue-100 px-1.5 py-px text-[10px] font-semibold text-blue-700">
                          current
                        </span>
                      )}
                    </p>
                    {node.sublabel && (
                      <p className="text-xs text-muted-foreground">
                        {node.sublabel}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <Separator />

          {/* Audit trail */}
          <div>
            <p className="mb-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              Audit trail
            </p>
            <ul className="flex flex-col gap-1.5">
              {buildTimeline(customer).map((event, i) => (
                <li key={i} className="flex items-baseline gap-3 text-sm">
                  <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                    {formatTime(event.at)}
                  </span>
                  <span>{event.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </DialogContent>
      )}
    </Dialog>
  )
}
