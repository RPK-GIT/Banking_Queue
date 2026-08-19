"use client"

import { motion } from "motion/react"
import { ArrowRightLeft, ArrowUpDown } from "lucide-react"

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { formatDuration } from "@/lib/format"
import type { Customer } from "@/lib/types"
import { cn } from "@/lib/utils"

interface CustomerCardProps {
  customer: Customer
  position: number
  now: number
  onSelect: (customerId: string) => void
  /** queue override — serve this customer next instead of the recommendation */
  onServeNext?: (customerId: string) => void
  /** transfer this waiting token to another counter */
  onTransfer?: (customerId: string) => void
}

/** A waiting customer inside a counter's FIFO queue. */
export function CustomerCard({
  customer,
  position,
  now,
  onSelect,
  onServeNext,
  onTransfer,
}: CustomerCardProps) {
  const step = customer.journey[customer.journey.length - 1]
  const waitedMs = now - step.enteredAt
  const isNext = position === 1
  const hasHistory = customer.journey.length > 1

  return (
    <motion.div
      layoutId={customer.id}
      layout
      initial={{ opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ type: "spring", stiffness: 400, damping: 32 }}
      className={cn(
        "group w-full rounded-lg border bg-card px-2.5 py-2 shadow-xs transition-colors",
        "hover:border-primary/40 hover:bg-primary/2 focus-within:ring-2 focus-within:ring-ring/40",
        isNext && "border-amber-300/80 bg-amber-50/60"
      )}
    >
      <button
        type="button"
        onClick={() => onSelect(customer.id)}
        title={`View ${customer.token}'s journey`}
        className="w-full text-left outline-none"
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
      </button>
      {/* token actions — only what is valid for a waiting token, kept subtle */}
      {(onServeNext || onTransfer) && (
        <div className="mt-1 flex items-center gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
          {onServeNext && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    aria-label={`Serve ${customer.token} next (queue override)`}
                    onClick={() => onServeNext(customer.id)}
                    className="flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground outline-none hover:bg-violet-50 hover:text-violet-700 focus-visible:ring-2 focus-visible:ring-ring/60"
                  />
                }
              >
                <ArrowUpDown className="size-3" aria-hidden />
                Serve
              </TooltipTrigger>
              <TooltipContent>
                Serve this customer next — queue override, order preserved
              </TooltipContent>
            </Tooltip>
          )}
          {onTransfer && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    aria-label={`Transfer ${customer.token} to another counter`}
                    onClick={() => onTransfer(customer.id)}
                    className="flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
                  />
                }
              >
                <ArrowRightLeft className="size-3" aria-hidden />
                Transfer
              </TooltipTrigger>
              <TooltipContent>
                Transfer — journey-aware placement at the destination
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      )}
    </motion.div>
  )
}
