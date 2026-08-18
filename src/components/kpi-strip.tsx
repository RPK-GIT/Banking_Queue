"use client"

import {
  CheckCircle2,
  Hourglass,
  Timer,
  UserCheck,
  Users,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { Card } from "@/components/ui/card"
import { formatDuration } from "@/lib/format"
import { useQueueStore } from "@/lib/queue-store"
import { useNow } from "@/hooks/use-now"
import { cn } from "@/lib/utils"

interface Kpi {
  label: string
  value: string
  icon: LucideIcon
  accent: string
}

export function KpiStrip() {
  const customers = useQueueStore((s) => s.state.customers)
  const now = useNow(1000)

  const all = Object.values(customers)
  const waiting = all.filter((c) => c.status === "waiting")
  const serving = all.filter((c) => c.status === "serving")
  const completed = all.filter((c) => c.status === "completed")

  const activeWaits = [...waiting, ...serving].map((c) => now - c.createdAt)
  const avgWait =
    activeWaits.length > 0
      ? activeWaits.reduce((a, b) => a + b, 0) / activeWaits.length
      : 0

  const kpis: Kpi[] = [
    {
      label: "Customers in Branch",
      value: String(waiting.length + serving.length),
      icon: Users,
      accent: "bg-primary/10 text-primary",
    },
    {
      label: "Waiting",
      value: String(waiting.length),
      icon: Hourglass,
      accent: "bg-amber-100 text-amber-700",
    },
    {
      label: "Being Served",
      value: String(serving.length),
      icon: UserCheck,
      accent: "bg-blue-100 text-blue-700",
    },
    {
      label: "Completed",
      value: String(completed.length),
      icon: CheckCircle2,
      accent: "bg-emerald-100 text-emerald-700",
    },
    {
      label: "Average Wait",
      value: activeWaits.length > 0 ? formatDuration(avgWait) : "—",
      icon: Timer,
      accent: "bg-violet-100 text-violet-700",
    },
  ]

  return (
    <section
      aria-label="Branch key metrics"
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5"
    >
      {kpis.map((kpi) => (
        <Card
          key={kpi.label}
          className="flex-row items-center gap-3 px-4 py-3 shadow-xs"
        >
          <div
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-lg",
              kpi.accent
            )}
          >
            <kpi.icon className="size-4.5" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs text-muted-foreground">{kpi.label}</p>
            <p className="text-xl font-semibold tabular-nums tracking-tight">
              {kpi.value}
            </p>
          </div>
        </Card>
      ))}
    </section>
  )
}
