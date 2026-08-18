"use client"

import {
  CheckCircle2,
  Hourglass,
  Timer,
  UserCheck,
  Users,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  avgWaitBreakdown,
  completedRows,
  customersInBranchRows,
  servingRows,
  waitingRows,
  type ActiveCustomerRow,
} from "@/lib/drilldown"
import { formatDuration, formatTime } from "@/lib/format"
import { useQueueStore } from "@/lib/queue-store"
import { useNow } from "@/hooks/use-now"
import { cn } from "@/lib/utils"

export type MainKpiId =
  | "in-branch"
  | "waiting"
  | "serving"
  | "completed"
  | "avg-wait"

const TITLES: Record<MainKpiId, { title: string; icon: LucideIcon; note: string }> = {
  "in-branch": {
    title: "Customers in Branch",
    icon: Users,
    note: "Every active customer right now — waiting, being served or on hold. Click a customer to open their journey.",
  },
  waiting: {
    title: "Waiting",
    icon: Hourglass,
    note: "Customers currently in a queue, grouped by counter. Priority rows are released holds — next after the current customer.",
  },
  serving: {
    title: "Being Served",
    icon: UserCheck,
    note: "Active service right now. Processing time ticks live and never includes hold time.",
  },
  completed: {
    title: "Completed",
    icon: CheckCircle2,
    note: "Finished journeys with the full time split: journey vs active processing vs hold. Click a token for the audit trail.",
  },
  "avg-wait": {
    title: "Average Wait",
    icon: Timer,
    note: "The exact records behind the KPI — time in branch (token issued → now) for every active customer.",
  },
}

const STATUS_LABEL: Record<string, string> = {
  waiting: "Waiting",
  serving: "Being served",
  "on-hold": "On hold",
  completed: "Completed",
}

function StatusChip({ status, priority }: { status: string; priority?: boolean }) {
  if (priority) {
    return (
      <span className="inline-flex rounded-full bg-violet-100 px-1.5 py-px text-[10px] font-semibold text-violet-700">
        Priority — next
      </span>
    )
  }
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-1.5 py-px text-[10px] font-semibold",
        status === "waiting" && "bg-amber-100 text-amber-800",
        status === "serving" && "bg-blue-100 text-blue-700",
        status === "on-hold" && "bg-orange-100 text-orange-700",
        status === "completed" && "bg-emerald-100 text-emerald-700"
      )}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  )
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th
      scope="col"
      className={cn(
        "sticky top-0 bg-popover py-1.5 pr-3 text-left font-medium text-muted-foreground",
        right && "text-right"
      )}
    >
      {children}
    </th>
  )
}

function Td({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <td className={cn("py-1.5 pr-3", right && "text-right tabular-nums")}>
      {children}
    </td>
  )
}

function ClickableRow({
  onClick,
  children,
  label,
}: {
  onClick: () => void
  children: React.ReactNode
  label: string
}) {
  return (
    <tr
      role="button"
      tabIndex={0}
      title={label}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onClick()
        }
      }}
      className="cursor-pointer border-b border-border/50 outline-none last:border-0 hover:bg-muted/60 focus-visible:bg-muted/60"
    >
      {children}
    </tr>
  )
}

function positionLabel(row: ActiveCustomerRow): string {
  if (row.status === "serving") return "Serving"
  if (row.status === "on-hold") return "On hold"
  if (row.priority) return "Next after current"
  return row.position !== null ? `#${row.position}` : "—"
}

