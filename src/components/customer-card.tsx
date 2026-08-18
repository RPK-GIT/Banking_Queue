"use client"

import { motion } from "motion/react"

import { formatDuration } from "@/lib/format"
import type { Customer } from "@/lib/types"
import { cn } from "@/lib/utils"

interface CustomerCardProps {
  customer: Customer
  position: number
  now: number
  onSelect: (customerId: string) => void
}

/** A waiting customer inside a counter's FIFO queue. */
export function CustomerCard({
  customer,
  position,
  now,
  onSelect,
}: CustomerCardProps) {
  const step = customer.journey[customer.journey.length - 1]
  const waitedMs = now - step.enteredAt
  const isNext = position === 1
  const hasHistory = customer.journey.length > 1

  return (
    <motion.button
      layoutId={customer.id}
      layout
      initial={{ opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ type: "spring", stiffness: 400, damping: 32 }}
      type="button"
      onClick={() => onSelect(customer.id)}
      title={`View ${customer.token}'s journey`}
      className={cn(
        "group w-full rounded-lg border bg-card px-2.5 py-2 text-left shadow-xs transition-colors outline-none",
        "hover:border-primary/40 hover:bg-primary/2 focus-visible:ring-2 focus-visible:ring-ring/60",
        isNext && "border-amber-300/80 bg-amber-50/60"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs font-semibold text-primary">
          {customer.token}
        </span>
        <span
          className={cn(
            "rounded-full px-1.5 py-px text-[10px] font-semibold tabular-nums",
            isNext
              ? "bg-amber-100 text-amber-800"
              : "bg-muted text-muted-foreground"
          )}
        >
          {isNext ? "#1 in queue · next" : `#${position} in queue`}
        </span>
      </div>
      <p className="mt-0.5 truncate text-[13px] font-medium">{customer.name}</p>
      <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="truncate">{customer.serviceType}</span>
        <span className="shrink-0 font-mono tabular-nums">
          {formatDuration(waitedMs)}
        </span>
      </div>
      {hasHistory && (
        <p className="mt-1 truncate text-[10px] font-medium text-primary/70">
          Continuing journey · stop {customer.journey.length}
        </p>
      )}
    </motion.button>
  )
}
