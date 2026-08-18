"use client"

import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import {
  ChartColumn,
  LayoutGrid,
  Pause,
  PanelLeftOpen,
  Play,
  UserPlus,
  X,
} from "lucide-react"

import { ActivityFeed } from "@/components/activity-feed"
import { AppHeader } from "@/components/app-header"
import { CustomerViewPanel } from "@/components/customer-view-panel"
import { DemoControls } from "@/components/demo-controls"
import { JourneyDialog } from "@/components/journey-dialog"
import { KpiStrip } from "@/components/kpi-strip"
import { ManagerDashboard } from "@/components/manager-dashboard"
import { NewCustomerCard } from "@/components/new-customer-card"
import { QueueBoard } from "@/components/queue-board"
import { TransferDialog } from "@/components/transfer-dialog"
import { WhyDialog } from "@/components/why-panel"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useQueueStore } from "@/lib/queue-store"
import { cn } from "@/lib/utils"

type CenterView = "operations" | "manager"

/** Collapsed left pane — a compact vertical toolbar; nothing is destroyed. */
function CollapsedRail({
  onExpand,
  onShowManager,
}: {
  onExpand: () => void
  onShowManager: () => void
}) {
  const demoStatus = useQueueStore((s) => s.demoStatus)
  const playDemo = useQueueStore((s) => s.playDemo)
  const pauseDemo = useQueueStore((s) => s.pauseDemo)

  return (
    <div className="flex flex-col items-center gap-2 py-3">
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              aria-label="Expand control pane"
              onClick={onExpand}
            />
          }
        >
          <PanelLeftOpen aria-hidden />
        </TooltipTrigger>
        <TooltipContent side="right">Expand control pane</TooltipContent>
      </Tooltip>
      <div className="h-px w-8 bg-border" />
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              aria-label="New Customer — expand pane"
              onClick={onExpand}
            />
          }
        >
          <UserPlus aria-hidden />
        </TooltipTrigger>
        <TooltipContent side="right">New Customer</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              aria-label={
                demoStatus === "playing" ? "Pause demo" : "Play / resume demo"
              }
              onClick={demoStatus === "playing" ? pauseDemo : playDemo}
            />
          }
        >
          {demoStatus === "playing" ? (
            <Pause aria-hidden />
          ) : (
            <Play aria-hidden />
          )}
        </TooltipTrigger>
        <TooltipContent side="right">
          {demoStatus === "playing" ? "Pause demo" : "Demo"}
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              aria-label="Manager Dashboard"
              onClick={onShowManager}
            />
          }
        >
          <ChartColumn aria-hidden />
        </TooltipTrigger>
        <TooltipContent side="right">Manager Dashboard</TooltipContent>
      </Tooltip>
      {demoStatus !== "idle" && (
        <span
          aria-hidden
          className={cn(
            "mt-1 size-2 rounded-full",
            demoStatus === "playing" ? "animate-pulse bg-emerald-500" : "bg-amber-500"
          )}
        />
      )}
    </div>
  )
}

/** Operations ↔ Manager Dashboard switcher (same shell, no navigation). */
function PerspectiveSwitch({
  view,
  onChange,
}: {
  view: CenterView
  onChange: (view: CenterView) => void
}) {
  return (
    <section aria-label="Perspective" className="flex flex-col gap-1.5">
      <p className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
        Perspective
      </p>
      <div className="grid grid-cols-1 gap-1.5">
        <Button
          variant={view === "operations" ? "secondary" : "ghost"}
          size="sm"
          aria-pressed={view === "operations"}
          className="justify-start"
          onClick={() => onChange("operations")}
        >
          <LayoutGrid data-icon="inline-start" aria-hidden />
          Operations
        </Button>
        <Button
          variant={view === "manager" ? "secondary" : "ghost"}
          size="sm"
          aria-pressed={view === "manager"}
          className="justify-start"
          onClick={() => onChange("manager")}
        >
          <ChartColumn data-icon="inline-start" aria-hidden />
          Manager Dashboard
        </Button>
      </div>
    </section>
  )
}

