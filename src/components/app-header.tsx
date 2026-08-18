"use client"

import { Building2, Landmark } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { formatClock } from "@/lib/format"
import { useNow } from "@/hooks/use-now"

export function AppHeader() {
  const now = useNow(1000)

  return (
    <header className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur supports-backdrop-filter:bg-card/80">
      <div className="mx-auto flex h-14 max-w-[1800px] items-center justify-between gap-4 px-4 lg:px-6">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Landmark className="size-5" aria-hidden />
          </div>
          <div>
            <h1 className="text-[15px] leading-tight font-semibold tracking-tight">
              Smart Bank Queue
            </h1>
            <p className="text-xs leading-tight text-muted-foreground">
              Fair. FIFO. Transparent.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-2 text-sm text-muted-foreground md:flex">
            <Building2 className="size-4" aria-hidden />
            <span className="font-medium text-foreground">SBI Demo Branch</span>
          </div>
          <Separator orientation="vertical" className="hidden h-5! md:block" />
          <span
            suppressHydrationWarning
            className="font-mono text-sm tabular-nums text-muted-foreground"
          >
            {formatClock(now)}
          </span>
          <Badge className="gap-1.5 bg-emerald-600 text-white">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-white/75" />
              <span className="relative inline-flex size-1.5 rounded-full bg-white" />
            </span>
            OPEN
          </Badge>
          <Badge variant="outline" className="text-muted-foreground">
            Demo Mode
          </Badge>
        </div>
      </div>
    </header>
  )
}
