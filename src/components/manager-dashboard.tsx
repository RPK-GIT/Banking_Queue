"use client"

import { useState } from "react"
import {
  Activity,
  ArrowUpDown,
  ChartBar,
  Clock,
  FilterX,
  Gauge,
  ListChecks,
  PauseCircle,
  Timer,
  UserRound,
  ZoomIn,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

import {
  ChartDatum,
  DataTable,
  GroupedBarChart,
  HBarChart,
  RoundChart,
  seriesColor,
  TableColumn,
  VBarChart,
} from "@/components/charts"
import {
  EmployeeDetailDialog,
  ManagerDrilldownDialog,
  type ManagerKpiId,
} from "@/components/manager-drilldown"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DEFAULT_FILTERS,
  employeeUtilization,
  isFiltered,
  managerKpis,
  type ManagerFilters,
} from "@/lib/analytics"
import { TIME_RANGE_LABELS, type TimeRange } from "@/lib/capacity"
import { formatDuration } from "@/lib/format"
import { COUNTER_DEFS } from "@/lib/queue-logic"
import { useQueueStore } from "@/lib/queue-store"
import { useNow } from "@/hooks/use-now"
import { SERVICE_TYPES, type ServiceType } from "@/lib/types"
import { getVizPref, saveVizPref, type VizType } from "@/lib/viz-prefs"
import { cn } from "@/lib/utils"

const VIZ_LABELS: Record<VizType, string> = {
  "h-bar": "Horizontal Bar",
  "v-bar": "Vertical Bar",
  "grouped-bar": "Grouped Bar",
  donut: "Donut",
  pie: "Pie",
  table: "Table",
}

type DataView = "actual" | "capacity" | "both"

const DATA_VIEW_LABELS: Record<DataView, string> = {
  actual: "Actual",
  capacity: "Capacity",
  both: "Actual vs Capacity",
}

/** remembers the chosen representation per chart (localStorage) */
function useViz(chartId: string, fallback: VizType) {
  const [viz, setViz] = useState<VizType>(() => getVizPref(chartId, fallback))
  const change = (next: VizType) => {
    setViz(next)
    saveVizPref(chartId, next)
  }
  return [viz, change] as const
}

