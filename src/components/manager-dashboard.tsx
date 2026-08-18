"use client"

import { useState } from "react"
import { ChartBar } from "lucide-react"

import {
  ChartDatum,
  DataTable,
  HBarChart,
  RoundChart,
  seriesColor,
  TableColumn,
  VBarChart,
} from "@/components/charts"
import { Card } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { counterMetrics, serviceTypeMetrics } from "@/lib/analytics"
import { formatDuration } from "@/lib/format"
import { useQueueStore } from "@/lib/queue-store"
import { SERVICE_TYPES } from "@/lib/types"
import { getVizPref, saveVizPref, type VizType } from "@/lib/viz-prefs"

const VIZ_LABELS: Record<VizType, string> = {
  "h-bar": "Horizontal Bar",
  "v-bar": "Vertical Bar",
  donut: "Donut",
  pie: "Pie",
  table: "Table",
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
  render,
}: {
  title: string
  chartId: string
  defaultViz: VizType
  /** only representations that make sense for this metric */
  options: VizType[]
  render: (viz: VizType) => React.ReactNode
}) {
  const [viz, setViz] = useViz(chartId, defaultViz)
  return (
    <Card className="gap-2.5 p-3.5 shadow-xs">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold tracking-wide uppercase">
          {title}
        </h3>
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
      <div className="min-h-32">{render(viz)}</div>
    </Card>
  )
}

const COUNTER_TABLE_COLUMNS: TableColumn[] = [
  { key: "counter", label: "Counter" },
  { key: "employee", label: "Employee" },
  { key: "handled", label: "Tokens", align: "right" },
  { key: "total", label: "Total time", align: "right" },
  { key: "avg", label: "Avg time", align: "right" },
  { key: "queue", label: "In queue", align: "right" },
]

export function ManagerDashboard() {
  const state = useQueueStore((s) => s.state)
  const metrics = counterMetrics(state)
  const services = serviceTypeMetrics(state)

  // color follows the entity: counter N always wears slot N-1
  const workloadData: ChartDatum[] = metrics.map((m) => ({
    label: `${m.employeeName} · C${m.counterId}`,
    value: m.tokensHandled,
    color: seriesColor(m.counterId - 1),
  }))
  const activeTokensData: ChartDatum[] = metrics.map((m) => ({
    label: `Counter ${m.counterId}`,
    value: m.queueLength + (m.serving ? 1 : 0),
    color: seriesColor(m.counterId - 1),
  }))
  const processingData: ChartDatum[] = metrics.map((m) => ({
    label: `Counter ${m.counterId}`,
    value: Math.round(m.avgProcessingMs / 1000),
    display: m.tokensCompleted > 0 ? formatDuration(m.avgProcessingMs) : "—",
    color: seriesColor(m.counterId - 1),
  }))
  const pressureData: ChartDatum[] = metrics.map((m) => ({
    label: `Counter ${m.counterId}`,
    value: m.queueLength,
    color: seriesColor(m.counterId - 1),
  }))
  // service types keep a FIXED slot by catalog order, never by rank
  const serviceData: ChartDatum[] = services.map((s) => ({
    label: s.serviceType,
    value: s.customers,
    color: seriesColor(SERVICE_TYPES.indexOf(s.serviceType as (typeof SERVICE_TYPES)[number])),
  }))

  const counterRows = metrics.map((m) => ({
    counter: `Counter ${m.counterId} — ${m.counterName}`,
    employee: m.employeeName,
    handled: m.tokensHandled,
    total: formatDuration(m.totalProcessingMs),
    avg: m.tokensCompleted > 0 ? formatDuration(m.avgProcessingMs) : "—",
    queue: m.queueLength,
  }))

  function renderCounterChart(viz: VizType, data: ChartDatum[]) {
    switch (viz) {
      case "h-bar":
        return <HBarChart data={data} />
      case "v-bar":
        return <VBarChart data={data} />
      case "donut":
      case "pie":
        return <RoundChart data={data} variant={viz} centerLabel="total" />
      case "table":
        return <DataTable columns={COUNTER_TABLE_COLUMNS} rows={counterRows} />
    }
  }

  return (
    <section
      aria-label="Manager dashboard"
      className="flex min-h-0 flex-1 flex-col gap-2"
    >
      <div className="flex shrink-0 items-baseline justify-between px-0.5">
        <h2 className="text-sm font-semibold tracking-tight">
          Manager Dashboard
        </h2>
        <p className="text-[11px] text-muted-foreground">
          Live branch performance — four counters, four employees
        </p>
      </div>
      <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-1 gap-3 overflow-y-auto pb-1 lg:grid-cols-2">
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
                rows={metrics.map((m) => ({
                  counter: `Counter ${m.counterId} — ${m.counterName}`,
                  active: m.queueLength + (m.serving ? 1 : 0),
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
          title="Processing Time"
          chartId="processing-time"
          defaultViz="h-bar"
          options={["h-bar", "v-bar", "table"]}
          render={(viz) =>
            viz === "table" ? (
              <DataTable columns={COUNTER_TABLE_COLUMNS} rows={counterRows} />
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
                ]}
                rows={metrics.map((m) => ({
                  counter: `Counter ${m.counterId} — ${m.counterName}`,
                  waiting: m.queueLength,
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
          options={["h-bar", "v-bar", "donut", "table"]}
          render={(viz) =>
            viz === "table" ? (
              <DataTable
                columns={[
                  { key: "service", label: "Service" },
                  { key: "customers", label: "Customers", align: "right" },
                ]}
                rows={services.map((s) => ({
                  service: s.serviceType,
                  customers: s.customers,
                }))}
              />
            ) : viz === "donut" ? (
              <RoundChart data={serviceData} variant="donut" centerLabel="customers" />
            ) : viz === "h-bar" ? (
              <HBarChart data={serviceData} />
            ) : (
              <VBarChart data={serviceData} />
            )
          }
        />
      </div>
    </section>
  )
}
