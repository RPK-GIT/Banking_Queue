"use client"

import { ChevronDown, Eye, Route, Scale } from "lucide-react"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"

const BENEFITS = [
  {
    icon: Scale,
    title: "Fairness",
    text: "FIFO ensures customers are served in the correct order.",
  },
  {
    icon: Route,
    title: "Continuity",
    text: "A customer's token follows them across multiple counters.",
  },
  {
    icon: Eye,
    title: "Transparency",
    text: "Employees and customers can see the current status.",
  },
]

export function WhyPanel() {
  return (
    <Collapsible className="rounded-xl border bg-card shadow-xs">
      <CollapsibleTrigger className="group flex w-full items-center justify-between px-4 py-3 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring/60">
        Why Smart Queue?
        <ChevronDown
          className="size-4 text-muted-foreground transition-transform group-data-panel-open:rotate-180"
          aria-hidden
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="grid gap-3 border-t px-4 py-4 sm:grid-cols-3">
          {BENEFITS.map((benefit) => (
            <div key={benefit.title} className="flex items-start gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <benefit.icon className="size-4" aria-hidden />
              </div>
              <div>
                <p className="text-sm font-semibold">{benefit.title}</p>
                <p className="text-xs text-muted-foreground">{benefit.text}</p>
              </div>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