export function KpiDrilldownDialog({
  kpi,
  onClose,
  onOpenJourney,
}: {
  kpi: MainKpiId | null
  onClose: () => void
  onOpenJourney: (customerId: string) => void
}) {
  const state = useQueueStore((s) => s.state)
  const now = useNow(1000)

  if (!kpi) return null
  const meta = TITLES[kpi]

  function open(customerId: string) {
    onOpenJourney(customerId)
  }

  let body: React.ReactNode = null

  if (kpi === "in-branch") {
    const rows = customersInBranchRows(state, now)
    body = (
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b">
            <Th>Token</Th>
            <Th>Customer</Th>
            <Th>Service</Th>
            <Th>Counter</Th>
            <Th>Status</Th>
            <Th>Position</Th>
            <Th right>Waiting</Th>
            <Th right>Est. wait</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <ClickableRow key={r.customerId} onClick={() => open(r.customerId)} label={`Open ${r.token}'s journey`}>
              <Td><span className="font-mono font-semibold text-primary">{r.token}</span></Td>
              <Td>{r.name}</Td>
              <Td>{r.serviceType}</Td>
              <Td>{r.counterId !== null ? `Counter ${r.counterId}` : "—"}</Td>
              <Td><StatusChip status={r.status} priority={r.priority} /></Td>
              <Td>{positionLabel(r)}</Td>
              <Td right>{formatDuration(r.waitingMs)}</Td>
              <Td right>{r.estWaitMin !== null ? `~${r.estWaitMin} min` : "—"}</Td>
            </ClickableRow>
          ))}
        </tbody>
      </table>
    )
    if (rows.length === 0)
      body = <p className="py-6 text-center text-xs text-muted-foreground">No active customers in the branch.</p>
  }

  if (kpi === "waiting") {
    const rows = waitingRows(state, now)
    body = (
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b">
            <Th>Token</Th>
            <Th>Customer</Th>
            <Th>Service</Th>
            <Th>Counter</Th>
            <Th>Position</Th>
            <Th right>Waiting</Th>
            <Th right>Est. wait</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <ClickableRow key={r.customerId} onClick={() => open(r.customerId)} label={`Open ${r.token}'s journey`}>
              <Td><span className="font-mono font-semibold text-primary">{r.token}</span></Td>
              <Td>{r.name}</Td>
              <Td>{r.serviceType}</Td>
              <Td>{`Counter ${r.counterId}`}</Td>
              <Td>
                {r.priority ? <StatusChip status={r.status} priority /> : positionLabel(r)}
              </Td>
              <Td right>{formatDuration(r.waitingMs)}</Td>
              <Td right>{r.estWaitMin !== null ? `~${r.estWaitMin} min` : "—"}</Td>
            </ClickableRow>
          ))}
        </tbody>
      </table>
    )
    if (rows.length === 0)
      body = <p className="py-6 text-center text-xs text-muted-foreground">Nobody is waiting right now.</p>
  }

  if (kpi === "serving") {
    const rows = servingRows(state, now)
    body = (
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b">
            <Th>Token</Th>
            <Th>Customer</Th>
            <Th>Employee</Th>
            <Th>Counter</Th>
            <Th>Service</Th>
            <Th>Started at</Th>
            <Th right>Processing</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <ClickableRow key={r.customerId} onClick={() => open(r.customerId)} label={`Open ${r.token}'s journey`}>
              <Td><span className="font-mono font-semibold text-primary">{r.token}</span></Td>
              <Td>{r.name}</Td>
              <Td>{r.employeeName}</Td>
              <Td>{`Counter ${r.counterId}`}</Td>
              <Td>{r.serviceType}</Td>
              <Td>{formatTime(r.startedAt)}</Td>
              <Td right>{formatDuration(r.processingMs)}</Td>
            </ClickableRow>
          ))}
        </tbody>
      </table>
    )
    if (rows.length === 0)
      body = <p className="py-6 text-center text-xs text-muted-foreground">No customer is being served right now.</p>
  }

  if (kpi === "completed") {
    const rows = completedRows(state, now)
    body = (
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b">
            <Th>Token</Th>
            <Th>Customer</Th>
            <Th>Service</Th>
            <Th>Counters visited</Th>
            <Th right>Journey</Th>
            <Th right>Processing</Th>
            <Th right>Hold</Th>
            <Th right>Completed at</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <ClickableRow key={r.customerId} onClick={() => open(r.customerId)} label={`Open ${r.token}'s journey`}>
              <Td><span className="font-mono font-semibold text-primary">{r.token}</span></Td>
              <Td>{r.name}</Td>
              <Td>{r.serviceType}</Td>
              <Td>{r.countersVisited.map((c) => `C${c}`).join(" → ")}</Td>
              <Td right>{formatDuration(r.journeyMs)}</Td>
              <Td right>{formatDuration(r.processingMs)}</Td>
              <Td right>{r.holdMs > 0 ? formatDuration(r.holdMs) : "—"}</Td>
              <Td right>{formatTime(r.completedAt)}</Td>
            </ClickableRow>
          ))}
        </tbody>
      </table>
    )
    if (rows.length === 0)
      body = <p className="py-6 text-center text-xs text-muted-foreground">No journeys completed yet.</p>
  }

  if (kpi === "avg-wait") {
    const breakdown = avgWaitBreakdown(state, now)
    body = (
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ["Average", breakdown.avgMs],
              ["Minimum", breakdown.minMs],
              ["Maximum", breakdown.maxMs],
            ] as const
          ).map(([label, ms]) => (
            <div key={label} className="rounded-lg border bg-muted/40 px-3 py-2 text-center">
              <p className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                {label}
              </p>
              <p className="text-sm font-semibold tabular-nums">
                {breakdown.rows.length > 0 ? formatDuration(ms) : "—"}
              </p>
            </div>
          ))}
        </div>
        {breakdown.rows.length > 0 ? (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b">
                <Th>Token</Th>
                <Th>Customer</Th>
                <Th>Counter</Th>
                <Th>Service</Th>
                <Th>Status</Th>
                <Th right>Wait time</Th>
              </tr>
            </thead>
            <tbody>
              {breakdown.rows.map((r) => (
                <ClickableRow key={r.customerId} onClick={() => open(r.customerId)} label={`Open ${r.token}'s journey`}>
                  <Td><span className="font-mono font-semibold text-primary">{r.token}</span></Td>
                  <Td>{r.name}</Td>
                  <Td>{r.counterId !== null ? `Counter ${r.counterId}` : "—"}</Td>
                  <Td>{r.serviceType}</Td>
                  <Td><StatusChip status={r.status} /></Td>
                  <Td right>{formatDuration(r.waitMs)}</Td>
                </ClickableRow>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="py-4 text-center text-xs text-muted-foreground">
            No active customers — the KPI shows “—”.
          </p>
        )}
      </div>
    )
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <meta.icon className="size-4 text-primary" aria-hidden />
            {meta.title}
            <span className="ml-1 rounded-full bg-muted px-2 py-px text-[10px] font-medium text-muted-foreground">
              read-only
            </span>
          </DialogTitle>
          <DialogDescription>{meta.note}</DialogDescription>
        </DialogHeader>
        <div className="min-h-24">{body}</div>
      </DialogContent>
    </Dialog>
  )
}
