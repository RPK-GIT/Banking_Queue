"use client"

import { AnimatePresence, motion } from "motion/react"
import {
  ArrowRightLeft,
  BellRing,
  CheckCircle2,
  CircleCheck,
  Radio,
  TicketPlus,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { formatClock } from "@/lib/format"
import { useQueueStore } from "@/lib/queue-store"
import type { ActivityType } from "@/lib/types"
import { cn } from "@/lib/utils"

const ICONS: Record<ActivityType, { icon: LucideIcon; className: string }> = {
  "token-issued": { icon: TicketPlus, className: "bg-primary/10 text-primary" },
  called: { icon: BellRing, className: "bg-blue-100 text-blue-700" },
  "service-completed": {
    icon: CircleCheck,
    className: "bg-slate-100 text-slate-600",
  },
  transferred: {
    icon: ArrowRightLeft,
    className: "bg-amber-100 text-amber-700",
  },
  "journey-completed": {
    icon: CheckCircle2,
    className: "bg-emerald-100 text-emerald-700",
  },
  reset: { icon: Radio, className: "bg-muted text-muted-foreground" },
}

export function ActivityFeed({
  onSelectCustomer,
}: {
  onSelectCustomer: (customerId: string) => void
}) {
  const activities = useQueueStore((s) => s.state.activities)

  return (
    <Card className="flex h-full min-h-0 flex-col gap-3 py-4 shadow-xs">
      <CardHeader className="px-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400/75" />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
          </span>
          Live Activity
        </CardTitle>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 px-0">
        <ScrollArea className="h-full max-h-[60vh] px-4 2xl:max-h-none">
          <ul className="flex flex-col gap-2.5 pb-1">
          <AnimatePresence initial={false}>
            {activities.map((activity) => {
              const meta = ICONS[activity.type]
              return (
                <motion.li
                  key={activity.id}
                  layout
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25 }}
                  className="flex items-start gap-2.5"
                >
                  <span
                    className={cn(
                      "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full",
                      meta.className
                    )}
                  >
                    <meta.icon className="size-3" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="font-mono text-[10px] tabular-nums text-muted-foreground">
                      {formatClock(activity.timestamp)}
                    </p>
                    {activity.customerId ? (
                      <button
                        type="button"
                        onClick={() => onSelectCustomer(activity.customerId!)}
                        className="text-left text-xs leading-snug hover:text-primary hover:underline"
                      >
                        {activity.message}
                      </button>
                    ) : (
                      <p className="text-xs leading-snug">{activity.message}</p>
                    )}
                  </div>
                </motion.li>
              )
            })}
          </AnimatePresence>
          {activities.length === 0 && (
            <p className="px-1 text-xs text-muted-foreground">
              No activity yet — issue a token to get started.
            </p>
          )}
          </ul>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
