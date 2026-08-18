"use client"

import {
  CheckCircle2,
  Hourglass,
  Timer,
  UserCheck,
  Users,
  ZoomIn,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

import type { MainKpiId } from "@/components/kpi-drilldown"
import { formatDuration } from "@/lib/format"
import { useQueueStore } from "@/lib/queue-store"
import { useNow } from "@/hooks/use-now"
import { cn } from "@/lib/utils"

interface Kpi {
  id: MainKpiId
  label: string
  value: string
  icon: LucideIcon
  accent: string
}

export function KpiStrip({
  onDrilldown,
}: {
  onDrilldown: (kpi: MainKpiId) => void
}) {
  const customers = useQueueStore((s) => s.state.customers)
  const now = useNow(1000)

  const all = Object.values(customers)
  const active = all.filter((c) => c.status !== "completed")
  const waiting = all.filter((c) => c.status === "waiting")
  const serving = all.filter((c) => c.status === "serving")
  const completed = all.filter((c) => c.status === "completed")

  const activeWaits = active.map((c) => now - c.createdAt)
  const avgWait =
    activeWaits.length > 0
      ? activeWaits.reduce((a, b) => a + b, 0) / activeWaits.length
      : 0

  const kpis: Kpi[] = [
    {
      id: "in-branch",
      label: "Customers in Branch",
      value: String(active.length),
      icon: Users,
      accent: "bg-primary/10 text-primary",
    },
    {
      id: "waiting",
      label: "Waiting",
      value: String(waiting.length),
      icon: Hourglass,
      accent: "bg-amber-100 text-amber-700",
    },
    {
      id: "serving",
      label: "Being Served",
      value: String(serving.length),
      icon: UserCheck,
      accent: "bg-blue-100 text-blue-700",
    },
    {
      id: "completed",
      label: "Completed",
      value: String(completed.length),
      icon: CheckCircle2,
      accent: "bg-emerald-100 text-emerald-700",
    },
    {
      id: "avg-wait",
      label: "Average Wait",
      value: activeWaits.length > 0 ? formatDuration(avgWait) : "—",
      icon: Timer,
      accent: "bg-violet-100 text-violet-700",
    },
  ]

  return (
    <section
      aria-label="Branch key metrics"
      className="grid shrink-0 grid-cols-5 divide-x rounded-xl border bg-card shadow-xs"
    >
      {kpis.map((kpi) => (
        <button
          key={kpi.id}
          type="button"
          onClick={() => onDrilldown(kpi.id)}
          aria-label={`${kpi.label} — view the records behind this number`}
          title="Click to drill down"
          className="group flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors outline-none first:rounded-l-xl last:rounded-r-xl hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset"
        >
          <div
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-lg",
              kpi.accent
            )}
          >
            <kpi.icon className="size-4" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-lg leading-6 font-semibold tabular-nums tracking-tight">
              {kpi.value}
            </p>
            <p className="truncate text-[11px] leading-3 text-muted-foreground">
              {kpi.label}
            </p>
          </div>
          {/* subtle drill-down affordance — visible on hover/focus only */}
          <ZoomIn
            className="size-3.5 shrink-0 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground/70 group-focus-visible:text-muted-foreground/70"
            aria-hidden
          />
        </button>
      ))}
    </section>
  )
}
