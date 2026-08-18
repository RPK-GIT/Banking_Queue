"use client"

import { Eye, Route, Scale } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

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

export function WhyDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Why Smart Queue?</DialogTitle>
          <DialogDescription>
            One token, one journey — visible to everyone.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
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
      </DialogContent>
    </Dialog>
  )
}
