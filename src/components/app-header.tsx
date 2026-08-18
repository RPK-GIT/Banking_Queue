"use client"

import { Activity, Building2, Info, Landmark, Pause } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { formatClock } from "@/lib/format"
import { DEMO_STEP_COUNT, useQueueStore } from "@/lib/queue-store"
import { useNow } from "@/hooks/use-now"
import { cn } from "@/lib/utils"

function DemoStatusChip() {
  const demoStatus = useQueueStore((s) => s.demoStatus)
  const demoStepIndex = useQueueStore((s) => s.demoStepIndex)
  const finished = demoStatus === "idle" && demoStepIndex >= DEMO_STEP_COUNT

  if (demoStatus === "idle" && !finished) return null

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide ring-1 ring-inset",
        demoStatus === "playing" &&
          "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
        demoStatus === "paused" && "bg-amber-50 text-amber-800 ring-amber-600/25",
        finished && "bg-muted text-muted-foreground ring-border"
      )}
    >
      {demoStatus === "playing" && (
        <>
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400/75" />
            <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
          </span>
          LIVE DEMO
        </>
      )}
      {demoStatus === "paused" && (
        <>
          <Pause className="size-3" aria-hidden />
          DEMO PAUSED
        </>
      )}
      {finished && <>✓ DEMO COMPLETE</>}
    </span>
  )
}

interface AppHeaderProps {
  activityOpen: boolean
  onToggleActivity: () => void
  onOpenWhy: () => void
}

export function AppHeader({
  activityOpen,
  onToggleActivity,
  onOpenWhy,
}: AppHeaderProps) {
  const now = useNow(1000)

  return (
    <header className="z-40 flex h-12 shrink-0 items-center justify-between gap-4 border-b bg-card px-4">
      <div className="flex items-center gap-2.5">
        <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Landmark className="size-4" aria-hidden />
        </div>
        <div className="flex items-baseline gap-2.5">
          <h1 className="text-sm leading-none font-semibold tracking-tight">
            Smart Bank Queue
          </h1>
          <p className="hidden text-xs leading-none text-muted-foreground sm:block">
            Fair. FIFO. Transparent.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        <DemoStatusChip />
        <div className="hidden items-center gap-1.5 text-sm text-muted-foreground lg:flex">
          <Building2 className="size-3.5" aria-hidden />
          <span className="text-xs font-medium text-foreground">
            SBI Demo Branch
          </span>
        </div>
        <Badge className="gap-1.5 bg-emerald-600 text-white">
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-white/75" />
            <span className="relative inline-flex size-1.5 rounded-full bg-white" />
          </span>
          OPEN
        </Badge>
        <span
          suppressHydrationWarning
          className="font-mono text-xs tabular-nums text-muted-foreground"
        >
          {formatClock(now)}
        </span>
        <Separator orientation="vertical" className="h-4!" />
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant={activityOpen ? "secondary" : "ghost"}
                size="icon-sm"
                aria-label="Toggle live activity panel"
                aria-pressed={activityOpen}
                onClick={onToggleActivity}
              />
            }
          >
            <Activity aria-hidden />
          </TooltipTrigger>
          <TooltipContent>Live activity</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Why Smart Queue?"
                onClick={onOpenWhy}
              />
            }
          >
            <Info aria-hidden />
          </TooltipTrigger>
          <TooltipContent>Why Smart Queue?</TooltipContent>
        </Tooltip>
      </div>
    </header>
  )
}
