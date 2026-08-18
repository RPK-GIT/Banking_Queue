"use client"

import { Pause, Play, RotateCcw, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useQueueStore } from "@/lib/queue-store"

export function DemoControls() {
  const demoStatus = useQueueStore((s) => s.demoStatus)
  const playDemo = useQueueStore((s) => s.playDemo)
  const pauseDemo = useQueueStore((s) => s.pauseDemo)
  const resetDemo = useQueueStore((s) => s.resetDemo)
  const clearAll = useQueueStore((s) => s.clearAll)

  return (
    <Card className="gap-3 py-4 shadow-xs">
      <CardHeader className="px-4">
        <CardTitle className="text-sm">Demo Controls</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 px-4">
        {demoStatus === "playing" ? (
          <Button onClick={pauseDemo} variant="secondary" className="w-full">
            <Pause data-icon="inline-start" aria-hidden />
            Pause
          </Button>
        ) : (
          <Button onClick={playDemo} className="w-full">
            <Play data-icon="inline-start" aria-hidden />
            {demoStatus === "paused" ? "Resume Demo" : "▶ Play Demo"}
          </Button>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              resetDemo()
              toast.info("Demo reset", {
                description: "Branch restored to the seeded scenario.",
              })
            }}
          >
            <RotateCcw data-icon="inline-start" aria-hidden />
            Reset
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
        {demoStatus !== "idle" && (
          <p className="text-center text-[11px] text-muted-foreground">
            {demoStatus === "playing"
              ? "Scripted demo running — watch T-115 travel across counters."
              : "Demo paused — press Resume to continue."}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