function VizCard({
  title,
  chartId,
  defaultViz,
  options,
  action,
  render,
}: {
  title: string
  chartId: string
  defaultViz: VizType
  /** only representations that make sense for this metric */
  options: VizType[]
  action?: React.ReactNode
  render: (viz: VizType) => React.ReactNode
}) {
  const [viz, setViz] = useViz(chartId, defaultViz)
  return (
    <Card className="gap-2.5 p-3.5 shadow-xs">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold tracking-wide uppercase">
          {title}
        </h3>
        <div className="flex items-center gap-1">
          {action}
          <Select value={viz} onValueChange={(v) => setViz(v as VizType)}>
            <SelectTrigger
              size="sm"
              aria-label={`${title} — change visualization`}
              className="h-6! gap-1 border-none bg-transparent px-1.5 text-[11px] text-muted-foreground shadow-none"
            >
              <ChartBar className="size-3" aria-hidden />
              <SelectValue>
                {() => <span>{VIZ_LABELS[viz]}</span>}
              </SelectValue>
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false} align="end">
              {options.map((option) => (
                <SelectItem key={option} value={option}>
                  {VIZ_LABELS[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="min-h-32">{render(viz)}</div>
    </Card>
  )
}

interface KpiTile {
  id: ManagerKpiId | "most-loaded"
  label: string
  value: string
  sub?: string
  icon: LucideIcon
}

export function ManagerDashboard({
  onOpenJourney,
}: {
  onOpenJourney: (customerId: string) => void
}) {
  const state = useQueueStore((s) => s.state)
  const now = useNow(1000)
  const [dataView, setDataView] = useState<DataView>("both")
  const [filters, setFilters] = useState<ManagerFilters>(DEFAULT_FILTERS)
  const [drilldown, setDrilldown] = useState<ManagerKpiId | null>(null)
  const [employeeDetail, setEmployeeDetail] = useState<string | null>(null)

  const utilization = employeeUtilization(state, now, filters)
  const kpis = managerKpis(state, now, filters)

  const setFilter = <K extends keyof ManagerFilters>(
    key: K,
    value: ManagerFilters[K]
  ) => setFilters((f) => ({ ...f, [key]: value }))

  // ---- chart data (all filtered, colors fixed per counter entity) ----
  const workloadData: ChartDatum[] = utilization.map((u) => ({
    label: `${u.employeeName} · C${u.counterId}`,
    value: u.tokensHandled,
    color: seriesColor(u.counterId - 1),
  }))
  const activeTokensData: ChartDatum[] = utilization.map((u) => ({
    label: `Counter ${u.counterId}`,
    value: u.currentQueue + (u.serving ? 1 : 0) + u.currentlyHeld,
    color: seriesColor(u.counterId - 1),
  }))
  const processingData: ChartDatum[] = utilization.map((u) => ({
    label: `Counter ${u.counterId}`,
    value: Math.round(
      (dataView === "capacity" ? u.capacityMs : u.actualProcessingMs) / 1000
    ),
    display: formatDuration(
      dataView === "capacity" ? u.capacityMs : u.actualProcessingMs
    ),
    color: seriesColor(u.counterId - 1),
  }))
  const pressureData: ChartDatum[] = utilization.map((u) => ({
    label: `Counter ${u.counterId}`,
    value: u.currentQueue,
    color: seriesColor(u.counterId - 1),
  }))

  // service types keep a FIXED slot by catalog order, never by rank
  const filteredCustomers = Object.values(state.customers).filter(
    (c) =>
      (filters.service === "all" || c.serviceType === filters.service) &&
      (filters.counter === "all" ||
        c.currentCounterId === filters.counter ||
        c.journey.some((s) => s.counterId === filters.counter))
  )
  const serviceCounts = new Map<string, number>()
  for (const c of filteredCustomers) {
    serviceCounts.set(c.serviceType, (serviceCounts.get(c.serviceType) ?? 0) + 1)
  }
  const serviceData: ChartDatum[] = [...serviceCounts.entries()]
    .map(([serviceType, customers]) => ({
      label: serviceType,
      value: customers,
      color: seriesColor(
        SERVICE_TYPES.indexOf(serviceType as (typeof SERVICE_TYPES)[number])
      ),
    }))
    .sort((a, b) => b.value - a.value)

  const capacityComparisonData = utilization.map((u) => ({
    label: `${u.employeeName} · C${u.counterId}`,
    series: [
      {
        name: "Est. capacity",
        value: Math.round(u.capacityMs / 1000),
        display: formatDuration(u.capacityMs),
        color: "#8a8987",
      },
      {
        name: "Actual processing",
        value: Math.round(u.actualProcessingMs / 1000),
        display: formatDuration(u.actualProcessingMs),
        color: seriesColor(u.counterId - 1),
      },
    ],
  }))

  const counterRows = utilization.map((u) => ({
    counter: `Counter ${u.counterId} — ${u.counterName}`,
    employee: u.employeeName,
    handled: u.tokensHandled,
    total: formatDuration(u.actualProcessingMs),
    avg: u.tokensProcessed > 0 ? formatDuration(u.avgProcessingMs) : "—",
    queue: u.currentQueue,
  }))

  const capacityRows = utilization.map((u) => ({
    employee: u.employeeName,
    counter: `Counter ${u.counterId}`,
    capacity: formatDuration(u.capacityMs),
    actual: formatDuration(u.actualProcessingMs),
    utilization: `${Math.round(u.utilization * 100)}%`,
    available: formatDuration(u.availableMs),
    queue: u.currentQueue,
  }))

  const COUNTER_TABLE_COLUMNS: TableColumn[] = [
    { key: "counter", label: "Counter" },
    { key: "employee", label: "Employee" },
    { key: "handled", label: "Tokens", align: "right" },
    { key: "total", label: "Total time", align: "right" },
    { key: "avg", label: "Avg time", align: "right" },
    { key: "queue", label: "In queue", align: "right" },
  ]

  const CAPACITY_TABLE_COLUMNS: TableColumn[] = [
    { key: "employee", label: "Employee" },
    { key: "counter", label: "Counter" },
    { key: "capacity", label: "Est. capacity", align: "right" },
    { key: "actual", label: "Actual", align: "right" },
    { key: "utilization", label: "Utilization", align: "right" },
    { key: "available", label: "Available", align: "right" },
    { key: "queue", label: "Queue", align: "right" },
  ]

  function renderCounterChart(viz: VizType, data: ChartDatum[]) {
    switch (viz) {
      case "h-bar":
        return <HBarChart data={data} />
      case "v-bar":
        return <VBarChart data={data} />
      case "donut":
      case "pie":
        return <RoundChart data={data} variant={viz} centerLabel="total" />
      case "grouped-bar":
        return <GroupedBarChart data={capacityComparisonData} />
      case "table":
        return <DataTable columns={COUNTER_TABLE_COLUMNS} rows={counterRows} />
    }
  }

  // ---- KPI tiles — every one drills down into the records behind it ----
  const tiles: KpiTile[] = [
    {
      id: "tokens-processed",
      label: "Tokens Processed",
      value: String(kpis.tokensProcessed),
      sub: `${kpis.tokensOnHold > 0 ? `${kpis.tokensOnHold} on hold · ` : ""}${TIME_RANGE_LABELS[filters.time]}`,
      icon: ListChecks,
    },
    {
      id: "active-tokens",
      label: "Active Tokens",
      value: String(kpis.activeTokens),
      icon: Activity,
    },
    {
      id: "total-processing",
      label:
        dataView === "capacity" ? "Est. Capacity (branch)" : "Total Processing",
      value:
        dataView === "capacity"
          ? formatDuration(kpis.branchCapacityMs)
          : formatDuration(kpis.totalProcessingMs),
      sub:
        dataView === "both"
          ? `of ${formatDuration(kpis.branchCapacityMs)} capacity`
          : dataView === "capacity"
            ? "Estimated Capacity"
            : "hold time excluded",
      icon: Clock,
    },
    {
      id: "avg-service",
      label: "Avg Service Time",
      value: kpis.tokensProcessed > 0 ? formatDuration(kpis.avgServiceMs) : "—",
      icon: Timer,
    },
    {
      id: "most-loaded",
      label: "Most Loaded",
      value: kpis.mostLoaded?.employeeName ?? "—",
      sub: kpis.mostLoaded
        ? formatDuration(kpis.mostLoaded.actualProcessingMs)
        : undefined,
      icon: UserRound,
    },
    {
      id: "utilization",
      label: "Branch Utilization",
      value: `${Math.round(kpis.utilization * 100)}%`,
      sub:
        dataView !== "actual"
          ? `${formatDuration(kpis.branchAvailableMs)} available`
          : "vs Estimated Capacity",
      icon: Gauge,
    },
    {
      id: "overrides",
      label: "Queue Overrides",
      value: String(kpis.overrides),
      sub:
        kpis.overrides > 0
          ? `${Math.round(kpis.overrideRate * 1000) / 10}% of assignments`
          : "automation only",
      icon: ArrowUpDown,
    },
  ]

  return (
    <section
      aria-label="Manager dashboard"
      className="flex min-h-0 flex-1 flex-col gap-2"
    >
      {/* header: title + global Data View */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-0.5">
        <h2 className="text-sm font-semibold tracking-tight">
          Manager Dashboard
        </h2>
        <div
          role="group"
          aria-label="Data View"
          className="flex items-center gap-1"
        >
          <span className="mr-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
            Data View
          </span>
          {(Object.keys(DATA_VIEW_LABELS) as DataView[]).map((view) => (
            <button
              key={view}
              type="button"
              onClick={() => setDataView(view)}
              aria-pressed={dataView === view}
              className={cn(
                "rounded-md border px-2 py-1 text-[11px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                dataView === view
                  ? "border-primary bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              {DATA_VIEW_LABELS[view]}
            </button>
          ))}
        </div>
      </div>

      {/* dashboard-wide filters — every KPI, table and visualization follows */}
      <div
        aria-label="Analytics filters"
        className="flex shrink-0 flex-wrap items-center gap-1.5 rounded-lg border bg-card px-2 py-1.5"
      >
        <Select
          value={filters.time}
          onValueChange={(v) => setFilter("time", v as TimeRange)}
        >
          <SelectTrigger size="sm" aria-label="Time filter" className="h-6! px-2 text-[11px]">
            <SelectValue>{() => <span>{TIME_RANGE_LABELS[filters.time]}</span>}</SelectValue>
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            {(Object.keys(TIME_RANGE_LABELS) as TimeRange[]).map((t) => (
              <SelectItem key={t} value={t}>
                {TIME_RANGE_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.employee}
          onValueChange={(v) => setFilter("employee", v as string)}
        >
          <SelectTrigger size="sm" aria-label="Employee filter" className="h-6! px-2 text-[11px]">
            <SelectValue>
              {() => (
                <span>
                  {filters.employee === "all" ? "All employees" : filters.employee}
                </span>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            <SelectItem value="all">All employees</SelectItem>
            {COUNTER_DEFS.map((c) => (
              <SelectItem key={c.id} value={c.employeeName}>
                {c.employeeName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={String(filters.counter)}
          onValueChange={(v) =>
            setFilter("counter", v === "all" ? "all" : Number(v))
          }
        >
          <SelectTrigger size="sm" aria-label="Counter filter" className="h-6! px-2 text-[11px]">
            <SelectValue>
              {() => (
                <span>
                  {filters.counter === "all"
                    ? "All counters"
                    : `Counter ${filters.counter}`}
                </span>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            <SelectItem value="all">All counters</SelectItem>
            {COUNTER_DEFS.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                Counter {c.id} — {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.service}
          onValueChange={(v) => setFilter("service", v as ServiceType | "all")}
        >
          <SelectTrigger size="sm" aria-label="Service type filter" className="h-6! px-2 text-[11px]">
            <SelectValue>
              {() => (
                <span>
                  {filters.service === "all" ? "All services" : filters.service}
                </span>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            <SelectItem value="all">All services</SelectItem>
            {SERVICE_TYPES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {isFiltered(filters) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[11px] text-muted-foreground"
            onClick={() => setFilters(DEFAULT_FILTERS)}
          >
            <FilterX data-icon="inline-start" aria-hidden />
            Clear Filters
          </Button>
        )}
        <span className="ml-auto text-[10px] text-muted-foreground">
          {dataView !== "actual" && "Capacity figures are Estimated Capacity — prototype assumptions"}
        </span>
      </div>

      {/* KPI row — click any KPI to see the records behind the number */}
      <div className="grid shrink-0 grid-cols-7 divide-x rounded-xl border bg-card shadow-xs">
        {tiles.map((tile) => (
          <button
            key={tile.id}
            type="button"
            onClick={() =>
              tile.id === "most-loaded"
                ? kpis.mostLoaded &&
                  setEmployeeDetail(kpis.mostLoaded.employeeName)
                : setDrilldown(tile.id)
            }
            aria-label={`${tile.label} — drill down`}
            title="Click to drill down"
            className="group flex min-w-0 items-center gap-2 px-2.5 py-2 text-left transition-colors outline-none first:rounded-l-xl last:rounded-r-xl hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset"
          >
            <tile.icon className="size-4 shrink-0 text-primary/70" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm leading-5 font-semibold tabular-nums tracking-tight">
                {tile.value}
              </p>
              <p className="truncate text-[10px] leading-3 text-muted-foreground">
                {tile.label}
              </p>
              {tile.sub && (
                <p className="truncate text-[9px] leading-3 text-muted-foreground/70">
                  {tile.sub}
                </p>
              )}
            </div>
            <ZoomIn
              className="size-3 shrink-0 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground/70 group-focus-visible:text-muted-foreground/70"
              aria-hidden
            />
          </button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-1 gap-3 overflow-y-auto pb-1 lg:grid-cols-2">
        {dataView !== "actual" && (
          <VizCard
            title={
              dataView === "capacity"
                ? "Estimated Capacity by Employee"
                : "Capacity vs Actual"
            }
            chartId="capacity-vs-actual"
            defaultViz="grouped-bar"
            options={["grouped-bar", "h-bar", "table"]}
            render={(viz) =>
              viz === "table" ? (
                <DataTable columns={CAPACITY_TABLE_COLUMNS} rows={capacityRows} />
              ) : viz === "grouped-bar" ? (
                <GroupedBarChart data={capacityComparisonData} />
              ) : (
                <HBarChart
                  data={utilization.map((u) => ({
                    label: `${u.employeeName} · C${u.counterId}`,
                    value: Math.round(
                      (dataView === "capacity" ? u.availableMs : u.actualProcessingMs) / 1000
                    ),
                    display:
                      dataView === "capacity"
                        ? `${formatDuration(u.availableMs)} free`
                        : `${Math.round(u.utilization * 100)}%`,
                    color: seriesColor(u.counterId - 1),
                  }))}
                />
              )
            }
          />
        )}
        <VizCard
          title="Employee Workload"
          chartId="employee-workload"
          defaultViz="h-bar"
          options={["h-bar", "v-bar", "donut", "table"]}
          render={(viz) => renderCounterChart(viz, workloadData)}
        />
        <VizCard
          title="Token Distribution"
          chartId="token-distribution"
          defaultViz="donut"
          options={["donut", "pie", "h-bar", "v-bar", "table"]}
          render={(viz) =>
            viz === "table" ? (
              <DataTable
                columns={[
                  { key: "counter", label: "Counter" },
                  { key: "active", label: "Active tokens", align: "right" },
                ]}
                rows={utilization.map((u) => ({
                  counter: `Counter ${u.counterId} — ${u.counterName}`,
                  active: u.currentQueue + (u.serving ? 1 : 0) + u.currentlyHeld,
                }))}
              />
            ) : viz === "donut" || viz === "pie" ? (
              <RoundChart data={activeTokensData} variant={viz} centerLabel="in branch" />
            ) : viz === "h-bar" ? (
              <HBarChart data={activeTokensData} />
            ) : (
              <VBarChart data={activeTokensData} />
            )
          }
        />
        <VizCard
          title={
            dataView === "capacity"
              ? "Est. Capacity (Processing Window)"
              : "Processing Time"
          }
          chartId="processing-time"
          defaultViz="h-bar"
          options={["h-bar", "v-bar", "table"]}
          render={(viz) =>
            viz === "table" ? (
              <DataTable
                columns={
                  dataView === "actual" ? COUNTER_TABLE_COLUMNS : CAPACITY_TABLE_COLUMNS
                }
                rows={dataView === "actual" ? counterRows : capacityRows}
              />
            ) : viz === "h-bar" ? (
              <HBarChart data={processingData} />
            ) : (
              <VBarChart data={processingData} />
            )
          }
        />
        <VizCard
          title="Queue Pressure"
          chartId="queue-pressure"
          defaultViz="h-bar"
          options={["h-bar", "v-bar", "table"]}
          render={(viz) =>
            viz === "table" ? (
              <DataTable
                columns={[
                  { key: "counter", label: "Counter" },
                  { key: "waiting", label: "Waiting", align: "right" },
                  { key: "held", label: "On hold", align: "right" },
                ]}
                rows={utilization.map((u) => ({
                  counter: `Counter ${u.counterId} — ${u.counterName}`,
                  waiting: u.currentQueue,
                  held: u.currentlyHeld,
                }))}
              />
            ) : viz === "h-bar" ? (
              <HBarChart data={pressureData} />
            ) : (
              <VBarChart data={pressureData} />
            )
          }
        />
        <VizCard
          title="Service Type Analysis"
          chartId="service-types"
          defaultViz="h-bar"
          options={["h-bar", "v-bar", "donut", "pie", "table"]}
          render={(viz) =>
            viz === "table" ? (
              <DataTable
                columns={[
                  { key: "service", label: "Service" },
                  { key: "customers", label: "Customers", align: "right" },
                ]}
                rows={serviceData.map((s) => ({
                  service: s.label,
                  customers: s.value,
                }))}
              />
            ) : viz === "donut" || viz === "pie" ? (
              <RoundChart data={serviceData} variant={viz} centerLabel="customers" />
            ) : viz === "h-bar" ? (
              <HBarChart data={serviceData} />
            ) : (
              <VBarChart data={serviceData} />
            )
          }
        />
        <VizCard
          title="Hold & Break Activity"
          chartId="hold-activity"
          defaultViz="h-bar"
          options={["h-bar", "table"]}
          action={
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-[11px] text-muted-foreground"
              onClick={() => setDrilldown("holds")}
            >
              <PauseCircle data-icon="inline-start" aria-hidden />
              Details
            </Button>
          }
          render={(viz) => {
            const holdData: ChartDatum[] = utilization.map((u) => ({
              label: `${u.employeeName} · C${u.counterId}`,
              value: Math.round(u.holdMs / 1000),
              display: u.holdMs > 0 ? formatDuration(u.holdMs) : "0",
              color: seriesColor(u.counterId - 1),
            }))
            if (viz === "table") {
              return (
                <DataTable
                  columns={[
                    { key: "employee", label: "Employee" },
                    { key: "events", label: "Holds", align: "right" },
                    { key: "total", label: "Hold time", align: "right" },
                    { key: "held", label: "Held now", align: "right" },
                    { key: "breaks", label: "Break time", align: "right" },
                  ]}
                  rows={utilization.map((u) => ({
                    employee: `${u.employeeName} — C${u.counterId}`,
                    events: u.holdEvents,
                    total: u.holdMs > 0 ? formatDuration(u.holdMs) : "—",
                    held: u.currentlyHeld,
                    breaks:
                      u.breakMs > 0
                        ? `${formatDuration(u.breakMs)}${u.onBreak ? " ☕" : ""}`
                        : u.onBreak
                          ? "☕ now"
                          : "—",
                  }))}
                />
              )
            }
            return <HBarChart data={holdData} />
          }}
        />
      </div>

      <ManagerDrilldownDialog
        kpi={drilldown}
        filters={filters}
        onClose={() => setDrilldown(null)}
        onOpenEmployee={(name) => {
          setDrilldown(null)
          setEmployeeDetail(name)
        }}
        onOpenJourney={onOpenJourney}
      />
      <EmployeeDetailDialog
        employeeName={employeeDetail}
        filters={filters}
        onClose={() => setEmployeeDetail(null)}
        onOpenJourney={onOpenJourney}
      />
    </section>
  )
}
