import { cn } from "@/lib/utils"
import type { CustomerStatus } from "@/lib/types"

const STYLES: Record<CustomerStatus, string> = {
  waiting: "bg-amber-50 text-amber-700 ring-amber-600/20",
  serving: "bg-blue-50 text-blue-700 ring-blue-600/20",
  "on-hold": "bg-orange-50 text-orange-700 ring-orange-600/20",
  completed: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
}

const LABELS: Record<CustomerStatus, string> = {
  waiting: "Waiting",
  serving: "Being served",
  "on-hold": "On hold",
  completed: "Completed",
}

export function StatusBadge({
  status,
  className,
}: {
  status: CustomerStatus
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        STYLES[status],
        className
      )}
    >
      {LABELS[status]}
    </span>
  )
}