export function Dashboard() {
  const hydrated = useQueueStore((s) => s.hydrated)
  const init = useQueueStore((s) => s.init)
  const demoStatus = useQueueStore((s) => s.demoStatus)
  const activities = useQueueStore((s) => s.state.activities)
  const [view, setView] = useState<CenterView>("operations")
  const [collapsed, setCollapsed] = useState(false)
  const [customerViewCollapsed, setCustomerViewCollapsed] = useState(false)
  const [activityOpen, setActivityOpen] = useState(false)
  const [lastSeenActivityId, setLastSeenActivityId] = useState<string | null>(null)
  const [whyOpen, setWhyOpen] = useState(false)
  const [journeyCustomerId, setJourneyCustomerId] = useState<string | null>(null)
  const [transferCustomerId, setTransferCustomerId] = useState<string | null>(null)

  useEffect(() => {
    init()
  }, [init])

  // unread = events newer than the last one seen when the drawer was opened
  const seenIndex = lastSeenActivityId
    ? activities.findIndex((a) => a.id === lastSeenActivityId)
    : activities.length
  const unreadCount = seenIndex === -1 ? activities.length : seenIndex

  function toggleActivity() {
    setActivityOpen((open) => {
      if (!open) setLastSeenActivityId(activities[0]?.id ?? null)
      return !open
    })
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <AppHeader
        activityOpen={activityOpen}
        unreadCount={unreadCount}
        onToggleActivity={toggleActivity}
        onOpenWhy={() => setWhyOpen(true)}
      />

      <div className="flex min-h-0 flex-1">
        {/* LEFT CONTROL PANE — collapsible, never destroyed */}
        <aside
          aria-label="Control pane"
          className={cn(
            "relative z-30 flex shrink-0 flex-col border-r bg-card transition-[width] duration-200 ease-out",
            collapsed ? "w-14" : "w-[290px]"
          )}
        >
          {collapsed ? (
            <CollapsedRail
              onExpand={() => setCollapsed(false)}
              onShowManager={() => setView("manager")}
            />
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-3">
              <PerspectiveSwitch view={view} onChange={setView} />
              <div className="h-px shrink-0 bg-border" />
              <NewCustomerCard />
              <div className="h-px shrink-0 bg-border" />
              <DemoControls />
            </div>
          )}
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Expand control pane" : "Collapse control pane"}
            aria-expanded={!collapsed}
            className="absolute top-1/2 -right-3 z-40 flex size-6 -translate-y-1/2 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            <PanelLeftOpen
              className={cn("size-3.5 transition-transform", !collapsed && "rotate-180")}
              aria-hidden
            />
          </button>
        </aside>

        {/* CENTER — MAIN OPERATIONS (or Manager Dashboard), no page scroll */}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-3">
          {hydrated ? (
            view === "operations" ? (
              <>
                <KpiStrip />
                <QueueBoard
                  onSelectCustomer={setJourneyCustomerId}
                  onTransfer={setTransferCustomerId}
                />
              </>
            ) : (
              <ManagerDashboard />
            )
          ) : (
            <>
              <div className="h-[64px] shrink-0 animate-pulse rounded-xl bg-muted" />
              <div className="min-h-0 flex-1 animate-pulse rounded-xl bg-muted" />
            </>
          )}
        </main>

        {/* RIGHT — permanent Customer View */}
        {hydrated && (
          <CustomerViewPanel
            collapsed={customerViewCollapsed}
            onToggleCollapsed={() => setCustomerViewCollapsed((c) => !c)}
            onOpenJourney={setJourneyCustomerId}
          />
        )}
      </div>

      {/* LIVE ACTIVITY — slide-over drawer, non-blocking */}
      <AnimatePresence>
        {activityOpen && (
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 36 }}
            className="fixed top-12 right-0 bottom-0 z-40 flex w-80 flex-col border-l bg-card shadow-xl"
            role="complementary"
            aria-label="Live activity"
          >
            <div className="flex items-center justify-between border-b px-3 py-2">
              <span className="text-sm font-semibold">Live Activity</span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Close activity panel"
                onClick={toggleActivity}
              >
                <X aria-hidden />
              </Button>
            </div>
            <div className="min-h-0 flex-1">
              <ActivityFeed onSelectCustomer={setJourneyCustomerId} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* small non-blocking indicator — the dashboard stays fully interactive */}
      {demoStatus === "paused" && (
        <div className="pointer-events-none fixed bottom-5 left-1/2 z-40 -translate-x-1/2">
          <span className="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50/95 px-3 py-1.5 text-xs font-semibold tracking-wide text-amber-800 shadow-md">
            <Pause className="size-3.5" aria-hidden />
            DEMO PAUSED — explore freely
          </span>
        </div>
      )}

      <WhyDialog open={whyOpen} onClose={() => setWhyOpen(false)} />
      <JourneyDialog
        customerId={journeyCustomerId}
        onClose={() => setJourneyCustomerId(null)}
      />
      <TransferDialog
        customerId={transferCustomerId}
        onClose={() => setTransferCustomerId(null)}
      />
    </div>
  )
}
