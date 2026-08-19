"use client"

import {
  Activity,
  ArrowUpDown,
  Clock,
  Gauge,
  ListChecks,
  PauseCircle,
  Timer,
  UserRound,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { HBarChart, type ChartDatum, seriesColor } from "@/components/charts"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  employeeUtilization,
  filterRecords,
  holdReasonDistribution,
  overrideBreakdown,
  serviceAverages,
  stepRecords,
  type ManagerFilters,
  type StepRecord,
} from "@/lib/analytics"
import { TIME_RANGE_LABELS } from "@/lib/capacity"
import { stepProcessingMs } from "@/lib/durations"
import { formatDuration, formatTime } from "@/lib/format"
import { useQueueStore } from "@/lib/queue-store"
import { useNow } from "@/hooks/use-now"
import { cn } from "@/lib/utils"

export type ManagerKpiId =
  | "tokens-processed"
  | "active-tokens"
  | "total-processing"
  | "avg-service"
  | "utilization"
  | "holds"
  | "overrides"

const TITLES: Record<
  ManagerKpiId,
  { title: string; icon: LucideIcon; note: string }
> = {
  "tokens-processed": {
    title: "Tokens Processed",
    icon: ListChecks,
    note: "Token-level processing records behind the number. The global Data View filters apply; hold time is always separated from processing time.",
  },
  "active-tokens": {
    title: "Active Tokens",
    icon: Activity,
    note: "Customers currently in the branch — waiting, being served or on hold.",
  },
  "total-processing": {
    title: "Total Processing Time",
    icon: Clock,
    note: "Active processing distribution by employee (hold time excluded). Click an employee for their detailed token history.",
  },
  "avg-service": {
    title: "Average Service Time",
    icon: Timer,
    note: "Branch, employee and service-type averages over completed service steps. Click an employee for the underlying tokens.",
  },
  utilization: {
    title: "Branch Utilization",
    icon: Gauge,
    note: "Estimated Capacity vs actual processing per employee/counter. Capacity is a deterministic prototype assumption, not a forecast.",
  },
  holds: {
    title: "Hold & Break Activity",
    icon: PauseCircle,
    note: "Hold events, durations, reasons and employee break time. Neither holds nor breaks are ever counted as employee processing time.",
  },
  overrides: {
    title: "Recommendations & Overrides",
    icon: ArrowUpDown,
    note: "Every service starts with an explicit employee call. Acceptance = calls that followed the system recommendation; overrides are an operational metric, not a verdict, and never reorder the queue.",
  },
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

const STEP_STATUS_LABEL: Record<string, string> = {
  serving: "In service",
  "on-hold": "On hold",
  waiting: "Waiting (released)",
  completed: "Completed",
}

function RecordsTable({
  records,
  onOpenJourney,
}: {
  records: StepRecord[]
  onOpenJourney: (customerId: string) => void
}) {
  if (records.length === 0) {
    return (
      <p className="py-6 text-center text-xs text-muted-foreground">
        No records match the current filters.
      </p>
    )
  }
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b">
          <Th>Token</Th>
          <Th>Customer</Th>
          <Th>Employee</Th>
          <Th>Counter</Th>
          <Th>Service</Th>
          <Th>Started</Th>
          <Th>Completed</Th>
          <Th right>Processing</Th>
          <Th right>Hold</Th>
          <Th right>Break</Th>
          <Th>Status</Th>
        </tr>
      </thead>
      <tbody>
        {records.map((r, i) => (
          <tr
            key={`${r.customerId}-${r.startedAt}-${i}`}
            role="button"
            tabIndex={0}
            title={`Open ${r.token}'s journey`}
            onClick={() => onOpenJourney(r.customerId)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                onOpenJourney(r.customerId)
              }
            }}
            className="cursor-pointer border-b border-border/50 outline-none last:border-0 hover:bg-muted/60 focus-visible:bg-muted/60"
          >
            <Td>
              <span className="font-mono font-semibold text-primary">{r.token}</span>
            </Td>
            <Td>{r.customerName}</Td>
            <Td>{r.employeeName}</Td>
            <Td>{`Counter ${r.counterId}`}</Td>
            <Td>{r.serviceType}</Td>
            <Td>{formatTime(r.startedAt)}</Td>
            <Td>{r.completedAt ? formatTime(r.completedAt) : "—"}</Td>
            <Td right>{formatDuration(r.processingMs)}</Td>
            <Td right>{r.holdMs > 0 ? formatDuration(r.holdMs) : "—"}</Td>
            <Td right>{r.breakMs > 0 ? formatDuration(r.breakMs) : "—"}</Td>
            <Td>{STEP_STATUS_LABEL[r.status] ?? r.status}</Td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border bg-muted/40 px-3 py-2">
      <p className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <p className="text-sm font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  )
}

export function ManagerDrilldownDialog({
  kpi,
  filters,
  onClose,
  onOpenEmployee,
  onOpenJourney,
}: {
  kpi: ManagerKpiId | null
  filters: ManagerFilters
  onClose: () => void
  onOpenEmployee: (employeeName: string) => void
  onOpenJourney: (customerId: string) => void
}) {
  const state = useQueueStore((s) => s.state)
  const now = useNow(1000)

  if (!kpi) return null
  const meta = TITLES[kpi]

  const allRecords = stepRecords(state, now)
  const records = filterRecords(allRecords, filters, state, now)
  const utilization = employeeUtilization(state, now, filters)

  let body: React.ReactNode = null

  if (kpi === "tokens-processed") {
    body = <RecordsTable records={records} onOpenJourney={onOpenJourney} />
  }

  if (kpi === "active-tokens") {
    const rows = records.filter((r) => r.completedAt === null)
    const alsoWaiting = Object.values(state.customers).filter(
      (c) => c.status === "waiting"
    ).length
    body = (
      <div className="flex flex-col gap-2">
        <RecordsTable records={rows} onOpenJourney={onOpenJourney} />
        <p className="text-[11px] text-muted-foreground">
          {rows.length} token{rows.length === 1 ? "" : "s"} in active service or
          on hold · {alsoWaiting} more waiting in queues (not yet started).
        </p>
      </div>
    )
  }

  if (kpi === "total-processing") {
    const data: ChartDatum[] = utilization.map((u) => ({
      label: `${u.employeeName} · C${u.counterId}`,
      value: Math.round(u.actualProcessingMs / 1000),
      display: formatDuration(u.actualProcessingMs),
      color: seriesColor(u.counterId - 1),
    }))
    body = (
      <div className="flex flex-col gap-3">
        <HBarChart data={data} />
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b">
              <Th>Employee</Th>
              <Th>Counter</Th>
              <Th right>Tokens</Th>
              <Th right>Processing</Th>
              <Th right>Hold</Th>
              <Th right>Avg / token</Th>
            </tr>
          </thead>
          <tbody>
            {utilization.map((u) => (
              <tr
                key={u.counterId}
                role="button"
                tabIndex={0}
                title={`Open ${u.employeeName}'s detail view`}
                onClick={() => onOpenEmployee(u.employeeName)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    onOpenEmployee(u.employeeName)
                  }
                }}
                className="cursor-pointer border-b border-border/50 outline-none last:border-0 hover:bg-muted/60 focus-visible:bg-muted/60"
              >
                <Td>
                  <span className="font-medium text-primary">{u.employeeName}</span>
                </Td>
                <Td>{`Counter ${u.counterId} — ${u.counterName}`}</Td>
                <Td right>{u.tokensHandled}</Td>
                <Td right>{formatDuration(u.actualProcessingMs)}</Td>
                <Td right>{u.holdMs > 0 ? formatDuration(u.holdMs) : "—"}</Td>
                <Td right>
                  {u.tokensProcessed > 0 ? formatDuration(u.avgProcessingMs) : "—"}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  if (kpi === "avg-service") {
    const completed = records.filter((r) => r.completedAt !== null)
    const branchAvg =
      completed.length > 0
        ? completed.reduce((s, r) => s + r.processingMs, 0) / completed.length
        : 0
    const fastest =
      completed.length > 0
        ? completed.reduce((a, b) => (b.processingMs < a.processingMs ? b : a))
        : null
    const slowest =
      completed.length > 0
        ? completed.reduce((a, b) => (b.processingMs > a.processingMs ? b : a))
        : null
    const byService = serviceAverages(records)
    body = (
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-3 gap-2">
          <StatTile
            label="Branch average"
            value={completed.length > 0 ? formatDuration(branchAvg) : "—"}
            sub={`${completed.length} completed steps`}
          />
          <StatTile
            label="Fastest"
            value={fastest ? formatDuration(fastest.processingMs) : "—"}
            sub={fastest ? `${fastest.token} · ${fastest.employeeName}` : undefined}
          />
          <StatTile
            label="Slowest"
            value={slowest ? formatDuration(slowest.processingMs) : "—"}
            sub={slowest ? `${slowest.token} · ${slowest.employeeName}` : undefined}
          />
        </div>
        <div>
          <p className="mb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            By employee — click for token history
          </p>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b">
                <Th>Employee</Th>
                <Th right>Completed</Th>
                <Th right>Average</Th>
              </tr>
            </thead>
            <tbody>
              {utilization.map((u) => (
                <tr
                  key={u.counterId}
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpenEmployee(u.employeeName)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      onOpenEmployee(u.employeeName)
                    }
                  }}
                  className="cursor-pointer border-b border-border/50 outline-none last:border-0 hover:bg-muted/60 focus-visible:bg-muted/60"
                >
                  <Td>
                    <span className="font-medium text-primary">{u.employeeName}</span>
                  </Td>
                  <Td right>{u.tokensProcessed}</Td>
                  <Td right>
                    {u.tokensProcessed > 0 ? formatDuration(u.avgProcessingMs) : "—"}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <p className="mb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            By service type
          </p>
          {byService.length > 0 ? (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b">
                  <Th>Service</Th>
                  <Th right>Completed</Th>
                  <Th right>Average</Th>
                </tr>
              </thead>
              <tbody>
                {byService.map((s) => (
                  <tr key={s.serviceType} className="border-b border-border/50 last:border-0">
                    <Td>{s.serviceType}</Td>
                    <Td right>{s.completed}</Td>
                    <Td right>{formatDuration(s.avgProcessingMs)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="py-3 text-center text-xs text-muted-foreground">
              No completed steps yet.
            </p>
          )}
        </div>
      </div>
    )
  }

  if (kpi === "utilization") {
    body = (
      <div className="flex flex-col gap-2">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b">
              <Th>Employee</Th>
              <Th>Counter</Th>
              <Th right>Est. capacity</Th>
              <Th right>Actual processing</Th>
              <Th right>Utilization</Th>
              <Th right>Available</Th>
              <Th right>Current queue</Th>
            </tr>
          </thead>
          <tbody>
            {utilization.map((u) => (
              <tr
                key={u.counterId}
                role="button"
                tabIndex={0}
                title={`Open ${u.employeeName}'s detail view`}
                onClick={() => onOpenEmployee(u.employeeName)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    onOpenEmployee(u.employeeName)
                  }
                }}
                className="cursor-pointer border-b border-border/50 outline-none last:border-0 hover:bg-muted/60 focus-visible:bg-muted/60"
              >
                <Td>
                  <span className="font-medium text-primary">{u.employeeName}</span>
                </Td>
                <Td>{`Counter ${u.counterId} — ${u.counterName}`}</Td>
                <Td right>{formatDuration(u.capacityMs)}</Td>
                <Td right>{formatDuration(u.actualProcessingMs)}</Td>
                <Td right>{`${Math.round(u.utilization * 100)}%`}</Td>
                <Td right>{formatDuration(u.availableMs)}</Td>
                <Td right>{u.currentQueue}</Td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[10px] text-muted-foreground">
          Estimated Capacity ({TIME_RANGE_LABELS[filters.time]}) — deterministic
          prototype assumptions: 8h shift − 45m break; “Current Demo” uses the
          observed demo window.
        </p>
      </div>
    )
  }

  if (kpi === "holds") {
    const withHolds = records.filter((r) => r.holdEvents > 0)
    const reasons = holdReasonDistribution(records)
    const totalHoldMs = records.reduce((s, r) => s + r.holdMs, 0)
    const holdEvents = records.reduce((s, r) => s + r.holdEvents, 0)
    const currentlyHeld = state.counters.reduce((s, c) => s + c.heldIds.length, 0)
    const totalBreakMs = utilization.reduce((s, u) => s + u.breakMs, 0)
    const onBreakNow = utilization.filter((u) => u.onBreak).length
    body = (
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-3 gap-2">
          <StatTile label="Currently on hold" value={String(currentlyHeld)} />
          <StatTile label="Hold events" value={String(holdEvents)} />
          <StatTile label="Total hold time" value={formatDuration(totalHoldMs)} />
          <StatTile
            label="Avg hold time"
            value={holdEvents > 0 ? formatDuration(totalHoldMs / holdEvents) : "—"}
          />
          <StatTile
            label="Employee break time"
            value={totalBreakMs > 0 ? formatDuration(totalBreakMs) : "—"}
            sub="never counted as processing"
          />
          <StatTile label="On break now" value={String(onBreakNow)} />
        </div>
        {reasons.length > 0 && (
          <div>
            <p className="mb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              Hold reasons
            </p>
            <HBarChart
              data={reasons.map((r, i) => ({
                label: r.reason,
                value: r.count,
                color: seriesColor(i),
              }))}
            />
          </div>
        )}
        <div>
          <p className="mb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Tokens with holds
          </p>
          <RecordsTable records={withHolds} onOpenJourney={onOpenJourney} />
        </div>
      </div>
    )
  }

  if (kpi === "overrides") {
    const info = overrideBreakdown(state, now, filters)
    const pct = Math.round(info.rate * 1000) / 10
    const acceptancePct = Math.round(info.acceptanceRate * 1000) / 10
    body = (
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-4 gap-2">
          <StatTile
            label="Recommendations"
            value={String(info.recommendations)}
            sub="one consumed per call"
          />
          <StatTile
            label="Customer calls"
            value={String(info.calls)}
            sub="explicit employee actions"
          />
          <StatTile label="Override calls" value={String(info.overrides)} />
          <StatTile
            label="Acceptance rate"
            value={info.calls > 0 ? `${acceptancePct}%` : "—"}
            sub="calls following the recommendation"
          />
        </div>
        {info.rate >= 0.1 && info.overrides > 0 && (
          <p className="rounded-lg border border-sky-200 bg-sky-50/60 px-3 py-2 text-[11px] text-sky-900">
            <strong>{pct}% of calls overrode the recommendation.</strong>{" "}
            Employees are frequently deviating from system recommendations —
            worth investigating the operational context, not a misuse signal.
          </p>
        )}
        <div>
          <p className="mb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Overrides by employee
          </p>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b">
                <Th>Employee</Th>
                <Th>Counter</Th>
                <Th right>Overrides</Th>
              </tr>
            </thead>
            <tbody>
              {info.byEmployee.map((e) => (
                <tr key={e.counterId} className="border-b border-border/50 last:border-0">
                  <Td>{e.employeeName}</Td>
                  <Td>{`Counter ${e.counterId}`}</Td>
                  <Td right>{e.count}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <p className="mb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Override history — recommended vs selected
          </p>
          {info.records.length > 0 ? (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b">
                  <Th>Time</Th>
                  <Th>Employee</Th>
                  <Th>Counter</Th>
                  <Th>Recommended</Th>
                  <Th>Selected</Th>
                  <Th>Reason</Th>
                </tr>
              </thead>
              <tbody>
                {info.records.map((o) => (
                  <tr key={o.id} className="border-b border-border/50 last:border-0">
                    <Td>{formatTime(o.at)}</Td>
                    <Td>{o.employeeName}</Td>
                    <Td>{`Counter ${o.counterId}`}</Td>
                    <Td>
                      <span className="font-mono font-semibold">{o.recommendedToken}</span>{" "}
                      <span className="text-muted-foreground">{o.recommendedName}</span>
                    </Td>
                    <Td>
                      <span className="font-mono font-semibold text-primary">{o.selectedToken}</span>{" "}
                      <span className="text-muted-foreground">{o.selectedName}</span>
                    </Td>
                    <Td>{o.reason ?? "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="py-4 text-center text-xs text-muted-foreground">
              No manual overrides — every assignment followed the automated
              recommendation.
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
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

/** Employee detail — workload, utilization and full token history. */
export function EmployeeDetailDialog({
  employeeName,
  filters,
  onClose,
  onOpenJourney,
}: {
  employeeName: string | null
  filters: ManagerFilters
  onClose: () => void
  onOpenJourney: (customerId: string) => void
}) {
  const state = useQueueStore((s) => s.state)
  const now = useNow(1000)

  if (!employeeName) return null

  const counter = state.counters.find((c) => c.employeeName === employeeName)
  const utilRow = employeeUtilization(state, now, {
    ...filters,
    employee: employeeName,
  }).find((u) => u.employeeName === employeeName)
  const history = filterRecords(
    stepRecords(state, now),
    { ...filters, employee: employeeName },
    state,
    now
  )
  const servingRecord = counter?.currentCustomerId
    ? state.customers[counter.currentCustomerId]
    : null
  const servingStep = servingRecord?.journey[servingRecord.journey.length - 1]

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserRound className="size-4 text-primary" aria-hidden />
            {employeeName}
            {counter && (
              <span className="text-sm font-normal text-muted-foreground">
                — Counter {counter.id} · {counter.name}
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            Live workload, Estimated Capacity utilization and token history
            ({TIME_RANGE_LABELS[filters.time]}).
          </DialogDescription>
        </DialogHeader>

        {utilRow && (
          <div className="grid grid-cols-4 gap-2">
            <StatTile label="Tokens processed" value={String(utilRow.tokensProcessed)} sub={`${utilRow.tokensHandled} started`} />
            <StatTile label="Total processing" value={formatDuration(utilRow.actualProcessingMs)} />
            <StatTile
              label="Avg processing"
              value={utilRow.tokensProcessed > 0 ? formatDuration(utilRow.avgProcessingMs) : "—"}
            />
            <StatTile
              label="Total hold time"
              value={utilRow.holdMs > 0 ? formatDuration(utilRow.holdMs) : "—"}
              sub={`${utilRow.holdEvents} hold event${utilRow.holdEvents === 1 ? "" : "s"}`}
            />
            <StatTile
              label="Break time"
              value={utilRow.breakMs > 0 ? formatDuration(utilRow.breakMs) : "—"}
              sub={utilRow.onBreak ? "on break now" : "excluded from processing"}
            />
            <StatTile
              label="Current queue"
              value={String(utilRow.currentQueue)}
              sub={utilRow.currentlyHeld > 0 ? `+ ${utilRow.currentlyHeld} on hold` : undefined}
            />
            <StatTile
              label="Workload now"
              value={
                servingRecord && servingStep
                  ? `Serving ${servingRecord.token}`
                  : "Available"
              }
              sub={
                servingStep
                  ? formatDuration(stepProcessingMs(servingStep, now))
                  : undefined
              }
            />
            <StatTile
              label="Utilization"
              value={`${Math.round(utilRow.utilization * 100)}%`}
              sub="of Estimated Capacity"
            />
            <StatTile label="Available capacity" value={formatDuration(utilRow.availableMs)} />
          </div>
        )}

        <div>
          <p className="mb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Token history — click a row for the journey
          </p>
          <RecordsTable records={history} onOpenJourney={onOpenJourney} />
        </div>
      </DialogContent>
    </Dialog>
  )
}
