"use client"

import {
  MonitorPlay,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  DEMO_SPEEDS,
  DEMO_STEP_COUNT,
  useQueueStore,
} from "@/lib/queue-store"
import { cn } from "@/lib/utils"

export function DemoControls() {
  const demoStatus = useQueueStore((s) => s.demoStatus)
  const demoSpeed = useQueueStore((s) => s.demoSpeed)
  const demoStepIndex = useQueueStore((s) => s.demoStepIndex)
  const playDemo = useQueueStore((s) => s.playDemo)
  const pauseDemo = useQueueStore((s) => s.pauseDemo)
  const stepDemo = useQueueStore((s) => s.stepDemo)
  const setDemoSpeed = useQueueStore((s) => s.setDemoSpeed)
  const resetDemo = useQueueStore((s) => s.resetDemo)
  const clearAll = useQueueStore((s) => s.clearAll)

  const finished = demoStatus === "idle" && demoStepIndex >= DEMO_STEP_COUNT

  return (
    <section aria-label="Demonstration" className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <MonitorPlay className="size-4 text-primary" aria-hidden />
          Demonstration
        </h2>
        {demoStatus === "playing" && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-emerald-700 ring-1 ring-emerald-600/20 ring-inset">
            <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
            LIVE DEMO
          </span>
        )}
        {demoStatus === "paused" && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-amber-800 ring-1 ring-amber-600/20 ring-inset">
            <Pause className="size-2.5" aria-hidden />
            DEMO PAUSED
          </span>
        )}
        {finished && (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground ring-1 ring-border ring-inset">
            ✓ DEMO COMPLETE
          </span>
        )}
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-2">
        {demoStatus === "playing" ? (
          <Button onClick={pauseDemo} variant="secondary" className="w-full">
            <Pause data-icon="inline-start" aria-hidden />
            Pause
          </Button>
        ) : (
          <Button onClick={playDemo} className="w-full">
            <Play data-icon="inline-start" aria-hidden />
            {demoStatus === "paused"
              ? "Resume"
              : finished
                ? "Replay Live Demo"
                : "Start Live Demo"}
          </Button>
        )}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="outline"
                size="icon"
                aria-label="Step — run exactly one demo event"
                disabled={demoStatus === "playing" || finished}
                onClick={stepDemo}
              />
            }
          >
            <SkipForward aria-hidden />
          </TooltipTrigger>
          <TooltipContent>
            Step — run exactly one event, then stay paused
          </TooltipContent>
        </Tooltip>
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-[11px] text-muted-foreground">Speed</span>
        <div className="grid flex-1 grid-cols-4 gap-1">
          {DEMO_SPEEDS.map((speed) => (
            <button
              key={speed}
              type="button"
              onClick={() => setDemoSpeed(speed)}
              aria-pressed={demoSpeed === speed}
              className={cn(
                "rounded-md border px-1 py-1 text-[11px] font-medium tabular-nums transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                demoSpeed === speed
                  ? "border-primary bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              {speed}×
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            resetDemo()
            toast.info("Demo restarted", {
              description: "Branch restored to the seeded scenario.",
            })
          }}
        >
          <RotateCcw data-icon="inline-start" aria-hidden />
          Restart
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            clearAll()
            toast.info("Branch cleared", {
              description: "All queues are now empty.",
            })
          }}
        >
          <Trash2 data-icon="inline-start" aria-hidden />
          Clear All
        </Button>
      </div>

      {(demoStatus !== "idle" || finished) && (
        <p className="text-center text-[11px] text-muted-foreground">
          {demoStatus === "playing" &&
            `Live demo running (step ${demoStepIndex} of ${DEMO_STEP_COUNT}) — watch T-115 travel across counters.`}
          {demoStatus === "paused" &&
            `Paused at step ${demoStepIndex} of ${DEMO_STEP_COUNT} — the dashboard stays fully interactive. Explore WhatsApp, journeys and queues, then Resume or Step.`}
          {finished && "Demo complete — press Replay or Restart."}
        </p>
      )}
    </section>
  )
}
